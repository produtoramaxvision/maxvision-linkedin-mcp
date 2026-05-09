/**
 * tools/list_feed — Sprint 6.8 limitation note.
 *
 * KNOWN LIMITATION (validated empirically 2026-05-09):
 *
 * The LinkedIn home feed (`/feed/`) requires a logged-in session. Even when
 * we route via Patchright + BrightData Web Unlocker proxy + hydrated
 * cookies, LinkedIn's anti-fraud system rejects the session if the cookies
 * were captured on a different device/IP combination. Symptom: 200 → 302
 * redirect to `/uas/login`. Sandbox cookies expire in days; user-supplied
 * cookies require periodic refresh via the `/linkedin-cookie-refresh` skill.
 *
 * Until the cookie freshness pipeline is automated (Sprint 6.9), the only
 * reliable list_feed paths are:
 *   - User refreshes their cookie via /linkedin-cookie-refresh and the
 *     cookie remains valid (<24h typically before LinkedIn rotation).
 *   - Switch to "trending posts by keyword" semantics via Apify's
 *     curious_coder/linkedin-post-search-scraper actor (different feature
 *     scope; not strictly the user's timeline).
 *
 * For now: best-effort attempt via fetchAndParse + cheerio. Surface a
 * clear COOKIE_EXPIRED error if LinkedIn redirects to authwall, instructing
 * the operator to refresh the account cookie.
 */
import { withInstrumentation } from './_base.js';
import { ListFeedInputSchema, type ListFeedInput } from './schemas.js';
import { fetchAndParse } from '../browser/fetch-and-parse.js';
import { runApifyActor } from '../scrapers/apify-helper.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

const APIFY_POST_SEARCH_ACTOR = process.env['APIFY_LINKEDIN_POST_SEARCH_ACTOR'] ?? 'harvestapi~linkedin-post-search';

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

    // Path A — try cookie-based DOM scrape of the personal /feed timeline.
    // This is the only way to get a USER-SPECIFIC feed; Apify post-search
    // returns trending posts by keyword, not the user's curated timeline.
    let items: FeedItem[] = [];
    let cookieFailed = false;
    try {
      items = await runFeedScrape(accountId, input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      cookieFailed =
        msg.includes('ERR_HTTP_RESPONSE_CODE_FAILURE') ||
        msg.includes('uas/login') ||
        msg.includes('authwall') ||
        msg.includes('COOKIE_EXPIRED');
      if (!cookieFailed) throw err;
      logger.warn({ accountId }, 'list_feed cookie path failed — falling back to Apify post-search');
    }

    // Path B fallback — when cookie path fails, fetch trending posts via Apify
    // (different semantic: trending posts, not personal timeline). Operator
    // can disable this path by setting LIST_FEED_APIFY_FALLBACK=false to get
    // a hard COOKIE_EXPIRED error instead.
    if (cookieFailed) {
      const apifyFallback = process.env['LIST_FEED_APIFY_FALLBACK'] !== 'false';
      if (!apifyFallback || !process.env['APIFY_TOKEN']) {
        throw new AppError(
          'COOKIE_EXPIRED',
          `list_feed requires a freshly captured LinkedIn cookie for account "${accountId}". Run /linkedin-cookie-refresh and retry. (LinkedIn invalidated the existing session. Set LIST_FEED_APIFY_FALLBACK=true + APIFY_TOKEN to enable trending-post fallback.)`,
          { accountId },
        );
      }
      try {
        const apifyItems = await runApifyActor({
          actor: APIFY_POST_SEARCH_ACTOR,
          context: 'list_feed:apify-fallback',
          input: { keywords: 'linkedin', maxItems: input.maxResults, sortBy: 'date_posted' },
        });
        const str = (v: unknown): string => (v == null ? '' : String(v));
        items = apifyItems.slice(0, input.maxResults).map((p) => ({
          url: str(p['url'] ?? p['postUrl']),
          authorName: str(p['authorName'] ?? (p['author'] as Record<string, unknown> | undefined)?.['name']),
          authorHeadline: str(p['authorHeadline'] ?? (p['author'] as Record<string, unknown> | undefined)?.['headline']),
          text: str(p['text'] ?? p['content']).slice(0, 1500),
          postedAt: str(p['postedAt'] ?? p['date']),
        }));
        logger.info({ accountId, count: items.length }, 'list_feed via Apify post-search fallback ok');
      } catch (err) {
        throw new AppError(
          'COOKIE_EXPIRED',
          `list_feed cookie path AND Apify fallback failed. Refresh cookie via /linkedin-cookie-refresh. Apify error: ${err instanceof Error ? err.message : String(err)}`,
          { accountId },
        );
      }
    }
    return { count: items.length, items };
  },
});

async function runFeedScrape(accountId: string, input: ListFeedInput): Promise<FeedItem[]> {
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
    return items;
}
