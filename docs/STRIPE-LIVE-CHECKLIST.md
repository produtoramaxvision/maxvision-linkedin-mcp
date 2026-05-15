# Stripe Live Mode — Checklist de Ativação

> **Pré-requisito**: Você precisará da `sk_live_...` key do seu painel Stripe.  
> **Não ativar** antes de concluir toda a validação de produção.  
> **Reversão**: Se algo der errado em live mode, use `sk_test_` key + `wrangler secret put STRIPE_SECRET_KEY`.  
> **Data de referência**: 2026-05-15 (última validação)

---

## Fase 0: Pré-requisitos (verificação rápida)

Antes de começar, garantir que você tem:

- [ ] Acesso ao painel Stripe (https://dashboard.stripe.com)
- [ ] Conta Stripe **verificada** (documentação pessoal/empresarial aprovada)
- [ ] Acesso SSH/RDP à VPS ou acesso local ao `workers/license` directory
- [ ] Permissão para editar secrets no Cloudflare
- [ ] Link de contato para rollback rápido (ex: Slack channel)

---

## 1. Verificações no Painel Stripe

### 1.1 Confirmar status da conta

Acesse: https://dashboard.stripe.com/account

- [ ] **Account status**: "Active" ou "Verified" (não "Pending" ou "Restricted")
- [ ] **Business information**: Preenchido e validado
  - [ ] Nome da pessoa/empresa
  - [ ] Endereço físico
  - [ ] Telefone
  - [ ] Website (pode ser landing page LinkedIn MaxVision)
- [ ] **Identity verification**: Completo (KYC)
- [ ] **Bank account**: Conectado e verificado para recebimento
- [ ] **Two-factor authentication (2FA)**: Ativado via authenticator app (não SMS se possível)

### 1.2 Acessar API Keys

Acesse: https://dashboard.stripe.com/apikeys

- [ ] Visualizar abas: "Standard keys" (Active) ou "Restricted keys"
- [ ] Copiar **Secret key** da seção "Standard keys" (ou criar se não existir)
  - Formato esperado: `sk_live_` + 32 caracteres hexadecimais
  - **Não** compartilhar em chat/email desprotegido
  - Armazenar temporariamente em `.env.local` (não commitar)
- [ ] Anotar também a **Publishable key** (início: `pk_live_`)

### 1.3 Webhook setup no Stripe

Acesse: https://dashboard.stripe.com/webhooks

Procurar por endpoint existente com URL `https://license.produtoramaxvision.com.br/v1/stripe-webhook` ou `/v1/webhooks/stripe`.

Se **não existe**:

- [ ] Clicar "Add endpoint"
- [ ] **Endpoint URL**: `https://license.produtoramaxvision.com.br/v1/webhooks/stripe`
- [ ] **Events to send**: Selecionar:
  - [ ] `checkout.session.completed`
  - [ ] `customer.subscription.updated`
  - [ ] `customer.subscription.deleted`
  - [ ] `invoice.payment_failed`
  - [ ] `invoice.payment_succeeded`
- [ ] Clicar "Add events"
- [ ] **API version**: deixar default (versionamento automático)
- [ ] Clicar "Create endpoint"
- [ ] Copiar **Signing secret** (formato: `whsec_live_` + caracteres)

Se **já existe**:

- [ ] Confirmar que eventos selecionados acima estão ativados
- [ ] Copiar o Signing secret (não é possível recuperar; se perdido, regenerar)

---

## 2. Criar/Validar Produtos e Preços em Live Mode

Acesse: https://dashboard.stripe.com/products

Você precisa de 4 produtos com 4 preços cada (Pro mensal, Pro anual, Agency mensal, Agency anual).

### 2.1 Produto: LinkedIn MaxVision Pro

Se não existe, criar:

- [ ] Name: `LinkedIn MaxVision Pro`
- [ ] Type: `Service` (não Goods)
- [ ] Description: `Acesso Pro a automação de recrutamento no LinkedIn`
- [ ] Default price: (deixar em branco; iremos adicionar depois)
- [ ] Clicar "Create product"

### 2.2 Preços do Pro (adicionar ao produto acima)

Dentro do produto "LinkedIn MaxVision Pro", clicar "Add price" para cada:

#### Pro — Monthly (R$ 197/mês)

- [ ] Pricing model: `Recurring`
- [ ] Price: `197` BRL (Real Brasileiro)
- [ ] Billing period: `Monthly`
- [ ] Recurrence: `Repeats every 1 month`
- [ ] Clicar "Create price"
- [ ] **Anotar Price ID**: `price_XXXXX` (será usado depois em Cloudflare)

#### Pro — Annual (R$ 1.497/ano = R$ 124,75/mês)

- [ ] Pricing model: `Recurring`
- [ ] Price: `1497` BRL (desconto 24% vs mensal)
- [ ] Billing period: `Yearly`
- [ ] Recurrence: `Repeats every 1 year`
- [ ] Clicar "Create price"
- [ ] **Anotar Price ID**: `price_XXXXX`

### 2.3 Produto: LinkedIn MaxVision Agency

Se não existe, criar:

- [ ] Name: `LinkedIn MaxVision Agency`
- [ ] Type: `Service`
- [ ] Description: `Acesso Agency a automação de recrutamento com suporte prioritário`
- [ ] Clicar "Create product"

### 2.4 Preços do Agency

#### Agency — Monthly (R$ 497/mês)

- [ ] Pricing model: `Recurring`
- [ ] Price: `497` BRL
- [ ] Billing period: `Monthly`
- [ ] Clicar "Create price"
- [ ] **Anotar Price ID**: `price_XXXXX`

#### Agency — Annual (R$ 3.997/ano = R$ 333/mês)

- [ ] Pricing model: `Recurring`
- [ ] Price: `3997` BRL (desconto ~33% vs mensal)
- [ ] Billing period: `Yearly`
- [ ] Clicar "Create price"
- [ ] **Anotar Price ID**: `price_XXXXX`

### 2.5 Resumo de Price IDs

Ao final desta fase, você deve ter anotado 4 IDs:

```
STRIPE_PRO_MONTHLY_PRICE_ID=price_1XXX...
STRIPE_PRO_ANNUAL_PRICE_ID=price_1XXX...
STRIPE_AGENCY_MONTHLY_PRICE_ID=price_1XXX...
STRIPE_AGENCY_ANNUAL_PRICE_ID=price_1XXX...
```

---

## 3. Configurar Secrets no Cloudflare Worker

### 3.1 Preparar valores

Ter à mão:

- `sk_live_...` (Secret key do Stripe)
- `whsec_live_...` (Webhook signing secret)
- 4x `price_1XXX...` IDs (da seção anterior)
- `ADMIN_TOKEN` existente (se estiver usando; gerar com `openssl rand -hex 32` caso contrário)

### 3.2 Adicionar secrets via wrangler CLI

Executar **no diretório `workers/license/`**:

```bash
# Navegue para o diretório
cd workers/license

# 1. Secret do Stripe
wrangler secret put STRIPE_SECRET_KEY
# Colar valor quando prompt aparecer: sk_live_...
# Pressionar Ctrl+D (ou Cmd+D no Mac) para confirmar

# 2. Webhook secret
wrangler secret put STRIPE_WEBHOOK_SECRET
# Colar: whsec_live_...

# 3-6. Price IDs
wrangler secret put STRIPE_PRO_MONTHLY_PRICE_ID
# Colar: price_1XXX...

wrangler secret put STRIPE_PRO_ANNUAL_PRICE_ID
# Colar: price_1XXX...

wrangler secret put STRIPE_AGENCY_MONTHLY_PRICE_ID
# Colar: price_1XXX...

wrangler secret put STRIPE_AGENCY_ANNUAL_PRICE_ID
# Colar: price_1XXX...

# 7. Admin token (opcional, se não existir)
wrangler secret put ADMIN_TOKEN
# Gerar novo: openssl rand -hex 32
# Colar valor
```

### 3.3 Validar secrets foram configurados

```bash
# Ver lista de secrets (valores não aparecem, apenas nomes)
wrangler secret list

# Output esperado:
# STRIPE_SECRET_KEY
# STRIPE_WEBHOOK_SECRET
# STRIPE_PRO_MONTHLY_PRICE_ID
# STRIPE_PRO_ANNUAL_PRICE_ID
# STRIPE_AGENCY_MONTHLY_PRICE_ID
# STRIPE_AGENCY_ANNUAL_PRICE_ID
# ADMIN_TOKEN (se aplicável)
```

- [ ] Todos os 6-7 secrets aparecem na lista

### 3.4 Verificar arquivo de configuração

Editar (ou verificar) `workers/license/wrangler.toml`:

```toml
# Seção [env.production]
[env.production]
# ... configurações existentes ...
# Não precisa listar secrets aqui (wrangler infere automaticamente)
```

- [ ] Arquivo existe e tem `[env.production]`

---

## 4. Deploy do Worker em Production

### 4.1 Build (se aplicável)

```bash
cd workers/license

# Verificar se há build step
pnpm build  # ou npm run build

# Resultado esperado: pasta `dist/` ou `build/` criada
```

- [ ] Build completa sem erros

### 4.2 Deploy para production

```bash
# Deploy na environment "production"
wrangler deploy --env production

# Ou, se não tiver env separado:
wrangler deploy
```

Aguardar confirmação:
```
✓ Uploading [████████████████████████████████] 100%
✓ Bundling assets...
✓ Deployment successful!

URL: https://license.produtoramaxvision.com.br
```

- [ ] Deploy sucesso (URL confirmada)

### 4.3 Verificar logs pós-deploy

```bash
# Ver últimos logs da worker
wrangler tail --env production

# Deixar rodando por 30s para verificar se há erros iniciais
```

- [ ] Sem erros "Unhandled" ou mensagens de secret faltando

---

## 5. Atualizar Landing Page com Live Price IDs

Editar arquivos da landing page para apontar para checkout Stripe live (não test).

### 5.1 Arquivos a atualizar

Procurar por todos os arquivos em `landing/` que contêm referência a Stripe checkout. Tipicamente:

- `landing/pricing.html`
- `landing/src/components/Pricing.tsx` (se usar React/TypeScript)
- `landing/functions/api/checkout.ts` (Cloudflare Function)

### 5.2 Encontrar e substituir

**Buscar por**: `price_test_` (test mode)  
**Substituir por**: `price_live_` (live mode)

Exemplo antes:
```html
<button onclick="checkout('price_test_1ABC...')">Assinar Pro Mensal</button>
```

Depois:
```html
<button onclick="checkout('price_live_1ABC...')">Assinar Pro Mensal</button>
```

- [ ] Todos os botões "Assinar" apontam para `price_live_`
- [ ] Nenhum `price_test_` permanece na landing live

### 5.3 Verificar função de checkout

Arquivo `landing/functions/api/checkout.ts` deve:

- [ ] Aceitar `priceId` como parâmetro
- [ ] Verificar se priceId começa com `price_live_`
- [ ] Chamar `stripe.checkout.sessions.create()` com esse price
- [ ] Retornar `session.url` (redirect para checkout Stripe)

Exemplo:
```typescript
export default async (request: Request): Promise<Response> => {
  const { priceId } = await request.json();
  
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price: priceId,  // ex: price_live_1ABC...
      quantity: 1,
    }],
    success_url: 'https://...',
    cancel_url: 'https://...',
  });
  
  return new Response(JSON.stringify({ url: session.url }));
};
```

- [ ] Código contém lógica de checkout correta

### 5.4 Deploy landing page

Se usar Cloudflare Pages:

```bash
# Fazer push para branch (ex: main/production)
git add landing/
git commit -m "chore: update landing stripe price ids to live mode"
git push origin main
```

Cloudflare Pages redeploy automaticamente.

- [ ] Deploy sucesso (verificar dashboard Pages)

Se usar outro provider (Vercel, Netlify):
- [ ] Deploy via `vercel deploy --prod` ou similar

---

## 6. Smoke Test em Live Mode

### 6.1 Teste de checkout session (via API)

Executar de um cliente HTTP (curl, Postman, etc.):

```bash
# Teste de criação de checkout session
curl -X POST https://license.produtoramaxvision.com.br/v1/checkout \
  -H 'Content-Type: application/json' \
  -d '{
    "priceId": "price_live_1XXX...",
    "email": "teste@example.com"
  }'

# Resposta esperada:
# {
#   "checkoutUrl": "https://checkout.stripe.com/pay/cs_live_...",
#   "sessionId": "cs_live_..."
# }
```

- [ ] API retorna `checkoutUrl` válido (contém `checkout.stripe.com`)

### 6.2 Teste de purchase com cartão real (ou teste Stripe)

**Opção A: Cartão de teste Stripe (recomendado para smoke test)**

Use cartão `4242 4242 4242 4242` (Visa de teste que funciona em live mode):
- Expiração: qualquer data futura (ex: 12/25)
- CVC: qualquer 3 dígitos (ex: 123)

**Opção B: Cartão real com reembolso**

Se usar cartão real:
- [ ] Usar transação de R$ 1 ou menor
- [ ] Ter cupom de desconto 100% pronto para aplicar antes da compra (se possível)
- [ ] Planejar reembolso manual pós-teste

### 6.3 Executar teste end-to-end

1. Acessar landing page: https://linkedin-maxvision.produtoramaxvision.com.br/pricing
2. Clicar em "Assinar Pro Mensal" (ou outro plano)
3. Será redirecionado para Stripe checkout
4. Preencher:
   - [ ] Email: seu_email@example.com
   - [ ] Cartão: 4242 4242 4242 4242
   - [ ] Expiração: 12/25
   - [ ] CVC: 123
5. Clicar "Pay" (ou "Assinar")
6. Aguardar redirecionamento para success page

- [ ] Checkout completa sem erro
- [ ] Redirecionado para success page (não erro)

### 6.4 Verificar webhook foi recebido

Ir para Stripe Dashboard → Developers → Webhooks → [seu endpoint]

- [ ] Log de eventos mostra `checkout.session.completed` recebido há segundos
- [ ] Status: "Processed" (não "Pending" ou "Failed")

### 6.5 Verificar licença foi criada

Fazer request para verificar se licença consta em KV ou banco de dados:

```bash
# Se usar Cloudflare KV:
wrangler kv:key list --namespace-id <ID>

# Deve listar uma chave recente com padrão: license_XXXXX
# Ou conferir no dashboard Cloudflare → KV → default namespace
```

- [ ] Chave de licença criada para o email testado

### 6.6 Validar email foi enviado

Conferir inbox do email usado no teste:

- [ ] Email de confirmação recebido (via Resend ou similar)
- [ ] Contém: license key, pricing tier, link para docs
- [ ] Sem erros de sintaxe ou placeholders não-substituídos

### 6.7 Testar MCP server com a licença

Usar a license key para validar contra MCP server:

```bash
curl -X POST https://linkedin-mcp.produtoramaxvision.com.br/v1/validate-license \
  -H 'Content-Type: application/json' \
  -d '{"licenseKey": "LIC_XXXXX"}'

# Resposta esperada:
# {
#   "valid": true,
#   "tier": "pro",
#   "email": "teste@example.com",
#   "expiresAt": "2027-05-15T..."
# }
```

- [ ] License validação retorna `"valid": true`

---

## 7. Monitoramento Pós-ativação (Primeiras 72h)

### 7.1 Stripe Dashboard

Acessar: https://dashboard.stripe.com/overview

- [ ] **Transactions**: Confirmar que a transação de teste aparece (pode levar até 5min)
- [ ] **Revenue**: Verifica se está acumulando corretamente
- [ ] **Failed payments**: Deve estar vazio (ou com rate muito baixo se houver volume)
- [ ] **Disputes**: Monitorar (geralmente 0 nas primeiras horas)

### 7.2 Cloudflare Worker logs

```bash
wrangler tail --env production --format pretty

# Deixar rodando e monitorar por 1 hora
# Buscar por:
# - Erros de autenticação Stripe (401)
# - Webhook failures
# - Rate limit warnings
```

- [ ] Sem erros críticos nos logs

### 7.3 Sentry (se configurado)

Acessar seu projeto Sentry (ex: linkedin-maxvision):

- [ ] **Error rate**: Deve ser < 1%
- [ ] **New issues**: Revisar qualquer issue crítica levantada

### 7.4 Cloudflare Analytics

Acessar Cloudflare Dashboard → Workers → maxv-linkedin-license:

- [ ] **Requests**: Visualizar volume de requests
- [ ] **Errors**: Taxa de erro < 1%
- [ ] **CPU time**: P99 latency < 2s

### 7.5 Alertas recomendados

Configurar notificações para:

- [ ] Stripe: falha de pagamento (email automático do Stripe)
- [ ] Cloudflare: Worker error rate > 5% (via Cloudflare alerts)
- [ ] Sentry: Nova issue crítica (via Sentry rules)

---

## 8. Rollback (plano de contingência)

Se algo der errado em live mode:

### 8.1 Rollback rápido para teste (< 5 min)

```bash
cd workers/license

# Reverter para test mode
wrangler secret put STRIPE_SECRET_KEY
# Colar: sk_test_... (sua test key)

wrangler secret put STRIPE_WEBHOOK_SECRET
# Colar: whsec_test_... (seu test webhook secret)

# Re-deploy
wrangler deploy --env production
```

- [ ] Secrets atualizadas
- [ ] Deploy confirmado

### 8.2 Landing page fallback

Se checkout estiver falhando:

```bash
# Remover temporariamente checkout buttons
cd landing
# Editar pricing.html e remover/desabilitar botões de compra

git add landing/
git commit -m "fix: disable checkout temporarily for rollback"
git push origin main
```

- [ ] Landing page redeployed sem botões de compra

### 8.3 Comunicar aos usuários

Se houver outage:

- [ ] Mensagem de status em `/pricing`: "Checkout temporariamente indisponível"
- [ ] Email automático de refund (se pagamento foi debitado mas falhou)
- [ ] Slack/Discord notification ao time (if applicable)

---

## 9. Checklist Final (pré-marcar como "live")

Antes de considerar Stripe em live mode oficialmente ativo:

- [ ] Fase 1 (Painel Stripe): Todos itens completos
- [ ] Fase 2 (Produtos/Preços): 4 preços criados, 4 IDs anotados
- [ ] Fase 3 (Secrets): Todos os 6-7 secrets adicionados via wrangler
- [ ] Fase 4 (Deploy): Worker deployado com sucesso
- [ ] Fase 5 (Landing): Landing page atualizada com price IDs live
- [ ] Fase 6 (Smoke test): Checkout completado, email recebido, MCP valida
- [ ] Fase 7 (Monitoramento): Primeira hora de logs monitorada sem críticos
- [ ] Fase 8 (Rollback): Plano de rollback documentado e testado (mentally)
- [ ] Fase 9 (Comunicação): Time informado e documentação atualizada

---

## Referências e Links Úteis

| Recurso | URL |
|---|---|
| Stripe Live Mode Docs | https://stripe.com/docs/keys |
| Stripe API Reference | https://stripe.com/docs/api |
| Cloudflare Workers Secrets | https://developers.cloudflare.com/workers/platform/environment-variables/ |
| MCP Server Endpoint | https://linkedin-mcp.produtoramaxvision.com.br |
| License Validation API | https://license.produtoramaxvision.com.br/v1/validate-license |
| Landing Page | https://linkedin-maxvision.produtoramaxvision.com.br/pricing |

---

## Histórico de ativações

| Data | Executor | Resultado | Notas |
|---|---|---|---|
| 2026-05-10 | [previous agent] | ✅ Sucesso | Primeiros 4 preços criados e secrets adicionadas |
| 2026-05-15 | technical-writer | — | Este checklist criado para próximas ativações |
| — | — | — | Aguardando próxima ativação/validação |

---

**Última revisão**: 2026-05-15  
**Próxima revisão**: Após 30 dias de operação em live mode ou quando houver update de pricing
