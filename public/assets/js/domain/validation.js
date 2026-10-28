// @ts-check
// Field validation (SPEC section 7). Each check returns an i18n key or null/empty.

import { hasAtMost2Decimals } from './money.js';
import {
  CATEGORIES,
  MOVEMENTS,
  ALLOWED_FILE_EXT,
  ALLOWED_FILE_MIME,
  accountOf,
} from '../data/lookups.js';

/** @typedef {import('../data/typedefs.js').FileInput} FileInput */

export const MIN_REASON_LENGTH = 5;

/**
 * Uppercase, Latin digits, nothing but letters and digits. Arabic or Persian digits typed on an
 * Arabic keyboard become 0-9; spaces, dashes and the invisible direction marks that come along
 * when copying from an Arabic page are dropped.
 * @param {string} iban
 */
export const normalizeIban = (iban) =>
  (iban ?? '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[\s\u00A0\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF-]/g, '')
    .toUpperCase();

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
 * shape — with its check digits verified, or a plain account number. Returns the message key
 * for what is wrong, telling a wrong shape apart from check digits that don't match (the
 * number has the right shape but a digit is mistyped).
 * @param {string} value
 * @returns {'validation.iban' | 'validation.ibanCheck' | null}
 */
export function accountOrIbanProblem(value) {
  const v = normalizeIban(value);
  if (v === '') return 'validation.iban';
  if (/^[A-Z]{2}\d/.test(v)) {
    const shapeOk = v.startsWith('SA')
      ? /^SA\d{22}$/.test(v)
      : /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v);
    if (!shapeOk) return 'validation.iban';
    return ibanChecksumValid(v) ? null : 'validation.ibanCheck';
  }
  return isPlainAccountNumber(v) ? null : 'validation.iban';
}

/** @param {string} value */
export const isValidAccountOrIban = (value) => accountOrIbanProblem(value) === null;

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
  const fromAccountId = String(input.fromAccountId ?? '').trim();
  const account = accountOf(fromAccountId);
  return {
    requesterName: String(input.requesterName ?? '').trim(),
    seniorApproverId: String(input.seniorApproverId ?? '').trim(),
    beneficiary: String(input.beneficiary ?? '').trim(),
    bank: String(input.bank ?? '').trim(),
    iban: normalizeIban(String(input.iban ?? '')),
    category: String(input.category ?? ''),
    movement,
    // Only external transfers carry a SWIFT/BIC code; an internal one never stores a stale value.
    swiftCode: movement === 'external' ? normalizeSwift(String(input.swiftCode ?? '')) : '',
    fromAccountId,
    // The chosen account's own currency is authoritative, never whatever the client sent -
    // this is what "locks" the request's currency to the account paying it.
    currency: account ? account.currency : String(input.currency ?? '').trim().toUpperCase(),
    amount: Number(input.amount),
    purpose: String(input.purpose ?? '').trim(),
  };
}

/**
 * @param {Record<string, any>} input
 * @param {{rates: Record<string, number>, seniorApproverIds?: string[], creatorId?: string}} ctx
 *   rate to SAR by currency, the ids of users who currently hold the `senior_approver` role,
 *   and whose request it is (they can't be its senior approver)
 * @returns {Record<string, string>}  field name -> i18n key. Empty when valid.
 */
export function validateRequestInput(input, { rates, seniorApproverIds = [], creatorId }) {
  const v = normalizeInput(input);
  /** @type {Record<string, string>} */
  const errors = {};
  if (v.requesterName.length < 2 || v.requesterName.length > 120) {
    errors.requesterName = 'validation.requesterName';
  }
  if (creatorId && v.seniorApproverId === creatorId) {
    errors.seniorApproverId = 'validation.selfApprover';
  } else if (!seniorApproverIds.includes(v.seniorApproverId)) {
    errors.seniorApproverId = 'validation.seniorApprover';
  }
  if (v.beneficiary.length < 2 || v.beneficiary.length > 120) {
    errors.beneficiary = 'validation.beneficiary';
  }
  if (v.bank.length > 120) errors.bank = 'validation.bank';
  const ibanProblem = accountOrIbanProblem(v.iban);
  if (ibanProblem) errors.iban = ibanProblem;
  if (!accountOf(v.fromAccountId)) errors.fromAccountId = 'validation.fromAccount';
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
