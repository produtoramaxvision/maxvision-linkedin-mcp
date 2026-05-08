/**
 * tools/search_jobs — search jobs across LinkedIn + JobSpy aggregators.
 *
 * Sprint 1 scope: dispatch to scrapers and return merged results.
 * Cache integration is intentionally deferred — `jobs.repo` exposes
 * `findByUrl` / `upsert` / `upsertMany` (not the per-query cache helpers
 * the spec hinted at). With Sprint 1 scrapers being mocks, wiring cache
 * here would be premature; we revisit when real scrapers land in Sprint 1.5.
 */
import { createHash } from 'node:crypto';
import { withInstrumentation } from './_base.js';
import { SearchJobsInputSchema, type SearchJobsInput } from './schemas.js';
import { searchLinkedInJobs } from '../scrapers/linkedin-jobs.js';
import { searchJobSpy } from '../scrapers/jobspy.js';
import { logger } from '../logger.js';

export interface SearchJobsOutput {
  count: number;
  jobs: unknown[];
  cached: boolean;
}

export const searchJobs = withInstrumentation<SearchJobsInput, SearchJobsOutput>({
  name: 'search_jobs',
  description:
    'Search jobs on LinkedIn and aggregator boards (Indeed/Glassdoor via JobSpy). Caches results for 60 minutes.',
  inputSchema: SearchJobsInputSchema,
  handler: async ({ input, accountId }) => {
    // Hash of the canonical query — useful for cache lookups (Sprint 1.5)
    // and for correlating logs across sources.
    const queryHash = createHash('sha256')
      .update(`${input.keywords}|${input.location ?? ''}|${input.sources}|${input.maxResults}`)
      .digest('hex');

    logger.info(
      { accountId, keywords: input.keywords, sources: input.sources, queryHash },
      'search_jobs invoked',
    );

    const tasks: Promise<unknown[]>[] = [];
    if (input.sources === 'linkedin' || input.sources === 'both') {
      tasks.push(
        searchLinkedInJobs({
          accountId,
          keywords: input.keywords,
          location: input.location,
          max: input.maxResults,
        }),
      );
    }
    if (input.sources === 'jobspy' || input.sources === 'both') {
      tasks.push(
        searchJobSpy({
          keywords: input.keywords,
          location: input.location,
          max: input.maxResults,
        }),
      );
    }

    const results = (await Promise.all(tasks)).flat();
    const limited = results.slice(0, input.maxResults);

    return { count: limited.length, jobs: limited, cached: false };
  },
});
