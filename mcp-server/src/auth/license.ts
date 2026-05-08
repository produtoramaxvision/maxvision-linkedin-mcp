/**
 * License gating — Sprint 3.3.
 *
 * Maps tool names to required tiers and verifies an incoming license key
 * (header `X-MaxVision-License`) against the Cloudflare license server.
 *
 * Behavior:
 *   - LICENSE_CHECK_ENABLED unset / false → all tools allowed (Free dev mode).
 *   - LICENSE_CHECK_ENABLED=true → requires_pro tools 401 without valid Pro key,
 *                                  requires_agency tools 401 without Agency key.
 *
 * Cache: 5-min in-memory LRU keyed by license key hash. License revocation
 * propagates within 5 min in the worst case; stale `valid:true` is preferable
 * to per-call worker round-trip.
 */
import { logger } from '../logger.js';

const REQUIRES_PRO: ReadonlySet<string> = new Set([
  'apply_easy',
  'send_message',
  'search_people',
  'post_update',
]);

const REQUIRES_AGENCY: ReadonlySet<string> = new Set([
  // Reserved for future tools; multi-account pool + white-label live in
  // plugin layer, not at the tool gate.
]);

interface LicenseCheckResult {
  valid: boolean;
  tier?: 'pro' | 'agency';
  expiresAt?: string;
  reason?: string;
}

const cache = new Map<string, { res: LicenseCheckResult; exp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const LICENSE_SERVER =
  process.env['LICENSE_SERVER_URL'] ?? 'https://license.linkedin.maxvision.com.br';

async function fetchLicense(licenseKey: string): Promise<LicenseCheckResult> {
  try {
    const res = await fetch(`${LICENSE_SERVER}/v1/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ licenseKey }),
    });
    const body = (await res.json()) as Partial<LicenseCheckResult>;
    return {
      valid: !!body.valid,
      tier: body.tier,
      expiresAt: body.expiresAt,
      reason: body.reason,
    };
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'license server unreachable — failing closed (deny)',
    );
    return { valid: false, reason: 'license_server_unreachable' };
  }
}

async function checkLicense(licenseKey: string): Promise<LicenseCheckResult> {
  const now = Date.now();
  const cached = cache.get(licenseKey);
  if (cached && cached.exp > now) return cached.res;
  const res = await fetchLicense(licenseKey);
  cache.set(licenseKey, { res, exp: now + CACHE_TTL_MS });
  return res;
}

/**
 * Returns null if the tool is allowed to proceed. Returns a string with a
 * human-readable reason if blocked (caller surfaces this as a 401 response).
 */
export async function gateToolByLicense(
  toolName: string,
  licenseHeader: string | undefined,
): Promise<string | null> {
  if (process.env['LICENSE_CHECK_ENABLED'] !== 'true') return null;
  if (!REQUIRES_PRO.has(toolName) && !REQUIRES_AGENCY.has(toolName)) return null;

  if (!licenseHeader) {
    return `Tool "${toolName}" requires a Pro or Agency license. Set X-MaxVision-License header.`;
  }
  const result = await checkLicense(licenseHeader);
  if (!result.valid) {
    return `License invalid (${result.reason ?? 'unknown'}). Renew via https://linkedin.maxvision.com.br/pricing`;
  }
  if (REQUIRES_AGENCY.has(toolName) && result.tier !== 'agency') {
    return `Tool "${toolName}" requires Agency tier (have: ${result.tier}).`;
  }
  return null;
}

export function isProTool(toolName: string): boolean {
  return REQUIRES_PRO.has(toolName) || REQUIRES_AGENCY.has(toolName);
}
