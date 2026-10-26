// @ts-check
// Request statuses and the one place that decides what status comes next (SPEC section 3).

export const STATUS = Object.freeze({
  SUBMITTED: 'submitted',
  BANK_CREATED: 'bank_created',
  APPROVING: 'approving',
  READY: 'ready',
  TRANSFERRED: 'transferred',
  RETURNED: 'returned',
  CANCELLED: 'cancelled',
});

/** Board columns, left to right (Returned only shows when it has cards). */
export const BOARD_COLUMNS = [
  STATUS.RETURNED,
  STATUS.SUBMITTED,
  STATUS.BANK_CREATED,
  STATUS.APPROVING,
  STATUS.READY,
  STATUS.TRANSFERRED,
];

/** @param {string} status */
export const isFinal = (status) => status === STATUS.TRANSFERRED || status === STATUS.CANCELLED;

/** Statuses in which stages can be decided. @param {string} status */
export const isApprovalPhase = (status) =>
  status === STATUS.BANK_CREATED || status === STATUS.APPROVING;

/**
 * Status after the approvals of the current round change.
 * @param {{status: string}[]} rows  the current round's approval rows
 */
export function statusAfterApprovals(rows) {
  if (rows.some((r) => r.status === 'rejected')) return STATUS.RETURNED;
  if (rows.length > 0 && rows.every((r) => r.status === 'approved')) return STATUS.READY;
  if (rows.some((r) => r.status === 'approved')) return STATUS.APPROVING;
  return STATUS.BANK_CREATED;
}

/**
 * Next status for an event, or null when the event is not allowed from `from`.
 * Events: 'bankCreated', 'decision', 'resubmit', 'transfer', 'cancel'.
 * @param {string} from
 * @param {string} event
 * @param {{rows?: {status: string}[], detailsChanged?: boolean}} [ctx]
 * @returns {string | null}
 */
export function nextStatus(from, event, ctx = {}) {
  switch (event) {
    case 'bankCreated':
      return from === STATUS.SUBMITTED ? STATUS.BANK_CREATED : null;
    case 'decision':
      return isApprovalPhase(from) ? statusAfterApprovals(ctx.rows ?? []) : null;
    case 'resubmit':
      if (from !== STATUS.RETURNED) return null;
      return ctx.detailsChanged ? STATUS.SUBMITTED : STATUS.BANK_CREATED;
    case 'transfer':
      return from === STATUS.READY ? STATUS.TRANSFERRED : null;
    case 'cancel':
      return isFinal(from) ? null : STATUS.CANCELLED;
    default:
      return null;
  }
}
