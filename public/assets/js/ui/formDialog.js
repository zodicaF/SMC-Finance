// @ts-check
// A small dialog with a few fields and one action (reject, cancel, record on behalf, mark
// transferred). It checks the fields, runs the action, and stays open with the reason when the
// action is refused (for example "someone else just changed this request").

import { html } from './html.js';
import { delegate } from './dom.js';
import { openDialog } from './dialog.js';
import { errorText } from './errors.js';
import { t } from '../i18n/index.js';

/** The message line under a field. Name it after the field. @param {string} name */
export const fieldError = (name) => html`<p class="err" id="fd-err-${name}"></p>`;

/**
 * @param {{eyebrow?: string, title: string, intro?: string, fields: import('./html.js').SafeHtml,
 *   submitLabel: string, danger?: boolean,
 *   validate?: (root: HTMLElement) => Record<string, string>,
 *   submit: (root: HTMLElement) => Promise<any>}} options
 *   `validate` returns field name -> text key. `submit` returns the dialog's result.
 * @returns {Promise<any>}  the value `submit` returned, or undefined when the dialog was closed
 */
export function openFormDialog({
  eyebrow,
  title,
  intro,
  fields,
  submitLabel,
  danger = false,
  validate,
  submit,
}) {
  const dlg = openDialog({
    eyebrow,
    title,
    body: html`<form id="fd-form" novalidate>
      ${intro ? html`<p class="muted">${intro}</p>` : ''} ${fields}
      <p class="form-error" id="fd-error" role="alert" hidden></p>
      <div class="modal-actions">
        <button type="submit" class="btn ${danger ? 'danger' : 'primary'}" id="fd-submit">
          ${submitLabel}
        </button>
        <button type="button" class="btn" data-action="cancel">${t('common.cancel')}</button>
      </div>
    </form>`,
  });
  const root = dlg.el;
  /** @param {string} id */
  const q = (id) => /** @type {any} */ (root.querySelector(`#${id}`));

  delegate(root, 'click', { cancel: () => dlg.requestClose() });

  /** @param {string} text */
  function setFormError(text) {
    q('fd-error').textContent = text;
    q('fd-error').hidden = !text;
  }

  q('fd-form').addEventListener('submit', async (/** @type {Event} */ event) => {
    event.preventDefault();
    setFormError('');
    for (const line of root.querySelectorAll('.err')) line.textContent = '';
    for (const control of root.querySelectorAll('[aria-invalid]'))
      control.removeAttribute('aria-invalid');
    const errors = validate ? validate(root) : {};
    const names = Object.keys(errors);
    if (names.length > 0) {
      for (const name of names) {
        const line = q(`fd-err-${name}`);
        if (line) line.textContent = t(errors[name]);
        root.querySelector(`[name="${name}"]`)?.setAttribute('aria-invalid', 'true');
      }
      /** @type {HTMLElement | null} */ (root.querySelector('[aria-invalid="true"]'))?.focus();
      return;
    }
    const button = q('fd-submit');
    button.disabled = true;
    const label = button.textContent;
    button.textContent = t('common.saving');
    try {
      const result = await submit(root);
      dlg.close(result ?? true);
    } catch (err) {
      setFormError(errorText(err));
      button.disabled = false;
      button.textContent = label;
    }
  });

  return dlg.closed;
}
