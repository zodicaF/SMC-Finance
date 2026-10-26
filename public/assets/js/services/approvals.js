// @ts-check
// Bank entry and the approval stages. SPEC sections 4.2 to 4.4.

import { RuleError } from '../domain/errors.js';
import { nextStatus } from '../domain/status.js';
import { buildApprovalRows, currentRoundRows, paymentDetails } from '../domain/rules.js';
import { isValidReason } from '../domain/validation.js';
import {
  allow,
  buildAttachment,
  checkFiles,
  checkVersion,
  getRequestOrThrow,
  storeAttachments,
  writeLog,
} from './context.js';

/** @typedef {import('./context.js').Deps} Deps */
/** @typedef {import('../data/typedefs.js').User} User */
/** @typedef {import('../data/typedefs.js').FileInput} FileInput */
/** @typedef {'approve' | 'reject'} Decision */

/** A new bank-side status row, created when a request becomes Ready. @param {string} requestId */
export const newBankStatus = (requestId) => ({
  requestId,
  state: /** @type {const} */ ('executing'),
  reasons: [],
  note: '',
  followedUp: false,
  followedUpById: null,
  followedUpAt: null,
  updatedById: null,
  updatedAt: null,
});

/** @param {Deps} deps */
export function createApprovalServices(deps) {
  const { repo, clock, newId } = deps;

  /**
   * Bank ops confirm the transfer was entered in the bank system, with proof.
   * @param {User} actor @param {string} id @param {FileInput[]} proofFiles @param {number} [version]
   */
  async function markBankCreated(actor, id, proofFiles = [], version) {
    const request = await getRequestOrThrow(deps, id);
    checkVersion(request, version);
    allow('markBankCreated', actor, request);
    await checkFiles(deps, proofFiles);
    const existing = (await repo.listAttachments(id)).filter((a) => a.kind === 'bank_proof');
    if (proofFiles.length === 0 && existing.length === 0)
      throw new RuleError('validation.bankProof');

    const rows = buildApprovalRows({ requestId: id, round: request.round, newId });

    const now = clock();
    const saved = await repo.updateRequest(
      {
        ...request,
        status: /** @type {any} */ (nextStatus(request.status, 'bankCreated')),
        statusChangedAt: now,
        bankCreatedById: actor.id,
        bankCreatedAt: now,
        bankedDetails: paymentDetails(request),
        updatedAt: now,
      },
      request.version,
    );
    await storeAttachments(
      deps,
      proofFiles.map((f) => buildAttachment(deps, actor, request, 'bank_proof', f)),
    );
    await repo.saveApprovals(rows);
    await writeLog(deps, actor, saved, 'bank_created', { stages: rows.length });
    return saved;
  }

  /**
   * Shared by decideStage and recordOnBehalf.
   * @param {{actor: User, request: import('../data/typedefs.js').Request,
   *   stage: import('../data/typedefs.js').Approval,
   *   rows: import('../data/typedefs.js').Approval[], decision: Decision, note: string,
   *   onBehalf: boolean, evidence?: ReturnType<typeof buildAttachment>}} p
   */
  async function applyDecision({
    actor,
    request,
    stage,
    rows,
    decision,
    note,
    onBehalf,
    evidence,
  }) {
    const now = clock();
    const rejected = decision === 'reject';
    const decided = {
      ...stage,
      status: /** @type {'rejected' | 'approved'} */ (rejected ? 'rejected' : 'approved'),
      decidedById: actor.id,
      decidedAt: now,
      note: note.trim() || null,
      onBehalf,
      evidenceId: evidence ? evidence.meta.id : null,
    };
    const newRows = rows.map((r) => (r.id === stage.id ? decided : r));
    const status = /** @type {any} */ (nextStatus(request.status, 'decision', { rows: newRows }));
    // Updating the request first is the gate: if someone else got there first, this throws
    // ConflictError before anything else is written.
    const saved = await repo.updateRequest(
      {
        ...request,
        status,
        statusChangedAt: status !== request.status ? now : request.statusChangedAt,
        closedReason: rejected ? note.trim() : request.closedReason,
        updatedAt: now,
      },
      request.version,
    );
    if (evidence) await storeAttachments(deps, [evidence]);
    await repo.saveApprovals([decided]);
    if (status === 'ready') await repo.saveBankStatus(newBankStatus(request.id));
    const action = `${rejected ? 'rejected' : 'approved'}${onBehalf ? '_on_behalf' : ''}`;
    await writeLog(deps, actor, saved, action, {
      stageOrder: stage.stageOrder,
      from: request.status,
      to: status,
      note: decided.note,
    });
    return saved;
  }

  /** @param {Deps} d @param {string} id @param {number} round */
  async function loadRound(d, id, round) {
    return currentRoundRows(await d.repo.listApprovals(id), round);
  }

  /**
   * The approver of the stage approves or rejects it.
   * @param {User} actor @param {string} id @param {number} stageOrder @param {Decision} decision
   * @param {string} [note]  required (5+ characters) when rejecting
   * @param {number} [version]
   */
  async function decideStage(actor, id, stageOrder, decision, note = '', version) {
    const request = await getRequestOrThrow(deps, id);
    checkVersion(request, version);
    const rows = await loadRound(deps, id, request.round);
    const stage = rows.find((r) => r.stageOrder === stageOrder);
    allow('decide', actor, request, { stage, approvals: rows });
    if (decision === 'reject' && !isValidReason(note)) throw new RuleError('validation.reason');
    return applyDecision({
      actor,
      request,
      stage: /** @type {any} */ (stage),
      rows,
      decision,
      note,
      onBehalf: false,
    });
  }

  /**
   * Bank ops record a decision given outside the app. Needs an evidence file, and is never
   * allowed on a request the user created.
   * @param {User} actor @param {string} id @param {number} stageOrder @param {Decision} decision
   * @param {string} note @param {FileInput | undefined} evidenceFile @param {number} [version]
   */
  async function recordOnBehalf(actor, id, stageOrder, decision, note, evidenceFile, version) {
    const request = await getRequestOrThrow(deps, id);
    checkVersion(request, version);
    const rows = await loadRound(deps, id, request.round);
    const stage = rows.find((r) => r.stageOrder === stageOrder);
    allow('recordOnBehalf', actor, request, { stage, approvals: rows });
    if (!evidenceFile) throw new RuleError('validation.evidence');
    await checkFiles(deps, [evidenceFile]);
    if (decision === 'reject' && !isValidReason(note)) throw new RuleError('validation.reason');
    return applyDecision({
      actor,
      request,
      stage: /** @type {any} */ (stage),
      rows,
      decision,
      note: note ?? '',
      onBehalf: true,
      evidence: buildAttachment(deps, actor, request, 'approval_evidence', evidenceFile),
    });
  }

  return { markBankCreated, decideStage, recordOnBehalf };
}
