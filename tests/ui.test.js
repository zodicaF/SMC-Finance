import { describe, it, expect } from 'vitest';
import { html, raw, escapeHtml } from '../public/assets/js/ui/html.js';
import { mount } from '../public/assets/js/ui/dom.js';
import { t, setLang, getLang, getDir, dictionaryKeys } from '../public/assets/js/i18n/index.js';
import { fmtAmount, fmtDate, fmtSize } from '../public/assets/js/i18n/format.js';
import { parseHash, requestHash } from '../public/assets/js/router.js';

describe('html template (the injection guard)', () => {
  it('escapes script tags and quotes in text and attributes', () => {
    const evil = '<script>alert(1)</script>"\'&';
    const out = html`<p title="${evil}">${evil}</p>`.toString();
    expect(out).not.toContain('<script>');
    expect(out).toBe(
      '<p title="&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#39;&amp;">&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#39;&amp;</p>',
    );
  });
  it('does not escape nested templates twice, and joins arrays', () => {
    const items = ['a<b', 'c'].map((x) => html`<li>${x}</li>`);
    expect(html`<ul>${items}</ul>`.toString()).toBe('<ul><li>a&lt;b</li><li>c</li></ul>');
  });
  it('drops null, undefined and booleans', () => {
    expect(html`[${null}${undefined}${false}${true}]`.toString()).toBe('[]');
  });
  it('shows 0 and strings that look like markup as text', () => {
    expect(html`${0}|${'<b>'}`.toString()).toBe('0|&lt;b&gt;');
    expect(escapeHtml('<')).toBe('&lt;');
  });
  it('raw() is the explicit opt-out', () => {
    expect(html`${raw('<b>x</b>')}`.toString()).toBe('<b>x</b>');
  });
  it('mount() refuses a plain string', () => {
    expect(() => mount({ innerHTML: '' }, '<b>x</b>')).toThrow(TypeError);
  });
});

describe('translations', () => {
  it('has the same keys in Arabic and English', () => {
    expect([...dictionaryKeys.ar].sort()).toEqual([...dictionaryKeys.en].sort());
  });
  it('has no empty text', () => {
    setLang('ar');
    for (const key of dictionaryKeys.ar) expect(t(key).trim().length, key).toBeGreaterThan(0);
  });
  it('switches language and direction, and falls back to the key', () => {
    setLang('en');
    expect(getLang()).toBe('en');
    expect(getDir()).toBe('ltr');
    expect(t('status.ready')).toBe('Ready to transfer');
    expect(t('no.such.key')).toBe('no.such.key');
    setLang('ar');
    expect(getDir()).toBe('rtl');
    expect(t('status.ready')).toBe('جاهزة للتحويل');
    setLang('de');
    expect(getLang()).toBe('ar');
  });
  it('fills {placeholders}', () => {
    // no key uses one yet; the mechanism is checked through the fallback path
    expect(t('Hello {name}', { name: 'Ali' })).toBe('Hello Ali');
  });
});

describe('formatting', () => {
  it('formats amounts with 2 decimals, Latin digits, currency after', () => {
    expect(fmtAmount(1850000, 'SAR')).toBe('1,850,000.00 SAR');
    expect(fmtAmount(0.5, 'USD')).toBe('0.50 USD');
  });
  it('formats dates in Riyadh time', () => {
    expect(fmtDate('2026-10-24T07:12:00Z', 'en')).toBe('24 Oct 2026 · 10:12');
    expect(fmtDate('2026-10-24T07:12:00Z', 'ar')).toMatch(/2026/);
    expect(fmtDate('2026-10-24T07:12:00Z', 'ar')).toMatch(/10:12/);
  });
  it('formats file sizes', () => {
    expect(fmtSize(512)).toBe('512 B');
    expect(fmtSize(2048)).toBe('2 KB');
    expect(fmtSize(1572864)).toBe('1.5 MB');
  });
});

describe('router', () => {
  it('parses the known routes', () => {
    expect(parseHash('')).toEqual({ name: 'board', params: {} });
    expect(parseHash('#/board').name).toBe('board');
    expect(parseHash('#/approvals').name).toBe('approvals');
    expect(parseHash('#/bank').name).toBe('bank');
    expect(parseHash('#/admin').name).toBe('admin');
    expect(parseHash('#/request/TRF-20261024-0001')).toEqual({
      name: 'request',
      params: { ref: 'TRF-20261024-0001' },
    });
  });
  it('sends anything else to the not-found screen', () => {
    expect(parseHash('#/nope').name).toBe('notfound');
    expect(parseHash('#/request/abc').name).toBe('notfound');
    expect(parseHash('#/request/TRF-1/extra').name).toBe('notfound');
  });
  it('builds a request link', () => {
    expect(requestHash('TRF-20261024-0001')).toBe('#/request/TRF-20261024-0001');
  });
});
