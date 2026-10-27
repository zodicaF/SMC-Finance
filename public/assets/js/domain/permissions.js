// @ts-check
// Who can do what (SPEC section 2). `denyReason` returns null when allowed, or the i18n key of
// the reason. `canDo` is the yes/no version for the UI. Services use denyReason so a refused
// action explains itself.

import { STATUS, isApprovalPhase } from './status.js';

/** @typedef {import('../data/typedefs.js').User} User */
/** @typedef {import('../data/typedefs.js').Request} Request */
/** @typedef {import('../data/typedefs.js').Approval} Approval */
/**
 * @typedef {'view' | 'create' | 'edit' | 'markBankCreated' | 'decide' | 'recordOnBehalf' |
 *   'resubmit' | 'markTransferred' | 'setBankStatus' | 'cancel' | 'delete' | 'admin' |
 *   'export'} Action
 */

/** @param {User | null | undefined} user @param {string} role */
export const hasRole = (user, role) =>
  !!user && user.active && user.roles.includes(/** @type {any} */ (role));

/** @param {User} user @param {Request} request */
const isOwner = (user, request) => request.createdById === user.id;

/** True when an earlier stage of the round is not yet approved, so this one cannot be decided
 * yet (senior approval must come before manager approval).
 * @param {{stage?: Approval, approvals?: Approval[]}} ctx */
const stageLocked = (ctx) =>
  !!ctx.stage &&
  (ctx.approvals ?? []).some((a) => a.stageOrder < /** @type {Approval} */ (ctx.stage).stageOrder && a.status !== 'approved');

/** The two approvals come from two different people: is this user the assignee or the
 * decider of the round's other stage?
 * @param {User} user @param {{stage?: Approval, approvals?: Approval[]}} ctx */
const otherStageIsMine = (user, ctx) =>
  (ctx.approvals ?? []).some(
    (a) =>
      a.stageOrder !== ctx.stage?.stageOrder &&
      (a.assignedToId === user.id || (a.decidedById === user.id && !a.onBehalf)),
  );

/** One capacity per request: did this user act as bank ops on it (entered it in the bank, or
 * recorded a stage on someone's behalf this round)?
 * @param {User} user @param {Request} request @param {{approvals?: Approval[]}} ctx */
const actedAsBankOps = (user, request, ctx) =>
  request.bankCreatedById === user.id ||
  (ctx.approvals ?? []).some((a) => a.onBehalf && a.decidedById === user.id);

/** ...or as an approver on it (assigned to a stage, or decided one in person)?
 * @param {User} user @param {{approvals?: Approval[]}} ctx */
const actedAsApprover = (user, ctx) =>
  (ctx.approvals ?? []).some(
    (a) => a.assignedToId === user.id || (a.decidedById === user.id && !a.onBehalf),
  );

/**
 * @param {Action} action
 * @param {User | null | undefined} user
 * @param {Request} [request]
 * @param {{stage?: Approval, approvals?: Approval[]}} [ctx]  for 'decide' / 'recordOnBehalf':
 *   the stage and all approval rows of the request's current round
 * @returns {string | null}
 */
