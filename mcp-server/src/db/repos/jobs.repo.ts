/**
 * jobs.repo — TTL'd cache of job postings.
 *
 * Cache freshness rule: a row is "fresh" when `expires_at IS NULL`
 * (no TTL) OR `expires_at > NOW()`. Reads always apply this filter so
 * stale rows are invisible until `deleteExpired()` reaps them.
 */
import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '../client.js';
import { jobsCache, type JobsCache, type NewJobsCache } from '../schema.js';

/** Predicate: `expires_at IS NULL OR expires_at > NOW()` */
function notExpired() {
  return or(isNull(jobsCache.expiresAt), gt(jobsCache.expiresAt, new Date()));
}

/**
 * Find recently fetched jobs scoped to a set of sources. Sprint 1 has no
 * full-text search — match is by source + freshness window.
 *
 * `_keywords` is accepted for interface stability with PLAN.md and future
 * Sprint 2+ GIN-index full-text search; the param is currently ignored.
 */
export async function findByKeywords(
  _keywords: string,
  sources: string[],
  maxAgeHours: number,
): Promise<JobsCache[]> {
  if (sources.length === 0) {
    return [];
  }
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  return db
    .select()
    .from(jobsCache)
    .where(
      and(
        inArray(jobsCache.source, sources),
        gt(jobsCache.fetchedAt, cutoff),
        notExpired(),
      ),
    )
    .orderBy(desc(jobsCache.fetchedAt));
}

/**
 * Lookup by primary key (LinkedIn `job_id` or JobSpy synthetic id).
 * Returns null if missing OR expired — callers don't have to recheck.
 */
export async function findById(id: string): Promise<JobsCache | null> {
  const [row] = await db
    .select()
    .from(jobsCache)
    .where(and(eq(jobsCache.id, id), notExpired()))
    .limit(1);
  return row ?? null;
}

/**
 * Lookup by canonical URL. Same fresh-only semantics as `findById`.
 */
export async function findByUrl(url: string): Promise<JobsCache | null> {
  const [row] = await db
    .select()
    .from(jobsCache)
    .where(and(eq(jobsCache.url, url), notExpired()))
    .limit(1);
  return row ?? null;
}

/**
 * Insert-or-update a single job. Conflict target is `id` (the primary key);
 * `url` has its own UNIQUE constraint so any URL collision still surfaces
 * as a DB error — by design, distinct ids must not share a URL.
 */
export async function upsert(job: NewJobsCache): Promise<JobsCache> {
  const [row] = await db
    .insert(jobsCache)
    .values(job)
    .onConflictDoUpdate({
      target: jobsCache.id,
      set: {
        source: sql`excluded.source`,
        url: sql`excluded.url`,
        payload: sql`excluded.payload`,
        matchScore: sql`excluded.match_score`,
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

/**
 * Bulk upsert. Single round-trip via `INSERT ... ON CONFLICT`. No-op for empty
 * input. Returning is dropped because callers don't currently need it.
 */
export async function upsertMany(jobs: NewJobsCache[]): Promise<void> {
  if (jobs.length === 0) {
    return;
  }
  await db
    .insert(jobsCache)
    .values(jobs)
    .onConflictDoUpdate({
      target: jobsCache.id,
      set: {
        source: sql`excluded.source`,
        url: sql`excluded.url`,
        payload: sql`excluded.payload`,
        matchScore: sql`excluded.match_score`,
        fetchedAt: sql`excluded.fetched_at`,
        expiresAt: sql`excluded.expires_at`,
      },
    });
}

/**
 * Delete rows whose `expires_at` is in the past. Returns the count of rows
 * removed. Rows with NULL `expires_at` are kept (no TTL = never expire).
 *
 * Wired to a future cron job (see PLAN.md line 142).
 */
export async function deleteExpired(): Promise<number> {
  const result = await db
    .delete(jobsCache)
    .where(lt(jobsCache.expiresAt, new Date()))
    .returning({ id: jobsCache.id });
  return result.length;
}
