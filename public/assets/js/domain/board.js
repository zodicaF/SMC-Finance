// @ts-check
// Pure helpers for the board screen: which request goes in which column, the four stat tiles,
// and the search and filters. No DOM and no storage, so it is all unit tested.

import { STATUS } from './status.js';
import { riyadhYmd } from './time.js';
import { round2 } from './money.js';

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

/** @typedef {'' | 'today' | 'week' | 'month' | 'lastMonth' | 'exact' | 'custom'} DatePreset */
/** @typedef {'newest' | 'oldest' | 'amountDesc'} BoardSort */

/**
 * @typedef {Object} BoardFilters
 * @property {string} search
 * @property {string} category  '' for all
 * @property {'' | 'review' | 'ready' | 'month'} stat  set by clicking a stat tile
 * @property {boolean} onlyStalled
 * @property {boolean} showCancelled
 * @property {boolean} showAllTransferred  false = only transfers made this month
 * @property {DatePreset} date  when the request was created, in Riyadh time
 * @property {string} dateFrom  'YYYY-MM-DD', used when `date` is 'custom'; '' = open
 * @property {string} dateTo  'YYYY-MM-DD', used when `date` is 'custom'; '' = open
 * @property {string} dateOn  'YYYY-MM-DD', used when `date` is 'exact'
 * @property {'' | 'internal' | 'external'} movement  money movement; '' for both
 * @property {string} requesterId  who created it (user id); '' for anyone
 * @property {string} company  the paying company; '' for all
 * @property {string} accountId  the paying account; '' for all
 * @property {number | null} amountMin  in SAR
 * @property {number | null} amountMax  in SAR
 * @property {BoardSort} sort
 */

/** @returns {BoardFilters} */
export const defaultFilters = () => ({
  search: '',
  category: '',
  stat: '',
  onlyStalled: false,
  showCancelled: false,
  showAllTransferred: false,
  date: '',
  dateFrom: '',
  dateTo: '',
  dateOn: '',
  movement: '',
  requesterId: '',
  company: '',
  accountId: '',
  amountMin: null,
  amountMax: null,
  sort: 'newest',
});

/** Riyadh month of a date: '202610'. @param {string} iso */
const monthOf = (iso) => riyadhYmd(iso).slice(0, 6);