export function denyReason(action, user, request, ctx = {}) {
  if (!user || !user.active) return 'errors.inactive';
  const bankOps = hasRole(user, 'bank_ops');
  const admin = hasRole(user, 'admin');
  const creator = hasRole(user, 'creator');
  const status = request?.status;


  switch (action) {
    case 'view':
      if (!request) return 'errors.notFound';
      if (admin || bankOps || hasRole(user, 'manager_approver')) return null;
      if (creator && isOwner(user, request)) return null;
      // A senior approver sees only the requests whose requester picked them for stage 1.
      if (hasRole(user, 'senior_approver') && request.seniorApproverId === user.id) return null;
      return 'errors.notFound'; // never confirm that someone else's request exists

    case 'create':
      return creator || bankOps || admin ? null : 'errors.notAllowed';

    case 'export':
      return null; // any active user; the export itself only contains what they may see

    case 'edit':
      if (!request) return 'errors.notFound';
      if (!(admin || (creator && isOwner(user, request)))) return 'errors.notAllowed';
      return status === STATUS.SUBMITTED || status === STATUS.RETURNED
        ? null
        : 'errors.wrongStatus';

    case 'markBankCreated':
      if (!bankOps) return 'errors.notAllowed';
      return status === STATUS.SUBMITTED ? null : 'errors.wrongStatus';

    case 'decide': {
      if (!request) return 'errors.notFound';
      if (!isApprovalPhase(request.status)) return 'errors.wrongStatus';
      if (!ctx.stage) return 'errors.notFound';
      if (isOwner(user, request)) return 'errors.ownRequest';
      if (ctx.stage.status !== 'pending') return 'errors.stageDecided';
      if (stageLocked(ctx)) return 'errors.stageLocked';
      const eligible = ctx.stage.assignedToId
        ? user.id === ctx.stage.assignedToId && hasRole(user, 'senior_approver')
        : hasRole(user, 'manager_approver');
      if (!eligible) return 'errors.notYourStage';
      if (otherStageIsMine(user, ctx)) return 'errors.sameApprover';
      if (actedAsBankOps(user, request, ctx)) return 'errors.oneCapacity';
      return null;
    }

    case 'recordOnBehalf': {
      if (!bankOps) return 'errors.notAllowed';
      if (!request) return 'errors.notFound';
      if (!isApprovalPhase(request.status)) return 'errors.wrongStatus';
      if (!ctx.stage) return 'errors.notFound';
      // The manager approval is only ever given by a manager approver in person, in the app.
      if (ctx.stage.stageOrder === 2) return 'errors.managerInPerson';
      if (isOwner(user, request)) return 'errors.ownRequest';
      if (ctx.stage.status !== 'pending') return 'errors.stageDecided';
      if (stageLocked(ctx)) return 'errors.stageLocked';
      if (actedAsApprover(user, ctx)) return 'errors.oneCapacity';
      return null;
    }

    case 'resubmit':
      if (!request) return 'errors.notFound';
      if (!(admin || (creator && isOwner(user, request)))) return 'errors.notAllowed';
      return status === STATUS.RETURNED ? null : 'errors.wrongStatus';

    case 'markTransferred':
      if (!bankOps) return 'errors.notAllowed';
      return status === STATUS.READY ? null : 'errors.wrongStatus';

    case 'setBankStatus':
      if (!bankOps) return 'errors.notAllowed';
      return status === STATUS.READY || status === STATUS.TRANSFERRED ? null : 'errors.wrongStatus';

    case 'cancel': {
      if (!request) return 'errors.notFound';
      if (status === STATUS.TRANSFERRED || status === STATUS.CANCELLED) return 'errors.wrongStatus';
      if (admin) return null;
      if (creator && isOwner(user, request)) {
        return status === STATUS.SUBMITTED || status === STATUS.RETURNED
          ? null
          : 'errors.wrongStatus';
      }
      return 'errors.notAllowed';
    }

    case 'delete':
      if (!admin) return 'errors.notAllowed';
      if (!request) return 'errors.notFound';
      // round 1 only: a resubmit clears the bank entry, but an earlier round's history must stay
      return status === STATUS.SUBMITTED && !request.bankCreatedAt && request.round === 1
        ? null
        : 'errors.wrongStatus';

    case 'admin':
      return admin ? null : 'errors.notAllowed';

    default:
      return 'errors.notAllowed';
  }
}

/**
 * @param {Action} action
 * @param {User | null | undefined} user
 * @param {Request} [request]
 * @param {{stage?: Approval, approvals?: Approval[]}} [ctx]
 */
export const canDo = (action, user, request, ctx) =>
  denyReason(action, user, request, ctx) === null;
