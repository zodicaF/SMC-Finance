// @ts-check
// Wires the pieces together: storage, services and sign-in. This is the one place that knows
// which repository and which auth provider are in use, so swapping them later is a change here.

import { createLocalRepository } from './data/localRepository.js';
import { loadReferenceData, loadSampleRequests } from './data/seed.js';
import { createServices } from './services/index.js';
import { createDevAuthProvider } from './auth/devAuthProvider.js';

const DB_NAME = 'transfer-tracker';

/** On a brand-new browser, fills the database with people, rates and example requests. */
async function seedIfEmpty(repo) {
  const settings = await repo.getSettings();
  if (settings.seeded) return;
  await loadReferenceData(repo);
  await loadSampleRequests(repo);
  await repo.saveSetting('seeded', '1');
}

export async function createApp() {
  const repo = createLocalRepository({ name: DB_NAME });
  await seedIfEmpty(repo);
  const services = createServices({ repo });
  const auth = createDevAuthProvider({ listUsers: () => repo.listUsers() });

  /** Development helper: forget everything in this browser and start again with the examples. */
  async function resetSampleData() {
    await auth.signOut();
    await repo.close();
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve(undefined);
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve(undefined); // another tab still has it open; reload will retry
    });
  }

  return { repo, services, auth, resetSampleData };
}
