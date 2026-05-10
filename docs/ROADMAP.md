# Roadmap — MaxVision LinkedIn MCP

Sprint history + future direction. Status as of v0.1.0 public launch (2026-05-10).

---

## Status snapshot

| Sprint | Status | Outcome |
|---|---|---|
| Sprint 0 — Setup | ✅ done | Repos, DNS, CI, branch protection, GHCR, landing scaffold |
| Sprint 1 — MCP core MVP | ✅ done | 4 tools shipped + DB + rate limit + auth |
| Sprint 2 — Tools expansion | ✅ done | +6 tools (10 total per PLAN-A) |
| Sprint 3 — License + multi-account | ✅ done | License gate via CF Worker + per-account cookie pool |
| Sprint 4 — Release v1.0 | ⚠️ partial | Landing live, releases tagged, Stripe deferred |
| Sprint 5 — n8n hybrid Variant B | ✅ done | 4 workflows + `/linkedin-setup-n8n` |
| Sprint 6 — Polishing | ⚠️ partial | v0.13.x bug fixes done; tutorial videos pending |
| Sprint 7 — Apify+BD backbone (NEW) | ✅ done | +6 tools (companies + activity + engagement); switch from cookie+browser to Apify Mode A default |

Total tools: **16** (10 PLAN-A + 6 Sprint 7).

Latest published version: **v0.1.0** (2026-05-10) — Public launch. 16 tools, Apify+BD backbone, Stripe live.

---

## Sprint 0 — Setup ✅

Done 2026-05-08. Deliverables in `sprint0-deliverables/`:

- Repos `produtoramaxvision/maxvision-linkedin-mcp` (public) + `…-mcp-pro` (private)
- DNS: `linkedin.produtoramaxvision.com.br`, `linkedin-mcp.produtoramaxvision.com.br`, `license.linkedin.produtoramaxvision.com.br`
- Branch protection on `main` + `homolog`
- GitHub Actions: `ci.yml`, `release.yml`, `landing-deploy.yml`, `worker-deploy.yml`
- Landing scaffold (CF Pages + static HTML) — LIVE at `https://linkedin.produtoramaxvision.com.br`
- License server scaffold (CF Worker) — wired Sprint 3

Marketing items NOT done (intentional, low-priority):

- Stripe products + live mode (deferred; activate when first paying customer signs up)
- Vídeo demo + LinkedIn announcement post + awesome-* submissions

---

## Sprint 1 — MCP core MVP ✅

Done 2026-05-08. Tools shipped: `search_jobs`, `get_profile`, `get_job_details`, `track_application`. Stack: Node 20 + TS strict + Hono + `@modelcontextprotocol/sdk` + Patchright + Drizzle/Postgres + ioredis. Multi-stage Dockerfile (Node + Python venv + Patchright Chromium).

Build sequence detail: see `docs/historical/sprint1-PLAN.md` (archived).

---

## Sprint 2 — Tools expansion ✅

Done 2026-05-08. Added: `apply_easy`, `send_message`, `optimize_profile`, `list_feed`, `post_update`, `search_people`. Hard `confirm_required=true` default on write tools (apply/message/post). Drizzle migrations for `applications`, `messages_drafts`.

---

## Sprint 3 — License + multi-account ✅

Done 2026-05-09. License gate via Cloudflare Worker at `license.linkedin.produtoramaxvision.com.br`. AsyncLocalStorage propagates `X-MaxVision-License` header from `/mcp` POST to tool handlers via `getRequestContext()`. Pro tools (`apply_easy`, `send_message`, `post_update`, `search_people`) gated.

Multi-account: per-account cookie pool (Mode B), `/linkedin-cookie-refresh` capture flow ships fresh cookies via `POST /admin/account-cookie` (encrypted AES-256-GCM at rest in `accounts.cookie_encrypted`).

---

## Sprint 4 — Release v1.0 ⚠️ partial

Done:

- Landing page LIVE (CF Pages)
- CHANGELOG.md maintained
- Releases tagged through v0.13.1 (older tags v0.13.2-v0.13.13 not backfilled — current = `homolog`/`main` HEAD `0b6d515` + onwards)
- License server live (CF Worker)
- License-deploy-checklist.md drafted

Pending (low priority):

- Stripe products in live mode (test mode wired; switch when paying customer)
- Vídeo demo 3min
- Post anúncio LinkedIn
- Submissões a awesome-claude-code, awesome-mcp-servers, Smithery.ai, Glama.ai, MCP.so

---

## Sprint 5 — n8n hybrid Variant B ✅

Done. Workflows in `plugins/linkedin-maxvision/n8n-workflows/`:

- `linkedin-daily-scan.json` — cron-triggered job scan + Telegram alert
- `linkedin-batch-apply.json` — webhook-triggered batch Easy Apply
- `linkedin-recruiter-reply.json` — DM auto-reply with human approval gate
- `linkedin-profile-weekly-audit.json` — weekly audit + digest

Setup automation: `/linkedin-setup-n8n --instance ... --api-key ...` (Pro tier).

Webhook endpoints in `mcp-server/src/http.ts`: `POST /webhooks/job-found`, `POST /webhooks/recruiter-msg`, `GET /events` (SSE). Authenticated via `WEBHOOK_SECRET` env.

