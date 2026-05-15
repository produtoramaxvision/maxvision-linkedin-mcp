/**
 * MaxVision LinkedIn — License server (Cloudflare Worker).
 *
 * Endpoints:
 *   POST /v1/check                    {licenseKey} → {valid, tier, expiresAt}
 *   POST /v1/issue                    Stripe webhook → KV write + email + WhatsApp
 *   POST /v1/revoke                   admin only (Bearer ADMIN_TOKEN)
 *   GET  /v1/license-by-session?session=cs_xxx → {licenseKey, mcpApiKey} for /thanks page
 *
 * License key format: `MAXV-<TIER>-<RANDOM_HEX>` where TIER ∈ {PRO, AGENCY}.
 * KV layout:
 *   {licenseKey}                → JSON LicenseRecord
 *   session:{stripe_session_id} → licenseKey   (TTL 30d, for /thanks recovery)
 *   session:{stripe_session_id}:mcpkey → mcpApiKey (TTL 30d, for /thanks recovery)
 *
 * Auth model (two layers, both required by linkedin-mcp server):
 *   Layer 1 — MCP API Key  (coarse gate: "is a paying customer")
 *             Client header: Authorization: Bearer mxv_xxxxx
 *             Validated by: mcp-server against MCP_API_KEYS env
 *   Layer 2 — License key (fine gate: tier + revocation per customer)
 *             Client header: X-MaxVision-License: MAXV-PRO-xxxxx
 *             Validated by: mcp-server calling LICENSE_SERVER_URL/v1/check
 *
 * Revocation: call /v1/revoke → sets revokedAt in KV → Layer 2 blocks immediately.
 */
export interface Env {
  LICENSES: KVNamespace;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_SECRET_KEY: string;
  ADMIN_TOKEN: string;
  ENVIRONMENT: string;
  // Shared MCP API key delivered to every paying customer (operator-controlled).
  // Set via: wrangler secret put CUSTOMER_MCP_API_KEY --name maxv-linkedin-license
  // Value: one of the mxv_* keys from MCP_API_KEYS in the linkedin-mcp container.
  // Docs: https://github.com/produtoramaxvision/maxvision-linkedin-mcp
  CUSTOMER_MCP_API_KEY?: string;
  // Notification deps (optional):
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  EVOLUTION_API_URL?: string;
  EVOLUTION_API_KEY?: string;
  EVOLUTION_INSTANCE?: string;
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
  return json(200, { valid: true, tier: rec.tier, expiresAt: rec.expiresAt });
}

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
 * Returns the shared MCP API key to deliver to paying customers.
 * Empty string when not configured — email omits the API key block.
 */
function resolveMcpApiKey(env: Env): string {
  return env.CUSTOMER_MCP_API_KEY ?? '';
}

async function sendLicenseEmail(
  env: Env,
  to: string,
  licenseKey: string,
  mcpApiKey: string,
  tier: 'pro' | 'agency',
  expiresAt: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!env.RESEND_API_KEY || !to) {
    return { ok: false, error: 'resend_not_configured' };
  }
  const from = env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
  const tierLabel = tier === 'pro' ? 'Pro' : 'Agency';
  const subject = `Suas credenciais MaxVision LinkedIn ${tierLabel}`;
  const expDate = new Date(expiresAt).toLocaleDateString('pt-BR');

  const mcpApiKeyBlock = mcpApiKey
    ? `
  <h2 style="color:#0f172a;margin-top:24px;font-size:16px">2. MCP API Key (autenticação do servidor)</h2>
  <pre style="background:#f1f5f9;padding:16px;border-radius:8px;font-size:13px;overflow-x:auto;border:1px solid #e2e8f0"><strong>${mcpApiKey}</strong></pre>
  <p style="color:#64748b;font-size:13px">⚠️ Não compartilhe esta chave. Ela autentica sua conta no servidor LinkedIn MCP.</p>`
    : '';

  const envSetupBlock = mcpApiKey
    ? `<pre style="background:#f1f5f9;padding:12px;border-radius:6px;font-size:12px;margin-top:4px;white-space:pre-wrap"># macOS / Linux
export LINKEDIN_MCP_API_KEY="${mcpApiKey}"
export MAXVISION_LICENSE="${licenseKey}"

# Windows PowerShell
[Environment]::SetEnvironmentVariable("LINKEDIN_MCP_API_KEY", "${mcpApiKey}", "User")
[Environment]::SetEnvironmentVariable("MAXVISION_LICENSE", "${licenseKey}", "User")</pre>`
    : `<pre style="background:#f1f5f9;padding:12px;border-radius:6px;font-size:12px;margin-top:4px">export MAXVISION_LICENSE="${licenseKey}"</pre>`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:Inter,sans-serif;max-width:580px;margin:32px auto;color:#0f172a;background:#fff;padding:24px;border-radius:12px;border:1px solid #e2e8f0">
  <h1 style="color:#0a66c2;border-bottom:2px solid #0a66c2;padding-bottom:12px">Bem-vindo ao MaxVision LinkedIn ${tierLabel}!</h1>
  <p style="color:#475569">Compra confirmada. Abaixo suas credenciais — guarde com segurança.</p>

  <h2 style="color:#0f172a;margin-top:24px;font-size:16px">1. License Key (controle de tier e revogação)</h2>
  <pre style="background:#f1f5f9;padding:16px;border-radius:8px;font-size:13px;overflow-x:auto;border:1px solid #e2e8f0"><strong>${licenseKey}</strong></pre>
