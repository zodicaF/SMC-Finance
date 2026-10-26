// Test helpers: a fresh in-memory world with the real reference data, a controllable clock,
// predictable ids, and quick file makers.
import { createMemoryRepository } from '../public/assets/js/data/memoryRepository.js';
import { loadReferenceData, USER_IDS } from '../public/assets/js/data/seed.js';
import { createServices } from '../public/assets/js/services/index.js';

export const START = '2026-10-18T06:00:00.000Z'; // a Sunday, 09:00 in Riyadh

export async function makeWorld() {
  const repo = createMemoryRepository();
  let now = new Date(START).getTime();
  let counter = 0;
  const clock = () => new Date(now).toISOString();
  const newId = () => `id-${++counter}`;
  await loadReferenceData(repo, START);
  const svc = createServices({ repo, clock, newId });
  const users = Object.fromEntries((await repo.listUsers()).map((u) => [u.id, u]));
  const who = {
    fatima: users[USER_IDS.fatima],
    anfal: users[USER_IDS.anfal],
    husni: users[USER_IDS.husni],
    msayed: users[USER_IDS.mohammedAlsayed],
    kharji: users[USER_IDS.mohammedAlkharji],
    ahmed: users[USER_IDS.ahmed],
    sara: users[USER_IDS.sara],
  };
  return {
    repo,
    svc,
    who,
    /** move the clock forward */
    advance: (ms) => {
      now += ms;
    },
    advanceDays: (days) => {
      now += days * 86400000;
    },
    now: () => clock(),
  };
}

export const pdf = (name = 'doc.pdf') => ({
  name,
  mime: 'application/pdf',
  size: 100,
  blob: new Blob(['%PDF-1.1 test'], { type: 'application/pdf' }),
});

export const baseInput = (over = {}) => ({
  beneficiary: 'Najd Logistics',
  bank: 'Saudi National Bank',
  iban: 'SA0380000000608010167519',
  category: 'beneficiary',
  movement: 'external',
  swiftCode: 'NCBKSAJE',
  currency: 'SAR',
  amount: 245000,
  purpose: 'Test',
  ...over,
});

/** Create a request as Ahmed. */
export async function newRequest(world, over = {}) {
  return world.svc.createRequest(world.who.ahmed, baseInput(over), [pdf('invoice.pdf')]);
}

/** Create and enter in the bank (as Anfal). */
export async function inBank(world, over = {}) {
  const r = await newRequest(world, over);
  return world.svc.markBankCreated(world.who.anfal, r.id, [pdf('bank.pdf')]);
}

/** Approve every required stage in order, returning the request. */
export async function approveAll(world, id) {
  const { currentApprovals } = await world.svc.getRequestDetail(
    world.who.fatima,
    (await world.repo.getRequestById(id)).ref,
  );
  const byOrder = { 1: world.who.husni, 2: world.who.msayed, 3: world.who.kharji };
  for (const row of currentApprovals)
    await world.svc.decideStage(byOrder[row.stageOrder], id, row.stageOrder, 'approve');
  return world.repo.getRequestById(id);
}

export async function ready(world, over = {}) {
  const r = await inBank(world, over);
  return approveAll(world, r.id);
}

/** Run a promise and return the thrown error's key (or 'no error'). */
export async function errorKey(promise) {
  try {
    await promise;
    return 'no error';
  } catch (e) {
    return e.key ?? `unexpected: ${e.message}`;
  }
}
