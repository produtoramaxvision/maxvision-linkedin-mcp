# Stripe — Sprint 3 Setup (DEFERIDO)

> **Status: deferido para Sprint 3.** License server e Stripe só ativam quando feature Pro estiver pronta. Sprint 0/1/2 são tier free apenas. Não criar produtos agora.

Stripe CLI não está instalada no host. Setup é manual via dashboard https://dashboard.stripe.com/.

## Quando ativar

- ✅ MCP server core funcional (Sprint 1+2 done).
- ✅ Tier Pro features implementadas (`apply_easy`, `send_message`, multi-account).
- ✅ License middleware integrado no MCP server.
- ✅ Cloudflare Worker license server deployado.
- ✅ Validação end-to-end via `stripe-mcp` + browser (test mode).

## 1. Criar produtos (Stripe Dashboard → Products → Add product)

| Produto | Preço | Tipo | Lookup key | Metadata |
|---|---|---|---|---|
| MaxVision LinkedIn Suite — Pro | USD 29 / mo | Recurring | `linkedin_pro_monthly` | `tier=pro` |
| MaxVision LinkedIn Suite — Pro Annual | USD 290 / yr | Recurring | `linkedin_pro_yearly` | `tier=pro` |
| MaxVision LinkedIn Suite — Agency | USD 99 / mo | Recurring | `linkedin_agency_monthly` | `tier=agency` |
| MaxVision LinkedIn Suite — Agency Annual | USD 990 / yr | Recurring | `linkedin_agency_yearly` | `tier=agency` |

## 2. Capturar Price IDs

Após criar, copiar `price_xxx` de cada um e gravar em:

- Repo público `.env.example` (sem valor real)
- Cloudflare Pages → Settings → Environment Variables (`PUBLIC_STRIPE_PRICE_*`)

## 3. Webhook → Cloudflare Worker

Stripe Dashboard → Developers → Webhooks → Add endpoint:

- Endpoint URL: `https://license.linkedin.produtoramaxvision.com.br/v1/stripe-webhook`
- Events: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`
- Após criar, copiar **Signing secret** (`whsec_xxx`).

## 4. Adicionar secrets ao Worker

```bash
cd sprint0-deliverables/cloudflare-worker
pnpm dlx wrangler secret put STRIPE_WEBHOOK_SECRET    # cole whsec_xxx
pnpm dlx wrangler secret put STRIPE_API_KEY           # cole sk_test_... ou sk_live_...
```

## 5. Validação end-to-end (obrigatória antes de live mode)

Trabalhar **inteiramente em test mode** durante validação:

1. Stripe `stripe-mcp` cria customer test + checkout session.
2. Browser preenche checkout test (cartão `4242 4242 4242 4242`).
3. Webhook `checkout.session.completed` chega no Worker.
4. Worker emite license key e armazena em KV.
5. MCP server (cliente) chama `/v1/check` com a license key e recebe `valid: true`.
6. Feature Pro (ex: `apply_easy`) executa com sucesso.

## 6. Live mode

Trocar `sk_test_*` → `sk_live_*` somente depois de:

- Validação passo 5 acima rodando 100% verde.
- Beta com 5 usuários executando em sandbox por ≥1 semana.
- Disclaimer de ToS LinkedIn em landing + setup CLI.

## 7. Tax (BRL → USD)

- Habilitar **Stripe Tax** automático para US sales (state-by-state).
- Para BR: configurar conta separada ou usar gateway brasileiro (Pagar.me / Mercado Pago) — fora de escopo Sprint 3.
