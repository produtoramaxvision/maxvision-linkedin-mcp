/**
 * MaxVision LinkedIn License Server — Cloudflare Worker
 *
 * Endpoints:
 *   POST /v1/check         — body { license_key, hwid, version } → { valid, tier, exp, sig }
 *   POST /v1/issue         — admin only; cria licença manualmente (Bearer MASTER token)
 *   POST /v1/revoke        — admin only; marca licença como revogada
 *   POST /v1/stripe-webhook — recebe checkout.session.completed e emite licença
 *   GET  /health           — 200 OK
 *
 * Storage: KV `LICENSES` keyed by license_id.
 *   { tier: 'pro'|'agency', email, stripe_customer_id, exp_iso, status: 'active'|'revoked', issued_iso }
 *
 * Sigs: Ed25519 (Web Crypto). Public key bundled na CLI/MCP via env LICENSE_PUBLIC_KEY_B64.
 */

interface Env {
  LICENSES: KVNamespace;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_API_KEY: string;
  MASTER_SIGNING_KEY: string; // ed25519 private key (base64 raw 32 bytes)
  LICENSE_PUBLIC_KEY_B64: string;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
}

interface LicenseRecord {
  tier: "pro" | "agency";
  email: string;
  stripe_customer_id: string;
  exp_iso: string;
  status: "active" | "revoked";
  issued_iso: string;
  hwid_pinned?: string;
}

const json = (data: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      ...(init.headers ?? {}),
    },
  });

const error = (status: number, message: string): Response =>
  json({ error: message }, { status });

// ---------- Crypto helpers (Ed25519) ----------
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function signEd25519(env: Env, payload: string): Promise<string> {
  const keyBytes = b64ToBytes(env.MASTER_SIGNING_KEY);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "Ed25519",
    key,
    new TextEncoder().encode(payload),
  );
  return bytesToB64(new Uint8Array(sig));
}

// ---------- Routes ----------
async function handleCheck(req: Request, env: Env): Promise<Response> {
  const { license_key, hwid, version } = await req.json<{
    license_key?: string;
    hwid?: string;
    version?: string;
  }>();
  if (!license_key) return error(400, "missing license_key");

  const rec = await env.LICENSES.get<LicenseRecord>(license_key, "json");
  if (!rec) return json({ valid: false, reason: "not_found" });
  if (rec.status === "revoked")
    return json({ valid: false, reason: "revoked" });
  if (new Date(rec.exp_iso).getTime() < Date.now())
    return json({ valid: false, reason: "expired" });

  // HWID pin (anti-share). Em dev/testes, pular validação se rec.hwid_pinned não existe.
  if (rec.hwid_pinned && hwid && rec.hwid_pinned !== hwid) {
    return json({ valid: false, reason: "hwid_mismatch" });
  }

  const payload = JSON.stringify({
    license_key,
    tier: rec.tier,
    exp: rec.exp_iso,
    iat: new Date().toISOString(),
    ver: version ?? null,
  });
  const sig = await signEd25519(env, payload);
  return json({ valid: true, tier: rec.tier, exp: rec.exp_iso, payload, sig });
}

async function handleIssue(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.MASTER_SIGNING_KEY}`)
    return error(401, "unauthorized");
  const body = await req.json<{
    license_key: string;
    rec: LicenseRecord;
  }>();
  await env.LICENSES.put(body.license_key, JSON.stringify(body.rec));
  return json({ ok: true });
}

async function handleRevoke(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.MASTER_SIGNING_KEY}`)
    return error(401, "unauthorized");
  const { license_key } = await req.json<{ license_key: string }>();
  const rec = await env.LICENSES.get<LicenseRecord>(license_key, "json");
  if (!rec) return error(404, "not_found");
  rec.status = "revoked";
  await env.LICENSES.put(license_key, JSON.stringify(rec));
  return json({ ok: true });
}

async function handleStripeWebhook(
  req: Request,
  env: Env,
): Promise<Response> {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return error(400, "missing stripe-signature");
  const body = await req.text();
  // TODO: verificar HMAC de Stripe (stripe.webhooks.constructEvent equivalente em Workers)
  // Para Sprint 0 stub apenas logamos
  const evt = JSON.parse(body);
  if (evt.type === "checkout.session.completed") {
    const session = evt.data.object;
    const license_key = crypto.randomUUID();
    const rec: LicenseRecord = {
      tier: session.metadata?.tier ?? "pro",
      email: session.customer_details?.email ?? "",
      stripe_customer_id: session.customer ?? "",
      exp_iso: new Date(
        Date.now() +
          (session.metadata?.tier === "agency" ? 365 : 30) * 24 * 3600 * 1000,
      ).toISOString(),
      status: "active",
      issued_iso: new Date().toISOString(),
    };
    await env.LICENSES.put(license_key, JSON.stringify(rec));
    // TODO: enviar email com license_key via Resend / Loops
  }
  return json({ received: true });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type,authorization",
        },
      });
    }
    if (url.pathname === "/health") return json({ ok: true });
    if (url.pathname === "/v1/check" && req.method === "POST")
      return handleCheck(req, env);
    if (url.pathname === "/v1/issue" && req.method === "POST")
      return handleIssue(req, env);
    if (url.pathname === "/v1/revoke" && req.method === "POST")
      return handleRevoke(req, env);
    if (url.pathname === "/v1/stripe-webhook" && req.method === "POST")
      return handleStripeWebhook(req, env);
    return error(404, "not_found");
  },
} satisfies ExportedHandler<Env>;
