# LinkedIn cookie capture automation — design spec

**Date:** 2026-05-08
**Sprint:** 1.5.1 (operational tooling for Sprint 1.5 deploy)
**Status:** approved → implementation

## Problem

Sprint 1.5 ships real Patchright scrapers that require an authenticated LinkedIn `li_at` cookie injected into the `accounts` table to function. Today the cookie path is fully manual:

1. User opens browser, logs in to LinkedIn
2. User opens DevTools → Application → Cookies → copies `li_at` value
3. User runs Node REPL or psql with hand-crafted AES-256-GCM encrypt + INSERT
4. User makes a typo somewhere along the way
5. User starts over

This friction blocks every cookie refresh (every ~90 days per account, plus every captcha incident). We need a one-command flow.

## Goals

- One command from Claude Code: `/linkedin-cookie-refresh`
- User logs in via a normal browser window (no automated credential entry — credentials never leave user's keyboard)
- Cookie captured + persisted to server, encrypted at rest, in <60 seconds end-to-end
- Plaintext cookie never touches user's local disk
- Plaintext cookie transits HTTPS once (Traefik TLS terminated at server)
- Existing API key reused for auth (no new secret to manage)

## Non-goals

- Automated credential entry (phishing-shaped, ban risk, breaks 2FA)
- Sandbox account creation (manual, documented in `DEPLOY-VPS.md`)
- Multi-account pool selection logic (Sprint 3)
- Auto-refresh on expiry detection (Sprint 2)
- Browser extension or bookmarklet variants (`li_at` is HttpOnly — JS in page can't read it)

## Components

### 1. `mcp-server/scripts/capture-cookie.ts` (NEW)

Standalone CLI run on user's laptop. Bootstrap entry: `pnpm capture-cookie`.

```ts
// Usage:
//   pnpm capture-cookie [--account-id default] [--display-name "Sandbox"] [--server <url>]
// Defaults: account-id=default, display-name="Default Account", server from env MCP_SERVER_URL
// or hard fallback https://linkedin-mcp.produtoramaxvision.com.br
```

Behavior:

1. Parse CLI args (yargs or built-in `parseArgs` from `node:util`)
2. Read `MAXVISION_API_KEY` from env. Fail fast if absent.
3. Launch Patchright `chromium.launchPersistentContext` with `headless: false`, `viewport: 1280x800`
4. Navigate `https://www.linkedin.com/login`
5. Poll `context.cookies('https://www.linkedin.com')` every 2s for cookie named `li_at` with non-empty `value` length > 80
6. Timeout: 5 minutes (300s). Print message every 30s: "still waiting for login…"
7. On capture, validate by navigating `https://www.linkedin.com/feed/` and waiting for selector `nav.global-nav` (timeout 15s). If page redirects to `/authwall` or `/login` again → cookie invalid, retry from step 4 (allow 1 re-attempt only)
8. POST `<server>/admin/account-cookie` with body:
   ```json
   {
     "accountId": "default",
     "displayName": "Default Account",
     "cookieValue": "<raw li_at>",
     "expiresInDays": 90
   }
   ```
   Headers: `Authorization: Bearer ${MAXVISION_API_KEY}`, `Content-Type: application/json`, `Accept: application/json`
9. Retry POST 3x with exponential backoff (1s, 3s, 9s) on 5xx or network errors. Don't retry on 4xx.
10. Close browser via `await context.close()`
11. Print success line: `OK account=default cookie_expires=2026-08-08 audit_id=42`
12. Exit 0

Failure modes (non-zero exit):
- API key missing in env → exit 2 with helpful message
- Login timeout (5min) → exit 3
- Cookie validation failed twice → exit 4
- Server POST 4xx (auth invalid, malformed body) → exit 5 with server error body
- Server POST 5xx after retries → exit 6
- Patchright launch failed (Chromium missing locally) → exit 7 with install hint

### 2. `mcp-server/src/http.ts` — UPDATE

New route registered before catch-all 404:

```ts
import { z } from 'zod';
import { encryptCookie } from './auth/cookies.js';
import { db } from './db/client.js';
import { accounts, auditLog } from './db/schema.js';
import { sql } from 'drizzle-orm';

const AdminCookieBodySchema = z.object({
  accountId: z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/),
  displayName: z.string().min(1).max(200).optional(),
  cookieValue: z.string().min(80).max(500),
  expiresInDays: z.number().int().min(1).max(365).default(90),
});

app.post('/admin/account-cookie', async (c) => {
  const auth = await authenticateApiKey(c.req.raw);
  if (!auth.ok) return c.json({ error: 'unauthorized' }, 401);

  const body = await c.req.json().catch(() => null);
  const parsed = AdminCookieBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_fail', details: parsed.error.flatten() }, 400);
  }

  const { accountId, displayName, cookieValue, expiresInDays } = parsed.data;
  const blob = encryptCookie(cookieValue);
  const expiresAt = new Date(Date.now() + expiresInDays * 86400 * 1000);

  await db.insert(accounts).values({
    id: accountId,
    displayName: displayName ?? 'Default Account',
    cookieEncrypted: blob,
    cookieExpiresAt: expiresAt,
  }).onConflictDoUpdate({
    target: accounts.id,
    set: {
      displayName: displayName ?? sql`${accounts.displayName}`,
      cookieEncrypted: blob,
      cookieExpiresAt: expiresAt,
      updatedAt: new Date(),
      status: 'active',
    },
  });

  // Audit (best-effort, blob hash only)
  const blobSha = createHash('sha256').update(blob).digest('hex').slice(0, 16);
  void db.insert(auditLog).values({
    tool: 'admin.cookie_refresh',
    accountId,
    inputHash: blobSha,
    success: true,
  }).catch(() => {});

  return c.json({ accountId, expiresAt: expiresAt.toISOString() });
});
```

Important:
- Endpoint mounted BEFORE `/mcp` route (no MCP handshake needed)
- Same Pino request logger middleware applies
- Same auth middleware as `/mcp` (`authenticateApiKey`)
- Logs nothing about `cookieValue`. SHA256[:16] of the encrypted blob is in audit_log only.

### 3. `mcp-server/package.json` — UPDATE

Add scripts:
```json
{
  "scripts": {
    "capture-cookie": "tsx scripts/capture-cookie.ts"
  }
}
```

No new dependencies: `tsx` and `patchright` and `zod` are already present.

### 4. `plugins/linkedin-maxvision/commands/linkedin-cookie-refresh.md` — UPDATE

Replace the Sprint 1 stub body with explicit instructions for Claude Code to execute the bash command on the user's machine. Frontmatter:

```yaml
---
name: linkedin-cookie-refresh
description: Captura cookie li_at LinkedIn via login interativo no navegador local e persiste no servidor MCP
argument-hint: [--account-id default]
allowed-tools: Bash
---
```

Body instructs Claude to:

1. Verify `MAXVISION_API_KEY` env var present (read from process env via Bash echo)
2. If `mcp-server/node_modules` missing on disk, run `cd mcp-server && pnpm install --ignore-workspace`
3. Run `cd mcp-server && pnpm capture-cookie ${ARGUMENTS}` (foreground, capture stdout)
4. Report output to user (success line OR exit code + stderr tail)
5. Suggest follow-up: `/linkedin-status` para validar saúde da conta

Edge cases the command body must handle:
- User on Windows where `cd` semantics differ in PowerShell vs bash — use cross-platform paths
- Patchright Chromium not installed locally → script exits 7 with `npx patchright install chromium` hint; command relays this

### 5. `mcp-server/scripts/.gitignore` (NEW)

`.gitignore` inside `scripts/` to exclude any local cookie debug dumps if developer adds them during iteration.

### 6. `sprint0-deliverables/portainer/DEPLOY-VPS.md` — UPDATE §8

Replace section 8.2 (manual encrypt + SQL) with:

```markdown
### 8.2 — Capturar via Claude Code (recomendado)

No Claude Code (com plugin linkedin-maxvision instalado + MAXVISION_API_KEY no env):

    /linkedin-cookie-refresh

Janela do navegador abre apontando para LinkedIn login. Faça login normalmente. 
Cookie é capturado, encriptado pelo servidor, e gravado no DB automaticamente.

Pré-requisitos one-time:
- Node 20 instalado no laptop
- Chromium do Patchright instalado: `cd mcp-server && pnpm install && npx patchright install chromium`
```

Section 8.3 (manual SQL fallback) stays as documented escape hatch for advanced users.

## Data flow

```
User triggers /linkedin-cookie-refresh in Claude Code
  ↓
Claude Code reads command frontmatter, runs:
  Bash(cd mcp-server && pnpm capture-cookie --account-id default)
  ↓
scripts/capture-cookie.ts:
  ├─ launches Patchright headed (Chromium window pops up)
  ├─ navigates linkedin.com/login
  └─ polls cookies every 2s
  ↓
User types email + password in browser (manual)
  ↓
LinkedIn validates → sets li_at cookie
  ↓
Script detects li_at, validates by navigating /feed
  ↓
Script: POST https://linkedin-mcp.../admin/account-cookie
  Headers: Authorization: Bearer mxv_<key>
  Body: { accountId, displayName, cookieValue, expiresInDays: 90 }
  ↓
Server (http.ts admin handler):
  ├─ authenticateApiKey
  ├─ Zod validate body
  ├─ encryptCookie(cookieValue) → bytea blob
  ├─ INSERT INTO accounts ... ON CONFLICT (id) DO UPDATE
  ├─ INSERT INTO audit_log (tool='admin.cookie_refresh', input_hash=sha[:16])
  └─ 200 { accountId, expiresAt }
  ↓
Script: closes browser, prints success line, exits 0
  ↓
Claude Code: reports back to user
```

## Error handling

| Failure point | Detection | User-facing | Exit code |
|---|---|---|---|
| API key missing | `process.env.MAXVISION_API_KEY` empty | "Set MAXVISION_API_KEY env var first" | 2 |
| Patchright launch fail | `chromium.launchPersistentContext` throws | "Run: npx patchright install chromium" | 7 |
| Login timeout 5min | Polling never finds li_at | "Login timeout. Try again." | 3 |
| Cookie validation fail | /feed redirected to /authwall | "Cookie rejected by LinkedIn. Re-login." | 4 |
| Server 4xx | POST returns 4xx | Print server error body | 5 |
| Server 5xx after 3 retries | POST 5xx persists | "Server error. Check status page." | 6 |

Server-side (HTTP 200 path always JSON, no surprises):
- Bad body → 400 with `{ error: 'validation_fail', details }`
- Missing/bad auth → 401
- DB connection lost → 500 (admin endpoint must NOT swallow errors silently — fix-forward needs visibility)

## Security

- **MASTER_KEY scope:** Server-only env var. Never copied to user laptop. Never logged.
- **Cookie at rest:** AES-256-GCM (12-byte IV ‖ 16-byte tag ‖ ciphertext) in `accounts.cookie_encrypted` bytea column.
- **Cookie in transit:** HTTPS via Traefik 3.4 with letsencryptresolver. Single trip ~100ms over Brazilian links.
- **Cookie in memory:** Local script holds raw value briefly (POST request body), no disk write. Server holds raw cookieValue inside Hono request handler scope only — released after `encryptCookie()` returns.
- **API key reuse:** Existing `MCP_API_KEYS` allowlist authorizes admin endpoint. Sprint 3 license worker adds scope-based ACL.
- **Audit log:** Records `tool='admin.cookie_refresh'` + SHA256[:16] of encrypted blob. Never the raw cookie or the plaintext value.
- **Server logs:** Pino writes request line `POST /admin/account-cookie 200 latency_ms=N`. Body redacted by middleware (not specifically configured today, but body is short-lived inside async handler scope and not auto-logged by Hono).

## Testing

Sprint 1.5.1 ships without unit tests (matches Sprint 1 / 1.5 baseline). Manual verification path:

1. `pnpm capture-cookie --account-id sandbox-test --display-name "Test Sandbox"` from clean state (no row in accounts)
2. Login as sandbox user
3. Confirm script exits 0 with success line
4. Verify via SSH: `psql -c "SELECT id, display_name, length(cookie_encrypted), cookie_expires_at, status FROM accounts;"` shows row with `length > 80`
5. Verify audit_log: `SELECT tool, success, ts FROM audit_log WHERE tool='admin.cookie_refresh' ORDER BY ts DESC LIMIT 1`
6. Smoke E2E: `curl -X POST .../mcp -d 'tools/call search_jobs accountId=sandbox-test'` → expect either 3 LinkedIn jobs OR `CAPTCHA_DETECTED`/`COOKIE_EXPIRED` (proves real Patchright runs against the captured cookie)

Negative tests:
1. Run script without `MAXVISION_API_KEY` → exit 2
2. Run script, close browser before logging in → exit 3 after 5min
3. Run script with bad API key in env → exit 5

## Open questions

None. All decisions in this spec are concrete.

## Out of scope (revisit Sprint 1.5.2+)

- Cookie expiry monitor: cron that checks `cookie_expires_at < NOW() + 7d` and notifies user
- Captcha auto-recovery: detect `captcha_events` rate spike, force cookie refresh
- Multiple accounts pool with round-robin scheduling
- Browser extension flavor for users without local Node setup
- Sandbox account provisioning automation (signup flow has CAPTCHA + SMS verification, not automatable)
