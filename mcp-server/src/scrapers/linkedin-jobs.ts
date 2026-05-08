/**
 * LinkedIn job search scraper — Sprint 1.5 real Patchright nav.
 *
 * Acquires a per-account BrowserContext from `browserPool`, navigates to the
 * LinkedIn job-search URL, guards against captcha (HTTP 999) and authwall
 * redirects, and extracts cards via `page.evaluate`. Cookie hydration and
 * anti-detect init scripts already happen inside `createContextForAccount`.
 *
 * Selector caveat: LinkedIn DOM mutates frequently. We try several class
 * candidates per field. Sprint 1.5.1 will validate selectors against the
 * authenticated DOM via chrome-devtools-mcp + sandbox cookie.
 */
/// <reference lib="dom" />
import { browserPool } from '../browser/pool.js';
import { db } from '../db/client.js';
import { captchaEvents } from '../db/schema.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

export interface JobResult {
  url: string;
  title: string;
  company: string;
  location: string;
  postedAt: string; // ISO 8601
  description: string;
  easyApply: boolean;
  source: 'linkedin' | 'jobspy';
}

const LINKEDIN_JOBS_URL = (kw: string, loc?: string, easyApply = false): string => {
  const params = new URLSearchParams({ keywords: kw });
  if (loc) params.set('location', loc);
  if (easyApply) params.set('f_AL', 'true');
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
};

export async function searchLinkedInJobs(args: {
  accountId: string;
  keywords: string;
  location?: string;
  max?: number;
  easyApply?: boolean;
}): Promise<JobResult[]> {
  const { accountId, keywords, location, max = 25, easyApply = false } = args;
  const acquired = await browserPool.acquire(accountId);
  const { context, release } = acquired;

  try {
    const page = await context.newPage();
    const url = LINKEDIN_JOBS_URL(keywords, location, easyApply);

    logger.info({ accountId, keywords, location, url }, 'linkedin-jobs nav start');

    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Captcha / 999 / authwall detection
    const status = response?.status() ?? 0;
    if (status === 999) {
      await db
        .insert(captchaEvents)
        .values({ accountId, context: 'jobs_search', resolved: false })
        .catch(() => {});
      throw new AppError('CAPTCHA_DETECTED', `LinkedIn 999 status on jobs search`, { status, url });
    }
    if (
      page.url().includes('/authwall') ||
      page.url().includes('/login') ||
      page.url().includes('/checkpoint')
    ) {
      throw new AppError('COOKIE_EXPIRED', `LinkedIn auth wall — cookie invalid for ${accountId}`, {
        redirectedTo: page.url(),
      });
    }

    // TODO Sprint 1.5.1: validate selectors against authenticated DOM via chrome-devtools-mcp + sandbox cookie.
    // Best-known selectors as of 2025-2026 (LinkedIn DOM mudou várias vezes — fragile):
    //   .jobs-search-results-list  OR  ul.jobs-search__results-list  OR  [data-test-id="job-search-results-list"]
    // Job card: li.job-card-container OR li.scaffold-layout__list-item OR div.base-card
    await page.waitForSelector(
      'ul.jobs-search__results-list, ul.scaffold-layout__list-container, [data-test-id="job-search-results-list"]',
      { timeout: 15000 },
    );

    const jobs: JobResult[] = await page.evaluate((maxN: number) => {
      const out: Array<{
        url: string;
        title: string;
        company: string;
        location: string;
        postedAt: string;
        description: string;
        easyApply: boolean;
        source: 'linkedin';
      }> = [];
      const cards = document.querySelectorAll(
        'li.scaffold-layout__list-item, li.job-card-container, div.base-card',
      );
      for (const card of Array.from(cards).slice(0, maxN)) {
        const link = card.querySelector(
          'a.base-card__full-link, a.job-card-list__title, a[href*="/jobs/view/"]',
        ) as HTMLAnchorElement | null;
        if (!link) continue;
        const href = link.href.split('?')[0] ?? '';
        const title = (
          card.querySelector(
            '.base-search-card__title, h3.base-search-card__title, .job-card-list__title',
          )?.textContent || ''
        ).trim();
        const company = (
          card.querySelector(
            '.base-search-card__subtitle, h4.base-search-card__subtitle, .job-card-container__company-name',
          )?.textContent || ''
        ).trim();
        const locText = (
          card.querySelector(
            '.job-search-card__location, .job-card-container__metadata-item',
          )?.textContent || ''
        ).trim();
        const postedEl = card.querySelector('time, .job-search-card__listdate');
        const postedAt = postedEl?.getAttribute('datetime') || new Date().toISOString();
        const easyApplyMark = !!card.querySelector(
          '[aria-label*="Easy Apply"i], li-icon[type="easy-apply"]',
        );
        out.push({
          url: href,
          title,
          company,
          location: locText,
          postedAt,
          description: '',
          easyApply: easyApplyMark,
          source: 'linkedin',
        });
      }
      return out;
    }, max);

    await page.close();
    logger.info({ accountId, count: jobs.length }, 'linkedin-jobs scrape ok');
    return jobs;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'SCRAPER_FAIL',
      `linkedin-jobs scraper failed: ${(err as Error).message}`,
      { keywords },
      err,
    );
  } finally {
    release();
  }
}
