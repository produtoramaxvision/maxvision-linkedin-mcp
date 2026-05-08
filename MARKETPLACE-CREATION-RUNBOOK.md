# Marketplace Creation Runbook — Sessão Próxima

Este runbook é o ponto de entrada para a **próxima sessão Claude Code** que vai sair do blueprint e começar a execução. Lê isto primeiro, depois `MARKETPLACE-DECISION.md` e `docs/ROADMAP.md`.

> **Decisão final aprovada:** marketplace novo dedicado, repos isolados, license dual. Bloco 1 abaixo é Sprint 0 completo.

---

## Estado atual (2026-05-07)

- ✅ Blueprint completo escrito em `maxvision-linkedin-mcp/`.
- ✅ Decisão de marketplace tomada: **criar marketplace novo dedicado** (`maxvision-linkedin-suite`).
- ✅ Templates Docker, Swarm e Portainer prontos em `mcp-server/docker/`.
- ⏳ Repositórios GitHub ainda não criados.
- ⏳ DNS, landing, license server ainda não configurados.
- ⏳ Código MCP ainda não escrito.

---

## Bloco 1 — Sprint 0 (criação dos repositórios e infra base)

Tempo estimado: 4–6 horas.

### 1.1 — Criar repo público

```bash
# Via gh CLI
gh repo create produtoramaxvision/maxvision-linkedin-mcp \
  --public \
  --description "Automação LinkedIn nativa para Claude Code: busca de vagas, candidatura, outreach e otimização de perfil. Suite oficial MaxVision." \
  --homepage "https://linkedin.maxvision.com.br" \
  --license AGPL-3.0 \
  --add-readme
```

Mover o blueprint atual para o repo:

```bash
cd ~/Desktop/cursor-oficial
git clone https://github.com/produtoramaxvision/maxvision-linkedin-mcp.git maxvision-linkedin-mcp-git
cd maxvision-linkedin-mcp-git
# Copiar TUDO do blueprint
cp -r ../maxvision-linkedin-mcp/* .
cp -r ../maxvision-linkedin-mcp/.[!.]* . 2>/dev/null || true
git add -A
git commit -m "docs: import blueprint v0.1 (planning phase)"
git push origin main
```

### 1.2 — Criar repo privado

```bash
gh repo create produtoramaxvision/maxvision-linkedin-mcp-pro \
  --private \
  --description "Tier Pro/Agency do MaxVision LinkedIn Suite. Apenas para colaboradores autorizados."
```

Estrutura inicial:

```bash
cd ..
mkdir maxvision-linkedin-mcp-pro && cd maxvision-linkedin-mcp-pro
git init
mkdir -p plugins/linkedin-maxvision-pro mcp-server-pro/src n8n-workflows-premium license-server stripe-integration
cat > LICENSE-COMMERCIAL.md <<'EOF'
# MaxVision LinkedIn Suite — End User License Agreement
(ver docs/INFOPRODUCT-PACKAGING.md no repo público para texto completo)
EOF
git add -A
git commit -m "chore: initial Pro repo skeleton"
git remote add origin https://github.com/produtoramaxvision/maxvision-linkedin-mcp-pro.git
git push -u origin main
```

### 1.3 — DNS

| Subdomínio | Tipo | Aponta para | Uso |
|---|---|---|---|
| `linkedin.maxvision.com.br` | CNAME ou A | Vercel ou landing host | Landing page, marketing, docs |
| `linkedin-mcp.meuagente.api.br` | A | VPS Ubuntu | MCP server prod (cloud-hosted) |
| `license.linkedin.maxvision.com.br` | CNAME | Cloudflare Worker | License server |
| `api.linkedin.maxvision.com.br` | A ou CNAME | VPS Ubuntu | API pública (futuro) |

Configurar TLS automático via Cloudflare ou Let's Encrypt no Traefik.

### 1.4 — GitHub branch protection

```bash
# Repo público
gh api -X PUT repos/produtoramaxvision/maxvision-linkedin-mcp/branches/main/protection \
  -F required_status_checks.strict=true \
  -F required_status_checks.contexts[]=lint-typecheck \
  -F required_status_checks.contexts[]=unit-tests \
  -F required_status_checks.contexts[]=plugin-validation \
  -F enforce_admins=false \
  -F required_pull_request_reviews.required_approving_review_count=1 \
  -F required_pull_request_reviews.dismiss_stale_reviews=true \
  -F restrictions=

# Mesma config em homolog
gh api -X PUT repos/produtoramaxvision/maxvision-linkedin-mcp/branches/homolog/protection \
  -F required_status_checks.strict=true \
  -F enforce_admins=false \
  -F required_pull_request_reviews.required_approving_review_count=0 \
  -F restrictions=
```

