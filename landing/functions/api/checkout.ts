/**
 * Cloudflare Pages Function — POST /api/checkout
 *
 * Triggered from landing/pricing.html when user clicks "Assinar Pro/Agency".
 * Creates a Stripe Checkout Session and returns the redirect URL.
 *
 * Required env (Pages Settings → Environment Variables):
 *   STRIPE_SECRET_KEY (sk_test_xxx in test mode, sk_live_xxx in live).
 *
 * Body shape (from pricing.html):
 *   { priceId: 'price_xxx', tier: 'pro' | 'agency', period: 'monthly' | 'yearly' }
 */
interface Env {
  STRIPE_SECRET_KEY: string;
}

interface CheckoutBody {
  priceId: string;
  tier: 'pro' | 'agency';
  period?: 'monthly' | 'yearly';
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  });

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let body: CheckoutBody;
  try {
    body = (await ctx.request.json()) as CheckoutBody;
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  if (!body.priceId || !/^price_/.test(body.priceId)) {
    return json(400, { error: 'invalid_priceId' });
  }
  if (body.tier !== 'pro' && body.tier !== 'agency') {
    return json(400, { error: 'invalid_tier' });
  }
  const secret = ctx.env.STRIPE_SECRET_KEY;
  if (!secret) return json(500, { error: 'stripe_not_configured' });

  // Form-encoded params for the Stripe REST API.
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('line_items[0][price]', body.priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('success_url', 'https://linkedin.produtoramaxvision.com.br/thanks.html?session={CHECKOUT_SESSION_ID}');
  params.set('cancel_url', 'https://linkedin.produtoramaxvision.com.br/pricing.html');
  params.set('metadata[tier]', body.tier);
  params.set('metadata[expires_in_days]', body.period === 'yearly' ? '365' : '31');
  params.set('locale', 'pt-BR');
  params.set('billing_address_collection', 'required');
  // Sprint 8 — phone collection (optional) for WhatsApp delivery via
  // Evolution API. Phone shows up in checkout.session.completed at
  // session.customer_details.phone.
  params.set('phone_number_collection[enabled]', 'true');
  // `customer_creation` is only valid in `mode=payment`. Subscription mode
  // auto-creates a customer record on Stripe's side — nothing to opt-in.

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const errBody = await res.text();
    return json(res.status, {
      error: 'stripe_error',
      details: errBody.slice(0, 500),
    });
  }
  const session = (await res.json()) as { id: string; url: string };
  return json(200, { url: session.url, sessionId: session.id });
};
