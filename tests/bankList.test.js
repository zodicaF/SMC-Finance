// The bank-side status list (S6): the pure filter, and the service that feeds it.
import { describe, it, expect, beforeEach } from 'vitest';
import { makeWorld, ready, newRequest, inBank, pdf, errorKey } from './helpers.js';
import { ConflictError } from '../public/assets/js/domain/errors.js';
import {
  defaultBankFilters,
  filterBankItems,
  hasActiveBankFilters,
  needsFollowUp,
} from '../public/assets/js/domain/bankList.js';

const row = (ref, beneficiary, state, followedUp, changed) => ({
  request: { ref, beneficiary, statusChangedAt: changed },
  bankStatus: { state, followedUp },
});

describe('filterBankItems', () => {
  const items = [
    row('TRF-1', 'Eastern Cement', 'executing', false, '2026-10-20T00:00:00Z'),
    row('TRF-2', 'ZATCA VAT', 'review', true, '2026-10-19T00:00:00Z'),
    row('TRF-3', 'Employee Hassan', 'debited', false, '2026-10-18T00:00:00Z'),
    row('TRF-4', 'Other Co', 'review', false, '2026-10-21T00:00:00Z'),
  ];

  it('lists held rows first, then executing, then debited, newest first within a state', () => {
    expect(filterBankItems(items, defaultBankFilters()).map((i) => i.request.ref)).toEqual([
      'TRF-4',
      'TRF-2',
      'TRF-1',
      'TRF-3',
    ]);
  });

  it('searches the reference and the beneficiary, ignoring case', () => {
    const f = { ...defaultBankFilters(), search: ' cement ' };
    expect(filterBankItems(items, f).map((i) => i.request.ref)).toEqual(['TRF-1']);
    expect(filterBankItems(items, { ...f, search: 'trf-3' })).toHaveLength(1);
  });

  it('filters by state', () => {
    const f = { ...defaultBankFilters(), state: 'review' };
    expect(filterBankItems(items, f).map((i) => i.request.ref)).toEqual(['TRF-4', 'TRF-2']);
  });

  it('"not followed up" keeps rows still needing a follow-up, never debited ones', () => {
    const f = { ...defaultBankFilters(), notFollowedUp: true };
    expect(filterBankItems(items, f).map((i) => i.request.ref)).toEqual(['TRF-4', 'TRF-1']);
    expect(needsFollowUp({ state: 'debited', followedUp: false })).toBe(false);
  });

  it('knows when a filter is active', () => {
    expect(hasActiveBankFilters(defaultBankFilters())).toBe(false);
    expect(hasActiveBankFilters({ ...defaultBankFilters(), search: 'x' })).toBe(true);
  });
});

describe('getBankList', () => {
  let w;
  beforeEach(async () => {
    w = await makeWorld();
  });

  it('lists only Ready and Transferred requests, with their bank-status history', async () => {
    await newRequest(w);
    await inBank(w);
    const r = await ready(w);
    await w.svc.setBankStatus(w.who.anfal, r.id, { state: 'review', reasons: ['compliance'] });
    await w.svc.setBankStatus(w.who.anfal, r.id, { state: 'debited' }, undefined, [pdf()]);
    const { items } = await w.svc.getBankList(w.who.fatima);
    expect(items).toHaveLength(1);
    expect(items[0].bankStatus.state).toBe('debited');
    expect(items[0].history.map((e) => e.details.to)).toEqual(['review', 'debited']);
  });

  it('a new Ready request starts as "executing" with no history', async () => {
    await ready(w);
    const { items } = await w.svc.getBankList(w.who.anfal);
    expect(items[0].bankStatus.state).toBe('executing');
    expect(items[0].history).toEqual([]);
  });

  it("hides other creators' requests from a requester but shows them to approvers", async () => {
    await ready(w); // created by Ahmed
    expect((await w.svc.getBankList(w.who.sara)).items).toHaveLength(0);
    expect((await w.svc.getBankList(w.who.ahmed)).items).toHaveLength(1);
    expect((await w.svc.getBankList(w.who.husni)).items).toHaveLength(1);
  });

  it('the Phase 4 story: review with two reasons, followed up, then debited, all in history', async () => {
    const r = await ready(w);
    await w.svc.setBankStatus(w.who.anfal, r.id, {
      state: 'review',
      reasons: ['compliance', 'docs_missing'],
      note: 'Bank asked for the notice',
    });
    await w.svc.setBankStatus(w.who.anfal, r.id, {
      state: 'review',
      reasons: ['compliance', 'docs_missing'],
      followedUp: true,
    });
    await w.svc.setBankStatus(w.who.anfal, r.id, { state: 'debited', followedUp: true }, undefined, [
      pdf(),
    ]);
    const { items } = await w.svc.getBankList(w.who.anfal);
    const [item] = items;
    expect(item.bankStatus.state).toBe('debited');
    expect(item.bankStatus.reasons).toEqual([]);
    expect(
      item.history.map((e) => [e.details.to, e.details.reasons.length, e.details.followedUp]),
    ).toEqual([
      ['review', 2, false],
      ['review', 2, true],
      ['debited', 0, true],
    ]);
  });

  it('setting debited needs proof the first time, but not again once attached', async () => {
    const r = await ready(w);
    expect(await errorKey(w.svc.setBankStatus(w.who.anfal, r.id, { state: 'debited' }))).toBe(
      'validation.debitProof',
    );
    await w.svc.setBankStatus(w.who.anfal, r.id, { state: 'debited' }, undefined, [
      pdf('debit-proof.pdf'),
    ]);
    const { items } = await w.svc.getBankList(w.who.anfal);
    expect(items[0].debitProofs.map((f) => f.fileName)).toEqual(['debit-proof.pdf']);
    // moving it to review and back to debited does not ask again - the proof is still attached
    await w.svc.setBankStatus(w.who.anfal, r.id, { state: 'review', reasons: ['compliance'] });
    await w.svc.setBankStatus(w.who.anfal, r.id, { state: 'debited' });
    expect((await w.svc.getBankList(w.who.anfal)).items[0].bankStatus.state).toBe('debited');
  });

  it('refuses a stale version with a conflict', async () => {
    const r = await ready(w);
    const seen = (await w.repo.getRequestById(r.id)).version;
    await w.svc.setBankStatus(w.who.anfal, r.id, { state: 'debited' }, seen, [pdf()]);
    await expect(
      w.svc.setBankStatus(w.who.fatima, r.id, { state: 'executing' }, seen),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
