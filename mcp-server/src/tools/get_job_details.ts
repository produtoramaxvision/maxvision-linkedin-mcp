/**
 * tools/get_job_details — fetch a single LinkedIn job by URL.
 *
 * Sprint 1 scope: cache check (60-min freshness), then scrape (mock),
 * then fire-and-forget upsert. `jobs.repo.findByUrl` only filters by
 * `expires_at` — it does NOT take a `maxAgeHours`. We apply our own
 * 60-min window against `fetched_at` on top of that, so the tool's
 * freshness contract is enforced here even if a row was written with
 * a longer TTL elsewhere.
 */
import { withInstrumentation } from './_base.js';
import { GetJobDetailsInputSchema, type GetJobDetailsInput } from './schemas.js';
import { scrapeJobDetails } from '../scrapers/linkedin-job-details.js';
import { findByUrl, upsert } from '../db/repos/jobs.repo.js';
import { logger } from '../logger.js';

/** Freshness window for cache hits and TTL written on upsert (minutes). */
const CACHE_TTL_MIN = 60;

export interface GetJobDetailsOutput {
  cached: boolean;
  details: unknown;
}

export const getJobDetails = withInstrumentation<GetJobDetailsInput, GetJobDetailsOutput>({
  name: 'get_job_details',
  description: 'Fetch a single LinkedIn job by URL. Cached 60 min.',
  inputSchema: GetJobDetailsInputSchema,
  handler: async ({ input, accountId }) => {
    logger.info({ accountId, jobUrl: input.jobUrl }, 'get_job_details invoked');

    // Cache lookup — non-fatal, fall through to scrape on error.
    const cached = await findByUrl(input.jobUrl).catch((err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'jobs_cache lookup failed (non-fatal)',
      );
      return null;
    });
    if (cached) {
      // findByUrl already filtered out expired rows, but enforce our
      // tighter 60-min freshness window on `fetched_at` here.
      const fetchedAt = cached.fetchedAt ? new Date(cached.fetchedAt).getTime() : 0;
      const ageMs = Date.now() - fetchedAt;
      if (ageMs < CACHE_TTL_MIN * 60 * 1000) {
        logger.debug({ jobUrl: input.jobUrl, ageMs }, 'get_job_details cache hit');
        return { cached: true, details: cached.payload };
      }
    }

    // Scrape (Sprint 1 mock — see scrapers/linkedin-job-details.ts).
    const details = await scrapeJobDetails({ accountId, jobUrl: input.jobUrl });

    // Fire-and-forget cache write. We do NOT await persistence.
    const expiresAt = new Date(Date.now() + CACHE_TTL_MIN * 60 * 1000);
    void upsert({
      id: details.jobId,
      source: 'linkedin',
      url: details.url,
      payload: details,
      expiresAt,
    }).catch((err: unknown) =>
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'jobs_cache upsert failed (non-fatal)',
      ),
    );

    return { cached: false, details };
  },
});
