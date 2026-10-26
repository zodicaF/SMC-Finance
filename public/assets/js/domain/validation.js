// @ts-check
// Field validation (SPEC section 7). Each check returns an i18n key or null/empty.

import { hasAtMost2Decimals } from './money.js';
import { CATEGORIES, MOVEMENTS, ALLOWED_FILE_EXT, ALLOWED_FILE_MIME } from '../data/lookups.js';

/** @typedef {import('../data/typedefs.js').FileInput} FileInput */

export const MIN_REASON_LENGTH = 5;

/** Uppercase, no spaces. @param {string} iban */
export const normalizeIban = (iban) => (iban ?? '').replace(/\s+/g, '').toUpperCase();

/**
 * The real check-digit algorithm banks use for an IBAN (ISO 7064 MOD-97-10): move the first
 * four characters to the end, turn every letter into two digits (A=10 ... Z=35), and the whole
 * number must leave remainder 1 when divided by 97. This is what catches a number that merely
 * "looks like" an IBAN — right length, right country code — but was never actually issued, so
 * typing something like "SA0000000000000000000000" is refused even though its shape is fine.
 * @param {string} v  normalised: uppercase, no spaces
 */
function ibanChecksumValid(v) {
  const rearranged = v.slice(4) + v.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

/** A plain bank account number has no universal checksum to verify against, so this only
 * rejects what is obviously not one: digits only, a realistic length. The bank itself is the
 * final check, when bank ops stages the transfer there. @param {string} v */
const isPlainAccountNumber = (v) => /^\d{8,24}$/.test(v);

/**
 * Required. Either a real IBAN — Saudi: `SA` + 22 digits; other countries: the same ISO 13616
 * shape — with its check digits verified, or a plain account number.
 * @param {string} value
 */
export function isValidAccountOrIban(value) {
  const v = normalizeIban(value);
  if (v === '') return false;
  if (/^[A-Z]{2}\d/.test(v)) {
    const shapeOk = v.startsWith('SA')
      ? /^SA\d{22}$/.test(v)
      : /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v);
    return shapeOk && ibanChecksumValid(v);
  }
  return isPlainAccountNumber(v);
}

/** A reason for rejecting or cancelling. @param {string} text */
export const isValidReason = (text) => (text ?? '').trim().length >= MIN_REASON_LENGTH;

/** Uppercase, no spaces. @param {string} swift */
export const normalizeSwift = (swift) => (swift ?? '').replace(/\s+/g, '').toUpperCase();

/**
 * A SWIFT/BIC code: 4 letters (bank), 2 letters (country), 2 letters-or-digits (location), and
 * an optional 3 letters-or-digits (branch). 8 or 11 characters total.
 * @param {string} value
 */
export function isValidSwift(value) {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(normalizeSwift(value));
}

/**
 * Trimmed, normalised copy of the form input.
 * @param {Record<string, any>} input
 */
export function normalizeInput(input) {
  const movement = /** @type {'internal' | 'external'} */ (String(input.movement ?? ''));
  return {
    beneficiary: String(input.beneficiary ?? '').trim(),
    bank: String(input.bank ?? '').trim(),
    iban: normalizeIban(String(input.iban ?? '')),
    category: String(input.category ?? ''),
    movement,
    // Only external transfers carry a SWIFT/BIC code; an internal one never stores a stale value.
    swiftCode: movement === 'external' ? normalizeSwift(String(input.swiftCode ?? '')) : '',
    currency: String(input.currency ?? ''),
    amount: Number(input.amount),
    purpose: String(input.purpose ?? '').trim(),
  };
}

/**
 * @param {Record<string, any>} input
 * @param {{rates: Record<string, number>}} ctx  rate to SAR by currency
 * @returns {Record<string, string>}  field name -> i18n key. Empty when valid.
 */
export function validateRequestInput(input, { rates }) {
  const v = normalizeInput(input);
  /** @type {Record<string, string>} */
  const errors = {};
  if (v.beneficiary.length < 2 || v.beneficiary.length > 120) {
    errors.beneficiary = 'validation.beneficiary';
  }
  if (v.bank.length > 120) errors.bank = 'validation.bank';
  if (!isValidAccountOrIban(v.iban)) errors.iban = 'validation.iban';
  if (!CATEGORIES.some((c) => c.key === v.category)) errors.category = 'validation.category';
  if (!MOVEMENTS.includes(v.movement)) errors.movement = 'validation.movement';
  if (v.movement === 'external' && !isValidSwift(v.swiftCode)) errors.swiftCode = 'validation.swift';
  if (!Object.hasOwn(rates, v.currency)) errors.currency = 'validation.currency';
  if (!Number.isFinite(v.amount) || v.amount <= 0 || !hasAtMost2Decimals(v.amount)) {
    errors.amount = 'validation.amount';
  }
  if (v.purpose.length > 500) errors.purpose = 'validation.purpose';
  return errors;
}

/**
 * @param {Pick<FileInput, 'name' | 'mime' | 'size'>} file
 * @param {number} maxMb
 * @returns {string | null}  i18n key, or null when fine
 */
export function validateFile(file, maxMb) {
  if (!ALLOWED_FILE_EXT.test(file.name) || !ALLOWED_FILE_MIME.includes(file.mime)) {
    return 'validation.fileType';
  }
  if (file.size > maxMb * 1024 * 1024) return 'validation.fileSize';
  return null;
}
