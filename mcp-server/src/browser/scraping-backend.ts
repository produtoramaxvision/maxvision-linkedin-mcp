/**
 * Scraping backend abstraction — Sprint 6.1 — addresses LinkedIn 2026
 * server-side authwall on `/in/<slug>`, `/feed`, `/search/results/people`.
 *
 * Root cause of authwall (validated):
 *   - LinkedIn fingerprints TLS JA3 + HTTP/2 settings before request parsing.
 *   - Datacenter IP ranges (our Brazilian VPS ASN) flagged at network layer.
 *   - Server-side Linux Chromium fingerprint differs from the user's Windows
 *     Chrome that captured the cookie set.
 *   - Even with all 24 cookies hydrated, LinkedIn redirects to
 *     `auth_wall_desktop_*` for protected pages.
 *
 * Industry-standard fix: residential proxy + fingerprint randomization.
 *
 * Backends supported (selected via SCRAPING_BACKEND env):
 *   - `patchright` (default, free) — local Patchright + xvfb. Works for guest
 *     endpoints only (`/jobs/search`, `/jobs/view/<id>`).
 *   - `scrapfly`  (Pro/Agency) — Scrapfly SDK with `asp:true` (anti-scraping
 *     protection on, residential proxy + JS render + JA3 spoof).
 *   - `brightdata` (Agency) — Bright Data Scraping Browser proxy URL.
 *
 * Free tier reality check: `patchright` backend is fine for `search_jobs` +
 * `get_job_details` (LinkedIn serves a guest-friendly layout for these
 * endpoints). `get_profile` / `list_feed` / `search_people` REQUIRE a paid
 * scraping backend or browser-extension delivery model — there is no
 * combination of free server-side techniques that bypasses LinkedIn 2026's
 * authwall reliably.
 *
 * This module is the abstraction surface. Wiring tools to use it lands in
 * Sprint 6.2 (per-tool backend selection).
 */
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

export type ScrapingBackend = 'patchright' | 'scrapfly' | 'brightdata';

interface BackendConfig {
  backend: ScrapingBackend;
  scrapflyApiKey?: string;
  brightdataProxyUrl?: string;
}

export function resolveScrapingBackend(): BackendConfig {
  const explicit = process.env['SCRAPING_BACKEND']?.toLowerCase() as ScrapingBackend | undefined;
  if (explicit === 'scrapfly') {
    const key = process.env['SCRAPFLY_API_KEY'];
    if (!key) throw new AppError('CONFIG_FAIL', 'SCRAPING_BACKEND=scrapfly but SCRAPFLY_API_KEY unset');
    return { backend: 'scrapfly', scrapflyApiKey: key };
  }
  if (explicit === 'brightdata') {
    const url = process.env['BRIGHTDATA_PROXY_URL'];
    if (!url) throw new AppError('CONFIG_FAIL', 'SCRAPING_BACKEND=brightdata but BRIGHTDATA_PROXY_URL unset');
    return { backend: 'brightdata', brightdataProxyUrl: url };
  }
  return { backend: 'patchright' };
}

export interface ScrapeRequest {
  url: string;
  cookies?: Array<{ name: string; value: string; domain: string }>;
  countryCode?: string; // ISO 3166-1 alpha-2 (e.g. "BR", "US")
  acceptLanguage?: string;
}

export interface ScrapeResult {
  url: string;
  status: number;
  html: string;
  finalUrl: string;
  contentType: string;
  bytes: number;
}

const SCRAPFLY_ENDPOINT = 'https://api.scrapfly.io/scrape';

/**
 * Fetch a URL via Scrapfly's anti-scraping protection layer. Returns the
 * rendered HTML (after JS execution) plus final URL + status. Used as the
 * Pro/Agency backend for LinkedIn protected pages.
 *
 * Key Scrapfly options:
 *   - `asp=true`        — anti-scraping protection (residential proxy + JA3 spoof)
 *   - `render_js=true`  — execute page JavaScript (LinkedIn pages are SPA-ish)
 *   - `country=BR`      — geo of residential proxy
 *   - `cookies=...`     — replayed onto the request
 */
async function scrapflyFetch(args: ScrapeRequest, apiKey: string): Promise<ScrapeResult> {
  const params = new URLSearchParams({
    key: apiKey,
    url: args.url,
    asp: 'true',
    render_js: 'true',
    country: args.countryCode ?? 'BR',
  });
  if (args.cookies && args.cookies.length > 0) {
    // Scrapfly accepts `cookies` as semicolon-separated key=value pairs.
    params.set(
      'cookies',
      args.cookies.map((c) => `${c.name}=${c.value}`).join(';'),
    );
  }
  if (args.acceptLanguage) {
    params.set('headers[accept-language]', args.acceptLanguage);
  }

  const res = await fetch(`${SCRAPFLY_ENDPOINT}?${params.toString()}`);
  if (!res.ok) {
    const errBody = await res.text();
    throw new AppError(
      'EXTERNAL_API_FAIL',
      `Scrapfly ${res.status}: ${errBody.slice(0, 300)}`,
      { status: res.status },
    );
  }
  const json = (await res.json()) as {
    result?: {
      content?: string;
      status_code?: number;
      url?: string;
      content_type?: string;
    };
  };
  const r = json.result ?? {};
  const html = r.content ?? '';
  return {
    url: args.url,
    status: r.status_code ?? 0,
    html,
    finalUrl: r.url ?? args.url,
    contentType: r.content_type ?? 'text/html',
    bytes: html.length,
  };
}

/**
 * Bright Data Scraping Browser — exposes a Chromium-based proxy at a wss://
 * URL. The user provides the full URL with credentials baked in. Caller
 * connects via Patchright `chromium.connectOverCDP(brightdataProxyUrl)`.
 *
 * This backend doesn't have a fetch-based interface; it integrates with
 * the existing browserPool. Sprint 6.2 wires browserPool.acquire to
 * connectOverCDP when SCRAPING_BACKEND=brightdata.
 */
export function getBrightDataConfig(): { proxyUrl: string } | null {
  const url = process.env['BRIGHTDATA_PROXY_URL'];
  if (!url) return null;
  return { proxyUrl: url };
}

/**
 * Top-level entry: route to the configured backend.
 *
 * Patchright path returns null (caller must use existing browserPool flow);
 * Scrapfly path returns ScrapeResult ready to parse.
 */
export async function scrape(args: ScrapeRequest): Promise<ScrapeResult | null> {
  const cfg = resolveScrapingBackend();
  logger.info({ backend: cfg.backend, url: args.url }, 'scrape backend dispatch');

  if (cfg.backend === 'patchright') {
    // Caller falls back to browserPool — this returning null is a contract
    // marker: "use the existing flow, no proxy backend selected".
    return null;
  }
  if (cfg.backend === 'scrapfly') {
    return scrapflyFetch(args, cfg.scrapflyApiKey!);
  }
  if (cfg.backend === 'brightdata') {
    throw new AppError(
      'NOT_IMPLEMENTED',
      'BrightData backend wiring lands in Sprint 6.2 (browserPool.connectOverCDP)',
    );
  }
  throw new AppError('CONFIG_FAIL', `Unknown SCRAPING_BACKEND: ${cfg.backend}`);
}
