// @ts-check
// Administration: users, exchange rates, settings.

import { RuleError } from '../domain/errors.js';
import { CURRENCIES, ROLES } from '../data/lookups.js';
import { allow, writeLog } from './context.js';

/** @typedef {import('./context.js').Deps} Deps */
/** @typedef {import('../data/typedefs.js').User} User */

const SETTING_KEYS = ['stalledDays', 'maxFileMb', 'baseCurrency'];
/** Settings that must be whole numbers in a range. */
const NUMBER_SETTINGS = {
  stalledDays: { min: 1, max: 30 },
  maxFileMb: { min: 1, max: 50 },
};

/** @param {Deps} deps */
export function createAdminServices(deps) {
  const { repo, clock } = deps;

  /** Everything the admin screen shows. @param {User} actor */
  async function getAdminData(actor) {
    allow('admin', actor);
    const [users, rates, settings, requests, logs] = await Promise.all([
      repo.listUsers(),
      repo.listFxRates(),
      repo.getSettings(),
      repo.listRequests(),
      repo.listAllLog(),
    ]);
    const acted = new Set(logs.map((l) => l.actorId));
    return {
      users,
      rates,
      settings,
      requestCount: requests.length,
      sampleCount: requests.filter((r) => r.isSample).length,
      // Shown a Delete button instead of only Edit: never acted, and not themselves.
      deletableUserIds: users
        .filter((u) => u.id !== actor.id && !acted.has(u.id))
        .map((u) => u.id),
    };
  }

  /** @param {User} actor @param {User} user */
  async function saveUser(actor, user) {
    allow('admin', actor);
    if (
      !user.id ||
      !user.nameEn.trim() ||
      !user.nameAr.trim() ||
      !/^\S+@\S+\.\S+$/.test(user.email)
    ) {
      throw new RuleError('errors.validation');
    }
    if (!user.roles.every((r) => ROLES.includes(r))) throw new RuleError('errors.validation');
    // An admin cannot lock themselves out.
    if (user.id === actor.id && (!user.active || !user.roles.includes('admin'))) {
      throw new RuleError('errors.selfLockout');
    }
    const email = user.email.trim().toLowerCase();
    const all = await repo.listUsers();
    if (all.some((u) => u.id !== user.id && u.email.toLowerCase() === email)) {
      throw new RuleError('errors.emailTaken');
    }
    await repo.saveUser({ ...user, nameEn: user.nameEn.trim(), nameAr: user.nameAr.trim(), email });
    await writeLog(deps, actor, null, 'admin_change', { entity: 'user', id: user.id });
  }

  /**
   * Removes a user record entirely. Only ever safe for someone who never acted in the
   * system (no log row with their id as actor) — anyone else must be deactivated instead,
   * so old history keeps showing their name. An admin can never delete themselves.
   * @param {User} actor @param {string} id
   */
  async function deleteUser(actor, id) {
    allow('admin', actor);
    if (id === actor.id) throw new RuleError('errors.cannotDeleteSelf');
    const target = (await repo.listUsers()).find((u) => u.id === id);
    if (!target) throw new RuleError('errors.notFound');
    const acted = (await repo.listAllLog()).some((l) => l.actorId === id);
    if (acted) throw new RuleError('errors.userHasHistory');
    await repo.deleteUser(id);
    await writeLog(deps, actor, null, 'admin_change', { entity: 'user_deleted', id });
  }

  /** @param {User} actor @param {{nameEn: string, nameAr: string, email: string, roles: string[]}} input */
  async function addUser(actor, input) {
    allow('admin', actor);
    const user = /** @type {User} */ ({
      id: deps.newId(),
      nameEn: input.nameEn.trim(),
      nameAr: input.nameAr.trim(),
      email: input.email.trim().toLowerCase(),
      roles: input.roles,
      active: true,
    });
    await saveUser(actor, user);
    return user;
  }

  /** @param {User} actor @param {string} currency @param {number} rateToSar */
  async function saveFxRate(actor, currency, rateToSar) {
    allow('admin', actor);
    if (!CURRENCIES.includes(currency) || !(rateToSar > 0))
      throw new RuleError('errors.validation');
    if (currency === 'SAR' && rateToSar !== 1) throw new RuleError('errors.validation');
    await repo.saveFxRate({ currency, rateToSar, updatedAt: clock(), updatedById: actor.id });
    await writeLog(deps, actor, null, 'admin_change', { entity: 'fxRate', currency, rateToSar });
  }

  /** @param {User} actor @param {string} key @param {string} value */
  async function saveSetting(actor, key, value) {
    allow('admin', actor);
    if (!SETTING_KEYS.includes(key) || String(value).trim() === '')
      throw new RuleError('errors.validation');
    const text = String(value).trim();
    const limit = NUMBER_SETTINGS[key];
    if (limit && !(/^\d+$/.test(text) && Number(text) >= limit.min && Number(text) <= limit.max))
      throw new RuleError('errors.validation');
    await repo.saveSetting(key, text);
    await writeLog(deps, actor, null, 'admin_change', { entity: 'setting', key });
  }

  /**
   * Deletes the example requests (the ones created by the seed). People and the rates stay.
   * Returns how many were removed. @param {User} actor
   */
  async function clearSampleData(actor) {
    allow('admin', actor);
    const samples = (await repo.listRequests()).filter((r) => r.isSample);
    for (const r of samples) await repo.deleteRequest(r.id);
    await writeLog(deps, actor, null, 'admin_change', {
      entity: 'sampleData',
      removed: samples.length,
    });
    return samples.length;
  }

  return {
    getAdminData,
    saveUser,
    deleteUser,
    addUser,
    saveFxRate,
    saveSetting,
    clearSampleData,
  };
}
