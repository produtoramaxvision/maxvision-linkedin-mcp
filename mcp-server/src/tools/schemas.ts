/**
 * tools/schemas — shared Zod schemas for MCP tool inputs/outputs.
 *
 * Two flavors are exported per family:
 *  - `*InputShape`   — raw Zod shape (object literal), passed directly to
 *                      `server.registerTool({ inputSchema })`. The SDK wraps
 *                      it in `z.object()` internally and pre-parses for us.
 *  - `*InputSchema`  — `z.object(*InputShape)` for use by the instrumentation
 *                      wrapper which re-parses defensively (idempotent).
 */
import { z } from 'zod';

// ----------------------------------------------------------------------------
// Common atoms reused across tools.
// ----------------------------------------------------------------------------

export const AccountIdSchema = z.string().min(1).default('default');

export const SourceSchema = z.enum(['linkedin', 'jobspy', 'both']).default('both');

export const ProfileUrlSchema = z
  .string()
  .url()
  .regex(/linkedin\.com\/in\//, 'Must be a LinkedIn /in/<slug> URL');

export const ApplicationStatusSchema = z.enum([
  'saved',
  'applied',
  'interviewing',
  'rejected',
  'offered',
  'withdrawn',
]);

// ----------------------------------------------------------------------------
// search_jobs — input.
// ----------------------------------------------------------------------------

export const SearchJobsInputShape = {
  accountId: AccountIdSchema.describe(
    'LinkedIn account pool ID; default uses the singleton account',
  ),
  keywords: z
    .string()
    .min(2)
    .describe('Keywords to search (e.g., "senior backend engineer")'),
  location: z
    .string()
    .optional()
    .describe('Location filter (e.g., "São Paulo, BR" or "Remote")'),
  sources: SourceSchema.describe('Which scrapers to use'),
  maxResults: z.number().int().positive().max(100).default(25),
};

export const SearchJobsInputSchema = z.object(SearchJobsInputShape);
export type SearchJobsInput = z.infer<typeof SearchJobsInputSchema>;

// ----------------------------------------------------------------------------
// get_profile — input.
// ----------------------------------------------------------------------------

export const GetProfileInputShape = {
  accountId: AccountIdSchema,
  profileUrl: ProfileUrlSchema.describe(
    'Canonical LinkedIn profile URL (https://www.linkedin.com/in/<slug>)',
  ),
};

export const GetProfileInputSchema = z.object(GetProfileInputShape);
export type GetProfileInput = z.infer<typeof GetProfileInputSchema>;

// ----------------------------------------------------------------------------
// get_job_details — input.
// ----------------------------------------------------------------------------

/**
 * Accepts any LinkedIn job URL variant and normalizes to the canonical
 * `https://www.linkedin.com/jobs/view/<id>/` form. v0.13.2 fix for the
 * search_jobs → get_job_details flow: search_jobs returns slugged URLs
 * like `https://br.linkedin.com/jobs/view/<slug>-<id>?...` which the old
 * `/jobs/view/\d+/` regex rejected.
 *
 * Accepted variants:
 *   - https://www.linkedin.com/jobs/view/4198123483/
 *   - https://br.linkedin.com/jobs/view/engenheiro-de-software-at-xp-inc-4198123483
 *   - https://uk.linkedin.com/jobs/view/4198123483?refId=...
 *   - https://linkedin.com/jobs/view/some-slug-4198123483/?lipi=...
 *
 * Rejected: any URL not matching `linkedin.com/jobs/view/.../<digits>` at
 * the end of the path.
 */
export const JobUrlSchema = z
  .string()
  .url()
  .transform((raw, ctx) => {
    if (!/linkedin\.com\/jobs\/view\//.test(raw)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be a LinkedIn /jobs/view/ URL' });
      return z.NEVER;
    }
    const match = raw.match(/\/jobs\/view\/(?:[^/?#]*-)?(\d+)(?:[/?#]|$)/);
    if (!match) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Must end with numeric job id (e.g. /jobs/view/4198123483)',
      });
      return z.NEVER;
    }
    return `https://www.linkedin.com/jobs/view/${match[1]}/`;
  });

export const GetJobDetailsInputShape = {
  accountId: AccountIdSchema,
  jobUrl: JobUrlSchema.describe('Canonical LinkedIn job URL'),
};

export const GetJobDetailsInputSchema = z.object(GetJobDetailsInputShape);
export type GetJobDetailsInput = z.infer<typeof GetJobDetailsInputSchema>;

// ----------------------------------------------------------------------------
// track_application — input.
// ----------------------------------------------------------------------------

export const TrackApplicationInputShape = {
  accountId: AccountIdSchema,
  jobUrl: z.string().url(),
  jobTitle: z.string().optional(),
  company: z.string().optional(),
  status: ApplicationStatusSchema.default('saved'),
  notes: z.string().optional(),
  resumeUsed: z.string().optional(),
  coverLetter: z.string().optional(),
};

export const TrackApplicationInputSchema = z.object(TrackApplicationInputShape);
export type TrackApplicationInput = z.infer<typeof TrackApplicationInputSchema>;

// ----------------------------------------------------------------------------
// Sprint 2 — schemas + tool surface for the remaining 6 tools.
// ----------------------------------------------------------------------------

// list_feed — read recent items from the user's home feed.
export const ListFeedInputShape = {
  accountId: AccountIdSchema,
  maxResults: z.number().int().positive().max(50).default(10),
};
export const ListFeedInputSchema = z.object(ListFeedInputShape);
export type ListFeedInput = z.infer<typeof ListFeedInputSchema>;

// search_people — search /search/results/people.
//
// `mode` selects the Apify actor:
//   - `keywords` (default) → harvestapi/linkedin-profile-search
//   - `by-name`            → harvestapi/linkedin-profile-search-by-name
//   - `keywords-search`    → harvestapi/linkedin-profile-keywords-search
// All three accept `keywords` + filters; the actor differs on result ranking
// strategy (semantic vs exact-name vs broad-keyword expansion).
export const SearchPeopleInputShape = {
  accountId: AccountIdSchema,
  keywords: z.string().min(2).describe('Search keywords (e.g., "head of platform engineering BR")'),
  company: z.string().optional().describe('Filter by current company'),
  location: z.string().optional(),
  maxResults: z.number().int().positive().max(50).default(10),
  mode: z
    .enum(['keywords', 'by-name', 'keywords-search'])
    .default('keywords')
    .describe('Search strategy: keywords (default semantic), by-name (exact name match), keywords-search (broad expansion)'),
};
export const SearchPeopleInputSchema = z.object(SearchPeopleInputShape);
export type SearchPeopleInput = z.infer<typeof SearchPeopleInputSchema>;

// optimize_profile — analyze profile against target role using Claude.
export const OptimizeProfileInputShape = {
  accountId: AccountIdSchema,
  targetRole: z.string().min(2).describe('Target role (e.g., "Senior Backend Engineer")'),
  profileText: z
    .string()
    .min(20)
    .max(20000)
    .optional()
    .describe('Profile text to analyze (paste full profile or summary)'),
  profileUrl: ProfileUrlSchema
    .optional()
    .describe('Profile URL — fetched server-side IF profile scraping is available'),
};
export const OptimizeProfileInputSchema = z.object(OptimizeProfileInputShape);
export type OptimizeProfileInput = z.infer<typeof OptimizeProfileInputSchema>;

// post_update — create new feed post (requires confirm=true to actually post).
export const PostUpdateInputShape = {
  accountId: AccountIdSchema,
  text: z.string().min(1).max(3000).describe('Post body — visible publicly when posted'),
  visibility: z.enum(['public', 'connections']).default('public'),
  confirm: z
    .boolean()
    .default(false)
    .describe('Set true to actually post; false returns a dry-run preview'),
};
export const PostUpdateInputSchema = z.object(PostUpdateInputShape);
export type PostUpdateInput = z.infer<typeof PostUpdateInputSchema>;

// apply_easy — Easy Apply flow with required confirmation.
export const ApplyEasyInputShape = {
  accountId: AccountIdSchema,
  jobUrl: JobUrlSchema,
  resumeFileName: z.string().optional(),
  answers: z
    .record(z.string(), z.string())
    .optional()
    .describe('Answers to screening questions, keyed by question text'),
  confirm: z
    .boolean()
    .default(false)
    .describe('Set true to actually submit; false returns a preview only'),
};
export const ApplyEasyInputSchema = z.object(ApplyEasyInputShape);
export type ApplyEasyInput = z.infer<typeof ApplyEasyInputSchema>;

// send_message — send DM/InMail with required confirmation.
export const SendMessageInputShape = {
  accountId: AccountIdSchema,
  recipientUrl: ProfileUrlSchema.describe('LinkedIn profile URL of the recipient'),
  subject: z.string().optional().describe('Subject line (InMail only)'),
  body: z.string().min(1).max(2000).describe('Message body'),
  confirm: z
    .boolean()
    .default(false)
    .describe('Set true to actually send; false returns a preview only'),
};
export const SendMessageInputSchema = z.object(SendMessageInputShape);
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

// ----------------------------------------------------------------------------
// Sprint 7 — Companies + activity tools (Apify-backed).
// ----------------------------------------------------------------------------

// get_company_info — fetch a single company by URL.
export const GetCompanyInfoInputShape = {
  accountId: AccountIdSchema,
  companyUrl: z
    .string()
    .url()
    .regex(/linkedin\.com\/company\//, 'Must be a LinkedIn /company/<slug> URL')
    .describe('LinkedIn company URL (e.g., https://www.linkedin.com/company/notionhq/)'),
};
export const GetCompanyInfoInputSchema = z.object(GetCompanyInfoInputShape);
export type GetCompanyInfoInput = z.infer<typeof GetCompanyInfoInputSchema>;

// search_companies — search companies by keywords + filters.
export const SearchCompaniesInputShape = {
  accountId: AccountIdSchema,
  keywords: z.string().min(2).describe('Search keywords (e.g., "fintech series B Brazil")'),
  industry: z.string().optional().describe('Industry filter (e.g., "Software", "Banking")'),
  location: z.string().optional().describe('Headquarters location (e.g., "São Paulo")'),
  companySize: z
    .enum(['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+'])
    .optional()
    .describe('Employee headcount range'),
  maxResults: z.number().int().positive().max(50).default(10),
};
export const SearchCompaniesInputSchema = z.object(SearchCompaniesInputShape);
export type SearchCompaniesInput = z.infer<typeof SearchCompaniesInputSchema>;

// find_company_employees — list employees of a company.
export const FindCompanyEmployeesInputShape = {
  accountId: AccountIdSchema,
  companyUrl: z
    .string()
    .url()
    .regex(/linkedin\.com\/company\//, 'Must be a LinkedIn /company/<slug> URL'),
  jobTitle: z.string().optional().describe('Filter by job title (e.g., "engineering manager")'),
  location: z.string().optional(),
  maxResults: z.number().int().positive().max(100).default(25),
};
export const FindCompanyEmployeesInputSchema = z.object(FindCompanyEmployeesInputShape);
export type FindCompanyEmployeesInput = z.infer<typeof FindCompanyEmployeesInputSchema>;

// get_profile_activity — list a profile's recent posts + reactions.
export const GetProfileActivityInputShape = {
  accountId: AccountIdSchema,
  profileUrl: ProfileUrlSchema,
  include: z
    .enum(['posts', 'reactions', 'both'])
    .default('both')
    .describe('Which activity streams to fetch'),
  maxResults: z.number().int().positive().max(50).default(10),
};
export const GetProfileActivityInputSchema = z.object(GetProfileActivityInputShape);
export type GetProfileActivityInput = z.infer<typeof GetProfileActivityInputSchema>;

// ----------------------------------------------------------------------------
// Sprint 1.5 — get_account_owner (whoami via Patchright + /feed/).
// ----------------------------------------------------------------------------

export const GetAccountOwnerInputShape = {
  accountId: AccountIdSchema,
};
export const GetAccountOwnerInputSchema = z.object(GetAccountOwnerInputShape);
export type GetAccountOwnerInput = z.infer<typeof GetAccountOwnerInputSchema>;

// ----------------------------------------------------------------------------
// Sprint 1.5 — list_applications (local DB read).
// ----------------------------------------------------------------------------

export const ListApplicationsInputShape = {
  accountId: AccountIdSchema,
  status: ApplicationStatusSchema.optional().describe(
    'Filter by status; omit to return all states',
  ),
  limit: z.number().int().positive().max(200).default(50),
};
export const ListApplicationsInputSchema = z.object(ListApplicationsInputShape);
export type ListApplicationsInput = z.infer<typeof ListApplicationsInputSchema>;

// monitor_post_engagement — fetch reactions + comments for a single post URL.
export const MonitorPostEngagementInputShape = {
  accountId: AccountIdSchema,
  postUrl: z
    .string()
    .url()
    .regex(/linkedin\.com\/(posts|feed\/update)/, 'Must be a LinkedIn post URL')
    .describe('LinkedIn post URL (https://linkedin.com/posts/... or /feed/update/...)'),
  include: z
    .enum(['reactions', 'comments', 'both'])
    .default('both'),
  maxReactions: z.number().int().positive().max(500).default(50),
  maxComments: z.number().int().positive().max(500).default(50),
};
export const MonitorPostEngagementInputSchema = z.object(MonitorPostEngagementInputShape);
export type MonitorPostEngagementInput = z.infer<typeof MonitorPostEngagementInputSchema>;
