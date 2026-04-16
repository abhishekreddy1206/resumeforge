import { spawn, execSync } from "child_process";
import { createLogger } from "@/lib/logger";

const DEFAULT_TIMEOUT_MS = 480_000; // 8 minutes
const MAX_TIMEOUT_MS = 1_800_000; // 30 minutes

// Resolve the full path to claude CLI at startup so spawned subprocesses can find it
const CLAUDE_PATH = (() => {
  try {
    return execSync("which claude", { encoding: "utf-8" }).trim();
  } catch {
    return "claude";
  }
})();

const log = createLogger("claude");

/**
 * Simple Promise-based semaphore to limit concurrent Claude CLI processes.
 * Prevents starvation when multiple auto-pipeline runs spawn `claude -p`
 * simultaneously — the CLI can't reliably handle concurrent instances.
 */
class Semaphore {
  private queue: (() => void)[] = [];
  private current = 0;
  constructor(private max: number) {}
  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }
  release(): void {
    this.current--;
    const next = this.queue.shift();
    if (next) {
      this.current++;
      next();
    }
  }
}

const cliSemaphore = new Semaphore(1);

export interface AskOptions {
  timeoutMs?: number;
  model?: string;
  skill?: string;
}

/**
 * Build a clean env for the claude subprocess.
 * Strips ANTHROPIC_API_KEY so the CLI uses the Claude Code subscription
 * instead of trying (and failing) to authenticate with a stale API key.
 */
function buildClaudeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  return env;
}

interface CLIEnvelope {
  result?: string;
  duration_ms?: number;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  modelUsage?: Record<string, unknown>;
}

/**
 * Fire-and-forget token usage logging to SQLite.
 * Uses dynamic import to avoid circular dependency with db module.
 */
async function logTokenUsage(skill: string, envelope: CLIEnvelope): Promise<void> {
  const { prisma } = await import("@/lib/db");
  const usage = envelope.usage ?? {};
  const modelName = envelope.modelUsage
    ? Object.keys(envelope.modelUsage)[0] ?? "unknown"
    : "unknown";

  await prisma.tokenUsage.create({
    data: {
      skill,
      model: modelName,
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
      costUsd: envelope.total_cost_usd ?? 0,
      durationMs: envelope.duration_ms ?? 0,
    },
  });
}

/**
 * Escape literal control characters inside JSON string values.
 * After the CLI envelope is decoded, the result string may contain
 * actual newlines/tabs inside what should be JSON strings. These are
 * invalid JSON and cause parse failures. This function walks the text
 * character-by-character and escapes control chars only when inside
 * a JSON string (between unescaped double quotes).
 */
function sanitizeJsonStrings(raw: string): string {
  const out: string[] = [];
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (ch === "\\" && i + 1 < raw.length) {
        // Already-escaped sequence — pass through as-is
        out.push(ch, raw[i + 1]);
        i++;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out.push(ch);
        continue;
      }
      // Escape literal control characters inside strings
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        if (ch === "\n") out.push("\\n");
        else if (ch === "\r") out.push("\\r");
        else if (ch === "\t") out.push("\\t");
        else out.push("\\u" + code.toString(16).padStart(4, "0"));
        continue;
      }
      out.push(ch);
    } else {
      if (ch === '"') inString = true;
      out.push(ch);
    }
  }
  return out.join("");
}

export function extractJson(text: string): Record<string, unknown> {
  // Try code fences first (most reliable)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);

  // Try both object and array patterns, pick the one that starts earliest.
  // This avoids a bug where the object regex greedily captures from the first
  // `{` to the last `}` inside a JSON array, producing invalid JSON.
  const objMatch = text.match(/(\{[\s\S]*\})/);
  const arrMatch = text.match(/(\[[\s\S]*\])/);
  const bareMatch =
    objMatch && arrMatch
      ? (text.indexOf(arrMatch[0]) < text.indexOf(objMatch[0]) ? arrMatch : objMatch)
      : arrMatch || objMatch;

  const jsonMatch = fenceMatch || bareMatch;

  if (!jsonMatch) {
    log.error("json_extract_failed", { responseLength: text.length });
    throw new Error("Could not parse JSON from response");
  }

  const raw = jsonMatch[1];

  // First try raw parse (fast path for well-formed JSON)
  try {
    return JSON.parse(raw);
  } catch {
    // Sanitize control characters inside string values, then retry
    const sanitized = sanitizeJsonStrings(raw);
    try {
      return JSON.parse(sanitized);
    } catch {
      // Attempt to repair truncated JSON by closing open strings/braces
      const repaired = repairJson(sanitized);
      if (repaired) {
        log.warn("json_repaired", { originalLength: raw.length, method: "sanitized" });
        return repaired;
      }
      // Last resort: try repairing the original (sanitize might have confused things)
      const repairedRaw = repairJson(raw);
      if (repairedRaw) {
        log.warn("json_repaired", { originalLength: raw.length, method: "raw" });
        return repairedRaw;
      }
      throw new Error(`JSON parse failed: ${raw.slice(0, 200)}`);
    }
  }
}

