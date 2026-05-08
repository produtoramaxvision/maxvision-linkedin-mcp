/**
 * server — entrypoint for the MaxVision LinkedIn MCP server.
 *
 * Bootstraps the McpServer, registers tools, and connects the configured
 * transport (stdio for Claude Desktop / Claude Code; HTTP is Sprint 1.5).
 *
 * Graceful shutdown: SIGINT/SIGTERM logs the signal and exits 0. Future
 * sprints will close the browser pool, drain the DB pool, and quit Redis
 * here — wiring those teardown hooks lands when those resources are
 * actually held by this entrypoint (currently they're lazy-initialized
 * on first tool call).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { registerAllTools } from './tools/_registry.js';
import { startHttpServer } from './http.js';

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

// Graceful shutdown — current scope: just exit. Resource teardown lands when
// the corresponding singletons are held here (browser pool, redis, db pool).
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, () => {
    logger.info({ sig }, 'shutdown signal received');
    process.exit(0);
  });
}
