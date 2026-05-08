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

export const JobUrlSchema = z
  .string()
  .url()
  .regex(/linkedin\.com\/jobs\/view\/\d+/, 'Must be /jobs/view/<id>');

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
export const SearchPeopleInputShape = {
  accountId: AccountIdSchema,
  keywords: z.string().min(2).describe('Search keywords (e.g., "head of platform engineering BR")'),
  company: z.string().optional().describe('Filter by current company'),
  location: z.string().optional(),
  maxResults: z.number().int().positive().max(50).default(10),
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
