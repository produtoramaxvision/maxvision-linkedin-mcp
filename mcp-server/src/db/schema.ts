/**
 * MaxVision LinkedIn MCP — Drizzle schema
 *
 * Source-of-truth for TypeScript types. Mirrors `docker/postgres/init.sql`
 * (which is the bootstrap applied by Postgres on container start).
 *
 * IMPORTANT: when editing this file, update `docker/postgres/init.sql`
 * by hand to keep DDL in sync. See PLAN.md `## Source-of-truth resolution`.
 */
import {
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// drizzle-orm/pg-core does not ship a first-class `bytea` helper; define one
// so cookie ciphertext (IV || tag || ciphertext) round-trips as a Buffer.
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return 'bytea';
  },
});

// ----------------------------------------------------------------------------
// accounts — multi-account cookie pool. Sprint 1 seeds id="default".
// Cookie blob layout (single bytea): IV (12 bytes) || Auth Tag (16 bytes) || Ciphertext.
// ----------------------------------------------------------------------------
export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    displayName: text('display_name').notNull(),
    cookieEncrypted: bytea('cookie_encrypted').notNull(),
    cookieExpiresAt: timestamp('cookie_expires_at', { withTimezone: true }).notNull(),
    rateLimitBucket: jsonb('rate_limit_bucket').notNull().default(sql`'{}'::jsonb`),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('idx_accounts_status').on(t.status)],
);

// ----------------------------------------------------------------------------
// jobs_cache — TTL'd cache of job postings (LinkedIn + JobSpy sources).
// ----------------------------------------------------------------------------
export const jobsCache = pgTable(
  'jobs_cache',
  {
    id: text('id').primaryKey(),
    source: text('source').notNull(),
    url: text('url').notNull().unique(),
    payload: jsonb('payload').notNull(),
    matchScore: real('match_score'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_jobs_fetched').on(t.fetchedAt),
    index('idx_jobs_source').on(t.source),
    index('idx_jobs_expires').on(t.expiresAt),
  ],
);

// ----------------------------------------------------------------------------
// profiles_cache — TTL'd cache of public LinkedIn profiles.
// ----------------------------------------------------------------------------
export const profilesCache = pgTable(
  'profiles_cache',
  {
    publicId: text('public_id').primaryKey(),
    url: text('url').notNull().unique(),
    payload: jsonb('payload').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [index('idx_profiles_expires').on(t.expiresAt)],
);

// ----------------------------------------------------------------------------
// applications — application tracking with append-only history (jsonb array).
// FK uses `set null` so deleting an account preserves audit trail.
// ----------------------------------------------------------------------------
export const applications = pgTable(
  'applications',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    accountId: text('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    jobUrl: text('job_url').notNull(),
    jobTitle: text('job_title'),
    company: text('company'),
    status: text('status').notNull(),
    resumeUsed: text('resume_used'),
    coverLetter: text('cover_letter'),
    answers: jsonb('answers'),
    screenshotPath: text('screenshot_path'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow(),
    history: jsonb('history').notNull().default(sql`'[]'::jsonb`),
  },
  (t) => [
    index('idx_applications_account').on(t.accountId, t.submittedAt),
    index('idx_applications_status').on(t.status),
  ],
);

// ----------------------------------------------------------------------------
// messages_drafts — Sprint 2 (DM with approval gate). Created empty in Sprint 1.
// ----------------------------------------------------------------------------
export const messagesDrafts = pgTable(
  'messages_drafts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    accountId: text('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    recipientUrl: text('recipient_url').notNull(),
    body: text('body').notNull(),
    status: text('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [index('idx_drafts_account').on(t.accountId, t.createdAt)],
);

// ----------------------------------------------------------------------------
// rate_limit_events — historical record. Redis is the live counter; this table
// supports analytics + LGPD audit. FK cascade because events have no value
// after their account is deleted.
// ----------------------------------------------------------------------------
export const rateLimitEvents = pgTable(
  'rate_limit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: text('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('idx_rate_limit_account_time').on(t.accountId, t.occurredAt)],
);

// ----------------------------------------------------------------------------
// captcha_events — anti-detect monitoring. Health check writes here.
// ----------------------------------------------------------------------------
export const captchaEvents = pgTable(
  'captcha_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: text('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    context: text('context'),
    resolved: boolean('resolved').notNull().default(false),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('idx_captcha_account').on(t.accountId, t.occurredAt)],
);

// ----------------------------------------------------------------------------
// license_cache — Sprint 3 (Pro/Agency entitlement cache). Created empty.
// ----------------------------------------------------------------------------
export const licenseCache = pgTable('license_cache', {
  keyHash: text('key_hash').primaryKey(),
  tier: text('tier').notNull(),
  features: jsonb('features').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  cachedAt: timestamp('cached_at', { withTimezone: true }).defaultNow(),
});

// ----------------------------------------------------------------------------
// audit_log — Sprint 1 spec. NOTE: replaces init.sql columns
// (action/resource_type/resource_id/metadata) — init.sql update lives in
// Phase 2 of the build sequence (PLAN.md line 1023).
// Input/output never stored in full; only SHA-256 hashes (LGPD).
// ----------------------------------------------------------------------------
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tool: text('tool').notNull(),
    accountId: text('account_id'),
    inputHash: text('input_hash'),
    outputHash: text('output_hash'),
    success: boolean('success').notNull(),
    latencyMs: integer('latency_ms'),
    errorMsg: text('error_msg'),
    ts: timestamp('ts', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_audit_account').on(t.accountId, t.ts),
    index('idx_audit_tool').on(t.tool, t.ts),
  ],
);

// ----------------------------------------------------------------------------
// Inferred types — never define table row shapes manually.
// ----------------------------------------------------------------------------
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type JobsCache = typeof jobsCache.$inferSelect;
export type NewJobsCache = typeof jobsCache.$inferInsert;

export type ProfilesCache = typeof profilesCache.$inferSelect;
export type NewProfilesCache = typeof profilesCache.$inferInsert;

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;

export type MessagesDraft = typeof messagesDrafts.$inferSelect;
export type NewMessagesDraft = typeof messagesDrafts.$inferInsert;

export type RateLimitEvent = typeof rateLimitEvents.$inferSelect;
export type NewRateLimitEvent = typeof rateLimitEvents.$inferInsert;

export type CaptchaEvent = typeof captchaEvents.$inferSelect;
export type NewCaptchaEvent = typeof captchaEvents.$inferInsert;

export type LicenseCache = typeof licenseCache.$inferSelect;
export type NewLicenseCache = typeof licenseCache.$inferInsert;

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
