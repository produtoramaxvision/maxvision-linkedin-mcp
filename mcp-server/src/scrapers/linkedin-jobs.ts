/**
 * LinkedIn job search scraper — Sprint 1 MOCK.
 *
 * Returns deterministic fixtures so MCP tools (search_jobs, get_job_details)
 * and their tests can be wired without a live LinkedIn session.
 *
 * Sprint 1.5 replaces the body with real Patchright nav:
 *   ctx.newPage() →
 *   page.goto(`https://www.linkedin.com/jobs/search-results/?keywords=${kw}`) →
 *   parse cards via the resilient selectors documented in PLAN.md
 */
import { logger } from '../logger.js';

export interface JobResult {
  url: string;
  title: string;
  company: string;
  location: string;
  postedAt: string; // ISO 8601
  description: string;
  easyApply: boolean;
  source: 'linkedin' | 'jobspy';
}

// TODO Sprint 1.5 — replace mock with Patchright nav to /jobs/search-results/?keywords=...
export async function searchLinkedInJobs(args: {
  accountId: string;
  keywords: string;
  location?: string;
  max?: number;
}): Promise<JobResult[]> {
  logger.warn(
    { accountId: args.accountId, keywords: args.keywords },
    'searchLinkedInJobs MOCK — returning fixtures',
  );
  const max = args.max ?? 25;
  const fixtures: JobResult[] = [
    {
      url: 'https://www.linkedin.com/jobs/view/4001000001',
      title: `${args.keywords} Engineer`,
      company: 'Acme Corp',
      location: args.location ?? 'Remote',
      postedAt: new Date(Date.now() - 86_400_000).toISOString(),
      description: 'Mock job 1',
      easyApply: true,
      source: 'linkedin',
    },
    {
      url: 'https://www.linkedin.com/jobs/view/4001000002',
      title: `Senior ${args.keywords} Developer`,
      company: 'Globex',
      location: args.location ?? 'São Paulo, BR',
      postedAt: new Date(Date.now() - 172_800_000).toISOString(),
      description: 'Mock job 2',
      easyApply: false,
      source: 'linkedin',
    },
    {
      url: 'https://www.linkedin.com/jobs/view/4001000003',
      title: `${args.keywords} Lead`,
      company: 'Initech',
      location: args.location ?? 'Hybrid',
      postedAt: new Date(Date.now() - 259_200_000).toISOString(),
      description: 'Mock job 3',
      easyApply: true,
      source: 'linkedin',
    },
  ];
  return fixtures.slice(0, max);
}
