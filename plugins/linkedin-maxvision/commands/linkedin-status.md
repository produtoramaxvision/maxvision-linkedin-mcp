---
name: linkedin-status
description: Health check do MCP server — rate-limit, captcha, cookie, conta
argument-hint: [--verbose]
allowed-tools: mcp__linkedin-maxvision__search_jobs
---

Você está ajudando o usuário a checar a saúde da conexão com LinkedIn — quotas, status do cookie, eventos de captcha recentes.

# Workflow Sprint 1

> Sprint 1 ainda não expõe um tool dedicado `health` ou `get_status`. Use o probe abaixo até a Sprint 1.5 adicionar `mcp__linkedin-maxvision__get_status`.

1. Execute um **probe leve** chamando `mcp__linkedin-maxvision__search_jobs` com:
   ```json
   {
     "accountId": "default",
     "keywords": "engineer",
     "maxResults": 1,
     "sources": "linkedin"
   }
   ```
   Esse call retorna na resposta metadata sobre rate-limit remaining, latency, e captcha-trigger se houver.

2. Extraia da resposta (a tool inclui esses campos no payload de erro/sucesso):
   - `rate_limit.remaining` por tool — calcule % vs `rate_limit.capacity`
   - `latency_ms` — alerta se > 3000 ms
   - `captcha_events_24h` — alerta se > 0
   - `cookie_expires_at` — alerta se < 7 dias
   - `account_status` — `healthy` | `flagged` | `restricted`

3. Apresente como dashboard textual:
   ```
   LinkedIn MaxVision — Health
   ───────────────────────────
   Conta:               <account_status>
   Cookie expira em:    <Nd HHh>
   Rate-limit (search): <X / Y> (Z% disponível)
   Latency média:       <Lms>
   Captcha (24h):       <N eventos>
   ```

4. Se algum sinal estiver crítico, sugira ação:
   - Cookie expirando: `/linkedin-cookie-refresh`
   - Captcha frequente: pause e espere 1-2h, depois rode `/linkedin-status` de novo
   - Rate-limit < 20%: aguarde reset (1h sliding window)

# Constraints

- O probe **consome** 1 unidade de rate-limit. Avise o usuário antes se ele estiver perto do limite.
- Se a probe falhar com erro de conexão, o problema é no `mcp-server` (não no LinkedIn) — sugira checar `pnpm logs` no diretório do server.
- Sprint 1.5 substitui esse comando pelo tool dedicado `get_status` (sem custo de rate-limit).
