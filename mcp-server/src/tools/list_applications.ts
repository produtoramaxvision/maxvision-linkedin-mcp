/**
 * tools/list_applications — Sprint 1.5 read-only tracker view.
 *
 * Local DB read; no scraping, no external calls. Pairs with `track_application`
 * to give plugin clients a first-class way to enumerate the user's pipeline
 * without a SQL fallback in the slash command.
 *
 * Output is bounded (`limit` max 200) and ordered by `submittedAt DESC NULLS
 * LAST` so most recent activity surfaces first; `saved` rows (no submittedAt)
 * land at the tail.
 */
import { withInstrumentation } from './_base.js';
import { ListApplicationsInputSchema, type ListApplicationsInput } from './schemas.js';
import { findAll, findByStatus } from '../db/repos/applications.repo.js';
import { logger } from '../logger.js';

export interface ApplicationRow {
  id: string;
  jobUrl: string;
  jobTitle: string | null;
  company: string | null;
  status: string;
  submittedAt: string | null;
  historyLen: number;
}

export interface ListApplicationsOutput {
  count: number;
  filterStatus: string | null;
  applications: ApplicationRow[];
}

export const listApplications = withInstrumentation<ListApplicationsInput, ListApplicationsOutput>({
  name: 'list_applications',
  description:
    'List tracked job applications for an account, filtered by status and limited.',
  inputSchema: ListApplicationsInputSchema,
  handler: async ({ input, accountId }) => {
    logger.info(
      { accountId, status: input.status, limit: input.limit },
      'list_applications invoked',
    );

    const rows = input.status
      ? await findByStatus(accountId, input.status, input.limit)
      : await findAll(accountId, input.limit);

    const applications: ApplicationRow[] = rows.map((r) => ({
      id: r.id,
      jobUrl: r.jobUrl,
      jobTitle: r.jobTitle,
      company: r.company,
      status: r.status,
      submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
      historyLen: Array.isArray(r.history) ? r.history.length : 0,
    }));

    return {
      count: applications.length,
      filterStatus: input.status ?? null,
      applications,
    };
  },
});
