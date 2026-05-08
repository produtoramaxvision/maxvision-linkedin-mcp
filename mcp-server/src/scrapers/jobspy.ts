/**
 * JobSpy aggregator scraper — Sprint 1.5 real Python subprocess.
 *
 * Spawns `python3 -m jobspy ...` and parses the JSON array on stdout.
 * 60s timeout, killed via SIGKILL on stall. Maps the JobSpy schema to our
 * canonical `JobResult` shape so the search_jobs merge step can dedupe by URL.
 *
 * Runtime concern: the upstream `python-jobspy` PyPI package is shipped as a
 * library only — there is no `python -m jobspy` CLI module. A thin Python
 * runner script under `python/jobspy_runner.py` is the production-grade path.
 * Scope of Sprint 1.5: this file matches the PLAN.md spec; the runner script
 * lands when the subprocess is actually invoked end-to-end.
 */
import { spawn } from 'node:child_process';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';
import type { JobResult } from './linkedin-jobs.js';

const TIMEOUT_MS = 60000;
const SUPPORTED_SITES = ['indeed', 'glassdoor', 'zip_recruiter'] as const;
type JobSpySite = typeof SUPPORTED_SITES[number];

export async function searchJobSpy(args: {
  keywords: string;
  location?: string;
  sites?: JobSpySite[];
  max?: number;
}): Promise<JobResult[]> {
  const { keywords, location = '', sites = ['indeed', 'glassdoor'], max = 25 } = args;

  return new Promise<JobResult[]>((resolve, reject) => {
    // Resolve runner script path: in dist/scrapers/ via relative; in container at /app/python/
    const runnerCandidates = [
      new URL('../../python/jobspy_runner.py', import.meta.url).pathname,
      '/app/python/jobspy_runner.py',
    ];
    const runnerPath = runnerCandidates.find((p) => {
      try { return require('node:fs').statSync(p).isFile(); } catch { return false; }
    }) ?? runnerCandidates[0]!;

    const child = spawn(
      'python3',
      [
        runnerPath,
        '--search-term',
        keywords,
        '--location',
        location,
        '--site-name',
        sites.join(','),
        '--results-wanted',
        String(max),
        '--country-indeed',
        'BR',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new AppError('SCRAPER_FAIL', `jobspy timeout after ${TIMEOUT_MS}ms`, { keywords }));
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(
        new AppError('SCRAPER_FAIL', `jobspy spawn failed: ${err.message}`, { keywords }, err),
      );
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(
          new AppError(
            'SCRAPER_FAIL',
            `jobspy exit ${code}: ${stderr.slice(0, 500)}`,
            { keywords, code },
          ),
        );
      }
      try {
        const raw: unknown = JSON.parse(stdout);
        // jobspy output is array of jobs OR object with 'jobs' key — handle both
        const arr: unknown[] = Array.isArray(raw)
          ? raw
          : ((raw as { jobs?: unknown[] }).jobs ?? []);
        const jobs: JobResult[] = arr.slice(0, max).map((rawJob) => {
          const j = rawJob as Record<string, unknown>;
          return {
            url: String(j.job_url ?? j.url ?? ''),
            title: String(j.title ?? ''),
            company: String(j.company ?? j.company_name ?? ''),
            location: String(j.location ?? ''),
            postedAt: String(j.date_posted ?? new Date().toISOString()),
            description: String(j.description ?? '').slice(0, 1000),
            easyApply: false,
            source: 'jobspy' as const,
          };
        });
        logger.info({ count: jobs.length, keywords }, 'jobspy scrape ok');
        resolve(jobs);
      } catch (err) {
        reject(
          new AppError(
            'SCRAPER_FAIL',
            `jobspy stdout parse fail: ${(err as Error).message}`,
            { stderr: stderr.slice(0, 500) },
            err,
          ),
        );
      }
    });
  });
}
