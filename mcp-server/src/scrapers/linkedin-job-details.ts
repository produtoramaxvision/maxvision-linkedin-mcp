/**
 * LinkedIn job details scraper — Sprint 1.5 real Patchright nav.
 *
 * Acquires a per-account BrowserContext from `browserPool`, navigates to a
 * specific `/jobs/view/<id>` URL, guards against captcha (HTTP 999) and
 * authwall redirects, optionally clicks "see more" to expand description,
 * then extracts metadata via `page.evaluate`.
 *
 * Selector caveat: LinkedIn job-details DOM uses ad-hoc class names; we try
 * multiple candidates per field. Sprint 1.5.1 will validate selectors against
 * authenticated DOM with sandbox cookie.
 */
/// <reference lib="dom" />
import { browserPool } from '../browser/pool.js';
import { db } from '../db/client.js';
import { captchaEvents } from '../db/schema.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

export interface JobDetails {
  url: string;
  jobId: string;
  title: string;
  company: string;
  companyUrl?: string;
  location: string;
  postedAt: string;        // ISO
  applicants: number | null;
  salary: string | null;
  workplace: 'remote' | 'hybrid' | 'on-site' | null;
  employmentType: string | null;  // Full-time, Contract, etc.
  seniority: string | null;
  description: string;
  requirements: string[];
  easyApply: boolean;
  hiringManager: { name: string; title: string } | null;
  fetchedAt: string;
}

