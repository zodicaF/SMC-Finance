// Phase 2: board logic, the board and form queries, dev sign-in, amount parsing, text coverage.
import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { makeWorld, newRequest, inBank, ready, pdf } from './helpers.js';
import { parseAmountInput } from '../public/assets/js/domain/money.js';
import {
  applyFilters,
  boardStats,
  buildColumns,
  defaultFilters,
  hasActiveFilters,
} from '../public/assets/js/domain/board.js';
import { createDevAuthProvider } from '../public/assets/js/auth/devAuthProvider.js';
import { dictionaryKeys } from '../public/assets/js/i18n/index.js';
import { ar } from '../public/assets/js/i18n/ar.js';
import { en } from '../public/assets/js/i18n/en.js';
import { loadReferenceData, loadSampleRequests } from '../public/assets/js/data/seed.js';
import { createMemoryRepository } from '../public/assets/js/data/memoryRepository.js';
import { createServices } from '../public/assets/js/services/index.js';

describe('typed amounts', () => {
  it('reads plain, formatted and Arabic-digit amounts', () => {
    expect(parseAmountInput('400000')).toBe(400000);
    expect(parseAmountInput('1,850,000.50')).toBe(1850000.5);
    expect(parseAmountInput(' 12 500 ')).toBe(12500);
    expect(parseAmountInput('١٢٣٫٤٥')).toBe(123.45);
    expect(parseAmountInput('١٬٠٠٠')).toBe(1000);
  });
  it('rejects anything that is not a plain number', () => {
    for (const bad of ['', 'abc', '12abc', '-5', '1.2.3', '1e5', null, undefined]) {
      expect(parseAmountInput(/** @type {any} */ (bad)), String(bad)).toBeNaN();
    }
  });
});

describe('getBoard and getFormContext', () => {
  let w;
  beforeEach(async () => {
    w = await makeWorld();
  });

  it('gives each request its approval progress and whether it is waiting on an approver', async () => {
    const r = await inBank(w, { amount: 2000000 });
    const before = await w.svc.getBoard(w.who.fatima);
    expect(before.items.find((i) => i.request.id === r.id).waitingOnApprover).toBe(true);
    await w.svc.decideStage(w.who.husni, r.id, 1, 'approve');
    const board = await w.svc.getBoard(w.who.fatima);
    const item = board.items.find((i) => i.request.id === r.id);
    expect(item.progress).toEqual({ approved: 1, total: 1 });
    expect(Object.keys(board.users)).toHaveLength(7);
    expect(board.stalledDays).toBe(3);
  });

  it('only returns what the user may see', async () => {
    await newRequest(w);
    expect((await w.svc.getBoard(w.who.ahmed)).items).toHaveLength(1);
    expect((await w.svc.getBoard(w.who.sara)).items).toHaveLength(0);
    expect((await w.svc.getBoard(w.who.fatima)).items).toHaveLength(1);
  });

  it('marks a request stalled after more than three working days in one status', async () => {
    const r = await inBank(w);
    w.advanceDays(3); // Sun 18 -> Wed 21: three working days, not yet stalled
    expect(
      (await w.svc.getBoard(w.who.fatima)).items.find((i) => i.request.id === r.id).stalled,
    ).toBe(false);
    w.advanceDays(1); // Thursday: four
    const item = (await w.svc.getBoard(w.who.fatima)).items.find((i) => i.request.id === r.id);
    expect(item.stalled).toBe(true);
    expect(item.workingDays).toBe(4);
  });

  it('weekends do not count toward stalled', async () => {
    const r = await inBank(w);
    w.advanceDays(6); // Sun 18 -> Sat 24: Mon..Thu = 4... Sunday-start: Mon Tue Wed Thu = 4
    const item = (await w.svc.getBoard(w.who.fatima)).items.find((i) => i.request.id === r.id);
    expect(item.workingDays).toBe(4);
  });

  it('final requests are never stalled', async () => {
    const r = await ready(w);
    await w.svc.markTransferred(w.who.anfal, r.id, 'FT1', [pdf()]);
    w.advanceDays(30);
    const item = (await w.svc.getBoard(w.who.fatima)).items.find((i) => i.request.id === r.id);
    expect(item.stalled).toBe(false);
  });

  it('the form context has rates and the file limit', async () => {
    const ctx = await w.svc.getFormContext(w.who.ahmed);
    expect(ctx.rates.USD).toBe(3.75);
    expect(ctx.maxFileMb).toBe(5);
  });

  it('is refused for someone who cannot create requests', async () => {
    await expect(w.svc.getFormContext(w.who.husni)).rejects.toMatchObject({
      key: 'errors.notAllowed',
    });
  });
});

