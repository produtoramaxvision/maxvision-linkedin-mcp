# Plano B — Versão Híbrida (Claude Code + n8n)

Mesmo MCP server da Variante A, mas com camada de orquestração externa via n8n para cron, batch, fan-out, notificações e tracking visual.

---

## Quando escolher esta variante

- Cliente quer automação contínua (cron diário/horário) sem precisar manter o Claude Code aberto.
- Volume médio a alto: 50–500 ações/dia.
- Quer notificações em canais externos (Telegram, Slack, Discord, Email).
- Quer tracking visual em Google Sheets / Notion / Airtable.
- Quer workflows complexos com branching, retry, aprovação humana via inline buttons.
- Já tem instância n8n rodando (cliente Pro+).

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│  CAMADA INTERATIVA (Claude Code)                            │
│  Plugin linkedin-maxvision (mesmo da Variante A)            │
│  Cliente conversa: "busca vagas", "aplica nessa", etc.      │
└────────────────────┬────────────────────────────────────────┘
                     │ stdio / HTTPS
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  CAMADA CORE (VPS Ubuntu)                                   │
│  linkedin-maxvision-mcp                                     │
│  ├─ Tools MCP (mesmas da Variante A)                        │
│  ├─ Webhook endpoints HTTP (extra na Variante B):           │
│  │   POST /webhooks/job-found      ← n8n notifica MCP       │
│  │   POST /webhooks/recruiter-msg  ← n8n notifica MCP       │
│  │   GET  /events  (SSE)            ← n8n consome eventos   │
│  └─ Postgres compartilhado                                  │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP webhooks (bidirecional)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  CAMADA ORQUESTRAÇÃO (n8n.meuagente.api.br)                 │
│  4 workflows premium:                                       │
│  ├─ linkedin-daily-scan.json                                │
│  ├─ linkedin-batch-apply.json                               │
│  ├─ linkedin-recruiter-reply.json                           │
│  └─ linkedin-profile-weekly-audit.json                      │
└────────────────────┬────────────────────────────────────────┘
                     │ saídas para canais externos
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  CAMADA NOTIFY/TRACK                                        │
│  ├─ Telegram bot (alerts + aprovações inline)               │
│  ├─ Google Sheets (tracking de applications)                │
│  ├─ Notion (DB de oportunidades, recruiters, perfis)        │
│  ├─ Discord webhook (canal #vagas)                          │
│  └─ Email (digest semanal)                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Workflows n8n — detalhamento

### Workflow 1: `linkedin-daily-scan.json`

**Trigger:** Cron — 08h, 13h, 18h (configurável).

**Fluxo:**
1. **Cron node** dispara.
2. **HTTP Request node** → MCP `POST /tools/search_jobs` com filtros do user (lidos de Notion DB "Job Search Profiles" ou env var).
3. **Loop Over Items** itera resultados.
4. **Function node** calcula `match_score` (Levenshtein + skill overlap entre JD e resume).
5. **IF node** filtra `match_score > 0.7`.
6. **Notion node** verifica se vaga já existe no DB "Vagas" (idempotência).
7. **Branching:**
   - Vaga nova + score alto → **Telegram node** envia alert com botões inline `[Aplicar Auto] [Ver Detalhes] [Ignorar]`.
   - Vaga nova + score médio → grava em Notion sem alerta.
   - Vaga existente → skip.
8. **Sheets node** adiciona row em "Job Tracker" sheet.

**Saídas:**
- Telegram alert (assíncrono, com inline buttons que disparam workflow 2 via callback webhook).
- Notion DB row.
- Google Sheets row.

### Workflow 2: `linkedin-batch-apply.json`

**Trigger:** Webhook (do botão Telegram OU manual via n8n UI OU cron).

**Fluxo:**
1. Recebe `job_url` ou lista de URLs.
2. Para cada vaga:
   a. **HTTP Request** → MCP `POST /tools/get_job_details` (full JD).
   b. **HTTP Request** → MCP `POST /tools/tailor_resume` (Claude API call interno do MCP).
   c. **HTTP Request** → MCP `POST /tools/apply_easy` com `confirm_required=false` (modo batch autônomo).
   d. **Switch node** baseado em `status`:
      - `submitted` → Telegram OK + Sheets update + Notion update.
      - `needs_review` → Telegram com link pra screenshot + botão `[Resolver Manual]`.
      - `blocked` → Discord alert canal #linkedin-issues + pause workflow 30min (rate limit).
      - `failed` → log + retry com backoff exponencial (max 3 tentativas).
3. **Aggregate node** consolida: "Aplicado em 8/10 vagas. 1 captcha, 1 falha."
4. **Email node** envia digest pro user.

**Configurações de segurança:**
- Throttle: max 5 apply/min, 50 apply/dia por conta.
- Quiet hours: pausa entre 23h-07h (LinkedIn detecta atividade fora de hora).
- Cookie rotation: a cada 10 applies muda de conta (se multi-conta habilitado).

### Workflow 3: `linkedin-recruiter-reply.json`

**Trigger:** Webhook do MCP (SSE event `new_inbox_message` → n8n captura).

**Fluxo:**
1. Recebe payload `{sender, body, conversation_url}`.
2. **HTTP Request** → MCP `POST /tools/get_profile(sender)` → contexto do recrutador.
3. **OpenAI/Claude node** ou **HTTP Request** ao MCP `tailor_response_tool` → gera draft de resposta baseado em:
   - Histórico da conversa (Notion DB "Conversations").
   - Perfil do recrutador.
   - Resume do user.
   - Tom configurado pelo user (formal/casual/direto).
4. **Telegram node** envia draft com botões `[Enviar] [Editar] [Ignorar]`.
5. **Wait for Webhook** aguarda decisão (timeout 24h).
6. Se `[Enviar]` → MCP `POST /tools/send_message(confirm=true, draft_id=...)`.
7. Se `[Editar]` → manda link pro n8n form pre-preenchido com o draft.
8. **Notion node** loga conversa.

### Workflow 4: `linkedin-profile-weekly-audit.json`

**Trigger:** Cron — domingo 09h.

**Fluxo:**
1. **HTTP Request** → MCP `POST /tools/optimize_profile`.
2. **Function node** compara com audit anterior (Notion DB "Profile Audits") → calcula deltas.
3. **Notion node** cria nova page com:
   - Score atual (headline, summary, skills, activity).
   - Deltas vs semana passada.
   - 5 ações sugeridas para próxima semana.
4. **Email node** envia digest com link.
5. **Telegram node** notifica user.

---

## Estrutura no repositório

```
n8n-workflows/
├── linkedin-daily-scan.json           # tier Pro
├── linkedin-batch-apply.json          # tier Pro
├── linkedin-recruiter-reply.json      # tier Pro (com aprovação humana)
├── linkedin-profile-weekly-audit.json # tier Pro
├── linkedin-multi-account-pool.json   # tier Agency
├── linkedin-team-sync.json            # tier Agency (white-label)
├── README.md                          # como importar no n8n
└── credentials-template.md            # quais credentials criar no n8n
```

---

## Setup do cliente (Variante B)

### Pré-requisitos

1. **MCP server rodando** — qualquer um dos três modos da Variante A:
   - Docker Engine standalone (`docker compose up -d`)
   - Docker Swarm CLI (`docker stack deploy -c docker-stack.yml maxv-linkedin`)
   - Portainer Stack (Compose ou Swarm via UI/Git)

   Detalhes: [docs/deploy-docker-swarm.md](../docs/deploy-docker-swarm.md).
2. **n8n acessível**, uma das opções:
   - Self-hosted (Docker, VPS própria, **recomendado em Swarm para tier Agency multi-tenant**).
   - n8n Cloud (n8n.io).
   - MaxVision-hosted (incluso no tier Agency).
3. Credentials no n8n:
   - HTTP Header Auth (license key MaxVision).
   - Telegram bot token.
   - Google Sheets OAuth.
   - Notion integration token.
   - (opcional) Discord webhook URL.

> **Recomendação Swarm para Agency:** rodar n8n no MESMO Swarm cluster que o MCP — ambos no overlay `traefik-public`. Isso reduz latência interna (n8n→MCP via service-name), simplifica TLS (Traefik um só), e permite escalar n8n separado quando o volume de workflows crescer. Ver `docs/deploy-docker-swarm.md` seção "n8n no mesmo Swarm".

### Importação dos workflows

```bash
# 1. Pull do repo
git clone https://github.com/produtoramaxvision/maxvision-linkedin-mcp
cd maxvision-linkedin-mcp/n8n-workflows

# 2. Importar via n8n CLI ou UI
n8n import:workflow --input linkedin-daily-scan.json
n8n import:workflow --input linkedin-batch-apply.json
n8n import:workflow --input linkedin-recruiter-reply.json
n8n import:workflow --input linkedin-profile-weekly-audit.json

# 3. Ativar todos
n8n update:workflow --id <id> --active true
```

Ou via plugin Claude Code:

```
/linkedin-setup-n8n --instance https://n8n.cliente.com --api-key xxx
```

Comando do plugin que faz upload dos workflows automaticamente via n8n REST API.

---

## Diferenças vs Variante A

| Aspecto | Variante A (sem n8n) | Variante B (com n8n) |
|---|---|---|
| Cron diário/horário | Configurado no MCP via `node-cron` | Via n8n cron node (visual, edit fácil) |
| Notificações Telegram/Discord | Webhook manual configurado no MCP | Workflow n8n nativo (drag-drop) |
| Tracking visual | Postgres CLI ou comandos do plugin | Google Sheets + Notion + Telegram |
| Aprovação humana | Confirm no Claude Code | Inline buttons Telegram |
| Retry/backoff | Hardcoded no MCP | Configurável por workflow |
| Multi-tenant (Agency) | Difícil — cada cliente VPS própria | Fácil — workflows por cliente no mesmo n8n |
| Edição pelo cliente | Mexer em código | UI visual |
| Custo extra | Zero | Cliente provê n8n (free self-hosted) ou paga n8n cloud |
| Latência batch | Sequencial | Paralelo via n8n |
| Observability | Logs Pino | UI n8n com replay, debug nativo |

---

## Sprints adicionais (sobre Variante A)

- **Sprint 6 (1 dia):** Endpoints webhook no MCP (`/webhooks/*`, SSE `/events`).
- **Sprint 7 (2 dias):** 4 workflows n8n + testes de import/export.
- **Sprint 8 (1 dia):** Comando `/linkedin-setup-n8n` que automatiza import.
- **Sprint 9 (1 dia):** 2 workflows Agency (multi-account-pool, team-sync).

Total Variante B: ~Variante A (10d) + 5d extras = **15 dias úteis**.

---

## Vantagens

1. **UX premium pra cliente Pro/Agency.** Telegram alerts + Sheets tracking + Notion DB são experiência de produto vendável, não só dev tool.
2. **Workflows editáveis pelo cliente.** Pode customizar sem mexer em código.
3. **Multi-tenant facilita Agency.** Cada cliente seus workflows no mesmo n8n.
4. **Reuso de infra MaxVision.** `n8n.meuagente.api.br` já existe — pode hospedar Agency tier.
5. **Observability superior.** UI do n8n mostra cada execução com payload completo — debug fácil.

## Desvantagens

1. **Mais peças.** Cliente precisa entender n8n.
2. **Latência.** Cada hop n8n→MCP→n8n adiciona ~200-800ms.
3. **Complexidade de versionamento.** Workflow JSON é difícil de fazer diff/code review.
4. **Dependência externa.** Se n8n cair, automação para (mas Claude Code interativo continua via MCP direto).

---

## Recomendação por tier

| Tier | Variante recomendada |
|---|---|
| **Free** | A (Claude Code only) |
| **Pro** | A + opcional B (cliente escolhe) |
| **Agency** | B obrigatório (multi-tenant via n8n MaxVision-hosted) |

Vender as duas variantes deixa o cliente escolher. O MCP core é o mesmo. n8n workflows são "add-on" do tier Pro+.

---

## Decisão

**Construir as duas variantes em sequência.** Variante A primeiro (10 dias) → release v1.0 free + Pro. Variante B depois (5 dias) → release v1.5 Pro + Agency.

Custo total: 15 dias úteis. Ativo permanente reaproveitável em produtos futuros (Twitter Suite, Instagram Suite seguem o mesmo padrão — só troca a camada CORE).
