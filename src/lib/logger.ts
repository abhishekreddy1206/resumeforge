import { AsyncLocalStorage } from "node:async_hooks";

// ---------------------------------------------------------------------------
// Request context (AsyncLocalStorage)
// ---------------------------------------------------------------------------

export interface RequestContext {
  requestId: string;
  method: string;
  path: string;
  startTime: number;
}

const requestStore = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  ctx: RequestContext,
  fn: () => T,
): T {
  return requestStore.run(ctx, fn);
}

export function getRequestId(): string | undefined {
  return requestStore.getStore()?.requestId;
}

export function getRequestContext(): RequestContext | undefined {
  return requestStore.getStore();
}

// ---------------------------------------------------------------------------
// Log levels
// ---------------------------------------------------------------------------

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

const currentLevel: Level = (() => {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LEVELS) return env as Level;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
})();

function shouldLog(level: Level): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

// ---------------------------------------------------------------------------
// Redaction & serialization
// ---------------------------------------------------------------------------

const REDACT_KEYS = new Set(["prompt", "systemPrompt", "instructions"]);
const MAX_VALUE_LENGTH = 500;

function redactValue(key: string, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (REDACT_KEYS.has(key)) return `[${value.length} chars]`;
  if (value.length > MAX_VALUE_LENGTH) return value.slice(0, MAX_VALUE_LENGTH) + "...";
  return value;
}

export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack?.split("\n").slice(0, 5).join("\n"),
      ...("category" in err ? { category: (err as { category: string }).category } : {}),
      ...("code" in err ? { code: (err as { code: string }).code } : {}),
    };
  }
  return { message: String(err) };
}

function sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Error) {
      out[k] = serializeError(v);
    } else {
      out[k] = redactValue(k, v);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const isProd = process.env.NODE_ENV === "production";

function formatDev(
  level: Level,
  component: string,
  message: string,
  data: Record<string, unknown>,
): string {
  const time = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
  const lvl = level.toUpperCase().padEnd(5);
  const reqId = data.requestId ? ` req=${data.requestId}` : "";

  // Build compact key=value pairs (skip requestId since it's in the prefix)
  const parts: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (k === "requestId") continue;
    if (v === undefined || v === null) continue;
    if (typeof v === "object") {
      parts.push(`${k}=${JSON.stringify(v)}`);
    } else {
      parts.push(`${k}=${v}`);
    }
  }
  const suffix = parts.length > 0 ? "  " + parts.join(" ") : "";

  return `${time} ${lvl} [${component}] ${message}${reqId}${suffix}`;
}

function formatProd(
  level: Level,
  component: string,
  message: string,
  data: Record<string, unknown>,
): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...data,
  });
}

const format = isProd ? formatProd : formatDev;

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export interface Logger {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
  /** Returns a function that, when called, logs elapsed time. */
  time: (label: string) => (extra?: Record<string, unknown>) => void;
  /** Creates a child logger with extra fields merged into every log entry. */
  child: (extra: Record<string, unknown>) => Logger;
}

function makeLogger(component: string, baseData: Record<string, unknown> = {}): Logger {
  function emit(level: Level, message: string, data?: Record<string, unknown>) {
    if (!shouldLog(level)) return;

    const ctx = requestStore.getStore();
    const merged = sanitizeData({
      ...(ctx?.requestId ? { requestId: ctx.requestId } : {}),
      ...baseData,
      ...data,
    });

    const line = format(level, component, message, merged);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  return {
    debug: (msg, data) => emit("debug", msg, data),
    info: (msg, data) => emit("info", msg, data),
    warn: (msg, data) => emit("warn", msg, data),
    error: (msg, data) => emit("error", msg, data),

    time(label: string) {
      const start = Date.now();
      return (extra?: Record<string, unknown>) => {
        emit("info", label, { durationMs: Date.now() - start, ...extra });
      };
    },

    child(extra: Record<string, unknown>) {
      return makeLogger(component, { ...baseData, ...extra });
    },
  };
}

export function createLogger(component: string): Logger {
  return makeLogger(component);
}

// ---------------------------------------------------------------------------
// Task logger — for background operations (self-contained, no request context)
// ---------------------------------------------------------------------------

export interface TaskLogger {
  step: (name: string, data?: Record<string, unknown>) => void;
  complete: (data?: Record<string, unknown>) => void;
  fail: (error: unknown, data?: Record<string, unknown>) => void;
}

export function createTaskLogger(taskName: string, taskId: string): TaskLogger {
  const log = makeLogger(taskName, { taskId });
  const start = Date.now();
  let stepCount = 0;

  return {
    step(name: string, data?: Record<string, unknown>) {
      stepCount++;
      log.info("task_step", {
        step: stepCount,
        stepName: name,
        elapsedMs: Date.now() - start,
        ...data,
      });
    },

    complete(data?: Record<string, unknown>) {
      log.info("task_complete", {
        steps: stepCount,
        durationMs: Date.now() - start,
        ...data,
      });
    },

    fail(error: unknown, data?: Record<string, unknown>) {
      log.error("task_failed", {
        steps: stepCount,
        durationMs: Date.now() - start,
        error: error instanceof Error ? error : new Error(String(error)),
        ...data,
      });
    },
  };
}
