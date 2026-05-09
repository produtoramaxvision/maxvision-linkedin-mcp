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
  /** Verified work emails — populated only when Apify enrichment is enabled. */
  emails?: string[];
  fetchedAt: string;
}

const BD_DATASET_ID = process.env['BRIGHTDATA_LINKEDIN_PROFILE_DATASET_ID'] ?? 'gd_l1viktl72bvl7bjuj0';
const BD_SCRAPER_ENDPOINT = 'https://api.brightdata.com/datasets/v3/scrape';
/**
 * Apify profile scraper actor. Default `harvestapi/linkedin-profile-scraper`
 * (LpVuK3Zozwuipa5bp): $4/1k profile-only, $10/1k +email, no cookies needed,
 * returns 50+ fields including skills (with endorsement counts), certifications,
 * projects, languages, volunteer, courses, publications, honors. Strictly
 * better than dev_fusion (single $10/1k flat) for our use case.
 *
 * Operator can override via APIFY_LINKEDIN_PROFILE_ACTOR env if a different
 * actor better fits their workflow (e.g. `dev_fusion~linkedin-profile-scraper`
 * for legacy compat).
 */
const APIFY_PROFILE_ACTOR = process.env['APIFY_LINKEDIN_PROFILE_ACTOR'] ?? 'harvestapi~linkedin-profile-scraper';
const APIFY_INCLUDE_EMAIL = process.env['APIFY_LINKEDIN_PROFILE_INCLUDE_EMAIL'] !== 'false';
const APIFY_RUN_ENDPOINT = 'https://api.apify.com/v2/acts';

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

/**
 * Enrich a profile with Apify dev_fusion linkedin-profile-scraper output.
 *
 * BrightData LinkedIn Profile dataset does NOT return `skills` array nor
 * verified work emails — confirmed empirically by inspecting the JSON
 * payload top-level keys. Apify's `dev_fusion/linkedin-profile-scraper`
 * actor returns both. We run this in parallel with the BD call so the
 * combined latency stays close to the slower of the two.
 *
 * Pricing: Apify charges $10/1000 successful results (~$0.01 per profile).
 * Combined with BD ($1.50/1k = $0.0015), the hybrid path costs ~$11.50/1k
 * profiles for the full superset (BD's 50+ fields + Apify's skills + email).
 *
 * Failure mode: if Apify call fails, we log and proceed with BD-only data —
 * skills/emails stay empty rather than failing the whole request.
 */
/**
 * Single-call profile scrape via Apify (harvestapi by default).
 *
 * Replaces the BD + dev_fusion hybrid path: harvestapi alone returns the full
 * superset (50+ fields + skills + email + certifications + projects) at lower
 * cost ($4-10/1k vs $11.50/1k for the hybrid). BrightData LinkedIn People
 * Profile dataset is therefore unused for `get_profile` — BD remains in the
 * stack only as a Web Unlocker proxy for `search_jobs` / `get_job_details`
 * which need rendered HTML (no scraper API alternative).
 */
async function scrapeProfileViaApifyOnly(args: {
  profileUrl: string;
  slug: string;
  apifyToken: string;
}): Promise<ProfileData> {
  const { profileUrl, slug, apifyToken } = args;
  const url =
    `${APIFY_RUN_ENDPOINT}/${encodeURIComponent(APIFY_PROFILE_ACTOR)}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(apifyToken)}&format=json`;

  // harvestapi/linkedin-profile-scraper input schema (validated 2026-05-09):
  //   queries: string[]                — LinkedIn URLs (NOT `profileUrls`)
  //   profileScraperMode: enum         — exact strings:
  //     "Profile details no email ($4 per 1k)"
  //     "Profile details + email search ($10 per 1k)"
  // Operator opt-out via APIFY_LINKEDIN_PROFILE_INCLUDE_EMAIL=false.
  const body = {
    queries: [profileUrl],
    profileScraperMode: APIFY_INCLUDE_EMAIL
      ? 'Profile details + email search ($10 per 1k)'
      : 'Profile details no email ($4 per 1k)',
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new AppError(
      'EXTERNAL_API_FAIL',
      `Apify ${res.status} (${APIFY_PROFILE_ACTOR}): ${errBody.slice(0, 300)}`,
      { status: res.status, actor: APIFY_PROFILE_ACTOR },
    );
  }

  const items = (await res.json()) as Array<Record<string, unknown>>;
  const record = items[0];
  if (!record) {
    throw new AppError(
      'EXTERNAL_API_FAIL',
      `Apify returned empty payload for ${profileUrl}`,
      { actor: APIFY_PROFILE_ACTOR, profileUrl },
    );
  }

  return mapApifyHarvestProfile(record, profileUrl, slug);
}

