// @ts-check
// Helpers shared by the services. A service function receives the signed-in user first
// (`actor`), then its arguments. `deps` holds the repository, the clock and the id maker so
// tests can control time and ids.

import { DEFAULT_SETTINGS } from '../data/lookups.js';
import { ConflictError, RuleError } from '../domain/errors.js';
import { denyReason } from '../domain/permissions.js';
import { validateFile } from '../domain/validation.js';

/** @typedef {import('../data/repository.js').Repository} Repository */
/** @typedef {import('../data/typedefs.js').User} User */
/** @typedef {import('../data/typedefs.js').Request} Request */
/** @typedef {import('../data/typedefs.js').FileInput} FileInput */
/** @typedef {import('../data/typedefs.js').AttachmentKind} AttachmentKind */
/** @typedef {{repo: Repository, clock: () => string, newId: () => string}} Deps */

/**
 * @param {{repo: Repository, clock?: () => string, newId?: () => string}} p
 * @returns {Deps}
 */
export function createDeps({
  repo,
  clock = () => new Date().toISOString(),
  newId = () => crypto.randomUUID(),
}) {
  return { repo, clock, newId };
}

/** @param {Deps} deps @param {string} id */
export async function getRequestOrThrow(deps, id) {
  const request = await deps.repo.getRequestById(id);
  if (!request) throw new RuleError('errors.notFound');
  return request;
}

/** Throws ConflictError when the caller worked from an older copy.
 * @param {Request} request @param {number | undefined} version */
export function checkVersion(request, version) {
  if (version !== undefined && version !== request.version) throw new ConflictError();
}

/** Throws a RuleError carrying the reason when the action is not allowed. */
export function allow(/** @type {Parameters<typeof denyReason>} */ ...args) {
  const reason = denyReason(...args);
  if (reason) throw new RuleError(reason);
}

/**
 * Append one line to the activity log. `details` is structured data, never a sentence.
 * @param {Deps} deps
 * @param {User} actor
 * @param {Request | null} request
 * @param {string} action
 * @param {Record<string, any>} [details]
 */
export async function writeLog(deps, actor, request, action, details = {}) {
  await deps.repo.appendLog({
    id: deps.newId(),
    requestId: request?.id ?? null,
    requestRef: request?.ref ?? '',
    actorId: actor.id,
    action,
    details,
    createdAt: deps.clock(),
  });
}

/** Approval rows grouped by request id, so a list never re-scans all approvals per request.
 * @param {import('../data/typedefs.js').Approval[]} rows
 * @returns {Record<string, import('../data/typedefs.js').Approval[]>} */
export function approvalsByRequest(rows) {
  /** @type {Record<string, import('../data/typedefs.js').Approval[]>} */
  const out = {};
  for (const a of rows) (out[a.requestId] ??= []).push(a);
  return out;
}

/** "Stalled after" in working days, from settings. @param {Record<string, string>} settings */
export function stalledDaysOf(settings) {
  const n = Number(settings.stalledDays);
  return n > 0 ? n : DEFAULT_SETTINGS.stalledDays;
}

/** Maximum file size in MB, from settings. @param {Deps} deps */
export async function maxFileMb(deps) {
  const settings = await deps.repo.getSettings();
  const mb = Number(settings.maxFileMb);
  return Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_SETTINGS.maxFileMb;
}

/**
 * Throws a RuleError with the first file problem found.
 * @param {Deps} deps @param {FileInput[]} files
 */
export async function checkFiles(deps, files) {
  const mb = await maxFileMb(deps);
  for (const file of files) {
    const problem = validateFile(file, mb);
    if (problem) throw new RuleError(problem, { fileName: file.name });
  }
}

/**
 * Metadata for a file about to be stored. Nothing is written yet.
 * @param {Deps} deps @param {User} actor @param {Request} request
 * @param {AttachmentKind} kind @param {FileInput} file
 */
export function buildAttachment(deps, actor, request, kind, file) {
  return {
    meta: {
      id: deps.newId(),
      requestId: request.id,
      kind,
      fileName: file.name,
      mime: file.mime,
      sizeBytes: file.size,
      uploadedById: actor.id,
      uploadedAt: deps.clock(),
      round: request.round,
    },
    blob: file.blob,
  };
}

/** Store files already prepared with buildAttachment.
 * @param {Deps} deps @param {ReturnType<typeof buildAttachment>[]} items */
export async function storeAttachments(deps, items) {
  for (const { meta, blob } of items) await deps.repo.addAttachment(meta, blob);
}

/** @param {Request} request @param {Deps} deps */
export const touched = (request, deps) => ({ ...request, updatedAt: deps.clock() });
