/**
 * tools/track_application — record an application in the local tracker.
 *
 * Sprint 1 scope: DB write only, no scraping. This is the single
 * non-idempotent write among the Sprint 1 tools (the others are
 * cache upserts). Re-tracking the same `(accountId, jobUrl)` therefore
 * inserts a fresh row — there is no `(account_id, job_url)` UNIQUE
 * constraint on the schema (see db/schema.ts:applications). Status
 * transitions on an existing application go through a separate flow
 * that uses `updateStatus` / `appendHistory` from the repo (Sprint 1.5).
 *
 * `submittedAt` is set only when `status === 'applied'`. For other
 * initial states (saved, interviewing, …) we leave it null so the
 * timeline reflects when the user actually applied, not when they
 * first tracked the row. The DB column has `defaultNow()` but explicit
 * null suppresses that default.
 */
import { withInstrumentation } from './_base.js';
import { TrackApplicationInputSchema, type TrackApplicationInput } from './schemas.js';
import { create as createApplication, type HistoryEntry } from '../db/repos/applications.repo.js';
import { logger } from '../logger.js';

export interface TrackApplicationOutput {
  id: string;
  status: string;
  createdAt: string;
}

export const trackApplication = withInstrumentation<TrackApplicationInput, TrackApplicationOutput>({
  name: 'track_application',
  description: 'Record an application in the local tracker (DB-only; no scraping).',
  inputSchema: TrackApplicationInputSchema,
  handler: async ({ input, accountId }) => {
    logger.info(
      { accountId, jobUrl: input.jobUrl, status: input.status },
      'track_application invoked',
    );

    const now = new Date();

    // Seed the history with the initial status. `notes` only included
    // when present so the entry stays compact (HistoryEntry.notes is
    // optional, see applications.repo.ts).
    const initialEntry: HistoryEntry = {
      status: input.status,
      at: now.toISOString(),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };

    const created = await createApplication({
      accountId,
      jobUrl: input.jobUrl,
      jobTitle: input.jobTitle ?? null,
      company: input.company ?? null,
      status: input.status,
      resumeUsed: input.resumeUsed ?? null,
      coverLetter: input.coverLetter ?? null,
      // Only set submittedAt when actually applied; otherwise let it
      // remain null so the timeline is meaningful.
      submittedAt: input.status === 'applied' ? now : null,
      history: [initialEntry],
    });

    return {
      id: created.id,
      status: created.status,
      // `submittedAt` is the closest thing to a created_at on this row.
      // Fall back to the request `now` if the DB returned null (status
      // !== 'applied' path).
      createdAt: created.submittedAt ? created.submittedAt.toISOString() : now.toISOString(),
    };
  },
});
