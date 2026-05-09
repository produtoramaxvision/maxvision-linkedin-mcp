/**
 * BrowserPool — per-account Patchright `launchPersistentContext` (Sprint 1.5.3)
 * with optional BrightData Scraping Browser routing (Sprint 6.6).
 *
 * Two modes selected via SCRAPING_BACKEND env:
 *
 *   `patchright` (default, free):
 *     - chromium.launchPersistentContext(profileDir, launchOptions)
 *     - Local Chromium on the VPS, xvfb-run wrapper, persistent profile dir.
 *     - Datacenter ASN — blocked by LinkedIn authwall on protected pages.
 *
 *   `brightdata` (Pro/Agency):
 *     - chromium.connectOverCDP(BRIGHTDATA_PROXY_URL)
 *     - Remote Chromium hosted by BrightData, accessed via wss CDP.
 *     - Residential IP + automatic CAPTCHA solver + fingerprint rotation.
 *     - Cookie hydration via context.addCookies (same downstream API).
 *     - Pricing: ~$10/GB transferred ≈ ~$2 / 1k profile fetches.
 *
 * The pool keeps one open context per accountId, recycled if older than
 * `maxAgeMs` (cookie/state drift cap). For Patchright, each accountId
 * launches its own Chromium process — heavy but necessary for fingerprint
 * isolation. For BrightData, each accountId uses a fresh remote browser
 * instance — same isolation guarantee but no local CPU/memory.
 *
 * Profile directory used in patchright mode: `${PROFILE_BASE_DIR}/<accountId>/`.
 * Mounted as Docker volume on /data/profiles. In brightdata mode the profile
 * dir is unused (remote browser has its own state).
 *
 * NOT thread-safe across processes; designed for the single Node process model.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Browser } from 'patchright';
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
  profileDir?: string;
  remoteBrowser?: Browser;
}

const PROFILE_BASE_DIR = process.env['PROFILE_BASE_DIR'] ?? '/data/profiles';

function isBrightDataMode(): boolean {
  return (
    process.env['SCRAPING_BACKEND']?.toLowerCase() === 'brightdata' &&
    !!process.env['BRIGHTDATA_PROXY_URL']
  );
}

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
      if (existing.remoteBrowser) {
        await existing.remoteBrowser.close().catch(() => {});
      }
      this.entries.delete(accountId);
    }

    const account = await getAccountById(accountId);
    if (!account) throw new AppError('UNKNOWN', `Account not found: ${accountId}`);

    let entry: PoolEntry;

    if (isBrightDataMode()) {
      // BrightData Scraping Browser path — connect to remote Chromium via
      // wss CDP. Residential IP + auto CAPTCHA + fingerprint rotation.
      //
      // KNOWN LIMITATION: BrightData's generic Scraping Browser ENFORCES a
      // hard policy blocking `li_at`/`bcookie`/`lidc` cookie injection via
      // `Storage.setCookies` AND via `Page.navigate` Cookie header. Validated
      // empirically (Sprint 6.6 diagnostic) — newContext() + clearCookies()
      // do NOT bypass it. This path therefore only works for guest endpoints
      // (`/jobs/search`, `/jobs/view/<id>`, public company pages).
      //
      // For authenticated endpoints (`/in/<slug>`, `/feed`,
      // `/search/results/people`) use SCRAPING_BACKEND=patchright +
      // PATCHRIGHT_PROXY_URL pointing to a BrightData Residential Proxy zone
      // (port 22225 HTTP, NOT port 9222 wss Scraping Browser zone). That gives
      // residential IP + full local cookie control via Patchright.
      const wsEndpoint = process.env['BRIGHTDATA_PROXY_URL']!;
      logger.info({ accountId, endpoint: 'brightdata' }, 'connecting BrightData CDP');
      const remoteBrowser = await chromium.connectOverCDP(wsEndpoint);
      const ctx = remoteBrowser.contexts()[0] ?? (await remoteBrowser.newContext());
      await hydrateLinkedInCookie(ctx, accountId, account.cookieEncrypted);

      entry = {
        context: ctx,
        accountId,
        inUse: true,
        createdAt: Date.now(),
        remoteBrowser,
      };
    } else {
      // Patchright local path (Free tier default). Local Chromium, persistent
      // profile dir, xvfb-run wrapper at the container ENTRYPOINT.
      const profileDir = await this.profileDirFor(accountId);
      logger.info({ accountId, profileDir }, 'launching persistent context');
      const ctx = await chromium.launchPersistentContext(profileDir, launchOptions);
      await hydrateLinkedInCookie(ctx, accountId, account.cookieEncrypted);

      entry = {
        context: ctx,
        accountId,
        inUse: true,
        createdAt: Date.now(),
        profileDir,
      };
    }

    this.entries.set(accountId, entry);

    return {
      context: entry.context,
      release: () => {
        entry.inUse = false;
      },
    };
  }

  async shutdown(): Promise<void> {
    for (const entry of this.entries.values()) {
      await entry.context.close().catch(() => {});
      if (entry.remoteBrowser) {
        await entry.remoteBrowser.close().catch(() => {});
      }
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
