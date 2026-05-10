# Stripe Live Activation — MaxVision LinkedIn MCP

Status: **COMPLETO — 2026-05-10**

---

## O que foi feito (tudo concluído)

| Passo | Item | Estado |
|---|---|---|
| 1 | Produtos criados no Stripe live | ✅ |
| 2 | Price IDs inseridos em `landing/pricing.html` | ✅ |
| 3 | `STRIPE_SECRET_KEY` na Cloudflare Pages | ✅ |
| 4 | `STRIPE_SECRET_KEY` no Worker | ✅ |
| 5 | Webhook Stripe → Worker criado | ✅ |
| 5b | `STRIPE_WEBHOOK_SECRET` no Worker | ✅ |
| 5c | `ADMIN_TOKEN` no Worker | ✅ |
| 6 | Worker `maxv-linkedin-license` deployed | ✅ |
| 7 | Rotação da chave sk_live_ | ⚠ Pendente (usuario deferido) |

---

## Produtos e price IDs criados

### MaxVision LinkedIn Pro

| Período | Price ID |
|---|---|
| Mensal (R$ 79/mês) | `price_1TVT97Ad1djWBWMQMwXeOqFy` |
| Anual (R$ 790/ano) | `price_1TVT98Ad1djWBWMQYBDdaX7L` |

### MaxVision LinkedIn Agency

| Período | Price ID |
|---|---|
| Mensal (R$ 399/mês) | `price_1TVT98Ad1djWBWMQxqjTOqQI` |
| Anual (R$ 3990/ano) | `price_1TVT99Ad1djWBWMQEd2GjzAJ` |

---

## Secrets configuradas

### Cloudflare Pages (`linkedin-maxvision-landing`)

- `STRIPE_SECRET_KEY` — sk_live_*** (Production env)
- Configurado via Cloudflare API PATCH

### Cloudflare Worker (`maxv-linkedin-license`)

- `STRIPE_SECRET_KEY` — sk_live_***
- `STRIPE_WEBHOOK_SECRET` — whsec_5m5XZWBhyvNFYByW2ybDnac4RYoQLR6y
- `ADMIN_TOKEN` — 4f2378c01f9b898b0ca4ce32dbddd60f7283e93578e48a8ef870e677c11edccc

---

## Webhook Stripe

- ID: `we_1TVTruAd1djWBWMQuRpsEnts`
- URL: `https://license.produtoramaxvision.com.br/v1/stripe-webhook`
- Events: `checkout.session.completed`, `customer.subscription.deleted`
- Signing secret: `whsec_5m5XZWBhyvNFYByW2ybDnac4RYoQLR6y`

---

## Verificação do worker

```bash
curl https://license.produtoramaxvision.com.br/v1/check \
  -H 'Content-Type: application/json' \
  -d '{"licenseKey":"TEST"}'
# → {"error":"invalid_license_format"}  (esperado — worker ativo)
```

---

## Pendência: rotação da chave Stripe

A `sk_live_` foi compartilhada em sessão de chat e **deve ser rotacionada**:

1. `dashboard.stripe.com/apikeys` → Roll `Secret key` → copiar nova `sk_live_***`
2. Atualizar `stripe-live` em `~/.claude.json` (campo `env.STRIPE_SECRET_KEY`)
3. Atualizar Pages secret via Cloudflare dashboard ou API
4. Atualizar Worker secret: `cd workers/license && wrangler secret put STRIPE_SECRET_KEY`

---

## Referências

- Conta Stripe live: `acct_1SWXI9Ad1djWBWMQ` (Produtora MaxVision)
- Checkout Function: `landing/functions/api/checkout.ts`
- Worker source: `workers/license/src/index.ts`
- Worker wrangler: `workers/license/wrangler.toml`
- KV namespace ID: `fe9f907e596f49598d3bc4579c0b1a56`
- Pages project: `linkedin-maxvision-landing`
- Worker name: `maxv-linkedin-license`
