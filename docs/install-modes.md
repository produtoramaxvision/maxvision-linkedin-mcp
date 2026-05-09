# Install modes — MaxVision LinkedIn MCP

Choose how `get_profile`, `list_feed`, `search_people` route LinkedIn requests.
Both modes are operator-side switches; the plugin client (Claude Code) is
identical in either mode.

---

## Mode A — Apify provider (recommended, default)

Stack envs:

```yaml
APIFY_TOKEN: <apify_api_xxx>
APIFY_LINKEDIN_PROFILE_ACTOR: harvestapi~linkedin-profile-scraper       # default
APIFY_LINKEDIN_PROFILE_INCLUDE_EMAIL: "true"                            # default
APIFY_LINKEDIN_PEOPLE_SEARCH_ACTOR: harvestapi~linkedin-profile-search  # default
SCRAPING_BACKEND: patchright
PATCHRIGHT_PROXY_URL: http://brd.superproxy.io:33335                    # BD Web Unlocker
PATCHRIGHT_PROXY_USERNAME: brd-customer-...-zone-maxv_linkedin_unlocker
PATCHRIGHT_PROXY_PASSWORD: <bd unlocker zone password>
```

How it works:

- `get_profile` calls Apify `harvestapi/linkedin-profile-scraper` (single
  HTTP request, returns 50+ fields including skills with endorsement counts,
  certifications, projects, languages, volunteer, honors, plus optional email
  via $4 base + $6 lookup adaptive cost).
- `search_people` calls Apify `harvestapi/linkedin-profile-search` (filter by
  keywords, current company, location; $0.10/page ≈ $0.004/profile).
- `search_jobs`, `get_job_details` route through Patchright + BrightData Web
  Unlocker proxy (handles auth + CAPTCHA + JS render internally; $2.50/CPM).

Pros: zero cookie management; provider handles auth, IP rotation, anti-bot.
Cons: per-request cost ($4-10/1k profiles, $0.004/search-result).

One-time setup:

1. Create Apify account → https://console.apify.com/sign-up ($5 free trial)
2. Get token → https://console.apify.com/account/integrations
3. Approve actor permissions (one-time per actor):
   - https://console.apify.com/actors/LpVuK3Zozwuipa5bp?approvePermissions=true
   - https://console.apify.com/actors/M2FMdjRVeF1HPGFcc?approvePermissions=true
4. Create BrightData Web Unlocker zone → enable Premium domains (LinkedIn
   is in the premium-blocked list) → set `PATCHRIGHT_PROXY_URL` env.
5. Deploy stack.

---

## Mode B — Cookie + local browser (openclaw-style, no per-request cost)

Stack envs:

```yaml
SCRAPING_BACKEND: patchright
# (Apify and BD Scraper API tokens unset — fall through to HTML cheerio path)
```

Plus per-account: a freshly-captured `li_at` cookie set hydrated into the
encrypted accounts table via the `/linkedin-cookie-refresh` skill.

How it works:

- All tools route through Patchright local Chromium.
- BrowserPool launches `chromium.launchPersistentContext` per account,
  hydrating the encrypted cookie set on each acquire.
- LinkedIn pages render via cheerio HTML extraction.
- For `/feed`, `/search/results/people`, `/in/<slug>`, the cookies must be
  fresh — LinkedIn invalidates session if the IP+UA combination diverges from
  capture context, so plan a refresh cadence (typically 7d before LinkedIn
  rotation).

Pros: zero per-request cost; full HTML control; works for tools where the
provider catalog has no equivalent (e.g. `optimize_profile` LLM, or future
custom DOM-based tools).
Cons: cookie refresh pipeline is operator responsibility. LinkedIn's session
invalidation can fire mid-day (validated empirically) so an automated health
check + alert flow is required for production reliability.

Recommended cookie refresh cadence:

1. Run `/linkedin-cookie-refresh --account-id <id>` from Claude Code.
2. The skill opens a Chromium window via Patchright on the operator's
   machine, navigates to LinkedIn login, waits for cookie capture, encrypts
   payload, and POSTs to `https://linkedin-mcp.<your-domain>/admin/account-cookie`.
3. Schedule a refresh every 5-7 days (cron or manual trigger). LinkedIn
   typically invalidates after 7-30d but sandbox/automation flags shorten
   this to 1-2d.

Sprint 6.9 (planned) will add a server-side health check that probes
`/feed` periodically per account and flags `needs_refresh` in the accounts
table — the plugin will surface this status before tool execution and
prompt the operator to run the refresh skill.

---

## Mode C — Hybrid (operators with both Apify and valid cookies)

Both Mode A envs AND a fresh cookie set per account. The server prefers
Apify (Mode A) when `APIFY_TOKEN` is present and falls back to cookie+HTML
(Mode B) when Apify fails. Use this for maximum reliability if budget allows.

---

## Which mode for which use case?

| Use case | Recommended mode |
|---|---|
| Production B2B SaaS (paying clients, predictable cost OK) | A |
| Personal/dev sandbox with one trusted LinkedIn account | B |
| Agency tier multi-account ops with tight margins | C |
| Self-hosted appliance (no external API allowed) | B |

Switching modes is a single stack env change — no code redeploy needed.
