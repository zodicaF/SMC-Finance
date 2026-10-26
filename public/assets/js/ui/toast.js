// @ts-check
// Short messages at the bottom of the screen. They confirm an action ("Request created") or
// say what failed. Screen readers announce them.

/**
 * @param {string} message
 * @param {{error?: boolean}} [options]
 */
export function showToast(message, { error = false } = {}) {
  let wrap = document.getElementById('toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-live', 'polite');
    document.body.append(wrap);
  }
  const el = document.createElement('div');
  el.className = error ? 'toast error' : 'toast';
  el.textContent = message;
  wrap.append(el);
  // Never more than three on screen: the oldest goes first.
  while (wrap.children.length > 3) wrap.firstElementChild?.remove();
  setTimeout(() => el.remove(), error ? 7000 : 4000);
}
