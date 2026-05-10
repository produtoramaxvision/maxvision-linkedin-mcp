# Architecture — MaxVision LinkedIn MCP

Production architecture as of v0.13.13 (2026-05-10). 16 MCP tools, Apify+BD backbone, license gate via Cloudflare Worker.

---

## Visão geral por camada

| Camada | Responsabilidade | Tecnologia |
|---|---|---|
| **Cliente** | Conversação, comandos, skills, agentes | Claude Code + plugin `linkedin-maxvision` |
| **Transporte** | MCP Streamable HTTP (stateless) | `@modelcontextprotocol/sdk` 1.29 + Hono |
| **Tools** | 16 tools com instrumentation, license gate, rate limit | `src/tools/*.ts` |
| **Scrapers** | Apify harvestapi actors + Tavily Extract + Patchright local | `src/scrapers/*.ts` |
| **Browser** | Patchright pool com BD Web Unlocker proxy (Mode B/C) | `src/browser/pool.ts` |
| **Persistência** | Drizzle + Postgres (cache, accounts, applications, audit) | `src/db/{schema,client,repos}.ts` |
| **Rate limit** | Token bucket por accountId + action | Redis via ioredis |
| **Auth** | API key + license header (AsyncLocalStorage propagation) | `src/auth/{api-key,license,request-context,cookies}.ts` |
| **Orquestração** (Variant B) | Cron, batch, notify, tracking visual | n8n + 4 workflows |
| **License** | Validação tier Pro/Agency | Cloudflare Worker + KV + Stripe webhook |

---

## Schemas MCP — todas as 16 tools

Tools shipped (v0.13.13):

### Free tier (12 tools, no license required)

| Tool | Description | Backend |
|---|---|---|
| `search_jobs` | LinkedIn + JobSpy aggregator | Patchright + BD Unlocker (guest layout, no auth) |
| `get_job_details` | Single job by URL | Patchright + BD Unlocker |
| `get_profile` | LinkedIn profile by URL/slug | Apify `harvestapi/linkedin-profile-scraper` |
| `get_profile_activity` | Recent posts + reactions | Apify |
| `optimize_profile` | LLM analysis vs target role | Smart pipeline: manual text → Tavily Extract → Apify fallback → Claude/Gemini via OpenRouter |
| `list_feed` | Recent items from home feed | Apify post-search-scraper |
| `get_company_info` | Company details | Apify `harvestapi/linkedin-company-detail` |
| `search_companies` | Company filter search | Apify `harvestapi/linkedin-company-search` |
| `find_company_employees` | Employees by company | Apify (with URN case preservation) |
| `monitor_post_engagement` | Reactions + comments | Apify |
| `track_application` | DB-backed application tracker | Postgres (local) |
| `list_applications` | List tracked applications | Postgres (local) |

### Pro tier (4 tools, require `MAXVISION_LICENSE`)

| Tool | Description | Confirm gate |
|---|---|---|
| `apply_easy` | Submit Easy Apply | `confirm=false` returns preview; `confirm=true` submits |
| `send_message` | DM/InMail | `confirm=false` returns preview; `confirm=true` sends |
| `post_update` | Create feed post | `confirm=false` returns preview; `confirm=true` publishes |
| `search_people` | Filter people search | (no confirm — read tool) |

Schemas live in `mcp-server/src/tools/schemas.ts`. Each tool exports its input shape (raw Zod object for `server.registerTool`) and the parsed input schema (with `.transform()` for URL normalization, etc.).

Notable schema decisions:

- `JobUrlSchema` uses `z.transform` to normalize slugged URLs (`/jobs/view/some-job-slug-123/` → `/jobs/view/123/`) — lifts the requirement away from every caller (BUG 2 fix v0.13.2)
- `accountId` defaults to `'default'`; `accounts.repo.getAccountById('default')` falls back to first active account if no row matches (BUG 1 fix v0.13.2)
- `search_companies` input field is `searchQuery` (Apify actor expectation), not `keywords` (BUG 5 fix v0.13.3)

---

## Schema Postgres (Drizzle)

