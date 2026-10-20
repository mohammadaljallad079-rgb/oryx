/**
 * Compares a reference screenshot against two candidate builds inside a region,
 * so it can be decided which candidate the reference matches.
 *
 * Usage: node .run/diff-region.mjs <ref.png> <candA.png> <candB.png> <left> <top> <w> <h>
 */
import sharp from 'sharp';

const [ref, candA, candB, l, t, w, h] = process.argv.slice(2);
const region = { left: +l, top: +t, width: +w, height: +h };

async function load(p) {
  return sharp(p).extract(region).raw().toBuffer({ resolveWithObject: true });
}

const R = await load(ref);
const A = await load(candA);
const B = await load(candB);
const ch = R.info.channels;

function compare(X) {
  let big = 0;
  let sum = 0;
  for (let i = 0; i < R.data.length; i += ch) {
    const d = Math.max(
      Math.abs(R.data[i] - X.data[i]),
      Math.abs(R.data[i + 1] - X.data[i + 1]),
      Math.abs(R.data[i + 2] - X.data[i + 2]),
    );
    sum += d;
    if (d > 20) big += 1;
  }
  return { big, mean: sum / (R.data.length / ch) };
}

const a = compare(A);
const b = compare(B);
console.log(`region ${JSON.stringify(region)}`);
console.log(`  vs ${candA}: large-delta ${a.big}, mean ${a.mean.toFixed(2)}`);
console.log(`  vs ${candB}: large-delta ${b.big}, mean ${b.mean.toFixed(2)}`);
console.log(`  => reference matches ${a.big < b.big ? candA : candB}`);