Agency-tier workflows (`linkedin-multi-account-pool`, `linkedin-team-sync`) DEFERRED — no Agency customer to date.

---

## Sprint 6 — Polishing ⚠️ partial

Done:

- v0.13.x bug-fix cycle (BUG 1-5 from prior validation, default accountId, URL transform, license, URN encoding, search_companies field name)
- `list_applications` tool added (Sprint 1.5 close-out)
- `optimize_profile` smart pipeline (v0.13.11-13) — Tavily → Apify fallback with auth-wall + empty-profile guards
- Apify FREE limit detection with upgrade hint
- Easy Apply DOM selector i18n expansion (PT/IT/ES/FR/DE)
- `get_account_owner` 4 attempts → DROPPED (voyager API HTML response from datacenter ASN; Apify actors don't accept user cookies — confirmed via input-schema docs)

Pending:

- Tutorial videos (setup, primeiro apply, profile audit, n8n integration)
- Anti-detect tuning based on captcha logs (no captchas observed in 30d via Apify backbone)
- Performance: index audit on Postgres queries

---

## Sprint 7 — Apify+BD backbone (NEW, post-PLAN-A) ✅

Done 2026-05-09. Pivot reason: Patchright on flagged datacenter ASN hits LinkedIn authwall on protected pages (`/in/`, `/feed/`, `/search/people`). Switched default backend to **Apify harvestapi actors + BrightData Web Unlocker proxy** for Patchright fallback (Mode A in `docs/install-modes.md`).

New tools (6):

- `get_company_info` — `harvestapi/linkedin-company-detail`
- `search_companies` — `harvestapi/linkedin-company-search` (`searchQuery` + flatten helpers for industry/locations/size)
- `find_company_employees` — Apify with URN case preservation (BUG 4 fix v0.13.2)
- `get_profile_activity` — recent posts + reactions for warm-lead signals
- `monitor_post_engagement` — reactions + comments for engagement insights
- `list_applications` — local DB read paired with `track_application`

Backbone changes:

- `src/scrapers/apify-helper.ts` — async `/runs` flow + `statusMessage` parsing (FREE limit detection)
- `PATCHRIGHT_PROXY_URL` env wired to `chromium.launch({ proxy: ... })` for BD Unlocker passthrough
- `docs/install-modes.md` documents A (Apify) vs B (cookie+browser) vs C (hybrid)

Total tools: 10 (PLAN-A) + 6 (Sprint 7) = **16 LIVE**.

---

## Next steps (no committed sprint)

Bug fixes + ops as needed. No major feature push planned. Marketing items (Sprint 4 pending) become priority once a paying customer signs up.

Possible future sprints (not committed):

- **Sprint 8 — Companion daemon** (per `docs/tunnel-architectures.md` Option B) — local Patchright runner on user's IP, eliminates BD Unlocker dependency for Pro tier
- **Sprint 9 — Stripe live mode + email automation** — Resend/Loops integration for license key delivery; auto-renewal via webhook `invoice.paid`
- **Sprint 10 — Marketing kickoff** — vídeo demo, awesome-* submissions, LinkedIn announcement, beta user case studies

---

## Backlog post-v1.0

- **v2.0:** Cloud-hosted MCP for clients without VPS (multi-tenant isolation via license key)
- **v2.1:** VSCode extension wrapping the same MCP
- **v2.2:** `maxvision-twitter-suite` (X/Twitter automation, same architectural pattern)
- **v2.3:** `maxvision-instagram-suite`
- **v3.0:** Standalone web dashboard (no Claude Code dependency)

---

## Risks + mitigations

| Risk | Probability | Mitigation |
|---|---|---|
| Apify actor breaking change | Medium | Multiple actors per surface; quick swap via `APIFY_LINKEDIN_*_ACTOR` env |
| BD Unlocker cost spike | Low | Per-request cost capped via `maxTotalChargeUsd`; fallback to Mode B for high-volume tenants |
| LinkedIn DOM change (Mode B residual) | Medium | Mode A bypass; Mode B selector fallbacks `[data-test=...] OR [aria-label=...] OR :has-text(...)` |
| Cookie expiration mid-session (Mode B/C) | Medium | Health check + `/linkedin-cookie-refresh` capture flow; alert via webhook |
| LinkedIn ToS enforcement against MaxVision | Low | Disclaimer in landing + setup; product framed as personal assistant for own account; rate-limited per humanlike patterns |
| License server outage | Low | License cached 1h in `license_cache` table; fail-open during outage with warn log |
| Apify FREE plan limit silent throttle | Low | `apify-helper.ts` parses `statusMessage` for "free user run limit"; throws `UPSTREAM_FAIL` with upgrade hint |

---

## Marcos / Gates

| Marco | Critério | Status |
|---|---|---|
| **MVP interno** | Buscar vaga + retornar lista no Claude Code | ✅ Sprint 1 |
| **Beta privado** | 16 tools funcionando | ✅ Sprint 7 |
| **Public release v1.0** | Landing + Stripe live + 1ª venda | ⚠️ Stripe deferred |
| **v1.5 (Agency)** | n8n workflows multi-tenant | ⚠️ partial (Pro workflows done; Agency deferred) |
| **Estabilização** | <1% crash rate, <5% captcha rate | ✅ (Apify backbone = ~0% captcha) |
