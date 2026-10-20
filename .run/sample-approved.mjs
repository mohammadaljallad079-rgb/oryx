/**
 * Samples the approved design references so a change can be justified against
 * the owner's artwork rather than against an assumption.
 */
import sharp from 'sharp';

const GOLD = [212, 175, 55];

async function analyse(path, label) {
  const img = sharp(path);
  const meta = await img.metadata();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let gold = 0;
  let dark = 0;
  let total = 0;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    total += 1;
    // Gold-ish: strong red, mid green, low blue, and warm (r > b).
    if (r > 150 && g > 110 && g < 220 && b < 120 && r - b > 70) gold += 1;
    if (r < 60 && g < 70 && b < 90) dark += 1;
  }
  console.log(
    `${label.padEnd(34)} ${meta.width}x${meta.height}  goldPx=${gold} (${((gold / total) * 100).toFixed(2)}%)  darkPx=${((dark / total) * 100).toFixed(1)}%`,
  );
}

await analyse('docs/assets/ORYX Arabic Auto Services Homepage.png', 'approved homepage');
await analyse('docs/assets/ORYX Auto Services Dashboard.png', 'approved dashboard');
console.log(`target gold reference rgb(${GOLD.join(', ')})`);
