/**
 * tools/search_companies — Sprint 7 Apify-backed.
 *
 * Wraps `harvestapi/linkedin-company-search` for B2B target-account discovery.
 * Returns up to N companies matching keywords + filters (industry, location,
 * company size).
 */
import { withInstrumentation } from './_base.js';
import { SearchCompaniesInputSchema, type SearchCompaniesInput } from './schemas.js';
import { runApifyActor } from '../scrapers/apify-helper.js';
import { logger } from '../logger.js';

const ACTOR = process.env['APIFY_LINKEDIN_COMPANY_SEARCH_ACTOR'] ?? 'harvestapi~linkedin-company-search';

interface CompanyResult {
  url: string;
  name: string;
  industry: string;
  location: string;
  companySize: string;
  followers: number;
}

export interface SearchCompaniesOutput {
  count: number;
  companies: CompanyResult[];
}

export const searchCompanies = withInstrumentation<SearchCompaniesInput, SearchCompaniesOutput>({
  name: 'search_companies',
  description: 'Search LinkedIn companies by keywords, industry, location, size.',
  inputSchema: SearchCompaniesInputSchema,
  handler: async ({ input, accountId }) => {
    logger.info({ accountId, keywords: input.keywords }, 'search_companies start');

    const apifyInput: Record<string, unknown> = {
      keywords: input.keywords,
      maxItems: input.maxResults,
    };
    if (input.industry) apifyInput['industries'] = [input.industry];
    if (input.location) apifyInput['locations'] = [input.location];
    if (input.companySize) apifyInput['companySize'] = [input.companySize];

    const items = await runApifyActor({ actor: ACTOR, context: 'search_companies', input: apifyInput });

    const str = (v: unknown): string => (v == null ? '' : String(v));
    const companies = items.slice(0, input.maxResults).map((c) => ({
      url: str(c['url'] ?? c['linkedinUrl']),
      name: str(c['name'] ?? c['companyName']),
      industry: str(c['industry']),
      location: str(c['location'] ?? c['headquarters']),
      companySize: str(c['companySize'] ?? c['size']),
      followers: typeof c['followers'] === 'number' ? c['followers'] : 0,
    })).filter((c) => c.url.length > 0);

    return { count: companies.length, companies };
  },
});
