/**
 * Confirm the regenerated dark screenshots changed only in content, not in
 * theme. Compares the dominant colours of the chrome (sidebar + header band)
 * between HEAD and the working tree for every modified dark capture. A theme
 * regression would move those colours; live-data changes would not.
 */
import { execSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';

const files = execSync("git diff --name-only -- '*.png'", { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter((f) => /-dark(-full)?\.png$/.test(f));

const TMP = '/tmp/head-dark.png';

/** The most common colour in a band of the image, as "r,g,b". */
function dominant(png, x0, x1, y0, y1) {
  const counts = new Map();
  for (let y = y0; y < Math.min(y1, png.height); y += 2) {
    for (let x = x0; x < Math.min(x1, png.width); x += 2) {
      const i = (png.width * y + x) << 2;
      const k = `${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

let regressions = 0;
for (const f of files) {
  try {
    const head = execSync(`git show HEAD:${JSON.stringify(f)}`, { maxBuffer: 1 << 28 });
    writeFileSync(TMP, head);
    const a = PNG.sync.read(readFileSync(TMP));
    const b = PNG.sync.read(readFileSync(f));
    // Left 220px is the sidebar chrome on desktop layouts; the top 60px is the
    // header. Both are pure theme surfaces with no live data.
    const aChrome = dominant(a, 0, 220, 0, 60);
    const bChrome = dominant(b, 0, 220, 0, 60);
    const aHeader = dominant(a, 240, Math.min(900, a.width), 0, 50);
    const bHeader = dominant(b, 240, Math.min(900, b.width), 0, 50);
    const ok = aChrome === bChrome && aHeader === bHeader;
    if (!ok) regressions += 1;
    console.log(
      `${ok ? 'ok  ' : 'THEME-SHIFT'} ${f}\n     sidebar ${aChrome} -> ${bChrome} | header ${aHeader} -> ${bHeader}`,
    );
  } catch (e) {
    console.log(`ERROR ${f}: ${e.message.slice(0, 70)}`);
  }
}
try { unlinkSync(TMP); } catch {}
console.log(`\n${files.length} dark captures; ${regressions} show a chrome colour change`);
process.exit(regressions === 0 ? 0 : 1);
