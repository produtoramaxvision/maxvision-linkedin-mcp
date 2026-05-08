/**
 * http — HTTP transport stub.
 *
 * Sprint 1 ships with stdio only (Claude Desktop / Claude Code clients).
 * Wiring `StreamableHTTPServerTransport` requires `@hono/node-server`, which
 * isn't a Sprint 1 dependency, and depends on contracts (Hono adapter,
 * health check fan-out, Prometheus formatting) that land in Sprint 1.5.
 *
 * This stub keeps the transport branch in `server.ts` honest: if anyone
 * sets `MCP_TRANSPORT=http` today, they get a clear error instead of a
 * runtime crash deep inside the SDK.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from './logger.js';

export async function startHttpServer(_mcp: McpServer, port: number): Promise<void> {
  const msg = 'HTTP transport not yet wired (Sprint 1.5)';
  logger.error({ port }, msg);
  throw new Error(msg);
}
