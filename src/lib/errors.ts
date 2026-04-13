// ---------------------------------------------------------------------------
// Error taxonomy for structured logging
// ---------------------------------------------------------------------------

export type ErrorCategory =
  | "timeout"
  | "json_parse"
  | "validation"
  | "not_found"
  | "db"
  | "network"
  | "ai_cli"
  | "ai_spawn"
  | "parser"
  | "auth"
  | "filesystem"
  | "unknown";

export class AppError extends Error {
  category: ErrorCategory;
  context?: Record<string, unknown>;

  constructor(
    message: string,
    category: ErrorCategory,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.category = category;
    this.context = context;
  }
}

/**
 * Classify an error into a category by pattern-matching its message.
 * Used by the logging layer to add a filterable `errorCategory` field.
 */
export function classifyError(error: unknown): ErrorCategory {
  if (error instanceof AppError) return error.category;

  const msg = error instanceof Error ? error.message : String(error);

  if (/timed?\s*out|ETIMEDOUT|ESOCKETTIMEDOUT|AbortError/i.test(msg)) return "timeout";
  if (/JSON|parse|Unexpected token|Unexpected end/i.test(msg)) return "json_parse";
  if (/ECONNREFUSED|ENOTFOUND|fetch failed|network/i.test(msg)) return "network";
  if (/Prisma|SQLITE|unique constraint|foreign key/i.test(msg)) return "db";
  if (/ENOENT|EACCES|EISDIR/i.test(msg)) return "filesystem";
  if (/exited with code/i.test(msg)) return "ai_cli";
  if (/spawn|Failed to start claude/i.test(msg)) return "ai_spawn";
  if (/pdf|docx|mammoth|cheerio/i.test(msg)) return "parser";
  if (/OAuth|unauthorized|forbidden|401|403/i.test(msg)) return "auth";

  return "unknown";
}
