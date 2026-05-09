/**
 * Apify run-sync helper — shared by Sprint 7 company/activity tools.
 *
 * Wraps `POST /v2/acts/<actor>/run-sync-get-dataset-items` with a uniform
 * error surface so each tool implementation stays focused on input/output
 * mapping. The endpoint is synchronous: the request blocks until the actor
 * finishes, which is fine for our 1-25 result use cases (typical 5-30s
 * latency). For larger batches operators should call the actor's async
 * `/runs` endpoint and poll, but that pattern is not yet wired here.
 */
import { AppError } from '../errors.js';
import { logger } from '../logger.js';

const APIFY_RUN_ENDPOINT = 'https://api.apify.com/v2/acts';

export interface ApifyRunArgs {
  actor: string;
  input: Record<string, unknown>;
  /** Logging context for failure traces. */
  context: string;
}

export async function runApifyActor(args: ApifyRunArgs): Promise<Array<Record<string, unknown>>> {
  const apifyToken = process.env['APIFY_TOKEN'];
  if (!apifyToken) {
    throw new AppError(
      'CONFIG_FAIL',
      `APIFY_TOKEN env not set — required for ${args.context}`,
      { context: args.context, actor: args.actor },
    );
  }

  const url =
    `${APIFY_RUN_ENDPOINT}/${encodeURIComponent(args.actor)}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(apifyToken)}&format=json`;

  logger.info({ actor: args.actor, context: args.context }, 'apify actor run start');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args.input),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AppError(
      'EXTERNAL_API_FAIL',
      `Apify ${res.status} (${args.actor}): ${body.slice(0, 300)}`,
      { status: res.status, actor: args.actor, context: args.context },
    );
  }

  const items = (await res.json()) as Array<Record<string, unknown>>;
  logger.info({ actor: args.actor, count: items.length, context: args.context }, 'apify actor run ok');
  return items;
}
