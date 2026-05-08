/**
 * LinkedIn profile scraper — Sprint 1.5 real Patchright nav.
 *
 * Acquires a per-account BrowserContext from `browserPool`, navigates to the
 * profile URL, guards against captcha (HTTP 999) and authwall redirects, and
 * extracts profile sections via `page.evaluate`.
 *
 * Selector caveat: LinkedIn profile DOM uses ad-hoc class names ("text-heading-xlarge",
 * etc.) that mutate frequently. We try multiple candidates per field. Sprint
 * 1.5.1 will validate selectors against authenticated DOM with sandbox cookie.
 */
/// <reference lib="dom" />
import { browserPool } from '../browser/pool.js';
import { db } from '../db/client.js';
import { captchaEvents } from '../db/schema.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

export interface ProfileExperience {
  title: string;
  company: string;
  startDate: string;       // ISO YYYY-MM
  endDate: string | null;  // null = current
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
  publicId: string;        // slug from /in/<slug>
  fullName: string;
  headline: string;
  location: string;
  currentCompany: string | null;
  currentRole: string | null;
  summary: string;
  experience: ProfileExperience[];
  education: ProfileEducation[];
  skills: string[];
  fetchedAt: string;       // ISO 8601
}

export async function scrapeProfile(args: {
  accountId: string;
  profileUrl: string;
}): Promise<ProfileData> {
  const { accountId, profileUrl } = args;
  const slug = extractPublicId(profileUrl);
  const acquired = await browserPool.acquire(accountId);
  const { context, release } = acquired;

  try {
    const page = await context.newPage();
    logger.info({ accountId, profileUrl, slug }, 'profile nav start');

    const response = await page.goto(profileUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    if (response?.status() === 999) {
      await db
        .insert(captchaEvents)
        .values({ accountId, context: 'profile_view', resolved: false })
        .catch(() => {});
      throw new AppError('CAPTCHA_DETECTED', `LinkedIn 999 on profile`, { url: profileUrl });
    }
    if (page.url().includes('/authwall') || page.url().includes('/login')) {
      throw new AppError('COOKIE_EXPIRED', `LinkedIn auth wall on profile`, {
        redirectedTo: page.url(),
      });
    }

    // TODO Sprint 1.5.1: validate selectors with sandbox cookie.
    // Profile sections in 2025-2026 use shadow-DOM-ish containers; main selectors:
    //   h1.text-heading-xlarge — full name
    //   div.text-body-medium — headline (sub h1)
    //   #experience section, #education section, #skills section
    await page.waitForSelector('h1, main', { timeout: 15000 });

    const data: ProfileData = await page.evaluate((s: string) => {
      const text = (sel: string): string =>
        document.querySelector(sel)?.textContent?.trim() || '';
      const all = (sel: string): Element[] => Array.from(document.querySelectorAll(sel));

      const fullName = text('h1.text-heading-xlarge') || text('h1');
      const headline = text('div.text-body-medium.break-words');
      const location = text('span.text-body-small.inline.t-black--light.break-words');

      const experience: Array<{
        title: string;
        company: string;
        startDate: string;
        endDate: string | null;
        location: string;
        description: string;
      }> = all('#experience ~ div ul > li, [data-section="experience"] li')
        .slice(0, 10)
        .map((li) => ({
          title: (li.querySelector('span[aria-hidden="true"]')?.textContent || '').trim(),
          company: (li.querySelectorAll('span.t-14.t-normal')[0]?.textContent || '').trim(),
          startDate: '',
          endDate: null,
          location: '',
          description: '',
        }));

      const education: Array<{
        school: string;
        degree: string | undefined;
        field: string | undefined;
        startYear: number;
        endYear: number | null;
      }> = all('#education ~ div ul > li, [data-section="education"] li')
        .slice(0, 5)
        .map((li) => ({
          school: (li.querySelector('span[aria-hidden="true"]')?.textContent || '').trim(),
          degree: undefined,
          field: undefined,
          startYear: 0,
          endYear: null,
        }));

      const skills: string[] = all('#skills ~ div ul > li span[aria-hidden="true"]')
        .slice(0, 20)
        .map((el) => el.textContent?.trim() || '')
        .filter(Boolean);

      return {
        url: window.location.href,
        publicId: s,
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
    }, slug);

    await page.close();
    logger.info({ accountId, slug, name: data.fullName }, 'profile scrape ok');
    return data;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'SCRAPER_FAIL',
      `profile scrape failed: ${(err as Error).message}`,
      { profileUrl },
      err,
    );
  } finally {
    release();
  }
}

/** Extract `/in/<slug>` from a LinkedIn profile URL. Throws if not matched. */
export function extractPublicId(url: string): string {
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!m) throw new AppError('VALIDATION_FAIL', `Not a LinkedIn profile URL: ${url}`);
  return m[1]!.toLowerCase();
}