describe('board logic', () => {
  /** @param {any} over */
  const item = (over = {}, extra = {}) => ({
    request: {
      id: 'x',
      ref: 'TRF-20261024-0001',
      beneficiary: 'Najd Logistics',
      category: 'vat',
      status: 'submitted',
      createdById: 'u1',
      createdAt: '2026-10-24T06:00:00Z',
      transferredAt: null,
      ...over,
    },
    progress: { approved: 0, total: 2 },
    waitingOnApprover: false,
    stalled: false,
    workingDays: 0,
    ...extra,
  });
  const users = { u1: { id: 'u1', nameEn: 'Ahmed Khalil', nameAr: 'أحمد خليل' } };
  const now = '2026-10-25T08:00:00Z';
  const ctx = { users, nowIso: now };

  it('counts the four tiles, leaving cancelled out of the total', () => {
    const items = [
      item({ status: 'submitted' }),
      item({ status: 'approving' }),
      item({ status: 'bank_created' }),
      item({ status: 'ready' }),
      item({ status: 'transferred', transferredAt: '2026-10-10T08:00:00Z' }), // this month
      item({ status: 'transferred', transferredAt: '2026-09-30T08:00:00Z' }), // last month
      item({ status: 'cancelled' }),
    ];
    expect(boardStats(items, now)).toEqual({ total: 6, review: 2, ready: 1, month: 1 });
  });

  it('decides "this month" in Riyadh time', () => {
    // 21:30 UTC on 30 Sep is already 00:30 on 1 Oct in Riyadh
    const items = [item({ status: 'transferred', transferredAt: '2026-09-30T21:30:00Z' })];
    expect(boardStats(items, now).month).toBe(1);
  });

  it('searches reference, beneficiary and the requester name in either language', () => {
    const items = [
      item(),
      item({ ref: 'TRF-20261024-0002', beneficiary: 'GOSI', createdById: 'u2' }),
    ];
    const f = (search) => applyFilters(items, { ...defaultFilters(), search }, ctx).length;
    expect(f('najd')).toBe(1);
    expect(f('0002')).toBe(1);
    expect(f('ahmed')).toBe(1);
    expect(f('أحمد')).toBe(1);
    expect(f('nobody')).toBe(0);
    expect(f('')).toBe(2);
  });

  it('filters by category, stalled, and the stat tiles', () => {
    const items = [
      item({ category: 'vat' }, { stalled: true }),
      item({ category: 'employee', status: 'ready' }),
    ];
    const run = (f) => applyFilters(items, { ...defaultFilters(), ...f }, ctx).length;
    expect(run({ category: 'vat' })).toBe(1);
    expect(run({ onlyStalled: true })).toBe(1);
    expect(run({ stat: 'ready' })).toBe(1);
    expect(run({ stat: 'review' })).toBe(0);
  });

  it('hides cancelled requests unless asked', () => {
    const items = [item({ status: 'cancelled' })];
    expect(applyFilters(items, defaultFilters(), ctx)).toHaveLength(0);
    expect(applyFilters(items, { ...defaultFilters(), showCancelled: true }, ctx)).toHaveLength(1);
  });

  it('lays out the columns: Returned only when used, Cancelled only when shown', () => {
    const f = defaultFilters();
    const names = (cols) => cols.map((c) => c.status);
    expect(names(buildColumns([], f, now))).toEqual([
      'submitted',
      'bank_created',
      'approving',
      'ready',
      'transferred',
    ]);
    expect(names(buildColumns([item({ status: 'returned' })], f, now))[0]).toBe('returned');
    expect(names(buildColumns([], { ...f, showCancelled: true }, now)).at(-1)).toBe('cancelled');
  });

  it('shows only this month in the Transferred column and counts the rest', () => {
    const items = [
      item({ status: 'transferred', transferredAt: '2026-10-10T08:00:00Z' }),
      item({ status: 'transferred', transferredAt: '2026-08-10T08:00:00Z' }),
      item({ status: 'transferred', transferredAt: '2026-07-10T08:00:00Z' }),
    ];
    const col = (f) => buildColumns(items, f, now).find((c) => c.status === 'transferred');
    expect(col(defaultFilters())).toMatchObject({ hidden: 2 });
    expect(col(defaultFilters()).items).toHaveLength(1);
    expect(col({ ...defaultFilters(), showAllTransferred: true })).toMatchObject({ hidden: 0 });
    expect(col({ ...defaultFilters(), showAllTransferred: true }).items).toHaveLength(3);
  });

  it('puts the newest request first in a column', () => {
    const a = item({ id: 'a', createdAt: '2026-10-20T00:00:00Z' });
    const b = item({ id: 'b', createdAt: '2026-10-24T00:00:00Z' });
    const col = buildColumns([a, b], defaultFilters(), now).find((c) => c.status === 'submitted');
    expect(col.items.map((i) => i.request.id)).toEqual(['b', 'a']);
  });

  it('knows when a filter is on', () => {
    expect(hasActiveFilters(defaultFilters())).toBe(false);
    expect(hasActiveFilters({ ...defaultFilters(), search: ' x ' })).toBe(true);
    expect(hasActiveFilters({ ...defaultFilters(), showAllTransferred: true })).toBe(false);
  });
});

