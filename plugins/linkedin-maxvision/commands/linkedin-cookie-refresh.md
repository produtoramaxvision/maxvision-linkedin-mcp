---
name: linkedin-cookie-refresh
description: Captura cookie li_at LinkedIn via login interativo no navegador local e persiste no servidor MCP
argument-hint: [--account-id default]
allowed-tools: Bash
---

Você está executando o fluxo automatizado de captura/refresh do cookie `li_at` do LinkedIn (Sprint 1.5.1).

A heavy lifting é feita por `mcp-server/scripts/capture-cookie.ts`. Sua tarefa aqui:

1. Validar pré-requisitos no laptop do usuário
2. Disparar o script via Bash em foreground
3. Reportar resultado de forma legível

# Pré-requisitos

O usuário precisa ter no laptop:

- Node 20+ (`node --version`)
- `MAXVISION_API_KEY` no env (a mesma key configurada no Claude Code para falar com o servidor MCP)
- Chromium do Patchright instalado uma vez: `npx patchright install chromium`

# Workflow desta sessão

## 1. Verificar `MAXVISION_API_KEY`

Rode (Bash):

```bash
test -n "$MAXVISION_API_KEY" && echo "API_KEY_SET" || echo "API_KEY_MISSING"
```

Se aparecer `API_KEY_MISSING`:
- Avise o usuário que precisa exportar `MAXVISION_API_KEY` (PowerShell `[Environment]::SetEnvironmentVariable("MAXVISION_API_KEY", "mxv_xxx", "User")` e reabrir o terminal, ou bash `export MAXVISION_API_KEY=mxv_xxx`).
- Não prossiga.

NUNCA ecoe o valor da key na resposta — apenas confirme presença/ausência.

## 2. Garantir dependências do mcp-server

Se `mcp-server/node_modules/` não existir, rode:

```bash
cd mcp-server && pnpm install --ignore-workspace
```

## 3. Disparar a captura

Comando principal (substitua `$ARGUMENTS` pelo argumento passado pelo usuário, ou use defaults):

```bash
cd mcp-server && pnpm capture-cookie $ARGUMENTS
```

Defaults se o usuário não passar nada: `--account-id default --display-name "Default Account" --expires-days 90`.

O script:
- Abre uma janela do Chrome apontando para `linkedin.com/login`
- Aguarda o usuário fazer login (até 5 min, com mensagens de progresso a cada 30s)
- Detecta o cookie `li_at`, valida via `/feed`
- POSTa o cookie cru ao servidor MCP em `https://linkedin-mcp.produtoramaxvision.com.br/admin/account-cookie` (HTTPS — única vez que o cookie trafega em claro)
- Servidor encripta com AES-256-GCM e grava em `accounts.cookie_encrypted`
- Browser é fechado, exit 0 com linha `OK account=<id> cookie_expires=<iso>`

## 4. Interpretar exit code

| Exit | Significado | Ação |
|---|---|---|
| 0 | Sucesso | Reporte a linha `OK …` ao usuário e sugira `/linkedin-status` |
| 2 | `MAXVISION_API_KEY` ausente | Re-instrua o passo 1 |
| 3 | Login timeout (5 min) | Pergunte se quer retentar |
| 4 | Cookie validação falhou 2x | Conta pode estar flagged — sugerir 24h de pausa |
| 5 | Servidor 4xx | Mostre o body do erro (key inválida ou body malformado) |
| 6 | Servidor 5xx persistente | Cheque `/health` e `/linkedin-status`; pode ser DB/Postgres |
| 7 | Patchright falhou ao iniciar | Instrua: `cd mcp-server && npx patchright install chromium` |

## 5. Constraints de segurança

- **Nunca** ecoe o valor do `li_at` na resposta. O script já cuida de não imprimir; você só pode mostrar `length=N` se aparecer no stdout.
- Se o usuário colar o `li_at` direto no chat por engano, **avise** que o fluxo automatizado não precisa disso e sugira limpar a transcrição.
- Se Chromium pedir credenciais salvas pelo Chrome do sistema (perfil persistente em `mcp-server/.cookie-capture-profile/`), tudo bem — esse diretório fica em `scripts/.gitignore`.

## 6. Pós-sucesso

Sugira ao usuário:

```
/linkedin-status
```

para confirmar que `account_status: healthy` e o probe aprova o cookie recém-capturado.

# Notas operacionais

- O script roda em **foreground** (aguarda o usuário logar manualmente). Não rode em background.
- Em Windows com PowerShell, `cd mcp-server && pnpm …` funciona (Bash tool usa POSIX shell). Não use `;` separator do PowerShell.
- O fluxo manual SQL (Sprint 1) ainda existe em `sprint0-deliverables/portainer/DEPLOY-VPS.md` §8.3 como escape hatch. Use só se este comando falhar repetidamente.
