# Setup — Variante B (Híbrida com n8n)

Guia para clientes Pro/Agency que querem orquestração externa via n8n. Pré-requisito: Variante A já instalada e funcionando.

---

## Pré-requisitos

- **Variante A funcionando** (ver [setup-claude-code-only.md](setup-claude-code-only.md)) em qualquer um dos três modos:
  - Docker Engine standalone (Compose)
  - Docker Swarm CLI
  - Portainer Stack (Compose ou Swarm)

  Detalhes de deploy: [deploy-docker-swarm.md](deploy-docker-swarm.md).
- License key Pro ou Agency válido.
- Instância n8n acessível, uma de:
  - **Self-hosted Docker Compose** — mais simples, single-host.
  - **Self-hosted Docker Swarm** — recomendado para Agency multi-tenant. Pode rodar no MESMO Swarm cluster que o MCP.
  - **n8n Cloud** (n8n.io).
  - **MaxVision-hosted** (incluso no tier Agency).
- Credentials para canais de notificação que vai usar:
  - Telegram bot token + chat_id.
  - Google Sheets OAuth (para tracking).
  - Notion integration token (para DB de oportunidades).
  - Discord webhook URL (opcional).

> **Setup recomendado tier Agency:** rodar n8n no MESMO Swarm cluster do MCP, no overlay `traefik-public`. Service discovery interna via DNS (`http://maxv-linkedin_mcp:3000`), Traefik único, backup unificado. Ver [deploy-docker-swarm.md](deploy-docker-swarm.md) seção "n8n no mesmo Swarm".

---

## Passo 1 — Instalar plugin Pro

```bash
claude /plugin install maxvision-linkedin-suite:linkedin-maxvision-pro --license MAXV-PRO-XXXX
```

Isto adiciona:
- Skills tier Pro.
- Comando `/linkedin-setup-n8n`.
- 4 workflows n8n na pasta `n8n-workflows/` do plugin.

---

## Passo 2 — Configurar webhook endpoints no MCP

Editar `mcp-server/.env`:

```bash
ENABLE_WEBHOOKS=true
WEBHOOK_SECRET=<gerar-com-openssl-rand-hex-32>
SSE_ENABLED=true
```

Restart:
```bash
docker-compose restart linkedin-mcp
```

Testar:
```bash
curl -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
     https://linkedin-mcp.seu-dominio.com/events
# deve retornar SSE stream aberto
```

---

## Passo 3 — Importar workflows no n8n

### Opção A — Comando automatizado (recomendado)

```bash
claude /linkedin-setup-n8n \
  --instance https://n8n.seu-dominio.com \
  --api-key <n8n-api-key>
```

O comando:
1. Faz download dos 4 workflows do repo.
2. Substitui placeholders pela sua URL MCP, secret webhook, etc.
3. Faz import via n8n REST API.
4. Ativa todos.
5. Imprime URLs de cada workflow para você verificar.

### Opção B — Manual

1. Baixar JSONs:
   ```
   plugins/linkedin-maxvision-pro/n8n-workflows/
     ├── linkedin-daily-scan.json
     ├── linkedin-batch-apply.json
     ├── linkedin-recruiter-reply.json
     └── linkedin-profile-weekly-audit.json
   ```

2. n8n UI → **Workflows** → **Import from File** → selecionar cada um.

3. Editar nos workflows os campos:
   - `MCP_URL` = `https://linkedin-mcp.seu-dominio.com`
   - `WEBHOOK_SECRET` = mesmo do MCP.
   - `LICENSE_KEY` = seu license key Pro.

---

## Passo 4 — Configurar credentials no n8n

### Telegram

