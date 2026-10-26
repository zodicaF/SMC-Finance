// Shared contract: every repository implementation must pass these tests.
import { describe, it, expect, beforeEach } from 'vitest';
import { REPOSITORY_METHODS } from '../public/assets/js/data/repository.js';
import { ConflictError } from '../public/assets/js/domain/errors.js';

const NOW = '2026-10-24T07:12:00.000Z';

function sampleRequest(id = 'r1', ref = 'TRF-20261024-0001') {
  return {
    id,
    ref,
    version: 1,
    createdById: 'u1',
    createdAt: NOW,
    updatedAt: NOW,
    statusChangedAt: NOW,
    status: 'submitted',
    round: 1,
    beneficiary: 'Najd Logistics',
    bank: '',
    iban: '',
    category: 'beneficiary',
    movement: 'external',
    swiftCode: 'NCBKSAJE',
    currency: 'USD',
    amount: 400000,
    fxRate: 3.75,
    amountSar: 1500000,
    purpose: '',
    bankCreatedById: null,
    bankCreatedAt: null,
    bankedDetails: null,
    transferredById: null,
    transferredAt: null,
    transferRef: null,
    closedReason: null,
    isSample: false,
  };
}

const approval = (id, requestId, round, stageOrder) => ({
  id,
  requestId,
  round,
  stageOrder,
  status: 'pending',
  decidedById: null,
  onBehalf: false,
  evidenceId: null,
  note: null,
  decidedAt: null,
});

const meta = (id, requestId) => ({
  id,
  requestId,
  kind: 'payment_doc',
  fileName: 'inv.pdf',
  mime: 'application/pdf',
  sizeBytes: 5,
  uploadedById: 'u1',
  uploadedAt: NOW,
});

/**
 * @param {string} name
 * @param {() => import('../public/assets/js/data/repository.js').Repository} makeRepo
 */
