// @ts-check
// Money helpers. Amounts are plain numbers with 2 decimals; always round with round2.

/** @param {number} n */
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Amount in SAR for a given currency amount and its rate to SAR.
 * @param {number} amount
 * @param {number} rateToSar
 */
export function toSar(amount, rateToSar) {
  return round2(amount * rateToSar);
}

/**
 * Reads an amount typed by a person: accepts Arabic-Indic digits, "," or "،" as thousands
 * separators and "٫" as the decimal point. Returns NaN when it is not a plain number.
 * @param {string} text
 */
export function parseAmountInput(text) {
  const latin = String(text ?? '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٫]/g, '.')
    .replace(/[,٬،\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(latin)) return NaN;
  return Number(latin);
}

/** True when the number has at most 2 decimals. @param {number} n */
export function hasAtMost2Decimals(n) {
  return round2(n) === n;
}
