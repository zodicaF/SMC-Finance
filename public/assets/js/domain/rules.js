// @ts-check
// Approval rules (SPEC section 4). Pure functions: no storage, no clock.

import { isFinal } from './status.js';
import { workingDaysBetween } from './time.js';

/** @typedef {import('../data/typedefs.js').Approval} Approval */
/** @typedef {import('../data/typedefs.js').Request} Request */
/** @typedef {import('../data/typedefs.js').PaymentDetails} PaymentDetails */

/**
 * The two pending approval rows for a request, created when it becomes `bank_created`: stage 1
 * (senior) assigned to whoever the requester chose, then stage 2 (manager), open to anyone
 * holding the `manager_approver` role. Stage 2 cannot be decided until stage 1 is approved (see
 * `domain/permissions.js`).
 * @param {{requestId: string, round: number, newId: () => string, seniorApproverId: string}} p
 * @returns {Approval[]}
 */
export function buildApprovalRows({ requestId, round, newId, seniorApproverId }) {
  /** @param {number} stageOrder @param {string | null} assignedToId */
  const row = (stageOrder, assignedToId) => ({
    id: newId(),
    requestId,
    round,
    stageOrder,
    status: /** @type {const} */ ('pending'),
    decidedById: null,
    onBehalf: false,
    evidenceId: null,
    note: null,
    decidedAt: null,
    assignedToId,
  });
  return [row(1, seniorApproverId), row(2, null)];
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
    fromAccountId: r.fromAccountId ?? '',
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
    now.swiftCode !== (banked.swiftCode ?? '') ||
    now.amount !== banked.amount ||
    now.currency !== banked.currency ||
    // recorded before the paying account was part of the details: can't tell, so no change
    (banked.fromAccountId !== undefined && now.fromAccountId !== banked.fromAccountId)
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
