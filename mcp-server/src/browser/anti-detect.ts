/**
 * Patchright launch options aligned with upstream "Best Practice" (Sprint 1.5.3).
 *
 * Patchright README (https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-nodejs)
 * explicitly recommends:
 *
 *   chromium.launchPersistentContext("...", {
 *     channel: "chrome",     // bundled chromium acceptable on linux/arm64
 *     headless: false,        // visible window (use xvfb on Linux servers)
 *     viewport: null,         // do NOT override viewport
 *     // do NOT add custom userAgent or browser headers
 *   });
 *
 * VPS is linux/arm64 — Google Chrome is not published for arm64, so we use the
 * bundled Patchright Chromium (`channel` omitted). The Dockerfile installs
 * xvfb + xauth and the runtime ENTRYPOINT wraps node in `xvfb-run` so the
 * `headless: false` Chromium has a virtual X display to attach to.
 *
 * Patchright handles webdriver/canvas/WebGL/navigator.plugins automatically.
 *
 * Sprint 6.5 — proxy support for LinkedIn authwall bypass:
 *   PATCHRIGHT_PROXY_URL env can carry a SOCKS5/HTTP proxy URL routing the
 *   browser through:
 *     - User's local machine (via SSH reverse tunnel — see docs/tunnel.md)
 *     - Tailscale mesh peer (the user's laptop runs a tailscaled SOCKS5)
 *     - Residential proxy provider (BrightData, Smartproxy, etc.)
 *     - Cloudflare WARP outbound from VPS
 *
 *   Format: `socks5://user:pass@host:port` or `http://user:pass@host:port`.
 *   Optional `PATCHRIGHT_PROXY_BYPASS` for `<-loopback>;localhost;127.0.0.1`.
 */
import type { LaunchOptions } from 'patchright';

const proxyServer = process.env['PATCHRIGHT_PROXY_URL'];
const proxyBypass = process.env['PATCHRIGHT_PROXY_BYPASS'] ?? '<-loopback>';
const proxyUsername = process.env['PATCHRIGHT_PROXY_USERNAME'];
const proxyPassword = process.env['PATCHRIGHT_PROXY_PASSWORD'];

export const launchOptions: LaunchOptions = {
  // Patchright README: "headless: false" is the only reliably undetected mode.
  headless: false,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ],
  ...(proxyServer
    ? {
        proxy: {
          server: proxyServer,
          bypass: proxyBypass,
          ...(proxyUsername ? { username: proxyUsername } : {}),
          ...(proxyPassword ? { password: proxyPassword } : {}),
        },
      }
    : {}),
};
