// @ts-check
// Creating, editing, resubmitting, cancelling and deleting requests, plus the read queries
// the screens use. SPEC sections 4.5, 4.8, 4.9 and 5.

import { RuleError } from '../domain/errors.js';
import { toSar } from '../domain/money.js';
import { nextStatus, isFinal } from '../domain/status.js';
import { denyReason, hasRole } from '../domain/permissions.js';
import { normalizeInput, validateRequestInput, isValidReason } from '../domain/validation.js';
import {
  approvalProgress,
  buildApprovalRows,
  currentRoundRows,
  isStalled,
  paymentDetailsChanged,
} from '../domain/rules.js';
import { workingDaysBetween } from '../domain/time.js';
import {
  allow,
  buildAttachment,
  checkFiles,
  checkVersion,
  getRequestOrThrow,
  maxFileMb,
  storeAttachments,
  touched,
  writeLog,
} from './context.js';

/** @typedef {import('./context.js').Deps} Deps */
/** @typedef {import('../data/typedefs.js').User} User */
/** @typedef {import('../data/typedefs.js').FileInput} FileInput */

/** @param {Deps} deps */
export function createRequestServices(deps) {
  const { repo, clock, newId } = deps;

  async function rateMap() {
    const rows = await repo.listFxRates();
    return Object.fromEntries(rows.map((r) => [r.currency, r.rateToSar]));
  }

  /** Throws a validation RuleError listing the wrong fields.
   * @param {Record<string, any>} input @param {Record<string, number>} rates
   * @param {FileInput[] | null} documents  null when documents are not checked (editing) */
  async function assertValid(input, rates, documents) {
    const errors = validateRequestInput(input, { rates });
    if (documents) {
      if (documents.length === 0) errors.paymentDocs = 'validation.paymentDocs';
      else {
        try {
          await checkFiles(deps, documents);
        } catch (err) {
          if (err instanceof RuleError) errors.paymentDocs = err.key;
          else throw err;
        }
      }
    }
    if (Object.keys(errors).length > 0)
      throw new RuleError('errors.validation', { fields: errors });
  }

  /**
   * @param {User} actor
   * @param {Record<string, any>} input  beneficiary, bank, iban, category, movement, currency, amount, purpose
   * @param {FileInput[]} documents  payment documents (at least one)
   * @param {{sample?: boolean}} [opts]
   */
  async function createRequest(actor, input, documents = [], opts = {}) {
    allow('create', actor);
    const rates = await rateMap();
    await assertValid(input, rates, documents);
    const v = normalizeInput(input);
    const now = clock();
    const fxRate = rates[v.currency];
    /** @type {import('../data/typedefs.js').Request} */
    const request = {
      id: newId(),
      ref: await repo.nextReference(now),
      version: 1,
      createdById: actor.id,
      createdAt: now,
      updatedAt: now,
      statusChangedAt: now,
      status: 'submitted',
      round: 1,
      ...v,
      fxRate,
      amountSar: toSar(v.amount, fxRate),
      bankCreatedById: null,
      bankCreatedAt: null,
      bankedDetails: null,
      transferredById: null,
      transferredAt: null,
      transferRef: null,
      closedReason: null,
      isSample: !!opts.sample,
    };
    await repo.insertRequest(request);
    await storeAttachments(
      deps,
      documents.map((f) => buildAttachment(deps, actor, request, 'payment_doc', f)),
    );
    await writeLog(deps, actor, request, 'created', { amountSar: request.amountSar });
    return request;
  }

  /**
   * Edit while Submitted or Returned. In Returned the round has ended, so amount and currency
   * may change; the resubmit then follows the "payment details changed" path.
   * @param {User} actor @param {string} id @param {Record<string, any>} input @param {number} [version]
   */
  async function updateRequest(actor, id, input, version) {
    const request = await getRequestOrThrow(deps, id);
    checkVersion(request, version);
    allow('edit', actor, request);
    const rates = await rateMap();
    await assertValid(input, rates, null);
    const v = normalizeInput(input);
    const fxRate = rates[v.currency];
    const changed = Object.keys(v).filter(
      (k) => /** @type {any} */ (v)[k] !== /** @type {any} */ (request)[k],
    );
    const saved = await repo.updateRequest(
      touched({ ...request, ...v, fxRate, amountSar: toSar(v.amount, fxRate) }, deps),
      request.version,
    );
    await writeLog(deps, actor, saved, 'edited', { changed });
    return saved;
  }

  /** @param {User} actor @param {string} id @param {number} [version] */
  async function resubmit(actor, id, version) {
    const request = await getRequestOrThrow(deps, id);
    checkVersion(request, version);
    allow('resubmit', actor, request);
    const now = clock();
    const detailsChanged = paymentDetailsChanged(request);
    const status = /** @type {any} */ (nextStatus(request.status, 'resubmit', { detailsChanged }));
    const round = request.round + 1;
    /** @type {import('../data/typedefs.js').Request} */
    let next = {
      ...request,
      status,
      round,
      statusChangedAt: now,
      closedReason: null,
      updatedAt: now,
    };
    if (detailsChanged) {
      next = { ...next, bankCreatedById: null, bankCreatedAt: null, bankedDetails: null };
    }
    const saved = await repo.updateRequest(next, request.version);
    if (!detailsChanged) {
      await repo.saveApprovals(buildApprovalRows({ requestId: id, round, newId }));
    }
    await writeLog(deps, actor, saved, 'resubmitted', {
      round,
      backToBankOps: detailsChanged,
    });
    return saved;
  }

  /** @param {User} actor @param {string} id @param {string} reason @param {number} [version] */
  async function cancelRequest(actor, id, reason, version) {
    const request = await getRequestOrThrow(deps, id);
    checkVersion(request, version);
    allow('cancel', actor, request);
    if (!isValidReason(reason)) throw new RuleError('validation.reason');
    const now = clock();
    const saved = await repo.updateRequest(
      {
        ...request,
        status: /** @type {any} */ (nextStatus(request.status, 'cancel')),
        statusChangedAt: now,
        closedReason: reason.trim(),
        updatedAt: now,
      },
      request.version,
    );
    await writeLog(deps, actor, saved, 'cancelled', {
      reason: reason.trim(),
      from: request.status,
    });
    return saved;
  }

  /** @param {User} actor @param {string} id */
  async function deleteRequest(actor, id) {
    const request = await getRequestOrThrow(deps, id);
    allow('delete', actor, request);
    await repo.deleteRequest(id);
    await writeLog(deps, actor, request, 'deleted', { status: request.status });
  }

  // ---- queries used by the screens --------------------------------------------------------

  /** Requests this user may see (creators see only their own). @param {User} actor */
  async function listVisibleRequests(actor) {
    const all = await repo.listRequests();
    return all.filter((r) => denyReason('view', actor, r) === null);
  }

  /** Everything the request page needs. @param {User} actor @param {string} ref */
  async function getRequestDetail(actor, ref) {
    const request = await repo.getRequestByRef(ref);
    if (!request || denyReason('view', actor, request)) throw new RuleError('errors.notFound');
    const [approvals, attachments, bankStatus, log, users] = await Promise.all([
      repo.listApprovals(request.id),
      repo.listAttachments(request.id),
      repo.getBankStatus(request.id),
      repo.listLog(request.id),
      usersById(),
    ]);
    return {
      request,
      approvals,
      currentApprovals: currentRoundRows(approvals, request.round),
      attachments,
      bankStatus,
      log,
      users,
    };
  }

  /**
   * The "My approvals" screen: what is waiting for this user, oldest first, with the names
   * and stage labels needed to show it. @param {User} actor
   */
  async function getApprovalQueue(actor) {
    const [items, users] = await Promise.all([myApprovals(actor), usersById()]);
    const nowIso = clock();
    return {
      users,
      items: items.map(({ request, stage }) => ({
        request,
        stage,
        workingDays: workingDaysBetween(request.statusChangedAt, nowIso),
      })),
    };
  }

  /**
   * Stages waiting for this user: pending, on requests they did not create, when they hold the
   * `approver` role. Oldest first. @param {User} actor
   */
  async function myApprovals(actor) {
    if (!hasRole(actor, 'approver')) return [];
    const [requests, allApprovals] = await Promise.all([
      repo.listRequests(),
      repo.listAllApprovals(),
    ]);
    /** @type {{request: import('../data/typedefs.js').Request, stage: import('../data/typedefs.js').Approval}[]} */
    const items = [];
    for (const request of requests) {
      const rows = currentRoundRows(
        allApprovals.filter((a) => a.requestId === request.id),
        request.round,
      );
      for (const stage of rows) {
        if (stage.status !== 'pending') continue;
        if (denyReason('decide', actor, request, { stage, approvals: rows })) continue;
        items.push({ request, stage });
      }
    }
    return items.sort((a, b) => a.request.statusChangedAt.localeCompare(b.request.statusChangedAt));
  }

  /** @returns {Promise<Record<string, User>>} */
  async function usersById() {
    return Object.fromEntries((await repo.listUsers()).map((u) => [u.id, u]));
  }

  /**
   * Everything the board needs in one call: the requests this user may see, each with its
   * approval progress, who it is waiting on and whether it is stalled.
   * @param {User} actor
   */
  async function getBoard(actor) {
    const [requests, allApprovals, users, settings] = await Promise.all([
      listVisibleRequests(actor),
      repo.listAllApprovals(),
      usersById(),
      repo.getSettings(),
    ]);
    const nowIso = clock();
    const stalledDays = Number(settings.stalledDays) > 0 ? Number(settings.stalledDays) : 3;
    /** @type {Record<string, import('../data/typedefs.js').Approval[]>} */
    const byRequest = {};
    for (const a of allApprovals) (byRequest[a.requestId] ??= []).push(a);
    const items = requests.map((request) => {
      const rows = currentRoundRows(byRequest[request.id] ?? [], request.round);
      const approvalPhase = request.status === 'bank_created' || request.status === 'approving';
      return {
        request,
        progress: approvalProgress(rows),
        waitingOnApprover: approvalPhase && rows.some((r) => r.status === 'pending'),
        stalled: isStalled(request, nowIso, stalledDays),
        workingDays: isFinal(request.status)
          ? 0
          : workingDaysBetween(request.statusChangedAt, nowIso),
      };
    });
    return { items, users, nowIso, stalledDays };
  }

  /**
   * What the request form needs: exchange rates and the file size limit.
   * @param {User} actor
   */
  async function getFormContext(actor) {
    allow('create', actor);
    const [rates, mb] = await Promise.all([rateMap(), maxFileMb(deps)]);
    return { rates, maxFileMb: mb };
  }

  return {
    createRequest,
    updateRequest,
    resubmit,
    cancelRequest,
    deleteRequest,
    listVisibleRequests,
    getRequestDetail,
    myApprovals,
    getApprovalQueue,
    getBoard,
    getFormContext,
  };
}
