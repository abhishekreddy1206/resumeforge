import { NextRequest, NextResponse } from "next/server";
import { createLogger, runWithRequestContext, type RequestContext } from "./logger";
import { classifyError } from "./errors";

const log = createLogger("api");

// ---------------------------------------------------------------------------
// withLogging — wraps Next.js API route handlers
// ---------------------------------------------------------------------------

type RouteContext<P extends Record<string, string> = Record<string, string>> = {
  params: Promise<P>;
};

/** Handler with dynamic route params */
type HandlerWithParams<P extends Record<string, string>> = (
  request: NextRequest,
  context: RouteContext<P>,
) => Promise<NextResponse>;

/** Handler without params (static routes) */
type StaticHandler = (request: NextRequest) => Promise<NextResponse>;

/**
 * Wrap a Next.js App Router API handler with structured logging.
 *
 * Provides:
 * - Auto-generated 8-char request ID
 * - AsyncLocalStorage context for downstream loggers
 * - Request start/complete logging with duration
 * - Unhandled exception catching with error classification
 * - `x-request-id` response header
 * - `requestId` in error JSON responses
 */
export function withLogging<P extends Record<string, string> = Record<string, string>>(
  handler: HandlerWithParams<P> | StaticHandler,
): HandlerWithParams<P> {
  return async (request: NextRequest, routeContext: RouteContext<P>) => {
    const requestId = crypto.randomUUID().slice(0, 8);
    const path = new URL(request.url).pathname;
    const method = request.method;
    const start = Date.now();

    const ctx: RequestContext = { requestId, method, path, startTime: start };

    return runWithRequestContext(ctx, async () => {
      log.info("request_start", { method, path });

      try {
        const response = await (handler as HandlerWithParams<P>)(request, routeContext);
        const durationMs = Date.now() - start;
        const status = response.status;

        if (status >= 500) {
          log.error("request_error", { status, durationMs });
        } else if (status >= 400) {
          log.warn("request_client_error", { status, durationMs });
        } else {
          log.info("request_complete", { status, durationMs });
        }

        response.headers.set("x-request-id", requestId);
        return response;
      } catch (error) {
        const durationMs = Date.now() - start;
        const errorCategory = classifyError(error);

        log.error("request_unhandled_error", {
          durationMs,
          errorCategory,
          error: error instanceof Error ? error : new Error(String(error)),
        });

        const response = NextResponse.json(
          { error: "Internal server error", requestId },
          { status: 500 },
        );
        response.headers.set("x-request-id", requestId);
        return response;
      }
    });
  };
}
