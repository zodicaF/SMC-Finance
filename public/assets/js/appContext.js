// @ts-check
// Wires the pieces together: storage, services and sign-in. This is the one place that knows
// which repository and which auth provider are in use, so swapping them later is a change here.

import { createLocalRepository } from './data/localRepository.js';
import { loadReferenceData, loadSampleRequests } from './data/seed.js';
import { createServices } from './services/index.js';
import { createDevAuthProvider } from './auth/devAuthProvider.js';

const DB_NAME = 'transfer-tracker';

/**
 * Which build of the test data this browser holds. Raise it whenever the shape of stored data
 * or the sample data changes: browsers holding older test data then start again from fresh
 * examples instead of breaking on data the code no longer expects. (Test phase only; real
 * data will be migrated on the server, never wiped.)
 */
const DATA_VERSION = '3'; // 3: replaces data seeded several times by tabs starting together

/** Removes this browser's test database. */
function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(undefined);
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(undefined); // another tab still has it open; it closes on request
  });
}

/** Fills an empty database with people, rates and example requests. @param {any} repo */
async function seed(repo) {
  await loadReferenceData(repo);
  await loadSampleRequests(repo);
  await repo.saveSetting('dataVersion', DATA_VERSION);
  await repo.saveSetting('seeded', '1');
}

/**
 * Runs `fn` while no other tab of this app runs it. Several tabs starting together (Edge
 * reopening them, a reload during start-up) would otherwise each find the database empty and
 * each load the examples. Browsers without the Web Locks API just run it.
 * @template T @param {() => Promise<T>} fn @returns {Promise<T>}
 */
function exclusively(fn) {
  const locks = globalThis.navigator?.locks;
  return locks ? locks.request('transfer-tracker-test-data', fn) : fn();
}

/**
 * Opens the test database, seeding a new browser and replacing test data left by an older
 * version of the app. Returns the repository to use and whether the data was replaced.
 */
function openTestData() {
  return exclusively(openTestDataNow);
}

async function openTestDataNow() {
  let repo = createLocalRepository({ name: DB_NAME });
  const settings = await repo.getSettings();
  if (settings.seeded && settings.dataVersion === DATA_VERSION) return { repo, replaced: false };
  // Anything already stored is older or half-written (seeding stopped part way): start over.
  const replaced = Object.keys(settings).length > 0 || (await repo.listUsers()).length > 0;
  if (replaced) {
    await repo.close();
    await deleteDatabase();
    repo = createLocalRepository({ name: DB_NAME });
  }
  await seed(repo);
  return { repo, replaced };
}

export async function createApp() {
  const { repo, replaced } = await openTestData();
  const services = createServices({ repo });
  const auth = createDevAuthProvider({ listUsers: () => repo.listUsers() });
  if (replaced) await auth.signOut(); // the remembered person may not exist in the new examples

  /** Development helper: forget everything in this browser and start again with the examples. */
  async function resetSampleData() {
    await auth.signOut();
    await repo.close();
    await deleteDatabase();
  }

  return { repo, services, auth, resetSampleData };
}
