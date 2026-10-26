// @ts-check
// Names of people and lookup items in the current language.

import { CATEGORIES, labelOf } from '../data/lookups.js';

/** @param {{nameEn: string, nameAr: string} | null | undefined} user @param {'ar' | 'en'} lang */
export function personName(user, lang) {
  if (!user) return '—';
  return lang === 'ar' ? user.nameAr : user.nameEn;
}

/** @param {string} key @param {'ar' | 'en'} lang */
export function categoryLabel(key, lang) {
  const item = CATEGORIES.find((c) => c.key === key);
  return item ? labelOf(item, lang) : key;
}

/** Names joined for the language: "A, B" or "أ، ب". @param {string[]} names @param {'ar' | 'en'} lang */
export function joinNames(names, lang) {
  return names.join(lang === 'ar' ? '، ' : ', ');
}