export function runRepositoryContract(name, makeRepo) {
  describe(`repository contract: ${name}`, () => {
    let repo;
    beforeEach(() => {
      repo = makeRepo();
    });

    it('has every method of the interface', () => {
      for (const m of REPOSITORY_METHODS) expect(typeof repo[m], m).toBe('function');
    });

    it('has no way to update or delete log entries', () => {
      const names = Object.keys(repo).filter((k) => /log/i.test(k));
      expect(names.sort()).toEqual(['appendLog', 'listAllLog', 'listLog']);
    });

    it('stores users, settings and rates', async () => {
      await repo.saveUser({
        id: 'u1',
        email: 'a@x.test',
        nameEn: 'A',
        nameAr: 'أ',
        roles: ['admin'],
        active: true,
      });
      expect(await repo.listUsers()).toHaveLength(1);
      await repo.saveSetting('stalledDays', '3');
      expect(await repo.getSettings()).toEqual({ stalledDays: '3' });
      await repo.saveFxRate({
        currency: 'USD',
        rateToSar: 3.75,
        updatedAt: NOW,
        updatedById: 'u1',
      });
      expect((await repo.listFxRates())[0].rateToSar).toBe(3.75);
    });

    it('deletes a user', async () => {
      await repo.saveUser({
        id: 'u2',
        email: 'b@x.test',
        nameEn: 'B',
        nameAr: 'ب',
        roles: ['creator'],
        active: true,
      });
      expect(await repo.listUsers()).toHaveLength(1);
      await repo.deleteUser('u2');
      expect(await repo.listUsers()).toEqual([]);
    });

    it('inserts and reads a request by id and by reference', async () => {
      await repo.insertRequest(sampleRequest());
      expect((await repo.getRequestById('r1')).beneficiary).toBe('Najd Logistics');
      expect((await repo.getRequestByRef('TRF-20261024-0001')).id).toBe('r1');
      expect(await repo.getRequestById('nope')).toBeNull();
      expect(await repo.listRequests()).toHaveLength(1);
    });

    it('increments the version on update and rejects a stale version', async () => {
      await repo.insertRequest(sampleRequest());
      const saved = await repo.updateRequest({ ...sampleRequest(), status: 'bank_created' }, 1);
      expect(saved.version).toBe(2);
      expect((await repo.getRequestById('r1')).status).toBe('bank_created');
      await expect(
        repo.updateRequest({ ...sampleRequest(), status: 'cancelled' }, 1),
      ).rejects.toBeInstanceOf(ConflictError);
      expect((await repo.getRequestById('r1')).status).toBe('bank_created');
    });

    it('makes references per Riyadh day, in sequence, and never reuses one after a delete', async () => {
      expect(await repo.nextReference(NOW)).toBe('TRF-20261024-0001');
      expect(await repo.nextReference(NOW)).toBe('TRF-20261024-0002');
      // 22:30 UTC on 24 Oct is 01:30 on 25 Oct in Riyadh
      expect(await repo.nextReference('2026-10-24T22:30:00.000Z')).toBe('TRF-20261025-0001');
      await repo.insertRequest(sampleRequest('r9', 'TRF-20261024-0002'));
      await repo.deleteRequest('r9');
      expect(await repo.nextReference(NOW)).toBe('TRF-20261024-0003');
    });

    it('rejects a duplicate reference', async () => {
      await repo.insertRequest(sampleRequest('r1', 'TRF-20261024-0001'));
      await expect(
        repo.insertRequest(sampleRequest('r2', 'TRF-20261024-0001')),
      ).rejects.toBeTruthy();
    });

    it('saves approvals by id, ordered by round then stage', async () => {
      await repo.saveApprovals([
        approval('x3', 'r1', 2, 1),
        approval('x2', 'r1', 1, 2),
        approval('x1', 'r1', 1, 1),
      ]);
      expect((await repo.listApprovals('r1')).map((a) => a.id)).toEqual(['x1', 'x2', 'x3']);
      await repo.saveApprovals([{ ...approval('x1', 'r1', 1, 1), status: 'approved' }]);
      expect((await repo.listApprovals('r1'))[0].status).toBe('approved');
      expect(await repo.listAllApprovals()).toHaveLength(3);
    });

    it('stores bank status', async () => {
      const bs = {
        requestId: 'r1',
        state: 'review',
        reasons: ['compliance'],
        note: '',
        followedUp: false,
        followedUpById: null,
        followedUpAt: null,
        updatedById: null,
        updatedAt: null,
      };
      await repo.saveBankStatus(bs);
      expect((await repo.getBankStatus('r1')).reasons).toEqual(['compliance']);
      expect(await repo.getBankStatus('zzz')).toBeNull();
      expect(await repo.listBankStatuses()).toHaveLength(1);
    });

    it('stores files and gives the same bytes back', async () => {
      await repo.addAttachment(
        meta('f1', 'r1'),
        new Blob(['hello pdf'], { type: 'application/pdf' }),
      );
      expect(await repo.listAttachments('r1')).toHaveLength(1);
      const blob = await repo.openAttachment('f1');
      expect(await blob.text()).toBe('hello pdf');
    });

    it('keeps the log in order and removes a deleted request with its children but not its log', async () => {
      await repo.insertRequest(sampleRequest());
      await repo.saveApprovals([approval('x1', 'r1', 1, 1)]);
      await repo.saveBankStatus({
        requestId: 'r1',
        state: 'executing',
        reasons: [],
        note: '',
        followedUp: false,
        followedUpById: null,
        followedUpAt: null,
        updatedById: null,
        updatedAt: null,
      });
      await repo.addAttachment(meta('f1', 'r1'), new Blob(['x']));
      await repo.appendLog({
        id: 'l1',
        requestId: 'r1',
        requestRef: 'TRF-20261024-0001',
        actorId: 'u1',
        action: 'created',
        details: {},
        createdAt: NOW,
      });
      await repo.appendLog({
        id: 'l2',
        requestId: 'r1',
        requestRef: 'TRF-20261024-0001',
        actorId: 'u1',
        action: 'deleted',
        details: { a: 1 },
        createdAt: NOW,
      });
      await repo.deleteRequest('r1');
      expect(await repo.getRequestById('r1')).toBeNull();
      expect(await repo.listApprovals('r1')).toEqual([]);
      expect(await repo.getBankStatus('r1')).toBeNull();
      expect(await repo.listAttachments('r1')).toEqual([]);
      expect((await repo.listLog('r1')).map((l) => l.id)).toEqual(['l1', 'l2']);
    });

    it('lists every log entry across requests, including admin ones with no request', async () => {
      await repo.appendLog({
        id: 'l1',
        requestId: 'r1',
        requestRef: 'TRF-20261024-0001',
        actorId: 'u1',
        action: 'created',
        details: {},
        createdAt: NOW,
      });
      await repo.appendLog({
        id: 'l2',
        requestId: null,
        requestRef: '',
        actorId: 'u2',
        action: 'admin_change',
        details: {},
        createdAt: NOW,
      });
      expect((await repo.listAllLog()).map((l) => l.id).sort()).toEqual(['l1', 'l2']);
    });
  });
}
