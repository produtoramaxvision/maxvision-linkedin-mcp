/**
 * tools/search_people — Sprint 6.2 backend-aware.
 *
 * Routes through fetchAndParse() — Patchright (free, authwall) or Scrapfly/
 * BrightData (Pro/Agency, bypasses).
 */
import { withInstrumentation } from './_base.js';
import { SearchPeopleInputSchema, type SearchPeopleInput } from './schemas.js';
import { fetchAndParse } from '../browser/fetch-and-parse.js';
import { logger } from '../logger.js';

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
    const url = buildSearchUrl(input);
    logger.info({ accountId, keywords: input.keywords, url }, 'search_people start');

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
            const slugMatch = href.match(/\/in\/([^/]+)/);
            const publicId = (slugMatch?.[1] || '').toLowerCase();
            out.push({
              url: href.startsWith('http') ? href : `https://www.linkedin.com${href}`,
              publicId,
              name: $el.find('span[aria-hidden="true"]').first().text().trim(),
              headline: $el.find('.entity-result__primary-subtitle').first().text().trim(),
              location: $el.find('.entity-result__secondary-subtitle').first().text().trim(),
              currentCompany: '',
            });
          });
        return out;
      },
    });

    logger.info({ accountId, count: people.length }, 'search_people scrape ok');
    return { count: people.length, people };
  },
});
