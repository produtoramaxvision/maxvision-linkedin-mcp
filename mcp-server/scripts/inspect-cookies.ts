#!/usr/bin/env tsx
/**
 * inspect-cookies — list all linkedin.com cookies in the persistent profile.
 * Prints names + lengths only (never values) so we can see what set of cookies
 * a logged-in session actually carries.
 */
import { chromium } from 'patchright';

const PROFILE_DIR = './.cookie-capture-profile';

async function main(): Promise<void> {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: true,
  });
  try {
    const cookies = await ctx.cookies('https://www.linkedin.com');
    console.log(`Total cookies for linkedin.com: ${cookies.length}`);
    console.log('---');
    for (const c of cookies) {
      console.log(
        `${c.name.padEnd(30)} | domain=${c.domain.padEnd(20)} | len=${String(c.value.length).padStart(4)} | ` +
          `httpOnly=${c.httpOnly} | secure=${c.secure} | sameSite=${c.sameSite}`,
      );
    }
  } finally {
    await ctx.close();
  }
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
