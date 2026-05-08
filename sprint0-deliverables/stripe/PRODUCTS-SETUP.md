# Stripe — Sprint 0 Setup

Stripe CLI **não está instalada** no host. Setup é manual via dashboard https://dashboard.stripe.com/.

## 1. Criar produtos (Stripe Dashboard → Products → Add product)

| Produto | Preço | Tipo | Lookup key | Metadata |
|---|---|---|---|---|
| MaxVision LinkedIn Suite — Pro | USD 29 / mo | Recurring | `linkedin_pro_monthly` | `tier=pro` |
| MaxVision LinkedIn Suite — Pro Annual | USD 290 / yr | Recurring | `linkedin_pro_yearly` | `tier=pro` |
| MaxVision LinkedIn Suite — Agency | USD 99 / mo | Recurring | `linkedin_agency_monthly` | `tier=agency` |
| MaxVision LinkedIn Suite — Agency Annual | USD 990 / yr | Recurring | `linkedin_agency_yearly` | `tier=agency` |

## 2. Capturar Price IDs

Após criar, copiar `price_xxx` de cada um e gravar em:

```bash
# Repo público .env.example (sem valor real)
STRIPE_PRICE_PRO_MONTHLY=price_TODO
STRIPE_PRICE_PRO_YEARLY=price_TODO
STRIPE_PRICE_AGENCY_MONTHLY=price_TODO
STRIPE_PRICE_AGENCY_YEARLY=price_TODO

# Vercel (landing) → Project Settings → Environment Variables
NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY=price_xxx
# (mesmos 4 IDs)
```

## 3. Webhook → Cloudflare Worker

Stripe Dashboard → Developers → Webhooks → Add endpoint:

- Endpoint URL: `https://license.linkedin.maxvision.com.br/v1/stripe-webhook`
- Events: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`
- Após criar, copiar **Signing secret** (`whsec_xxx`).

## 4. Adicionar secrets ao Worker

```bash
cd sprint0-deliverables/cloudflare-worker
pnpm dlx wrangler secret put STRIPE_WEBHOOK_SECRET    # cole whsec_xxx
pnpm dlx wrangler secret put STRIPE_API_KEY           # cole sk_test_... ou sk_live_...
```

## 5. Test mode primeiro

- Trabalhar **inteiramente em test mode** durante Sprint 0–1.
- Trocar para live mode somente depois de:
  - Webhook test event (dashboard → Send test event) chegar com 200.
  - License gerada via `/v1/check` validando com sucesso.
  - Beta com 5 usuários executados em sandbox.

## 6. Tax (BRL → USD)

- Habilitar **Stripe Tax** automático para US sales (state-by-state).
- Para BR: configurar conta separada ou usar gateway brasileiro (Pagar.me/Mercado Pago) — fora de Sprint 0.

## 7. Validação manual após setup

```bash
# Teste do webhook stub:
curl -X POST https://license.linkedin.maxvision.com.br/v1/stripe-webhook \
  -H "stripe-signature: t=$(date +%s),v1=test" \
  -H "content-type: application/json" \
  -d '{"type":"checkout.session.completed","data":{"object":{"id":"cs_test","metadata":{"tier":"pro"},"customer_details":{"email":"x@x.com"},"customer":"cus_test"}}}'
# Esperado: 200 {"received":true}
```
