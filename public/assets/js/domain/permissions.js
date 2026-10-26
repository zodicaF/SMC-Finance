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
      if (admin || bankOps || hasRole(user, 'approver')) return null;
      if (creator && isOwner(user, request)) return null;
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
      if (!hasRole(user, 'approver')) return 'errors.notYourStage';
      if (isOwner(user, request)) return 'errors.ownRequest';
      if (ctx.stage.status !== 'pending') return 'errors.stageDecided';
      return null;
    }

    case 'recordOnBehalf': {
      if (!bankOps) return 'errors.notAllowed';
      if (!request) return 'errors.notFound';
      if (!isApprovalPhase(request.status)) return 'errors.wrongStatus';
      if (!ctx.stage) return 'errors.notFound';
      if (isOwner(user, request)) return 'errors.ownRequest';
      if (ctx.stage.status !== 'pending') return 'errors.stageDecided';
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
      return status === STATUS.SUBMITTED && !request.bankCreatedAt ? null : 'errors.wrongStatus';

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
