// @ts-check
// DEVELOPMENT ONLY. Lets anyone pick any person from the list, with no password. It exists so
// every role can be tried before Microsoft 365 sign-in is added. Never deploy it for real use.

import { RuleError } from '../domain/errors.js';

/** @typedef {import('./authProvider.js').AuthProvider} AuthProvider */
/** @typedef {import('../data/typedefs.js').User} User */

const KEY = 'tt-dev-user';

/**
 * @param {{listUsers: () => Promise<User[]>, storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>}} options
 *   `storage` defaults to sessionStorage (the choice lasts for the browser tab)
 * @returns {AuthProvider}
 */
export function createDevAuthProvider({ listUsers, storage = globalThis.sessionStorage }) {
  /** @param {() => any} fn */
  const safe = (fn) => {
    try {
      return fn();
    } catch {
      return null; // storage blocked (private window): sign-in just is not remembered
    }
  };

  return {
    async getCurrentUser() {
      const id = safe(() => storage.getItem(KEY));
      if (!id) return null;
      const user = (await listUsers()).find((u) => u.id === id);
      return user && user.active ? user : null;
    },
    async listSignInChoices() {
      return (await listUsers()).filter((u) => u.active);
    },
    async signIn(userId) {
      const user = (await listUsers()).find((u) => u.id === userId);
      if (!user) throw new RuleError('errors.notFound');
      if (!user.active) throw new RuleError('errors.inactive');
      safe(() => storage.setItem(KEY, user.id));
      return user;
    },
    async signOut() {
      safe(() => storage.removeItem(KEY));
    },
  };
}
