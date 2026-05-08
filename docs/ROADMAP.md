# Roadmap — MaxVision LinkedIn MCP

Cronograma de execução das duas variantes, dividido em sprints semanais. Total: ~3 semanas úteis para v1.5 completa (Variantes A + B + tier Agency).

---

## Sprint 0 — Setup (1 dia)

> **Runbook detalhado:** [MARKETPLACE-CREATION-RUNBOOK.md](../MARKETPLACE-CREATION-RUNBOOK.md). O runbook é o ponto de entrada da próxima sessão Claude Code.

### Objetivos
- Repositórios criados (público + privado).
- CI/CD básico funcionando (lint + typecheck + unit + swarm-deploy-test).
- DNS, license server e landing waitlist no ar.
- Conta LinkedIn sandbox criada (descartável, dados fictícios).

### Tarefas

- [ ] Criar repo público `produtoramaxvision/maxvision-linkedin-mcp`.
- [ ] Criar repo privado `produtoramaxvision/maxvision-linkedin-mcp-pro`.
- [ ] Importar este blueprint para o repo público (commit `docs: import blueprint v0.2`).
- [ ] Configurar `.github/workflows/ci.yml` (lint + typecheck + unit tests + plugin-validation).
- [ ] Configurar `.github/workflows/release.yml` (build multi-arch amd64 + arm64).
- [ ] Configurar `.github/workflows/swarm-deploy-test.yml` (validação semanal de Swarm stack).
- [ ] Configurar branch protection em `main` e `homolog`.
- [ ] Criar `LICENSE` (AGPL-3.0) + `LICENSE-COMMERCIAL.md`.
- [ ] README.md inicial com badges e visão.
- [ ] DNS: `linkedin.maxvision.com.br` → landing (Vercel).
- [ ] DNS: `linkedin-mcp.meuagente.api.br` → VPS (Traefik).
- [ ] DNS: `license.linkedin.maxvision.com.br` → Cloudflare Worker.
- [ ] Cloudflare Worker license server (`wrangler init` + endpoints `/v1/check`, `/v1/issue`, `/v1/revoke`).
- [ ] Stripe products criados (Pro mensal/anual, Agency mensal/anual) + webhook test.
- [ ] Landing waitlist (Next.js + Vercel) com hero + form Resend/Loops.
- [ ] Conta LinkedIn sandbox + extração cookie `li_at` para dev.
- [ ] Tags e labels GitHub: `bug`, `feature`, `compliance`, `docs`, `tier:free|pro|agency`.

---

## Sprint 1 — MCP core MVP (3 dias)

### Objetivos
- MCP server Node + TS rodando localmente com 4 tools.
- Plugin Claude Code básico instalável.
- Deploy VPS.

### Tarefas

#### Dia 1 — Skeleton + browser pool

- [ ] `mcp-server/` com `package.json`, `tsconfig.json`, `vitest.config.ts`.
- [ ] Estrutura `src/{tools,browser,cache,auth,server}.ts`.
- [ ] Hono HTTP server + MCP SDK stdio dual mode.
- [ ] BrowserPool com Patchright (single account).
- [ ] Postgres migrations (script `scripts/migrate.ts`).
- [ ] Health check endpoint `/health`.

#### Dia 2 — 4 tools básicas

- [ ] `search_jobs` (LinkedIn via Patchright + JobSpy via Python subprocess).
- [ ] `get_profile` (Patchright scraping).
- [ ] `get_job_details`.
- [ ] `track_application`.
- [ ] Schemas Zod completos.
- [ ] Unit tests Vitest com mocks.

#### Dia 3 — Plugin + deploy

