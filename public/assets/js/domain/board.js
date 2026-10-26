// @ts-check
// Pure helpers for the board screen: which request goes in which column, the four stat tiles,
// and the search and filters. No DOM and no storage, so it is all unit tested.

import { STATUS } from './status.js';
import { riyadhYmd } from './time.js';

/** @typedef {import('../data/typedefs.js').Request} Request */
/** @typedef {import('../data/typedefs.js').User} User */

/**
 * One request as the board sees it.
 * @typedef {Object} BoardItem
 * @property {Request} request
 * @property {{approved: number, total: number}} progress  approvals of the current round
 * @property {boolean} waitingOnApprover  the single approval is pending right now
 * @property {boolean} stalled
 * @property {number} workingDays  working days in the current status
 */

/**
 * @typedef {Object} BoardFilters
 * @property {string} search
 * @property {string} category  '' for all
 * @property {'' | 'review' | 'ready' | 'month'} stat  set by clicking a stat tile
 * @property {boolean} onlyStalled
 * @property {boolean} showCancelled
 * @property {boolean} showAllTransferred  false = only transfers made this month
 */

/** @returns {BoardFilters} */
export const defaultFilters = () => ({
  search: '',
  category: '',
  stat: '',
  onlyStalled: false,
  showCancelled: false,
  showAllTransferred: false,
});

/** Riyadh month of a date: '202610'. @param {string} iso */
const monthOf = (iso) => riyadhYmd(iso).slice(0, 6);

/** @param {Request} r @param {string} nowIso */
const transferredThisMonth = (r, nowIso) =>
  r.status === STATUS.TRANSFERRED &&
  !!r.transferredAt &&
  monthOf(r.transferredAt) === monthOf(nowIso);

/**
 * The four numbers above the board. Cancelled requests are not counted in the total.
 * @param {BoardItem[]} items @param {string} nowIso
 */
export function boardStats(items, nowIso) {
  const reqs = items.map((i) => i.request);
  return {
    total: reqs.filter((r) => r.status !== STATUS.CANCELLED).length,
    review: reqs.filter((r) => r.status === STATUS.BANK_CREATED || r.status === STATUS.APPROVING)
      .length,
    ready: reqs.filter((r) => r.status === STATUS.READY).length,
    month: reqs.filter((r) => transferredThisMonth(r, nowIso)).length,
  };
}

/**
 * Search and filters. Search looks at the reference, the beneficiary and the requester's name
 * in both languages.
 * @param {BoardItem[]} items
 * @param {BoardFilters} f
 * @param {{users: Record<string, User>, nowIso: string}} ctx
 */
export function applyFilters(items, f, { users, nowIso }) {
  const q = f.search.trim().toLowerCase();
  return items.filter(({ request: r, stalled }) => {
    if (r.status === STATUS.CANCELLED && !f.showCancelled) return false;
    if (f.category && r.category !== f.category) return false;
    if (f.onlyStalled && !stalled) return false;
    if (f.stat === 'review' && r.status !== STATUS.BANK_CREATED && r.status !== STATUS.APPROVING) {
      return false;
    }
    if (f.stat === 'ready' && r.status !== STATUS.READY) return false;
    if (f.stat === 'month' && !transferredThisMonth(r, nowIso)) return false;
    if (q) {
      const who = users[r.createdById];
      const haystack = [r.ref, r.beneficiary, who?.nameEn, who?.nameAr]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Columns left to right. Returned only appears when it has cards, Cancelled only when the
 * "show cancelled" box is ticked. The Transferred column shows this month's transfers unless
 * `showAllTransferred` is on; `hiddenTransferred` says how many older ones are left out.
 * @param {BoardItem[]} items  already filtered
 * @param {BoardFilters} f
 * @param {string} nowIso
 * @returns {{status: string, items: BoardItem[], hidden: number}[]}
 */
export function buildColumns(items, f, nowIso) {
  /** @param {string} status */
  const of = (status) =>
    items
      .filter((i) => i.request.status === status)
      .sort((a, b) => b.request.createdAt.localeCompare(a.request.createdAt));
  const columns = [];
  const returned = of(STATUS.RETURNED);
  if (returned.length > 0) columns.push({ status: STATUS.RETURNED, items: returned, hidden: 0 });
  for (const status of [STATUS.SUBMITTED, STATUS.BANK_CREATED, STATUS.APPROVING, STATUS.READY]) {
    columns.push({ status, items: of(status), hidden: 0 });
  }
  const transferred = of(STATUS.TRANSFERRED);
  const shown = f.showAllTransferred
    ? transferred
    : transferred.filter((i) => transferredThisMonth(i.request, nowIso));
  columns.push({
    status: STATUS.TRANSFERRED,
    items: shown,
    hidden: transferred.length - shown.length,
  });
  if (f.showCancelled)
    columns.push({ status: STATUS.CANCELLED, items: of(STATUS.CANCELLED), hidden: 0 });
  return columns;
}

/** True when any search or filter is active. @param {BoardFilters} f */
export const hasActiveFilters = (f) =>
  !!(f.search.trim() || f.category || f.stat || f.onlyStalled || f.showCancelled);
