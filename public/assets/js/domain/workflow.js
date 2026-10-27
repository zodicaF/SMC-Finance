// @ts-check
// The request's journey as six steps for the tracker: submitted, entered in the bank, senior
// approval, manager approval, transfer executed, confirmed by the bank. Pure: it reads the
// request, the current round's approvals and the bank-side status, nothing else.

import { STATUS } from './status.js';

/** @typedef {import('../data/typedefs.js').Request} Request */
/** @typedef {import('../data/typedefs.js').Approval} Approval */
/** @typedef {import('../data/typedefs.js').BankStatus} BankStatus */

/** @typedef {'submitted' | 'bank' | 'senior' | 'manager' | 'transfer' | 'debit'} StepKey */
/**
 * done: finished. current: this is where the request is now. waiting: not reached yet.
 * rejected: an approver said no (the request went back to the requester). stopped: the request
 * was cancelled here. attention: the bank is holding the transfer for review.
 * @typedef {'done' | 'current' | 'waiting' | 'rejected' | 'stopped' | 'attention'} StepState
 */

/**
 * @typedef {Object} WorkflowStep
 * @property {StepKey} key
 * @property {StepState} state
 * @property {string | null} actorId  who completed (or rejected) it
 * @property {string | null} at  when, ISO
 * @property {string | null} assignedToId  who it is waiting on, when that is one person
 * @property {boolean} onBehalf  recorded by bank ops on the approver's behalf
 * @property {string | null} reference  the bank's transfer reference (transfer step)
 */

/**
 * @param {{request: Request, approvals: Approval[], bankStatus: BankStatus | null}} input
 *   `approvals` = the current round's rows
 * @returns {{steps: WorkflowStep[], done: number, total: number, finished: boolean}}
 */
export function workflowSteps({ request: r, approvals, bankStatus }) {
  const stage = (/** @type {number} */ n) => approvals.find((a) => a.stageOrder === n) ?? null;
  const senior = stage(1);
  const manager = stage(2);

  /** @param {StepKey} key @param {Partial<WorkflowStep> & {outcome: 'done' | 'rejected' | 'attention' | 'open'}} p */
  const raw = (key, p) => ({
    key,
    outcome: p.outcome,
    actorId: p.actorId ?? null,
    at: p.at ?? null,
    assignedToId: p.assignedToId ?? null,
    onBehalf: p.onBehalf ?? false,
    reference: p.reference ?? null,
  });
  /** @param {Approval | null} row */
  const approvalOutcome = (row) =>
    row?.status === 'approved' ? 'done' : row?.status === 'rejected' ? 'rejected' : 'open';

  const transferred = r.status === STATUS.TRANSFERRED;
  const rawSteps = [
    raw('submitted', { outcome: 'done', actorId: r.createdById, at: r.createdAt }),
    raw('bank', {
      outcome: r.bankCreatedAt ? 'done' : 'open',
      actorId: r.bankCreatedById,
      at: r.bankCreatedAt,
    }),
    raw('senior', {
      outcome: approvalOutcome(senior),
      actorId: senior?.decidedById ?? null,
      at: senior?.decidedAt ?? null,
      assignedToId: senior?.assignedToId ?? r.seniorApproverId,
      onBehalf: senior?.onBehalf ?? false,
    }),
    raw('manager', {
      outcome: approvalOutcome(manager),
      actorId: manager?.decidedById ?? null,
      at: manager?.decidedAt ?? null,
      onBehalf: manager?.onBehalf ?? false,
    }),
    raw('transfer', {
      outcome: transferred ? 'done' : 'open',
      actorId: r.transferredById,
      at: r.transferredAt,
      reference: r.transferRef,
    }),
    raw('debit', {
      outcome:
        bankStatus?.state === 'debited'
          ? 'done'
          : transferred && bankStatus?.state === 'review'
            ? 'attention'
            : 'open',
      actorId: bankStatus?.updatedById ?? null,
      at: bankStatus?.updatedAt ?? null,
    }),
  ];

  const cancelled = r.status === STATUS.CANCELLED;
  const returned = r.status === STATUS.RETURNED;
  let blocked = false;
  /** @type {WorkflowStep[]} */
  const steps = rawSteps.map(({ outcome, ...step }) => {
    /** @type {StepState} */
    let state;
    if (blocked) state = 'waiting';
    else if (outcome === 'done') state = 'done';
    else {
      blocked = true;
      if (outcome === 'rejected') state = 'rejected';
      else if (cancelled) state = 'stopped';
      else if (outcome === 'attention') state = 'attention';
      // returned: nothing moves until the requester fixes it, so no step is "now"
      else state = returned ? 'waiting' : 'current';
    }
    return { ...step, state };
  });

  const done = steps.filter((s) => s.state === 'done').length;
  return { steps, done, total: steps.length, finished: done === steps.length };
}
