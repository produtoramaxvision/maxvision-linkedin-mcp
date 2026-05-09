/**
 * MaxVision LinkedIn — License server (Cloudflare Worker).
 *
 * Endpoints:
 *   POST /v1/check                    {licenseKey} → {valid, tier, expiresAt}
 *   POST /v1/issue                    Stripe webhook → KV write + email + WhatsApp
 *   POST /v1/revoke                   admin only (Bearer ADMIN_TOKEN)
 *   GET  /v1/license-by-session?session=cs_xxx → {licenseKey} for /thanks page
 *
 * License key format: `MAXV-<TIER>-<RANDOM_HEX>` where TIER ∈ {PRO, AGENCY}.
 * KV layout:
 *   {licenseKey}              → JSON LicenseRecord (5min cache TTL on /check)
 *   session:{stripe_session_id} → licenseKey  (lookup by Stripe session_id)
 *
 * Notification (Sprint 8): on successful checkout.session.completed, send the
 * license key via Resend (email, free 100/day) + Evolution API (WhatsApp,
 * self-hosted, optional). Both are best-effort — webhook still 200s if either
 * delivery fails. The /thanks page also serves the key as a backup channel.
 */
export interface Env {
  LICENSES: KVNamespace;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_SECRET_KEY: string;
  ADMIN_TOKEN: string;
  ENVIRONMENT: string;
  // Sprint 8 notification deps (optional, set via wrangler secret put):
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string; // e.g. "noreply@produtoramaxvision.com.br"
  EVOLUTION_API_URL?: string; // e.g. "https://evolution.meuagente.api.br"
  EVOLUTION_API_KEY?: string;
  EVOLUTION_INSTANCE?: string; // e.g. "meu-agente"
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
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    },
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

/**
 * Send the license key via Resend (email). Best-effort — failures logged
 * but not raised. Free tier: 100 emails/day, 3k/month, no domain verification
 * needed when sending FROM `onboarding@resend.dev`. For production, verify
 * `produtoramaxvision.com.br` and switch RESEND_FROM_EMAIL.
 */
async function sendLicenseEmail(
  env: Env,
  to: string,
  licenseKey: string,
  tier: 'pro' | 'agency',
  expiresAt: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!env.RESEND_API_KEY || !to) {
    return { ok: false, error: 'resend_not_configured' };
  }
  const from = env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
  const tierLabel = tier === 'pro' ? 'Pro' : 'Agency';
  const subject = `Sua license key MaxVision LinkedIn ${tierLabel}`;
  const expDate = new Date(expiresAt).toLocaleDateString('pt-BR');
  const html = `<!DOCTYPE html>
<html><body style="font-family:Inter,sans-serif;max-width:560px;margin:32px auto;color:#0f172a">
  <h1 style="color:#1d4ed8">Bem-vindo ao MaxVision LinkedIn ${tierLabel}!</h1>
  <p>Sua license key:</p>
  <pre style="background:#f1f5f9;padding:16px;border-radius:8px;font-size:14px;overflow-x:auto"><strong>${licenseKey}</strong></pre>
  <p><strong>Validade:</strong> até ${expDate}</p>

  <h2 style="margin-top:32px">Como usar</h2>
  <ol>
    <li>Instale o plugin: <code>/plugin install maxvision-linkedin-suite</code> no Claude Code.</li>
    <li>Exporte sua key como variável de ambiente:
      <pre style="background:#f1f5f9;padding:12px;border-radius:6px"><code>export MAXVISION_LICENSE=${licenseKey}</code></pre>
    </li>
    <li>Recarregue o plugin: <code>/plugin reload</code></li>
    <li>Capture o cookie LinkedIn: <code>/linkedin-cookie-refresh</code></li>
    <li>Comece a buscar vagas: <code>/linkedin-find-jobs &quot;Engenheiro de IA&quot;</code></li>
  </ol>

  <h2 style="margin-top:32px">Suporte</h2>
  <p>Discord priority: <a href="https://discord.gg/maxvision">discord.gg/maxvision</a><br>
  Documentação: <a href="https://github.com/produtoramaxvision/maxvision-linkedin-mcp">GitHub</a></p>

  <hr style="margin-top:32px;border:0;border-top:1px solid #e2e8f0">
  <p style="font-size:12px;color:#64748b">© 2026 Produtora MaxVision. Esta key é pessoal e intransferível.</p>
</body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      return { ok: false, error: `resend_${res.status}: ${errBody.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `resend_throw: ${(e as Error).message}` };
  }
}

/**
 * Send the license key via Evolution API (self-hosted WhatsApp).
 * Only fires if EVOLUTION_API_URL + EVOLUTION_API_KEY + EVOLUTION_INSTANCE
 * are configured AND the customer provided a phone number at checkout.
 *
 * Endpoint: POST {url}/message/sendText/{instance}
 *   Headers: apikey: {key}
 *   Body: { number: '5511999999999', text: 'message' }
 */
