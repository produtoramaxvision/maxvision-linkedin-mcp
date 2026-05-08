/**
 * tools/post_update — Sprint 2 feed post creation with confirm gate.
 *
 * confirm=false (default) → returns dry-run preview with character count and
 * visibility echo. No LinkedIn touch.
 *
 * confirm=true → navigates /feed, opens "Start a post" composer, types body,
 * clicks Post. Patchright-driven with hydrated cookies. Auth-only LinkedIn
 * surface — likely COOKIE_EXPIRED on server-side fingerprint mismatch (Sprint
 * 3 will gate this behind Pro tier and add custom GraphQL fallback).
 */
import { withInstrumentation } from './_base.js';
import { PostUpdateInputSchema, type PostUpdateInput } from './schemas.js';
import { browserPool } from '../browser/pool.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

export interface PostUpdateOutput {
  preview: boolean;
  posted: boolean;
  charCount: number;
  visibility: 'public' | 'connections';
  postUrn?: string;
  message: string;
}

const FEED_URL = 'https://www.linkedin.com/feed/';

export const postUpdate = withInstrumentation<PostUpdateInput, PostUpdateOutput>({
  name: 'post_update',
  description:
    'Create a new feed post (Sprint 2). Use confirm=true to actually publish; confirm=false returns preview.',
  inputSchema: PostUpdateInputSchema,
  handler: async ({ input, accountId }) => {
    if (!input.confirm) {
      return {
        preview: true,
        posted: false,
        charCount: input.text.length,
        visibility: input.visibility,
        message: `Dry-run preview. Would post ${input.text.length} chars (visibility=${input.visibility}). Re-call with confirm=true to publish.`,
      };
    }

    const { context, release } = await browserPool.acquire(accountId);
    try {
      const page = await context.newPage();
      logger.info(
        { accountId, charCount: input.text.length, visibility: input.visibility },
        'post_update nav start',
      );

      const response = await page.goto(FEED_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      if (response?.status() === 999) {
        throw new AppError('CAPTCHA_DETECTED', 'LinkedIn 999 on /feed for post_update');
      }
      if (page.url().includes('/authwall') || page.url().includes('/uas/login')) {
        throw new AppError('COOKIE_EXPIRED', `LinkedIn auth wall on /feed`, {
          redirectedTo: page.url(),
        });
      }

      // Open the composer.
      await page.click('button[aria-label*="Start a post" i], button[aria-label*="Começar um post" i]', {
        timeout: 15000,
      });
      // Type into the editor (contenteditable div role=textbox).
      await page.fill('div[role="textbox"][contenteditable="true"]', input.text);
      // Click "Post".
      await page.click('button.share-actions__primary-action, button[aria-label*="Post" i][aria-label*="now" i]', {
        timeout: 10000,
      });

      // LinkedIn shows a toast confirming. We just acknowledge submission;
      // the post URN is harder to capture without DOM observation.
      await page.waitForTimeout(2000);
      await page.close();
      logger.info({ accountId, charCount: input.text.length }, 'post_update submitted');
      return {
        preview: false,
        posted: true,
        charCount: input.text.length,
        visibility: input.visibility,
        message: 'Post submitted. Verify on your LinkedIn feed.',
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        'SCRAPER_FAIL',
        `post_update failed: ${(err as Error).message}`,
        { accountId, confirm: input.confirm },
        err,
      );
    } finally {
      release();
    }
  },
});
