/**
 * Shared application error type.
 *
 * Use `AppError` for any failure that needs a stable, machine-readable code
 * (rate limiting, captcha walls, decryption failures, scraper breakage, etc.)
 * so upstream layers (MCP tools, HTTP handlers, withInstrumentation) can
 * branch on `err.code` instead of fragile message-string matching.
 *
 * `cause` is preserved separately from the ES2022 `Error.cause` chain so the
 * field always survives `JSON.stringify` via the explicit `toJSON` below.
 */
export type ErrorCode =
  | 'RATE_LIMITED'
  | 'CAPTCHA_DETECTED'
  | 'COOKIE_EXPIRED'
  | 'COOKIE_DECRYPT_FAIL'
  | 'BROWSER_LAUNCH_FAIL'
  | 'SCRAPER_FAIL'
  | 'CACHE_MISS'
  | 'VALIDATION_FAIL'
  | 'UPSTREAM_FAIL'
  | 'UNKNOWN';

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public context?: Record<string, unknown>,
    public override cause?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  toJSON(): { code: ErrorCode; message: string; context?: Record<string, unknown> } {
    return { code: this.code, message: this.message, context: this.context };
  }
}
