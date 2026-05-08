/**
 * tools/list_feed — Sprint 6.2 backend-aware.
 *
 * Routes through fetchAndParse() — Patchright (free, blocked by authwall) or
 * Scrapfly/BrightData (Pro/Agency, bypasses authwall).
 */
import { withInstrumentation } from './_base.js';
import { ListFeedInputSchema, type ListFeedInput } from './schemas.js';
import { fetchAndParse } from '../browser/fetch-and-parse.js';
import { logger } from '../logger.js';

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
    logger.info({ accountId, max: input.maxResults }, 'list_feed start');

    const items = await fetchAndParse<FeedItem[]>({
      accountId,
      url: FEED_URL,
      context: 'feed',
      requireSelectors: ['main, [role="main"]'],
      parse: ($) => {
        const out: FeedItem[] = [];
        $('[data-urn^="urn:li:activity:"]')
          .slice(0, input.maxResults)
          .each((_, el) => {
            const $el = $(el);
            const urn = $el.attr('data-urn') || '';
            const activityId = urn.split(':').pop() || '';
            const url = activityId
              ? `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}`
              : '';
            const authorName = (
              $el.find('.update-components-actor__name span[dir="ltr"]').first().text() ||
              $el.find('.feed-shared-actor__name').first().text()
            ).trim();
            const authorHeadline = (
              $el.find('.update-components-actor__description').first().text() ||
              $el.find('.feed-shared-actor__description').first().text()
            ).trim();
            const text = (
              $el.find('.feed-shared-update-v2__description').first().text() ||
              $el.find('.update-components-text').first().text() ||
              ''
            )
              .trim()
              .slice(0, 1500);
            const postedAt =
              $el.find('time').first().attr('datetime') || new Date().toISOString();
            if (authorName || text) {
              out.push({ url, authorName, authorHeadline, text, postedAt });
            }
          });
        return out;
      },
    });

    logger.info({ accountId, count: items.length }, 'list_feed scrape ok');
    return { count: items.length, items };
  },
});
