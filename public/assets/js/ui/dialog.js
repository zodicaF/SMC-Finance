// @ts-check
// In-page dialogs built on the native <dialog> element. They replace alert(), confirm() and
// prompt(), so they look the same everywhere and flip correctly in Arabic.

import { html } from './html.js';
import { mount, delegate } from './dom.js';
import { t } from '../i18n/index.js';

let counter = 0;

/**
 * @typedef {Object} DialogHandle
 * @property {HTMLDialogElement} el
 * @property {(result?: any) => void} close  closes immediately
 * @property {() => Promise<void>} requestClose  asks `onCancel` first (Esc, backdrop, the x button)
 * @property {Promise<any>} closed  resolves with the value given to close()
 */

/**
 * @param {{eyebrow?: string, title: string, body: import('./html.js').SafeHtml,
 *   wide?: boolean, onCancel?: () => Promise<boolean> | boolean}} options
 *   `onCancel` returns false to keep the dialog open (for example "discard what you typed?")
 * @returns {DialogHandle}
 */
export function openDialog({ eyebrow = '', title, body, wide = false, onCancel }) {
  counter += 1;
  const titleId = `dialog-title-${counter}`;
  const dlg = document.createElement('dialog');
  dlg.className = wide ? 'modal wide' : 'modal';
  dlg.setAttribute('aria-labelledby', titleId);
  mount(
    dlg,
    html`<div class="modal-head">
        <div>
          ${eyebrow ? html`<p class="eyebrow">${eyebrow}</p>` : ''}
          <h2 id="${titleId}">${title}</h2>
        </div>
        <button
          type="button"
          class="icon-btn"
          data-action="dialog-close"
          aria-label="${t('common.close')}"
        >
          ×
        </button>
      </div>
      <div class="modal-body">${body}</div>`,
  );

  let finished = false;
  /** @type {(v: any) => void} */
  let resolveClosed = () => {};
  const closed = new Promise((resolve) => {
    resolveClosed = resolve;
  });

  /** @param {any} [result] */
  function close(result) {
    if (finished) return;
    finished = true;
    dlg.close();
    dlg.remove();
    resolveClosed(result);
  }

  async function requestClose() {
    if (finished) return;
    if (onCancel && !(await onCancel())) return;
    close(undefined);
  }

  dlg.addEventListener('cancel', (event) => {
    event.preventDefault(); // Esc: go through requestClose so "discard?" can be asked
    requestClose();
  });
  // A click on the dark area around the dialog closes it, but only if the press also started
  // there (so selecting text and letting go outside does not close it).
  let pressedOnBackdrop = false;
  dlg.addEventListener('mousedown', (event) => {
    pressedOnBackdrop = event.target === dlg;
  });
  dlg.addEventListener('click', (event) => {
    if (event.target === dlg && pressedOnBackdrop) requestClose();
  });
  delegate(dlg, 'click', { 'dialog-close': () => requestClose() });

  document.body.append(dlg);
  dlg.showModal();
  return { el: dlg, close, requestClose, closed };
}

/**
 * A yes/no question. Resolves true only when the person confirms.
 * @param {{title: string, message: string, confirmLabel: string, cancelLabel?: string, danger?: boolean}} options
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message, confirmLabel, cancelLabel, danger = false }) {
  const dialog = openDialog({
    title,
    body: html`<p>${message}</p>
      <div class="modal-actions">
        <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-action="yes">
          ${confirmLabel}
        </button>
        <button type="button" class="btn" data-action="no" autofocus>
          ${cancelLabel ?? t('common.cancel')}
        </button>
      </div>`,
  });
  delegate(dialog.el, 'click', {
    yes: () => dialog.close(true),
    no: () => dialog.close(false),
  });
  return dialog.closed.then((v) => v === true);
}
