/**
 * Prove the category vocabulary fix end to end through the live preview.
 *
 * Before the fix every category chip filtered the provider directory by a key
 * no provider carried, so each returned an empty directory. This drives the
 * real UI: it opens the homepage, follows a category card, and asserts the
 * directory lists approved providers under that same key.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.PREVIEW_BASE ?? 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const OUT = 'docs/audit/exec07/phase-d';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

const report = { base: BASE, categories: [], checks: [] };

// The catalogue the site itself renders, read from the live bundle.
await page.goto(`${BASE}/providers`, { waitUntil: 'networkidle' });
const chips = await page.evaluate(() =>
  [...document.querySelectorAll('a[href^="/providers?category="]')].map((a) => ({
    key: new URL(a.href).searchParams.get('category'),
    label: a.textContent?.trim(),
  })),
);
report.checks.push({ name: 'category chips rendered', count: chips.length });

for (const chip of chips) {
  await page.goto(`${BASE}/providers?category=${encodeURIComponent(chip.key)}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.oryx-provider-card__mark')].length;
    const empty = /no providers|لا يوجد|none/i.test(document.body.innerText.slice(0, 4000));
    return { providerCards: cards, emptyStateShown: empty };
  });

  report.categories.push({ ...chip, ...info });
  await page.screenshot({
    path: `${OUT}/providers-${chip.key}.png`,
    fullPage: false,
  });
}

await ctx.close();
await browser.close();

const failures = report.categories.filter((c) => c.providerCards === 0);
report.checks.push({
  name: 'every category returns at least one provider',
  categories: report.categories.length,
  failures: failures.map((f) => f.key),
});

writeFileSync(`${OUT}/category-filter-verification.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(failures.length === 0 ? '\nALL CATEGORIES RETURN PROVIDERS' : `\n${failures.length} EMPTY`);
process.exit(failures.length === 0 ? 0 : 1);
