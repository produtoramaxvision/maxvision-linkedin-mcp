/**
 * BrowserPool — per-account Patchright `launchPersistentContext` (Sprint 1.5.3).
 *
 * Aligned with Patchright "Best Practice" anti-detect:
 *   - launchPersistentContext (NOT browser.newContext) so the per-account
 *     profile dir persists state (localStorage, IndexedDB, fingerprint stable).
 *   - headless: false + xvfb on Linux servers (LinkedIn detects HeadlessChrome).
 *   - no custom userAgent / viewport overrides.
 *
 * The pool keeps one open context per accountId, recycled if older than
 * `maxAgeMs` (cookie/state drift cap). Each accountId launches its own
 * Chromium process — heavy but necessary for fingerprint isolation. Sprint 1
 * caps at sandbox-1 + 1-2 paid accounts so memory cost is bounded.
 *
 * Profile directory is `${PROFILE_BASE_DIR}/<accountId>/`. In production the
 * stack mounts a Docker volume on /data/profiles so state survives container
 * restarts.
 *
 * NOT thread-safe across processes; designed for the single Node process model.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext } from 'patchright';
import { launchOptions } from './anti-detect.js';
import { hydrateLinkedInCookie } from './context.js';
import { getAccountById } from '../db/repos/accounts.repo.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

interface PoolEntry {
  context: BrowserContext;
  accountId: string;
  inUse: boolean;
  createdAt: number;
  profileDir: string;
}

const PROFILE_BASE_DIR = process.env['PROFILE_BASE_DIR'] ?? '/data/profiles';

class BrowserPool {
  private entries: Map<string, PoolEntry> = new Map();
  private readonly maxAgeMs = 30 * 60 * 1000;

  private async profileDirFor(accountId: string): Promise<string> {
    // Sanitize: accountId already validated upstream against [a-z0-9_-]+ via
    // Zod, but defense-in-depth — never let path traversal slip through.
    const safe = accountId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const dir = path.join(PROFILE_BASE_DIR, safe);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  async acquire(accountId: string): Promise<{ context: BrowserContext; release: () => void }> {
    const existing = this.entries.get(accountId);
    if (existing && !existing.inUse && Date.now() - existing.createdAt < this.maxAgeMs) {
      existing.inUse = true;
      return {
        context: existing.context,
        release: () => {
          existing.inUse = false;
        },
      };
    }

    if (existing) {
      await existing.context.close().catch((err) => {
        logger.warn({ accountId, err: (err as Error).message }, 'context close error (ignored)');
      });
      this.entries.delete(accountId);
    }

    const account = await getAccountById(accountId);
    if (!account) throw new AppError('UNKNOWN', `Account not found: ${accountId}`);

    const profileDir = await this.profileDirFor(accountId);
    logger.info({ accountId, profileDir }, 'launching persistent context');

    const ctx = await chromium.launchPersistentContext(profileDir, launchOptions);

    // Always re-hydrate cookie on launch — even with persistent profile, the
    // accounts table is the source of truth and may have a fresh cookie from
    // a recent /linkedin-cookie-refresh call.
    await hydrateLinkedInCookie(ctx, accountId, account.cookieEncrypted);

    const entry: PoolEntry = {
      context: ctx,
      accountId,
      inUse: true,
      createdAt: Date.now(),
      profileDir,
    };
    this.entries.set(accountId, entry);

    return {
      context: ctx,
      release: () => {
        entry.inUse = false;
      },
    };
  }

  async shutdown(): Promise<void> {
    for (const entry of this.entries.values()) {
      await entry.context.close().catch(() => {});
    }
    this.entries.clear();
  }

  /** Snapshot of pool state for /health diagnostics. Cheap, sync. */
  getStats(): { size: number; inUse: number } {
    let inUse = 0;
    for (const e of this.entries.values()) {
      if (e.inUse) inUse++;
    }
    return { size: this.entries.size, inUse };
  }
}

export const browserPool = new BrowserPool();
