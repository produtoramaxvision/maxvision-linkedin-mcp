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
    //
    // Any failure on Path A (no account row, expired cookie, authwall redirect,
    // network error) triggers Path B fallback when APIFY_TOKEN+
    // LIST_FEED_APIFY_FALLBACK are configured. Operators who want strict
    // cookie-only semantics set LIST_FEED_APIFY_FALLBACK=false.
    let items: FeedItem[] = [];
    let cookieFailed = false;
    let cookieFailReason = '';
    try {
      items = await runFeedScrape(accountId, input);
    } catch (err) {
      cookieFailed = true;
      cookieFailReason = err instanceof Error ? err.message : String(err);
      logger.warn({ accountId, reason: cookieFailReason }, 'list_feed cookie path failed — trying Apify post-search fallback');
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
          `list_feed cookie path failed for account "${accountId}" (${cookieFailReason}). Run /linkedin-cookie-refresh and retry, or set LIST_FEED_APIFY_FALLBACK=true + APIFY_TOKEN to enable trending-post fallback.`,
          { accountId, reason: cookieFailReason },
        );
      }
      try {
        // harvestapi/linkedin-post-search schema (validated 2026-05-09):
        //   searchQueries: string[]   (NOT keywords)
        //   maxPosts:      integer    (NOT maxItems)
        //   sortBy:        "relevance" | "date"  (NOT "date_posted")
        const fallbackQuery = process.env['LIST_FEED_APIFY_QUERY'] ?? 'linkedin';
        const apifyItems = await runApifyActor({
          actor: APIFY_POST_SEARCH_ACTOR,
          context: 'list_feed:apify-fallback',
          input: {
            searchQueries: [fallbackQuery],
            maxPosts: input.maxResults,
            sortBy: 'date',
            profileScraperMode: 'short',
          },
        });
        const str = (v: unknown): string => (v == null ? '' : String(v));
        const dateStr = (v: unknown): string => {
          if (v == null) return '';
          if (typeof v === 'string') return v;
          if (typeof v === 'object') {
            const o = v as Record<string, unknown>;
            if (typeof o['date'] === 'string') return o['date'];
            if (typeof o['text'] === 'string') return o['text'];
          }
          return String(v);
        };
        // post-search shape: { id, linkedinUrl, content, author: {name, info, type},
        //                      postedAt: {date, timestamp, postedAgoShort} }
        items = apifyItems.slice(0, input.maxResults).map((p) => {
          const a = (p['author'] as Record<string, unknown> | undefined) ?? {};
          return {
            url: str(p['linkedinUrl'] ?? p['url'] ?? p['postUrl']),
            authorName: str(a['name'] ?? p['authorName']),
            authorHeadline: str(a['info'] ?? a['headline'] ?? p['authorHeadline']),
            text: str(p['content'] ?? p['text']).slice(0, 1500),
            postedAt: dateStr(p['postedAt'] ?? p['date']),
          };
        }).filter((it) => it.url.length > 0 || it.text.length > 0);
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
