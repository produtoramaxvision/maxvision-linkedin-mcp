# Session Handoff — MaxVision LinkedIn MCP

Data: 2026-05-10. Versão: **v0.1.0** (public launch).

---

## Estado atual

| Item | Estado |
|---|---|
| Versão pública | **v0.1.0** — tags, manifests, docs, package.json atualizados |
| MCP server | LIVE em `https://linkedin-mcp.produtoramaxvision.com.br/mcp` |
| Tools ativas | 16 tools (Free: 12, Pro: 4) |
| Branch padrão | `homolog` — HEAD = commit `92a0e5f` (stripe live price IDs) |
| Tag v0.1.0 | Criada localmente — **push + GitHub release pendente** |
| Stripe | **COMPLETO** — produtos, price IDs, Pages secret, Worker secrets, webhook |
| License worker | LIVE em `https://license.produtoramaxvision.com.br/v1/*` |
| Docker image | Tag `0.1.0` no GHCR pendente — CI cria na tag push |
| Chave sk_live_ | ⚠ Deve ser rotacionada (`dashboard.stripe.com/apikeys`) |

---

## 16 Tools ativas

| Surface | Tools | Tier |
|---|---|---|
| Jobs | `search_jobs`, `get_job_details` | Free |
| Jobs | `apply_easy` | Pro |
| Profiles | `get_profile`, `optimize_profile`, `get_profile_activity` | Free |
| People | `search_people` | Pro |
| Companies | `get_company_info`, `search_companies`, `find_company_employees` | Free |
| Feed/Posts | `list_feed`, `monitor_post_engagement` | Free |
| Feed/Posts | `post_update` | Pro |
| Messaging | `send_message` | Pro |
| Tracking | `track_application`, `list_applications` | Free |

---

## Stripe — configuração completa

| Item | Valor |
|---|---|
| Conta live | `acct_1SWXI9Ad1djWBWMQ` |
| Pro monthly price | `price_1TVT97Ad1djWBWMQMwXeOqFy` |
| Pro annual price | `price_1TVT98Ad1djWBWMQYBDdaX7L` |
| Agency monthly price | `price_1TVT98Ad1djWBWMQxqjTOqQI` |
| Agency annual price | `price_1TVT99Ad1djWBWMQEd2GjzAJ` |
| Webhook ID | `we_1TVTruAd1djWBWMQuRpsEnts` |
| Pages project | `linkedin-maxvision-landing` (STRIPE_SECRET_KEY configurada) |
| Worker name | `maxv-linkedin-license` (3 secrets configuradas) |

---

## Próximas ações

### 1. Push tag + GitHub release (BLOQUEANTE para Docker CI)

```bash
cd c:/Users/MaxVision/Desktop/cursor-oficial/maxvision-linkedin-mcp-git
git push origin v0.1.0
gh release create v0.1.0 \
  --title "v0.1.0 — Public Launch" \
  --notes "First official public release. 16 MCP tools, Apify+BD backbone, Stripe integration, Free/Pro/Agency tiers." \
  --latest
```

### 2. Rotacionar chave Stripe

Ver `docs/stripe-live-activation.md` → seção "Pendência: rotação".

### 3. Testar checkout end-to-end

1. Abrir `https://linkedin.produtoramaxvision.com.br/pricing.html`
2. Clicar "Assinar Pro" → deve redirecionar para Stripe Checkout
3. Completar com cartão teste: `4242 4242 4242 4242`
4. Verificar webhook fire em `dashboard.stripe.com/webhooks`
5. Verificar license key provisionada no KV

### 4. Publicar Docker image v0.1.0

```bash
# CI (ci.yml) publica via push de tag
git push origin v0.1.0  # já feito no passo 1
```

### 5. Atualizar VPS após nova imagem

```bash
# SSH na VPS 163.176.233.224 ou via Portainer
docker service update --image ghcr.io/produtoramaxvision/linkedin-maxvision-mcp:0.1.0 linkedin-mcp_mcp-server
```

---

## Referências rápidas

| Recurso | Localização |
|---|---|
| MCP endpoint | `https://linkedin-mcp.produtoramaxvision.com.br/mcp` |
| Plugin install | `claude /plugin install produtoramaxvision/maxvision-linkedin-mcp` |
| License worker | `https://license.produtoramaxvision.com.br/v1/*` |
| Landing + pricing | `https://linkedin.produtoramaxvision.com.br` |
| VPS | `163.176.233.224` (arm64, Oracle Cloud) |
| Cloudflare zone | `produtoramaxvision.com.br` |
| GitHub repos | `produtoramaxvision/maxvision-linkedin-mcp` (public) + `-mcp-pro` (private) |
| GHCR image | `ghcr.io/produtoramaxvision/linkedin-maxvision-mcp` |

---

## Arquitetura backbone

```
Claude Code → plugin → POST /mcp (Bearer MAXVISION_API_KEY)
  → Hono (Node 20, arm64 VPS)
  → McpServer (per-request, stateless)
  → Tools → Apify harvestapi actors (Mode A default)
           → BD Web Unlocker para /jobs surfaces
           → Patchright pool (Mode B/C fallback, apply_easy)
  → Drizzle/Postgres (jobs_cache, profiles_cache, applications, accounts)
  → Redis (rate-limit token bucket)
  → AsyncLocalStorage license context → gateToolByLicense()
  → CF Worker license server (maxv-linkedin-license) → KV
  → CF Pages checkout function → Stripe Checkout API
```

---

## Pendências fora de escopo (não bloqueantes)

- Backfill git tags v0.13.2-v0.13.12 — busywork, sem consumer
- Vídeo demo + awesome-* submissions — marketing, sem prazo
- Sprint 4 tutorial videos — polishing, sem prazo
