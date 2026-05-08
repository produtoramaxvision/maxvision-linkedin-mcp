#!/usr/bin/env tsx
/**
 * capture-cookie — interactive LinkedIn cookie refresh.
 *
 * Standalone CLI run on the user's laptop. Spawns Patchright headed Chrome,
 * polls for `li_at`, validates via /feed nav, POSTs the raw cookie to the
 * server admin endpoint (where it is encrypted at rest with AES-256-GCM).
 *
 * IMPORTANT: this script must NOT import server modules (env.ts, db, auth/*).
 * Server modules require server-only env (MASTER_KEY, DATABASE_URL etc.) that
 * is intentionally not present on user laptops.
 *
 * Usage:
 *   pnpm capture-cookie [--account-id default] [--display-name "Sandbox"] \
 *                       [--server <url>] [--expires-days 90]
 *
 * Requires env: MAXVISION_API_KEY (Bearer token for server admin endpoint).
 * Requires Chromium installed: npx patchright install chromium
 *
 * Exit codes:
 *   0  success
 *   2  MAXVISION_API_KEY missing
 *   3  login timeout (5 min)
 *   4  cookie validation failed (LinkedIn redirected to authwall)
 *   5  server 4xx (auth invalid, body malformed)
 *   6  server 5xx after 3 retries
 *   7  Patchright launch failed (Chromium missing)
 */
import { parseArgs } from 'node:util';
import { chromium, type BrowserContext, type Page } from 'patchright';

interface LinkedInCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

interface AdminCookieResponse {
  accountId: string;
  expiresAt: string;
}

const SERVER_DEFAULT = 'https://linkedin-mcp.produtoramaxvision.com.br';
const LOGIN_URL = 'https://www.linkedin.com/login';
const FEED_URL = 'https://www.linkedin.com/feed/';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 min
const PROGRESS_LOG_INTERVAL_MS = 30 * 1000; // 30 s
const PROFILE_DIR = './.cookie-capture-profile';

function fail(code: number, msg: string): never {
  console.error(`[capture-cookie] ERROR exit=${code}: ${msg}`);
  process.exit(code);
}

function log(msg: string): void {
  console.log(`[capture-cookie] ${msg}`);
}

/**
 * Poll until login completes. Detection signals (any of):
 *   - li_at cookie present with len > 80   (logged-in session token)
 *   - li_rm cookie present with len > 80   (long-lived remember-me token —
 *     Linkedin sometimes only sets li_rm after first session settles)
 *
 * Returns ALL linkedin.com cookies once login is detected. Caller ships the
 * full set to the server because LinkedIn binds session validation to a
 * combination of cookies (li_at + JSESSIONID + bcookie + bscookie + lidc),
 * not just li_at.
 */
