/**
 * tools/_registry — wires every tool into the McpServer.
 *
 * Sprint 1 (4 tools): search_jobs, get_profile, get_job_details, track_application.
 * Sprint 2 (6 tools): list_feed, search_people, optimize_profile, post_update,
 *                     send_message, apply_easy.
 *
 * Total: 10 tools per blueprint PLAN-A. Sprint 3 adds license-tier gating
 * around the write surface (apply_easy, send_message, search_people).
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
  ListFeedInputShape,
  SearchPeopleInputShape,
  OptimizeProfileInputShape,
  PostUpdateInputShape,
  ApplyEasyInputShape,
  SendMessageInputShape,
} from './schemas.js';
import { searchJobs } from './search_jobs.js';
import { getProfile } from './get_profile.js';
import { getJobDetails } from './get_job_details.js';
import { trackApplication } from './track_application.js';
import { listFeed } from './list_feed.js';
import { searchPeople } from './search_people.js';
import { optimizeProfile } from './optimize_profile.js';
import { postUpdate } from './post_update.js';
import { applyEasy } from './apply_easy.js';
import { sendMessage } from './send_message.js';

export function registerAllTools(server: McpServer): void {
  // Sprint 1.
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

  // Sprint 2.
  server.registerTool(
    'list_feed',
    {
      title: 'List Feed',
      description: 'Read recent items from the LinkedIn home feed.',
      inputSchema: ListFeedInputShape,
    },
    async (input: unknown) => listFeed(input),
  );
  server.registerTool(
    'search_people',
    {
      title: 'Search People',
      description: 'Search LinkedIn for people (Pro/Agency tier).',
      inputSchema: SearchPeopleInputShape,
    },
    async (input: unknown) => searchPeople(input),
  );
  server.registerTool(
    'optimize_profile',
    {
      title: 'Optimize Profile',
      description: 'Analyze profile against target role using Claude.',
      inputSchema: OptimizeProfileInputShape,
    },
    async (input: unknown) => optimizeProfile(input),
  );
  server.registerTool(
    'post_update',
    {
      title: 'Post Update',
      description:
        'Create a new feed post (Pro tier). confirm=true to publish; confirm=false returns preview.',
      inputSchema: PostUpdateInputShape,
    },
    async (input: unknown) => postUpdate(input),
  );
  server.registerTool(
    'send_message',
    {
      title: 'Send Message',
      description:
        'Send a DM/InMail to a LinkedIn user (Pro tier). confirm=true to send; confirm=false returns preview.',
      inputSchema: SendMessageInputShape,
    },
    async (input: unknown) => sendMessage(input),
  );
  server.registerTool(
    'apply_easy',
    {
      title: 'Apply Easy',
      description:
        'Submit a LinkedIn Easy Apply (Pro tier). confirm=true to submit; confirm=false returns preview.',
      inputSchema: ApplyEasyInputShape,
    },
    async (input: unknown) => applyEasy(input),
  );
}