describe('development sign-in', () => {
  const people = [
    { id: 'a', active: true, roles: ['admin'] },
    { id: 'b', active: false, roles: ['creator'] },
  ];
  const memoryStorage = () => {
    const m = new Map();
    return {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => m.set(k, v),
      removeItem: (k) => m.delete(k),
    };
  };
  const make = (storage = memoryStorage()) =>
    createDevAuthProvider({ listUsers: async () => people, storage });

  it('lists only active people to pick from', async () => {
    expect((await make().listSignInChoices()).map((u) => u.id)).toEqual(['a']);
  });
  it('remembers who signed in, and forgets on sign out', async () => {
    const auth = make();
    expect(await auth.getCurrentUser()).toBeNull();
    await auth.signIn('a');
    expect((await auth.getCurrentUser()).id).toBe('a');
    await auth.signOut();
    expect(await auth.getCurrentUser()).toBeNull();
  });
  it('refuses unknown and inactive people', async () => {
    const auth = make();
    await expect(auth.signIn('zzz')).rejects.toMatchObject({ key: 'errors.notFound' });
    await expect(auth.signIn('b')).rejects.toMatchObject({ key: 'errors.inactive' });
  });
  it('treats a deactivated person as signed out', async () => {
    const storage = memoryStorage();
    storage.setItem('tt-dev-user', 'b');
    expect(await make(storage).getCurrentUser()).toBeNull();
  });
  it('still works when storage is blocked', async () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const auth = make(blocked);
    expect((await auth.signIn('a')).id).toBe('a');
    expect(await auth.getCurrentUser()).toBeNull();
  });
});

describe('the done-when story for phase 2', () => {
  it('a requester creates a request with a document; another requester cannot see it', async () => {
    const w = await makeWorld();
    const created = await w.svc.createRequest(
      w.who.ahmed,
      {
        beneficiary: 'Najd Logistics',
        iban: 'SA0380000000608010167519',
        category: 'beneficiary',
        movement: 'external',
        swiftCode: 'NCBKSAJE',
        currency: 'USD',
        amount: 400000,
        purpose: '',
      },
      [pdf('INV-88213.pdf')],
    );
    expect(created.status).toBe('submitted');
    expect(created.ref).toMatch(/^TRF-\d{8}-\d{4}$/);
    const mine = await w.svc.getBoard(w.who.ahmed);
    expect(mine.items.map((i) => i.request.ref)).toEqual([created.ref]);
    const others = await w.svc.getBoard(w.who.sara);
    expect(others.items).toHaveLength(0);
  });

  it('the sample data shows up on the board for an admin, with every status', async () => {
    const repo = createMemoryRepository();
    const now = '2026-10-25T08:00:00.000Z';
    await loadReferenceData(repo, now);
    await loadSampleRequests(repo, { now });
    const svc = createServices({ repo, clock: () => now });
    const admin = (await repo.listUsers()).find((u) => u.roles.includes('admin'));
    const board = await svc.getBoard(admin);
    expect(board.items).toHaveLength(12);
    expect(boardStats(board.items, now).total).toBe(11); // one is cancelled
    expect(board.items.some((i) => i.stalled)).toBe(true);
  });
});

describe('text coverage', () => {
  /** @param {string} dir @returns {string[]} */
  function jsFiles(dir) {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return name === 'i18n' ? [] : jsFiles(p);
      return p.endsWith('.js') ? [p] : [];
    });
  }
  const namespaces =
    'app|nav|action|common|auth|board|pill|card|form|movement|tier|discard|status|role|bank|errors|validation|notfound|placeholder|detail|file|reject|cancel|behalf|transfer|log|field|approvals';
  const pattern = new RegExp(`['"\`]((?:${namespaces})\\.[A-Za-z_]+(?:\\.[A-Za-z_]+)?)['"\`]`, 'g');

  it('every text key used in the code exists in both languages', () => {
    const used = new Set();
    for (const file of jsFiles('public/assets/js')) {
      for (const m of readFileSync(file, 'utf8').matchAll(pattern)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(40);
    const missing = [...used].filter((k) => !(k in ar) || !(k in en));
    expect(missing).toEqual([]);
  });

  it('has the same keys in both languages', () => {
    expect([...dictionaryKeys.ar].sort()).toEqual([...dictionaryKeys.en].sort());
  });

  it('has a status label for every status and a role label for every role', () => {
    for (const s of [
      'submitted',
      'bank_created',
      'approving',
      'ready',
      'transferred',
      'returned',
      'cancelled',
    ]) {
      expect(en[`status.${s}`], s).toBeTruthy();
      expect(ar[`status.${s}`], s).toBeTruthy();
    }
    for (const r of ['creator', 'bank_ops', 'approver', 'admin']) {
      expect(en[`role.${r}`], r).toBeTruthy();
      expect(ar[`role.${r}`], r).toBeTruthy();
    }
  });
});
