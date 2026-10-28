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
 * Would saving this change anything? Saving the same status again would only add a
 * misleading line to the history, so it is refused. Reasons only count while held for review
 * (the service drops them otherwise); their order does not matter. New proof files are a
 * change on their own, so callers check those separately.
 * @param {BankStatus} saved
 * @param {{state: string, reasons?: string[], note?: string, followedUp?: boolean}} input
 */
export function bankStatusChanged(saved, input) {
  /** @param {string[] | undefined} list */
  const reasons = (list) =>
    input.state === 'review' ? [...new Set(list ?? [])].sort().join('|') : '';
  return (
    saved.state !== input.state ||
    reasons(saved.reasons) !== reasons(input.reasons) ||
    (saved.note ?? '').trim() !== (input.note ?? '').trim() ||
    !!saved.followedUp !== !!input.followedUp
  );
}

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