export async function scrapeJobDetails(args: {
  accountId: string;
  jobUrl: string;
}): Promise<JobDetails> {
  const { accountId, jobUrl } = args;
  const jobId = extractJobId(jobUrl);
  const acquired = await browserPool.acquire(accountId);
  const { context, release } = acquired;

  try {
    const page = await context.newPage();
    logger.info({ accountId, jobUrl, jobId }, 'job-details nav start');

    const response = await page.goto(jobUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    if (response?.status() === 999) {
      await db
        .insert(captchaEvents)
        .values({ accountId, context: 'job_details', resolved: false })
        .catch(() => {});
      throw new AppError('CAPTCHA_DETECTED', `LinkedIn 999 on job details`, { url: jobUrl });
    }
    if (
      page.url().includes('/authwall') ||
      page.url().includes('/login') ||
      page.url().includes('/checkpoint')
    ) {
      throw new AppError('COOKIE_EXPIRED', `LinkedIn auth wall on job details`, {
        redirectedTo: page.url(),
      });
    }

    // Wait for the job details panel. Sprint 1.5.6: server-side LinkedIn
    // returns the GUEST layout (pageKey=d_jobs_guest_details), not the
    // authenticated app shell — even with cookies. Validated via inspect-job
    // utility against /jobs/view/4407946949 from the live container.
    await page.waitForSelector(
      'h1.top-card-layout__title, h1.t-24, h1, main',
      { timeout: 30000, state: 'attached' },
    );

    // Try expanding description if "see more" button is present. Optional —
    // failure here must not abort the scrape.
    await page
      .click('button[aria-label*="see more" i]', { timeout: 2500 })
      .catch(() => {});

    const data: JobDetails = await page.evaluate(
      (params: { url: string; jobId: string }) => {
        const text = (sel: string): string =>
          document.querySelector(sel)?.textContent?.trim() || '';

        const title =
          text('h1.top-card-layout__title') ||
          text('h1.t-24') ||
          text('h1');

        // Sprint 1.5.6: server-side guest layout uses .topcard__flavor for
        // company name (first .topcard__flavor item) and .topcard__flavor--bullet
        // for location. The auth layout would have a.app-aware-link inside the
        // top card; we keep both as fallbacks.
        const companyEl = document.querySelector(
          'a.topcard__org-name-link, a.app-aware-link[href*="/company/"], .top-card-layout__entity-info a',
        ) as HTMLAnchorElement | null;
        const topcardFlavors = Array.from(document.querySelectorAll('.topcard__flavor'))
          .map((el) => el.textContent?.trim() || '')
          .filter(Boolean);
        const company =
          companyEl?.textContent?.trim() ||
          topcardFlavors[0] ||
          '';
        const companyUrl = companyEl?.href || undefined;

        // Location: guest layout = .topcard__flavor--bullet (or 2nd flavor).
        // Auth layout = span.tvm__text scanned by content.
        let location =
          text('.topcard__flavor--bullet') ||
          topcardFlavors[1] ||
          '';

        // Posted age: guest = .posted-time-ago__text. Auth = span.tvm__text.
        const postedRaw =
          text('.posted-time-ago__text') ||
          (() => {
            const tvm = Array.from(document.querySelectorAll('span.tvm__text'))
              .map((el) => el.textContent?.trim() || '');
            return (
              tvm.find((t) =>
                /(ago|hour|day|week|month|atrás|hora|dia|semana|mês)/i.test(t),
              ) || ''
            );
          })();

        // Applicants count: guest = .num-applicants__caption. Auth = tvm__text.
        const applicantsRaw =
          text('.num-applicants__caption') ||
          (() => {
            const tvm = Array.from(document.querySelectorAll('span.tvm__text'))
              .map((el) => el.textContent?.trim() || '');
            return tvm.find((t) => /applicants?|candidatura/i.test(t)) || '';
          })();

        // Workplace tag — usually only present on auth layout.
        const workplaceRaw = (() => {
          const tvm = Array.from(document.querySelectorAll('span.tvm__text'))
            .map((el) => el.textContent?.trim() || '');
          return (
            tvm.find((t) =>
              /(remote|hybrid|on-?site|remoto|híbrido|presencial)/i.test(t),
            ) || ''
          );
        })();

        const applicantsMatch = applicantsRaw.match(/(\d[\d,.]*)/);
        const applicants = applicantsMatch
          ? parseInt(applicantsMatch[1]!.replace(/[.,]/g, ''), 10)
          : null;

        let workplace: 'remote' | 'hybrid' | 'on-site' | null = null;
        const wlow = workplaceRaw.toLowerCase();
        if (/remot/i.test(wlow)) workplace = 'remote';
        else if (/hybrid|híbrid/i.test(wlow)) workplace = 'hybrid';
        else if (/on-?site|presencial/i.test(wlow)) workplace = 'on-site';

        // Salary — scan text for currency markers near the top of the card.
        const top =
          document.querySelector(
            '.jobs-unified-top-card, .top-card-layout__card, .job-details-jobs-unified-top-card',
          )?.textContent || '';
        const salaryMatch = top.match(
          /(R\$|US\$|\$|€|EUR|BRL)\s?[\d.,]+(?:\s*-\s*(R\$|US\$|\$|€|EUR|BRL)?\s?[\d.,]+)?(?:\s*\/?\s*(month|year|hour|mês|ano|hora))?/i,
        );
        const salary = salaryMatch ? salaryMatch[0].trim() : null;

        // Description block (after expand if present).
        const description = (
          document.querySelector(
            '.show-more-less-html__markup, .jobs-description__content, .jobs-box__html-content',
          )?.textContent || ''
        ).trim();

        // Seniority / employmentType — often appear in the criteria list.
        const criteriaItems = Array.from(
          document.querySelectorAll(
            '.description__job-criteria-item, .job-criteria__item, li.description__job-criteria-item',
          ),
        );
        let seniority: string | null = null;
        let employmentType: string | null = null;
        for (const item of criteriaItems) {
          const label = (
            item.querySelector('.description__job-criteria-subheader, h3')?.textContent || ''
          ).toLowerCase();
          const value = (
            item.querySelector('.description__job-criteria-text, span')?.textContent || ''
          ).trim();
          if (/senior|nível|level/i.test(label) && !seniority) seniority = value;
          else if (/employment|tipo|type/i.test(label) && !employmentType) employmentType = value;
        }

        // Requirements heuristic — pull bullet items inside the description.
        const requirements: string[] = Array.from(
          document.querySelectorAll(
            '.show-more-less-html__markup li, .jobs-description__content li',
          ),
        )
          .slice(0, 20)
          .map((el) => el.textContent?.trim() || '')
          .filter(Boolean);

        // Easy Apply detection — explicit Easy Apply button vs external apply.
        const easyApply =
          !!document.querySelector(
            'button.jobs-apply-button[aria-label*="Easy Apply" i], button.jobs-apply-button[aria-label*="Candidatura simplificada" i]',
          );

        return {
          url: params.url,
          jobId: params.jobId,
          title,
          company,
          companyUrl,
          location,
          postedAt: new Date().toISOString(),
          applicants,
          salary,
          workplace,
          employmentType,
          seniority,
          description,
          requirements,
          easyApply,
          hiringManager: null,
          fetchedAt: new Date().toISOString(),
        };
      },
      { url: jobUrl, jobId },
    );

    await page.close();
    logger.info(
      { accountId, jobId, title: data.title, company: data.company },
      'job-details scrape ok',
    );
    return data;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'SCRAPER_FAIL',
      `job-details scrape failed: ${(err as Error).message}`,
      { jobUrl },
      err,
    );
  } finally {
    release();
  }
}

/** Extract numeric jobId from `/jobs/view/<id>` LinkedIn URL. Throws if not matched. */
export function extractJobId(url: string): string {
  const m = url.match(/\/jobs\/view\/(\d+)/i);
  if (!m) throw new AppError('VALIDATION_FAIL', `Not a LinkedIn job URL: ${url}`);
  return m[1]!;
}
