# MaxVision LinkedIn Suite — Landing (Cloudflare Pages)

Stack: **Astro 5 + Tailwind + Cloudflare Pages + Resend** para waitlist.

Sem Vercel. Tudo concentrado em Cloudflare:

- Hospedagem: Cloudflare Pages (free tier)
- Domínio: `linkedin.produtoramaxvision.com.br` (mesma zone que MCP server)
- API waitlist: Pages Functions (Astro endpoint server-side via Cloudflare adapter)
- Lista de email: Resend (https://resend.com) → Audience

## Bootstrap inicial

```bash
cd sprint0-deliverables/landing
pnpm install
```

## Dev local

```bash
pnpm dev
# http://localhost:4321
```

Para testar waitlist em dev sem hit real no Resend, deixa `RESEND_API_KEY` vazio — handler retorna `mode: dev` e loga email no console.

## Configurar Resend

1. Criar conta gratuita em https://resend.com.
2. Criar Audience → copiar `audience_id`.
3. API Keys → Create → permissão `audience.contacts.create` → copiar `re_xxx`.

## Deploy Cloudflare Pages — primeiro deploy

```bash
# Login wrangler (uma vez)
pnpm dlx wrangler login

# Build + deploy
pnpm deploy
# Cloudflare retorna URL <hash>.linkedin-maxvision-landing.pages.dev
```

## Adicionar custom domain

1. https://dash.cloudflare.com → Workers & Pages → linkedin-maxvision-landing
2. Custom domains → Set up a custom domain
3. Domain: `linkedin.produtoramaxvision.com.br`
4. Cloudflare adiciona CNAME automaticamente na zone (mesma conta = sem token extra).
5. Cert TLS provisionado em ~1min.

## Variáveis de ambiente em produção

Pages Dashboard → Settings → Environment variables:

| Nome | Valor | Encryption |
|---|---|---|
| `RESEND_API_KEY` | `re_xxx` | Encrypted |
| `RESEND_AUDIENCE_ID` | UUID da audience | Plain |

Após adicionar, **redeploy** (Pages → Deployments → Retry).

## Validação pós-deploy

```bash
curl -fsS https://linkedin.produtoramaxvision.com.br/         # 200 + HTML hero
curl -fsS -X POST https://linkedin.produtoramaxvision.com.br/api/waitlist \
  -H "content-type: application/json" \
  -d '{"email":"teste@maxvision.com.br"}'
# Esperado: {"ok": true}
```

## CI/CD (GitHub Actions)

Workflow em `.github/workflows/landing-deploy.yml` fará build + `wrangler pages deploy` em push pra `main` (com filtro de path `sprint0-deliverables/landing/**` ou `landing/**` quando moverem pra raiz).

## Disclaimer obrigatório

Texto já incluído no `src/pages/index.astro` (footer):

> "MaxVision LinkedIn Suite executa ações em sua conta LinkedIn via cookie de sessão. Automação no LinkedIn pode violar os Termos de Uso da plataforma e resultar em restrições de conta. Use com moderação e por sua conta e risco."

Texto completo em `docs/RISKS-COMPLIANCE.md`.

## Estrutura

```
landing/
├── astro.config.mjs        # Astro + Cloudflare adapter + Tailwind
├── package.json
├── tailwind.config.cjs
├── tsconfig.json
├── wrangler.toml           # Pages config
├── src/
│   ├── layouts/
│   │   └── BaseLayout.astro
│   └── pages/
│       ├── index.astro     # Hero + waitlist form
│       └── api/
│           └── waitlist.ts # POST → Resend
└── public/                 # static assets (criar quando precisar)
```