/**
 * Map harvestapi/linkedin-profile-scraper output to internal ProfileData.
 *
 * Schema reference (validated 2026-05-09 from actor metadata):
 *   - Top-level: id, name, headline, about, location, currentPosition,
 *     experience[], education[], skills[], certifications[], projects[],
 *     volunteer[], languages[], honors[], courses[], publications[],
 *     emails (array of strings if available), publicIdentifier, url.
 */
function mapApifyHarvestProfile(raw: Record<string, unknown>, profileUrl: string, slug: string): ProfileData {
  const get = <T>(key: string): T | undefined => raw[key] as T | undefined;
  const str = (v: unknown): string => (v == null ? '' : String(v));

  // Experience entries from harvestapi have shape:
  //   { position, companyName, companyLinkedinUrl, employmentType,
  //     workplaceType, duration, description, location, ... }
  const exp = (get<unknown[]>('experience') ?? []) as Array<Record<string, unknown>>;
  const experience: ProfileExperience[] = exp.slice(0, 25).map((e) => ({
    title: str(e['position'] ?? e['title']),
    company: str(e['companyName'] ?? e['company']),
    startDate: str(e['startDate'] ?? e['duration']),
    endDate: e['endDate'] != null ? str(e['endDate']) : null,
    location: str(e['location']),
    description: str(e['description']),
  }));

  // Education entries: { schoolName, degree, fieldOfStudy, startDate, endDate }
  const edu = (get<unknown[]>('education') ?? []) as Array<Record<string, unknown>>;
  const education: ProfileEducation[] = edu.slice(0, 15).map((ed) => ({
    school: str(ed['schoolName'] ?? ed['school'] ?? ed['title']),
    degree: ed['degree'] != null ? str(ed['degree']) : undefined,
    field: ed['fieldOfStudy'] != null ? str(ed['fieldOfStudy']) : (ed['field'] != null ? str(ed['field']) : undefined),
    startYear: parseYear(ed['startDate'] ?? ed['startYear']),
    endYear: ed['endDate'] != null ? parseYear(ed['endDate']) : (ed['endYear'] != null ? parseYear(ed['endYear']) : null),
  }));

  // Skills entries: { name: "SaaS", endorsements: "92 endorsements" }
  const skillsRaw = (get<unknown[]>('skills') ?? []) as Array<Record<string, unknown> | string>;
  const skills: string[] = skillsRaw
    .slice(0, 50)
    .map((s) => (typeof s === 'string' ? s : str((s as Record<string, unknown>)['name'] ?? (s as Record<string, unknown>)['title'])))
    .filter((s) => s.length > 0);

  // emails from harvestapi is `emails: string[]` directly.
  const emailsRaw = get<unknown[]>('emails');
  const emails: string[] = Array.isArray(emailsRaw)
    ? emailsRaw.filter((e): e is string => typeof e === 'string' && e.includes('@'))
    : [];

  // currentPosition is an ARRAY in harvestapi (multiple concurrent roles
  // like board memberships). First entry = primary current role.
  const currentPosArr = (get<unknown[]>('currentPosition') ?? []) as Array<Record<string, unknown>>;
  const cp = currentPosArr[0];
  const currentCompany = cp ? str(cp['companyName']) : (experience[0]?.company ?? '');
  const currentRole = cp ? str(cp['position']) : (experience[0]?.title ?? '');

  // location is an object: { linkedinText, countryCode, parsed: {...} }
  const locObj = get<Record<string, unknown>>('location');
  const location = locObj ? str(locObj['linkedinText']) : str(get('locationText'));

  // fullName from firstName + lastName
  const firstName = str(get('firstName'));
  const lastName = str(get('lastName'));
  const fullName = firstName || lastName ? `${firstName} ${lastName}`.trim() : str(get('name') ?? get('fullName'));

  return {
    url: str(get('linkedinUrl')) || profileUrl,
    publicId: str(get('publicIdentifier')) || slug,
    fullName,
    headline: str(get('headline')),
    location,
    currentCompany: currentCompany || null,
    currentRole: currentRole || null,
    summary: str(get('about') ?? get('summary') ?? get('bio')),
    experience,
    education,
    skills,
    ...(emails.length > 0 ? { emails: Array.from(new Set(emails)) } : {}),
    fetchedAt: new Date().toISOString(),
  };
}