### 1.5 — GitHub Actions secrets

```bash
gh secret set GHCR_TOKEN --repo produtoramaxvision/maxvision-linkedin-mcp
gh secret set LI_COOKIE_SANDBOX --repo produtoramaxvision/maxvision-linkedin-mcp
gh secret set SLACK_WEBHOOK_URL --repo produtoramaxvision/maxvision-linkedin-mcp
gh secret set STRIPE_TEST_KEY --repo produtoramaxvision/maxvision-linkedin-mcp-pro
gh secret set STRIPE_WEBHOOK_SECRET --repo produtoramaxvision/maxvision-linkedin-mcp-pro
gh secret set CF_API_TOKEN --repo produtoramaxvision/maxvision-linkedin-mcp-pro
```

### 1.6 — Configurar GitHub Container Registry

```bash
# Login local com PAT scope write:packages
echo $GH_TOKEN | docker login ghcr.io -u <username> --password-stdin

# Habilitar package via CI (workflow ci.yml já contempla)
```

### 1.7 — Issue templates e labels

Já estão definidos em `docs/INFOPRODUCT-PACKAGING.md`. Aplicar:

```bash
mkdir -p .github/ISSUE_TEMPLATE
# (criar arquivos bug.yml, feature.yml, compliance.yml — templates no docs/)

# Labels
for label in "bug" "feature" "compliance" "docs" "good-first-issue" "tier:free" "tier:pro" "tier:agency"; do
  gh label create "$label" --repo produtoramaxvision/maxvision-linkedin-mcp || true
done
```

### 1.8 — Cloudflare Worker para license server

```bash
cd ../maxvision-linkedin-mcp-pro/license-server
npm init -y
npm install -D wrangler
npx wrangler init
# Configurar wrangler.toml com domain license.linkedin.maxvision.com.br
# Implementar /v1/check, /v1/issue, /v1/revoke
# Deploy: npx wrangler deploy
```

### 1.9 — Stripe

1. Criar produtos no dashboard Stripe:
   - **MaxVision LinkedIn Suite — Pro** USD 29/mo (recurring)
   - **MaxVision LinkedIn Suite — Pro Annual** USD 290/yr
   - **MaxVision LinkedIn Suite — Agency** USD 99/mo
   - **MaxVision LinkedIn Suite — Agency Annual** USD 990/yr
2. Webhook → Cloudflare Worker `license.linkedin.maxvision.com.br/v1/stripe-webhook`.
3. Capturar `STRIPE_PRICE_ID_*` para landing.

### 1.10 — Landing inicial (placeholder)

Mínimo: hero + waitlist email. Vercel project linkado ao repo público.

```bash
mkdir -p landing
cd landing
pnpm create next-app@latest . --typescript --tailwind --app --src-dir
# Adicionar form de waitlist apontando para Resend/Loops/ConvertKit
pnpm dlx vercel --prod
```

---

## Bloco 2 — Validação pós-Sprint 0

Antes de avançar, conferir:

- [ ] Repo público acessível em github.com/produtoramaxvision/maxvision-linkedin-mcp
- [ ] Repo privado com permissão de owner
- [ ] Branch protection ativa em ambos
- [ ] Secrets do CI configurados
- [ ] Domínio `linkedin.maxvision.com.br` resolvendo
- [ ] Domínio `linkedin-mcp.meuagente.api.br` resolvendo
- [ ] Cloudflare Worker `/health` retornando 200
- [ ] Stripe products criados, webhook testado em sandbox
- [ ] Landing waitlist no ar

---

## Bloco 3 — Como continuar em outra sessão

Na próxima sessão Claude Code, fazer:

1. **Carregar contexto:**
   ```
   @C:\Users\MaxVision\Desktop\cursor-oficial\maxvision-linkedin-mcp\README.md
   @C:\Users\MaxVision\Desktop\cursor-oficial\maxvision-linkedin-mcp\MARKETPLACE-DECISION.md
   @C:\Users\MaxVision\Desktop\cursor-oficial\maxvision-linkedin-mcp\MARKETPLACE-CREATION-RUNBOOK.md
   @C:\Users\MaxVision\Desktop\cursor-oficial\maxvision-linkedin-mcp\docs\ROADMAP.md
   ```

