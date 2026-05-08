/**
 * Cloudflare Pages Function — POST /api/waitlist
 * Body: { email: string }
 * Action: append to Resend audience.
 */
interface Env {
  RESEND_API_KEY?: string;
  RESEND_AUDIENCE_ID?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let email: string;
  try {
    const body = (await request.json()) as { email?: string };
    email = (body.email ?? "").trim().toLowerCase();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "invalid_email" }, { status: 400 });
  }

  if (!env.RESEND_API_KEY || !env.RESEND_AUDIENCE_ID) {
    console.warn("Resend not configured; logged email", email);
    return Response.json({ ok: true, mode: "dev" });
  }

  const res = await fetch(
    `https://api.resend.com/audiences/${env.RESEND_AUDIENCE_ID}/contacts`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, unsubscribed: false }),
    },
  );

  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    console.error("resend_error", res.status, text);
    return Response.json({ error: "upstream_failed" }, { status: 502 });
  }

  return Response.json({ ok: true });
};
