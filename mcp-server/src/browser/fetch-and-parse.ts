/**
 * fetch-and-parse — Sprint 6.2 unified scraping entrypoint.
 *
 * Wraps the scraping-backend abstraction so each tool only needs to express
 * "fetch URL X with cookies, then parse with cheerio".
 *
 * Path A (SCRAPING_BACKEND=scrapfly|brightdata): scrape() returns rendered
 * HTML; we parse with cheerio. Bypasses LinkedIn authwall on /in/<slug>,
 * /feed, /search/results/people because the scraping provider supplies
 * residential IP + JA3 spoof + fingerprint randomization.
 *
 * Path B (default `patchright`): scrape() returns null. Caller falls back
 * to the existing browserPool flow (Patchright launchPersistentContext +
 * page.goto + page.evaluate). Free tier; works only on guest endpoints.
 *
 * Both paths apply the per-account decrypted cookies. Caller passes a
 * pure-function `parse: ($) => T` that receives a cheerio root.
 */
import * as cheerio from 'cheerio';
import { scrape, resolveScrapingBackend, type ScrapeResult } from './scraping-backend.js';
import { browserPool } from './pool.js';
import { getAccountById } from '../db/repos/accounts.repo.js';
import { decryptCookie } from '../auth/cookies.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

interface CookiePayload {
  name: string;
  value: string;
  domain: string;
}

function loadAccountCookies(accountId: string): Promise<CookiePayload[]> {
  return getAccountById(accountId).then((account) => {
    if (!account) throw new AppError('UNKNOWN', `Account not found: ${accountId}`);
    const plain = decryptCookie(account.cookieEncrypted).trim();
    if (plain.startsWith('[')) {
      try {
        return JSON.parse(plain) as CookiePayload[];
      } catch {
        // fall through
      }
    }
    return [{ name: 'li_at', value: plain, domain: '.linkedin.com' }];
  });
}

export interface FetchAndParseArgs<T> {
  accountId: string;
  url: string;
  parse: (root: cheerio.CheerioAPI, html: string) => T;
  /** Selectors that MUST be present for the page to be considered successfully
   *  rendered. If missing, treat as authwall and surface COOKIE_EXPIRED. */
  requireSelectors?: string[];
  /** Patchright timeout for browserPool fallback. Default 30s. */
  patchrightTimeoutMs?: number;
  countryCode?: string;
  acceptLanguage?: string;
  /** Domain context for log entries (jobs, profile, feed). */
  context: string;
}

export async function fetchAndParse<T>(args: FetchAndParseArgs<T>): Promise<T> {
  const cfg = resolveScrapingBackend();
  const cookies = await loadAccountCookies(args.accountId);

  // Path A — proxied backend (Scrapfly/BrightData).
  if (cfg.backend !== 'patchright') {
    logger.info(
      { accountId: args.accountId, url: args.url, backend: cfg.backend, context: args.context },
      'fetchAndParse via proxied backend',
    );
    const result = (await scrape({
      url: args.url,
      cookies,
      countryCode: args.countryCode,
      acceptLanguage: args.acceptLanguage,
    })) as ScrapeResult;

    const finalUrl = result.finalUrl;
    if (
      finalUrl.includes('/authwall') ||
      finalUrl.includes('/uas/login') ||
      finalUrl.includes('/checkpoint')
    ) {
      throw new AppError(
        'COOKIE_EXPIRED',
        `Auth wall via ${cfg.backend}: ${finalUrl}`,
        { backend: cfg.backend, finalUrl },
      );
    }
    if (result.status >= 400) {
      throw new AppError(
        'SCRAPER_FAIL',
        `${cfg.backend} ${result.status} on ${args.url}`,
        { status: result.status },
      );
    }
    const $ = cheerio.load(result.html);
    if (args.requireSelectors) {
      const missing = args.requireSelectors.filter((s) => $(s).length === 0);
      if (missing.length === args.requireSelectors.length) {
        throw new AppError(
          'SCRAPER_FAIL',
          `${cfg.backend} returned page without expected selectors`,
          { missing, url: args.url, finalUrl },
        );
      }
    }
    return args.parse($, result.html);
  }

  // Path B — Patchright (Free tier default).
  const { context: ctx, release } = await browserPool.acquire(args.accountId);
  try {
    const page = await ctx.newPage();
    logger.info(
      { accountId: args.accountId, url: args.url, backend: 'patchright', context: args.context },
      'fetchAndParse via patchright',
    );
    const response = await page.goto(args.url, {
      waitUntil: 'domcontentloaded',
      timeout: args.patchrightTimeoutMs ?? 30000,
    });
    if (response?.status() === 999) {
      throw new AppError('CAPTCHA_DETECTED', `LinkedIn 999 on ${args.url}`);
    }
    if (
      page.url().includes('/authwall') ||
      page.url().includes('/uas/login') ||
      page.url().includes('/checkpoint')
    ) {
      throw new AppError('COOKIE_EXPIRED', `Auth wall on ${args.url}`, {
        finalUrl: page.url(),
      });
    }
    if (args.requireSelectors && args.requireSelectors.length > 0) {
      await page.waitForSelector(args.requireSelectors.join(', '), {
        timeout: 30000,
        state: 'attached',
      });
    }
    const html = await page.content();
    await page.close();
    const $ = cheerio.load(html);
    return args.parse($, html);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'SCRAPER_FAIL',
      `fetchAndParse patchright failed: ${(err as Error).message}`,
      { url: args.url },
      err,
    );
  } finally {
    release();
  }
}