- [ ] `plugins/linkedin-maxvision/plugin.json`.
- [ ] Skills: `linkedin-job-search`, `linkedin-resume-tailor`.
- [ ] Subagent: `linkedin-job-hunter` (markdown).
- [ ] Commands: `/linkedin-scan`.
- [ ] **Validar imagem Docker** (`mcp-server/docker/Dockerfile` já existe no blueprint — só ajustar paths se houver mudança).
- [ ] **Subir via Compose local** (`docker compose up -d`) — primeiro modo a validar.
- [ ] **Subir via Swarm single-node** (`docker stack deploy -c docker-stack.yml maxv-test`) — segundo modo.
- [ ] **Subir via Portainer Stack** (Compose ou Swarm conforme cluster cliente) — terceiro modo.
- [ ] Smoke test E2E real (busca 5 vagas, retorna ao Claude Code) nos três modos.
- [ ] Documentar gotchas em `docs/deploy-docker-swarm.md` (extender o existente).

### Saída

Cliente roda no Claude Code:
```
/plugin install ./plugins/linkedin-maxvision
/linkedin-scan "Senior Backend Python remoto"
```
e recebe lista de vagas formatada.

---

## Sprint 2 — Tools restantes + apply_easy (3 dias)

### Objetivos
- Cobertura completa das 10 tools.
- Apply flow com `confirm_required` funcionando.
- Tests Playwright em conta sandbox.

### Tarefas

#### Dia 4

- [ ] `apply_easy` — fluxo preview/submit com screenshot.
- [ ] `send_message` — fluxo draft/confirm.
- [ ] Migration: `applications`, `messages_drafts`.

#### Dia 5

- [ ] `optimize_profile` (chama Claude API internamente para análise).
- [ ] `list_feed`.
- [ ] `post_update`.
- [ ] `search_people`.

#### Dia 6

- [ ] Skills correspondentes no plugin (`linkedin-easy-apply`, `linkedin-outreach`, `linkedin-feed-engagement`, `linkedin-profile-optimize`).
- [ ] Commands: `/linkedin-apply`, `/linkedin-tailor`, `/linkedin-audit`.
- [ ] Tests Playwright E2E em conta sandbox (apply em vaga teste, send msg para conta secundária).
- [ ] Documentar troubleshooting (`docs/troubleshooting.md`).

### Saída

Cliente faz fluxo completo:
```
/linkedin-scan ... → escolhe vaga
@linkedin-job-hunter aplica nessa, customiza resume
→ subagent retorna sumário com application_id e screenshot
```

---

## Sprint 3 — Multi-account + license gating (2 dias)

### Objetivos
- Cookie rotation multi-conta.
- License key validation (free vs Pro).

### Tarefas

#### Dia 7

- [ ] `account_id` parameter em todas as tools.
- [ ] BrowserPool com map de contexts por account.
- [ ] Encrypted cookie storage (`secrets/cookies.enc` + master key via env).
- [ ] CLI: `mcp-cli account add <id> --cookie-from-file=cookie.txt`.
- [ ] Health check periódico (node-cron) + alert via webhook.

#### Dia 8

- [ ] Cloudflare Worker `license.linkedin.maxvision.com.br/v1/check`.
- [ ] Stripe webhook → Worker emite license key.
- [ ] MCP server: middleware `requires_pro` em tools `apply_easy`, `send_message`, `search_people`.
- [ ] Plugin: skills tier Pro só carregam se license válida.
- [ ] Docs: como obter/renovar license key.

### Saída

Free: `search_jobs`, `get_profile`, `tailor_resume`, `optimize_profile`, `list_feed`, `post_update` (1 conta).
Pro: + `apply_easy`, `send_message`, `search_people`, `multi-account` (até 3).
Agency: + multi-account ilimitado, Sales Navigator, white-label.

---

## Sprint 4 — Release v1.0 free + Pro (2 dias)

### Objetivos
- Release público v1.0.
- Landing page funcional.
- Stripe checkout ativo.

### Tarefas

#### Dia 9

- [ ] Landing page (Next.js + Tailwind + shadcn) em `linkedin.maxvision.com.br`.
- [ ] Página `/install` com instruções passo-a-passo.
- [ ] Página `/pricing` com Stripe Checkout integrado.
- [ ] CHANGELOG.md.
- [ ] Release `v1.0.0` no GitHub com binaries Docker em GHCR.

#### Dia 10

