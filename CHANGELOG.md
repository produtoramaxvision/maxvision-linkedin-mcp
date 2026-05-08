# Changelog

All notable changes to MaxVision LinkedIn MCP. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pending (per `docs/ROADMAP.md`)

- **Sprint 3 deploy:** wrangler deploy + Stripe products + DNS for the
  license worker (code ships in v0.2.0, deployment is operator-side).
- **Sprint 4:** Public landing + Stripe checkout flow + v1.0 release tag.
- **Sprint 5.5:** Tier Agency white-label + multi-tenant cookie pool.
- **Sprint 6:** Polish — Playwright E2E suite, anti-detect tuning,
  documentation videos, monitoring dashboards.

---

## [v0.2.0] — 2026-05-08

### Added

- **Sprint 2 — 6 new MCP tools** registered, bringing total surface to 10
  per blueprint PLAN-A:
  - `list_feed`: read recent activity from /feed.
  - `search_people`: search /search/results/people (Pro tier in Sprint 3).
  - `optimize_profile`: Claude Messages API analysis vs target role.
    Requires `ANTHROPIC_API_KEY` env. Uses claude-haiku-4-5 (cost-conscious).
  - `post_update`: feed post composer with `confirm` gate.
  - `send_message`: DM/InMail with `confirm` gate.
  - `apply_easy`: Easy Apply flow with `confirm` gate. Preview captures
    screening questions; confirm submits up to 5 paginated steps.
- All write surfaces gate behind required `confirm: boolean` (default false →
  dry-run preview). LinkedIn ban-risk surface — mistakes are opt-in only.
- Rate-limit policies tuned per tool: post_update (3 burst / 0.005 refill),
  apply_easy (5 / 0.02), send_message (3 / 0.01), reads moderate.
- Error code union extended: `CONFIG_FAIL`, `EXTERNAL_API_FAIL`,
  `NOT_IMPLEMENTED`, `CONFIRMATION_REQUIRED`.

- **Sprint 3.1 — Cloudflare Worker license server** (`workers/license/`):
  - `POST /v1/check`  — KV lookup, expiry check, revocation status.
  - `POST /v1/issue`  — Stripe webhook → emit `MAXV-{PRO|AGENCY}-{HEX32}`.
  - `POST /v1/revoke` — admin only (`Bearer ADMIN_TOKEN`).
  - Constant-time HMAC-SHA256 Stripe signature verification.
  - KV TTL = expiresInDays + 1 day (auto-cleanup post-expiry).

- **Sprint 3.3 — License gate module** (`src/auth/license.ts`):
  - `gateToolByLicense(toolName, licenseHeader)` — returns null if allowed,
    string reason if blocked.
  - 5-min in-memory cache keyed by license key.
  - Free dev mode: `LICENSE_CHECK_ENABLED` unset → all tools allowed.
  - Pro tools: `apply_easy`, `send_message`, `search_people`, `post_update`.

- **Sprint 5.1+5.2 — Webhook routes + SSE** in `mcp-server/src/http.ts`:
  - `POST /webhooks/job-found`     (n8n inbound, `X-Webhook-Secret` auth).
  - `POST /webhooks/recruiter-msg` (n8n inbound).
  - `GET  /events`                 (SSE — connect event + 30 s heartbeat).
  - All gated by `WEBHOOK_SECRET` env (when unset → 503 webhooks_disabled).

- **Sprint 5.3 — 4 n8n workflow JSONs** in
  `plugins/linkedin-maxvision/n8n-workflows/`:
  - `linkedin-daily-scan.json` — cron 09:00 → search_jobs → Telegram.
  - `linkedin-batch-apply.json` — webhook → apply_easy → Google Sheets log.
  - `linkedin-recruiter-reply.json` — webhook → Claude draft → Telegram review.
  - `linkedin-profile-weekly-audit.json` — cron Mon 08:00 → optimize_profile → Notion.

- **Sprint 5.4 — `/linkedin-setup-n8n` command** that imports the 4 JSONs
  into a target n8n instance via REST API, validates access first, lists
  required env vars + credentials, activates after configuration.

---

## [v0.1.5.6] — 2026-05-08

### Fixed

- `get_job_details` selectors aligned to LinkedIn server-side guest layout
  (`pageKey=d_jobs_guest_details`). Switched primary selectors:
  - title → `h1.top-card-layout__title`
  - company → `.topcard__flavor[0]` / `a.topcard__org-name-link`
  - location → `.topcard__flavor--bullet`
  - posted age → `.posted-time-ago__text`
  - applicants count → `.num-applicants__caption`
  - `waitForSelector` now uses `state: 'attached'` + 30 s timeout.
- Validated extraction against /jobs/view/4407946949 (Tinder, Backend Engineer
  Intern): full title/company/location/posted/applicants/criteria + 4795-char
  description.

### Known limitations

- `get_profile` (`/in/<slug>`) hits LinkedIn's `auth_wall_desktop_profile`
  server-side even with full multi-cookie auth. Profile pages need Sprint 2
  LinkedIn voyager API path (see Pending).

---

## [v0.1.5.5] — 2026-05-08

### Added

