# License Server Deploy Checklist (Sprint 3 prod)

Step-by-step para colocar o sistema license + Stripe live, mantendo Stripe
em test mode até o plugin ter 2-3 clientes beta validados.

---

## Etapa 1 — Cloudflare Worker deploy (license server)

```bash
# 1. Login Cloudflare (uma vez):
cd workers/license
npx wrangler login

# 2. Criar KV namespace:
npx wrangler kv:namespace create maxv-linkedin-licenses

# Output exemplo:
#   id = "abc123def456..."
# Copie o id e cole em wrangler.toml na linha:
#   id = "REPLACE_WITH_KV_ID_FROM_WRANGLER_OUTPUT"

# 3. Setar secrets (Stripe + admin):
npx wrangler secret put STRIPE_WEBHOOK_SECRET
# (cole whsec_xxx do Stripe dashboard)

npx wrangler secret put STRIPE_SECRET_KEY
# (cole sk_test_xxx ou sk_live_xxx — começamos test)

npx wrangler secret put ADMIN_TOKEN
# (gere com `openssl rand -hex 32` — usado para POST /v1/revoke)

# 4. Deploy:
npx wrangler deploy

# Output:
#   Published maxv-linkedin-license (1.23 sec)
#     https://maxv-linkedin-license.your-subdomain.workers.dev
```

---

## Etapa 2 — DNS license.linkedin.maxvision.com.br

No Cloudflare zone `linkedin.maxvision.com.br`:

1. **DNS → Add record:**
   - Type: `CNAME`
   - Name: `license`
   - Target: `maxv-linkedin-license.your-subdomain.workers.dev`
   - Proxy: ✅ ON (orange cloud) — necessário para Worker route bind
   - TTL: Auto

2. **Workers Routes → Add route** (já está em wrangler.toml):
   ```
   license.linkedin.maxvision.com.br/v1/*  →  maxv-linkedin-license
   ```

3. Validar:
   ```bash
   curl -X POST https://license.linkedin.maxvision.com.br/v1/check \
     -H 'Content-Type: application/json' \
     -d '{"licenseKey":"MAXV-PRO-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}'
   # Esperado: 404 {"valid":false,"reason":"not_found"}
   ```

---

## Etapa 3 — Stripe webhook URL

No Stripe dashboard (https://dashboard.stripe.com/test/webhooks):

1. **Developers → Webhooks → Add endpoint**
2. **Endpoint URL:** `https://license.linkedin.maxvision.com.br/v1/issue`
3. **Events to send:** selecionar `checkout.session.completed`
   (futuro: `invoice.paid`, `customer.subscription.updated`,
   `customer.subscription.deleted` para renovação automática)
4. Clicar Add → Stripe gera `whsec_xxx` → copiar
5. Voltar e atualizar worker secret:
   ```bash
   cd workers/license
   echo "whsec_xxx" | npx wrangler secret put STRIPE_WEBHOOK_SECRET
   ```

---

## Etapa 4 — Conectar Stripe Checkout ao pricing page

Editar `landing/pricing.html`:

```html
<!-- Substituir o alert() placeholder pelo redirect ao Stripe Checkout -->
<script>
const PRICES = {
  'pro': {
    'monthly': 'price_1TUwQaDUMJkQwpuN6GCkJlF1',  // R$ 79
    'yearly':  'price_1TUwQbDUMJkQwpuNDg13xglr',  // R$ 790
  },
  'agency': {
    'monthly': 'price_1TUwQcDUMJkQwpuN2A44CHXx',  // R$ 399
    'yearly':  'price_1TUwQdDUMJkQwpuNOF4pt9wB',  // R$ 3990
  },
};

document.querySelectorAll('.js-checkout').forEach((el) => {
  el.addEventListener('click', async (e) => {
    e.preventDefault();
    const tier = el.dataset.tier;
    const period = el.dataset.period || 'monthly';
    const priceId = PRICES[tier][period];

    // Cloudflare Pages Function que chama Stripe Checkout API:
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({priceId, tier}),
    });
    const {url} = await res.json();
    window.location.href = url;
  });
});
</script>
```

Criar `landing/functions/api/checkout.ts` (Cloudflare Pages Function):

```typescript
export const onRequestPost = async (ctx) => {
  const { priceId, tier } = await ctx.request.json();
  const stripe = new (await import('stripe')).default(ctx.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: 'https://linkedin.maxvision.com.br/thanks?session={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://linkedin.maxvision.com.br/pricing',
    metadata: { tier, expires_in_days: '365' },
    locale: 'pt-BR',
  });
  return Response.json({ url: session.url });
};
```

Adicionar `STRIPE_SECRET_KEY` aos Cloudflare Pages secrets (mesmo `sk_test_xxx` do worker por enquanto).

---

## Etapa 5 — MCP server: ativar license check

No Portainer stack env:

```yaml
LICENSE_CHECK_ENABLED: "true"           # de "false" para "true"
LICENSE_SERVER_URL: https://license.linkedin.maxvision.com.br
```

Redeploy. Pro tools (apply_easy, send_message, search_people, post_update)
agora exigem `X-MaxVision-License` header válido.

---

## Etapa 6 — Plugin: enviar header license

Em `plugins/linkedin-maxvision/.claude-plugin/plugin.json`:

```json
{
  "mcpServers": {
    "linkedin-maxvision": {
      "type": "http",
      "url": "https://linkedin-mcp.produtoramaxvision.com.br/mcp",
      "headers": {
        "Authorization": "Bearer ${MAXVISION_API_KEY}",
        "X-MaxVision-License": "${MAXVISION_LICENSE}"
      }
    }
  }
}
```

User exporta `MAXVISION_LICENSE=MAXV-PRO-xxx` (vindo do email pós-checkout)
no shell + reinstala plugin.

---

## Etapa 7 — Validar end-to-end

Test mode:

```bash
# 1. Trigger checkout (test card: 4242 4242 4242 4242, qualquer CVC/data)
# 2. Stripe webhook dispara → worker emite key
# 3. Cliente recebe email com MAXV-PRO-xxx (TODO: integrar Resend)
# 4. Cliente exporta env + chama /linkedin-apply
# 5. MCP server lê X-MaxVision-License → valida no worker → libera
# 6. Auditar:
curl -X POST https://license.linkedin.maxvision.com.br/v1/check \
  -H 'Content-Type: application/json' \
  -d '{"licenseKey":"MAXV-PRO-xxx"}'
# Esperado: {"valid":true,"tier":"pro","expiresAt":"..."}
```

---

## Etapa 8 — Live mode (depois de 2-3 clientes beta validados)

1. Stripe dashboard: switch test → live
2. Recriar os 4 prices em live mode (mesmas características — UI Stripe tem
   botão "Copy to live mode")
3. Atualizar `landing/pricing.html` com os novos `price_xxx` live
4. Atualizar worker secret `STRIPE_SECRET_KEY` com `sk_live_xxx`
5. Atualizar webhook endpoint para receber eventos live (URL muda mas vai
   para o mesmo worker; webhook signing secret muda — atualizar
   `STRIPE_WEBHOOK_SECRET` worker secret)

---

## TODO Sprint 8 — automation

- [ ] Resend/Loops integration no worker para enviar email com license key
- [ ] `/customer-portal` redirect via stripe.billingPortal.sessions.create
- [ ] License auto-renewal: webhook `invoice.paid` → extend expiresAt
- [ ] License auto-revoke: webhook `customer.subscription.deleted` → revoke
