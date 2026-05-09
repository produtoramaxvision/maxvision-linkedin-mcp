/**
 * accounts.repo — operations on the multi-account cookie pool.
 *
 * Cookie storage is a single bytea blob laid out as IV||Tag||Ciphertext
 * (AES-256-GCM). See PLAN.md `### src/auth/cookies.ts` for the encoding contract.
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '../client.js';
import { accounts, type Account, type NewAccount } from '../schema.js';

/**
 * Insert a new account row. Caller must pre-encrypt cookies via auth/cookies.ts.
 */
export async function createAccount(data: NewAccount): Promise<Account> {
  const [row] = await db.insert(accounts).values(data).returning();
  if (!row) {
    throw new Error('createAccount: insert returned no row');
  }
  return row;
}

/**
 * Lookup by primary key (e.g. "default" for Sprint 1's seeded account).
 *
 * v0.13.2 fallback: when id='default' has no row, fall back to the first
 * active account by `created_at`. This unblocks new users who run tools
 * before explicitly creating a 'default' account, while keeping multi-account
 * pools intact (named ids resolve directly).
 */
export async function getAccountById(id: string): Promise<Account | null> {
  const [row] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (row) return row;
  if (id !== 'default') return null;
  const [fallback] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.status, 'active'))
    .orderBy(accounts.createdAt)
    .limit(1);
  return fallback ?? null;
}

/**
 * Replace the encrypted cookie blob (and its expiry) atomically.
 * `cookieEncrypted` MUST already be the IV||Tag||Ciphertext concatenation;
 * this repo does not encrypt — that's the auth layer's job.
 *
 * `updated_at` is bumped automatically by the `accounts_update_timestamp` trigger.
 */
export async function updateAccountCookie(
  id: string,
  cookieEncrypted: Buffer,
  cookieExpiresAt: Date,
): Promise<void> {
  await db
    .update(accounts)
    .set({ cookieEncrypted, cookieExpiresAt })
    .where(eq(accounts.id, id));
}

/**
 * Bump `last_used_at` to NOW(). Cheap fire-and-forget — call after every
 * successful tool invocation that consumed this account's cookies.
 *
 * Uses SQL NOW() rather than `new Date()` so the timestamp comes from the DB
 * clock (single source of truth across containers).
 */
export async function touchLastUsed(id: string): Promise<void> {
  await db
    .update(accounts)
    .set({ lastUsedAt: sql`NOW()` })
    .where(eq(accounts.id, id));
}