/**
 * Attempt to repair truncated JSON (e.g., unterminated strings).
 * Uses a stack-based approach to properly track nesting depth.
 * Returns parsed object on success, null on failure.
 */
function repairJson(raw: string): Record<string, unknown> | null {
  // Sanitize control characters first, then repair structure
  let s = sanitizeJsonStrings(raw.trim());

  // Track nesting with a stack for accurate repair
  const stack: string[] = [];
  let inString = false;
  let i = 0;

  while (i < s.length) {
    const ch = s[i];
    if (inString) {
      if (ch === "\\" && i + 1 < s.length) {
        i += 2; // skip escaped char
        continue;
      }
      if (ch === '"') inString = false;
    } else {
      if (ch === '"') inString = true;
      else if (ch === "{") stack.push("}");
      else if (ch === "[") stack.push("]");
      else if (ch === "}" || ch === "]") stack.pop();
    }
    i++;
  }

  // Close unterminated string
  if (inString) {
    s = s.replace(/\\$/, "");
    s += '"';
  }

  // Remove trailing comma or colon (incomplete key-value)
  s = s.replace(/[,:\s]+$/, "");

  // Close all open brackets/braces in reverse order
  while (stack.length > 0) s += stack.pop();

  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Send a prompt to Claude via the Claude Code CLI (`claude -p`).
 * Uses your Claude Code subscription — no API credits needed.
 * Returns the text response; token usage is logged to SQLite automatically.
 */
export async function ask(prompt: string, options?: AskOptions): Promise<string> {
  const timeoutMs = Math.min(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const model = options?.model ?? "sonnet";
  const skill = options?.skill;

  await cliSemaphore.acquire();
  const startTime = Date.now();
  log.info("ai_call_start", { skill, model, promptLength: prompt.length });
  try {
    return await new Promise<string>((resolve, reject) => {
      const proc = spawn(
        CLAUDE_PATH,
        ["-p", "--output-format", "json", "--no-session-persistence", "--model", model],
        {
          stdio: ["pipe", "pipe", "pipe"],
          env: buildClaudeEnv(),
        }
      );

      let stdout = "";
      let stderr = "";

      const timer = setTimeout(() => {
        const durationMs = Date.now() - startTime;
        log.error("ai_timeout", { skill, model, timeoutMs, durationMs });
        proc.kill("SIGTERM");
        // Force-kill if SIGTERM doesn't work within 5 seconds
        const killTimer = setTimeout(() => {
          if (proc.exitCode === null) {
            log.warn("ai_force_kill", { skill, model });
            proc.kill("SIGKILL");
          }
        }, 5_000);
        killTimer.unref();
        reject(new Error("Claude CLI timed out after " + timeoutMs + "ms"));
      }, timeoutMs);

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        log.error("ai_spawn_failed", { claudePath: CLAUDE_PATH, error: err });
        reject(
          new Error(
            `Failed to start claude CLI. Is Claude Code installed? ${err.message}`
          )
        );
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        const elapsed = Date.now() - startTime;

        if (code !== 0) {
          log.error("ai_cli_failed", {
            skill,
            model,
            exitCode: code,
            durationMs: elapsed,
            stderrPreview: stderr.slice(0, 200),
          });
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr || stdout}`));
          return;
        }

        // Parse JSON envelope from CLI output
        let result: string;
        try {
          const envelope: CLIEnvelope = JSON.parse(stdout);
          result = envelope.result || stdout.trim();

          const usage = envelope.usage;
          log.info("ai_call_complete", {
            skill,
            model,
            durationMs: elapsed,
            inputTokens: usage?.input_tokens,
            outputTokens: usage?.output_tokens,
            cacheReadTokens: usage?.cache_read_input_tokens,
            costUsd: envelope.total_cost_usd,
            responseLength: result.length,
          });

          // Fire-and-forget token logging
          if (skill) {
            logTokenUsage(skill, envelope).catch((err) =>
              log.warn("token_logging_failed", { error: err })
            );
          }
        } catch {
          // Fallback: if JSON parse fails, treat as raw text
          log.warn("cli_envelope_parse_failed", { stdoutLength: stdout.length });
          result = stdout.trim();
        }

        resolve(result);
      });

      proc.stdin.write(prompt);
      proc.stdin.end();
    });
  } finally {
    cliSemaphore.release();
  }
}

/**
 * Strip Prisma metadata (ids, timestamps, foreign keys) from profile objects
 * to reduce prompt size sent to Claude. Keeps only semantically relevant fields.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function compactProfile(profile: Record<string, any>): Record<string, any> {
  const STRIP_KEYS = new Set([
    "id", "profileId", "jobId", "resumeId", "profileVersionId",
    "createdAt", "updatedAt", "lastEnrichedAt", "matchedAt",
    "resumeText", "originalFileName",
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function strip(obj: any): any {
    if (Array.isArray(obj)) return obj.map(strip);
    if (obj && typeof obj === "object" && !(obj instanceof Date)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (STRIP_KEYS.has(k)) continue;
        out[k] = strip(v);
      }
      return out;
    }
    return obj;
  }

  return strip(profile);
}

export const AI_FINGERPRINT_BANNED = `Avoid: delve,tapestry,multifaceted,pivotal,synergy,paradigm,holistic,leverage(v),utilize,facilitate,foster,robust,comprehensive,cutting-edge,innovative,dynamic,proactive,results-driven,seasoned,deeply,keen,honed,landscape,realm,spearheaded,orchestrated,"proven track record","passionate about","at the intersection of","I bring","uniquely positioned","aligns perfectly","I thrive". No gerund-analysis endings. Vary sentence length. NEVER use em dashes (—) or double hyphens (--). Use commas, periods, semicolons, or parentheses instead.`;

export const PROFILE_SCHEMA_RULES = `Preserve data shape exactly. bullets/skills are string[]. category∈{language,framework,tool,database,cloud,soft}. publications:{title,publisher,date,url,doi,description}. certifications:{name,issuer,date,expiryDate,credentialId,url}. recommendations:{recommenderName,recommenderTitle,relationship,text,linkedinUrl}.`;

export const ROLE_ARCHETYPES = `- "backend-engineer" — core services, APIs, distributed systems
- "frontend-engineer" — UI/UX, web apps, component systems
- "fullstack-engineer" — end-to-end feature development
- "platform-engineer" — infrastructure, DevOps, SRE, cloud
- "ml-engineer" — ML/AI systems, model training, MLOps
- "data-engineer" — data pipelines, ETL, warehousing
- "engineering-manager" — people management, technical leadership
- "technical-pm" — product management with technical depth
- "solutions-architect" — customer-facing technical design
- "security-engineer" — security, compliance, threat modeling
- "other" — if none fits clearly`;

/**
 * Merge section-level profile changes onto a base profile.
 * For each key present in `changes`, replaces the corresponding key in `base`.
 * Keys not present in `changes` are preserved from `base` unchanged.
 * Used by resume-tip-applier to reconstruct full profiles from section diffs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mergeProfileChanges(base: Record<string, any>, changes: Record<string, any>): Record<string, any> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(changes)) {
    merged[key] = value;
  }
  return merged;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function askJson<T = Record<string, any>>(
  prompt: string,
  options?: AskOptions
): Promise<T> {
  const jsonEnforcement = "\n\nCRITICAL: Your response MUST be valid JSON only. No markdown, no commentary, no code fences, no text before or after the JSON. If the result is an object, start with { and end with }. If the result is an array, start with [ and end with ].";
  const enforced = prompt + jsonEnforcement;
  const text = await ask(enforced, options);
  try {
    return extractJson(text) as T;
  } catch {
    // Retry once by re-running the same prompt — simpler and more reliable
    // than asking the model to reconstruct from a truncated fragment
    log.warn("json_parse_failed_retrying", { skill: options?.skill, responseLength: text.length });
    const retryText = await ask(enforced, options);
    try {
      return extractJson(retryText) as T;
    } catch (retryErr) {
      log.error("json_parse_failed_after_retry", {
        skill: options?.skill,
        responseLength: retryText.length,
        error: retryErr,
      });
      throw retryErr;
    }
  }
}
