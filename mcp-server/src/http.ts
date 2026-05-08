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
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { logger } from './logger.js';
import { authenticateApiKey } from './auth/api-key.js';
import { registerAllTools } from './tools/_registry.js';

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

  // Health (no auth).
  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      uptime_ms: Date.now() - startedAt,
      version: SERVER_VERSION,
      transport: 'http',
    }),
  );

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
