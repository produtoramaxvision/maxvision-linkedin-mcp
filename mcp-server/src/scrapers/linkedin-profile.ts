/**
 * LinkedIn profile scraper — Sprint 6.7 BrightData Scraper API integration.
 *
 * Two-path strategy:
 *
 * Path A — BrightData LinkedIn People Profile dataset (preferred when
 *   `BRIGHTDATA_API_TOKEN` env is set). Synchronous endpoint
 *   `POST /datasets/v3/scrape?dataset_id=gd_l1viktl72bvl7bjuj0` returns 50+
 *   structured fields (experience, education, skills, posts, current_company,
 *   people_also_viewed) without needing a logged-in session. Pricing:
 *   $1.50/1k records pay-as-you-go (cheaper than Web Unlocker `$2.50/CPM` and
 *   yields full data instead of LinkedIn's reduced guest layout).
 *
 * Path B — fallback to fetchAndParse() + cheerio HTML extraction. Kept for
 *   backward compatibility and when operator does not configure the Scraper
 *   API token. Returns whatever LinkedIn serves for the requesting context
 *   (typically guest layout = name + headline + location only).
 *
 * Cache shape stays identical between both paths so the tool surface is
 * unchanged. Path A populates more fields; Path B leaves arrays empty.
 */
import { fetchAndParse } from '../browser/fetch-and-parse.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

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

const BD_DATASET_ID = process.env['BRIGHTDATA_LINKEDIN_PROFILE_DATASET_ID'] ?? 'gd_l1viktl72bvl7bjuj0';
const BD_SCRAPER_ENDPOINT = 'https://api.brightdata.com/datasets/v3/scrape';

/**
 * Map BrightData LinkedIn Profile JSON to internal ProfileData shape.
 *
 * BrightData returns 50+ fields; we project the subset that fits our existing
 * cache schema. Unknown fields are dropped so consumers stay stable.
 */
function mapBrightDataProfile(raw: Record<string, unknown>, profileUrl: string, slug: string): ProfileData {
  const get = <T>(key: string): T | undefined => raw[key] as T | undefined;

  const rawExperience = (get<unknown[]>('experience') ?? []) as Array<Record<string, unknown>>;
  const experience: ProfileExperience[] = rawExperience.slice(0, 25).map((e) => ({
    title: String(e['title'] ?? ''),
    company: String(e['company'] ?? ''),
    startDate: String(e['start_date'] ?? ''),
    endDate: e['end_date'] != null ? String(e['end_date']) : null,
    location: e['location'] != null ? String(e['location']) : '',
    description: e['description'] != null ? String(e['description']) : '',
  }));

  const rawEducation = (get<unknown[]>('education') ?? []) as Array<Record<string, unknown>>;
  const education: ProfileEducation[] = rawEducation.slice(0, 15).map((ed) => ({
    school: String(ed['title'] ?? ed['school'] ?? ''),
    degree: ed['degree'] != null ? String(ed['degree']) : undefined,
    field: ed['field'] != null ? String(ed['field']) : undefined,
    startYear: parseYear(ed['start_year'] ?? ed['startYear']),
    endYear: ed['end_year'] != null ? parseYear(ed['end_year']) : null,
  }));

  const rawSkills = (get<unknown[]>('skills') ?? []) as Array<Record<string, unknown> | string>;
  const skills: string[] = rawSkills
    .slice(0, 50)
    .map((s) => (typeof s === 'string' ? s : String(s['name'] ?? s['title'] ?? '')))
    .filter((s) => s.length > 0);

  const currentCompanyObj = get<Record<string, unknown>>('current_company');
  const currentCompany = currentCompanyObj
    ? String(currentCompanyObj['name'] ?? '')
    : experience[0]?.company ?? null;
  const currentRole = experience[0]?.title ?? null;

  return {
    url: profileUrl,
    publicId: slug,
    fullName: String(get('name') ?? ''),
    headline: String(get('position') ?? get('headline') ?? ''),
    location: String(get('city') ?? get('location') ?? ''),
    currentCompany: currentCompany || null,
    currentRole,
    summary: String(get('about') ?? get('summary') ?? ''),
    experience,
    education,
    skills,
    fetchedAt: new Date().toISOString(),
  };
}

