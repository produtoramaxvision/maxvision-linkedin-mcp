/**
 * LinkedIn profile scraper — Sprint 6.2 backend-aware.
 *
 * Routes through fetchAndParse() which selects Patchright (Free, blocked
 * by authwall server-side) or Scrapfly/BrightData (Pro/Agency, bypasses
 * authwall via residential proxy + JA3 spoof + JS render).
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

export async function scrapeProfile(args: {
  accountId: string;
  profileUrl: string;
}): Promise<ProfileData> {
  const { accountId, profileUrl } = args;
  const slug = extractPublicId(profileUrl);
  logger.info({ accountId, profileUrl, slug }, 'profile fetch start');

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

  logger.info({ accountId, slug, name: data.fullName }, 'profile scrape ok');
  return data;
}

/** Extract `/in/<slug>` from a LinkedIn profile URL. Throws if not matched. */
export function extractPublicId(url: string): string {
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!m) throw new AppError('VALIDATION_FAIL', `Not a LinkedIn profile URL: ${url}`);
  return m[1]!.toLowerCase();
}
