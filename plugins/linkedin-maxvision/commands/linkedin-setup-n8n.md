---
name: linkedin-setup-n8n
description: Imports MaxVision n8n workflows (Variant B hybrid) into a target n8n instance via REST API
argument-hint: --instance <https://n8n.example.com> --api-key <key> [--workflows daily-scan,batch-apply,recruiter-reply,weekly-audit]
allowed-tools: Bash
---

Você está configurando a Variante B (n8n hybrid) do plugin para um cliente Pro/Agency. Workflows JSON estão em `${CLAUDE_PLUGIN_ROOT}/n8n-workflows/`.

# Pré-requisitos

- License key Pro ou Agency (Sprint 3 — license server live em `license.linkedin.maxvision.com.br`).
- Instância n8n acessível com REST API habilitada.
- API key n8n com permissão `workflow:write`.
- MCP server rodando com `WEBHOOK_SECRET` configurado (`/webhooks/*` + `/events` ativos).

# Workflow desta sessão

## 1. Parse args

Esperado:
- `--instance` (obrigatório): URL base do n8n (ex `https://n8n.cliente.com`).
- `--api-key` (obrigatório): n8n API key.
- `--workflows` (opcional): CSV de workflows a importar. Default: todos os 4.

Exemplo válido: `--instance https://n8n.cliente.com --api-key n8n_xxx`.

## 2. Validar acesso n8n

```bash
curl -sf -H "X-N8N-API-KEY: $API_KEY" "$INSTANCE/api/v1/workflows?limit=1" >/dev/null \
  && echo "n8n_API_OK" || { echo "n8n_API_FAIL — check instance URL + key"; exit 1; }
```

## 3. Importar workflows

Para cada workflow em `${CLAUDE_PLUGIN_ROOT}/n8n-workflows/`:

```bash
WF=linkedin-daily-scan.json
JSON=$(cat "${CLAUDE_PLUGIN_ROOT}/n8n-workflows/${WF}")
curl -sf -X POST "${INSTANCE}/api/v1/workflows" \
  -H "X-N8N-API-KEY: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "${JSON}" \
  | jq '.id, .name'
```

Repetir pra:
- `linkedin-daily-scan.json` (cron → search_jobs → Telegram)
- `linkedin-batch-apply.json` (webhook → apply_easy → Sheets)
- `linkedin-recruiter-reply.json` (webhook → Claude draft → Telegram review)
- `linkedin-profile-weekly-audit.json` (cron → optimize_profile → Notion)

## 4. Configurar env vars no n8n

Cada workflow espera env vars que o usuário precisa setar via `Settings → Environment`:

| Var | Onde usado | Exemplo |
|---|---|---|
| `MCP_URL` | todos | `https://linkedin-mcp.produtoramaxvision.com.br` |
| `MCP_ACCOUNT_ID` | todos | `sandbox-1` |
| `WEBHOOK_SECRET` | webhooks | mesmo do MCP server |
| `SEARCH_KEYWORDS` | daily-scan | `Engenheiro de IA` |
| `SEARCH_LOCATION` | daily-scan | `São Paulo, BR` |
| `TARGET_ROLE` | weekly-audit | `Senior AI Engineer` |
| `PROFILE_TEXT` | weekly-audit | seu perfil completo (texto) |
| `TELEGRAM_CHAT_ID` | daily-scan, recruiter-reply | seu chat ID |
| `SHEETS_DOC_ID` | batch-apply | ID do Google Sheets |
| `NOTION_PAGE_ID` | weekly-audit | ID da Notion page |

Credentials que o usuário precisa criar via UI:
- `MCP Bearer Token` (httpHeaderAuth — nome `Authorization`, valor `Bearer mxv_...`).
- `MCP Webhook Secret` (httpHeaderAuth — nome `X-Webhook-Secret`, valor do `WEBHOOK_SECRET`).
- `Telegram Bot` (telegramApi).
- `Google Sheets OAuth` (googleSheetsOAuth2Api).
- `Notion Integration` (notionApi).
- `Anthropic API` (anthropicApi).

## 5. Ativar workflows

```bash
for WF_ID in $(echo $IMPORTED_IDS); do
  curl -sf -X POST "${INSTANCE}/api/v1/workflows/${WF_ID}/activate" \
    -H "X-N8N-API-KEY: ${API_KEY}" \
    | jq '.active'
done
```

## 6. Reportar

Imprima:
- ID + nome de cada workflow importado
- URL `${INSTANCE}/workflow/${ID}` para cada
- Lembrete sobre env vars + credentials que o usuário precisa configurar antes de ativar

# Constraints

- **Pro/Agency only** — verifique license válida via `license.linkedin.maxvision.com.br/v1/check` antes de prosseguir (Sprint 3).
- Se algum workflow falhar import, **não** ative os outros — pare e reporte.
- Default workflows são templates — usuário pode customizar nodes individuais via UI n8n após import.
- Para tier Agency multi-tenant, cada cliente final tem sua própria n8n instance + API key (não compartilhar).
