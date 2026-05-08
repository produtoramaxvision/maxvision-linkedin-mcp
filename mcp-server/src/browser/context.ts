/**
 * Cookie hydration helper — Sprint 1.5.3.
 *
 * Decrypts the account's li_at and writes it into a BrowserContext via
 * `addCookies`. Used by browser/pool.ts after launchPersistentContext returns
 * (or whenever cookie rotation is needed).
 *
 * The pool now owns context lifetime via launchPersistentContext per
 * accountId, so this module shrinks to a pure cookie-injection function.
 */
import type { BrowserContext } from 'patchright';
import { decryptCookie } from '../auth/cookies.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

const LINKEDIN_COOKIE_DOMAIN = '.linkedin.com';

export async function hydrateLinkedInCookie(
  ctx: BrowserContext,
  accountId: string,
  cookieBlob: Buffer,
): Promise<void> {
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

  await ctx.addCookies([
    {
      name: 'li_at',
      value: cookieValue,
      domain: LINKEDIN_COOKIE_DOMAIN,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'None',
    },
  ]);

  logger.debug({ accountId }, 'browser context hydrated with li_at cookie');
}
