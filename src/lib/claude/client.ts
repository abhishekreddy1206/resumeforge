import { spawn, execSync } from "child_process";

const DEFAULT_TIMEOUT_MS = 480_000; // 8 minutes
const MAX_TIMEOUT_MS = 600_000; // 10 minutes

// Resolve the full path to claude CLI at startup so spawned subprocesses can find it
const CLAUDE_PATH = (() => {
  try {
    return execSync("which claude", { encoding: "utf-8" }).trim();
  } catch {
    return "claude";
  }
})();

const log = {
  info: (msg: string, data?: Record<string, unknown>) =>
    console.log(`[claude-client] ${msg}`, data ? JSON.stringify(data, null, 2) : ""),
  error: (msg: string, data?: Record<string, unknown>) =>
    console.error(`[claude-client] ERROR: ${msg}`, data ? JSON.stringify(data, null, 2) : ""),
  warn: (msg: string, data?: Record<string, unknown>) =>
    console.warn(`[claude-client] WARN: ${msg}`, data ? JSON.stringify(data, null, 2) : ""),
};

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export function extractJson(text: string): Record<string, unknown> {
  const jsonMatch =
    text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
    text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) {
    log.error("Failed to extract JSON from Claude response", {
      responseLength: text.length,
      responsePreview: text.slice(0, 500),
    });
    throw new Error("Could not parse JSON from response");
  }

  try {
    return JSON.parse(jsonMatch[1]);
  } catch (firstErr) {
    // Attempt to repair truncated JSON by closing open strings/braces
    const repaired = repairJson(jsonMatch[1]);
    if (repaired) {
      log.warn("Repaired truncated JSON", {
        originalLength: jsonMatch[1].length,
      });
      return repaired;
    }
    throw firstErr;
  }
}

/**
 * Attempt to repair truncated JSON (e.g., unterminated strings).
 * Uses a stack-based approach to properly track nesting depth.
 * Returns parsed object on success, null on failure.
 */
function repairJson(raw: string): Record<string, unknown> | null {
  let s = raw.trim();

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
  const promptPreview = prompt.slice(0, 100).replace(/\n/g, " ");
  log.info(`Sending prompt (${prompt.length} chars, model=${model}): "${promptPreview}..."`);
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
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
      log.error("Claude CLI timed out", { timeoutMs, promptPreview });
      proc.kill("SIGTERM");
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
      log.error("Failed to spawn claude CLI", {
        claudePath: CLAUDE_PATH,
        error: err.message,
      });
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
        log.error("Claude CLI failed", {
          exitCode: code,
          elapsed: `${elapsed}ms`,
          stderr: stderr.slice(0, 500),
          stdout: stdout.slice(0, 500),
          claudePath: CLAUDE_PATH,
          promptPreview,
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
        log.info(`Claude responded (model=${model}, ${elapsed}ms, in=${usage?.input_tokens ?? "?"}tok, out=${usage?.output_tokens ?? "?"}tok, cost=$${envelope.total_cost_usd?.toFixed(4) ?? "?"})`);

        // Fire-and-forget token logging
        if (options?.skill) {
          logTokenUsage(options.skill, envelope).catch((err) =>
            log.warn("Token logging failed", { error: (err as Error).message })
          );
        }
      } catch {
        // Fallback: if JSON parse fails, treat as raw text
        log.warn("Failed to parse CLI JSON envelope, falling back to raw text");
        result = stdout.trim();
      }

      resolve(result);
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export const AI_FINGERPRINT_BANNED = `Avoid: delve,tapestry,multifaceted,pivotal,synergy,paradigm,holistic,leverage(v),utilize,facilitate,foster,robust,comprehensive,cutting-edge,innovative,dynamic,proactive,results-driven,seasoned,"proven track record","passionate about","at the intersection of". No gerund-analysis endings. Vary sentence length. Max 2 em-dashes per section.`;

export const PROFILE_SCHEMA_RULES = `Preserve data shape exactly. bullets/skills are string[]. category∈{language,framework,tool,database,cloud,soft}. publications:{title,publisher,date,url,doi,description}. certifications:{name,issuer,date,expiryDate,credentialId,url}. recommendations:{recommenderName,recommenderTitle,relationship,text,linkedinUrl}.`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function askJson<T = Record<string, any>>(
  prompt: string,
  options?: AskOptions
): Promise<T> {
  const jsonEnforcement = "\n\nCRITICAL: Your response MUST be a single valid JSON object. No markdown, no commentary, no code fences, no text before or after the JSON. Start with { and end with }.";
  const text = await ask(prompt + jsonEnforcement, options);
  try {
    return extractJson(text) as T;
  } catch (firstErr) {
    // Retry once: send the failed response back and ask for just JSON
    log.warn("JSON parse failed, retrying with repair prompt", {
      responsePreview: text.slice(0, 300),
    });
    const repairPrompt = `Your previous response was not valid JSON. Here is what you returned:\n\n${text.slice(0, 4000)}\n\nConvert this into the exact JSON object that was requested. Return ONLY the JSON object — no markdown, no explanation. Start with { and end with }.`;
    const retryText = await ask(repairPrompt, options);
    try {
      return extractJson(retryText) as T;
    } catch (retryErr) {
      log.error("JSON parsing failed after retry", {
        error: (retryErr as Error).message,
        responsePreview: retryText.slice(0, 500),
      });
      throw retryErr;
    }
  }
}
