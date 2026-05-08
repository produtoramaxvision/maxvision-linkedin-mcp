# Sprint 0 — Deliverables

Conteúdo gerado para execução do Bloco 1 do `MARKETPLACE-CREATION-RUNBOOK.md`.

**Decisões aprovadas pelo owner (2026-05-08):**

- Zone única: `produtoramaxvision.com.br` (sem `meuagente.api.br`, sem `maxvision.com.br`).
- Stack landing: **Cloudflare Pages + Astro 5 + Tailwind** (sem Vercel).
- License server e Stripe products: **deferidos para Sprint 3** (após validação completa em homolog via `stripe-mcp` + browser).
- Postgres: dedicado novo isolado em `mcp-internal` (não compartilha `postgres_postgres` v14 nem `meuagente-postgres`).

## Estrutura

```
sprint0-deliverables/
├── portainer/
│   ├── portainer-stack-vmmvp.yml      ← stack pronto p/ Portainer (rede `net`, certresolver `letsencryptresolver`)
│   └── .env.template                   ← variáveis para colar em Portainer → Stacks → Env
├── cloudflare-worker/                  ← DEFERIDO Sprint 3
│   ├── wrangler.toml
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts
├── landing/                            ← Cloudflare Pages + Astro
│   ├── astro.config.mjs
│   ├── package.json
│   ├── tailwind.config.cjs
│   ├── tsconfig.json
│   ├── wrangler.toml
│   ├── README.md                       ← bootstrap + deploy
│   └── src/
│       ├── layouts/BaseLayout.astro
│       └── pages/
│           ├── index.astro             ← hero + waitlist form
│           └── api/waitlist.ts         ← POST → Resend
├── github-actions/
│   ├── ci.yml                          ← copy → .github/workflows/ci.yml (lint+test+build multi-arch)
│   ├── release.yml                     ← copy → .github/workflows/release.yml
│   ├── landing-deploy.yml              ← deploy Pages
│   └── worker-deploy.yml               ← DEFERIDO Sprint 3
├── stripe/
│   └── PRODUCTS-SETUP.md               ← DEFERIDO Sprint 3
├── dns/
│   └── DNS-RECORDS.md                  ← linkedin-mcp já criado via Cloudflare MCP
└── scripts/
    ├── 01-create-repos.sh              ← já executado
    ├── 02-branch-protection.sh         ← já executado
    └── 03-secrets-labels.sh            ← pendente
```

## Status item-a-item (Bloco 1 do runbook)

| # | Item | Status | Detalhe |
|---|---|---|---|
| 1.1 | Repo público | ✅ done | https://github.com/produtoramaxvision/maxvision-linkedin-mcp |
| 1.2 | Repo privado | ✅ done | https://github.com/produtoramaxvision/maxvision-linkedin-mcp-pro |
| 1.3 | DNS linkedin-mcp | ✅ done | CNAME → `hostinger.produtoramaxvision.com.br`, DNS only, ID `025bfd71f5774784945deef3e3699b0a` |
| 1.4 | Branch protection | ✅ done | main 1-review + status checks; homolog 0-review + 2 status checks |
| 1.5 | GitHub secrets | ⏳ pendente | `bash scripts/03-secrets-labels.sh` (interativo, você cola valores) |
| 1.6 | GHCR | ✅ auto | CI publica via `GITHUB_TOKEN` no `ci.yml` |
| 1.7 | Issue templates + labels | ⏳ pendente | mesmo script do 1.5 cuida das labels |
| 1.8 | Cloudflare Worker license server | ⏸ deferido Sprint 3 | scaffold pronto, ativa quando Pro existir |
| 1.9 | Stripe products + webhook | ⏸ deferido Sprint 3 | validação via `stripe-mcp` antes de live mode |
| 1.10 | Landing waitlist | ⏳ pendente | scaffold Astro pronto, falta `pnpm install` + `pnpm deploy` |

## Decisões críticas (não retroceder sem motivo)

| # | Decisão | Por quê |
|---|---|---|
| D1 | Postgres dedicado novo (não usar `postgres_postgres` v14 nem `meuagente-postgres`) | v14 deprecated; já carrega 11 DBs. Padrão da VPS é dedicar (cliproxy, paperclip, firecrawl, pgvector). |
| D2 | Network externa = `net` | Já existe na VPS, é onde Traefik está. Criar `traefik-public` quebra resolver. |
| D3 | certresolver = `letsencryptresolver` | Nome literal nos args do `traefik_traefik`. |
| D4 | CI multi-arch obrigatório (linux/amd64+arm64) | VPS é aarch64. Imagem amd64-only não inicia. |
| D5 | Cloudflare Pages para landing (sem Vercel) | Decisão owner — concentrar tudo Cloudflare. |
| D6 | DNS only em hosts da VPS | Traefik HTTP-01 challenge; Cloudflare proxy bloqueia. |
| D7 | Zone única `produtoramaxvision.com.br` | Decisão owner — sem `meuagente.api.br` no produto LinkedIn. |
| D8 | Astro 5 (não Next.js) | Static-first, build leve, melhor casamento Cloudflare Pages, sem dependência Vercel. |
| D9 | License + Stripe deferidos Sprint 3 | Sem feature Pro pra proteger, fica idle. Validar via `stripe-mcp` + browser primeiro. |

## Próximos passos pendentes (em ordem)

1. **1.10 Landing**: `cd landing && pnpm install && pnpm dev` para preview local. Depois `pnpm deploy` → Cloudflare Pages.
2. **1.5 + 1.7**: rodar `bash scripts/03-secrets-labels.sh` (interativo).
3. **Issue templates**: criar `.github/ISSUE_TEMPLATE/{bug,feature,compliance}.yml` no repo público.
4. **Bloco 2 validação**: Após Sprint 1 (mcp-server real), validar end-to-end no homolog via `stripe-mcp` + browser antes de Sprint 3 ativar Stripe live.

## NÃO fizemos (intencional)

- ❌ Deploy no VPS — owner faz manual no Portainer
- ❌ Pages deploy — owner faz `pnpm deploy` manual no primeiro setup
- ❌ Worker deploy — deferido Sprint 3
- ❌ Stripe products — deferido Sprint 3
- ❌ Custom domain Pages — owner adiciona via dashboard depois do primeiro deploy