${mcpApiKeyBlock}
  <p style="color:#475569;margin-top:16px"><strong>Validade:</strong> até ${expDate}</p>

  <h2 style="color:#0f172a;margin-top:32px;font-size:16px">Como configurar no Claude Code</h2>
  <ol style="color:#475569;line-height:1.9">
    <li>Instale o plugin:
      <pre style="background:#f1f5f9;padding:8px 12px;border-radius:6px;font-size:12px;margin-top:4px">/plugin install linkedin-maxvision@maxvision-linkedin</pre>
    </li>
    <li>Configure as variáveis de ambiente:
      ${envSetupBlock}
    </li>
    <li>Reinicie o Claude Code completamente</li>
    <li>Teste a conexão: <code style="color:#0a66c2">/linkedin-status</code></li>
    <li>Configure o cookie LinkedIn: <code style="color:#0a66c2">/linkedin-cookie-refresh</code></li>
  </ol>

  <h2 style="color:#0f172a;margin-top:32px;font-size:16px">Suporte</h2>
  <p style="color:#475569">
    Documentação: <a href="https://linkedin.produtoramaxvision.com.br" style="color:#0a66c2">linkedin.produtoramaxvision.com.br</a><br>
    GitHub: <a href="https://github.com/produtoramaxvision/maxvision-linkedin-mcp" style="color:#0a66c2">github.com/produtoramaxvision/maxvision-linkedin-mcp</a><br>
    Email: <a href="mailto:produtoramaxvision@gmail.com" style="color:#0a66c2">produtoramaxvision@gmail.com</a>
  </p>

  <hr style="margin-top:32px;border:0;border-top:1px solid #e2e8f0">
  <p style="font-size:12px;color:#94a3b8">© 2026 Produtora MaxVision. Estas credenciais são pessoais e intransferíveis. Qualquer abuso resulta em revogação imediata sem reembolso.</p>
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

async function sendLicenseWhatsApp(
  env: Env,
  phone: string,
  licenseKey: string,
  mcpApiKey: string,
  tier: 'pro' | 'agency',
): Promise<{ ok: boolean; error?: string }> {
  if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY || !env.EVOLUTION_INSTANCE || !phone) {
    return { ok: false, error: 'evolution_not_configured' };
  }
  const cleanPhone = phone.replace(/\D/g, '');
  const tierLabel = tier === 'pro' ? 'Pro' : 'Agency';
  const apiKeyLine = mcpApiKey ? `🔐 MCP API Key:\n\`${mcpApiKey}\`\n\n` : '';
  const text =
    `🔵 *MaxVision LinkedIn ${tierLabel}*\n\n` +
    `Suas credenciais:\n\n` +
    `🔑 License Key:\n\`${licenseKey}\`\n\n` +
    apiKeyLine +
    `*Como configurar:*\n` +
    `1. /plugin install linkedin-maxvision@maxvision-linkedin\n` +
    `2. export MAXVISION_LICENSE=${licenseKey}\n` +
    (mcpApiKey ? `3. export LINKEDIN_MCP_API_KEY=${mcpApiKey}\n` : '') +
    `${mcpApiKey ? '4' : '3'}. Reiniciar Claude Code\n` +
    `${mcpApiKey ? '5' : '4'}. /linkedin-status para validar\n\n` +
    `📖 linkedin.produtoramaxvision.com.br\n` +
    `💬 produtoramaxvision@gmail.com`;

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
  const customerEmail = session.customer_email ?? session.customer_details?.email ?? '';
  const customerPhone = session.customer_details?.phone ?? '';
  const stripeCustomerId = session.customer ?? '';
  const sessionId = session.id ?? '';
  const licenseKey = generateLicenseKey(tier);
  const mcpApiKey = resolveMcpApiKey(env);
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

  if (sessionId) {
    await env.LICENSES.put(`session:${sessionId}`, licenseKey, {
      expirationTtl: 30 * 86400,
    });
    // Store MCP API key by session so /thanks page can deliver it without waiting for email.
    await env.LICENSES.put(`session:${sessionId}:mcpkey`, mcpApiKey, {
      expirationTtl: 30 * 86400,
    });
  }

  const emailRes = await sendLicenseEmail(env, customerEmail, licenseKey, mcpApiKey, tier, rec.expiresAt);
  const whatsappRes = await sendLicenseWhatsApp(env, customerPhone, licenseKey, mcpApiKey, tier);

  return json(200, {
    received: true,
    licenseKey,
    mcpApiKey,
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
 * GET /v1/license-by-session?session=cs_xxx — used by /thanks page to
 * recover both credentials right after Stripe redirects back.
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
  const mcpApiKey = (await env.LICENSES.get(`session:${sessionId}:mcpkey`)) ?? '';
  return json(200, {
    licenseKey,
    mcpApiKey,
    tier: rec.tier,
    expiresAt: rec.expiresAt,
    customerEmail: rec.customerEmail,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization, stripe-signature',
        },
      });
    }

    if (request.method === 'POST' && url.pathname === '/v1/check') return handleCheck(request, env);
    if (request.method === 'POST' && url.pathname === '/v1/issue') return handleIssue(request, env);
    if (request.method === 'POST' && url.pathname === '/v1/revoke') return handleRevoke(request, env);
    if (request.method === 'GET' && url.pathname === '/v1/license-by-session') return handleLicenseBySession(request, env);
    return json(404, { error: 'route_not_found', path: url.pathname });
  },
};
