/**
 * tools/_base — instrumentation wrapper for MCP tools.
 *
 * Every tool is wrapped by `withInstrumentation` which:
 *   1. Re-validates the input via the tool's Zod schema (defensive — the SDK
 *      pre-parses raw shapes, but re-parsing parsed values is idempotent).
 *   2. Enforces the per-action rate limit via Redis token bucket.
 *   3. Executes the handler, captures latency.
 *   4. Records an `audit_log` row with SHA-256 hashes of input/output (LGPD:
 *      raw values never persisted), success flag, latency, error message.
 *   5. Maps thrown errors to the MCP `CallToolResult` error envelope.
 *
 * The audit insert is fire-and-forget: a failure to write the audit row
 * must not break the tool response. Errors there are logged at warn level.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db/client.js';
import { auditLog } from '../db/schema.js';
import { logger } from '../logger.js';
import { checkRateLimit, type Action } from '../rate-limit/strategy.js';
import { AppError } from '../errors.js';

/** Truncated SHA-256 hex (32 chars). Stored in audit_log; collisions
 *  irrelevant for forensic queries scoped by tool + account + time. */
function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 32);
}

export interface ToolHandlerArgs<I> {
  input: I;
  accountId: string;
}

export interface InstrumentedTool<I, O> {
  /** Must match an `Action` key in `rate-limit/strategy.ts`. The contract
   *  between tool name and rate-limit action is set there; if a tool's
   *  semantic action differs from its tool name, encode the mapping in
   *  the rate-limit module rather than diverging here. */
  name: Action;
  description: string;
  /** Zod schema producing `I`. The input side is widened to `unknown` so
   *  schemas with `.default()`/`.optional()` (which have `partial` input
   *  and `total` output types) satisfy the constraint. */
  inputSchema: z.ZodType<I, z.ZodTypeDef, unknown>;
  handler: (args: ToolHandlerArgs<I>) => Promise<O>;
}

/** Standard MCP `CallToolResult` shape: text content blocks + optional error
 *  flag. We always return a single text block carrying JSON-stringified output. */
export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * Wraps a tool definition with rate limiting, validation, audit logging, and
 * error envelope generation. Returns a function suitable for handing to
 * `server.registerTool` as the callback.
 *
 * Note on signature: the SDK passes parsed args (typed via raw shape inference)
 * but we accept `unknown` and re-parse defensively. Idempotent parse is fine
 * and gives us a single validation point regardless of caller.
 */
export function withInstrumentation<I, O>(
  tool: InstrumentedTool<I, O>,
): (rawInput: unknown) => Promise<McpToolResult> {
  return async function wrapped(rawInput: unknown): Promise<McpToolResult> {
    const startedAt = Date.now();
    let success = false;
    let errorMsg: string | null = null;
    let outputJson = '';
    let accountId = 'default';

    try {
      // 1. Validate (idempotent if already parsed by SDK).
      const parsedInput = tool.inputSchema.parse(rawInput);
      accountId = (parsedInput as { accountId?: string }).accountId ?? 'default';

      // 2. Rate limit gate.
      const rl = await checkRateLimit(accountId, tool.name);
      if (!rl.allowed) {
        throw new AppError('RATE_LIMITED', `Rate limit exceeded for ${tool.name}`, {
          remaining: rl.remaining,
        });
      }

      // 3. Execute.
      const out = await tool.handler({ input: parsedInput, accountId });
      outputJson = JSON.stringify(out);
      success = true;

      return { content: [{ type: 'text', text: outputJson }] };
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      const code = err instanceof AppError ? err.code : 'UNKNOWN';
      logger.error({ tool: tool.name, accountId, code, err: errorMsg }, 'tool error');
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: { code, message: errorMsg } }),
          },
        ],
      };
    } finally {
      const latencyMs = Date.now() - startedAt;
      const inputHash = sha256(JSON.stringify(rawInput ?? null));
      const outputHash = outputJson ? sha256(outputJson) : null;
      // Fire-and-forget. Audit failures never break the tool response.
      void db
        .insert(auditLog)
        .values({
          tool: tool.name,
          accountId,
          inputHash,
          outputHash,
          success,
          latencyMs,
          errorMsg,
        })
        .catch((e: unknown) => logger.warn({ err: e }, 'audit_log insert failed'));
    }
  };
}
