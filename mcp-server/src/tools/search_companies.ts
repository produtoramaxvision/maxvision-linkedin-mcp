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

    // harvestapi/linkedin-company-search input schema (v0.13.3 fix):
    //   - searchQuery (NOT `keywords`) — primary text search; max 300 chars.
    //   - scraperMode: "short" | "full" — full enriches each result with
    //     description/employeeCount/followers/locations.
    //   - locations: string[] (LinkedIn location names)
    //   - industryIds: string[] (LinkedIn industry codes — names won't work)
    //   - companySize: string[] (range buckets like "501-1000")
    //   - maxItems / startPage / takePages
    const apifyInput: Record<string, unknown> = {
      searchQuery: input.keywords,
      scraperMode: 'full',
      maxItems: input.maxResults,
    };
    if (input.industry) apifyInput['industryIds'] = [input.industry];
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
    // Extract first industry from array-of-objects shape:
    //   industries: [{ id, name, urn, title, hierarchy }]
    const flattenIndustry = (v: unknown): string => {
      if (v == null) return '';
      if (typeof v === 'string') return v;
      if (Array.isArray(v) && v.length > 0) {
        const first = v[0] as Record<string, unknown>;
        return str(first['name'] ?? first['title']);
      }
      if (typeof v === 'object') {
        const o = v as Record<string, unknown>;
        return str(o['name'] ?? o['title']);
      }
      return String(v);
    };
    // Pick HQ from locations array if available, else first entry.
    const flattenLocations = (v: unknown): string => {
      if (Array.isArray(v) && v.length > 0) {
        const hq = (v as Array<Record<string, unknown>>).find((l) => l['headquarter']) ?? v[0];
        const parsed = (hq as Record<string, unknown>)['parsed'] as Record<string, unknown> | undefined;
        return str(parsed?.['text'] ?? hq['description'] ?? hq['city']);
      }
      return flattenLoc(v);
    };
    // Convert employeeCountRange { start, end } to "501-1000" bucket string.
    const flattenSize = (c: Record<string, unknown>): string => {
      const range = c['employeeCountRange'] as Record<string, unknown> | undefined;
      if (range && (range['start'] != null || range['end'] != null)) {
        const s = range['start'] ?? '?';
        const e = range['end'] ?? '?';
        return `${s}-${e}`;
      }
      return str(c['companySize'] ?? c['size'] ?? c['employeeCount'] ?? c['employeesCount']);
    };
    const companies = items.slice(0, input.maxResults).map((c) => ({
      url: str(c['linkedinUrl'] ?? c['url'] ?? c['companyUrl']),
      name: str(c['name'] ?? c['companyName'] ?? c['title']),
      industry: flattenIndustry(c['industries'] ?? c['industry'] ?? c['industryName']),
      location: flattenLocations(c['locations'] ?? c['location'] ?? c['headquarters'] ?? c['hq']),
      companySize: flattenSize(c),
      followers: num(c['followerCount'] ?? c['followers'] ?? c['followersCount']),
    })).filter((c) => c.url.length > 0);

    return { count: companies.length, companies };
  },
});
