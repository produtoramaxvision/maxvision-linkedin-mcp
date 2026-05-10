# Session Handoff — MaxVision LinkedIn MCP

Data: 2026-05-10. Versão: **v0.1.0** (public launch).

---

## Estado atual

| Item | Estado |
|---|---|
| Versão pública | **v0.1.0** — todas as tags, manifests, docs e package.json atualizados |
| MCP server | LIVE em `https://linkedin-mcp.produtoramaxvision.com.br/mcp` |
| Tools ativas | 16 tools (Free: 12, Pro: 4) |
| Branch padrão | `homolog` — HEAD = commit pós docs-reorg |
| Stripe | Live account ativa; **price IDs ainda não criados** — ver `docs/stripe-live-activation.md` |
| GitHub release | **Pendente** — criar tag + release v0.1.0 (ver comandos abaixo) |
| Docker image | Tag `0.1.0` no GHCR **ainda não publicada** — CI cria na tag push |

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

## Próximas ações (em ordem)

### 1. Criar release v0.1.0 no GitHub

```bash
cd c:/Users/MaxVision/Desktop/cursor-oficial/maxvision-linkedin-mcp-git
git tag v0.1.0 HEAD
git push origin v0.1.0
gh release create v0.1.0 \
  --title "v0.1.0 — Public Launch" \
  --notes "First official public release. 16 MCP tools, Apify+BD backbone, Stripe integration, Free/Pro/Agency tiers. See CHANGELOG.md for full details." \
  --latest
```

### 2. Ativar Stripe live — criar price IDs

Ver `docs/stripe-live-activation.md` para guia completo. Resumo:
1. dashboard.stripe.com/products → criar Pro (R$79/mês, R$790/ano) + Agency (R$399/mês, R$3990/ano)
2. Copiar 4 price IDs → atualizar `landing/pricing.html` nos placeholders `price_REPLACE_*`
3. `wrangler secret put STRIPE_SECRET_KEY` (novo sk_live após rotação)
4. `wrangler secret put STRIPE_WEBHOOK_SECRET` (do webhook Stripe)
5. `cd workers/license && pnpm wrangler deploy`
6. Configurar `STRIPE_SECRET_KEY` na Cloudflare Pages (para checkout function)

### 3. Rotacionar chave Stripe

A `sk_live_` compartilhada nesta sessão deve ser rolada em `dashboard.stripe.com/apikeys`.

### 4. Publicar Docker image v0.1.0

```bash
# O CI (ci.yml) publica via push de tag para GHCR
git push origin v0.1.0  # triggera o release workflow
```

Verificar em `ghcr.io/produtoramaxvision/linux-maxvision-mcp:0.1.0` após o build.

### 5. Atualizar stack no VPS

```bash
# Via Portainer ou SSH na VPS 163.176.233.224
docker service update --image ghcr.io/produtoramaxvision/linkedin-maxvision-mcp:0.1.0 linkedin-mcp_mcp-server
```

---

## Referências rápidas

| Recurso | Localização |
|---|---|
| MCP endpoint | `https://linkedin-mcp.produtoramaxvision.com.br/mcp` |
| Plugin install | `claude /plugin install produtoramaxvision/maxvision-linkedin-mcp` |
| License worker | `https://license.produtoramaxvision.com.br/v1/*` |
| Landing | `https://linkedin.produtoramaxvision.com.br` |
| VPS | `163.176.233.224` (arm64, Oracle Cloud) |
| Cloudflare zone | `produtoramaxvision.com.br` |
| GitHub repos | `produtoramaxvision/maxvision-linkedin-mcp` (public) + `-mcp-pro` (private) |
| GHCR image | `ghcr.io/produtoramaxvision/linkedin-maxvision-mcp` |
| Stripe live acct | `acct_1SWXI9Ad1djWBWMQ` |

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
  → CF Worker license server → KV
```

---

## Pendências fora de escopo (não bloqueantes)

- Backfill git tags v0.13.2-v0.13.12 — busywork, sem consumer
- Vídeo demo + awesome-* submissions — marketing, sem prazo
- Sprint 4 tutorial videos — polishing, sem prazo

---

## Memória da sessão anterior

Commit de docs-reorg: `ad3a884` — 17 arquivos, +658/-836 LOC. Arquivos históricos movidos para `docs/historical/`. Branch `homolog` pushed.