1. Criar bot via [@BotFather](https://t.me/BotFather) → obter token.
2. Mandar `/start` ao bot e capturar `chat_id` via [@userinfobot](https://t.me/userinfobot).
3. n8n → **Credentials** → **New** → **Telegram API** → colar token.

### Google Sheets

1. n8n → **Credentials** → **New** → **Google Sheets OAuth2**.
2. OAuth flow.
3. Criar planilha "MaxVision LinkedIn Tracker" com abas:
   - `Vagas` (colunas: id, url, título, empresa, salário, match_score, data, status)
   - `Aplicações` (colunas: app_id, vaga_id, status, data, screenshot_url, notas)
   - `Mensagens` (colunas: msg_id, recipient, body, status, data)
4. Editar workflows com Sheet ID.

### Notion

1. Criar integração em [notion.so/my-integrations](https://www.notion.so/my-integrations).
2. Copiar token, adicionar em n8n credentials.
3. Criar databases:
   - "Vagas" (Title, URL, Empresa, Salário, Score, Status, Data).
   - "Recruiters" (Name, Profile URL, Empresa, Last Contact, Status).
   - "Profile Audits" (Date, Score, Suggestions).
4. Compartilhar databases com a integração.
5. Adicionar database IDs nos workflows.

### Discord (opcional)

1. Discord servidor → canal → ⚙️ → **Integrations** → **Webhooks** → **New Webhook** → copiar URL.
2. n8n credentials → **Discord Webhook**.

---

## Passo 5 — Customizar filtros

Cada workflow tem nodes "Settings" no início. Editar conforme suas preferências.

### `linkedin-daily-scan.json`

```json
{
  "search_queries": [
    {
      "keywords": "Senior Backend Python remoto",
      "salary_min_usd": 80000,
      "experience": ["mid-senior", "director"],
      "posted_within_hours": 72
    },
    {
      "keywords": "Tech Lead Backend",
      "salary_min_usd": 100000
    }
  ],
  "match_score_threshold": 0.7,
  "alert_threshold": 0.85,
  "schedule": "0 8,13,18 * * *",
  "timezone": "America/Sao_Paulo"
}
```

### `linkedin-batch-apply.json`

```json
{
  "max_per_run": 10,
  "max_per_day": 50,
  "match_score_min": 0.75,
  "quiet_hours": { "from": "23:00", "to": "07:00" },
  "throttle_seconds": [60, 180]
}
```

### `linkedin-recruiter-reply.json`

```json
{
  "auto_reply_enabled": false,
  "tone": "professional-warm",
  "max_response_length": 800,
  "require_human_approval": true,
  "approval_timeout_hours": 24
}
```

### `linkedin-profile-weekly-audit.json`

```json
{
  "schedule": "0 9 * * 0",
  "target_roles": ["Senior Backend", "Tech Lead"],
  "delivery": ["telegram", "email", "notion"]
}
```

---

## Passo 6 — Validação end-to-end

### Teste 1 — Daily scan

```bash
# Forçar execução manual
n8n execute --id <workflow-id-daily-scan>
```

Esperado:
- Telegram recebe alert: "Encontrei 3 vagas novas com score > 0.85: ..."
- Google Sheets aba "Vagas" tem novas rows.

### Teste 2 — Batch apply via Telegram inline

1. No Telegram, clicar botão `[Aplicar Auto]` em um alert.
2. Workflow `linkedin-batch-apply` dispara.
3. Telegram retorna progresso: "Aplicando em 3 vagas..."
4. Final: "8/10 submitted, 1 needs_review, 1 falhou."
5. Google Sheets "Aplicações" atualizada.

### Teste 3 — Recruiter reply

1. Recrutador manda DM no LinkedIn.
2. Workflow `linkedin-recruiter-reply` recebe via SSE.
3. Telegram mostra draft de resposta com botões `[Enviar] [Editar] [Ignorar]`.
4. Clicar `[Editar]` abre form n8n com draft pré-preenchido.
5. Submeter form → workflow envia via MCP.

### Teste 4 — Profile audit semanal

```bash
n8n execute --id <workflow-id-profile-audit>
```

Esperado:
- Notion DB "Profile Audits" cria nova page.
- Email com digest enviado.
- Telegram notify.

---

## Workflows Agency (extra)

### `linkedin-multi-account-pool.json`

Distribui carga entre múltiplas contas com load balancer round-robin + health-aware.

### `linkedin-team-sync.json`

Para agências com múltiplos clientes finais. Cada cliente tem suas contas + sheets + Notion. Workflow recebe `client_id` em cada execução.

---

## Troubleshooting

### "Webhook MCP não recebe eventos"

Verificar:
- `ENABLE_WEBHOOKS=true` no MCP.
- Firewall VPS permite conexão de saída para n8n.
- `WEBHOOK_SECRET` igual nos dois.

### "Workflow falha com 401"

License key não foi propagado nos workflows. Re-rodar `/linkedin-setup-n8n`.

### "Telegram não responde inline buttons"

Webhook do bot precisa estar configurado. Em n8n, abrir workflow → node "Telegram Trigger" → copiar webhook URL → registrar no bot:
```bash
curl -F "url=https://n8n.seu-dominio.com/webhook/<id>" \
     https://api.telegram.org/bot<token>/setWebhook
```

### "Captcha rate alto"

Reduzir frequência:
- Daily scan: de 3x/dia para 1x.
- Apply: de 50/dia para 20/dia.
- Aumentar throttle entre apps: de 60-180s para 180-300s.

---

## Métricas e dashboards

n8n UI mostra execuções, falhas, payloads. Para dashboard externo:

- **Grafana** + Postgres do MCP: queries de jobs, applications, captchas.
- **Plausible** no landing: conversões de funnel comercial.
- **Notion** views: DB "Aplicações" com filter "status=interview" para acompanhar pipeline real.

---

## Próximos passos

- Personalizar workflows: editar JSONs e versionar em git pessoal.
- Criar workflows próprios: `linkedin-custom-X.json`.
- Sugerir features: GitHub issues no repo público.
- Suporte Pro/Agency: `support@maxvision.com.br`.
