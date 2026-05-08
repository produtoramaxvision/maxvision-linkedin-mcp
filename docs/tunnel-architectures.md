# Patchright Tunnel Architectures — Security Trade-offs

The VPS has a flagged datacenter ASN; LinkedIn's authwall blocks server-side
Patchright on protected pages. The user's home/work IP, captured via cookie
flow, is already trusted by LinkedIn. Routing the VPS Patchright session
through a tunnel that EXITS at the user's IP would bypass the authwall.

This doc covers 5 ways to do that, ranked by VPS security risk.

---

## Threat model

What we're protecting:

- VPS: must not expose new inbound ports to the internet or to the user.
- User's machine: must not become a long-lived target.
- LinkedIn cookie: never leaves the encrypted store on the VPS.
- Audit: every tunnel session logged with start/end timestamps + accountId.

What attackers might try:
- Hijacking the tunnel to relay other traffic through the user's IP.
- Pivoting from the user's tunnel back into the VPS.
- Stealing residential IP credentials if a proxy provider is used.

---

## Option A — Browser-extension companion (zero inbound, MOST SECURE)

User installs a Chrome extension. Extension connects OUTBOUND-ONLY via
WebSocket to `wss://linkedin-mcp.../companion?token=...`. MCP server pushes
scrape requests; extension runs the scrape in the user's already-logged-in
LinkedIn tab and ships back rendered DOM via the same WebSocket.

```
User browser ──outbound wss──▶ MCP /companion ──▶ tools/get_profile etc.
   (LinkedIn tab,
    user's cookies,
    user's IP)
```

**Security:**
- Zero inbound ports on user OR VPS (existing /mcp port already exposed).
- User can disconnect at any time by closing the extension.
- VPS only sees rendered HTML — never raw cookies.
- WebSocket auth via per-account JWT (issued by /admin/companion-token).
- Extension code is open-source + audit-ready.

**Cost:** zero. **Effort:** ~2 weeks to ship + Chrome Web Store review.

---

## Option B — Local Companion daemon (very secure)

Same architecture as A but no browser extension — user runs a small Node
CLI (`npx @maxvision/linkedin-companion`) on their laptop. CLI connects
outbound-only to MCP via WebSocket and runs Patchright LOCALLY against the
user's `.cookie-capture-profile/` directory (the persistent profile already
created by `/linkedin-cookie-refresh`).

```
User's laptop                      MCP VPS
─────────────                      ───────
maxvision-companion ──wss──▶ /companion (Sprint 7)
  └─ patchright local                    │
     ├─ user's IP                        ▼
     ├─ user's profile                tools/* dispatch
     └─ trusted by LinkedIn
```

