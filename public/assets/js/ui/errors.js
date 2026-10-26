// @ts-check
// Turns a thrown error into text for the current language.

import { ConflictError } from '../domain/errors.js';
import { t } from '../i18n/index.js';

/** @param {unknown} err */
export const isConflict = (err) => err instanceof ConflictError;

/**
 * Errors from the services carry a text key. Anything else is a bug: log it and show a
 * general message.
 * @param {unknown} err
 */
export function errorText(err) {
  const key = err instanceof Error ? /** @type {any} */ (err).key : undefined;
  if (typeof key === 'string') return t(key);
  console.error(err);
  return t('errors.unexpected');
}

/**
 * Files chosen in an <input type="file"> in the shape the services expect.
 * @param {HTMLInputElement} input
 * @returns {import('../data/typedefs.js').FileInput[]}
 */
export function filesOf(input) {
  return Array.from(input.files ?? []).map((f) => ({
    name: f.name,
    mime: f.type,
    size: f.size,
    blob: f,
  }));
}
