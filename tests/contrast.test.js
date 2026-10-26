// Text colours must stay readable (WCAG AA: 4.5 to 1) on the backgrounds they are used on.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/assets/tokens.css', import.meta.url), 'utf8');
const color = Object.fromEntries(
  [...css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]),
);
color.white = '#ffffff';

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(color[a]), luminance(color[b])].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const PAIRS = [
  ['ink', 'paper'],
  ['ink', 'card'],
  ['ink-soft', 'paper'],
  ['ink-soft', 'card'],
  ['ink-soft', 'paper-deep'],
  ['ink-soft', 'red-soft'],
  ['ink-faint', 'paper'],
  ['ink-faint', 'card'],
  ['ink-faint', 'paper-deep'],
  ['brass-deep', 'paper'],
  ['brass-deep', 'card'],
  ['brass-deep', 'brass-soft'],
  ['brass-soft', 'navy-deep'],
  ['blue', 'card'],
  ['blue', 'paper'],
  ['green-deep', 'green-soft'],
  ['amber-deep', 'amber-soft'],
  ['red-deep', 'red-soft'],
  ['blue-deep', 'blue-soft'],
  ['red', 'card'],
  ['white', 'red'],
  ['white', 'navy-deep'],
  ['white', 'red-deep'],
  ['white', 'navy-mid'],
];

describe('colour contrast', () => {
  it.each(PAIRS)('%s on %s is at least 4.5 to 1', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