/** 'YYYYMMDD' -> 'YYYYMMDD' of the Sunday that starts that Saudi week. @param {string} ymd */
function weekStartYmd(ymd) {
  const day = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
  day.setUTCDate(day.getUTCDate() - day.getUTCDay());
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${day.getUTCFullYear()}${pad(day.getUTCMonth() + 1)}${pad(day.getUTCDate())}`;
}

/** '202601' -> '202512'. @param {string} ym */
function previousMonth(ym) {
  const y = +ym.slice(0, 4);
  const m = +ym.slice(4, 6);
  return m === 1 ? `${y - 1}12` : `${y}${String(m - 1).padStart(2, '0')}`;
}

/**
 * Was the request created inside the chosen period? Days are Riyadh days; custom ends are
 * inclusive.
 * @param {string} createdAt @param {BoardFilters} f @param {string} nowIso
 */
export function inDateRange(createdAt, f, nowIso) {
  const ymd = riyadhYmd(createdAt);
  const today = riyadhYmd(nowIso);
  switch (f.date) {
    case 'today':
      return ymd === today;
    case 'week':
      return ymd >= weekStartYmd(today) && ymd <= today;
    case 'month':
      return ymd.slice(0, 6) === today.slice(0, 6);
    case 'lastMonth':
      return ymd.slice(0, 6) === previousMonth(today.slice(0, 6));
    case 'exact':
      return !f.dateOn || ymd === f.dateOn.replaceAll('-', '');
    case 'custom': {
      const from = f.dateFrom.replaceAll('-', '');
      const to = f.dateTo.replaceAll('-', '');
      return (!from || ymd >= from) && (!to || ymd <= to);
    }
    default:
      return true;
  }
}

/**
 * A sorted copy. Newest and oldest go by creation time; amount compares the SAR value so
 * different currencies are treated alike.
 * @param {BoardItem[]} items @param {BoardSort} sort
 */
export function sortItems(items, sort) {
  const byNewest = (/** @type {BoardItem} */ a, /** @type {BoardItem} */ b) =>
    b.request.createdAt.localeCompare(a.request.createdAt);
  const copy = [...items];
  if (sort === 'oldest') return copy.sort((a, b) => byNewest(b, a));
  if (sort === 'amountDesc') {
    return copy.sort(
      (a, b) => round2(b.request.amountSar) - round2(a.request.amountSar) || byNewest(a, b),
    );
  }
  return copy.sort(byNewest);
}

/** True when the date choice actually narrows the list (an empty custom or exact date does not).
 * @param {BoardFilters} f */
export function dateFilterOn(f) {
  if (f.date === 'custom') return !!(f.dateFrom || f.dateTo);
  if (f.date === 'exact') return !!f.dateOn;
  return f.date !== '';
}

/**
 * How many filters in the Filters panel are on (search, sort and the stat tiles are not
 * counted: they have their own controls). The amount range counts once.
 * @param {BoardFilters} f
 */
export function activeFilterCount(f) {
  return [
    dateFilterOn(f),
    f.movement,
    f.requesterId,
    f.company || f.accountId,
    f.amountMin !== null || f.amountMax !== null,
    f.category,
    f.onlyStalled,
    f.showCancelled,
  ].filter(Boolean).length;
}

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
 * Search and filters. Search looks at the reference, the beneficiary, the customer name, the
 * account number (spaces ignored), the bank's transfer reference and the name of whoever
 * created it, in both languages.
 * @param {BoardItem[]} items
 * @param {BoardFilters} f
 * @param {{users: Record<string, User>, nowIso: string, accountCompany?: (id: string) => string | undefined}} ctx
 *   `accountCompany` maps an account id to its company, for the company filter
 */
export function applyFilters(items, f, { users, nowIso, accountCompany = () => undefined }) {
  const q = f.search.trim().toLowerCase();
  const qCompact = q.replace(/\s+/g, '');
  return items.filter(({ request: r, stalled }) => {
    if (r.status === STATUS.CANCELLED && !f.showCancelled) return false;
    if (f.category && r.category !== f.category) return false;
    if (f.onlyStalled && !stalled) return false;
    if (!inDateRange(r.createdAt, f, nowIso)) return false;
    if (f.requesterId && r.createdById !== f.requesterId) return false;
    if (f.movement && r.movement !== f.movement) return false;
    if (f.accountId && r.fromAccountId !== f.accountId) return false;
    if (f.company && accountCompany(r.fromAccountId) !== f.company) return false;
    if (f.amountMin !== null && round2(r.amountSar) < round2(f.amountMin)) return false;
    if (f.amountMax !== null && round2(r.amountSar) > round2(f.amountMax)) return false;
    if (f.stat === 'review' && r.status !== STATUS.BANK_CREATED && r.status !== STATUS.APPROVING) {
      return false;
    }
    if (f.stat === 'ready' && r.status !== STATUS.READY) return false;
    if (f.stat === 'month' && !transferredThisMonth(r, nowIso)) return false;
    if (q) {
      const who = users[r.createdById];
      const haystack = [r.ref, r.beneficiary, r.requesterName, r.transferRef, who?.nameEn, who?.nameAr]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const iban = (r.iban ?? '').replace(/\s+/g, '').toLowerCase();
      if (!haystack.includes(q) && !(qCompact && iban.includes(qCompact))) return false;
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
    sortItems(
      items.filter((i) => i.request.status === status),
      f.sort ?? 'newest',
    );
  const columns = [];
  const returned = of(STATUS.RETURNED);
  if (returned.length > 0) columns.push({ status: STATUS.RETURNED, items: returned, hidden: 0 });
  for (const status of [STATUS.SUBMITTED, STATUS.BANK_CREATED, STATUS.APPROVING, STATUS.READY]) {
    columns.push({ status, items: of(status), hidden: 0 });
  }
  const transferred = of(STATUS.TRANSFERRED);
  // A chosen date period already decides which transfers to show, so "this month only" steps aside.
  const shown =
    f.showAllTransferred || dateFilterOn(f)
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
  !!(f.search.trim() || f.stat || activeFilterCount(f) > 0);
