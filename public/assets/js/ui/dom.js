// @ts-check
// Small DOM helpers. Markup goes in only as SafeHtml from ui/html.js.

import { SafeHtml } from './html.js';

/**
 * Replace the content of an element with safe markup.
 * @param {Element} el
 * @param {SafeHtml} safe
 */
export function mount(el, safe) {
  if (!(safe instanceof SafeHtml)) {
    throw new TypeError('mount() needs html`...` output, not a plain string');
  }
  el.innerHTML = safe.value;
}

/**
 * One listener per view instead of one per button. Elements opt in with data-action="name".
 * Returns a function that removes the listener.
 * @param {Element} root
 * @param {string} type  e.g. 'click'
 * @param {Record<string, (el: HTMLElement, event: Event) => void>} handlers
 */
export function delegate(root, type, handlers) {
  /** @param {Event} event */
  const listener = (event) => {
    const target = /** @type {Element | null} */ (event.target);
    const el = /** @type {HTMLElement | null} */ (target?.closest('[data-action]'));
    if (!el || !root.contains(el)) return;
    const handler = handlers[el.dataset.action ?? ''];
    if (handler) handler(el, event);
  };
  root.addEventListener(type, listener);
  return () => root.removeEventListener(type, listener);
}
