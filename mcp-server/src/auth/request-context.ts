/**
 * Per-request context — Sprint 3.4.
 *
 * Carries values that are scoped to a single /mcp HTTP request (license key,
 * upstream API key id, etc.) into the deeper MCP tool handlers without
 * threading them through every function signature.
 *
 * AsyncLocalStorage propagates across `await` and Promise chains. Handlers
 * registered with `withInstrumentation` (which is the entry point for every
 * tool) can call `getRequestContext()` to read the values for the active
 * HTTP request, with no need for the McpServer SDK to plumb headers through.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  licenseKey?: string;
  apiKeyId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function withRequestContext<T>(ctx: RequestContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext {
  return storage.getStore() ?? {};
}
