import { spawn, execSync } from "child_process";

const TIMEOUT_MS = 120_000; // 2 minutes

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
  return JSON.parse(jsonMatch[1]);
}

/**
 * Send a prompt to Claude via the Claude Code CLI (`claude -p`).
 * Uses your Claude Code subscription — no API credits needed.
 */
export async function ask(prompt: string): Promise<string> {
  const promptPreview = prompt.slice(0, 100).replace(/\n/g, " ");
  log.info(`Sending prompt (${prompt.length} chars): "${promptPreview}..."`);
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const proc = spawn(
      CLAUDE_PATH,
      ["-p", "--output-format", "text", "--no-session-persistence", "--model", "sonnet"],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: buildClaudeEnv(),
      }
    );

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      log.error("Claude CLI timed out", { timeoutMs: TIMEOUT_MS, promptPreview });
      proc.kill("SIGTERM");
      reject(new Error("Claude CLI timed out after " + TIMEOUT_MS + "ms"));
    }, TIMEOUT_MS);

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

      log.info(`Claude responded (${stdout.length} chars, ${elapsed}ms)`);
      resolve(stdout.trim());
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function askJson<T = Record<string, any>>(
  prompt: string
): Promise<T> {
  const text = await ask(prompt);
  try {
    return extractJson(text) as T;
  } catch (err) {
    log.error("JSON parsing failed", {
      error: (err as Error).message,
      responsePreview: text.slice(0, 500),
    });
    throw err;
  }
}
