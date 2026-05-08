# Sprint 0 — Deliverables

Conteúdo gerado para execução manual do Bloco 1 do `MARKETPLACE-CREATION-RUNBOOK.md`.
**Nada foi deployado ou commitado**. Tudo aqui aguarda aprovação do owner.

## Estrutura

```
sprint0-deliverables/
├── portainer/
│   ├── portainer-stack-vmmvp.yml      ← stack pronto p/ Portainer (rede `net`, certresolver `letsencryptresolver`)
│   └── .env.template                   ← variáveis para colar em Portainer → Stacks → Env
├── cloudflare-worker/
│   ├── wrangler.toml                   ← Worker config (custom domain license.linkedin.maxvision.com.br)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts                    ← stub /v1/check, /v1/issue, /v1/revoke, /v1/stripe-webhook
├── github-actions/
│   ├── ci.yml                          ← copy → .github/workflows/ci.yml no repo público
│   └── release.yml                     ← copy → .github/workflows/release.yml
├── stripe/
│   └── PRODUCTS-SETUP.md               ← passo-a-passo dashboard
├── landing/
│   └── README-LANDING.md               ← bootstrap Next.js + Vercel + Resend
├── dns/
│   └── DNS-RECORDS.md                  ← 4 registros + verificação dig
└── scripts/
    ├── 01-create-repos.sh              ← dry-run-able, cria repos via gh CLI
    ├── 02-branch-protection.sh
    └── 03-secrets-labels.sh
```

## Decisões tomadas (não retroceder sem motivo)

| # | Decisão | Por quê |
|---|---|---|
| D1 | **Postgres dedicado novo** (não usar `postgres_postgres` v14 nem `meuagente-postgres`) | v14 está velho, compartilha com 11 DBs. Padrão da VPS é dedicar (cliproxy, paperclip, firecrawl, pgvector). Isolamento + RLS + freedom de upgrades. |
| D2 | **Network externa = `net`** | Já existe na VPS, é onde Traefik está conectado. Criar `traefik-public` quebraria o resolver. |
| D3 | **certresolver = `letsencryptresolver`** | É o nome literal nos args de `traefik_traefik`, não `letsencrypt`. |
| D4 | **CI multi-arch obrigatório** | VPS é `aarch64`. Imagem só amd64 falha ao iniciar no Swarm. |
| D5 | **Cloudflare Worker, não VPS, para license** | Latência global, free tier > 100k req/dia, KV nativo, Stripe webhook receberia rate limits melhor. |
| D6 | **DNS only (sem proxy laranja) em hosts da VPS** | Traefik usa httpchallenge na porta 80 — Cloudflare proxy bloquearia. Só Worker fica proxied. |

## Próximos passos (na ordem)

1. **Aprovação dos 9 itens listados na resposta da Claude** (ver tabela final).
2. Executar `bash sprint0-deliverables/scripts/01-create-repos.sh --dry-run` (revisar comandos), depois sem `--dry-run`.
3. Importar blueprint para o repo recém-criado (comandos no runbook 1.1).
4. Rodar `02-branch-protection.sh` e `03-secrets-labels.sh`.
5. Criar registros DNS conforme `dns/DNS-RECORDS.md`.
6. Deploy Worker (`cd cloudflare-worker && pnpm install && pnpm dlx wrangler deploy`).
7. Criar produtos Stripe (`stripe/PRODUCTS-SETUP.md`).
8. Bootstrapar landing (`landing/README-LANDING.md`) e linkar Vercel.
9. **Manualmente no Portainer**: criar stack `maxv-linkedin` colando `portainer/portainer-stack-vmmvp.yml` + variáveis do `.env.template`.

## NÃO fizemos (intencionalmente)

- ❌ Deploy no VPS (decisão sua, manual)
- ❌ `gh repo create` (aguarda aprovação — destrutivo, expõe repo público)
- ❌ Criar registros DNS (precisa Cloudflare API token)
- ❌ Criar produtos Stripe (precisa login dashboard)
- ❌ Commit / push de qualquer arquivo
