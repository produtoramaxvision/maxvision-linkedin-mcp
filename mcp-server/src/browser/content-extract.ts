/**
 * Content extraction backend (Sprint 6.4) — Tavily Extract API.
 *
 * Distinct from `scraping-backend.ts` (HTML for cheerio): Tavily returns
 * pre-processed markdown/text (`raw_content`) optimized for LLM consumption.
 *
 * Use cases inside this MCP:
 *   - `optimize_profile`: feed a profile URL → Tavily extracts text →
 *     pass to invokeLlm() instead of requiring user to paste profile text.
 *
 * Tavily Extract API: POST https://api.tavily.com/extract
 *   Body: {api_key, urls:[...], extract_depth:'advanced', include_images:false}
 *   Returns: {results:[{url, raw_content, ...}], failed_results, response_time}
 *
 * Pricing: 1k free credits/mo, then ~$0.02 per credit. Cheap for occasional
 * profile extraction; not viable for high-volume scraping.
 *
 * Limits:
 *   - Up to 20 URLs per request.
 *   - Cookies are NOT supported by Tavily — they fetch from public web.
 *     LinkedIn authwall remains for protected pages. Tavily works on PUBLIC
 *     LinkedIn URLs (job listings, public posts, public profile previews).
 */
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

const TAVILY_ENDPOINT = 'https://api.tavily.com/extract';

export interface TavilyExtractResult {
  url: string;
  rawContent: string;
  title?: string;
}

export async function tavilyExtract(urls: string[]): Promise<TavilyExtractResult[]> {
  const apiKey = process.env['TAVILY_API_KEY'];
  if (!apiKey) {
    throw new AppError(
      'CONFIG_FAIL',
      'TAVILY_API_KEY env var not set on MCP server',
      { tool: 'content-extract' },
    );
  }
  if (urls.length === 0 || urls.length > 20) {
    throw new AppError('VALIDATION_FAIL', 'urls must be 1..20 items');
  }

  logger.info({ count: urls.length, endpoint: TAVILY_ENDPOINT }, 'tavily_extract');

  const res = await fetch(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      urls,
      extract_depth: 'advanced',
      include_images: false,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new AppError(
      'EXTERNAL_API_FAIL',
      `Tavily ${res.status}: ${errBody.slice(0, 300)}`,
      { status: res.status },
    );
  }
  const json = (await res.json()) as {
    results?: Array<{ url?: string; raw_content?: string; title?: string }>;
    failed_results?: Array<{ url?: string; error?: string }>;
  };
  const results = (json.results ?? []).map((r) => ({
    url: r.url ?? '',
    rawContent: r.raw_content ?? '',
    title: r.title,
  }));
  if (results.length === 0) {
    const failed = json.failed_results?.[0];
    throw new AppError(
      'EXTERNAL_API_FAIL',
      `Tavily returned no successful extractions${failed ? `: ${failed.error}` : ''}`,
    );
  }
  return results;
}
