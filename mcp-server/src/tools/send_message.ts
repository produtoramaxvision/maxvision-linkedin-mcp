/**
 * tools/send_message — Sprint 2 DM/InMail with confirm gate.
 *
 * confirm=false → preview only.
 * confirm=true → navigates to recipient profile, clicks message, sends.
 *
 * Pro/Agency-only in Sprint 3 (rate-limit policy is already strict).
 */
import { withInstrumentation } from './_base.js';
import { SendMessageInputSchema, type SendMessageInput } from './schemas.js';
import { browserPool } from '../browser/pool.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

export interface SendMessageOutput {
  preview: boolean;
  sent: boolean;
  recipient: string;
  bodyLength: number;
  message: string;
}

export const sendMessage = withInstrumentation<SendMessageInput, SendMessageOutput>({
  name: 'send_message',
  description:
    'Send a DM/InMail to a LinkedIn user (Sprint 2 / Pro tier). Use confirm=true to actually send.',
  inputSchema: SendMessageInputSchema,
  handler: async ({ input, accountId }) => {
    if (!input.confirm) {
      return {
        preview: true,
        sent: false,
        recipient: input.recipientUrl,
        bodyLength: input.body.length,
        message: `Dry-run preview. Would send ${input.body.length} chars to ${input.recipientUrl}. Re-call with confirm=true.`,
      };
    }

    const { context, release } = await browserPool.acquire(accountId);
    try {
      const page = await context.newPage();
      logger.info(
        { accountId, recipient: input.recipientUrl, bodyLen: input.body.length },
        'send_message nav start',
      );

      const response = await page.goto(input.recipientUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      if (response?.status() === 999) {
        throw new AppError('CAPTCHA_DETECTED', 'LinkedIn 999 on profile for send_message');
      }
      if (page.url().includes('/authwall') || page.url().includes('/uas/login')) {
        throw new AppError('COOKIE_EXPIRED', `Auth wall on profile`, {
          redirectedTo: page.url(),
        });
      }

      // Click message button (PT and EN labels covered).
      await page.click(
        'button[aria-label*="Message" i], button[aria-label*="Mensagem" i], a[href*="/messaging/"]',
        { timeout: 15000 },
      );
      // Subject (InMail only).
      if (input.subject) {
        await page
          .fill('input[name="subject"], input[aria-label*="Subject" i]', input.subject)
          .catch(() => {});
      }
      // Body editor.
      await page.fill('div[role="textbox"][contenteditable="true"]', input.body);
      // Send button.
      await page.click('button[aria-label*="Send" i], button[aria-label*="Enviar" i]', {
        timeout: 10000,
      });
      await page.waitForTimeout(1500);
      await page.close();
      logger.info({ accountId }, 'send_message sent');
      return {
        preview: false,
        sent: true,
        recipient: input.recipientUrl,
        bodyLength: input.body.length,
        message: 'Message sent. Verify in /messaging/.',
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        'SCRAPER_FAIL',
        `send_message failed: ${(err as Error).message}`,
        { accountId },
        err,
      );
    } finally {
      release();
    }
  },
});
