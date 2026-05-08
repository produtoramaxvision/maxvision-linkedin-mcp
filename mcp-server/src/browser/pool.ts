/**
 * BrowserPool — warm pool of Patchright contexts keyed by accountId.
 *
 * Sprint 1 cap: maxSize = 2 contexts. The pool reuses an idle, fresh context
 * for the same account (LRU-ish: oldest-first eviction once full).
 *
 * - The `Browser` is a single shared Chromium process (cheap, expensive to
 *   relaunch) — created lazily on first acquire.
 * - Each `BrowserContext` is account-scoped (cookies, storage, fingerprint).
 *   Context age caps at 30 min so cookie/state drift doesn't accumulate.
 * - `release()` flips inUse without closing — the next caller for the same
 *   account reuses the warm context.
 *
 * NOT thread-safe across processes; designed for the single Node process model.
 */
import { chromium, type Browser, type BrowserContext } from 'patchright';
import { launchOptions } from './anti-detect.js';
import { createContextForAccount } from './context.js';
import { getAccountById } from '../db/repos/accounts.repo.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

interface PoolEntry {
  context: BrowserContext;
  accountId: string;
  inUse: boolean;
  createdAt: number;
}

class BrowserPool {
  private browser: Browser | null = null;
  private entries: PoolEntry[] = [];
  private readonly maxSize = 2;
  private readonly maxAgeMs = 30 * 60 * 1000;

  private async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) return this.browser;
    this.browser = await chromium.launch(launchOptions);
    logger.info('patchright browser launched');
    return this.browser;
  }

  async acquire(accountId: string): Promise<{ context: BrowserContext; release: () => void }> {
    // Reuse a free, fresh entry for this account if available.
    const idx = this.entries.findIndex(
      (e) =>
        e.accountId === accountId &&
        !e.inUse &&
        Date.now() - e.createdAt < this.maxAgeMs,
    );
    let entry: PoolEntry;
    if (idx >= 0) {
      entry = this.entries[idx]!;
      entry.inUse = true;
    } else {
      // Evict oldest when at capacity. Sprint 1 keeps eviction strictly LRU
      // by insertion order (entries[] is FIFO).
      if (this.entries.length >= this.maxSize) {
        const oldest = this.entries.shift()!;
        await oldest.context.close().catch(() => {});
      }
      const account = await getAccountById(accountId);
      if (!account) throw new AppError('UNKNOWN', `Account not found: ${accountId}`);
      const browser = await this.getBrowser();
      const ctx = await createContextForAccount(browser, accountId, account.cookieEncrypted);
      entry = { context: ctx, accountId, inUse: true, createdAt: Date.now() };
      this.entries.push(entry);
    }
    return {
      context: entry.context,
      release: () => {
        entry.inUse = false;
      },
    };
  }

  async shutdown(): Promise<void> {
    for (const e of this.entries) {
      await e.context.close().catch(() => {});
    }
    this.entries = [];
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }

  /** Snapshot of pool state for /health diagnostics. Cheap, sync. */
  getStats(): { size: number; inUse: number } {
    return {
      size: this.entries.length,
      inUse: this.entries.filter((e) => e.inUse).length,
    };
  }
}

export const browserPool = new BrowserPool();
