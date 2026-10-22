/**
 * Execution 07 Phase E — validates the admin control-plane light palette.
 *
 * Every foreground/background pair the light theme renders is checked against
 * WCAG 2.1 (4.5:1 body text, 3:1 large text and non-text UI). Photo-backed
 * surfaces are checked against the navy scrim, because the caption sits on
 * artwork rather than on the page field. Exits non-zero when any pair fails, so
 * it can gate the change.
 *
 * Run with: node .run/check-admin-light-palette.mjs
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
  goldSoft: '#d9b447',
  goldDeep: '#a9821c',
  goldFillFrom: '#e0c168',
  goldFillTo: '#c9a227',
  onGold: '#241f14',
  onMedia: '#ffffff',
  onMediaAccent: '#e8c766',
  success: '#1a7f4f',
  warning: '#8a5a06',
  danger: '#b3261e',
  info: '#1d5fa8',
  navy: '#00162b',
  scrim: '#0b1a2a',
};

const CHECKS = [
  ['BODY TEXT'],
  ['text on ivory page', L.text, L.bg, 4.5],
  ['text on white card', L.text, L.surface, 4.5],
  ['text on warm neutral', L.text, L.surfaceRaised, 4.5],
  ['text on deeper ivory', L.text, L.bgDeep, 4.5],
  ['muted on ivory page', L.textMuted, L.bg, 4.5],
  ['muted on white card', L.textMuted, L.surface, 4.5],
  ['muted on warm neutral', L.textMuted, L.surfaceRaised, 4.5],
  ['faint on ivory page', L.textFaint, L.bg, 4.5],
  ['faint on white card', L.textFaint, L.surface, 4.5],

  ['ACCENT GOLD (text and hairlines)'],
  ['gold accent on ivory', L.gold, L.bg, 4.5],
  ['gold accent on white', L.gold, L.surface, 4.5],
  ['gold accent on warm neutral', L.gold, L.surfaceRaised, 4.5],
  ['gold accent on deeper ivory', L.gold, L.bgDeep, 4.5],

  ['PRIMARY BUTTON (metallic gold fill)'],
  ['ink on gold fill top stop', L.onGold, L.goldFillFrom, 4.5],
  ['ink on gold fill bottom stop', L.onGold, L.goldFillTo, 4.5],
  ['gold deep as button border on white', L.goldDeep, L.surface, 3],

  ['STATUS TEXT ON THE PAGE AND ON ITS OWN TINT'],
  ['success on ivory', L.success, L.bg, 4.5],
  ['success on white', L.success, L.surface, 4.5],
  ['warning on ivory', L.warning, L.bg, 4.5],
  ['warning on white', L.warning, L.surface, 4.5],
  ['danger on ivory', L.danger, L.bg, 4.5],
  ['danger on white', L.danger, L.surface, 4.5],
  ['info on ivory', L.info, L.bg, 4.5],
  ['info on white', L.info, L.surface, 4.5],

  ['PHOTO-BACKED SURFACES (ink over a navy scrim)'],
  ['white tile title on scrim', L.onMedia, L.scrim, 4.5],
  ['gold tile eyebrow on scrim', L.onMediaAccent, L.scrim, 3],

  ['NON-TEXT UI'],
  ['card border on ivory page', L.text, L.bg, 1.2],
];

let failures = 0;
for (const row of CHECKS) {
  if (row.length === 1) {
    console.log(`\n${row[0]}`);
    continue;
  }
  const [label, fg, bg, min] = row;
  const value = ratio(fg, bg);
  const ok = value >= min;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(42)} ${String(value).padStart(6)}  (min ${min})`);
}

console.log('');
if (failures > 0) {
  console.log(`${failures} contrast check(s) FAILED`);
  process.exit(1);
}
console.log('All admin light-theme contrast checks passed.');
