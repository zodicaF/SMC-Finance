// @ts-check
// The data behind the Excel export. Creators get their own requests only, everyone else all of
// them (SPEC section 2): the same visibility rule the board uses.

import { denyReason } from '../domain/permissions.js';
import { currentRoundRows, approvalProgress, isStalled } from '../domain/rules.js';
import { workingDaysBetween } from '../domain/time.js';
import { isFinal } from '../domain/status.js';
import { approvalsByRequest, stalledDaysOf } from './context.js';

/** @typedef {import('./context.js').Deps} Deps */
/** @typedef {import('../data/typedefs.js').User} User */

/** @param {Deps} deps */
export function createExportServices(deps) {
  const { repo, clock } = deps;

  /**
   * @param {User} actor
   * @param {string[]} [ids]  only these requests (what is on screen); all visible when omitted
   */
  async function getExportData(actor, ids) {
    const [requests, approvals, statuses, users, settings] = await Promise.all([
      repo.listRequests(),
      repo.listAllApprovals(),
      repo.listBankStatuses(),
      repo.listUsers(),
      repo.getSettings(),
    ]);
    const nowIso = clock();
    const stalledDays = stalledDaysOf(settings);
    const byRequest = approvalsByRequest(approvals);
    const wanted = ids ? new Set(ids) : null;
    const bankById = Object.fromEntries(statuses.map((s) => [s.requestId, s]));
    const items = requests
      .filter((r) => denyReason('view', actor, r) === null && (!wanted || wanted.has(r.id)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((request) => {
        const rows = currentRoundRows(byRequest[request.id] ?? [], request.round);
        return {
          request,
          progress: approvalProgress(rows),
          bankStatus: bankById[request.id] ?? null,
          stalled: isStalled(request, nowIso, stalledDays),
          workingDays: isFinal(request.status)
            ? 0
            : workingDaysBetween(request.statusChangedAt, nowIso),
        };
      });
    return { items, users: Object.fromEntries(users.map((u) => [u.id, u])), nowIso };
  }

  return { getExportData };
}
