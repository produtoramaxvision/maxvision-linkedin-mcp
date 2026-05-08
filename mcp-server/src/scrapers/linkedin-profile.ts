/**
 * LinkedIn profile scraper — Sprint 1.5.7 voyager API path.
 *
 * Server-side Patchright nav to /in/<slug> hits LinkedIn's
 * `auth_wall_desktop_profile` even with full multi-cookie auth (validated via
 * docker exec inspect-profile.mjs). The voyager GraphQL endpoints LinkedIn's
 * own web app uses accept the same cookie set we ship, so we delegate to the
 * `tomquirk/linkedin-api` Python wrapper which handles the GraphQL surface.
 *
 * Auth model: cookies-only. We decrypt the account's cookie blob, ship the
 * cookie array to a Python subprocess via stdin, parse profile JSON from
 * stdout, and map the voyager response shape to our canonical ProfileData.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { decryptCookie } from '../auth/cookies.js';
import { getAccountById } from '../db/repos/accounts.repo.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

const PYTHON_RUNNER_TIMEOUT_MS = 45000;

export interface ProfileExperience {
  title: string;
  company: string;
  startDate: string;
  endDate: string | null;
  location?: string;
  description?: string;
}

export interface ProfileEducation {
  school: string;
  degree?: string;
  field?: string;
  startYear: number;
  endYear: number | null;
}

export interface ProfileData {
  url: string;
  publicId: string;
  fullName: string;
  headline: string;
  location: string;
  currentCompany: string | null;
  currentRole: string | null;
  summary: string;
  experience: ProfileExperience[];
  education: ProfileEducation[];
  skills: string[];
  fetchedAt: string;
}

interface RawCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  expires?: number;
}

function resolveCookiesArray(plaintext: string): RawCookie[] {
  const t = plaintext.trim();
  if (t.startsWith('[')) {
    try {
      const parsed = JSON.parse(t) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as RawCookie[];
    } catch {
      // fall through
    }
  }
  // Legacy single-li_at fallback.
  return [{ name: 'li_at', value: plaintext, domain: '.linkedin.com', path: '/' }];
}

function callLinkedinApiRunner(
  cookies: RawCookie[],
  args: string[],
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const candidates = [
      new URL('../../python/linkedin_api_runner.py', import.meta.url).pathname,
      '/app/python/linkedin_api_runner.py',
    ];
    const runnerPath = candidates.find((p) => {
      try {
        return require('node:fs').statSync(p).isFile();
      } catch {
        return false;
      }
    }) ?? candidates[0]!;

    const child = spawn('python3', [runnerPath, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new AppError('SCRAPER_FAIL', `linkedin-api runner timeout ${PYTHON_RUNNER_TIMEOUT_MS}ms`));
    }, PYTHON_RUNNER_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(
        new AppError('SCRAPER_FAIL', `linkedin-api spawn failed: ${err.message}`, {}, err),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const errPath = code === 2 ? 'cookies' : code === 3 ? 'auth' : 'unknown';
        reject(
          new AppError(
            code === 3 ? 'COOKIE_EXPIRED' : 'SCRAPER_FAIL',
            `linkedin-api exit ${code} (${errPath}): ${stderr.slice(0, 400)}`,
            { code, stderr: stderr.slice(0, 400) },
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(
          new AppError(
            'SCRAPER_FAIL',
            `linkedin-api stdout parse fail: ${(err as Error).message}`,
            { stdoutHead: stdout.slice(0, 200) },
            err,
          ),
        );
      }
    });

    child.stdin.write(JSON.stringify(cookies));
    child.stdin.end();
  });
}

/**
 * Map a `tomquirk/linkedin-api` get_profile() response to our ProfileData
 * shape. The library returns a dict with `firstName`, `lastName`, `headline`,
 * `geoLocationName`, `summary`, `experience`, `education`, `skills` keys.
 */
