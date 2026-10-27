// @ts-check
// Names of people and lookup items in the current language.

import { CATEGORIES, labelOf, accountOf } from '../data/lookups.js';

/** @param {{nameEn: string, nameAr: string} | null | undefined} user @param {'ar' | 'en'} lang */
export function personName(user, lang) {
  if (!user) return '—';
  return lang === 'ar' ? user.nameAr : user.nameEn;
}

/** Up to two letters for an avatar. @param {{nameEn: string, nameAr: string} | null | undefined} user @param {'ar' | 'en'} lang */
export function initials(user, lang) {
  const words = personName(user, lang).trim().split(/\s+/);
  return words
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
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

/** "Company — Bank — Currency — Account No." for a from-account id, or the id itself if the
 * account was since removed from the lookup list. @param {string} id */
export function accountLabel(id) {
  const a = accountOf(id);
  return a ? `${a.company} — ${a.bank} — ${a.currency} — ${a.id}` : id;
}