function parseYear(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fetch a profile via BrightData LinkedIn People Profile dataset.
 * Synchronous mode — returns full structured JSON in a single HTTP call.
 */
async function scrapeProfileViaBrightDataAPI(args: {
  profileUrl: string;
  slug: string;
  apiToken: string;
}): Promise<ProfileData> {
  const { profileUrl, slug, apiToken } = args;
  const url = `${BD_SCRAPER_ENDPOINT}?dataset_id=${encodeURIComponent(BD_DATASET_ID)}&notify=false&include_errors=true`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${apiToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ input: [{ url: profileUrl }] }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new AppError(
      'EXTERNAL_API_FAIL',
      `BrightData Scraper ${res.status}: ${errBody.slice(0, 300)}`,
      { status: res.status, dataset: BD_DATASET_ID },
    );
  }

  const json = (await res.json()) as Record<string, unknown> | Array<Record<string, unknown>>;
  const record = Array.isArray(json) ? json[0] : json;
  if (!record || typeof record !== 'object') {
    throw new AppError(
      'EXTERNAL_API_FAIL',
      `BrightData Scraper returned empty payload for ${profileUrl}`,
    );
  }
  if ('error' in record && record['error']) {
    throw new AppError(
      'EXTERNAL_API_FAIL',
      `BrightData Scraper error: ${String(record['error'])}`,
      { profileUrl },
    );
  }
  return mapBrightDataProfile(record, profileUrl, slug);
}

export async function scrapeProfile(args: {
  accountId: string;
  profileUrl: string;
}): Promise<ProfileData> {
  const { accountId, profileUrl } = args;
  const slug = extractPublicId(profileUrl);

  const apiToken = process.env['BRIGHTDATA_API_TOKEN'];
  if (apiToken) {
    logger.info(
      { accountId, profileUrl, slug, backend: 'brightdata-scraper-api' },
      'profile fetch start (BrightData Scraper API)',
    );
    try {
      const data = await scrapeProfileViaBrightDataAPI({ profileUrl, slug, apiToken });
      logger.info(
        { accountId, slug, name: data.fullName, fields: { experience: data.experience.length, education: data.education.length, skills: data.skills.length } },
        'profile scrape ok via BrightData Scraper API',
      );
      return data;
    } catch (err) {
      logger.warn(
        { accountId, slug, err: err instanceof Error ? err.message : String(err) },
        'BrightData Scraper API failed — falling back to HTML scrape',
      );
      // Fall through to Path B
    }
  }

  logger.info({ accountId, profileUrl, slug, backend: 'html' }, 'profile fetch start (HTML)');
  const data = await fetchAndParse({
    accountId,
    url: profileUrl,
    context: 'profile',
    requireSelectors: ['h1, main'],
    parse: ($) => {
      const fullName =
        $('h1.text-heading-xlarge').first().text().trim() ||
        $('h1').first().text().trim();
      const headline =
        $('div.text-body-medium.break-words').first().text().trim() ||
        $('.top-card-layout__headline').first().text().trim();
      const location =
        $('span.text-body-small.inline.t-black--light.break-words').first().text().trim() ||
        $('.top-card-layout__first-subline').first().text().trim();

      const experience: ProfileExperience[] = [];
      $('#experience ~ div ul > li, [data-section="experience"] li')
        .slice(0, 10)
        .each((_, el) => {
          const $el = $(el);
          experience.push({
            title: $el.find('span[aria-hidden="true"]').first().text().trim(),
            company: $el.find('span.t-14.t-normal').first().text().trim(),
            startDate: '',
            endDate: null,
            location: '',
            description: '',
          });
        });

      const education: ProfileEducation[] = [];
      $('#education ~ div ul > li, [data-section="education"] li')
        .slice(0, 5)
        .each((_, el) => {
          education.push({
            school: $(el).find('span[aria-hidden="true"]').first().text().trim(),
            degree: undefined,
            field: undefined,
            startYear: 0,
            endYear: null,
          });
        });

      const skills: string[] = [];
      $('#skills ~ div ul > li span[aria-hidden="true"]')
        .slice(0, 20)
        .each((_, el) => {
          const t = $(el).text().trim();
          if (t) skills.push(t);
        });

      return {
        url: profileUrl,
        publicId: slug,
        fullName,
        headline,
        location,
        currentCompany: experience[0]?.company || null,
        currentRole: experience[0]?.title || null,
        summary: '',
        experience,
        education,
        skills,
        fetchedAt: new Date().toISOString(),
      };
    },
  });

  logger.info({ accountId, slug, name: data.fullName }, 'profile scrape ok (HTML)');
  return data;
}

/** Extract `/in/<slug>` from a LinkedIn profile URL. Throws if not matched. */
export function extractPublicId(url: string): string {
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!m) throw new AppError('VALIDATION_FAIL', `Not a LinkedIn profile URL: ${url}`);
  return m[1]!.toLowerCase();
}
