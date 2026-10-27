// @ts-check
// Amounts and dates for display. Latin digits in both languages; dates in Riyadh time.

/**
 * 1850000, 'SAR' -> '1,850,000.00 SAR'
 * @param {number} amount @param {string} currency
 */
export function fmtAmount(amount, currency) {
  return `${fmtNumber(amount)} ${currency}`;
}

/**
 * 125000 -> '125,000.00' (Latin digits, two decimals, no currency)
 * @param {number} amount
 */
export function fmtNumber(amount) {
  return NUMBER.format(amount);
}

// Building an Intl formatter is slow; long lists format thousands of values, so reuse them.
const NUMBER = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** @type {Map<string, {day: Intl.DateTimeFormat, time: Intl.DateTimeFormat}>} */
const DATE_FORMATS = new Map();
/** @param {string} locale */
function dateFormats(locale) {
  let f = DATE_FORMATS.get(locale);
  if (!f) {
    f = {
      day: new Intl.DateTimeFormat(locale, {
        timeZone: 'Asia/Riyadh',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      time: new Intl.DateTimeFormat(locale, {
        timeZone: 'Asia/Riyadh',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    };
    DATE_FORMATS.set(locale, f);
  }
  return f;
}

/**
 * '2026-10-24T07:12:00Z' -> '24 Oct 2026 · 10:12'
 * @param {string} iso @param {'ar' | 'en'} lang
 */
export function fmtDate(iso, lang) {
  const locale = lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB';
  const d = new Date(iso);
  const f = dateFormats(locale);
  return `${f.day.format(d)} · ${f.time.format(d)}`;
}

/** 1234567 -> '1.2 MB'. @param {number} bytes */
export function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
