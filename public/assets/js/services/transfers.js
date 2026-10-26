// @ts-check
// Executing the transfer. SPEC section 4.6.

import { RuleError } from '../domain/errors.js';
import { nextStatus } from '../domain/status.js';
import {
  allow,
  buildAttachment,
  checkFiles,
  checkVersion,
  getRequestOrThrow,
  storeAttachments,
  writeLog,
} from './context.js';
import { newBankStatus } from './approvals.js';

/** @typedef {import('./context.js').Deps} Deps */
/** @typedef {import('../data/typedefs.js').User} User */
/** @typedef {import('../data/typedefs.js').FileInput} FileInput */

/** @param {Deps} deps */
export function createTransferServices(deps) {
  const { repo, clock } = deps;

  /**
   * Bank ops mark a Ready request as transferred. The bank reference and a receipt are required.
   * @param {User} actor @param {string} id @param {string} bankReference
   * @param {FileInput[]} receiptFiles @param {number} [version]
   */
  async function markTransferred(actor, id, bankReference, receiptFiles = [], version) {
    const request = await getRequestOrThrow(deps, id);
    checkVersion(request, version);
    allow('markTransferred', actor, request);
    const reference = (bankReference ?? '').trim();
    if (!reference) throw new RuleError('validation.bankRef');
    await checkFiles(deps, receiptFiles);
    const existing = (await repo.listAttachments(id)).filter((a) => a.kind === 'transfer_receipt');
    if (receiptFiles.length === 0 && existing.length === 0)
      throw new RuleError('validation.receipt');

    const now = clock();
    const saved = await repo.updateRequest(
      {
        ...request,
        status: /** @type {any} */ (nextStatus(request.status, 'transfer')),
        statusChangedAt: now,
        transferredById: actor.id,
        transferredAt: now,
        transferRef: reference,
        updatedAt: now,
      },
      request.version,
    );
    await storeAttachments(
      deps,
      receiptFiles.map((f) => buildAttachment(deps, actor, request, 'transfer_receipt', f)),
    );
    // An untouched "executing" status becomes "debited". A request held for review stays as is.
    const bank = (await repo.getBankStatus(id)) ?? newBankStatus(id);
    if (bank.state === 'executing') {
      await repo.saveBankStatus({
        ...bank,
        state: 'debited',
        updatedById: actor.id,
        updatedAt: now,
      });
    }
    await writeLog(deps, actor, saved, 'transferred', { bankReference: reference });
    return saved;
  }

  return { markTransferred };
}
