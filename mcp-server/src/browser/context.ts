/**
 * Per-account browser context creation.
 *
 * Decrypts the account's li_at cookie, opens a fresh BrowserContext on the
 * shared Patchright Browser (managed by browser/pool.ts), applies anti-detect
 * init scripts, and hydrates the LinkedIn session cookie.
 *
 * Does NOT manage lifetime — the pool owns when to close the context.
 */
import type { Browser, BrowserContext } from 'patchright';
import { applyAntiDetect, contextDefaults } from './anti-detect.js';
import { decryptCookie } from '../auth/cookies.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

export async function createContextForAccount(
  browser: Browser,
  accountId: string,
  cookieBlob: Buffer,
  cookieDomain = '.linkedin.com',
): Promise<BrowserContext> {
  const ctx = await browser.newContext(contextDefaults);
  await applyAntiDetect(ctx);

  let cookieValue: string;
  try {
    cookieValue = decryptCookie(cookieBlob);
  } catch (err) {
    throw new AppError(
      'COOKIE_DECRYPT_FAIL',
      `Cannot decrypt cookie for ${accountId}`,
      { accountId },
      err,
    );
  }

  // li_at is the LinkedIn session cookie. Hydrate before any navigation so
  // the first request lands authenticated and avoids the public-facing
  // pre-login redirect chain (which sometimes triggers extra fingerprinting).
  await ctx.addCookies([
    {
      name: 'li_at',
      value: cookieValue,
      domain: cookieDomain,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'None',
    },
  ]);

  logger.debug({ accountId }, 'browser context hydrated with li_at cookie');
  return ctx;
}