async function enrichProfileViaApify(args: {
  profileUrl: string;
  apifyToken: string;
}): Promise<{ skills: string[]; emails: string[] }> {
  const { profileUrl, apifyToken } = args;
  const url =
    `${APIFY_RUN_ENDPOINT}/${encodeURIComponent(APIFY_PROFILE_ACTOR)}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(apifyToken)}&format=json`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      profileUrls: [profileUrl],
      maxItems: 1,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new AppError(
      'EXTERNAL_API_FAIL',
      `Apify ${res.status}: ${errBody.slice(0, 300)}`,
      { status: res.status, actor: APIFY_PROFILE_ACTOR },
    );
  }

  const items = (await res.json()) as Array<Record<string, unknown>>;
  const record = items[0];
  if (!record) return { skills: [], emails: [] };

  const skillsRaw = record['skills'];
  let skills: string[] = [];
  if (Array.isArray(skillsRaw)) {
    skills = skillsRaw
      .map((s) => {
        if (typeof s === 'string') return s;
        if (s && typeof s === 'object' && 'title' in s) return String((s as Record<string, unknown>)['title'] ?? '');
        if (s && typeof s === 'object' && 'name' in s) return String((s as Record<string, unknown>)['name'] ?? '');
        return '';
      })
      .filter((s) => s.length > 0)
      .slice(0, 50);
  }

  const emails: string[] = [];
  const emailFields = ['email', 'workEmail', 'verifiedEmail', 'emails'];
  for (const f of emailFields) {
    const v = record[f];
    if (typeof v === 'string' && v.includes('@')) emails.push(v);
    if (Array.isArray(v)) {
      for (const e of v) {
        if (typeof e === 'string' && e.includes('@')) emails.push(e);
      }
    }
  }

  return { skills, emails: Array.from(new Set(emails)) };
}

export async function scrapeProfile(args: {
  accountId: string;
  profileUrl: string;
}): Promise<ProfileData> {
  const { accountId, profileUrl } = args;
  const slug = extractPublicId(profileUrl);

  const apifyToken = process.env['APIFY_TOKEN'];
  const bdToken = process.env['BRIGHTDATA_API_TOKEN'];

  // Path A (preferred) — Apify harvestapi/linkedin-profile-scraper single call
  // returns the full superset (50+ fields + skills + email + certifications +
  // projects). Cheaper and richer than the BD + dev_fusion hybrid for the same
  // dataset. Configurable actor via APIFY_LINKEDIN_PROFILE_ACTOR.
  if (apifyToken) {
    logger.info(
      { accountId, profileUrl, slug, backend: 'apify', actor: APIFY_PROFILE_ACTOR, includeEmail: APIFY_INCLUDE_EMAIL },
      'profile fetch start (Apify single-provider)',
    );
    try {
      const data = await scrapeProfileViaApifyOnly({ profileUrl, slug, apifyToken });
      logger.info(
        {
          accountId,
          slug,
          name: data.fullName,
          fields: {
            experience: data.experience.length,
            education: data.education.length,
            skills: data.skills.length,
            emails: data.emails?.length ?? 0,
          },
        },
        'profile scrape ok via Apify',
      );
      return data;
    } catch (err) {
      logger.warn(
        { accountId, slug, err: err instanceof Error ? err.message : String(err) },
        'Apify profile scrape failed — falling back to BrightData (if configured) or HTML',
      );
      // Fall through to Path B (BD) or Path C (HTML)
    }
  }

  // Path B (legacy hybrid) — BrightData LinkedIn People Profile dataset.
  // Kept for operators who configured BD before Sprint 6.8 or who want to skip
  // Apify entirely. BD alone returns 50+ fields but no skills/emails — these
  // arrays will be empty unless Apify fallback enrichment runs.
  if (bdToken) {
    logger.info(
      { accountId, profileUrl, slug, backend: 'brightdata-scraper-api' },
      'profile fetch start (BrightData fallback)',
    );
    try {
      const data = await scrapeProfileViaBrightDataAPI({ profileUrl, slug, apiToken: bdToken });
      logger.info(
        { accountId, slug, name: data.fullName, fields: { experience: data.experience.length, education: data.education.length, skills: data.skills.length } },
        'profile scrape ok via BrightData (fallback path)',
      );
      return data;
    } catch (err) {
      logger.warn(
        { accountId, slug, err: err instanceof Error ? err.message : String(err) },
        'BrightData Scraper API failed — falling back to HTML scrape',
      );
      // Fall through to Path C
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
