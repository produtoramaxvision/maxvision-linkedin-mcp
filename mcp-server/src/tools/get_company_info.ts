/**
 * tools/get_company_info — Sprint 7 Apify-backed.
 *
 * Wraps `harvestapi/linkedin-company-info` (default; override via
 * APIFY_LINKEDIN_COMPANY_INFO_ACTOR). Returns 30+ structured fields
 * including employee_count, industry, specialties, headquarters,
 * founded year, website, follower_count.
 */
import { withInstrumentation } from './_base.js';
import { GetCompanyInfoInputSchema, type GetCompanyInfoInput } from './schemas.js';
import { runApifyActor } from '../scrapers/apify-helper.js';
import { logger } from '../logger.js';

const ACTOR = process.env['APIFY_LINKEDIN_COMPANY_INFO_ACTOR'] ?? 'harvestapi~linkedin-company';

export interface CompanyInfo {
  url: string;
  name: string;
  description: string;
  industry: string;
  companySize: string;
  headquarters: string;
  founded: string;
  website: string;
  followers: number;
  employeeCount: number;
  specialties: string[];
  raw: Record<string, unknown>;
}

export interface GetCompanyInfoOutput {
  cached: false;
  company: CompanyInfo;
}

export const getCompanyInfo = withInstrumentation<GetCompanyInfoInput, GetCompanyInfoOutput>({
  name: 'get_company_info',
  description: 'Fetch detailed LinkedIn company info (size, industry, specialties, HQ).',
  inputSchema: GetCompanyInfoInputSchema,
  handler: async ({ input, accountId }) => {
    logger.info({ accountId, companyUrl: input.companyUrl }, 'get_company_info start');

    const items = await runApifyActor({
      actor: ACTOR,
      context: 'get_company_info',
      input: { companyUrls: [input.companyUrl], maxItems: 1 },
    });
    const r = items[0];
    if (!r) {
      throw new Error(`Apify returned empty payload for ${input.companyUrl}`);
    }

    const str = (v: unknown): string => (v == null ? '' : String(v));
    const company: CompanyInfo = {
      url: str(r['url'] ?? input.companyUrl),
      name: str(r['name'] ?? r['companyName']),
      description: str(r['description'] ?? r['about']),
      industry: str(r['industry']),
      companySize: str(r['companySize'] ?? r['size']),
      headquarters: str(r['headquarters'] ?? r['hq']),
      founded: str(r['founded'] ?? r['foundedYear']),
      website: str(r['website']),
      followers: typeof r['followers'] === 'number' ? r['followers'] : 0,
      employeeCount: typeof r['employeeCount'] === 'number' ? r['employeeCount'] : (typeof r['employees'] === 'number' ? r['employees'] as number : 0),
      specialties: Array.isArray(r['specialties']) ? (r['specialties'] as unknown[]).map((s) => str(s)) : [],
      raw: r,
    };
    return { cached: false, company };
  },
});
