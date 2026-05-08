# MaxVision LinkedIn Suite

LinkedIn automation for Claude Code: search jobs, fetch profiles, track applications.

## Install (Sprint 1 — VPS managed)

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

3. Install the plugin
   ```bash
   claude /plugin install produtoramaxvision/maxvision-linkedin-mcp
   ```
   (or via marketplace UI when published)

4. Restart Claude Code → plugin connects to `https://linkedin-mcp.produtoramaxvision.com.br/mcp` automatically

5. Verify
   ```bash
   /linkedin-status
   ```
   Should report rate-limit + account health.

## What it does

4 MCP tools (Sprint 1):
- `search_jobs` — LinkedIn + Indeed/Glassdoor/ZipRecruiter via JobSpy. Cached 60min.
- `get_profile` — Fetch LinkedIn profile by URL. Cached 24h.
- `get_job_details` — Single job by URL. Cached 60min.
- `track_application` — DB-backed application tracker.

7 slash commands wrap the tools (see `/linkedin-find-jobs`, `/linkedin-job-details`, `/linkedin-profile`, `/linkedin-track`, `/linkedin-applications`, `/linkedin-status`, `/linkedin-cookie-refresh`).

4 specialized agents (auto-invoke based on user intent):
- `linkedin-job-hunter` — orchestrates full search → research → track funnel
- `linkedin-resume-tailor` — ATS-optimizes resume per job description
- `linkedin-application-tracker` — pipeline manager
- `linkedin-anti-detect-monitor` — account health watcher

## Tier (Sprint 1 = beta, all Free)

- **Free** (Sprint 1): rate-limited, all 4 tools, no DM (Sprint 2)
- **Pro** (Sprint 3): outreach DM with approval gate, custom resume templates, no rate limit
- **Agency** (Sprint 3): multi-account pool, bulk apply, white-label

Pro/Agency upgrade: TBD post Sprint 3 (Stripe integration).

## ToS + Privacy

- LinkedIn ToS-compliant: only uses authenticated cookie + public-page scraping
- LGPD/GDPR-aware: cookies AES-256-GCM at rest, audit log SHA-256 hashes only
- See [skills/linkedin-tos-compliance/SKILL.md](skills/linkedin-tos-compliance/SKILL.md) and [skills/lgpd-gdpr-handling/SKILL.md](skills/lgpd-gdpr-handling/SKILL.md)

## License

AGPL-3.0 (Free tier). Pro/Agency: proprietary EULA (Sprint 3).

## Links

- Homepage: https://linkedin.produtoramaxvision.com.br
- Issues: https://github.com/produtoramaxvision/maxvision-linkedin-mcp/issues
- Email: produtoramaxvision@gmail.com
