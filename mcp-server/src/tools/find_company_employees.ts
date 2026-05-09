/**
 * tools/find_company_employees — Sprint 7 Apify-backed.
 *
 * Wraps `harvestapi/linkedin-company-employees` for talent mapping. Returns
 * employees of a target company with optional title/location filters.
 */
import { withInstrumentation } from './_base.js';
import { FindCompanyEmployeesInputSchema, type FindCompanyEmployeesInput } from './schemas.js';
import { runApifyActor } from '../scrapers/apify-helper.js';
import { logger } from '../logger.js';

// harvestapi catalog has no dedicated `linkedin-company-employees` actor —
// instead we use `linkedin-profile-search` with `currentCompanies` filter,
// which returns profiles employed at the target company.
const ACTOR = process.env['APIFY_LINKEDIN_COMPANY_EMPLOYEES_ACTOR'] ?? 'harvestapi~linkedin-profile-search';

interface EmployeeResult {
  url: string;
  publicId: string;
  name: string;
  title: string;
  location: string;
}

export interface FindCompanyEmployeesOutput {
  count: number;
  companyUrl: string;
  employees: EmployeeResult[];
}

export const findCompanyEmployees = withInstrumentation<FindCompanyEmployeesInput, FindCompanyEmployeesOutput>({
  name: 'find_company_employees',
  description: 'List LinkedIn employees of a company with optional title/location filters.',
  inputSchema: FindCompanyEmployeesInputSchema,
  handler: async ({ input, accountId }) => {
    logger.info({ accountId, companyUrl: input.companyUrl }, 'find_company_employees start');

    // linkedin-profile-search input: currentCompanies (URL array) + optional
    // jobTitle keyword and location filter.
    const apifyInput: Record<string, unknown> = {
      currentCompanies: [input.companyUrl],
      maxItems: input.maxResults,
      profileScraperMode: 'short',
    };
    if (input.jobTitle) apifyInput['keywords'] = input.jobTitle;
    if (input.location) apifyInput['locations'] = [input.location];

    const items = await runApifyActor({ actor: ACTOR, context: 'find_company_employees', input: apifyInput });

    const str = (v: unknown): string => (v == null ? '' : String(v));
    const employees: EmployeeResult[] = items.slice(0, input.maxResults).map((e) => {
      const url = str(e['url'] ?? e['linkedinUrl'] ?? e['profileUrl']);
      const slugMatch = url.match(/\/in\/([^/?#]+)/);
      return {
        url,
        publicId: (slugMatch?.[1] ?? '').toLowerCase(),
        name: str(e['name'] ?? e['fullName']),
        title: str(e['title'] ?? e['headline'] ?? e['position']),
        location: str(e['location']),
      };
    }).filter((p) => p.url.length > 0);

    return { count: employees.length, companyUrl: input.companyUrl, employees };
  },
});
