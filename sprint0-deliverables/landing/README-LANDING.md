# Landing — Sprint 0 (placeholder)

Mínimo viável: hero + waitlist email + privacy/ToS link.

## Stack

- Next.js 15 (App Router) + TypeScript strict + Tailwind v4
- Hosted: Vercel (free tier)
- Waitlist: Resend (lista) ou Loops.so (lista + drip) — escolher 1
- Form action: server action que POSTa para Resend audience

## Bootstrap

```bash
cd sprint0-deliverables/landing
pnpm create next-app@latest . --typescript --tailwind --app --src-dir --no-import-alias --no-eslint
pnpm add resend @vercel/analytics
```

## Páginas mínimas

| Rota | Conteúdo |
|---|---|
| `/` | Hero "Automação LinkedIn nativa para Claude Code" + CTA waitlist |
| `/privacy` | Política de privacidade (cookies LinkedIn = ToS warning) |
| `/terms` | EULA short-form (ref EULA Pro completa em `docs/INFOPRODUCT-PACKAGING.md`) |
| `/api/waitlist` | POST {email} → Resend audience.contacts.create |

## Variáveis Vercel (Project Settings → Env)

```
RESEND_API_KEY=re_xxx
RESEND_AUDIENCE_ID=aud_xxx
NEXT_PUBLIC_LANDING_DOMAIN=https://linkedin.maxvision.com.br
NEXT_PUBLIC_GHCR_REPO=produtoramaxvision/linkedin-maxvision-mcp
```

## Deploy

```bash
pnpm dlx vercel link            # interativo
pnpm dlx vercel --prod
# Settings → Domains → Add → linkedin.maxvision.com.br
# Vercel exibirá CNAME para apontar — colar no Cloudflare como DNS only.
```

## Disclaimer obrigatório (homepage footer)

> "MaxVision LinkedIn Suite executa ações em sua conta LinkedIn via cookie de sessão. O uso de automação no LinkedIn pode violar os Termos de Uso da plataforma e resultar em restrições de conta. Use com moderação e por sua conta e risco."

(Texto completo em `docs/RISKS-COMPLIANCE.md`.)
