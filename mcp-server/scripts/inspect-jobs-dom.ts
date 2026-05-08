#!/usr/bin/env tsx
/**
 * inspect-jobs-dom — one-shot DOM inspector for LinkedIn /jobs/search.
 *
 * Uses the persistent profile from capture-cookie (./.cookie-capture-profile)
 * which has the authenticated li_at cookie. Navigates jobs search, dumps
 * candidate selectors + first card outerHTML so we can update scrapers.
 */
import { chromium } from 'patchright';
import * as fs from 'node:fs';

const PROFILE_DIR = './.cookie-capture-profile';
const URL_JOBS = 'https://www.linkedin.com/jobs/search/?keywords=backend';

async function main(): Promise<void> {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: null,
  });
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    console.log(`navigating ${URL_JOBS}...`);
    await page.goto(URL_JOBS, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    console.log(`final URL=${page.url()}`);

    const probes = await page.evaluate(() => {
      const trySels = [
        'ul.jobs-search__results-list',
        'ul.scaffold-layout__list-container',
        '[data-test-id="job-search-results-list"]',
        'ul[class*="jobs-search"]',
        'ul[class*="scaffold-layout__list"]',
        'main ul',
        'main div[class*="results"]',
        'div[data-results-list-top-scroll-sentinel]',
        'div.scaffold-layout__list',
        '.jobs-search-results-list',
        'li.scaffold-layout__list-item',
        'li.job-card-container',
        'div.job-card-container',
        'div.base-card',
        'a[href*="/jobs/view/"]',
      ];
      const results: Record<string, number> = {};
      for (const sel of trySels) {
        try {
          results[sel] = document.querySelectorAll(sel).length;
        } catch {
          results[sel] = -1;
        }
      }
      return results;
    });

    console.log('Selector probe results:');
    for (const [sel, count] of Object.entries(probes)) {
      console.log(`  ${count.toString().padStart(4)} → ${sel}`);
    }

    const firstCardHtml = await page.evaluate(() => {
      const card = document.querySelector('a[href*="/jobs/view/"]')?.closest('li, div');
      return card ? card.outerHTML.slice(0, 4000) : 'NO_CARD_FOUND';
    });

    fs.writeFileSync('./scripts/inspect-jobs-first-card.html', firstCardHtml, 'utf-8');
    console.log('first card outerHTML → scripts/inspect-jobs-first-card.html');

    const url = page.url();
    fs.writeFileSync(
      './scripts/inspect-jobs-meta.json',
      JSON.stringify({ url, probes }, null, 2),
      'utf-8',
    );
    console.log('meta → scripts/inspect-jobs-meta.json');
  } finally {
    await ctx.close();
  }
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