2. **Decidir variante de start:**
   - **Variante A primeiro** (recomendado): "vamos começar Sprint 1 do PLAN-A".
   - **Paralelo A+B**: "vamos começar Sprint 1 + planejar webhooks da B".

3. **Executar Sprint 0 (Bloco 1 acima)** se ainda não foi feito.

4. **Iniciar Sprint 1** (criar `mcp-server/` real, código TS):
   ```
   /maxvision-orchestration:orchestrate Implementar Sprint 1 do MaxVision LinkedIn MCP
   conforme docs/ROADMAP.md. Tarefa: criar skeleton mcp-server (Node 20 + TS + Hono +
   @modelcontextprotocol/sdk + Patchright + Postgres) com 4 tools básicas (search_jobs,
   get_profile, get_job_details, track_application). Deploy local via docker compose
   primeiro, validar end-to-end, depois preparar docker-stack.yml para Swarm.
   ```

5. **Pedir code-architect** se preferir blueprint detalhado por arquivo:
   ```
   Use feature-dev:code-architect para detalhar arquivo-por-arquivo o Sprint 1,
   listando cada arquivo a criar com schemas, imports e relação entre eles.
   ```

---

## Bloco 4 — Comandos de referência rápida

### Git fluxo (sempre a partir de `homolog`)

```bash
git checkout homolog
git pull
git checkout -b feat/<nome-da-feature>
# trabalho
git add -A
git commit -m "feat(<escopo>): <descrição>"
git push -u origin feat/<nome-da-feature>
gh pr create --base homolog --title "feat(<escopo>): <título>" --body-file .github/pull_request_template.md
```

### Build local

```bash
cd mcp-server
pnpm install
pnpm build
pnpm test:unit
docker build -t linkedin-maxvision-mcp:local -f docker/Dockerfile .
```

### Deploy local

```bash
cd mcp-server/docker
cp .env.example .env
# editar
docker compose up -d
docker compose logs -f mcp
```

### Deploy Swarm (homologação ou prod)

```bash
docker stack deploy --with-registry-auth -c docker-stack.yml maxv-linkedin
docker service ps maxv-linkedin_mcp
docker service logs -f maxv-linkedin_mcp
```

### Release nova versão

```bash
# 1. Bump version
pnpm version minor   # ou patch/major
git push --follow-tags

# 2. CI builda e publica imagem ghcr.io/.../linkedin-maxvision-mcp:1.0.1

# 3. Update stacks
docker service update --image ghcr.io/produtoramaxvision/linkedin-maxvision-mcp:1.0.1 maxv-linkedin_mcp

# OU re-deploy stack inteira:
MCP_VERSION=1.0.1 docker stack deploy --with-registry-auth -c docker-stack.yml maxv-linkedin
```

---

## Bloco 5 — Checklist mestre antes do v1.0 launch

| Item | Status |
|---|---|
| Repos públicos + privados criados | ☐ |
| DNS + TLS configurados | ☐ |
| MCP server funcional com 10 tools | ☐ |
| Plugin Claude Code instalável via marketplace | ☐ |
| Subagent + skills + commands | ☐ |
| Cookie rotation multi-conta | ☐ |
| License server Cloudflare Worker live | ☐ |
| Stripe checkout funcional + sandbox testado | ☐ |
| Landing page com hero + pricing + checkout | ☐ |
| Docker + docker-compose + docker-stack + portainer-stack todos validados | ☐ |
| CI/CD passando (lint + typecheck + unit + Playwright canary) | ☐ |
| Docs cliente: setup-compose + setup-swarm + setup-portainer + setup-n8n | ☐ |
| Disclaimer de ToS LinkedIn em landing + setup CLI | ☐ |
| 5 beta testers usando há ≥1 semana sem ban | ☐ |
| Vídeo demo 3 min publicado | ☐ |
| EULA Pro publicada e revisada juridicamente | ☐ |

---

## Notas finais

- **Não criar código MCP nesta sessão.** Sessão atual é só blueprint.
- **Sprint 0 (Bloco 1) deve ser feito manualmente** ou orquestrado por sessão dedicada que tenha acesso a `gh`, Cloudflare e Stripe CLIs.
- **Quando Sprint 0 estiver completo**, próxima sessão começa Sprint 1 conforme `docs/ROADMAP.md`.
- **Mantenha este runbook atualizado** com decisões tomadas em cada Sprint (data, output, links).