Source-of-truth: `mcp-server/src/db/schema.ts`. Migrations apply via `drizzle-orm/node-postgres/migrator` on startup with retry-with-backoff (Postgres may not be ready in Swarm v3.9 — `depends_on` doesn't gate this).

Tables:

- `accounts` — id, display_name, cookie_encrypted (BYTEA), cookie_expires_at, status (active/paused/banned), rate_limit_bucket (JSONB)
- `jobs_cache` — payload (JSONB), expires_at
- `profiles_cache` — payload, expires_at
- `applications` — job_url, account_id (FK), status, history (JSONB array, append via `||`)
- `messages_drafts` — recipient_url, body, status (draft/sent/rejected), sent_at
- `rate_limit_events` — append-only log paralelo ao Redis bucket (forensics)
- `captcha_events` — health check writes here when status != ok
- `license_cache` — key_hash (SHA-256), tier, features, expires_at — 1h TTL
- `audit_log` — tool, account_id, input_hash (SHA-256[:32]), output_hash, success, latency_ms, error_msg

LGPD: `audit_log` never stores raw input/output — only hashes for forensic queries scoped by tool + account + time.

---

## Tool instrumentation — `withInstrumentation`

Every tool is wrapped by `withInstrumentation` in `src/tools/_base.ts`:

1. **Validate** — Zod re-parse (idempotent — SDK pre-parses raw shape; defensive parse here gives a single validation point)
2. **License gate** — `gateToolByLicense(tool.name, reqCtx.licenseKey)` — noop when `LICENSE_CHECK_ENABLED=false`; Pro tools 401 without valid `X-MaxVision-License` header
3. **Rate limit gate** — `checkRateLimit(accountId, tool.name)` via Redis token bucket (per action `search`/`profile`/`apply`/`message`/`post`/`feed_scroll`)
4. **Execute** — handler runs; latency captured via `performance.now()`
5. **Audit** — fire-and-forget `INSERT INTO audit_log` with hashes; failures logged at warn (must not break tool response)
6. **Error envelope** — thrown errors mapped to MCP `CallToolResult` `{ isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code, message } }) }] }`

License key propagated from HTTP layer to handler via AsyncLocalStorage:

```typescript
// src/http.ts
return withRequestContext({ licenseKey }, async () => {
  // ... mcp.connect + transport.handleRequest
});

// src/tools/_base.ts
const reqCtx = getRequestContext();
const deny = await gateToolByLicense(tool.name, reqCtx.licenseKey);
```

---

## Backbone strategy — Apify + BrightData

Pivot from cookie+browser-only (Mode B) to **Apify Mode A default** in Sprint 7 after empirical authwall on flagged datacenter ASN. Three modes documented in `docs/install-modes.md`:

### Mode A — Apify (default, recommended)

Stack envs:

```bash
APIFY_TOKEN=apify_api_xxx
APIFY_LINKEDIN_PROFILE_ACTOR=harvestapi~linkedin-profile-scraper
APIFY_LINKEDIN_PEOPLE_SEARCH_ACTOR=harvestapi~linkedin-profile-search
SCRAPING_BACKEND=patchright
PATCHRIGHT_PROXY_URL=http://brd.superproxy.io:33335
PATCHRIGHT_PROXY_USERNAME=brd-customer-...-zone-maxv_linkedin_unlocker
PATCHRIGHT_PROXY_PASSWORD=<bd unlocker zone password>
```

How it works:

- `get_profile`, `search_people`, `get_profile_activity`, company tools → Apify harvestapi actors (residential proxy + cookie injection internal to Apify; no user cookies)
- `search_jobs`, `get_job_details` → Patchright + BD Web Unlocker (handles auth + CAPTCHA + JS render at proxy layer; ~$2.50/CPM)
- Apify run helper (`src/scrapers/apify-helper.ts`) uses async `/runs` flow + `statusMessage` parsing → throws `UPSTREAM_FAIL` with upgrade hint when actor SUCCEEDS but `statusMessage` matches FREE_LIMIT_PATTERNS (silent throttle on free plan)

### Mode B — Cookie + local Patchright (no per-request cost)

Stack envs:

```bash
SCRAPING_BACKEND=patchright
# (Apify and BD tokens unset)
```

Per-account: fresh `li_at` cookie set via `/linkedin-cookie-refresh` capture flow. Browser pool launches `chromium.launchPersistentContext` per account with hydrated cookies. Limited to surfaces LinkedIn allows from datacenter IP (job pages OK; `/in/`, `/feed/`, `/search/people/` hit authwall).

### Mode C — Hybrid

Both Mode A envs + per-account cookies. Server prefers Apify when `APIFY_TOKEN` present, falls back to cookie+HTML on Apify failure. Maximum reliability for tight-margin Agency ops.

Switching modes is a single env change — no code redeploy.

---

## Smart pipeline — `optimize_profile`

Three-layer fallback (v0.13.11-13):

1. **Manual `profileText`** (fastest, free) — caller pastes profile text directly
2. **`profileUrl` + Tavily Extract** — checks `isLinkedInAntiScrapePage()` against:
   - Layer A — i18n 404 markers (EN/PT/ES/AR/CS/DA + multi-lang switcher)
   - Layer B — auth-wall markers (`Sign Up | LinkedIn`, `Agree & Join LinkedIn`, `seo-authwall`, `trk=linkedin-tc_auth-button`)
3. **`profileUrl` + Apify fallback** — `scrapeProfile()` returns `ProfileData`; `profileDataToText()` renders to LLM-ready text
4. **Empty Apify guard** (v0.13.13) — if Apify returns SUCCESS with empty `fullName` (URL doesn't exist), throw `EXTERNAL_API_FAIL` with actionable message

Logger field `textSource: 'manual' | 'tavily' | 'apify'` for ops visibility on which path resolved each call.

---

## Browser pool design (Patchright, Mode B/C)

```typescript
// src/browser/pool.ts
class BrowserPool {
  contexts: Map<accountId, BrowserContext>
  acquire(accountId): BrowserContext         // lazy init via launchPersistentContext
  healthCheck(accountId): "ok"|"captcha"|"logged_out"|"banned"
  invalidate(accountId): void
  shutdown(): void                           // graceful, called from SIGINT/SIGTERM
}
```

Persistent context per account at `/var/data/profiles/<accountId>` — fingerprint stable, localStorage persisted.

Patchright over vanilla Playwright: patches `navigator.webdriver`, `chrome.runtime`, `navigator.plugins`, canvas/WebGL fingerprint. LinkedIn detects Playwright vanilla in ~2 days; Patchright maintains 30+ days (community data 2025-26).

Launch options:
- `headless: env.PATCHRIGHT_HEADLESS`
- `proxy: { server: PATCHRIGHT_PROXY_URL, username, password }` (when set — BD Unlocker)
- `args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"]`
- `ignoreDefaultArgs: ["--enable-automation"]`

---

## Rate limiting

`src/rate-limit/strategy.ts` defines per-action limits:

```typescript
export const ACTION_LIMITS = {
  search_jobs:        { per_hour: 10,  per_day: 100, jitter_ms: [800, 3000]      },
  get_profile:        { per_hour: 8,   per_day: 80,  jitter_ms: [1500, 5000]     },
  apply_easy:         { per_hour: 5,   per_day: 50,  jitter_ms: [10_000, 30_000] },
  send_message:       { per_hour: 3,   per_day: 30,  jitter_ms: [5000, 15_000]   },
  post_update:        { per_hour: 2,   per_day: 5,   jitter_ms: [60_000, 300_000]},
  list_feed:          { per_hour: 30,  per_day: 200, jitter_ms: [500, 2000]      },
  // ... per tool
} as const;
```

Token bucket implementation in `src/rate-limit/token-bucket.ts` — Redis `INCR` + `EXPIRE` keyed by `rl:hour:{accountId}:{action}:{YYYY-MM-DD-HH}` (TTL 2h) and `rl:day:{accountId}:{action}:{YYYY-MM-DD}` (TTL 25h).

Race condition acceptable for current single-tenant volume; Lua script atomicity available if multi-tenant scale demands.

---

## License gate (Sprint 3)

License server: Cloudflare Worker at `https://license.linkedin.produtoramaxvision.com.br/v1/check`. POST `{ licenseKey }` returns `{ valid, tier, expiresAt, features }`.

MCP server flow:

1. Request arrives at `/mcp` POST
2. `c.req.header('x-maxvision-license')` extracted
3. `withRequestContext({ licenseKey }, async () => { ... })` propagates via AsyncLocalStorage
4. Tool handler calls `gateToolByLicense(tool.name, ctx.licenseKey)` — checks `license_cache` table first (1h TTL), then queries Worker on miss
5. Pro tools 401 without valid header when `LICENSE_CHECK_ENABLED=true`

Stripe → Worker webhook `/v1/issue` (test mode wired, live deferred to first paying customer). License email delivery via Resend planned Sprint 9.

---

## Anti-detect

1. **Apify backbone (Mode A default)** — eliminates most anti-detect concerns; Apify actors handle proxy + fingerprint internally
2. **Patchright (Mode B/C residual)** — patches known automation flags
3. **Persistent context** per account — fingerprint stable
4. **Cookies only** — never login automation (LinkedIn detects on the spot)
5. **Headers + timezone** consistent per account
6. **Mouse + scroll** humanized (Bezier curves, easeInOutQuad)
7. **Quiet hours + jitter** randomized (`ACTION_LIMITS.jitter_ms`)
8. **BD Web Unlocker** as proxy egress when Mode A (residential IP + premium domain unlocking)
9. **Health check** detects captcha/logout/ban early — pauses account before bigger enforcement
10. **Multi-account rotation** distributes signal (Pro tier up to 3, Agency unlimited)

---

## Deployment

Same Docker image (`ghcr.io/produtoramaxvision/linkedin-maxvision-mcp:0.13.13`) across all three modes documented in `docs/deploy-docker-swarm.md`:

| Capacidade | Compose | Swarm CLI | Portainer Compose | Portainer Swarm |
|---|---|---|---|---|
| Multi-node | Não | Sim | Não | Sim |
| Rolling updates + rollback | Não | Sim | Não | Sim |
| Secrets em runtime | File mount | Swarm secrets | Env vars | Swarm secrets |
| GitOps (auto-pull) | Não | Não | Sim | Sim |
| Webhook deploy | Não | Não | Sim | Sim |
| UI de gestão | Não | Não | Sim | Sim |
| Replicas | 1 | N | 1 | N |

Production deploy: Docker Swarm + Portainer, single-node, on `produtoramaxvision.com.br` zone, behind Traefik with letsencryptresolver. tmpfs `/dev/shm` 2GB workaround for Swarm `shm_size` limitation (mount-add via `docker service update`).

---

## Decisões de design relevantes

| Decisão | Alternativa rejeitada | Justificativa |
|---|---|---|
| Apify+BD backbone (Mode A default) | Patchright cookie-only | Datacenter ASN authwall; Apify handles proxy + fingerprint; BD Unlocker for Patchright surfaces (jobs) |
| Patchright (Mode B/C residual) | Vanilla Playwright | Anti-detect superior; community-maintained patches |
| Drizzle ORM owns schema | drizzle-kit push em prod | drizzle-kit push pode dropar colunas; migrator + retry safer |
| `confirm_required=true` default | Auto-fire | Compliance ToS + UX (cliente revisa) |
| MCP Streamable HTTP stateless | SSE | Simpler ops; per-request McpServer + transport instance (SDK invariant: stateless transport throws on reuse, McpServer rejects 2nd connect) |
| TypeScript strict + Zod | JS puro | Schemas tipados runtime + dev-time |
| License via Cloudflare Worker | Servidor próprio | Latência baixa global; KV + Stripe webhook nativo |
| AGPL-3.0 free + EULA Pro | MIT | Protege contra fork comercial |
| Marketplace dedicado | Adicionar a orchestration | Branding + licensing claros |
| Compose v3.9 (legacy) | Compose Spec moderno | `docker stack deploy` exige v3 legacy |
| Multi-arch image (amd64+arm64) | Só amd64 | VPS ARM (Oracle, Hetzner ARM) cada vez mais comum |
| AsyncLocalStorage para license header | Pass licenseKey arg em toda tool | Plumbing reduzido; tool handlers ficam puros |
| Audit log armazena hashes only | Raw input/output | LGPD compliance; ainda permite forensics |

---

## Diagramas de fluxo

### Fluxo apply_easy com confirm gate

```
Cliente Claude Code
    │
    │ tool_call: apply_easy(jobUrl, confirm=false)
    ▼
MCP server
    │ withInstrumentation: validate → license gate → rate limit
    │ Patchright abre vaga
    │ Preenche form (resume + answers)
    │ Screenshot
    │ INSERT applications (status='preview')
    ▼ retorna {status:"preview", application_id, preview:{...}}
Cliente
    │ Mostra preview ao usuário
    │ Usuário aprova
    │ tool_call: apply_easy(application_id, confirm=true)
    ▼
MCP server
    │ Patchright clica "Submit"
    │ UPDATE applications SET status='submitted'
    ▼ retorna {status:"submitted", application_id}
```

### Fluxo optimize_profile smart pipeline

```
Cliente
  │ tool_call: optimize_profile(profileUrl, targetRole)
  ▼
MCP
  │ profileText set?
  │   YES → skip to LLM
  │   NO →
  │     1. Tavily Extract (if TAVILY_API_KEY)
  │        if isLinkedInAntiScrapePage(rawContent) → fall through
  │     2. Apify scrapeProfile (if APIFY_TOKEN)
  │        if profile.fullName empty → throw EXTERNAL_API_FAIL
  │     3. profileText still empty → VALIDATION_FAIL
  │
  │ invokeLlm(prompt) via OpenRouter (Gemini/Claude)
  │ Parse JSON response
  ▼ return { summaryAnalysis, headlineSuggestion, gaps[], recommendedSkills[], rewriteAbout }
```

### Fluxo cookie refresh (Mode B/C)

```
Operator: /linkedin-cookie-refresh --account-id <id>
  │ Skill opens Chromium via Patchright on operator's machine
  │ Operator logs into LinkedIn, captures cookie set
  ▼
POST /admin/account-cookie {accountId, cookies[], expiresInDays}
  │ Server: encryptCookie(JSON.stringify(cookies)) → BYTEA
  │ Server: UPSERT accounts with cookie_encrypted + cookie_expires_at
  │ Audit: hash of *encrypted blob* (never plaintext)
  ▼ return {accountId, expiresAt}
```
