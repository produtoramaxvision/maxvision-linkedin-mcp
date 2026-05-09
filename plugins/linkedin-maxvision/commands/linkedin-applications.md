---
name: linkedin-applications
description: Lista candidaturas registradas no tracker local
argument-hint: [--status saved|applied|interviewing|rejected|offered|withdrawn] [--limit N]
allowed-tools: ["mcp__linkedin-maxvision__list_applications"]
---

Você está ajudando o usuário a revisar candidaturas registradas no tracker local
via o tool MCP `list_applications` (Sprint 1.5, v0.13.4+).

# Workflow

1. **Parse `$ARGUMENTS`** procurando os flags abaixo. Tudo é opcional:
   - `--status <s>` → um de `saved | applied | interviewing | rejected | offered | withdrawn`.
   - `--limit <N>` → inteiro 1-200; default 50.
   - `--account <id>` → opcional; default `default` (resolve para a primeira conta ativa).

2. **Chame** `mcp__linkedin-maxvision__list_applications` com:
   - `accountId` (opcional, default `default`)
   - `status` (apenas se o flag veio)
   - `limit` (apenas se o flag veio)

3. **Renderize uma tabela markdown** com colunas:
   `Status | Empresa | Cargo | Submetido em | Histórico`. Use `submittedAt`
   formatado como `YYYY-MM-DD HH:mm` em pt_BR; mostre `—` quando `null`
   (status `saved`, ainda não aplicado).

4. **No rodapé**, mostre `Total: <count>` e (se filtro foi aplicado) `Filtro: status=<s>`.
   Sugira variações úteis: filtrar por outro status, registrar nova via `/linkedin-track`,
   ou expandir o limite.

5. Se `count == 0`:
   - Sem filtro → diga "Nenhuma candidatura registrada" e ofereça `/linkedin-track`.
   - Com filtro → diga "Nenhuma candidatura com status=<s>"; sugira remover o filtro
     ou rodar `/linkedin-applications` cru para ver tudo.

# Exemplos de uso

```
/linkedin-applications                          # últimas 50, qualquer status
/linkedin-applications --status applied         # só candidaturas enviadas
/linkedin-applications --status saved --limit 200
/linkedin-applications --account sandbox-2      # outra conta do pool
```

# Constraints

- **Não** invente filtros que o tool não suporta — apenas `accountId`, `status`, `limit`.
- **Nunca** sugira SQL direto no Postgres como fallback; o tool MCP cobre o caso.
- **Não** registre nova candidatura aqui; isso é trabalho do `/linkedin-track`.
- Se o tool retornar `error.code: "RATE_LIMITED"`, peça desculpa e avise para
  aguardar antes de retentar.
