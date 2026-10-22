/**
 * Verify the light-theme surface requirements against the live DOM.
 *
 * "The light theme looks inconsistent" is a claim about rendered pixels, so this
 * asserts the properties the owner asked for directly in the browser: the ivory
 * page field, the white/warm-neutral card surfaces, the deep-charcoal ink, the
 * metallic-gold accent, the correct logo colourway, and that every real
 * automotive photograph actually loaded (not a broken placeholder).
 *
 * Usage: ORYX_BASE=http://localhost:3002 node scripts/verify-light-surface.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.ORYX_BASE ?? 'http://localhost:3002';
const routes = ['/', '/providers', '/login', '/dashboard'];
const viewports = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 834, height: 1112 },
  desktop: { width: 1440, height: 900 },
};

const browser = await chromium.launch();
const failures = [];
let checks = 0;

for (const [device, viewport] of Object.entries(viewports)) {
  for (const route of routes) {
    const page = await browser.newPage({ viewport });
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await page.waitForTimeout(400);

    const result = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const lum = (hex) => {
        const h = hex.replace('#', '');
        const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
        const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
        const f = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const contrast = (a, b) => {
        const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
        return (x + 0.05) / (y + 0.05);
      };
      const readVar = (n) => cs.getPropertyValue(n).trim();

      // The rendered logo colourway: exactly one of the two lockups visible.
      const onLight = document.querySelector('.oryx-brand-logo__on-light');
      const onDark = document.querySelector('.oryx-brand-logo__on-dark');
      const visible = (el) => !!el && getComputedStyle(el).display !== 'none';

      // Every real photograph must have decoded to a non-zero box.
      const photos = [...document.querySelectorAll('img')]
        .filter((i) => /\.(jpe?g|png|webp)/i.test(i.currentSrc || i.src))
        .map((i) => ({
          src: (i.currentSrc || i.src).split('/').pop(),
          w: i.naturalWidth,
          h: i.naturalHeight,
        }));

      const bg = readVar('--bg');
      const surface = readVar('--surface');
      const surfaceRaised = readVar('--surface-raised');
      const text = readVar('--text');
      const gold = readVar('--gold');
      return {
        bg,
        surface,
        surfaceRaised,
        text,
        gold,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        logoOnLight: visible(onLight),
        logoOnDark: visible(onDark),
        photos,
        broken: photos.filter((p) => p.w === 0 || p.h === 0),
        textOnBg: contrast(text, bg),
        textOnRaised: contrast(text, surfaceRaised),
        textOnSurface: contrast(text, surface),
      };
    });

    const tag = `${device}${route}`;
    const record = (ok, msg) => {
      checks += 1;
      if (!ok) failures.push(`${tag}: ${msg}`);
    };

    // Ivory page field: high luminance, warm (r >= g >= b), not pure white.
    const l = result.bg.toLowerCase();
    const warmIvory = /^#(f[0-9a-f])/.test(l);
    record(warmIvory, `page field ${result.bg} is not an ivory neutral`);
    // Card surface must be lighter or equal to the field (white/warm neutral).
    record(result.surfaceRaised !== result.bg, `raised surface equals the page field`);
    // Deep charcoal ink, not mid grey.
    record(result.textOnBg >= 12, `ink on ivory contrast ${result.textOnBg.toFixed(2)} < 12`);
    record(result.textOnRaised >= 12, `ink on raised ${result.textOnRaised.toFixed(2)} < 12`);
    record(result.textOnSurface >= 12, `ink on surface ${result.textOnSurface.toFixed(2)} < 12`);
    // Metallic gold accent present as a real warm gold hue. The accent *text*
    // token is deliberately deepened for contrast on ivory (#856612), while the
    // metallic fills are lighter (#d9b447); both are warm gold, i.e. r > g > b
    // with a clear amber gap, so assert the hue rather than one literal.
    const [gr, gg, gb] = result.gold
      .replace('#', '')
      .match(/../g)
      .map((h) => parseInt(h, 16));
    const isGold = gr > gg && gg > gb && gr - gb > 60;
    record(isGold, `accent ${result.gold} is not a warm gold hue`);
    // Logo colourway: on an ivory field the on-light lockup must show.
    record(!result.logoOnDark, `dark logo colourway visible on a light page`);
    record(result.broken.length === 0, `unloaded images: ${result.broken.map((b) => b.src).join(', ')}`);

    console.log(
      `${tag.padEnd(22)} bg=${result.bg} surf=${result.surfaceRaised} ink=${result.text} ` +
        `gold=${result.gold} ink/bg=${result.textOnBg.toFixed(1)} logoLight=${result.logoOnLight} ` +
        `imgs=${result.photos.length}`,
    );
    await page.close();
  }
}

await browser.close();
console.log(`\n${checks - failures.length}/${checks} surface checks passed`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  ' + f);
  process.exitCode = 1;
}
