/**
 * tools/_registry — wires every tool into the McpServer.
 *
 * Sprint 1 Fase D: all four core tools registered — `search_jobs`,
 * `get_profile`, `get_job_details`, `track_application`.
 *
 * Note: `inputSchema` for `registerTool` is a Zod *raw shape* (object literal),
 * not a `z.object(...)`. The SDK wraps and pre-parses it. The instrumented
 * callback we hand over re-parses defensively (cheap, idempotent).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  SearchJobsInputShape,
  GetProfileInputShape,
  GetJobDetailsInputShape,
  TrackApplicationInputShape,
} from './schemas.js';
import { searchJobs } from './search_jobs.js';
import { getProfile } from './get_profile.js';
import { getJobDetails } from './get_job_details.js';
import { trackApplication } from './track_application.js';

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

  server.registerTool(
    'get_profile',
    {
      title: 'Get LinkedIn Profile',
      description: 'Fetch a LinkedIn profile by URL. Cached 24h.',
      inputSchema: GetProfileInputShape,
    },
    async (input: unknown) => getProfile(input),
  );

  server.registerTool(
    'get_job_details',
    {
      title: 'Get Job Details',
      description: 'Fetch a single job by URL. Cached 60 min.',
      inputSchema: GetJobDetailsInputShape,
    },
    async (input: unknown) => getJobDetails(input),
  );

  server.registerTool(
    'track_application',
    {
      title: 'Track Application',
      description: 'Record a job application in the local tracker.',
      inputSchema: TrackApplicationInputShape,
    },
    async (input: unknown) => trackApplication(input),
  );
}
