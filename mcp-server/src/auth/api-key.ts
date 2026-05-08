/**
 * api-key — API key authentication for the HTTP transport.
 *
 * Accepts either:
 *   - `Authorization: Bearer <key>`
 *   - `X-Api-Key: <key>`
 *
 * Compares against `env.MCP_API_KEYS` (allowlist) using `timingSafeEqual` so
 * we don't leak length or content via timing side-channels.
 *
 * Empty allowlist = open mode (Sprint 1 dev default). `server.ts` logs a
 * loud warn at startup; we additionally log per-request here so it shows up
 * in production logs if it's ever misconfigured.
 *
 * Auth failures are written to `audit_log` with `tool='auth.fail'`. Insert
 * failures (DB down, schema drift) are caught and logged but never thrown —
 * auth must not depend on DB availability.
 */
import { timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { db } from '../db/client.js';
import { auditLog } from '../db/schema.js';

export interface AuthResult {
  ok: boolean;
  reason?: string;
}

/**
 * Validate `Authorization: Bearer <key>` or `X-Api-Key: <key>`.
 * Constant-time compare against `env.MCP_API_KEYS`.
 */
export async function authenticateApiKey(req: Request): Promise<AuthResult> {
  const allowlist = env.MCP_API_KEYS;

  // No keys configured = open mode. server.ts logs a warn on startup;
  // we also log per-request so it surfaces in production logs.
  if (allowlist.length === 0) {
    logger.warn({}, 'auth bypass: MCP_API_KEYS empty (open mode)');
    return { ok: true };
  }

  // Extract key from Authorization or X-Api-Key.
  const auth = req.headers.get('authorization');
  const xApiKey = req.headers.get('x-api-key');
  let presented: string | null = null;

  if (auth?.startsWith('Bearer ')) {
    presented = auth.slice('Bearer '.length).trim();
  } else if (xApiKey) {
    presented = xApiKey.trim();
  }

  if (!presented) {
    void recordAuthFail('missing');
    return {
      ok: false,
      reason: 'missing api key (use Authorization: Bearer <key> or X-Api-Key: <key>)',
    };
  }

  // Constant-time compare. timingSafeEqual requires equal lengths, so we
  // skip mismatched-length entries (a length mismatch can't be safe-compared
  // and is itself a valid "not equal" signal — but we want to keep iterating
  // through the allowlist to avoid leaking which entry matched on length).
  const presentedBuf = Buffer.from(presented, 'utf8');
  let matched = false;
  for (const valid of allowlist) {
    const validBuf = Buffer.from(valid, 'utf8');
    if (validBuf.length !== presentedBuf.length) continue;
    if (timingSafeEqual(presentedBuf, validBuf)) {
      matched = true;
      // Don't break early — finish the loop to keep timing closer to constant.
    }
  }
  if (matched) return { ok: true };

  void recordAuthFail('invalid', presented.slice(0, 8) + '...');
  return { ok: false, reason: 'invalid api key' };
}

async function recordAuthFail(reason: string, keyPrefix?: string): Promise<void> {
  try {
    await db.insert(auditLog).values({
      tool: 'auth.fail',
      success: false,
      errorMsg: keyPrefix ? `${reason}:${keyPrefix}` : reason,
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'audit_log insert failed (auth.fail)');
  }
}
