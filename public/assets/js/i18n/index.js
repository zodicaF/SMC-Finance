// @ts-check
// Translation. All user-visible text goes through t('key'). Nothing here touches the page or
// storage, so it can be tested in Node; main.js applies the language to the document.

import { ar } from './ar.js';
import { en } from './en.js';

/** @typedef {'ar' | 'en'} Lang */

const dictionaries = { ar, en };
/** @type {Lang} */
let current = 'ar';

export const LANGS = /** @type {Lang[]} */ (['ar', 'en']);
export const getLang = () => current;
export const getDir = () => (current === 'ar' ? 'rtl' : 'ltr');

/** @param {string} lang */
export function setLang(lang) {
  current = lang === 'en' ? 'en' : 'ar';
}

/**
 * @param {string} key
 * @param {Record<string, string | number>} [params]  replaces {name} in the text
 */
export function t(key, params = {}) {
  const text =
    /** @type {Record<string, string>} */ (dictionaries[current])[key] ??
    /** @type {Record<string, string>} */ (en)[key] ??
    key;
  return text.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
}

export const dictionaryKeys = { ar: Object.keys(ar), en: Object.keys(en) };
