# Scraping Backends — LinkedIn 2026 Production Reality

This doc explains why server-side scraping of LinkedIn protected pages
(`/in/<slug>`, `/feed`, `/search/results/people`) hits authwall on our VPS
and what production-grade options exist.

---

## Why authwall happens server-side

Validated 2026-05-08 against `sandbox-2` cookies + xvfb-run + Patchright on
arm64 VPS:

1. **Datacenter IP at network layer.** LinkedIn flags ASNs (Hostinger,
   Hetzner, AWS, GCP, Azure, etc.) and serves an authwall variant before
   the browser even gets the page HTML. Our VPS is in a Brazilian
   datacenter ASN — flagged.
2. **TLS JA3 fingerprint.** LinkedIn inspects the TLS Client Hello (ciphers,
   extensions, curves) before parsing HTTP. Node.js fetch and bundled
   Chromium have known JA3 hashes. Patchright patches some of this but not
   the underlying TLS stack on Linux.
3. **Browser fingerprint mismatch.** Cookies were captured on Windows Chrome
   real (`channel: 'chrome'`); server uses bundled Chromium on Linux arm64.
   Canvas, WebGL, navigator.platform, navigator.userAgent all differ.
4. **Protected page authwall.** Even if 1-3 pass, LinkedIn cross-checks the
   session against the device fingerprint of the ORIGINAL login. Mismatch
   → `auth_wall_desktop_profile` etc.

What works on our current setup (Patchright + xvfb + datacenter IP):
- `/jobs/search/?keywords=...` — guest layout, no auth required.
- `/jobs/view/<id>` — guest layout, no auth required.

What does NOT work:
- `/in/<slug>` — authwall.
- `/feed/` — authwall.
- `/search/results/people/` — authwall.
- `/messaging/*` — authwall.
- `POST` actions (Easy Apply, send message, post update) — authwall on
  the page that hosts the form.

---

## Production-grade options

### Option A — Scrapfly (recommended for Pro tier)

Pricing: ~$10–$50/mo per 10k requests with `asp:true`. Includes residential
proxies, fingerprint randomization, JS render. Single API key.

```bash
# Set on MCP server (Portainer):
SCRAPING_BACKEND=scrapfly
SCRAPFLY_API_KEY=scp-live-xxx
```

Caller: `import { scrape } from './browser/scraping-backend.js'`. The
`scrape()` function returns rendered HTML for parsing. Per-tool wiring
lands in Sprint 6.2.

Docs: <https://scrapfly.io/docs/scrape-api/anti-scraping-protection>

### Option B — Bright Data Scraping Browser (recommended for Agency)

Pricing: ~$10/GB transferred + plan minimum. Exposes a `wss://` proxy URL
that connects directly to a remote Chromium with residential IP +
fingerprint already randomized. Drop-in replacement for `chromium.launch`.

```bash
SCRAPING_BACKEND=brightdata
BRIGHTDATA_PROXY_URL=wss://brd-customer-xxx-zone-yyy:password@brd.superproxy.io:9222
```

Sprint 6.2 wires `browserPool.acquire` to call
`chromium.connectOverCDP(BRIGHTDATA_PROXY_URL)` when this backend is
selected.

Docs: <https://docs.brightdata.com/scraping-automation/scraping-browser/quickstart>

### Option C — Browser-extension delivery (zero infra cost)

Ship the scraping logic as a Chrome extension that runs on the user's
machine. The user's IP, browser, and fingerprint are already trusted by
LinkedIn (it's where they log in every day).

The MCP server orchestrates from the cloud but the actual page fetch
runs in the user's browser tab via WebExtension `chrome.scripting.executeScript`.
Results stream back to the MCP server via WebSocket.

This is the architectural model that some commercial competitors use
(Recap, MyResumeStar, etc.). Build effort: ~2 weeks. Distribution: Chrome
Web Store + Edge Add-ons + Firefox Add-ons.

Sprint 7+ if we go this route.

### Option D — Document the limitation, ship Free tier honest

For job seekers who only need search + tracking + JobSpy aggregation, the
current Patchright stack delivers everything they need. `/feed`,
profile-fetch, and people-search become "Pro tier with Scrapfly backend"
upsell features.

This is the path of least resistance and matches the v0.3.0 ship reality.

---

## What we ship NOW (v0.3.0+)

- `mcp-server/src/browser/scraping-backend.ts` — abstraction layer with
  Scrapfly fetch + BrightData config + Patchright passthrough.
- `SCRAPING_BACKEND` env switches the path.
- Tool layer (Sprint 6.2) reads the backend and either calls
  `browserPool.acquire` (patchright) or `scrape()` (scrapfly).

---

## TLS / JA3 fingerprint references

- <https://scrapfly.io/blog/posts/how-to-bypass-tls-fingerprinting>
- <https://scrapfly.io/blog/posts/how-to-scrape-linkedin> — the canonical
  2026 reference for LinkedIn-specific anti-bot.
- <https://research.aimultiple.com/linkedin-scrapers/> — vendor benchmarks.

---

## Legal / ToS

- LinkedIn vs hiQ (2017–2022): public profile scraping ruled lawful.
- LinkedIn vs Proxycurl (2026): suit alleged fake-account scraping;
  Proxycurl shut down 2026-07-04. Enforcement is real for accounts that
  ignore ToS — sandbox accounts that the user owns + low rate are the
  least-risky surface.
- Our plugin's stance: user provides their own LinkedIn account, captures
  their own cookies, and is responsible for staying within ToS. We don't
  ship sandbox accounts or aggregated scrapes.
