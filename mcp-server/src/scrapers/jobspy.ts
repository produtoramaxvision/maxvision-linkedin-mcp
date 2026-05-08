/**
 * JobSpy aggregator scraper — Sprint 1 MOCK.
 *
 * Mirrors the `JobResult` shape from linkedin-jobs.ts so the merge step in
 * search_jobs can dedupe across sources by URL.
 *
 * Sprint 1.5 replaces this with a Python subprocess wrapper:
 *   spawn('python', ['python/jobspy_runner.py']) — params via stdin (JSON),
 *   results via stdout (JSON array). Timeout 60s, AbortController on stall.
 *   See PLAN.md `### src/scrapers/jobspy.ts`.
 */
import { logger } from '../logger.js';
import type { JobResult } from './linkedin-jobs.js';

// TODO Sprint 1.5 — wire real subprocess: spawn('python', ['-m', 'jobspy', ...]).
export async function searchJobSpy(args: {
  keywords: string;
  location?: string;
  sites?: Array<'indeed' | 'glassdoor' | 'zip_recruiter'>;
  max?: number;
}): Promise<JobResult[]> {
  logger.warn({ keywords: args.keywords }, 'searchJobSpy MOCK — returning fixtures');
  const max = args.max ?? 25;
  const fixtures: JobResult[] = [
    {
      url: 'https://www.indeed.com/viewjob?jk=mock001',
      title: `${args.keywords} Engineer (Indeed)`,
      company: 'TechStart',
      location: args.location ?? 'Remote',
      postedAt: new Date(Date.now() - 86_400_000).toISOString(),
      description: 'Mock Indeed job',
      easyApply: false,
      source: 'jobspy',
    },
    {
      url: 'https://www.glassdoor.com/job-listing/mock-002',
      title: `${args.keywords} Specialist (Glassdoor)`,
      company: 'BigCo',
      location: args.location ?? 'Rio de Janeiro, BR',
      postedAt: new Date(Date.now() - 172_800_000).toISOString(),
      description: 'Mock Glassdoor job',
      easyApply: false,
      source: 'jobspy',
    },
    {
      url: 'https://www.ziprecruiter.com/jobs/mock-003',
      title: `${args.keywords} Manager (ZipRecruiter)`,
      company: 'Startup Inc',
      location: args.location ?? 'Hybrid',
      postedAt: new Date(Date.now() - 259_200_000).toISOString(),
      description: 'Mock ZipRecruiter job',
      easyApply: false,
      source: 'jobspy',
    },
  ];
  return fixtures.slice(0, max);
}
