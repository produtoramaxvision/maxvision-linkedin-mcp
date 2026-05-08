/**
 * profiles.repo — TTL'd cache of public LinkedIn profiles.
 *
 * Same fresh-only read semantics as jobs.repo: rows are visible only while
 * `expires_at IS NULL OR expires_at > NOW()`. Additionally, callers can
 * pass `maxAgeHours` to enforce a per-call freshness window on top of the
 * row's own TTL.
 */
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { db } from '../client.js';
import { profilesCache, type NewProfilesCache, type ProfilesCache } from '../schema.js';

/** Build a `fetched_at > cutoff` predicate from an hour count. */
function freshWithin(maxAgeHours: number) {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  return gt(profilesCache.fetchedAt, cutoff);
}

/** Predicate: `expires_at IS NULL OR expires_at > NOW()` */
function notExpired() {
  return or(isNull(profilesCache.expiresAt), gt(profilesCache.expiresAt, new Date()));
}

/**
 * Lookup by `public_id` (e.g. "williamhgates"). Returns null if missing,
 * expired, or older than `maxAgeHours`.
 */
export async function findByPublicId(
  publicId: string,
  maxAgeHours: number,
): Promise<ProfilesCache | null> {
  const [row] = await db
    .select()
    .from(profilesCache)
    .where(
      and(
        eq(profilesCache.publicId, publicId),
        notExpired(),
        freshWithin(maxAgeHours),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Lookup by canonical URL (`https://www.linkedin.com/in/<slug>`). Same
 * freshness semantics as `findByPublicId`.
 */
export async function findByUrl(
  url: string,
  maxAgeHours: number,
): Promise<ProfilesCache | null> {
  const [row] = await db
    .select()
    .from(profilesCache)
    .where(
      and(eq(profilesCache.url, url), notExpired(), freshWithin(maxAgeHours)),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Insert-or-update a profile. Conflict target is `public_id` (the PK);
 * the `url` UNIQUE constraint will reject collisions where two distinct
 * public_ids share a URL — by design.
 */
export async function upsert(profile: NewProfilesCache): Promise<ProfilesCache> {
  const [row] = await db
    .insert(profilesCache)
    .values(profile)
    .onConflictDoUpdate({
      target: profilesCache.publicId,
      set: {
        url: sql`excluded.url`,
        payload: sql`excluded.payload`,
        fetchedAt: sql`excluded.fetched_at`,
        expiresAt: sql`excluded.expires_at`,
      },
    })
    .returning();
  if (!row) {
    throw new Error('upsert: insert returned no row');
  }
  return row;
}
