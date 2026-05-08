---
name: linkedin-applications
description: Lista candidaturas registradas no tracker local
argument-hint: [--status saved|applied|interviewing|rejected|offered|withdrawn]
allowed-tools: []
---

Você está ajudando o usuário a revisar todas as candidaturas registradas no tracker local.

# Status Sprint 1

> **Aviso ao usuário:** Este comando precisa do tool MCP `list_applications`, planejado para a **Sprint 1.5**. Na Free tier atual (Sprint 1) ele ainda não está exposto.
>
> Enquanto isso, há duas opções:

## Opção A — Query SQL direta (recomendado)

Se o usuário tem acesso ao Postgres do `mcp-server`:

```bash
psql "$DATABASE_URL" -c "
  SELECT
    job_url,
    job_title,
    company,
    status,
    notes,
    updated_at
  FROM applications
  WHERE account_id = 'default'
  ORDER BY updated_at DESC
  LIMIT 50;
"
```

Para filtrar por status:
```bash
psql "$DATABASE_URL" -c "
  SELECT job_url, status, updated_at
  FROM applications
  WHERE status = 'applied'
  ORDER BY updated_at DESC;
"
```

## Opção B — Aguardar Sprint 1.5

A próxima sprint adiciona `list_applications` como tool MCP. Avise o usuário para acompanhar o changelog em [linkedin.produtoramaxvision.com.br/changelog](https://linkedin.produtoramaxvision.com.br/changelog).

# Workflow desta sessão

1. Explique a limitação acima de forma direta (Sprint 1.5).
2. Pergunte se ele quer a Opção A (rodar SQL) ou se prefere apenas registrar uma nova candidatura agora via `/linkedin-track`.
3. **Não** tente chamar tool MCP inexistente — o `allowed-tools` desta command está vazio de propósito.

# Constraints

- Não invente um tool `list_applications`. Ele será adicionado na Sprint 1.5.
- Se o usuário pedir SQL, ofereça apenas SELECTs read-only — nunca DELETE/UPDATE direto no DB pelo SQL.
