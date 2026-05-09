/**
 * Cloudflare Pages Function — GET /api/license-fetch?session=cs_xxx
 *
 * Proxies the call to the license worker so the browser doesn't need a
 * cross-origin request to license.produtoramaxvision.com.br. Surfaces a
 * polite 404 with `not_found_yet` while the Stripe webhook is still
 * propagating, letting /thanks.html retry.
 */
const LICENSE_WORKER = 'https://license.produtoramaxvision.com.br';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });

export const onRequestGet: PagesFunction = async (ctx) => {
  const url = new URL(ctx.request.url);
  const session = url.searchParams.get('session');
  if (!session) return json(400, { error: 'missing_session' });

  const upstream = `${LICENSE_WORKER}/v1/license-by-session?session=${encodeURIComponent(session)}`;
  const res = await fetch(upstream);
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