- [ ] Vídeo demo de 3 minutos (busca + apply).
- [ ] Post no LinkedIn anunciando o produto.
- [ ] Submissão a `awesome-claude-code` e `awesome-mcp-servers`.
- [ ] Coleta primeiros feedbacks (5 beta users).

### Saída

**Release v1.0** — Variante A standalone, free + Pro funcionais. Pronto para vendas.

---

## Sprint 5 — Variante B (n8n híbrida) (5 dias)

### Objetivos
- Endpoints webhook no MCP.
- 4 workflows n8n.
- Tier Agency com multi-tenant.

### Tarefas

#### Dia 11 — Webhooks no MCP

- [ ] Endpoints `/webhooks/job-found`, `/webhooks/recruiter-msg`.
- [ ] SSE endpoint `/events` para n8n consumir.
- [ ] Tests integração n8n local (Docker).

#### Dia 12-13 — Workflows n8n

- [ ] `linkedin-daily-scan.json`.
- [ ] `linkedin-batch-apply.json`.
- [ ] `linkedin-recruiter-reply.json`.
- [ ] `linkedin-profile-weekly-audit.json`.
- [ ] Templates de credentials.
- [ ] Testes em n8n MaxVision (`n8n.meuagente.api.br`).

#### Dia 14 — Setup automation

- [ ] Comando `/linkedin-setup-n8n --instance ... --api-key ...`.
- [ ] Importação automática via n8n REST API.
- [ ] Documentação setup tier Pro com n8n (`docs/setup-hybrid-n8n.md`).

#### Dia 15 — Tier Agency

- [ ] Workflow `linkedin-multi-account-pool.json`.
- [ ] Workflow `linkedin-team-sync.json`.
- [ ] White-label config (logo, cores, dominio próprio do cliente Agency).
- [ ] Stripe pricing tier Agency.

### Saída

**Release v1.5** — Variante B completa. Pro pode escolher A ou B. Agency obrigatório B.

---

## Sprint 6 — Polimento + estabilização (2 dias)

### Tarefas

- [ ] Bug fixes do feedback dos beta users.
- [ ] Otimização de queries Postgres (índices que faltam).
- [ ] Anti-detect tuning (analisar logs de captcha).
- [ ] Documentação completa (API ref, troubleshooting expandido).
- [ ] Vídeos tutorial: setup, primeiro apply, profile audit, n8n integration.
- [ ] Release v1.5.1.

---

## Marcos / Gates

| Marco | Critério de aceite | Sprint |
|---|---|---|
| **MVP interno** | Buscar vaga + retornar lista no Claude Code | Sprint 1 |
| **Beta privado** | 10 tools funcionando, 5 beta users | Sprint 4 |
| **Public release v1.0** | Landing + Stripe + 1ª venda | Sprint 4 |
| **v1.5 (Agency)** | n8n workflows + multi-tenant | Sprint 5 |
| **Estabilização** | <1% crash rate, <5% captcha rate | Sprint 6 |

---

## Backlog pós-v1.5

- **v2.0:** Cloud-hosted MCP (MaxVision hospeda para clientes que não querem VPS).
- **v2.1:** Plugin VSCode separado (mesma base MCP).
- **v2.2:** Twitter/X Suite (mesmo padrão arquitetural).
- **v2.3:** Instagram Suite.
- **v3.0:** Dashboard web standalone (sem dependência de Claude Code).

---

## Riscos e mitigações

| Risco | Probabilidade | Mitigação |
|---|---|---|
| LinkedIn quebra seletores DOM | Alta | Tests Playwright diários; canary release; resiliência por seletores múltiplos. |
| Conta sandbox banida | Alta | 3 contas backup; conta principal só para health check. |
| Stripe pricing rejeitado | Baixa | Pesquisa de mercado pré-launch (5 entrevistas). |
| Concorrente lança grátis | Média | Foco em UX + integrações premium (n8n + Telegram + Notion); moat = ecossistema MaxVision. |
| ToS LinkedIn endurece | Alta | Disclaimer claro no setup; modo "manual review" como default; auditoria legal antes de v2.0 cloud-hosted. |
| Bug crítico em apply | Alta | `confirm_required=true` default; rollback feature flag rápido. |
