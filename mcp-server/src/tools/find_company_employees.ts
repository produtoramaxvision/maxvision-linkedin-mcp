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
    // linkedin-profile-search input: searchQuery + currentCompanies + locations.
    const apifyInput: Record<string, unknown> = {
      currentCompanies: [input.companyUrl],
      maxItems: input.maxResults,
      profileScraperMode: 'Short',
    };
    if (input.jobTitle) apifyInput['searchQuery'] = input.jobTitle;
    if (input.location) apifyInput['locations'] = [input.location];

    const items = await runApifyActor({ actor: ACTOR, context: 'find_company_employees', input: apifyInput });

    const str = (v: unknown): string => (v == null ? '' : String(v));
    const employees: EmployeeResult[] = items.slice(0, input.maxResults).map((e) => {
      const url = str(e['linkedinUrl'] ?? e['url'] ?? e['profileUrl']);
      const slugMatch = url.match(/\/in\/([^/?#]+)/);
      // linkedin-profile-search Short returns firstName + lastName (not `name`)
      const firstName = str(e['firstName']);
      const lastName = str(e['lastName']);
      const name = firstName || lastName ? `${firstName} ${lastName}`.trim() : str(e['name'] ?? e['fullName']);
      // currentPositions is array; take first.position as title
      const cp = (e['currentPositions'] as Array<Record<string, unknown>> | undefined)?.[0];
      const title = cp ? str(cp['position'] ?? cp['title']) : str(e['headline'] ?? e['title'] ?? e['position']);
      // location is {linkedinText, countryCode, parsed}
      const locObj = e['location'] as Record<string, unknown> | undefined;
      const location = locObj ? str(locObj['linkedinText']) : str(e['location']);
      return {
        url,
        publicId: (slugMatch?.[1] ?? '').toLowerCase(),
        name,
        title,
        location,
      };
    }).filter((p) => p.url.length > 0);

    return { count: employees.length, companyUrl: input.companyUrl, employees };
  },
});
