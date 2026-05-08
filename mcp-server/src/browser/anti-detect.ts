/**
 * Patchright launch + context defaults.
 *
 * Patchright is a Playwright fork that ships with anti-bot patches built in
 * (webdriver flag, canvas/WebGL noise, navigator.plugins, etc.). The defaults
 * here are belt-and-suspenders on top of those patches — see PLAN.md
 * `## Browser pool design` for the rationale on Patchright vs. vanilla.
 */
import type { LaunchOptions, BrowserContext, BrowserContextOptions } from 'patchright';

export const launchOptions: LaunchOptions = {
  headless: true,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ],
};

export const contextDefaults: BrowserContextOptions = {
  viewport: { width: 1920, height: 1080 },
  userAgent:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
  // Patchright handles webdriver/canvas/webgl spoofing automatically.
};

/**
 * Optional extra hardening. Idempotent — safe to call multiple times on the
 * same context (Playwright dedupes init scripts by content). Most spoofing
 * already happens inside Patchright; this is just a navigator.languages
 * sanity guarantee that some anti-bot scripts probe.
 */
export async function applyAntiDetect(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', {
      get: () => ['pt-BR', 'pt', 'en-US', 'en'],
    });
  });
}
