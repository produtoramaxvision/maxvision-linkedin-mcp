/**
 * tools/list_feed — Sprint 2 read-only feed scraper.
 *
 * Navigates the user's LinkedIn home feed and extracts recent activity items
 * (posts, articles, reactions). Patchright with hydrated cookies; surfaces a
 * COOKIE_EXPIRED error if LinkedIn redirects to /authwall (common server-
 * side because LinkedIn protects authenticated pages aggressively).
 */
import { withInstrumentation } from './_base.js';
import { ListFeedInputSchema, type ListFeedInput } from './schemas.js';
import { browserPool } from '../browser/pool.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

/// <reference lib="dom" />

interface FeedItem {
  url: string;
  authorName: string;
  authorHeadline: string;
  text: string;
  postedAt: string;
}

export interface ListFeedOutput {
  count: number;
  items: FeedItem[];
}

const FEED_URL = 'https://www.linkedin.com/feed/';

export const listFeed = withInstrumentation<ListFeedInput, ListFeedOutput>({
  name: 'list_feed',
  description: 'Read recent items from the LinkedIn home feed (Sprint 2).',
  inputSchema: ListFeedInputSchema,
  handler: async ({ input, accountId }) => {
    const { context, release } = await browserPool.acquire(accountId);
    try {
      const page = await context.newPage();
      logger.info({ accountId, max: input.maxResults }, 'list_feed nav start');

      const response = await page.goto(FEED_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      if (response?.status() === 999) {
        throw new AppError('CAPTCHA_DETECTED', 'LinkedIn 999 on /feed');
      }
      if (page.url().includes('/authwall') || page.url().includes('/uas/login')) {
        throw new AppError('COOKIE_EXPIRED', `LinkedIn auth wall on /feed`, {
          redirectedTo: page.url(),
        });
      }

      await page.waitForSelector('main, [role="main"]', {
        timeout: 30000,
        state: 'attached',
      });

      const items: FeedItem[] = await page.evaluate((max: number) => {
        const out: Array<{
          url: string;
          authorName: string;
          authorHeadline: string;
          text: string;
          postedAt: string;
        }> = [];
        const cards = document.querySelectorAll('[data-urn^="urn:li:activity:"]');
        for (const card of Array.from(cards).slice(0, max)) {
          const urn = card.getAttribute('data-urn') || '';
          const activityId = urn.split(':').pop() || '';
          const url = activityId
            ? `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}`
            : '';
          const authorName = (
            card.querySelector('.update-components-actor__name span[dir="ltr"]')
              ?.textContent ||
            card.querySelector('.feed-shared-actor__name')?.textContent ||
            ''
          ).trim();
          const authorHeadline = (
            card.querySelector('.update-components-actor__description')?.textContent ||
            card.querySelector('.feed-shared-actor__description')?.textContent ||
            ''
          ).trim();
          const text = (
            card.querySelector('.feed-shared-update-v2__description')?.textContent ||
            card.querySelector('.update-components-text')?.textContent ||
            ''
          )
            .trim()
            .slice(0, 1500);
          const postedAt =
            card.querySelector('time')?.getAttribute('datetime') ||
            new Date().toISOString();
          if (authorName || text) {
            out.push({ url, authorName, authorHeadline, text, postedAt });
          }
        }
        return out;
      }, input.maxResults);

      await page.close();
      logger.info({ accountId, count: items.length }, 'list_feed scrape ok');
      return { count: items.length, items };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        'SCRAPER_FAIL',
        `list_feed failed: ${(err as Error).message}`,
        { accountId },
        err,
      );
    } finally {
      release();
    }
  },
});
