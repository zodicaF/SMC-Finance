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

// Text/background pairs actually used in the app, per the SMC Portals Brand Guideline's
// colour tokens (public/assets/tokens.css). `entity-smc` (yellow) is excluded on purpose:
// the guideline itself flags it as only 1.1:1 on white, and it is only ever used as a
// stripe/avatar fill, never as a text colour.
const PAIRS = [
  ['ink', 'surface-page'],
  ['ink', 'surface-card'],
  ['ink', 'surface-sunken'],
  ['ink', 'accent-soft'],
  ['ink-2', 'surface-page'],
  ['ink-2', 'surface-card'],
  ['ink-muted', 'surface-page'],
  ['ink-muted', 'surface-card'],
  ['accent', 'surface-card'],
  ['accent', 'surface-page'],
  ['on-accent', 'accent'],
  ['on-accent', 'accent-hover'],
  ['accent-ink', 'accent-soft'],
  ['success-ink', 'success-bg'],
  ['warning-ink', 'warning-bg'],
  ['warning-panel-ink', 'warning-panel'],
  ['danger-ink', 'danger-bg'],
  ['danger-ink', 'surface-card'],
  ['on-accent', 'danger-ink'],
];

describe('colour contrast', () => {
  it.each(PAIRS)('%s on %s is at least 4.5 to 1', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