- **Multi-cookie injection** (Sprint 1.5.4): capture-cookie ships ALL
  linkedin.com cookies (li_at + JSESSIONID + bcookie + bscookie + lidc + ...)
  as a JSON array. Server hydrates the full set on context creation.
  Bypasses LinkedIn 2026 anti-bot redirect loop (`ERR_TOO_MANY_REDIRECTS`).
- `mcp-server/scripts/inspect-cookies.ts` — list linkedin.com cookies in the
  capture profile (names + lengths only, no values).
- Backwards-compat: legacy single-`cookieValue` blobs auto-wrapped to a
  one-element array on hydration.

### Fixed

- `jobspy_runner.py` coerces pandas NaN → None and uses
  `json.dumps(allow_nan=False)` so the TS caller's `JSON.parse` no longer
  chokes on `NaN` literals.

### E2E validation

- `search_jobs sources=linkedin accountId=sandbox-2` returned 3 real jobs
  (Tinder Backend Engineer Intern, Airbnb Software Engineer New Grad SF & SEA).
- `search_jobs sources=jobspy accountId=sandbox-2` returned 3 real BR jobs
  (Philips Safety Risk Engineer, Amazon SDE III SP & MG).

---

## [v0.1.5.3] — 2026-05-08

### Changed

- **Patchright server config aligned to upstream Best Practice:** switched
  `chromium.launch + browser.newContext` → `chromium.launchPersistentContext`
  per accountId; profile dir at `${PROFILE_BASE_DIR}/<accountId>/`.
- Removed custom `userAgent` and `viewport` overrides (Patchright README
  explicitly forbids these).
- `headless: false` + `xvfb-run --auto-servernum` wrapper in the runtime
  CMD so the server context renders on a virtual X display (LinkedIn 2026
  detects HeadlessChrome via JA3/HTTP2 fingerprint).
- Stack: mount `mcp_profiles_data` named volume on `/data/profiles` so per-
  account state survives container restarts. CPU 1.0→1.5 / mem 512M→1024M
  (Chromium real ~250-400 MB).

---

## [v0.1.5.2] — 2026-05-08

### Fixed

- `capture-cookie` validator switched from brittle `nav.global-nav`
  `waitForSelector` to URL-redirect check only (`/authwall|/uas/login|
  /checkpoint|/login`). LinkedIn DOM mutates monthly; URL contracts are
  stable.
- `linkedin-jobs` scraper switched to `state: 'attached'` and added
  `div.base-card`, `li.job-card-container` fallbacks (validated 60 cards
  against authenticated DOM via inspect utility).
- `jobspy.ts` country `BR` → `brazil` (JobSpy expects full country names).
- Added `scripts/inspect-jobs-dom.ts` utility for DOM probing against the
  authenticated capture profile.

---

## [v0.1.5.1] — 2026-05-08

### Added

- **`/linkedin-cookie-refresh` automation.** New plugin command + standalone
  `mcp-server/scripts/capture-cookie.ts` CLI:
  1. Spawns Patchright headed Chrome to `linkedin.com/login`.
  2. User logs in manually (credentials never automated).
  3. Polls cookies, validates session via `/feed`, POSTs to server.
  4. Server encrypts AES-256-GCM and persists in `accounts.cookie_encrypted`.
- `POST /admin/account-cookie` admin endpoint (Bearer auth, Zod validation,
  audit_log SHA256[:16] of the encrypted blob — never plaintext).
- Auto-migrate Drizzle schema on server startup (10-attempt exponential
  backoff while Postgres is booting).
- Design spec at `docs/superpowers/specs/2026-05-08-linkedin-cookie-capture-design.md`.

### Security

- Cookie plaintext lives in memory during the single HTTPS POST (~100 ms over
  Brazilian links), never on disk on the user's laptop.
- Server holds plaintext inside the Hono request handler scope only — released
  after `encryptCookie()` returns.
- Audit records `tool='admin.cookie_refresh'` + SHA256[:16] of the encrypted
  blob; never the raw cookie or plaintext value.

---

## [v0.1.0-sprint1] — 2026-05-07

### Added

- **Sprint 1 — MCP core MVP shipped on VPS HTTP.**
- 4 MCP tools: `search_jobs`, `get_profile`, `get_job_details`,
  `track_application`.
- HTTP transport via Hono + `@hono/node-server` + `StreamableHTTPServerTransport`.
- API key auth (`MCP_API_KEYS` allowlist; Bearer/X-Api-Key).
- Postgres 16 + Drizzle migrations: 9 tables (accounts, jobs_cache,
  profiles_cache, applications, messages, audit_log, captcha_events,
  rate_limit_buckets, license_keys).
- Redis 7 token-bucket rate limit (per accountId, sliding window).
- Browser pool with Patchright (real LinkedIn navigation, no mocks).
- Python `jobspy_runner.py` subprocess wrapper for Indeed/Glassdoor/
  ZipRecruiter cross-board search (Sprint 1.5).
- AES-256-GCM cookie encryption (`auth/cookies.ts`).
- Plugin `linkedin-maxvision`: 7 commands, 4 skills, 4 subagents, 3 hooks.
- Multi-arch Docker image (linux/amd64 + linux/arm64) on GHCR.
- Portainer Swarm stack with Traefik 3.4 + letsencryptresolver.
- Domain `linkedin-mcp.produtoramaxvision.com.br`.
