/**
 * tools/search_people — Sprint 6.8 Apify-backed.
 *
 * LinkedIn `/search/results/people/` requires a logged-in session. Even via
 * residential proxy, the LinkedIn server redirects guest requests to
 * /uas/login. The cookies-based DOM scraping path is therefore unreliable
 * in production (sandbox cookies expire, get flagged, or the session is
 * invalidated by LinkedIn's anti-fraud system).
 *
 * Sprint 6.8 pivots to Apify `harvestapi/linkedin-profile-search` which
 * runs its own logged-in session pool internally and returns structured
 * JSON (no cookies required from us).
 *
 * Pricing (https://apify.com/harvestapi/linkedin-profile-search):
 *   - Short mode (this implementation): $0.10 per search page (≈25 results)
 *     ≈ $0.004 per profile in basic-result mode
 *   - Full mode: +$0.004/profile detailed extraction
 *   - Full+Email: +$0.01/profile email lookup
 *
 * The previous HTML-based fallback is preserved when APIFY_TOKEN is unset
 * so that operators without an Apify subscription still get the legacy
 * (broken in 2026) behavior — better to fail fast than silently misbehave.
 */
import { withInstrumentation } from './_base.js';
import { SearchPeopleInputSchema, type SearchPeopleInput } from './schemas.js';
import { fetchAndParse } from '../browser/fetch-and-parse.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

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

const ACTOR_KEYWORDS = process.env['APIFY_LINKEDIN_PEOPLE_SEARCH_ACTOR'] ?? 'harvestapi~linkedin-profile-search';
const ACTOR_BY_NAME = process.env['APIFY_LINKEDIN_PEOPLE_SEARCH_BY_NAME_ACTOR'] ?? 'harvestapi~linkedin-profile-search-by-name';
const ACTOR_KEYWORDS_SEARCH = process.env['APIFY_LINKEDIN_PEOPLE_KEYWORDS_SEARCH_ACTOR'] ?? 'harvestapi~linkedin-profile-keywords-search';

function selectActor(mode: 'keywords' | 'by-name' | 'keywords-search'): string {
  switch (mode) {
    case 'by-name': return ACTOR_BY_NAME;
    case 'keywords-search': return ACTOR_KEYWORDS_SEARCH;
    default: return ACTOR_KEYWORDS;
  }
}
const APIFY_RUN_ENDPOINT = 'https://api.apify.com/v2/acts';

function extractPublicIdFromUrl(url: string): string {
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return (m?.[1] ?? '').toLowerCase();
}

async function searchPeopleViaApify(args: {
  input: SearchPeopleInput;
  apifyToken: string;
}): Promise<PersonResult[]> {
  const { input, apifyToken } = args;
  const url =
    `${APIFY_RUN_ENDPOINT}/${encodeURIComponent(selectActor(input.mode))}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(apifyToken)}&format=json`;

  // harvestapi profile-search input field is `searchQuery` (NOT keywords/searches).
  const body: Record<string, unknown> = {
    searchQuery: input.keywords,
    maxItems: input.maxResults,
    profileScraperMode: 'Short',
  };
  if (input.company) body['currentCompanies'] = [input.company];
  if (input.location) body['locations'] = [input.location];

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new AppError(
      'EXTERNAL_API_FAIL',
      `Apify ${res.status} (${selectActor(input.mode)}): ${errBody.slice(0, 300)}`,
      { status: res.status, actor: selectActor(input.mode) },
    );
  }

  const items = (await res.json()) as Array<Record<string, unknown>>;
  return items.slice(0, input.maxResults).map((it) => {
    const profileUrl = String(it['linkedinUrl'] ?? it['profileUrl'] ?? it['url'] ?? '');
    const firstName = it['firstName'] != null ? String(it['firstName']) : '';
    const lastName = it['lastName'] != null ? String(it['lastName']) : '';
    const name = firstName || lastName
      ? `${firstName} ${lastName}`.trim()
      : String(it['name'] ?? it['fullName'] ?? '').trim();
    const cp = (it['currentPositions'] as Array<Record<string, unknown>> | undefined)?.[0];
    const headline = cp
      ? String(cp['position'] ?? cp['title'] ?? '')
      : String(it['headline'] ?? it['position'] ?? '');
    const locObj = it['location'] as Record<string, unknown> | undefined;
    const location = locObj
      ? String(locObj['linkedinText'] ?? locObj['city'] ?? '')
      : String(it['location'] ?? it['locationName'] ?? '');
    const currentCompany = cp
      ? String(cp['companyName'] ?? '')
      : String((it['currentCompany'] as Record<string, unknown> | undefined)?.['name'] ?? it['companyName'] ?? '');
    return {
      url: profileUrl,
      publicId: extractPublicIdFromUrl(profileUrl),
      name,
      headline,
      location,
      currentCompany,
    };
  }).filter((p) => p.url.length > 0);
}

function buildSearchUrl(input: SearchPeopleInput): string {
  const params = new URLSearchParams({ keywords: input.keywords });
  if (input.company) params.set('currentCompany', input.company);
  if (input.location) params.set('geoUrn', input.location);
  return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}

export const searchPeople = withInstrumentation<SearchPeopleInput, SearchPeopleOutput>({
  name: 'search_people',
  description: 'Search LinkedIn people by keywords, company, location. Powered by Apify (Pro/Agency).',
  inputSchema: SearchPeopleInputSchema,
  handler: async ({ input, accountId }) => {
    logger.info({ accountId, keywords: input.keywords }, 'search_people start');

    const apifyToken = process.env['APIFY_TOKEN'];
    if (apifyToken) {
      try {
        const people = await searchPeopleViaApify({ input, apifyToken });
        logger.info({ accountId, count: people.length, backend: 'apify' }, 'search_people via Apify ok');
        return { count: people.length, people };
      } catch (err) {
        logger.warn(
          { accountId, err: err instanceof Error ? err.message : String(err) },
          'Apify search_people failed — falling back to HTML scrape (likely 2026-broken)',
        );
        // fall through
      }
    }

    // Fallback path — almost certainly fails in 2026 because LinkedIn
    // requires a logged-in session for /search/results/people. Kept for
    // backward compat with operators who haven't configured APIFY_TOKEN.
    const url = buildSearchUrl(input);
    const people = await fetchAndParse<PersonResult[]>({
      accountId,
      url,
      context: 'search_people',
      requireSelectors: ['main, [role="main"]'],
      parse: ($) => {
        const out: PersonResult[] = [];
        $('li.reusable-search__result-container')
          .slice(0, input.maxResults)
          .each((_, el) => {
            const $el = $(el);
            const link = $el.find('a.app-aware-link[href*="/in/"]').first();
            const href = (link.attr('href') || '').split('?')[0] || '';
            if (!href) return;
            out.push({
              url: href.startsWith('http') ? href : `https://www.linkedin.com${href}`,
              publicId: extractPublicIdFromUrl(href),
              name: $el.find('span[aria-hidden="true"]').first().text().trim(),
              headline: $el.find('.entity-result__primary-subtitle').first().text().trim(),
              location: $el.find('.entity-result__secondary-subtitle').first().text().trim(),
              currentCompany: '',
            });
          });
        return out;
      },
    });
    logger.info({ accountId, count: people.length, backend: 'html' }, 'search_people via HTML ok');
    return { count: people.length, people };
  },
});