**Security:**
- Zero inbound on user (outbound WebSocket only).
- VPS exposes only existing /mcp + new /companion (auth'd same as /mcp).
- No proxy credentials to leak.
- Companion process can be killed any time → tools auto-fail back to
  Patchright direct (with COOKIE_EXPIRED).
- All scrapes logged to audit_log with accountId + URL pattern.

**Cost:** zero. **Effort:** ~3 days CLI + WS server.

---

## Option C — Tailscale mesh + SOCKS5 on user's node

User installs Tailscale on their laptop and joins the MaxVision tailnet
(`linkedin-mcp` tailnet, MagicDNS enabled). User runs a local SOCKS5 server
(e.g. `dante`, `3proxy`, or `ssh -D 1080`). VPS Patchright launches with
`PATCHRIGHT_PROXY_URL=socks5://laptop.tailscale-net:1080`.

```
VPS ──tailscale wireguard──▶ user laptop SOCKS5 ──▶ LinkedIn
                              (user's IP)
```

**Security:**
- Tailscale ACLs limit which nodes can reach the user's SOCKS5 port.
- WireGuard end-to-end encrypted.
- No public exposure on either side; tailscale handles NAT punching.
- Audit log: tailscale's own connection logs + our scrape logs.
- **Risk:** persistent VPN connection — user's laptop is reachable by VPS
  whenever both are online. Mitigate via tailscale ACL: VPS may only
  initiate to port 1080 of the user's node, no other ports.

**Cost:** Tailscale free tier (3 users + 100 devices). **Effort:** ~1 day +
user installs Tailscale.

---

## Option D — SSH reverse tunnel SOCKS5 (ephemeral, on-demand)

User runs `ssh -i ~/.ssh/maxv-tunnel -R 1080:localhost:1080
tunneler@vps:22` from their laptop, which exposes their local SOCKS5 on
VPS:1080. VPS Patchright uses `PATCHRIGHT_PROXY_URL=socks5://localhost:1080`.

```
User laptop ──ssh -R 1080:1080──▶ VPS
  └─ ssh -D 1080 (local SOCKS5)         │
                                        ▼
                                   patchright via socks5://localhost:1080 ──▶ LinkedIn
                                                                             (user's IP)
```

**Security:**
- VPS-side SSH user `tunneler` is **shell-disabled, port-forward-only**:
  ```
  Match User tunneler
    PermitTTY no
    AllowTcpForwarding remote
    PermitOpen 127.0.0.1:1080
    ForceCommand /bin/false
    AuthorizedKeysFile /etc/ssh/tunneler-keys/%u.pub
  ```
- Public-key auth only, key rotated every 30 days via cron.
- VPS firewall: port 1080 listens on 127.0.0.1 only — NOT exposed to
  internet (`-R 1080:127.0.0.1:1080` binds loopback by default).
- Tunnel is ephemeral: user starts SSH on demand, kills after operation.
- **Risk:** if user's laptop is compromised, attacker gets a foothold via
  port-forward back to VPS. Mitigate: `tunneler` user has no shell + no
  filesystem access + only port 1080 forwarding allowed.

**Cost:** zero. **Effort:** ~2 hours SSH config + user-side scripts.

---

## Option E — Cloudflare WARP egress (VPS uses Cloudflare's IPs)

VPS installs Cloudflare WARP daemon and egresses ALL outbound through
Cloudflare's cleaner IP pool. LinkedIn sees Cloudflare IPs, which have
better reputation than datacenter ASNs.

```
VPS patchright ──WARP daemon──▶ Cloudflare egress ──▶ LinkedIn
```

**Security:**
- All outbound from VPS goes through Cloudflare — single trust point.
- No new inbound ports.
- Cloudflare logs the traffic (privacy trade-off).
- **Risk:** LinkedIn flags Cloudflare WARP IPs increasingly; Cloudflare is
  itself an "ASN"; bypass is partial. May not work long-term.

**Cost:** WARP+ ~$5/mo per device for static IPs. **Effort:** ~30 min.

---

## Recommendation

**For MaxVision launch (Pro/Agency):**
1. **Free tier:** keep `patchright` direct + Patchright (current behavior).
   Authwall surfaces will fail — document it.
2. **Pro tier:** offer **Option B (Local Companion daemon)**. Zero cost
   to MaxVision; user runs the companion on demand. Architecturally
   cleanest. Sprint 7 work.
3. **Agency tier:** offer **Option C (Tailscale mesh)**. Persistent
   connection acceptable for high-volume operations. Each Agency client
   gets a tailnet node + SOCKS5 ACL.
4. **Power users:** document **Option D (SSH reverse SOCKS)** as a free
   self-serve path with the security caveats stated.

Skip Cloudflare WARP — partial bypass, ongoing arms race.

---

## What ships in v0.6.0

`PATCHRIGHT_PROXY_URL` env wired into `launchOptions.proxy` in
`mcp-server/src/browser/anti-detect.ts`. Caller can already set:

```bash
PATCHRIGHT_PROXY_URL=socks5://localhost:1080
PATCHRIGHT_PROXY_USERNAME=optional
PATCHRIGHT_PROXY_PASSWORD=optional
PATCHRIGHT_PROXY_BYPASS=<-loopback>
```

Combine with any tunnel architecture above. Sprint 7 ships the Companion
daemon and WebSocket relay path.

---

## SSH `tunneler` user setup (Option D quick start)

On the VPS, as root:

```bash
# 1. Create restricted user
useradd -m -s /usr/sbin/nologin tunneler

# 2. Restrict SSH access
cat >> /etc/ssh/sshd_config <<'EOF'
Match User tunneler
    PermitTTY no
    AllowTcpForwarding remote
    PermitOpen 127.0.0.1:1080
    ForceCommand /bin/false
    AuthorizedKeysFile /home/tunneler/.ssh/authorized_keys
EOF
systemctl reload sshd

# 3. Generate ephemeral key for the user (rotate every 30d)
mkdir -p /home/tunneler/.ssh
chown tunneler:tunneler /home/tunneler/.ssh
chmod 700 /home/tunneler/.ssh
# user adds their public key to /home/tunneler/.ssh/authorized_keys
```

On the user's laptop:

```bash
# Start a local SOCKS5 server on port 1080 (the simplest: ssh -D against
# yourself, but any SOCKS server works)
ssh -D 1080 -N -f localhost  # opens local SOCKS5 on :1080

# Open the reverse tunnel to VPS
ssh -i ~/.ssh/maxv-tunnel \
    -R 1080:localhost:1080 \
    -N -f \
    tunneler@vps.maxvision.com.br

# When done, kill both:
pkill -f "ssh -D 1080"
pkill -f "tunneler@vps"
```

Set on VPS Portainer env:
```
PATCHRIGHT_PROXY_URL=socks5://127.0.0.1:1080
PATCHRIGHT_PROXY_BYPASS=<-loopback>
```

The `tunneler` user has no shell, no filesystem access, can only forward
port 1080. Even if their key leaks, attacker gets only "forward to my own
SOCKS5 listener" — no VPS access.
