/**
 * Per-action rate limit policy.
 *
 * `capacity` = max burst tokens; `refillRate` = tokens/second sustained.
 * Conservative defaults — LinkedIn enforces opaque per-account limits and
 * tightening detection windows. Sprint 2+ may tune these per-account.
 *
 * Each call records a `rate_limit_events` row (fire-and-forget) for analytics
 * and LGPD audit. Redis is the live counter; this DB row is a historical
 * marker, not the gating mechanism.
 */
import { db } from '../db/client.js';
import { rateLimitEvents } from '../db/schema.js';
import { acquireToken } from './token-bucket.js';

export type Action =
  | 'search_jobs'
  | 'get_profile'
  | 'get_job_details'
  | 'track_application'
  | 'send_message'
  | 'apply_easy'
  | 'optimize_profile'
  | 'list_feed'
  | 'post_update'
  | 'search_people'
  | 'get_company_info'
  | 'find_company_employees'
  | 'search_companies'
  | 'get_profile_activity'
  | 'monitor_post_engagement'
  | 'list_applications'
  | 'get_account_owner';

const POLICY: Record<Action, { capacity: number; refillRate: number }> = {
  search_jobs: { capacity: 10, refillRate: 0.1 },        // 10 burst, ~6/min sustained
  get_profile: { capacity: 5, refillRate: 0.05 },        // 5 burst, ~3/min sustained
  get_job_details: { capacity: 20, refillRate: 0.3 },    // higher — read-only listing page
  track_application: { capacity: 100, refillRate: 1 },   // local DB write, lenient
  send_message: { capacity: 3, refillRate: 0.01 },       // very strict — write surface
  apply_easy: { capacity: 5, refillRate: 0.02 },         // strict — write surface, ban risk
  optimize_profile: { capacity: 5, refillRate: 0.05 },   // calls Claude API, capped
  list_feed: { capacity: 10, refillRate: 0.1 },          // read-only, moderate
  post_update: { capacity: 3, refillRate: 0.005 },       // very strict — public post
  search_people: { capacity: 5, refillRate: 0.05 },      // strict — Sales Nav surface
  // Sprint 7 — Apify-backed read-only tools (no LinkedIn-side rate risk)
  get_company_info: { capacity: 20, refillRate: 0.3 },
  find_company_employees: { capacity: 10, refillRate: 0.1 },
  search_companies: { capacity: 10, refillRate: 0.1 },
  get_profile_activity: { capacity: 10, refillRate: 0.1 },
  monitor_post_engagement: { capacity: 10, refillRate: 0.1 },
  list_applications: { capacity: 100, refillRate: 1 },   // local DB read, lenient
  get_account_owner: { capacity: 5, refillRate: 0.05 },  // strict — uses Patchright + /feed nav
};

export async function checkRateLimit(
  accountId: string,
  action: Action,
): Promise<{ allowed: boolean; remaining: number }> {
  const cfg = POLICY[action];
  const result = await acquireToken({ key: `rl:${accountId}:${action}`, ...cfg });
  // Fire-and-forget audit insert. Failure here must never block the caller —
  // rate limiting is gated by Redis, not by this row.
  void db.insert(rateLimitEvents).values({ accountId, action }).catch(() => {});
  return result;
}
