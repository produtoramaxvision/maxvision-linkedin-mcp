/**
 * MaxVision LinkedIn — License server (Cloudflare Worker).
 *
 * Endpoints:
 *   POST /v1/check    {licenseKey} → {valid, tier, expiresAt}
 *   POST /v1/issue    Stripe webhook → KV write
 *   POST /v1/revoke   admin only (Bearer ADMIN_TOKEN)
 *
 * License key format: `MAXV-<TIER>-<RANDOM_HEX>` where TIER ∈ {PRO, AGENCY}.
 * KV value: JSON `{tier, customerEmail, stripeCustomerId, issuedAt, expiresAt, revokedAt|null}`.
 */
export interface Env {
  LICENSES: KVNamespace;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_SECRET_KEY: string;
  ADMIN_TOKEN: string;
  ENVIRONMENT: string;
}

interface LicenseRecord {
  tier: 'pro' | 'agency';
  customerEmail: string;
  stripeCustomerId: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

async function handleCheck(req: Request, env: Env): Promise<Response> {
  let body: { licenseKey?: string };
  try {
    body = (await req.json()) as { licenseKey?: string };
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const key = body.licenseKey;
  if (!key || !/^MAXV-(PRO|AGENCY)-[A-F0-9]{32}$/i.test(key)) {
    return json(400, { error: 'invalid_license_format' });
  }

  const raw = await env.LICENSES.get(key);
  if (!raw) {
    return json(404, { valid: false, reason: 'not_found' });
  }
  const rec = JSON.parse(raw) as LicenseRecord;
  if (rec.revokedAt) {
    return json(403, { valid: false, reason: 'revoked', revokedAt: rec.revokedAt });
  }
  if (new Date(rec.expiresAt) < new Date()) {
    return json(403, { valid: false, reason: 'expired', expiresAt: rec.expiresAt });
  }
  return json(200, {
    valid: true,
    tier: rec.tier,
    expiresAt: rec.expiresAt,
  });
}

/**
 * Verify Stripe webhook signature (constant-time HMAC-SHA256 over the
 * `${timestamp}.${rawBody}` payload). Replay window: 5 min.
 */
async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => p.split('=') as [string, string]),
  );
  const ts = parts['t'];
  const v1 = parts['v1'];
  if (!ts || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${rawBody}`));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time compare.
  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) {
    diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return diff === 0;
}

function generateLicenseKey(tier: 'pro' | 'agency'): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `MAXV-${tier.toUpperCase()}-${hex}`;
}

async function handleIssue(req: Request, env: Env): Promise<Response> {
  const sigHeader = req.headers.get('stripe-signature');
  if (!sigHeader) return json(400, { error: 'missing_stripe_signature' });

  const raw = await req.text();
  const valid = await verifyStripeSignature(raw, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return json(403, { error: 'invalid_signature' });

  const event = JSON.parse(raw) as {
    type: string;
    data: { object: Record<string, unknown> };
  };

  // We act on `checkout.session.completed`. Other events (subscription.updated,
  // invoice.paid) are acknowledged but no-op for now.
  if (event.type !== 'checkout.session.completed') {
    return json(200, { received: true, noop: true });
  }

  const session = event.data.object as {
    customer_email?: string;
    customer?: string;
    metadata?: { tier?: string; expires_in_days?: string };
  };
  const tier = (session.metadata?.tier ?? 'pro') as 'pro' | 'agency';
  if (tier !== 'pro' && tier !== 'agency') {
    return json(400, { error: 'invalid_tier_metadata' });
  }
  const expiresInDays = Number(session.metadata?.expires_in_days ?? '365');
  const customerEmail = session.customer_email ?? '';
  const stripeCustomerId = session.customer ?? '';
  const licenseKey = generateLicenseKey(tier);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInDays * 86400 * 1000);
  const rec: LicenseRecord = {
    tier,
    customerEmail,
    stripeCustomerId: String(stripeCustomerId),
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    revokedAt: null,
  };
  await env.LICENSES.put(licenseKey, JSON.stringify(rec), {
    expirationTtl: expiresInDays * 86400 + 86400, // KV auto-cleanup 1 day after expiry
  });

  // TODO Sprint 4: send license key via Resend/Loops to customerEmail.

  return json(200, {
    received: true,
    licenseKey,
    tier,
    expiresAt: rec.expiresAt,
  });
}

async function handleRevoke(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${env.ADMIN_TOKEN}`) return json(401, { error: 'unauthorized' });

  let body: { licenseKey?: string };
  try {
    body = (await req.json()) as { licenseKey?: string };
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const key = body.licenseKey;
  if (!key) return json(400, { error: 'missing_licenseKey' });

  const raw = await env.LICENSES.get(key);
  if (!raw) return json(404, { error: 'not_found' });
  const rec = JSON.parse(raw) as LicenseRecord;
  rec.revokedAt = new Date().toISOString();
  await env.LICENSES.put(key, JSON.stringify(rec));
  return json(200, { revoked: true, licenseKey: key, revokedAt: rec.revokedAt });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/v1/check') {
      return handleCheck(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/v1/issue') {
      return handleIssue(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/v1/revoke') {
      return handleRevoke(request, env);
    }
    return json(404, { error: 'route_not_found', path: url.pathname });
  },
};
