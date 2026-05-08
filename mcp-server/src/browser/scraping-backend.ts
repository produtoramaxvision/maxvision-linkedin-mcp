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

export type ScrapingBackend = 'patchright' | 'scrapfly' | 'brightdata' | 'firecrawl';

interface BackendConfig {
  backend: ScrapingBackend;
  scrapflyApiKey?: string;
  brightdataProxyUrl?: string;
  firecrawlEndpoint?: string;
  firecrawlApiKey?: string;
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
  if (explicit === 'firecrawl') {
    const endpoint = process.env['FIRECRAWL_ENDPOINT'];
    if (!endpoint) {
      throw new AppError(
        'CONFIG_FAIL',
        'SCRAPING_BACKEND=firecrawl but FIRECRAWL_ENDPOINT unset (e.g. https://firecrawl.your-vps.com)',
      );
    }
    return {
      backend: 'firecrawl',
      firecrawlEndpoint: endpoint.replace(/\/$/, ''),
      firecrawlApiKey: process.env['FIRECRAWL_API_KEY'] ?? '',
    };
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
 * Firecrawl self-hosted backend (Sprint 6.3).
 *
 * The user supplies their own Firecrawl deployment URL via FIRECRAWL_ENDPOINT.
 * No paid plan needed — Firecrawl is open source. Optional FIRECRAWL_API_KEY
 * for instances behind Bearer auth.
 *
 * Caveat: if the Firecrawl instance is on the same datacenter ASN as the MCP
 * server, LinkedIn will return the same authwall. The bypass works only when
 * the Firecrawl instance is in a different ASN, has external proxy
 * configured, or has a residential IP. Document this in operator notes.
 *
 * Firecrawl API: POST /v1/scrape with `{url, formats:['html'], waitFor,
 * headers:{Cookie}, proxy?:'auto'}`. Returns `{success, data:{html, metadata}}`.
 */
async function firecrawlFetch(args: ScrapeRequest, cfg: BackendConfig): Promise<ScrapeResult> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (cfg.firecrawlApiKey) headers['authorization'] = `Bearer ${cfg.firecrawlApiKey}`;

  const requestHeaders: Record<string, string> = {};
  if (args.cookies && args.cookies.length > 0) {
    requestHeaders['Cookie'] = args.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  }
  if (args.acceptLanguage) requestHeaders['Accept-Language'] = args.acceptLanguage;

  const body = JSON.stringify({
    url: args.url,
    formats: ['html'],
    onlyMainContent: false,
    waitFor: 4000,
    headers: requestHeaders,
    // Firecrawl cloud honors `proxy: 'auto' | 'enhanced'`; self-hosted
    // ignores unsupported keys silently — safe to send.
    proxy: 'auto',
  });

  const res = await fetch(`${cfg.firecrawlEndpoint}/v1/scrape`, {
    method: 'POST',
    headers,
    body,
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new AppError(
      'EXTERNAL_API_FAIL',
      `Firecrawl ${res.status}: ${errBody.slice(0, 300)}`,
      { status: res.status, endpoint: cfg.firecrawlEndpoint },
    );
  }
  const json = (await res.json()) as {
    success?: boolean;
    data?: {
      html?: string;
      markdown?: string;
      metadata?: { sourceURL?: string; statusCode?: number; contentType?: string };
    };
    error?: string;
  };
  if (!json.success) {
    throw new AppError('EXTERNAL_API_FAIL', `Firecrawl error: ${json.error ?? 'unknown'}`);
  }
  const html = json.data?.html ?? '';
  const meta = json.data?.metadata ?? {};
  return {
    url: args.url,
    status: meta.statusCode ?? 200,
    html,
    finalUrl: meta.sourceURL ?? args.url,
    contentType: meta.contentType ?? 'text/html',
    bytes: html.length,
  };
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
  if (cfg.backend === 'firecrawl') {
    return firecrawlFetch(args, cfg);
  }
  if (cfg.backend === 'brightdata') {
    throw new AppError(
      'NOT_IMPLEMENTED',
      'BrightData backend wiring lands in Sprint 6.4 (browserPool.connectOverCDP)',
    );
  }
  throw new AppError('CONFIG_FAIL', `Unknown SCRAPING_BACKEND: ${cfg.backend}`);
}
