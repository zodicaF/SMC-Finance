// @ts-check
// Time helpers. Saudi Arabia is UTC+3 all year (no daylight saving), so Riyadh time is
// computed by adding 3 hours. Nothing here reads the clock: callers pass ISO strings in.

const OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

/** Whole days since 1970-01-01 in Riyadh time. @param {string} iso */
function riyadhDayNumber(iso) {
  return Math.floor((new Date(iso).getTime() + OFFSET_MS) / DAY_MS);
}

/** 'YYYYMMDD' in Riyadh time, used in references. @param {string} iso */
export function riyadhYmd(iso) {
  const d = new Date(new Date(iso).getTime() + OFFSET_MS);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

/**
 * Number of working days (Sunday to Thursday) after the day of `fromIso`, up to and including
 * the day of `toIso`, in Riyadh time. Friday and Saturday do not count.
 * @param {string} fromIso
 * @param {string} toIso
 */
export function workingDaysBetween(fromIso, toIso) {
  const from = riyadhDayNumber(fromIso);
  const to = riyadhDayNumber(toIso);
  let count = 0;
  for (let day = from + 1; day <= to; day += 1) {
    const weekday = (day + 4) % 7; // 1970-01-01 was a Thursday (4); Sunday = 0
    if (weekday !== 5 && weekday !== 6) count += 1;
  }
  return count;
}
