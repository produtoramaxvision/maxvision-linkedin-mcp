# Stripe Live Activation — MaxVision LinkedIn MCP

Status: **Stripe live account configured. Price IDs pending.**

---

## O que já está feito

- Conta Stripe live ativada (`acct_1SWXI9Ad1djWBWMQ`)
- Checkout Function em `landing/functions/api/checkout.ts` usa `STRIPE_SECRET_KEY` via env (nunca hardcoded)
- Cloudflare Worker em `workers/license/` usa `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` via `wrangler secret`
- `landing/pricing.html` tem placeholders `price_REPLACE_*` aguardando live price IDs

## Passo 1 — Criar produtos e preços no Stripe live

Acesse `dashboard.stripe.com/products` (certifique-se que o toggle é **Live**, não **Test**).

Criar 2 produtos:

### Produto: MaxVision LinkedIn Pro

- Name: `MaxVision LinkedIn Pro`
- Billing: Recurring
- Preço 1 — Monthly: R$ 79,00 / mês → anote o `price_xxx` gerado
- Preço 2 — Annual: R$ 790,00 / ano → anote o `price_xxx` gerado

### Produto: MaxVision LinkedIn Agency

- Name: `MaxVision LinkedIn Agency`
- Billing: Recurring
- Preço 1 — Monthly: R$ 399,00 / mês → anote o `price_xxx` gerado
- Preço 2 — Annual: R$ 3990,00 / ano → anote o `price_xxx` gerado

## Passo 2 — Atualizar pricing.html com os live price IDs

Em `landing/pricing.html`, substituir os 4 placeholders:

```js
const PRICES = {
  pro: {
    monthly: 'price_XXXX', // ID do Pro Monthly copiado do dashboard
    yearly:  'price_XXXX', // ID do Pro Annual
  },
  agency: {
    monthly: 'price_XXXX', // ID do Agency Monthly
    yearly:  'price_XXXX', // ID do Agency Annual
  },
};
```

## Passo 3 — Configurar secrets na Cloudflare Pages (checkout function)

No Cloudflare dashboard → `linkedin.produtoramaxvision.com.br` → Settings → Environment Variables:

```
STRIPE_SECRET_KEY = sk_live_***  (Production environment only)
```

Ou via CLI (se Pages Functions estiver wired ao Wrangler):

```bash
wrangler pages secret put STRIPE_SECRET_KEY --project-name linkedin-maxvision
# Cole o sk_live_*** quando solicitado
```

## Passo 4 — Configurar secrets no Cloudflare Worker (license server)

```bash
cd workers/license

# Chave secreta Stripe (live)
wrangler secret put STRIPE_SECRET_KEY
# Cole: sk_live_***

# Token de admin para /v1/revoke
wrangler secret put ADMIN_TOKEN
# Cole: token seguro gerado por você (ex: openssl rand -hex 32)
```

## Passo 5 — Configurar webhook Stripe → Worker

No Stripe dashboard → Developers → Webhooks → Add endpoint:

- URL: `https://license.produtoramaxvision.com.br/v1/stripe-webhook`
- Events: `checkout.session.completed`, `customer.subscription.deleted`
- Copiar o `Signing secret` (começa com `whsec_`)

```bash
cd workers/license
wrangler secret put STRIPE_WEBHOOK_SECRET
# Cole: whsec_***
```

## Passo 6 — Deploy do Worker

```bash
cd workers/license
pnpm wrangler deploy
```

Verificar: `curl https://license.produtoramaxvision.com.br/v1/check -H 'Content-Type: application/json' -d '{"licenseKey":"TEST"}' `

## Passo 7 — Rotacionar a chave Stripe

**A chave `sk_live_` compartilhada nesta sessão deve ser rotacionada.**

Stripe dashboard → Developers → API keys → Roll `Secret key` → copiar nova → repetir Passos 3 e 4 com a nova chave.

## Estado atual dos price IDs na conta live

A conta live (`acct_1SWXI9Ad1djWBWMQ`) tem produtos do WhatsApp AI suite (Plano Lite/Básico/Business/Premium). Os produtos LinkedIn MCP Pro/Agency **não existem ainda em live** — precisam ser criados no Passo 1.

---

## Referências

- Checkout Function: `landing/functions/api/checkout.ts`
- Worker source: `workers/license/src/index.ts`
- Worker wrangler: `workers/license/wrangler.toml`
- KV namespace ID: `fe9f907e596f49598d3bc4579c0b1a56`
