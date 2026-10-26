// @ts-check
// Amounts and dates for display. Latin digits in both languages; dates in Riyadh time.

/**
 * 1850000, 'SAR' -> '1,850,000.00 SAR'
 * @param {number} amount @param {string} currency
 */
export function fmtAmount(amount, currency) {
  const n = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${n} ${currency}`;
}

/**
 * '2026-10-24T07:12:00Z' -> '24 Oct 2026 · 10:12'
 * @param {string} iso @param {'ar' | 'en'} lang
 */
export function fmtDate(iso, lang) {
  const locale = lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB';
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Riyadh',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${day} · ${time}`;
}

/** 1234567 -> '1.2 MB'. @param {number} bytes */
export function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
