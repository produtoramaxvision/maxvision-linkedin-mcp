/**
 * tools/_registry — wires every tool into the McpServer.
 *
 * Sprint 1: only `search_jobs` is registered. `get_profile`, `get_job_details`,
 * and `track_application` are added in Fase D — adding them here is a
 * single-line append once their modules exist.
 *
 * Note: `inputSchema` for `registerTool` is a Zod *raw shape* (object literal),
 * not a `z.object(...)`. The SDK wraps and pre-parses it. The instrumented
 * callback we hand over re-parses defensively (cheap, idempotent).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SearchJobsInputShape } from './schemas.js';
import { searchJobs } from './search_jobs.js';

export function registerAllTools(server: McpServer): void {
  server.registerTool(
    'search_jobs',
    {
      title: 'Search Jobs',
      description: 'Search jobs on LinkedIn + aggregators. Cached 60 min.',
      inputSchema: SearchJobsInputShape,
    },
    async (input: unknown) => searchJobs(input),
  );

  // Fase D: register get_profile, get_job_details, track_application here.
}
