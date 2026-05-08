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
 * This module deliberately exposes ONLY the launch flags. `BrowserContextOptions`
 * is NOT exported anymore — we pass nothing custom to launchPersistentContext.
 */
import type { LaunchOptions } from 'patchright';

export const launchOptions: LaunchOptions = {
  // Patchright README: "headless: false" is the only reliably undetected mode.
  headless: false,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ],
};
