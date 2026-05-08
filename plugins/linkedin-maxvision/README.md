# linkedin-maxvision

Suíte de automação LinkedIn para Claude Code. Busca de vagas, lookup de perfis e tracker de candidaturas — tudo dentro do seu workspace, com motor anti-detect (Patchright) e respeito explícito aos Termos do LinkedIn.

> Tier **Free** — Sprint 1. Pro e Agency liberam multi-conta, fila de mensagens e auto-apply (Sprint 3).

---

## O que faz

- **Busca de vagas** no LinkedIn + agregadores (Indeed, Glassdoor, ZipRecruiter via JobSpy).
- **Lookup de perfil público** por URL `/in/<slug>` — experiência, skills, sumário.
- **Detalhes de vaga** por URL `/jobs/view/<id>` — descrição, requisitos, easy-apply.
- **Tracker local** de candidaturas — status (saved/applied/interviewing/rejected/offered/withdrawn), notas, currículo usado.
- **Rate-limit** automático por ferramenta + cache (60 min para vagas, 24 h para perfis).

Tudo via MCP server local (Node 20 + Patchright + Postgres/Drizzle).

---

## Instalação (Free tier)

1. Compile o servidor MCP:
   ```bash
   cd mcp-server
   pnpm install
   pnpm build
   ```

2. Configure a variável de cookie LinkedIn no `.env` (veja `mcp-server/.env.example`).

3. No Claude Code, instale o plugin:
   ```
   /plugin install linkedin-maxvision
   ```

4. Reinicie a sessão. O hook `SessionStart` exibe disclaimer ToS uma vez.

5. Rode `/linkedin-status` para validar conexão e cookie.

---

## Ferramentas MCP disponíveis

| Tool | Descrição | Cache |
|---|---|---|
| `search_jobs` | Busca em LinkedIn + JobSpy (Indeed/Glassdoor/ZipRecruiter) | 60 min |
| `get_profile` | Perfil público por URL `/in/<slug>` | 24 h |
| `get_job_details` | Vaga única por URL `/jobs/view/<id>` | 60 min |
| `track_application` | Registra candidatura no tracker local | — |

Todas as ferramentas validam input via Zod e expõem rate-limit por accountId.

---

## Slash commands (7)

| Comando | O que faz |
|---|---|
| `/linkedin-find-jobs` | Busca vagas (keywords + location opcional + source) |
| `/linkedin-job-details` | Detalha uma vaga específica por URL |
| `/linkedin-profile` | Lê perfil público estruturado |
| `/linkedin-track` | Salva/atualiza status de candidatura |
| `/linkedin-applications` | Lista candidaturas do tracker (Sprint 1.5: tool dedicado) |
| `/linkedin-status` | Health check (rate-limit, captcha, cookie) |
| `/linkedin-cookie-refresh` | Re-importa `li_at` quando expirado |

---

## ToS & Compliance

- Acesso **somente** a dados públicos visíveis ao seu próprio cookie autenticado.
- Sem scraping bruto, sem brute force, sem bypass de captcha.
- Rate-limit conservador por padrão (≈ 60 req/h por tool).
- O motor Patchright é anti-detect, **não** anti-ToS — uso continuado em massa pode levar à suspensão da sua conta. Você é responsável pelo seu uso.
- Em caso de captcha persistente, a tool `search_jobs` aborta e sugere `/linkedin-cookie-refresh`.

## LGPD

- Todos os dados são armazenados **localmente** (Postgres na sua VPS ou local).
- Cookie `li_at` é **encriptado** em repouso (AES-256-GCM, chave em env).
- Nenhum dado é enviado a serviços externos da MaxVision na Free tier.
- Para deletar tudo: `pnpm db:reset` no diretório `mcp-server/`.

---

## Links

- Site: [linkedin.produtoramaxvision.com.br](https://linkedin.produtoramaxvision.com.br)
- Upgrade Pro/Agency (Sprint 3): [linkedin.produtoramaxvision.com.br/pricing](https://linkedin.produtoramaxvision.com.br/pricing)
- Suporte: produtoramaxvision@gmail.com

## Licença

AGPL-3.0. Forks e redistribuição comercial requerem código aberto da derivação.
