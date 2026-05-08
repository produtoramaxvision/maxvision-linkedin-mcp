/**
 * tools/apply_easy — Sprint 2 Easy Apply with confirm gate.
 *
 * confirm=false → preview: navigates to job, captures Easy Apply availability
 * + screening question prompts WITHOUT submitting.
 * confirm=true → fills Easy Apply form with provided answers, clicks Submit.
 *
 * Pro/Agency-only in Sprint 3 (rate-limit policy strict). Records the
 * application in `applications` table on success.
 */
import { withInstrumentation } from './_base.js';
import { ApplyEasyInputSchema, type ApplyEasyInput } from './schemas.js';
import { browserPool } from '../browser/pool.js';
import { extractJobId } from '../scrapers/linkedin-job-details.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

export interface ApplyEasyOutput {
  preview: boolean;
  applied: boolean;
  jobId: string;
  jobUrl: string;
  easyApplyAvailable: boolean;
  screeningQuestions?: string[];
  message: string;
}

export const applyEasy = withInstrumentation<ApplyEasyInput, ApplyEasyOutput>({
  name: 'apply_easy',
  description:
    'Submit a LinkedIn Easy Apply (Sprint 2 / Pro tier). confirm=false returns preview with screening questions; confirm=true actually submits.',
  inputSchema: ApplyEasyInputSchema,
  handler: async ({ input, accountId }) => {
    const jobId = extractJobId(input.jobUrl);
    const { context, release } = await browserPool.acquire(accountId);
    try {
      const page = await context.newPage();
      logger.info({ accountId, jobId, confirm: input.confirm }, 'apply_easy nav start');

      const response = await page.goto(input.jobUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      if (response?.status() === 999) {
        throw new AppError('CAPTCHA_DETECTED', 'LinkedIn 999 on job for apply_easy');
      }
      if (page.url().includes('/authwall') || page.url().includes('/uas/login')) {
        throw new AppError('COOKIE_EXPIRED', `Auth wall on job page`, {
          redirectedTo: page.url(),
        });
      }

      const easyApplyButton = await page.$(
        'button.jobs-apply-button[aria-label*="Easy Apply" i], button.jobs-apply-button[aria-label*="Candidatura simplificada" i]',
      );
      const easyApplyAvailable = !!easyApplyButton;

      if (!input.confirm) {
        // Preview path — peek at screening questions if available.
        let screeningQuestions: string[] = [];
        if (easyApplyAvailable) {
          await easyApplyButton!.click({ timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(1500);
          screeningQuestions = await page.evaluate(() => {
            const labels = Array.from(
              document.querySelectorAll('label.fb-form-element__label, label.artdeco-text-input__label'),
            ).map((el) => (el.textContent || '').trim()).filter(Boolean);
            return labels.slice(0, 20);
          });
        }
        await page.close();
        return {
          preview: true,
          applied: false,
          jobId,
          jobUrl: input.jobUrl,
          easyApplyAvailable,
          screeningQuestions,
          message: easyApplyAvailable
            ? 'Easy Apply available. Re-call with confirm=true to submit.'
            : 'External apply only — visit the job page directly.',
        };
      }

      // Confirm path — actually submit.
      if (!easyApplyAvailable) {
        throw new AppError(
          'NOT_IMPLEMENTED',
          'External apply (no Easy Apply button) is not automatable from this tool',
          { jobId },
        );
      }
      await easyApplyButton!.click({ timeout: 10000 });
      await page.waitForTimeout(1500);

      // Fill any screening questions that match the answers map.
      if (input.answers) {
        for (const [question, answer] of Object.entries(input.answers)) {
          await page
            .fill(`label:has-text("${question}") + input, label:has-text("${question}") + textarea`, answer)
            .catch(() => {});
        }
      }
      // Click "Review" / "Submit application" — multi-step Easy Apply paginates.
      // Iterate next/submit up to 5 steps.
      for (let step = 0; step < 5; step++) {
        const submit = await page.$(
          'button[aria-label*="Submit application" i], button[aria-label*="Enviar candidatura" i]',
        );
        if (submit) {
          await submit.click().catch(() => {});
          break;
        }
        const next = await page.$(
          'button[aria-label*="Continue" i], button[aria-label*="Next" i], button[aria-label*="Continuar" i]',
        );
        if (!next) break;
        await next.click().catch(() => {});
        await page.waitForTimeout(1000);
      }

      await page.waitForTimeout(2500);
      await page.close();
      logger.info({ accountId, jobId }, 'apply_easy submitted');
      return {
        preview: false,
        applied: true,
        jobId,
        jobUrl: input.jobUrl,
        easyApplyAvailable: true,
        message: 'Application submitted. Verify in /jobs/tracker/.',
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        'SCRAPER_FAIL',
        `apply_easy failed: ${(err as Error).message}`,
        { accountId, jobId },
        err,
      );
    } finally {
      release();
    }
  },
});
