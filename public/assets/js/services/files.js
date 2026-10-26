// @ts-check
// Adding files to a request later, and opening a stored file. SPEC section 8.

import { RuleError } from '../domain/errors.js';
import { denyReason } from '../domain/permissions.js';
import {
  allow,
  buildAttachment,
  checkFiles,
  getRequestOrThrow,
  storeAttachments,
  writeLog,
} from './context.js';

/** @typedef {import('./context.js').Deps} Deps */
/** @typedef {import('../data/typedefs.js').User} User */
/** @typedef {import('../data/typedefs.js').FileInput} FileInput */

/** @param {Deps} deps */
export function createFileServices(deps) {
  const { repo } = deps;

  /**
   * Add files to a request after it was created.
   * - payment documents: whoever may edit the request (its creator or an admin, while Submitted
   *   or Returned)
   * - bank proof: bank ops, while the request is waiting for its bank entry
   * @param {User} actor @param {string} id @param {'payment_doc' | 'bank_proof'} kind
   * @param {FileInput[]} files
   */
  async function addAttachment(actor, id, kind, files) {
    const request = await getRequestOrThrow(deps, id);
    if (kind === 'payment_doc') allow('edit', actor, request);
    else if (kind === 'bank_proof') allow('markBankCreated', actor, request);
    else throw new RuleError('errors.notAllowed');
    if (files.length === 0) {
      throw new RuleError(
        kind === 'bank_proof' ? 'validation.bankProof' : 'validation.paymentDocs',
      );
    }
    await checkFiles(deps, files);
    const items = files.map((f) => buildAttachment(deps, actor, request, kind, f));
    await storeAttachments(deps, items);
    for (const { meta } of items) {
      await writeLog(deps, actor, request, 'file_added', { kind, fileName: meta.fileName });
    }
    return items.map((i) => i.meta);
  }

  /**
   * The file itself, for preview or download. Only for someone who may see the request.
   * @param {User} actor @param {string} requestId @param {string} attachmentId
   */
  async function openAttachment(actor, requestId, attachmentId) {
    const request = await getRequestOrThrow(deps, requestId);
    if (denyReason('view', actor, request)) throw new RuleError('errors.notFound');
    const meta = (await repo.listAttachments(requestId)).find((a) => a.id === attachmentId);
    if (!meta) throw new RuleError('errors.notFound');
    return { meta, blob: await repo.openAttachment(attachmentId) };
  }

  return { addAttachment, openAttachment };
}
