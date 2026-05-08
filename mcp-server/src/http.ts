/**
 * http — HTTP transport for the LinkedIn MCP server.
 *
 * Uses Hono on `@hono/node-server` to expose three endpoints:
 *   GET  /health   — liveness, no auth.
 *   GET  /metrics  — Prometheus text format, no auth (scrape from inside cluster).
 *   POST /mcp      — JSON-RPC over MCP Streamable HTTP, requires API key.
 *
 * Implementation note (deviation from Sprint 1 plan):
 * The MCP SDK shipped at this repo is 1.29.0, which provides
 * `WebStandardStreamableHTTPServerTransport` — a fetch-API-native transport
 * with `handleRequest(req: Request): Promise<Response>`. Hono's request is
 * already a Web Standard `Request`, so we pass `c.req.raw` straight through.
 * No Node `IncomingMessage`/`ServerResponse` adapter needed.
 *
 * Stateless mode: `sessionIdGenerator: undefined`. Each /mcp call carries
 * a complete JSON-RPC message; the SDK does not persist session state.
 * `enableJsonResponse: true` makes the server reply with `application/json`
 * instead of opening an SSE stream — appropriate for stateless RPC.
 *
 * IMPORTANT (SDK 1.29 invariants):
 *   1. Stateless transports throw on the second `handleRequest` call:
 *      "Stateless transport cannot be reused across requests."
 *      (`webStandardStreamableHttp.js:139`)
 *   2. McpServer rejects a second `connect()` on the same instance:
 *      "Already connected to a transport." (`shared/protocol.js:217`)
 *
 * So we build a fresh McpServer + transport PER REQUEST. Tool registration
 * is a cheap in-memory operation, so this is fine. We don't share a singleton
 * with `server.ts` either, to avoid a circular import (server.ts already
 * imports startHttpServer from this file).
 */
import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from './logger.js';
import { authenticateApiKey } from './auth/api-key.js';
import { encryptCookie } from './auth/cookies.js';
import { db } from './db/client.js';
import { accounts, auditLog } from './db/schema.js';
import { registerAllTools } from './tools/_registry.js';
import { browserPool } from './browser/pool.js';

/**
 * Body schema for POST /admin/account-cookie.
 *
 * `accountId` constrained to slug-shaped chars so it embeds cleanly in URLs
 * and audit log filters. `cookieValue` width 80..500 matches typical `li_at`
 * lengths (LinkedIn issues ~150-char tokens; cap protects against accidental
 * pastes of much larger blobs).
 */
const AdminCookieBodySchema = z.object({
  accountId: z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/),
  displayName: z.string().min(1).max(200).optional(),
  cookieValue: z.string().min(80).max(500),
  expiresInDays: z.number().int().min(1).max(365).default(90),
});

const SERVER_NAME = 'maxvision-linkedin-mcp';
const SERVER_VERSION = '0.1.0';

const startedAt = Date.now();

export async function startHttpServer(port: number): Promise<void> {
  const app = new Hono();

  // Request logging middleware (pino).
  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    logger.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        latency_ms: Date.now() - start,
      },
      'http request',
    );
  });

  // Health (no auth). Includes a cheap snapshot of the browser pool — DB
  // queries are intentionally avoided so /health stays sub-millisecond.
  app.get('/health', (c) => {
    const browser = browserPool.getStats();
    return c.json({
      status: 'ok',
      uptime_ms: Date.now() - startedAt,
      version: SERVER_VERSION,
      transport: 'http',
      browser,
    });
  });

  // Metrics (no auth — scraped from inside cluster).
  app.get('/metrics', (c) => {
    const lines = [
      '# HELP linkedin_mcp_uptime_seconds Server uptime in seconds',
      '# TYPE linkedin_mcp_uptime_seconds counter',
      `linkedin_mcp_uptime_seconds ${(Date.now() - startedAt) / 1000}`,
    ];
    return c.text(lines.join('\n') + '\n', 200, {
      'content-type': 'text/plain; version=0.0.4',
    });
  });

  // Admin: persist a fresh `li_at` cookie for an account. Reuses the same
  // API-key auth as /mcp. Body never logged; only a SHA-256[:16] of the
  // *encrypted* blob lands in audit_log (see Sprint 1.5.1 spec).
  //
  // Mounted BEFORE /mcp so routing is unambiguous. Stateless: no MCP
  // handshake, no transport machinery — just JSON in, JSON out.
  app.post('/admin/account-cookie', async (c) => {
    const auth = await authenticateApiKey(c.req.raw);
    if (!auth.ok) {
      logger.warn({ reason: auth.reason }, 'auth fail on /admin/account-cookie');
      return c.json({ error: 'unauthorized', message: auth.reason }, 401);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = AdminCookieBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: 'validation_fail', details: parsed.error.flatten() },
        400,
      );
    }

    const { accountId, displayName, cookieValue, expiresInDays } = parsed.data;
    const blob = encryptCookie(cookieValue);
    const expiresAt = new Date(Date.now() + expiresInDays * 86400 * 1000);

    await db
      .insert(accounts)
      .values({
        id: accountId,
        displayName: displayName ?? 'Default Account',
        cookieEncrypted: blob,
        cookieExpiresAt: expiresAt,
      })
      .onConflictDoUpdate({
        target: accounts.id,
        set: {
          displayName: displayName ?? sql`${accounts.displayName}`,
          cookieEncrypted: blob,
          cookieExpiresAt: expiresAt,
          updatedAt: new Date(),
          status: 'active',
        },
      });

    // Audit (best-effort, hash of the *encrypted* blob only — never the
    // plaintext cookie). LGPD: input/output are never persisted in clear.
    const blobSha = createHash('sha256').update(blob).digest('hex').slice(0, 16);
    db.insert(auditLog)
      .values({
        tool: 'admin.cookie_refresh',
        accountId,
        inputHash: blobSha,
        success: true,
      })
      .catch((err: unknown) => {
        logger.warn(
          { err: (err as Error).message, accountId },
          'audit_log insert failed (admin.cookie_refresh)',
        );
      });

    return c.json({ accountId, expiresAt: expiresAt.toISOString() });
  });

  // MCP endpoint — authenticated. We pass `c.req.raw` (the underlying
  // Web Standard Request) directly to the transport. We do NOT call
  // `c.req.json()` first, because reading the body consumes the stream
  // and the transport would then see an empty body.
  //
  // Fresh McpServer + transport per request (stateless invariant — see file
  // header). McpServer.connect() rejects a second call on the same instance
  // ("Already connected to a transport"), and stateless WebStandard transports
  // are single-use, so the cheapest correct path is per-request construction.
  // Tool registration is in-memory only.
  app.post('/mcp', async (c) => {
    const auth = await authenticateApiKey(c.req.raw);
    if (!auth.ok) {
      logger.warn({ reason: auth.reason }, 'auth fail on /mcp');
      return c.json({ error: 'unauthorized', message: auth.reason }, 401);
    }
    const mcp = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
    registerAllTools(mcp);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await mcp.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  app.onError((err, c) => {
    logger.error({ err: err.message, stack: err.stack }, 'unhandled http error');
    return c.json({ error: 'internal_error' }, 500);
  });

  return new Promise((resolve) => {
    serve({ fetch: app.fetch, port }, (info) => {
      logger.info({ port: info.port }, 'hono HTTP server listening');
      resolve();
    });
  });
}
