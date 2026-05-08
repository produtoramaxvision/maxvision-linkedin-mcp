/**
 * server — entrypoint for the MaxVision LinkedIn MCP server.
 *
 * Bootstraps the McpServer, registers tools, and connects the configured
 * transport (stdio for Claude Desktop / Claude Code; HTTP for Sprint 1.5+).
 *
 * Graceful shutdown: SIGINT/SIGTERM closes the browser pool (which waits
 * for in-flight contexts to drain via Patchright's own teardown) and quits
 * the Redis client used by the rate-limit token bucket, then exits 0.
 * The Postgres pool (`pgPool`) is left to close on process exit — it's
 * idempotent and short-lived idle connections are fine.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { registerAllTools } from './tools/_registry.js';
import { startHttpServer } from './http.js';
import { browserPool } from './browser/pool.js';
import { shutdownRateLimit } from './rate-limit/token-bucket.js';

const SERVER_NAME = 'maxvision-linkedin-mcp';
const SERVER_VERSION = '0.1.0';

async function main(): Promise<void> {
  if (env.MCP_TRANSPORT === 'http' && env.MCP_API_KEYS.length === 0) {
    logger.warn(
      {},
      'HTTP mode without MCP_API_KEYS = open server. NOT FOR PRODUCTION.',
    );
  }

  if (env.MCP_TRANSPORT === 'stdio') {
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
    registerAllTools(server);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info({ transport: 'stdio' }, `${SERVER_NAME} v${SERVER_VERSION} ready`);
  } else {
    await startHttpServer(env.MCP_PORT);
    logger.info(
      { transport: 'http', port: env.MCP_PORT },
      `${SERVER_NAME} v${SERVER_VERSION} ready`,
    );
  }
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'fatal startup error');
  process.exit(1);
});

// Graceful shutdown — close the browser pool and quit the Redis client used
// by the rate-limit token bucket. Errors during teardown are logged but
// non-fatal — we always reach process.exit(0) so OS / k8s liveness handlers
// see a clean exit instead of a hung process.
async function gracefulShutdown(sig: string): Promise<void> {
  logger.info({ sig }, 'graceful shutdown starting');
  try {
    await browserPool.shutdown();
    await shutdownRateLimit();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'shutdown error (non-fatal)');
  }
  process.exit(0);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, () => {
    void gracefulShutdown(sig);
  });
}
