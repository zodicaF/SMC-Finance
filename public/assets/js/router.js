// @ts-check
// Hash router: #/board, #/approvals, #/bank, #/admin, #/request/TRF-20261024-0001.
// A hash route works on any static host with no server rules.

export const ROUTES = ['board', 'approvals', 'bank', 'admin'];

/**
 * @param {string} hash  e.g. '#/request/TRF-20261024-0001'
 * @returns {{name: string, params: Record<string, string>}}
 */
export function parseHash(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { name: 'board', params: {} };
  const [first, second] = parts;
  if (parts.length === 1 && ROUTES.includes(first)) return { name: first, params: {} };
  if (first === 'request' && parts.length === 2 && /^TRF-\d{8}-\d{4}$/.test(second)) {
    return { name: 'request', params: { ref: second } };
  }
  return { name: 'notfound', params: {} };
}

/** @param {string} ref */
export const requestHash = (ref) => `#/request/${encodeURIComponent(ref)}`;

/**
 * Calls `onRoute(route)` now and on every hash change.
 * @param {(route: {name: string, params: Record<string, string>}) => void} onRoute
 * @returns {() => void}  stop listening
 */
export function startRouter(onRoute) {
  const handle = () => onRoute(parseHash(window.location.hash));
  window.addEventListener('hashchange', handle);
  handle();
  return () => window.removeEventListener('hashchange', handle);
}
