/**
 * tools/get_account_owner — Sprint 1.5 whoami for hydrated cookies.
 *
 * Acquires the per-account Patchright context, navigates `/feed/`, and parses
 * the logged-in user's identity from the page DOM. Three extraction layers,
 * tried in order:
 *
 *   1. `<meta name="profile-shortlink">` — canonical /in/<slug> URL when
 *      LinkedIn renders it (rare on /feed/ but occasionally present).
 *   2. JSON-LD or embedded `<code id="bpr-guid-*">` blobs containing
 *      `miniProfile` records — most reliable on the authenticated feed.
 *   3. Profile sidebar avatar `<a href="/in/<slug>/">` near the rail nav
 *      that LinkedIn always renders for the logged-in user.
 *
 * Returns slug + display name + headline + accountId. Used by the
 * `/linkedin-status` flow and ops scripts that need to confirm WHICH
 * LinkedIn account is wired to a given pool entry without exposing raw
 * cookies.
 */
import { withInstrumentation } from './_base.js';
import { GetAccountOwnerInputSchema, type GetAccountOwnerInput } from './schemas.js';
import { browserPool } from '../browser/pool.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

export interface GetAccountOwnerOutput {
  accountId: string;
  slug: string;
  profileUrl: string;
  fullName: string;
  headline: string;
  source: 'me-redirect' | 'meta' | 'json-ld' | 'rail-nav';
}

interface OwnerScrape {
  slug: string;
  fullName: string;
  headline: string;
  source: 'meta' | 'json-ld' | 'rail-nav';
}