function mapVoyagerProfile(slug: string, raw: Record<string, unknown>): ProfileData {
  const firstName = String(raw['firstName'] ?? '');
  const lastName = String(raw['lastName'] ?? '');
  const fullName = (firstName + ' ' + lastName).trim();
  const headline = String(raw['headline'] ?? '');
  const location =
    String(raw['geoLocationName'] ?? '') ||
    String(raw['locationName'] ?? '') ||
    '';
  const summary = String(raw['summary'] ?? '');

  const experienceRaw = Array.isArray(raw['experience']) ? raw['experience'] : [];
  const experience: ProfileExperience[] = experienceRaw.slice(0, 10).map((e) => {
    const exp = e as Record<string, unknown>;
    const startDateObj = exp['timePeriod'] as Record<string, unknown> | undefined;
    const startYM = startDateObj?.['startDate'] as Record<string, number> | undefined;
    const endYM = startDateObj?.['endDate'] as Record<string, number> | undefined;
    const fmt = (ym: Record<string, number> | undefined): string => {
      if (!ym) return '';
      const y = ym['year'] ?? 0;
      const m = ym['month'] ?? 0;
      return y ? (m ? `${y}-${String(m).padStart(2, '0')}` : String(y)) : '';
    };
    return {
      title: String(exp['title'] ?? ''),
      company: String(exp['companyName'] ?? exp['company'] ?? ''),
      startDate: fmt(startYM),
      endDate: endYM ? fmt(endYM) : null,
      location: String(exp['locationName'] ?? ''),
      description: String(exp['description'] ?? ''),
    };
  });

  const educationRaw = Array.isArray(raw['education']) ? raw['education'] : [];
  const education: ProfileEducation[] = educationRaw.slice(0, 5).map((e) => {
    const ed = e as Record<string, unknown>;
    const tp = ed['timePeriod'] as Record<string, unknown> | undefined;
    const startY = (tp?.['startDate'] as Record<string, number> | undefined)?.['year'] ?? 0;
    const endY = (tp?.['endDate'] as Record<string, number> | undefined)?.['year'] ?? null;
    return {
      school: String(ed['schoolName'] ?? ed['school'] ?? ''),
      degree: ed['degreeName'] ? String(ed['degreeName']) : undefined,
      field: ed['fieldOfStudy'] ? String(ed['fieldOfStudy']) : undefined,
      startYear: typeof startY === 'number' ? startY : 0,
      endYear: typeof endY === 'number' ? endY : null,
    };
  });

  const skillsRaw = Array.isArray(raw['skills']) ? raw['skills'] : [];
  const skills: string[] = skillsRaw
    .slice(0, 30)
    .map((s) => String((s as Record<string, unknown>)['name'] ?? s ?? ''))
    .filter(Boolean);

  return {
    url: `https://www.linkedin.com/in/${slug}`,
    publicId: slug,
    fullName,
    headline,
    location,
    currentCompany: experience[0]?.company || null,
    currentRole: experience[0]?.title || null,
    summary,
    experience,
    education,
    skills,
    fetchedAt: new Date().toISOString(),
  };
}

export async function scrapeProfile(args: {
  accountId: string;
  profileUrl: string;
}): Promise<ProfileData> {
  const { accountId, profileUrl } = args;
  const slug = extractPublicId(profileUrl);

  const account = await getAccountById(accountId);
  if (!account) throw new AppError('UNKNOWN', `Account not found: ${accountId}`);

  const plaintext = decryptCookie(account.cookieEncrypted);
  const cookies = resolveCookiesArray(plaintext);

  logger.info(
    { accountId, slug, cookieCount: cookies.length },
    'voyager profile fetch start',
  );

  const raw = (await callLinkedinApiRunner(cookies, [
    '--action',
    'get_profile',
    '--public-id',
    slug,
  ])) as Record<string, unknown>;

  const mapped = mapVoyagerProfile(slug, raw);
  logger.info({ accountId, slug, name: mapped.fullName }, 'voyager profile fetch ok');
  return mapped;
}

/** Extract `/in/<slug>` from a LinkedIn profile URL. Throws if not matched. */
export function extractPublicId(url: string): string {
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!m) throw new AppError('VALIDATION_FAIL', `Not a LinkedIn profile URL: ${url}`);
  return m[1]!.toLowerCase();
}

// `path` is unused — kept import to avoid module-side-effect surprises.
void path;
