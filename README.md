# MaxVision LinkedIn Suite

LinkedIn automation for Claude Code: **16 MCP tools** for job search, applications, profile audit, outreach, company intelligence, and engagement monitoring.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.13.13-green.svg)](CHANGELOG.md)
[![Status](https://img.shields.io/badge/status-LIVE-brightgreen.svg)](https://linkedin.produtoramaxvision.com.br)

> **Status:** Production. v0.13.13 LIVE at `https://linkedin-mcp.produtoramaxvision.com.br/mcp`. Free tier active; Pro/Agency tiers gated via `MAXVISION_LICENSE` header.

---

## What you get

A Claude Code plugin (`linkedin-maxvision`) that connects to a hosted MCP server (Node 20 + TypeScript + Drizzle + Postgres + Redis). The server uses an **Apify + BrightData Web Unlocker** backbone — no cookie management on the user side.

### 16 MCP tools

| Surface | Tools |
|---|---|
| **Jobs** | `search_jobs`, `get_job_details`, `apply_easy` (Pro) |
| **Profiles** | `get_profile`, `optimize_profile` (smart pipeline Tavily → Apify), `get_profile_activity` |
| **People search** | `search_people` (Pro) |
| **Companies** | `get_company_info`, `search_companies`, `find_company_employees` |
| **Feed & posts** | `list_feed`, `post_update` (Pro), `monitor_post_engagement` |
| **Messaging** | `send_message` (Pro) |
| **Tracking** | `track_application`, `list_applications` |

### 8 slash commands

`/linkedin-find-jobs`, `/linkedin-job-details`, `/linkedin-profile`, `/linkedin-applications`, `/linkedin-track`, `/linkedin-status`, `/linkedin-cookie-refresh`, `/linkedin-setup-n8n`

### 4 specialized agents

`linkedin-job-hunter`, `linkedin-resume-tailor`, `linkedin-application-tracker`, `linkedin-anti-detect-monitor`

### 6 skills

`cover-letter-craft`, `interview-prep-pt-br`, `lgpd-gdpr-handling`, `linkedin-anti-detect-rules`, `linkedin-tos-compliance`, `resume-tailoring`

### 4 n8n workflows (hybrid Variant B)

`linkedin-daily-scan`, `linkedin-batch-apply`, `linkedin-recruiter-reply`, `linkedin-profile-weekly-audit`

---

## Quick install

```bash
# 1. Get an API key
#    → email produtoramaxvision@gmail.com (Free tier — limited rate during beta)
#    You'll receive: mxv_<48hex>

# 2. Set env var (one-time)
#    Windows PowerShell:
[Environment]::SetEnvironmentVariable("MAXVISION_API_KEY", "mxv_xxxx", "User")
#    macOS/Linux:
echo 'export MAXVISION_API_KEY=mxv_xxxx' >> ~/.zshrc

# 3. Install the plugin (Claude Code)
claude /plugin install produtoramaxvision/maxvision-linkedin-mcp

# 4. Restart Claude Code → plugin auto-connects to the hosted MCP server

# 5. Verify
/linkedin-status
```

For Pro tier (`apply_easy`, `send_message`, `post_update`, `search_people`):
```bash
[Environment]::SetEnvironmentVariable("MAXVISION_LICENSE", "MAXV-PRO-...", "User")
```

License purchase: <https://linkedin.produtoramaxvision.com.br/pricing>

---

## Repository layout

```
maxvision-linkedin-mcp/
├── .claude-plugin/
│   └── marketplace.json              # Marketplace registration
├── plugins/linkedin-maxvision/       # Claude Code plugin
│   ├── .claude-plugin/plugin.json
│   ├── commands/                     # 8 slash commands
│   ├── agents/                       # 4 specialized agents
│   ├── skills/                       # 6 skills
│   ├── n8n-workflows/                # 4 hybrid workflows
│   └── hooks/                        # SessionStart + PreToolUse + PostToolUse
├── mcp-server/                       # Node 20 + TS + Drizzle + Postgres
│   ├── src/tools/                    # 16 MCP tools
│   ├── src/scrapers/                 # Apify, LinkedIn jobs/profile, Tavily
│   ├── src/auth/                     # API key, license gate, cookie crypto
│   ├── src/browser/                  # Patchright pool + BD Unlocker proxy
│   ├── src/db/                       # Drizzle schema + repos
│   ├── src/rate-limit/               # Redis token bucket
│   ├── docker/                       # Compose, Swarm, Portainer templates
│   └── drizzle/                      # SQL migrations
├── workers/license/                  # Cloudflare Worker license server
├── landing/                          # Static landing (CF Pages)
├── sprint0-deliverables/             # Live deploy reference scaffolds
├── docs/                             # Architecture, install, roadmap, risks
│   ├── ARCHITECTURE.md
│   ├── ROADMAP.md
│   ├── install-modes.md              # Apify (A) vs cookie+browser (B) vs hybrid (C)
│   ├── scraping-backends.md          # Backend rationale + 2026 LinkedIn reality
│   ├── setup-claude-code-only.md     # Variant A walkthrough
│   ├── setup-hybrid-n8n.md           # Variant B walkthrough
│   ├── deploy-docker-swarm.md        # Three deploy modes
│   ├── license-deploy-checklist.md   # CF Worker + Stripe runbook
│   ├── tunnel-architectures.md       # Companion daemon options (Sprint 7+)
│   ├── RISKS-COMPLIANCE.md           # ToS, GDPR/LGPD, anti-detect
│   └── historical/                   # Pre-implementation blueprints (audit only)
├── CHANGELOG.md
├── LICENSE                           # AGPL-3.0-or-later
└── README.md                         # this file
```

---

## Tiers

| Feature | Free | Pro | Agency |
|---|---|---|---|
| Job search + tracking | ✓ | ✓ | ✓ |
| Profile + company lookup | ✓ | ✓ | ✓ |
| `optimize_profile` (Claude/Gemini analysis) | ✓ | ✓ | ✓ |
| Easy Apply automation | — | ✓ | ✓ |
| DM/InMail (with confirm gate) | — | ✓ | ✓ |
| Post creation | — | ✓ | ✓ |
| People search | — | ✓ | ✓ |
| Multi-account pool | — | up to 3 | unlimited |
| Sales Navigator surfaces | — | ✓ | ✓ |
| n8n workflow integration | — | ✓ | ✓ |
| White-label | — | — | ✓ |

Pricing: <https://linkedin.produtoramaxvision.com.br/pricing>

---

## Self-host (advanced)

The MCP server image is published on GHCR: `ghcr.io/produtoramaxvision/linkedin-maxvision-mcp:0.13.13`. Three deploy modes documented in [docs/deploy-docker-swarm.md](docs/deploy-docker-swarm.md):

- **Docker Compose** standalone (single host)
- **Docker Swarm CLI** (multi-node, rolling updates)
- **Portainer Stack** (UI + GitOps)

Required env: `APIFY_TOKEN`, `PATCHRIGHT_PROXY_URL` (BD Unlocker), `DATABASE_URL`, `REDIS_URL`, `MASTER_KEY`, `MCP_API_KEYS`. Optional: `TAVILY_API_KEY`, `LICENSE_CHECK_ENABLED`, `LICENSE_SERVER_URL`.

Backend modes: see [docs/install-modes.md](docs/install-modes.md).

---

## Compliance

- **LinkedIn ToS:** Tools only access data available to your authenticated session. Hard `confirm_required=true` default on `apply_easy`, `send_message`, `post_update`. See [docs/RISKS-COMPLIANCE.md](docs/RISKS-COMPLIANCE.md) and [plugins/linkedin-maxvision/skills/linkedin-tos-compliance/SKILL.md](plugins/linkedin-maxvision/skills/linkedin-tos-compliance/SKILL.md).
- **LGPD/GDPR:** Cookies AES-256-GCM encrypted at rest; audit log stores SHA-256 hashes only (never raw input/output).
- **Rate limit:** Token bucket per account (`search`/`profile`/`apply`/`message`/`post` actions, configurable in `mcp-server/src/rate-limit/strategy.ts`).

---

## License

- **Free tier:** AGPL-3.0-or-later (see [LICENSE](LICENSE))
- **Pro/Agency tier:** Proprietary EULA validated at runtime via license server

Commercial license available — contact `produtoramaxvision@gmail.com`.

---

## Links

- **Homepage:** <https://linkedin.produtoramaxvision.com.br>
- **MCP endpoint:** `https://linkedin-mcp.produtoramaxvision.com.br/mcp`
- **Issues:** <https://github.com/produtoramaxvision/maxvision-linkedin-mcp/issues>
- **Changelog:** [CHANGELOG.md](CHANGELOG.md)
- **Roadmap:** [docs/ROADMAP.md](docs/ROADMAP.md)
- **Email:** produtoramaxvision@gmail.com
