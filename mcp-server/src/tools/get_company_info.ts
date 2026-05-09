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

    // harvestapi~linkedin-company input field is `companies` (array of URLs).
    const items = await runApifyActor({
      actor: ACTOR,
      context: 'get_company_info',
      input: { companies: [input.companyUrl] },
    });
    const r = items[0];
    if (!r) {
      throw new Error(`Apify returned empty payload for ${input.companyUrl}`);
    }

    const str = (v: unknown): string => (v == null ? '' : String(v));
    // Locations is array; pick the headquarter entry, fall back to first.
    const locations = (r['locations'] as Array<Record<string, unknown>> | undefined) ?? [];
    const hq = locations.find((l) => l['headquarter'] === true) ?? locations[0];
    const hqText = hq
      ? (typeof hq['parsed'] === 'object' && hq['parsed'] != null
          ? str((hq['parsed'] as Record<string, unknown>)['text'])
          : `${str(hq['city'])} ${str(hq['country'])}`.trim())
      : '';
    // foundedOn is {month, year, day} object
    const foundedRaw = r['foundedOn'];
    const founded = foundedRaw && typeof foundedRaw === 'object'
      ? str((foundedRaw as Record<string, unknown>)['year'])
      : str(r['founded'] ?? r['foundedYear']);
    // employeeCountRange is {start, end} object — derive size string
    const ecr = r['employeeCountRange'] as Record<string, unknown> | undefined;
    const companySize = ecr ? `${str(ecr['start'])}-${str(ecr['end'])}` : str(r['companySize']);
    // industries array; flatten to comma-separated string
    const industries = (r['industries'] as Array<Record<string, unknown> | string> | undefined) ?? [];
    const industry = industries.length > 0
      ? industries.map((i) => typeof i === 'string' ? i : str((i as Record<string, unknown>)['name'])).join(', ')
      : str(r['industry']);

    const company: CompanyInfo = {
      url: str(r['linkedinUrl'] ?? input.companyUrl),
      name: str(r['name']),
      description: str(r['description'] ?? r['tagline']),
      industry,
      companySize,
      headquarters: hqText,
      founded,
      website: str(r['website']),
      followers: typeof r['followerCount'] === 'number' ? (r['followerCount'] as number) : 0,
      employeeCount: typeof r['employeeCount'] === 'number' ? (r['employeeCount'] as number) : 0,
      specialties: Array.isArray(r['specialties']) ? (r['specialties'] as unknown[]).map((s) => str(s)) : [],
      raw: r,
    };
    return { cached: false, company };
  },
});