async function sendLicenseWhatsApp(
  env: Env,
  phone: string,
  licenseKey: string,
  tier: 'pro' | 'agency',
): Promise<{ ok: boolean; error?: string }> {
  if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY || !env.EVOLUTION_INSTANCE || !phone) {
    return { ok: false, error: 'evolution_not_configured' };
  }
  const cleanPhone = phone.replace(/\D/g, '');
  const tierLabel = tier === 'pro' ? 'Pro' : 'Agency';
  const text =
    `🚀 *MaxVision LinkedIn ${tierLabel}*\n\n` +
    `Sua license key:\n\`${licenseKey}\`\n\n` +
    `Como usar:\n` +
    `1. /plugin install maxvision-linkedin-suite\n` +
    `2. export MAXVISION_LICENSE=${licenseKey}\n` +
    `3. /plugin reload\n` +
    `4. /linkedin-cookie-refresh\n` +
    `5. /linkedin-find-jobs "Engenheiro de IA"\n\n` +
    `Suporte: discord.gg/maxvision`;

  try {
    const url = `${env.EVOLUTION_API_URL.replace(/\/$/, '')}/message/sendText/${encodeURIComponent(env.EVOLUTION_INSTANCE)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: env.EVOLUTION_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ number: cleanPhone, text }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      return { ok: false, error: `evo_${res.status}: ${errBody.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `evo_throw: ${(e as Error).message}` };
  }
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

  if (event.type !== 'checkout.session.completed') {
    return json(200, { received: true, noop: true });
  }

  const session = event.data.object as {
    id?: string;
    customer_email?: string;
    customer_details?: { email?: string; phone?: string };
    customer?: string;
    metadata?: { tier?: string; expires_in_days?: string };
  };
  const tier = (session.metadata?.tier ?? 'pro') as 'pro' | 'agency';
  if (tier !== 'pro' && tier !== 'agency') {
    return json(400, { error: 'invalid_tier_metadata' });
  }
  const expiresInDays = Number(session.metadata?.expires_in_days ?? '365');
  const customerEmail =
    session.customer_email ?? session.customer_details?.email ?? '';
  const customerPhone = session.customer_details?.phone ?? '';
  const stripeCustomerId = session.customer ?? '';
  const sessionId = session.id ?? '';
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
    expirationTtl: expiresInDays * 86400 + 86400,
  });
  // Index by Stripe session_id so /thanks page can fetch the key without
  // needing the email channel (in case email delivery is delayed).
  if (sessionId) {
    await env.LICENSES.put(`session:${sessionId}`, licenseKey, {
      expirationTtl: 30 * 86400, // 30 days — plenty for the user to revisit /thanks
    });
  }

  // Best-effort delivery — log results but don't fail the webhook.
  const emailRes = await sendLicenseEmail(env, customerEmail, licenseKey, tier, rec.expiresAt);
  const whatsappRes = await sendLicenseWhatsApp(env, customerPhone, licenseKey, tier);

  return json(200, {
    received: true,
    licenseKey,
    tier,
    expiresAt: rec.expiresAt,
    notifications: { email: emailRes, whatsapp: whatsappRes },
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

/**
 * GET /v1/license-by-session?session=cs_xxx — used by /thanks.html to
 * recover the license key right after Stripe redirects back, without
 * waiting for email delivery.
 *
 * Public (no auth): the session_id is itself the auth token (Stripe-issued
 * unguessable string). We just resolve the indirection KV → license key.
 */
async function handleLicenseBySession(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('session');
  if (!sessionId || !/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(sessionId)) {
    return json(400, { error: 'invalid_session_id' });
  }
  const licenseKey = await env.LICENSES.get(`session:${sessionId}`);
  if (!licenseKey) {
    return json(404, { error: 'not_found_yet', hint: 'Webhook may not have processed yet — retry in 5–10 seconds.' });
  }
  const raw = await env.LICENSES.get(licenseKey);
  if (!raw) return json(404, { error: 'license_not_found' });
  const rec = JSON.parse(raw) as LicenseRecord;
  return json(200, {
    licenseKey,
    tier: rec.tier,
    expiresAt: rec.expiresAt,
    customerEmail: rec.customerEmail,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight for browser-side calls (e.g. /thanks page).
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization',
        },
      });
    }

    if (request.method === 'POST' && url.pathname === '/v1/check') {
      return handleCheck(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/v1/issue') {
      return handleIssue(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/v1/revoke') {
      return handleRevoke(request, env);
    }
    if (request.method === 'GET' && url.pathname === '/v1/license-by-session') {
      return handleLicenseBySession(request, env);
    }
    return json(404, { error: 'route_not_found', path: url.pathname });
  },
};