async function pollForLogin(context: BrowserContext): Promise<LinkedInCookie[]> {
  const startedAt = Date.now();
  let lastProgressLog = startedAt;
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const cookies = (await context.cookies('https://www.linkedin.com')) as LinkedInCookie[];
    const authed = cookies.find(
      (c) =>
        (c.name === 'li_at' || c.name === 'li_rm') &&
        typeof c.value === 'string' &&
        c.value.length > 80,
    );
    if (authed) {
      log(
        `login detected (${authed.name} length=${authed.value.length}, ` +
          `${cookies.length} total cookies for linkedin.com)`,
      );
      return cookies;
    }
    if (Date.now() - lastProgressLog > PROGRESS_LOG_INTERVAL_MS) {
      const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
      log(`still waiting for login... (${elapsedSec}s elapsed, max 300s)`);
      lastProgressLog = Date.now();
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  fail(3, 'login timeout (5min). Closed browser without logging in?');
}

async function validateCookie(page: Page): Promise<boolean> {
  try {
    await page.goto(FEED_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    // Allow brief settle for client-side redirects.
    await page.waitForTimeout(2000);
    const url = page.url();
    const isAuthRedirect =
      url.includes('/authwall') ||
      url.includes('/uas/login') ||
      url.includes('/checkpoint') ||
      url.includes('login-submit') ||
      url.endsWith('/login') ||
      url.endsWith('/login/');
    if (isAuthRedirect) {
      log(`cookie rejected — redirected to ${url}`);
      return false;
    }
    if (!url.includes('linkedin.com')) {
      log(`unexpected redirect off linkedin.com to ${url}`);
      return false;
    }
    log(`cookie validated via URL=${url}`);
    return true;
  } catch (err) {
    log(`validation error: ${(err as Error).message}`);
    return false;
  }
}

interface PostCookieArgs {
  server: string;
  apiKey: string;
  accountId: string;
  displayName: string;
  cookies: LinkedInCookie[];
  expiresInDays: number;
}

async function postCookie(args: PostCookieArgs): Promise<AdminCookieResponse> {
  const url = `${args.server}/admin/account-cookie`;
  // Strip volatile session cookies (timezone, lang, theme) — keep only the
  // auth-relevant ones the server will replay. We send all and let server
  // decide; this comment documents intent for future tuning.
  const body = JSON.stringify({
    accountId: args.accountId,
    displayName: args.displayName,
    cookies: args.cookies,
    expiresInDays: args.expiresInDays,
  });
  const baseHeaders: Record<string, string> = {
    'Authorization': `Bearer ${args.apiKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  const backoffsMs = [1000, 3000, 9000];

  for (let attempt = 0; attempt <= backoffsMs.length; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', headers: baseHeaders, body });
      if (res.ok) {
        return (await res.json()) as AdminCookieResponse;
      }
      const errBody = await res.text();
      if (res.status >= 400 && res.status < 500) {
        // 4xx — don't retry. Auth or validation error needs human action.
        fail(5, `server ${res.status}: ${errBody.slice(0, 300)}`);
      }
      // 5xx — retry.
      log(
        `server ${res.status}, attempt ${attempt + 1}/${backoffsMs.length + 1}: ${errBody.slice(0, 200)}`,
      );
    } catch (err) {
      // Network errors (DNS, connect, TLS) — retry.
      log(`network error attempt ${attempt + 1}: ${(err as Error).message}`);
    }
    if (attempt < backoffsMs.length) {
      const wait = backoffsMs[attempt]!;
      log(`retrying in ${wait}ms...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  fail(6, 'server 5xx persisted after 3 retries');
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'account-id': { type: 'string', default: 'default' },
      'display-name': { type: 'string', default: 'Default Account' },
      'server': { type: 'string', default: SERVER_DEFAULT },
      'expires-days': { type: 'string', default: '90' },
    },
    allowPositionals: true,
  });

  const accountId = values['account-id']!;
  const displayName = values['display-name']!;
  const server = values['server']!;
  const expiresInDays = Number.parseInt(values['expires-days']!, 10);
  if (!Number.isFinite(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) {
    fail(5, `--expires-days must be 1..365 (got "${values['expires-days']}")`);
  }

  const apiKey = process.env['MAXVISION_API_KEY'];
  if (!apiKey) {
    fail(2, 'MAXVISION_API_KEY env var not set. export MAXVISION_API_KEY=mxv_xxx first.');
  }

  log(`account=${accountId} server=${server} expires_in_days=${expiresInDays}`);

  let context: BrowserContext | null = null;
  try {
    log('launching Patchright headed (Chrome channel)...');
    try {
      context = await chromium.launchPersistentContext(PROFILE_DIR, {
        channel: 'chrome',
        headless: false,
        viewport: null,
      });
    } catch (err) {
      // Fallback to bundled Chromium if Chrome channel unavailable.
      log(
        `Chrome channel failed (${(err as Error).message}), falling back to bundled Chromium`,
      );
      try {
        context = await chromium.launchPersistentContext(PROFILE_DIR, {
          headless: false,
          viewport: null,
        });
      } catch (err2) {
        fail(
          7,
          `Patchright launch failed: ${(err2 as Error).message}. Try: npx patchright install chromium`,
        );
      }
    }

    if (!context) {
      // Defensive — should be unreachable because both branches above either
      // assign context or call fail() (which is `never`).
      fail(7, 'Patchright launch returned no context');
    }

    const page = context.pages()[0] ?? (await context.newPage());
    log(`navigating ${LOGIN_URL}...`);
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
    log('please log in to LinkedIn manually in the open browser window');

    // First attempt.
    let cookies = await pollForLogin(context);
    let valid = await validateCookie(page);

    // 1 retry if first attempt fails validation.
    if (!valid) {
      log('cookie failed validation — please log in again in the same browser');
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
      cookies = await pollForLogin(context);
      valid = await validateCookie(page);
      if (!valid) {
        fail(4, 'cookie validation failed twice. Account may be flagged. Wait 24h and retry.');
      }
    }

    log(`POSTing ${cookies.length} cookies to ${server}/admin/account-cookie...`);
    const result = await postCookie({
      server,
      apiKey,
      accountId,
      displayName,
      cookies,
      expiresInDays,
    });

    log(
      `OK account=${result.accountId} cookie_expires=${result.expiresAt} audit_recorded=true`,
    );
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error('[capture-cookie] fatal:', err);
  process.exit(1);
});
