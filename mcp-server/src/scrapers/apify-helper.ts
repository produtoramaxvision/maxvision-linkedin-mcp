/**
 * Apify run helper — shared by Sprint 7 company/activity tools.
 *
 * Two paths:
 *
 *   Default (`runApifyActor`): async POST `/runs` → poll until terminal →
 *     fetch dataset → check `statusMessage` for paid-tier blockers
 *     (e.g. "free user run limit reached"). Slightly higher latency than
 *     the sync endpoint but exposes the failure mode where the actor
 *     completes SUCCEEDED with an empty dataset because the run was
 *     throttled silently. v0.13.5 fix for BUG D.
 *
 *   Legacy (`runApifyActorSync`): wraps `run-sync-get-dataset-items` for
 *     callers that want the old behavior. Prefer `runApifyActor`.
 */
import { AppError } from '../errors.js';
import { logger } from '../logger.js';

const APIFY_BASE = 'https://api.apify.com/v2';
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 180_000;

const FREE_LIMIT_PATTERNS = [
  /free user run limit/i,
  /usage limit/i,
  /quota exceeded/i,
  /not enough credit/i,
  /maxTotalChargeUsd/i,
];

export interface ApifyRunArgs {
  actor: string;
  input: Record<string, unknown>;
  /** Logging context for failure traces. */
  context: string;
}

interface ApifyRun {
  id: string;
  status: string;
  statusMessage?: string;
  finishedAt?: string;
  defaultDatasetId: string;
}

function tokenOrThrow(context: string, actor: string): string {
  const t = process.env['APIFY_TOKEN'];
  if (!t) {
    throw new AppError(
      'CONFIG_FAIL',
      `APIFY_TOKEN env not set — required for ${context}`,
      { context, actor },
    );
  }
  return t;
}

function detectFreeLimit(statusMessage?: string): boolean {
  if (!statusMessage) return false;
  return FREE_LIMIT_PATTERNS.some((rx) => rx.test(statusMessage));
}

/**
 * Async run + poll. Throws a clear APIFY_PLAN_LIMIT error when the actor
 * finishes SUCCEEDED but the run was silently throttled (free-tier cap).
 */
export async function runApifyActor(args: ApifyRunArgs): Promise<Array<Record<string, unknown>>> {
  const token = tokenOrThrow(args.context, args.actor);
  const startUrl = `${APIFY_BASE}/acts/${encodeURIComponent(args.actor)}/runs?token=${encodeURIComponent(token)}`;

  logger.info({ actor: args.actor, context: args.context }, 'apify async run start');

  const startRes = await fetch(startUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args.input),
  });
  if (!startRes.ok) {
    const body = await startRes.text();
    throw new AppError(
      'EXTERNAL_API_FAIL',
      `Apify start ${startRes.status} (${args.actor}): ${body.slice(0, 300)}`,
      { status: startRes.status, actor: args.actor, context: args.context },
    );
  }
  const startBody = (await startRes.json()) as { data: ApifyRun };
  const runId = startBody.data.id;

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let run: ApifyRun = startBody.data;
  while (run.status === 'RUNNING' || run.status === 'READY') {
    if (Date.now() > deadline) {
      throw new AppError(
        'EXTERNAL_API_FAIL',
        `Apify run ${runId} did not finish within ${POLL_TIMEOUT_MS}ms`,
        { actor: args.actor, runId, context: args.context },
      );
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const pollUrl = `${APIFY_BASE}/actor-runs/${runId}?token=${encodeURIComponent(token)}`;
    const pollRes = await fetch(pollUrl);
    if (!pollRes.ok) {
      throw new AppError(
        'EXTERNAL_API_FAIL',
        `Apify poll ${pollRes.status} (${args.actor}): ${(await pollRes.text()).slice(0, 200)}`,
        { actor: args.actor, runId, context: args.context },
      );
    }
    run = ((await pollRes.json()) as { data: ApifyRun }).data;
  }

  if (run.status !== 'SUCCEEDED') {
    throw new AppError(
      'EXTERNAL_API_FAIL',
      `Apify run ${runId} ended ${run.status}: ${run.statusMessage ?? 'no message'}`,
      { actor: args.actor, runId, status: run.status, context: args.context },
    );
  }

  // Surface free-plan throttling as a distinct error so tools and callers
  // can react (display upgrade hint, fall back to alternative actor, etc).
  if (detectFreeLimit(run.statusMessage)) {
    throw new AppError(
      'UPSTREAM_FAIL',
      `Apify free-plan limit reached on actor ${args.actor}: ${run.statusMessage}. Upgrade plan at https://apify.com/pricing or set APIFY_TOKEN to a paid account.`,
      { actor: args.actor, runId, statusMessage: run.statusMessage, context: args.context },
    );
  }

  const dsUrl = `${APIFY_BASE}/datasets/${run.defaultDatasetId}/items?token=${encodeURIComponent(token)}&clean=true&format=json`;
  const dsRes = await fetch(dsUrl);
  if (!dsRes.ok) {
    throw new AppError(
      'EXTERNAL_API_FAIL',
      `Apify dataset fetch ${dsRes.status} (${args.actor})`,
      { actor: args.actor, runId, context: args.context },
    );
  }
  const items = (await dsRes.json()) as Array<Record<string, unknown>>;
  logger.info(
    { actor: args.actor, runId, count: items.length, statusMessage: run.statusMessage, context: args.context },
    'apify async run ok',
  );
  return items;
}

/**
 * Legacy synchronous wrapper. Kept for compat; prefer `runApifyActor`.
 */
export async function runApifyActorSync(
  args: ApifyRunArgs,
): Promise<Array<Record<string, unknown>>> {
  const token = tokenOrThrow(args.context, args.actor);
  const url =
    `${APIFY_BASE}/acts/${encodeURIComponent(args.actor)}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(token)}&format=json`;

  logger.info({ actor: args.actor, context: args.context }, 'apify sync run start');

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
  logger.info(
    { actor: args.actor, count: items.length, context: args.context },
    'apify sync run ok',
  );
  return items;
}
