// @ts-check
// Approval rules (SPEC section 4). Pure functions: no storage, no clock.

import { isFinal } from './status.js';
import { workingDaysBetween } from './time.js';

/** @typedef {import('../data/typedefs.js').Approval} Approval */
/** @typedef {import('../data/typedefs.js').Request} Request */
/** @typedef {import('../data/typedefs.js').PaymentDetails} PaymentDetails */

/**
 * The single pending approval row for a request, created when it becomes `bank_created`.
 * Any user with the `approver` role may decide it (see `domain/permissions.js`).
 * @param {{requestId: string, round: number, newId: () => string}} p
 * @returns {Approval[]}
 */
export function buildApprovalRows({ requestId, round, newId }) {
  return [
    {
      id: newId(),
      requestId,
      round,
      stageOrder: 1,
      status: 'pending',
      decidedById: null,
      onBehalf: false,
      evidenceId: null,
      note: null,
      decidedAt: null,
    },
  ];
}

/** Rows of the request's current round, in stage order.
 * @param {Approval[]} rows
 * @param {number} round
 */
export function currentRoundRows(rows, round) {
  return rows.filter((r) => r.round === round).sort((a, b) => a.stageOrder - b.stageOrder);
}

/** "2 of 3 approved". @param {Approval[]} roundRows */
export function approvalProgress(roundRows) {
  return {
    approved: roundRows.filter((r) => r.status === 'approved').length,
    total: roundRows.length,
  };
}

/** The fields that, when changed after bank entry, send the request back to bank ops.
 * @param {Request | PaymentDetails} r
 * @returns {PaymentDetails}
 */
export function paymentDetails(r) {
  return {
    beneficiary: (r.beneficiary ?? '').trim(),
    bank: (r.bank ?? '').trim(),
    iban: (r.iban ?? '').replace(/\s+/g, '').toUpperCase(),
    swiftCode: (r.swiftCode ?? '').replace(/\s+/g, '').toUpperCase(),
    amount: r.amount,
    currency: r.currency,
  };
}

/**
 * True when the payment details differ from what was entered in the bank (or when nothing
 * was recorded).
 * @param {Request} request
 */
export function paymentDetailsChanged(request) {
  const banked = request.bankedDetails;
  if (!banked) return true;
  const now = paymentDetails(request);
  return (
    now.beneficiary !== banked.beneficiary ||
    now.bank !== banked.bank ||
    now.iban !== banked.iban ||
    now.swiftCode !== banked.swiftCode ||
    now.amount !== banked.amount ||
    now.currency !== banked.currency
  );
}

/**
 * Stalled = not final, and in the same status for more than `stalledDays` working days
 * (Sunday to Thursday, Riyadh time).
 * @param {Request} request
 * @param {string} nowIso
 * @param {number} stalledDays
 */
export function isStalled(request, nowIso, stalledDays) {
  if (isFinal(request.status)) return false;
  return workingDaysBetween(request.statusChangedAt, nowIso) > stalledDays;
}
