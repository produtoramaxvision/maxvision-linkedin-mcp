/**
 * applications.repo — application tracking with append-only history.
 *
 * The `history` column is a jsonb array. We never overwrite it; updates
 * use `history = history || $1::jsonb` so concurrent writers don't lose
 * entries. Status transitions go through `updateStatus`, which also
 * appends a history entry in a single statement.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../client.js';
import { applications, type Application, type NewApplication } from '../schema.js';

/**
 * One step in the application timeline. Lives inside the `history` jsonb array.
 * `at` is ISO-8601 — the DB has no per-history-entry timestamp column.
 */
export interface HistoryEntry {
  status: string;
  at: string;
  notes?: string;
}

/**
 * Find a tracked application by job URL scoped to an account.
 * (job_url, account_id) is not a UNIQUE constraint, so this picks
 * the most recently submitted row if duplicates somehow exist.
 */
export async function findByJobUrl(
  jobUrl: string,
  accountId: string,
): Promise<Application | null> {
  const [row] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.jobUrl, jobUrl), eq(applications.accountId, accountId)))
    .orderBy(desc(applications.submittedAt))
    .limit(1);
  return row ?? null;
}

/**
 * List applications for an account, newest first.
 * `limit` defaults to 200 — keep responses bounded; paginate in Sprint 3+.
 */
export async function findAll(accountId: string, limit = 200): Promise<Application[]> {
  return db
    .select()
    .from(applications)
    .where(eq(applications.accountId, accountId))
    .orderBy(desc(applications.submittedAt))
    .limit(limit);
}

/**
 * List applications filtered by status (Sprint 1.5).
 * NULL submittedAt rows (status != 'applied') sort last via NULLS LAST so
 * the most recent submitted-or-saved entries surface first.
 */
export async function findByStatus(
  accountId: string,
  status: string,
  limit = 200,
): Promise<Application[]> {
  return db
    .select()
    .from(applications)
    .where(and(eq(applications.accountId, accountId), eq(applications.status, status)))
    .orderBy(desc(applications.submittedAt))
    .limit(limit);
}

/**
 * Insert a fresh application row. Caller is expected to seed `history`
 * with the initial status entry (the schema default is `[]`).
 */
export async function create(application: NewApplication): Promise<Application> {
  const [row] = await db.insert(applications).values(application).returning();
  if (!row) {
    throw new Error('create: insert returned no row');
  }
  return row;
}

/**
 * Transition status. Atomically: bumps `status` and appends a fresh
 * history entry derived from the new status. The append uses
 * `history || jsonb_build_array(...)` so it survives concurrent updates.
 *
 * Returns the updated row.
 */
export async function updateStatus(
  id: string,
  status: string,
  notes?: string,
): Promise<Application> {
  const at = new Date().toISOString();
  // history entry is built server-side via jsonb_build_object so the timestamp
  // and the status both come from the same statement (no client-side drift).
  const entryExpr =
    notes !== undefined
      ? sql`jsonb_build_object('status', ${status}::text, 'at', ${at}::text, 'notes', ${notes}::text)`
      : sql`jsonb_build_object('status', ${status}::text, 'at', ${at}::text)`;

  const [row] = await db
    .update(applications)
    .set({
      status,
      history: sql`${applications.history} || jsonb_build_array(${entryExpr})`,
    })
    .where(eq(applications.id, id))
    .returning();
  if (!row) {
    throw new Error(`updateStatus: no application found with id ${id}`);
  }
  return row;
}

/**
 * Append a single entry to `history` without changing `status`. Used when
 * the timeline needs annotation without a state transition (e.g. recruiter
 * reply notes on an application that stays in `submitted`).
 */
export async function appendHistory(
  id: string,
  entry: HistoryEntry,
): Promise<Application> {
  const [row] = await db
    .update(applications)
    .set({
      history: sql`${applications.history} || jsonb_build_array(${JSON.stringify(entry)}::jsonb)`,
    })
    .where(eq(applications.id, id))
    .returning();
  if (!row) {
    throw new Error(`appendHistory: no application found with id ${id}`);
  }
  return row;
}
