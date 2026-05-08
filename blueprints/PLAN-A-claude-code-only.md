# Plano A — Versão Standalone (Claude Code only, sem n8n)

Variante mais leve. Apenas plugin Claude Code + servidor MCP na VPS. Sem orquestrador externo. Cron e batch ficam por conta de comandos manuais ou scheduled tasks dentro do próprio plugin.

---

## Quando escolher esta variante

- Cliente final é desenvolvedor que vive dentro do Claude Code.
- Uso interativo predominante: "busca essa vaga", "aplica nessa", "manda mensagem pro recrutador".
- Volume baixo a médio: 10–50 ações/dia.
- Não quer manter outro serviço além da VPS + Claude Code.
- Privacidade máxima: zero dados saem da máquina do cliente / VPS dele.

---

## Arquitetura

```
┌──────────────────────────────────────────────────────────┐
│  Claude Code CLI/Desktop (cliente)                       │
│  ├─ Plugin: linkedin-maxvision                           │
│  │   ├─ Skills:                                          │
│  │   │   ├─ linkedin-job-search        (paths: jobs/)    │
│  │   │   ├─ linkedin-easy-apply        (paths: apply/)   │
│  │   │   ├─ linkedin-resume-tailor     (paths: resume/)  │
│  │   │   ├─ linkedin-profile-optimize                    │
│  │   │   ├─ linkedin-outreach                            │
│  │   │   └─ linkedin-feed-engagement                     │
│  │   ├─ Subagent: linkedin-job-hunter                    │
│  │   └─ Commands:                                        │
│  │       ├─ /linkedin-scan                               │
│  │       ├─ /linkedin-apply                              │
│  │       ├─ /linkedin-tailor                             │
│  │       └─ /linkedin-audit                              │
│  └─ MCP client → stdio ou HTTP                           │
└─────────────────┬────────────────────────────────────────┘
                  │ stdio (local) ou HTTPS via Tailscale
                  ▼
┌──────────────────────────────────────────────────────────┐
│  linkedin-maxvision-mcp (VPS Ubuntu 168.231.96.185)      │
│  Node 20 + TS + @modelcontextprotocol/sdk                │
│  ├─ Tools MCP (10 tools tipados):                        │
│  │   ├─ search_jobs                                      │
│  │   ├─ get_job_details                                  │
│  │   ├─ apply_easy                                       │
│  │   ├─ get_profile                                      │
│  │   ├─ search_people                                    │
│  │   ├─ send_message                                     │
│  │   ├─ optimize_profile                                 │
│  │   ├─ list_feed                                        │
│  │   ├─ post_update                                      │
│  │   └─ track_application                                │
│  ├─ Browser pool (Patchright)                            │
│  │   ├─ Cookie rotation (multi-conta)                    │
│  │   ├─ Stealth config (fingerprint, proxy opcional)     │
│  │   └─ Rate limiter (token bucket por conta)            │
│  ├─ Wrappers de fonte:                                   │
│  │   ├─ tomquirk/linkedin-api (Python subprocess)        │
│  │   ├─ JobSpy embed (Python subprocess)                 │
│  │   └─ LinkedIn OAuth oficial (posting safe)            │
│  ├─ Cache: Postgres (jobs, profiles, sessions, applications) │
│  └─ Built-in scheduler (node-cron):                      │
│      ├─ rotate_cookies (a cada 6h)                       │
│      ├─ refresh_cache (a cada 1h)                        │
│      └─ daily_scan (opcional, configurável)              │
└──────────────────────────────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────┐
│  Storage local da VPS                                    │
│  ├─ Postgres 16 (cache + tracking)                       │
│  ├─ Redis (rate limit + sessions)                        │
│  └─ Volume Docker para cookies criptografados            │
└──────────────────────────────────────────────────────────┘
```

---

## Stack técnica

### MCP server

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Runtime | Node 20 LTS | Padrão MaxVision; melhor ecossistema MCP |
| Linguagem | TypeScript 5.x strict | Tipagem forte para schemas MCP |
| Framework MCP | `@modelcontextprotocol/sdk` | SDK oficial Anthropic |
| HTTP server | Hono | Padrão MaxVision; leve; suporte SSE para MCP HTTP |
| Browser automation | **Patchright** | Fork do Playwright com stealth; melhor anti-detect |
| LinkedIn private API | `tomquirk/linkedin-api` (Python) via subprocess | Cobertura mais completa do mercado grátis |
| Job search cross-board | `JobSpy` (Python) via subprocess | LinkedIn + Indeed + Glassdoor + ZipRecruiter |
| Banco | Postgres 16 | Cache, tracking, application history |
| Cache leve | Redis 7 | Rate limit (token bucket), sessions |
| Validação | Zod | Schemas MCP runtime |
| Logging | Pino | Estruturado JSON, baixo overhead |
| Testes | Vitest + Playwright | Unit + E2E em conta sandbox |
| Container | Docker + docker-compose | Deploy idempotente VPS |

### Plugin Claude Code