export const getAccountOwner = withInstrumentation<GetAccountOwnerInput, GetAccountOwnerOutput>({
  name: 'get_account_owner',
  description:
    "Identify the LinkedIn user whose cookies are stored in a given account pool entry. Navigates /feed/ via Patchright and extracts slug + name from the authenticated DOM.",
  inputSchema: GetAccountOwnerInputSchema,
  handler: async ({ input, accountId }) => {
    void input;
    const { context, release } = await browserPool.acquire(accountId);
    try {
      const page = await context.newPage();
      logger.info({ accountId }, 'get_account_owner nav /feed start');

      // v0.13.8: navigate /me with `domcontentloaded` (avoids LinkedIn
      // analytics-beacon hangs that block 'load'). Then in priority order:
      //   1. final URL slug (LinkedIn redirected to /in/<slug>/)
      //   2. <link rel="canonical"> href (rendered server-side)
      //   3. <meta property="og:url"> content
      //   4. <a class="global-nav__me-photo"> href (nav bar avatar)
      //   5. legacy /feed 3-layer scrape (last resort, expensive)
      const meResponse = await page.goto('https://www.linkedin.com/me/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      const meStatus = meResponse?.status() ?? 0;
      if (meStatus === 999) {
        throw new AppError('CAPTCHA_DETECTED', 'LinkedIn 999 on /me for whoami', { status: meStatus });
      }
      const finalMeUrl = page.url();
      if (
        finalMeUrl.includes('/authwall') ||
        finalMeUrl.includes('/uas/login') ||
        finalMeUrl.includes('/checkpoint')
      ) {
        throw new AppError('COOKIE_EXPIRED', `Auth wall on /me for ${accountId}`, {
          redirectedTo: finalMeUrl,
        });
      }

      // Layer 1 — final URL slug (LinkedIn followed /me redirect).
      let slug = finalMeUrl.match(/\/in\/([^/?#]+)/)?.[1] ?? '';

      // Layers 2-4 — DOM/meta extraction. Cheap; runs even when slug found
      // so we capture fullName + headline as enrichment.
      const dom = await page.evaluate((): {
        canonical: string;
        ogUrl: string;
        navPhoto: string;
        fullName: string;
        headline: string;
      } => {
        const canonical = (document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href ?? '';
        const ogUrl = (document.querySelector('meta[property="og:url"]') as HTMLMetaElement | null)?.content ?? '';
        const navPhoto = (document.querySelector('a.global-nav__me-photo, a[data-test-app-aware-link][href*="/in/"]') as HTMLAnchorElement | null)?.href ?? '';
        const titleEl = document.querySelector('h1.text-heading-xlarge, h1');
        const fullName = (titleEl?.textContent ?? '').trim();
        const headlineEl = document.querySelector('.text-body-medium, [data-test-id="hero-title"] + div');
        const headline = (headlineEl?.textContent ?? '').trim();
        return { canonical, ogUrl, navPhoto, fullName, headline };
      });

      if (!slug) slug = dom.canonical.match(/\/in\/([^/?#]+)/)?.[1] ?? '';
      if (!slug) slug = dom.ogUrl.match(/\/in\/([^/?#]+)/)?.[1] ?? '';
      if (!slug) slug = dom.navPhoto.match(/\/in\/([^/?#]+)/)?.[1] ?? '';

      if (slug) {
        await page.close();
        logger.info({ accountId, slug, source: 'me-redirect' }, 'get_account_owner ok');
        return {
          accountId,
          slug,
          profileUrl: `https://www.linkedin.com/in/${slug}/`,
          fullName: dom.fullName,
          headline: dom.headline,
          source: 'me-redirect',
        };
      }

      // Last resort — /feed 3-layer scrape. Use domcontentloaded (not 'load')
      // to avoid analytics-beacon hangs.
      logger.warn({ accountId, finalMeUrl, dom }, '/me did not yield slug via any layer, falling back to /feed');
      await page.goto('https://www.linkedin.com/feed/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      const owner = await page.evaluate((): OwnerScrape | null => {
        // Layer 1 — explicit meta tag (sometimes present).
        const meta = document.querySelector(
          'meta[name="profile-shortlink"], meta[property="profile:username"]',
        ) as HTMLMetaElement | null;
        if (meta?.content) {
          const m = meta.content.match(/\/in\/([^/?#]+)/) ?? [null, meta.content];
          if (m[1]) {
            const fullName = (
              document.querySelector(
                'a[href*="/in/' + m[1] + '"] img[alt], a[href*="/in/' + m[1] + '"]',
              ) as HTMLImageElement | HTMLAnchorElement | null
            )?.getAttribute('alt') ?? '';
            return { slug: m[1], fullName, headline: '', source: 'meta' };
          }
        }

        // Layer 2 — embedded JSON blobs. LinkedIn ships hydrated state in
        // <code id="bpr-guid-*"> elements containing the viewer's miniProfile.
        const codes = Array.from(document.querySelectorAll('code'));
        for (const c of codes) {
          const txt = c.textContent ?? '';
          if (!txt.includes('publicIdentifier') && !txt.includes('miniProfile')) continue;
          try {
            const json = JSON.parse(txt);
            const stack: unknown[] = [json];
            while (stack.length) {
              const node = stack.pop();
              if (!node || typeof node !== 'object') continue;
              const o = node as Record<string, unknown>;
              const slug = typeof o['publicIdentifier'] === 'string' ? o['publicIdentifier'] : '';
              const fn = typeof o['firstName'] === 'string' ? o['firstName'] : '';
              const ln = typeof o['lastName'] === 'string' ? o['lastName'] : '';
              const oc = typeof o['occupation'] === 'string' ? o['occupation'] : '';
              if (slug && (fn || ln)) {
                return {
                  slug,
                  fullName: `${fn} ${ln}`.trim(),
                  headline: oc,
                  source: 'json-ld',
                };
              }
              for (const v of Object.values(o)) {
                if (v && typeof v === 'object') stack.push(v);
              }
            }
          } catch {
            // skip non-JSON code blocks
          }
        }

        // Layer 3 — rail nav avatar link. Always rendered for logged-in user
        // in the left sidebar profile card.
        const railLink = document.querySelector(
          'a.app-aware-link[href*="/in/"][data-control-name*="identity"], ' +
            'aside a[href*="/in/"], ' +
            'a[href^="https://www.linkedin.com/in/"]',
        ) as HTMLAnchorElement | null;
        if (railLink?.href) {
          const m = railLink.href.match(/\/in\/([^/?#]+)/);
          if (m?.[1]) {
            const fullName =
              railLink.querySelector('img[alt]')?.getAttribute('alt') ??
              railLink.textContent?.trim() ??
              '';
            const headline =
              (
                document.querySelector(
                  '.profile-rail-card__actor-link-headline, .feed-identity-module__member-bg-image, h2.feed-identity-module__member-photo + p',
                )?.textContent ?? ''
              ).trim();
            return { slug: m[1], fullName, headline, source: 'rail-nav' };
          }
        }

        return null;
      });

      if (!owner) {
        throw new AppError(
          'SCRAPER_FAIL',
          'Could not extract owner identity from /feed DOM (LinkedIn layout may have changed)',
          { accountId, finalMeUrl, feedUrl: page.url() },
        );
      }

      await page.close();
      logger.info({ accountId, slug: owner.slug, source: owner.source }, 'get_account_owner ok');

      return {
        accountId,
        slug: owner.slug,
        profileUrl: `https://www.linkedin.com/in/${owner.slug}/`,
        fullName: owner.fullName,
        headline: owner.headline,
        source: owner.source,
      };
    } finally {
      release();
    }
  },
});
