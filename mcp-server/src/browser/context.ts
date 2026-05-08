/**
 * Cookie hydration helper — Sprint 1.5.4 multi-cookie injection.
 *
 * Decrypts the account's encrypted cookie blob and writes it into a
 * BrowserContext via `addCookies`. The blob is JSON of an array of cookie
 * objects (Sprint 1.5.4) — capture-cookie.ts now ships ALL cookies a
 * logged-in linkedin.com session carries (li_at, JSESSIONID, bcookie,
 * bscookie, lidc, li_rm, ...), not just li_at, because LinkedIn 2026 binds
 * session validation to the full cookie set.
 *
 * Backwards compat: if the decrypted blob is NOT JSON (legacy Sprint 1.5.1
 * single li_at string), treat it as li_at value and wrap into a single-cookie
 * array. This lets existing accounts with old-format cookies keep working
 * until the user re-runs `/linkedin-cookie-refresh`.
 */
import type { BrowserContext } from 'patchright';
import { decryptCookie } from '../auth/cookies.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

interface LinkedInCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  expires?: number;
}

const LEGACY_COOKIE_DEFAULTS = {
  domain: '.linkedin.com',
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'None' as const,
};

function parseCookieBlob(plaintext: string, accountId: string): LinkedInCookie[] {
  // Try Sprint 1.5.4 JSON-array shape first.
  const trimmed = plaintext.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as LinkedInCookie[];
      }
    } catch {
      // fall through to legacy
    }
  }
  // Legacy: single li_at value string.
  logger.info({ accountId }, 'cookie blob is legacy format — wrapping as single li_at');
  return [
    {
      name: 'li_at',
      value: plaintext,
      ...LEGACY_COOKIE_DEFAULTS,
    },
  ];
}

export async function hydrateLinkedInCookie(
  ctx: BrowserContext,
  accountId: string,
  cookieBlob: Buffer,
): Promise<void> {
  let plaintext: string;
  try {
    plaintext = decryptCookie(cookieBlob);
  } catch (err) {
    throw new AppError(
      'COOKIE_DECRYPT_FAIL',
      `Cannot decrypt cookie for ${accountId}`,
      { accountId },
      err,
    );
  }

  const cookies = parseCookieBlob(plaintext, accountId);
  // Patchright addCookies wants `path` always set; default '/' for any
  // entries that lack it (legacy or partial captures).
  const normalized = cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path ?? '/',
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite,
    expires: c.expires,
  }));
  await ctx.addCookies(normalized);

  logger.info({ accountId, count: normalized.length }, 'browser context hydrated with cookies');
}