| Componente | Tipo | Função |
|---|---|---|
| `linkedin-job-search` | Skill | Wrapper sobre `search_jobs` MCP, formata output |
| `linkedin-easy-apply` | Skill | Fluxo guiado: vaga → tailor resume → confirma → apply |
| `linkedin-resume-tailor` | Skill | Customiza resume YAML/MD por JD via Claude |
| `linkedin-profile-optimize` | Skill | Audit + sugestões |
| `linkedin-outreach` | Skill | Drafts DM com aprovação humana obrigatória |
| `linkedin-feed-engagement` | Skill | Curte/comenta posts da rede com filtros |
| `linkedin-job-hunter` | Subagent | Pré-carrega 4 skills acima; executa workflow autônomo end-to-end |
| `/linkedin-scan` | Command | Busca vagas com filtros |
| `/linkedin-apply` | Command | Aplica em vaga específica (ID ou URL) |
| `/linkedin-tailor` | Command | Tailor de resume |
| `/linkedin-audit` | Command | Roda profile audit |

---

## Tools MCP (schemas)

```typescript
// search_jobs
{
  name: "search_jobs",
  description: "Busca vagas no LinkedIn (e opcionalmente Indeed/Glassdoor via JobSpy).",
  inputSchema: z.object({
    keywords: z.string(),
    location: z.string().optional(),
    remote: z.enum(["any", "remote", "hybrid", "onsite"]).default("any"),
    experience: z.array(z.enum(["internship", "entry", "associate", "mid-senior", "director", "executive"])).optional(),
    posted_within_hours: z.number().int().min(1).max(720).default(168),
    salary_min_usd: z.number().optional(),
    sources: z.array(z.enum(["linkedin", "indeed", "glassdoor", "ziprecruiter"])).default(["linkedin"]),
    limit: z.number().int().min(1).max(100).default(25),
    easy_apply_only: z.boolean().default(false)
  }),
  outputSchema: z.array(JobSchema)
}

// apply_easy
{
  name: "apply_easy",
  description: "Aplica via Easy Apply em uma vaga LinkedIn. Requer aprovação humana antes do submit final se confirm_required=true.",
  inputSchema: z.object({
    job_url: z.string().url(),
    resume_path: z.string(),
    cover_letter: z.string().optional(),
    answers: z.record(z.string()).optional(),
    confirm_required: z.boolean().default(true),
    account_id: z.string().default("default")
  }),
  outputSchema: z.object({
    status: z.enum(["submitted", "needs_review", "blocked", "failed"]),
    application_id: z.string().optional(),
    captcha_encountered: z.boolean(),
    screenshot_path: z.string().optional()
  })
}

// get_profile
{
  name: "get_profile",
  description: "Extrai dados públicos de perfil LinkedIn por URL ou public_id.",
  inputSchema: z.object({
    profile_url: z.string().url().optional(),
    public_id: z.string().optional(),
    include: z.array(z.enum(["experience", "education", "skills", "recommendations", "activity"])).default(["experience", "education", "skills"])
  })
}

// send_message (sempre com aprovação)
{
  name: "send_message",
  description: "Envia DM. SEMPRE retorna draft + screenshot antes de enviar; só envia após confirm=true em segunda chamada.",
  inputSchema: z.object({
    recipient_url: z.string().url(),
    body: z.string().max(1900),
    confirm: z.boolean().default(false),
    draft_id: z.string().optional()
  })
}
```

(schemas completos em [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md))

---

## Fluxos típicos

### Fluxo 1 — Busca + apply manual (interativo)

```
Usuário no Claude Code:
  "Busca vagas Senior Backend Python remoto, USD 100k+, postadas últimos 3 dias"

Claude:
  1. Invoca skill linkedin-job-search
  2. MCP tool search_jobs → 18 resultados
  3. Apresenta tabela: empresa | título | salário | match score (calculado por skill via JD vs resume YAML)
  4. Usuário escolhe vaga #5

  "Aplica nessa, customiza o resume"

  5. Skill linkedin-resume-tailor (Claude analisa JD + resume YAML, gera versão otimizada)
  6. Mostra diff e pede confirmação
  7. Usuário aprova
  8. MCP tool apply_easy(confirm_required=true)
  9. Patchright preenche form, mostra screenshot
  10. Usuário confirma submit
  11. MCP tool track_application registra em Postgres
```

### Fluxo 2 — Subagent autônomo (end-to-end)

```
Usuário:
  "@linkedin-job-hunter aplica em até 10 vagas Senior Frontend remoto USD 80k+
   hoje, customiza resume pra cada uma, me notifica no fim"

Subagent (com skills pré-carregadas):
  1. search_jobs → 47 resultados
  2. Filtra por match score > 0.75 (10 melhores)
  3. Para cada vaga:
     a. tailor resume
     b. apply_easy(confirm_required=false porque autonomo)
     c. track_application
  4. Retorna sumário: 8 submitted, 2 needs_review (captcha), 0 failed
```

### Fluxo 3 — Audit semanal de perfil

