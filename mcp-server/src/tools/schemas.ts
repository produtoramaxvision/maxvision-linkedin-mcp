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
