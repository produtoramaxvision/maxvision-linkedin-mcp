/**
 * tools/get_profile — fetch a LinkedIn profile by URL.
 *
 * Sprint 1 scope: cache lookup (24h freshness window), then scrape (mock),
 * then upsert cache fire-and-forget. The DB write is intentionally not
 * awaited so the tool stays responsive even if Postgres is unavailable
 * during the early Sprint 1 dev loop. Cache misses are non-fatal — they
 * are logged at warn and the scrape result is still returned.
 */
import { withInstrumentation } from './_base.js';
import { GetProfileInputSchema, type GetProfileInput } from './schemas.js';
import { scrapeProfile } from '../scrapers/linkedin-profile.js';
import { findByUrl, upsert } from '../db/repos/profiles.repo.js';
import { logger } from '../logger.js';

/** Cache freshness window applied on read (hours). */
const CACHE_MAX_AGE_HOURS = 24;
/** TTL written into `expires_at` on upsert (hours). */
const CACHE_TTL_HOURS = 24;

export interface GetProfileOutput {
  cached: boolean;
  profile: unknown;
}

export const getProfile = withInstrumentation<GetProfileInput, GetProfileOutput>({
  name: 'get_profile',
  description: 'Fetch a LinkedIn profile by URL. Cached 24h.',
  inputSchema: GetProfileInputSchema,
  handler: async ({ input, accountId }) => {
    logger.info({ accountId, profileUrl: input.profileUrl }, 'get_profile invoked');

    // Cache check. Failure is non-fatal — fall through to scrape.
    const cached = await findByUrl(input.profileUrl, CACHE_MAX_AGE_HOURS).catch(
      (err: unknown) => {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'profiles_cache lookup failed (non-fatal)',
        );
        return null;
      },
    );
    if (cached) {
      logger.debug({ profileUrl: input.profileUrl }, 'get_profile cache hit');
      return { cached: true, profile: cached.payload };
    }

    // Scrape (Sprint 1 mock — see scrapers/linkedin-profile.ts).
    const profile = await scrapeProfile({ accountId, profileUrl: input.profileUrl });

    // Fire-and-forget cache write. We do NOT await — the tool response
    // does not depend on persistence success, and audit log + logs will
    // surface failures.
    const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000);
    void upsert({
      publicId: profile.publicId,
      url: profile.url,
      payload: profile,
      expiresAt,
    }).catch((err: unknown) =>
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'profiles_cache upsert failed (non-fatal)',
      ),
    );

    return { cached: false, profile };
  },
});