```
Comando: /linkedin-audit

  1. MCP get_profile(public_id="proprio")
  2. Skill profile-optimize roda análise:
     - Headline strength
     - Summary keyword density vs vagas-alvo
     - Skills endorsement gap
     - Activity frequency
     - Featured section
  3. Gera relatório markdown em ~/Documents/linkedin-audits/YYYY-MM-DD.md
  4. Sugere 5 ações concretas
```

---

## Deploy

A imagem Docker `ghcr.io/produtoramaxvision/linkedin-maxvision-mcp:<tag>` é a mesma para os três modos. Cliente escolhe orquestrador conforme infraestrutura existente.

### Modos suportados

| Modo | Arquivo template | Quando usar |
|---|---|---|
| **Docker Engine standalone** | `mcp-server/docker/docker-compose.yml` | Dev local, single-host, primeiro setup |
| **Docker Swarm CLI** | `mcp-server/docker/docker-stack.yml` | Produção self-managed, multi-node, controle total |
| **Portainer Stack (Compose ou Swarm)** | `mcp-server/docker/portainer-stack.yml` | Produção com gestão visual, GitOps via repo, equipes |

Templates Docker, Postgres init SQL, secrets, e labels Traefik vivem em `mcp-server/docker/`. Guia completo: [docs/deploy-docker-swarm.md](../docs/deploy-docker-swarm.md).

### Decisões de deploy

- **Compose v3.9** em todos os arquivos para compatibilidade com `docker stack deploy` (Swarm exige formato legacy v3, não v2 nem o novo Compose Spec sem version).
- **Swarm secrets externos** (`maxv_master_key`, `maxv_postgres_password`, `maxv_webhook_secret`, `maxv_license_key`, `maxv_li_cookies`) criados via `docker secret create` antes do deploy.
- **Configs Swarm** para `postgres/init.sql` (não-sensível mas versionável).
- **Placement constraints** opcionais (`node.labels.maxv.db=true`, `node.labels.maxv.cache=true`) para multi-node — single-node Swarm aplica todas no mesmo node.
- **Update config** rolling com `start-first` + rollback automático em failure.
- **Healthchecks nativos** Compose v3 (`healthcheck:` block) — Traefik também faz health-check via labels.
- **Resource limits** definidos por serviço para evitar OOM em hosts compartilhados.
- **Network overlay externo** `traefik-public` deve existir antes do deploy (Traefik gerencia em outro stack).

### Acesso pelo cliente

Três modelos:

1. **Tailscale (privado)** — cliente instala Tailscale, recebe ACL para `linkedin-mcp.tailnet`. Plugin aponta `MCP_URL=http://linkedin-mcp:3000/mcp`. Sem exposição pública. Recomendado para Free self-hosted.
2. **HTTPS público com license-key auth** — domínio próprio do cliente (ex: `linkedin-mcp.cliente.com`) exposto via Traefik. Cada request requer header `X-License-Key` validado contra license server (Cloudflare Worker).
3. **MaxVision-hosted** (apenas Pro/Agency) — MaxVision provê instância gerenciada em `linkedin-mcp.meuagente.api.br` com isolamento por license key.

Para tier Free, cliente roda Compose ou Swarm em hardware próprio (instruções em `docs/setup-claude-code-only.md`). Para Pro/Agency, opção de cloud-hosted disponível.

---

## Sprints (resumo — detalhe em ROADMAP.md)

- **Sprint 1 (3 dias):** MCP core com 4 tools (`search_jobs`, `get_profile`, `tailor_resume`, `apply_easy` com `confirm_required`). Plugin com 4 skills + 1 subagent. Deploy VPS.
- **Sprint 2 (2 dias):** Tools restantes (`send_message`, `optimize_profile`, `list_feed`, `post_update`, `track_application`). Tests Playwright em conta sandbox.
- **Sprint 3 (2 dias):** Cookie rotation, multi-conta pool, license-key gating das features Pro.
- **Sprint 4 (2 dias):** CI/CD GitHub Actions, release semver, landing page, docs cliente.
- **Sprint 5 (1 dia):** Stripe integration, license server (Cloudflare Worker).

Total Variante A: ~10 dias úteis.

---

## Vantagens da Variante A

1. **Setup cliente:** 1 comando — `claude /plugin install maxvision-linkedin-suite:linkedin-maxvision`.
2. **Sem dependência externa.** Apenas Claude Code + VPS (própria ou MaxVision-hosted).
3. **Privacidade máxima.** Zero dados em terceiros.
4. **Stack única (Node + Python embedded).** Menos manutenção.

## Limitações

1. **Sem orquestração visual.** Cron e batch precisam ser configurados via env var ou pelo subagent.
2. **Sem dashboard visual de tracking.** Cliente acompanha via Postgres ou via comandos `/linkedin-status`.
3. **Notificações.** Para receber alerta no Telegram quando aplicar, cliente precisa configurar webhook manual no MCP.
4. **Workflows complexos** (ex: "se recrutador responder DM em 24h, escalar"). Difícil de expressar puramente em skill — vira código no MCP.

→ Para esses gaps, ver [PLAN-B-hybrid-n8n.md](PLAN-B-hybrid-n8n.md).
