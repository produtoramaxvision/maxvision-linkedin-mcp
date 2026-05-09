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
    // harvestapi actors return mixed shapes across versions:
    //   - location/headquarters can be a string OR { city, country, linkedinText }
    //   - employee counts surface as `employeeCount`, `employeesCount`, `companySize`, `size`
    //   - follower counts surface as `followerCount`, `followers`, `followersCount`
    const flattenLoc = (v: unknown): string => {
      if (v == null) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'object') {
        const o = v as Record<string, unknown>;
        return str(o['linkedinText'] ?? o['city'] ?? o['country'] ?? o['name']);
      }
      return String(v);
    };
    const num = (v: unknown): number => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        const n = Number(v.replace(/[^\d.-]/g, ''));
        return Number.isFinite(n) ? n : 0;
      }
      return 0;
    };
    const companies = items.slice(0, input.maxResults).map((c) => ({
      url: str(c['url'] ?? c['linkedinUrl'] ?? c['companyUrl']),
      name: str(c['name'] ?? c['companyName'] ?? c['title']),
      industry: str(c['industry'] ?? c['industryName'] ?? c['industries']),
      location: flattenLoc(c['location'] ?? c['headquarters'] ?? c['hq']),
      companySize: str(c['companySize'] ?? c['size'] ?? c['employeeCount'] ?? c['employeesCount']),
      followers: num(c['followers'] ?? c['followerCount'] ?? c['followersCount']),
    })).filter((c) => c.url.length > 0);

    return { count: companies.length, companies };
  },
});
