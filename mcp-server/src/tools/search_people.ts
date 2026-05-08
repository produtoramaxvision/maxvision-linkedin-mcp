/**
 * tools/search_people — Sprint 2 people search.
 *
 * Navigates `/search/results/people/?keywords=...` and extracts profile cards.
 * Pro/Agency-only in Sprint 3 (license gating). Hits authwall server-side
 * commonly; surfaces COOKIE_EXPIRED when that happens.
 */
import { withInstrumentation } from './_base.js';
import { SearchPeopleInputSchema, type SearchPeopleInput } from './schemas.js';
import { browserPool } from '../browser/pool.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

/// <reference lib="dom" />

interface PersonResult {
  url: string;
  publicId: string;
  name: string;
  headline: string;
  location: string;
  currentCompany: string;
}

export interface SearchPeopleOutput {
  count: number;
  people: PersonResult[];
}

function buildSearchUrl(input: SearchPeopleInput): string {
  const params = new URLSearchParams({ keywords: input.keywords });
  if (input.company) params.set('currentCompany', input.company);
  if (input.location) params.set('geoUrn', input.location);
  return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}

export const searchPeople = withInstrumentation<SearchPeopleInput, SearchPeopleOutput>({
  name: 'search_people',
  description: 'Search LinkedIn people (Pro/Agency tier in Sprint 3).',
  inputSchema: SearchPeopleInputSchema,
  handler: async ({ input, accountId }) => {
    const { context, release } = await browserPool.acquire(accountId);
    try {
      const page = await context.newPage();
      const url = buildSearchUrl(input);
      logger.info({ accountId, keywords: input.keywords, url }, 'search_people nav start');

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      if (response?.status() === 999) {
        throw new AppError('CAPTCHA_DETECTED', 'LinkedIn 999 on /search/results/people');
      }
      if (page.url().includes('/authwall') || page.url().includes('/uas/login')) {
        throw new AppError('COOKIE_EXPIRED', `LinkedIn auth wall on people search`, {
          redirectedTo: page.url(),
        });
      }

      await page.waitForSelector('main, [role="main"]', {
        timeout: 30000,
        state: 'attached',
      });

      const people: PersonResult[] = await page.evaluate((max: number) => {
        const out: Array<PersonResult> = [];
        type PersonResult = {
          url: string;
          publicId: string;
          name: string;
          headline: string;
          location: string;
          currentCompany: string;
        };
        const cards = document.querySelectorAll('li.reusable-search__result-container');
        for (const card of Array.from(cards).slice(0, max)) {
          const link = card.querySelector(
            'a.app-aware-link[href*="/in/"]',
          ) as HTMLAnchorElement | null;
          if (!link) continue;
          const href = (link.href || '').split('?')[0] || '';
          const slugMatch = href.match(/\/in\/([^/]+)/);
          const publicId = (slugMatch?.[1] || '').toLowerCase();
          const name = (
            card.querySelector('span[aria-hidden="true"]')?.textContent || ''
          ).trim();
          const headline = (
            card.querySelector('.entity-result__primary-subtitle')?.textContent || ''
          ).trim();
          const location = (
            card.querySelector('.entity-result__secondary-subtitle')?.textContent || ''
          ).trim();
          out.push({
            url: href,
            publicId,
            name,
            headline,
            location,
            currentCompany: '',
          });
        }
        return out;
      }, input.maxResults);

      await page.close();
      logger.info({ accountId, count: people.length }, 'search_people scrape ok');
      return { count: people.length, people };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        'SCRAPER_FAIL',
        `search_people failed: ${(err as Error).message}`,
        { accountId },
        err,
      );
    } finally {
      release();
    }
  },
});
