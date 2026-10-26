// @ts-check
// Pure rules for the bank-side status list (S6): which rows to show and in what order.

/** @typedef {import('../data/typedefs.js').Request} Request */
/** @typedef {import('../data/typedefs.js').BankStatus} BankStatus */

/**
 * @typedef {Object} BankFilters
 * @property {string} search  reference or beneficiary
 * @property {'' | 'executing' | 'review' | 'debited'} state  '' = every state
 * @property {boolean} notFollowedUp  only rows that still need a follow-up
 */

/** @returns {BankFilters} */
export const defaultBankFilters = () => ({ search: '', state: '', notFollowedUp: false });

/** @param {BankFilters} f */
export const hasActiveBankFilters = (f) =>
  f.search.trim() !== '' || f.state !== '' || f.notFollowedUp;

/** Held-for-review rows come first (they need someone), then executing, then debited. */
const STATE_ORDER = { review: 0, executing: 1, debited: 2 };

/**
 * A row still "needs a follow-up" until someone ticks it, unless the money has already left.
 * @param {BankStatus} b
 */
export const needsFollowUp = (b) => !b.followedUp && b.state !== 'debited';

/**
 * @param {{request: Request, bankStatus: BankStatus}[]} items
 * @param {BankFilters} filters
 */
export function filterBankItems(items, filters) {
  const q = filters.search.trim().toLowerCase();
  return items
    .filter(({ request, bankStatus }) => {
      if (filters.state && bankStatus.state !== filters.state) return false;
      if (filters.notFollowedUp && !needsFollowUp(bankStatus)) return false;
      if (q && !`${request.ref} ${request.beneficiary}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort(
      (a, b) =>
        STATE_ORDER[a.bankStatus.state] - STATE_ORDER[b.bankStatus.state] ||
        b.request.statusChangedAt.localeCompare(a.request.statusChangedAt),
    );
}
