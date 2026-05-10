# MaxVision LinkedIn Suite — Claude Code plugin

LinkedIn automation: 16 MCP tools, 8 commands, 4 agents, 6 skills, 4 n8n workflows.

> **Status:** v0.1.0 LIVE at `https://linkedin-mcp.produtoramaxvision.com.br/mcp`.

## Install

1. Get an API key
   ```
   Email produtoramaxvision@gmail.com to request an API key (Free tier — limited rate during beta).
   You'll receive: mxv_<48hex>
   ```

2. Set the key as env var (one-time)
   - **Windows PowerShell:**
     ```powershell
     [Environment]::SetEnvironmentVariable("MAXVISION_API_KEY", "mxv_xxxx", "User")
     ```
     (close + reopen terminal after)
   - **macOS/Linux:**
     ```bash
     echo 'export MAXVISION_API_KEY=mxv_xxxx' >> ~/.zshrc
     source ~/.zshrc
     ```

3. (Optional) Pro tier license
   ```powershell
   [Environment]::SetEnvironmentVariable("MAXVISION_LICENSE", "MAXV-PRO-...", "User")
   ```

4. Install the plugin
   ```bash
   claude /plugin install produtoramaxvision/maxvision-linkedin-mcp
   ```

5. Restart Claude Code → plugin auto-connects to the hosted MCP

6. Verify
   ```
   /linkedin-status
   ```
   Should report rate-limit + account health.

## What it does — 16 MCP tools

**Free tier (no license required):**
- `search_jobs` — LinkedIn + Indeed/Glassdoor/ZipRecruiter via JobSpy. Cached 60min.
- `get_job_details` — Single job by URL. Cached 60min.
- `get_profile` — Apify harvestapi profile scraper (50+ fields). Cached 24h.
- `get_profile_activity` — Recent posts + reactions for warm-lead signals.
- `optimize_profile` — Smart pipeline: manual text → Tavily Extract → Apify fallback → Claude/Gemini analysis.
- `list_feed` — Recent items from the LinkedIn home feed.
- `get_company_info` — Detailed company info (size, industry, specialties, HQ).
- `search_companies` — Filter by keywords + industry + location + size.
- `find_company_employees` — List employees with optional title/location filters.
- `monitor_post_engagement` — Reactions + comments for engagement insights.
- `track_application` — Record application in the local tracker.
- `list_applications` — List tracked applications by status.

**Pro tier (requires `MAXVISION_LICENSE`):**
- `apply_easy` — Submit Easy Apply (`confirm=true` to submit; `confirm=false` returns preview).
- `send_message` — DM/InMail with preview/confirm gate.
- `post_update` — Create feed post with preview/confirm gate.
- `search_people` — Filter people search via Apify.

## 8 slash commands

| Command | Purpose |
|---|---|
| `/linkedin-find-jobs` | Search jobs with filters (replaces planned `/linkedin-scan`) |
| `/linkedin-job-details` | Fetch single job by URL |
| `/linkedin-profile` | Lookup a LinkedIn profile |
| `/linkedin-applications` | List tracked applications |
| `/linkedin-track` | Record application status update |
| `/linkedin-status` | Account health + rate-limit snapshot |
| `/linkedin-cookie-refresh` | Open Chromium for fresh cookie capture |
| `/linkedin-setup-n8n` | Import 4 n8n workflows + config (Pro tier) |

## 4 specialized agents

Auto-invoke based on user intent:

- `linkedin-job-hunter` — orchestrates full search → research → track funnel
- `linkedin-resume-tailor` — ATS-optimizes resume per job description
- `linkedin-application-tracker` — pipeline manager for tracked applications
- `linkedin-anti-detect-monitor` — captcha/cookie/rate-limit health watcher

## 6 skills

`cover-letter-craft`, `interview-prep-pt-br`, `lgpd-gdpr-handling`, `linkedin-anti-detect-rules`, `linkedin-tos-compliance`, `resume-tailoring`.

## 4 n8n workflows (hybrid Variant B)

Available via `/linkedin-setup-n8n` (Pro tier):
- `linkedin-daily-scan.json` — cron-triggered job scan + Telegram alert
- `linkedin-batch-apply.json` — webhook-triggered batch Easy Apply
- `linkedin-recruiter-reply.json` — DM auto-reply with human approval gate
- `linkedin-profile-weekly-audit.json` — weekly profile audit + digest

## Tiers

| Tier | License | Pricing |
|---|---|---|
| **Free** | none required | rate-limited, all read tools, no write surface |
| **Pro** | `MAXV-PRO-...` | unlocks `apply_easy`, `send_message`, `post_update`, `search_people`, multi-account pool, n8n workflows |
| **Agency** | `MAXV-AGENCY-...` | + multi-tenant, white-label, ilimitado contas |

Pricing: <https://linkedin.produtoramaxvision.com.br/pricing>

## ToS + Privacy

- LinkedIn ToS-compliant: Apify+BD backbone uses provider-managed sessions; no user cookie injection required for default Mode A
- LGPD/GDPR-aware: cookies AES-256-GCM at rest, audit log SHA-256 hashes only
- See [skills/linkedin-tos-compliance/SKILL.md](skills/linkedin-tos-compliance/SKILL.md) and [skills/lgpd-gdpr-handling/SKILL.md](skills/lgpd-gdpr-handling/SKILL.md)

## License

AGPL-3.0 (Free tier). Pro/Agency: proprietary EULA enforced via license server.

## Links

- Homepage: https://linkedin.produtoramaxvision.com.br
- MCP endpoint: https://linkedin-mcp.produtoramaxvision.com.br/mcp
- Issues: https://github.com/produtoramaxvision/maxvision-linkedin-mcp/issues
- Email: produtoramaxvision@gmail.com
