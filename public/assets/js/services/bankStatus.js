// @ts-check
// Tracking a transfer at the bank. SPEC section 4.7.

import { RuleError } from '../domain/errors.js';
import { denyReason } from '../domain/permissions.js';
import { BANK_STATES, REASONS } from '../data/lookups.js';
import {
  allow,
  buildAttachment,
  checkFiles,
  checkVersion,
  getRequestOrThrow,
  storeAttachments,
  touched,
  writeLog,
} from './context.js';
import { newBankStatus } from './approvals.js';

/** @typedef {import('./context.js').Deps} Deps */
/** @typedef {import('../data/typedefs.js').User} User */
/** @typedef {import('../data/typedefs.js').FileInput} FileInput */

/** @param {Deps} deps */
export function createBankStatusServices(deps) {
  const { repo, clock } = deps;

  /**
   * @param {User} actor
   * @param {string} id
   * @param {{state: string, reasons?: string[], note?: string, followedUp?: boolean}} input
   * @param {number} [version]
   * @param {FileInput[]} [proofFiles]  proof the amount was debited; required the first time the
   *   state is set to `debited` (an already-attached proof satisfies a later save)
   */
  async function setBankStatus(actor, id, input, version, proofFiles = []) {
    const request = await getRequestOrThrow(deps, id);
    checkVersion(request, version);
    allow('setBankStatus', actor, request);
    if (!BANK_STATES.includes(input.state)) throw new RuleError('errors.notAllowed');
    const reasons = input.state === 'review' ? (input.reasons ?? []) : [];
    if (input.state === 'review' && reasons.length === 0)
      throw new RuleError('validation.reviewReasons');
    if (reasons.some((r) => !REASONS.some((x) => x.key === r)))
      throw new RuleError('validation.reviewReasons');
    if (input.state === 'debited') {
      await checkFiles(deps, proofFiles);
      const existing = (await repo.listAttachments(id)).filter((a) => a.kind === 'debit_proof');
      if (proofFiles.length === 0 && existing.length === 0)
        throw new RuleError('validation.debitProof');
    }

    const now = clock();
    const current = (await repo.getBankStatus(id)) ?? newBankStatus(id);
    const followedUp = !!input.followedUp;
    // Following up records the signed-in user and time once; it is cleared when unticked.
    const keepFollowUp = followedUp && current.followedUp;
    const next = {
      ...current,
      state: /** @type {any} */ (input.state),
      reasons,
      note: (input.note ?? '').trim(),
      followedUp,
      followedUpById: followedUp ? (keepFollowUp ? current.followedUpById : actor.id) : null,
      followedUpAt: followedUp ? (keepFollowUp ? current.followedUpAt : now) : null,
      updatedById: actor.id,
      updatedAt: now,
    };
    // Touch the request so a second person acting at the same moment gets a conflict.
    const saved = await repo.updateRequest(touched(request, deps), request.version);
    await repo.saveBankStatus(next);
    if (proofFiles.length > 0) {
      await storeAttachments(
        deps,
        proofFiles.map((f) => buildAttachment(deps, actor, request, 'debit_proof', f)),
      );
    }
    await writeLog(deps, actor, saved, 'bank_status', {
      from: current.state,
      to: next.state,
      reasons,
      followedUp,
    });
    return next;
  }

  /**
   * What the bank-status screen shows: the requests this user may see that are Ready or
   * Transferred, each with its bank status (a default one if none was saved yet) and the
   * bank-status lines of its history, oldest first. @param {User} actor
   */
  async function getBankList(actor) {
    const [requests, statuses, users] = await Promise.all([
      repo.listRequests(),
      repo.listBankStatuses(),
      repo.listUsers(),
    ]);
    const byId = Object.fromEntries(statuses.map((s) => [s.requestId, s]));
    const visible = requests.filter(
      (r) => (r.status === 'ready' || r.status === 'transferred') && !denyReason('view', actor, r),
    );
    const items = await Promise.all(
      visible.map(async (request) => ({
        request,
        bankStatus: byId[request.id] ?? newBankStatus(request.id),
        history: (await repo.listLog(request.id)).filter((e) => e.action === 'bank_status'),
        debitProofs: (await repo.listAttachments(request.id)).filter(
          (a) => a.kind === 'debit_proof',
        ),
      })),
    );
    return { items, users: Object.fromEntries(users.map((u) => [u.id, u])) };
  }

  return { setBankStatus, getBankList };
}
