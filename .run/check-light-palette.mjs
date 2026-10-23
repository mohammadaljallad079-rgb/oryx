/**
 * Execution 07 Phase E — validates the corrected light-theme palette.
 *
 * Every foreground/background pair the theme renders is checked against WCAG
 * 2.1 (4.5:1 body text, 3:1 large text and non-text UI). Photo-backed surfaces
 * are checked against a dark scrim, because the caption sits on the artwork.
 * Exits non-zero when any pair fails, so it can gate the change.
 */
const hex = (h) => {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const lum = ([r, g, b]) => {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
};

const L = {
  bg: '#f7f4ed',
  bgDeep: '#efeae0',
  surface: '#ffffff',
  surfaceRaised: '#fbf9f4',
  surfaceHover: '#f4f0e8',
  text: '#22201d',
  textMuted: '#5a544b',
  textFaint: '#6b6459',
  gold: '#7d5f10',
  goldHover: '#6f5510',
  goldSoft: '#d9b447',
  goldDeep: '#a9821c',
  onGold: '#241f14',
  onMedia: '#ffffff',
  onMediaAccent: '#e8c766',
  success: '#1a7f4f',
  warning: '#8a5a06',
  danger: '#b3261e',
  info: '#1d5fa8',
  navy: '#00162b',
  scrimTop: '#0b1a2a',
  scrimBottom: '#001220',
};

const CHECKS = [
  ['BODY TEXT'],
  ['text on ivory page', L.text, L.bg, 4.5],
  ['text on white card', L.text, L.surface, 4.5],
  ['text on warm neutral', L.text, L.surfaceRaised, 4.5],
  ['text on deeper ivory', L.text, L.bgDeep, 4.5],
  ['muted on ivory', L.textMuted, L.bg, 4.5],
  ['muted on white', L.textMuted, L.surface, 4.5],
  ['muted on warm neutral', L.textMuted, L.surfaceRaised, 4.5],
  ['muted on deeper ivory', L.textMuted, L.bgDeep, 4.5],
  ['faint on ivory', L.textFaint, L.bg, 4.5],
  ['faint on white (table head)', L.textFaint, L.surface, 4.5],
  ['faint on warm neutral', L.textFaint, L.surfaceRaised, 4.5],
  ['faint on deeper ivory (footer)', L.textFaint, L.bgDeep, 4.5],
  ['GOLD ACCENT AS TEXT'],
  ['gold link on ivory', L.gold, L.bg, 4.5],
  ['gold link on white', L.gold, L.surface, 4.5],
  ['gold link on warm neutral', L.gold, L.surfaceRaised, 4.5],
  ['gold link on deeper ivory', L.gold, L.bgDeep, 4.5],
  ['gold link hover on ivory (darker)', L.goldHover, L.bg, 4.5],
  ['gold link hover on white', L.goldHover, L.surface, 4.5],
  ['gold link hover on deeper ivory', L.goldHover, L.bgDeep, 4.5],
  ['eyebrow gold on ivory', L.gold, L.bg, 4.5],
  ['GOLD FILLS (metallic buttons and marks)'],
  ['on-gold on fill soft', L.onGold, L.goldSoft, 4.5],
  ['on-gold on fill deep', L.onGold, L.goldDeep, 4.5],
  ['on-gold on fill mid', L.onGold, '#c9a227', 4.5],
  ['navy on fill soft (brand mark alt)', L.navy, L.goldSoft, 4.5],
  ['PHOTO SURFACES (dark scrim, white type)'],
  ['white caption on scrim top', L.onMedia, L.scrimTop, 4.5],
  ['white caption on scrim bottom', L.onMedia, L.scrimBottom, 4.5],
  ['on-media accent on scrim top', L.onMediaAccent, L.scrimTop, 4.5],
  ['on-media accent on scrim bottom', L.onMediaAccent, L.scrimBottom, 4.5],
  ['STATUS ON WHITE'],
  ['success on white', L.success, L.surface, 4.5],
  ['success on ivory', L.success, L.bg, 4.5],
  ['warning on white', L.warning, L.surface, 4.5],
  ['danger on white', L.danger, L.surface, 4.5],
  ['info on white', L.info, L.surface, 4.5],
];

let failed = 0;
let counted = 0;
console.log('LIGHT THEME — CORRECTED PALETTE');
for (const [label, fg, bg, min] of CHECKS) {
  if (!fg) {
    console.log(`\n${label}`);
    continue;
  }
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed += 1;
  counted += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${String(r).padStart(6)} (min ${min})  ${label}`);
}
console.log(`\n${counted - failed}/${counted} pairs meet their threshold`);
process.exit(failed ? 1 : 0);
