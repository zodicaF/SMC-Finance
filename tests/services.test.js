// The rules of docs/SPEC.md section 4, exercised through the real services.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  makeWorld,
  newRequest,
  inBank,
  ready,
  approveAll,
  pdf,
  baseInput,
  errorKey,
} from './helpers.js';
import { ConflictError } from '../public/assets/js/domain/errors.js';

let w;
beforeEach(async () => {
  w = await makeWorld();
});

describe('creating a request', () => {
  it('creates a Submitted request with a reference, the SAR amount and a log line', async () => {
    const r = await newRequest(w, { currency: 'USD', amount: 400000 });
    expect(r.status).toBe('submitted');
    expect(r.ref).toBe('TRF-20261018-0001');
    expect(r.amountSar).toBe(1500000);
    expect(r.version).toBe(1);
    const detail = await w.svc.getRequestDetail(w.who.ahmed, r.ref);
    expect(detail.attachments.map((a) => a.kind)).toEqual(['payment_doc']);
    expect(detail.log.map((l) => l.action)).toEqual(['created']);
  });

  it('lists every wrong field at once', async () => {
    const err = await w.svc
      .createRequest(w.who.ahmed, baseInput({ beneficiary: '', amount: -1 }), [])
      .catch((e) => e);
    expect(err.key).toBe('errors.validation');
    expect(Object.keys(err.params.fields).sort()).toEqual(['amount', 'beneficiary', 'paymentDocs']);
  });

  it('refuses a wrong file type', async () => {
    const bad = { ...pdf('x.exe') };
    const err = await w.svc.createRequest(w.who.ahmed, baseInput(), [bad]).catch((e) => e);
    expect(err.params.fields.paymentDocs).toBe('validation.fileType');
  });

  it('an approver cannot create a request', async () => {
    expect(await errorKey(w.svc.createRequest(w.who.husni, baseInput(), [pdf()]))).toBe(
      'errors.notAllowed',
    );
  });

  it('creators only see their own requests', async () => {
    await newRequest(w);
    expect(await w.svc.listVisibleRequests(w.who.ahmed)).toHaveLength(1);
    expect(await w.svc.listVisibleRequests(w.who.sara)).toHaveLength(0);
    expect(await w.svc.listVisibleRequests(w.who.husni)).toHaveLength(1);
    const r = (await w.repo.listRequests())[0];
    expect(await errorKey(w.svc.getRequestDetail(w.who.sara, r.ref))).toBe('errors.notFound');
  });
});

describe('bank entry', () => {
  it('needs proof and moves to Created in bank with one pending approval row', async () => {
    const r = await newRequest(w);
    expect(await errorKey(w.svc.markBankCreated(w.who.anfal, r.id, []))).toBe(
      'validation.bankProof',
    );
    const saved = await w.svc.markBankCreated(w.who.anfal, r.id, [pdf('bank.pdf')]);
    expect(saved.status).toBe('bank_created');
    expect(saved.bankCreatedById).toBe(w.who.anfal.id);
    const rows = await w.repo.listApprovals(r.id);
    expect(rows.map((a) => [a.stageOrder, a.status])).toEqual([[1, 'pending']]);
  });

  it('only bank ops can do it', async () => {
    const r = await newRequest(w);
    expect(await errorKey(w.svc.markBankCreated(w.who.husni, r.id, [pdf()]))).toBe(
      'errors.notAllowed',
    );
    expect(await errorKey(w.svc.markBankCreated(w.who.ahmed, r.id, [pdf()]))).toBe(
      'errors.notAllowed',
    );
  });

  it('every amount needs exactly one approval', async () => {
    const big = await inBank(w, { amount: 2000000 });
    expect(await w.repo.listApprovals(big.id)).toHaveLength(1);
    const small = await inBank(w, { amount: 10 });
    expect(await w.repo.listApprovals(small.id)).toHaveLength(1);
  });
});

describe('deciding stages', () => {
  it('approving the single stage moves straight to Ready', async () => {
    const r = await inBank(w);
    const a = await w.svc.decideStage(w.who.husni, r.id, 1, 'approve');
    expect(a.status).toBe('ready');
  });

  it('any approver can decide, not only one in particular', async () => {
    const r = await inBank(w);
    const a = await w.svc.decideStage(w.who.msayed, r.id, 1, 'approve');
    expect(a.status).toBe('ready');
  });

  it('bank ops and creators cannot decide', async () => {
    const r = await inBank(w);
    expect(await errorKey(w.svc.decideStage(w.who.anfal, r.id, 1, 'approve'))).toBe(
      'errors.notYourStage',
    );
    expect(await errorKey(w.svc.decideStage(w.who.ahmed, r.id, 1, 'approve'))).toBe(
      'errors.notYourStage',
    );
  });

  it('a creator cannot decide a stage on their own request', async () => {
    // Husni creates a request himself (he also holds the creator role here)
    const husni = { ...w.who.husni, roles: ['approver', 'creator'] };
    await w.repo.saveUser(husni);
    const r = await w.svc.createRequest(husni, baseInput(), [pdf()]);
    await w.svc.markBankCreated(w.who.anfal, r.id, [pdf()]);
    expect(await errorKey(w.svc.decideStage(husni, r.id, 1, 'approve'))).toBe('errors.ownRequest');
  });

  it('a stage cannot be decided twice', async () => {
    const r = await inBank(w);
    await w.svc.decideStage(w.who.husni, r.id, 1, 'approve');
    // the request already left the approval phase once decided
    expect(await errorKey(w.svc.decideStage(w.who.msayed, r.id, 1, 'approve'))).toBe(
      'errors.wrongStatus',
    );
  });

  it('cannot decide before the transfer is entered in the bank', async () => {
    const r = await newRequest(w);
    expect(await errorKey(w.svc.decideStage(w.who.husni, r.id, 1, 'approve'))).toBe(
      'errors.wrongStatus',
    );
  });

  it('rejecting needs a reason of at least 5 characters', async () => {
    const r = await inBank(w);
    expect(await errorKey(w.svc.decideStage(w.who.husni, r.id, 1, 'reject'))).toBe(
      'validation.reason',
    );
    expect(await errorKey(w.svc.decideStage(w.who.husni, r.id, 1, 'reject', 'no'))).toBe(
      'validation.reason',
    );
  });

  it('a rejection returns the request with the reason', async () => {
    const r = await inBank(w);
    const saved = await w.svc.decideStage(w.who.msayed, r.id, 1, 'reject', 'IBAN does not match');
    expect(saved.status).toBe('returned');
    expect(saved.closedReason).toBe('IBAN does not match');
  });

  it('shows the request in My approvals until decided, and never for its creator', async () => {
    const r = await inBank(w);
    expect((await w.svc.myApprovals(w.who.husni)).map((i) => i.request.id)).toEqual([r.id]);
    expect((await w.svc.myApprovals(w.who.kharji)).map((i) => i.request.id)).toEqual([r.id]);
    await w.svc.decideStage(w.who.husni, r.id, 1, 'approve');
    expect(await w.svc.myApprovals(w.who.husni)).toEqual([]);
    expect(await w.svc.myApprovals(w.who.kharji)).toEqual([]);
  });

  it('is empty for someone without the approver role', async () => {
    expect(await w.svc.myApprovals(w.who.anfal)).toEqual([]);
    expect(await w.svc.myApprovals(w.who.ahmed)).toEqual([]);
  });
});

describe('recording on behalf', () => {
  it('needs evidence and is flagged on the approval row', async () => {
    const r = await inBank(w);
    expect(
      await errorKey(w.svc.recordOnBehalf(w.who.fatima, r.id, 1, 'approve', '', undefined)),
    ).toBe('validation.evidence');
    const saved = await w.svc.recordOnBehalf(
      w.who.fatima,
      r.id,
      1,
      'approve',
      '',
      pdf('email.pdf'),
    );
    expect(saved.status).toBe('ready');
    const row = (await w.repo.listApprovals(r.id)).find((a) => a.stageOrder === 1);
    expect(row.onBehalf).toBe(true);
    expect(row.decidedById).toBe(w.who.fatima.id);
    const files = await w.repo.listAttachments(r.id);
    expect(files.find((f) => f.id === row.evidenceId).kind).toBe('approval_evidence');
    const log = await w.repo.listLog(r.id);
    expect(log.at(-1).action).toBe('approved_on_behalf');
  });

  it("is not allowed for anyone but bank ops, nor on the bank ops user's own request", async () => {
    const r = await inBank(w);
    expect(await errorKey(w.svc.recordOnBehalf(w.who.ahmed, r.id, 1, 'approve', '', pdf()))).toBe(
      'errors.notAllowed',
    );
    const own = await w.svc.createRequest(w.who.fatima, baseInput(), [pdf()]);
    await w.svc.markBankCreated(w.who.anfal, own.id, [pdf()]);
    expect(
      await errorKey(w.svc.recordOnBehalf(w.who.fatima, own.id, 1, 'approve', '', pdf())),
    ).toBe('errors.ownRequest');
  });
});

describe('return and resubmit', () => {
  async function returned() {
    const r = await inBank(w);
    return w.svc.decideStage(w.who.husni, r.id, 1, 'reject', 'Please fix the IBAN');
  }

  it('with unchanged payment details goes back to Created in bank as round 2', async () => {
    const r = await returned();
    const saved = await w.svc.resubmit(w.who.ahmed, r.id);
    expect(saved.status).toBe('bank_created');
    expect(saved.round).toBe(2);
    expect(saved.closedReason).toBeNull();
    const rows = await w.repo.listApprovals(r.id);
    expect(rows.filter((x) => x.round === 1)).toHaveLength(1); // history is kept
    const fresh = rows.filter((x) => x.round === 2);
    expect(fresh.map((x) => x.status)).toEqual(['pending']);
  });

  it('with a changed IBAN goes back to bank ops and clears the bank entry', async () => {
    const r = await returned();
    await w.svc.updateRequest(w.who.ahmed, r.id, baseInput({ iban: 'SA1220000001234567891519' }));
    const saved = await w.svc.resubmit(w.who.ahmed, r.id);
    expect(saved.status).toBe('submitted');
    expect(saved.round).toBe(2);
    expect(saved.bankCreatedAt).toBeNull();
    expect(saved.bankedDetails).toBeNull();
  });

  it('a changed amount also goes back to bank ops', async () => {
    const r = await returned();
    await w.svc.updateRequest(w.who.ahmed, r.id, baseInput({ amount: 250000 }));
    expect((await w.svc.resubmit(w.who.ahmed, r.id)).status).toBe('submitted');
  });

  it('changed notes alone do not', async () => {
    const r = await returned();
    await w.svc.updateRequest(w.who.ahmed, r.id, baseInput({ purpose: 'New note' }));
    expect((await w.svc.resubmit(w.who.ahmed, r.id)).status).toBe('bank_created');
  });

  it('only the creator or an admin can resubmit, and only when returned', async () => {
    const r = await returned();
    expect(await errorKey(w.svc.resubmit(w.who.sara, r.id))).toBe('errors.notAllowed');
    const ok = await inBank(w);
    expect(await errorKey(w.svc.resubmit(w.who.ahmed, ok.id))).toBe('errors.wrongStatus');
  });
});

describe('editing', () => {
  it('is allowed while Submitted, recalculating the SAR amount', async () => {
    const r = await newRequest(w, { amount: 1000 });
    const saved = await w.svc.updateRequest(
      w.who.ahmed,
      r.id,
      baseInput({ amount: 400000, currency: 'USD' }),
    );
    expect(saved.amountSar).toBe(1500000);
    expect(saved.version).toBe(2);
  });

  it('is refused once a request is in the bank or being approved', async () => {
    const r = await inBank(w);
    expect(await errorKey(w.svc.updateRequest(w.who.ahmed, r.id, baseInput({ amount: 5 })))).toBe(
      'errors.wrongStatus',
    );
    await w.svc.decideStage(w.who.husni, r.id, 1, 'approve');
    expect(await errorKey(w.svc.updateRequest(w.who.fatima, r.id, baseInput({ amount: 5 })))).toBe(
      'errors.wrongStatus',
    );
  });

  it('another creator cannot edit it', async () => {
    const r = await newRequest(w);
    expect(await errorKey(w.svc.updateRequest(w.who.sara, r.id, baseInput()))).toBe(
      'errors.notAllowed',
    );
  });
});

describe('transfer', () => {
  it('needs a reference and a receipt, then marks transferred and debited', async () => {
    const r = await ready(w);
    expect(r.status).toBe('ready');
    expect(await errorKey(w.svc.markTransferred(w.who.anfal, r.id, '', [pdf()]))).toBe(
      'validation.bankRef',
    );
    expect(await errorKey(w.svc.markTransferred(w.who.anfal, r.id, 'FT1', []))).toBe(
      'validation.receipt',
    );
    const saved = await w.svc.markTransferred(w.who.anfal, r.id, 'FT1', [pdf('receipt.pdf')]);
    expect(saved.status).toBe('transferred');
    expect(saved.transferRef).toBe('FT1');
    expect((await w.repo.getBankStatus(r.id)).state).toBe('debited');
  });

  it('is only possible when Ready, and only by bank ops', async () => {
    const r = await inBank(w);
    expect(await errorKey(w.svc.markTransferred(w.who.anfal, r.id, 'FT1', [pdf()]))).toBe(
      'errors.wrongStatus',
    );
    const rd = await ready(w);
    expect(await errorKey(w.svc.markTransferred(w.who.husni, rd.id, 'FT1', [pdf()]))).toBe(
      'errors.notAllowed',
    );
  });

  it('keeps a request held for review as held', async () => {
    const r = await ready(w);
    await w.svc.setBankStatus(w.who.anfal, r.id, { state: 'review', reasons: ['compliance'] });
    await w.svc.markTransferred(w.who.anfal, r.id, 'FT2', [pdf()]);
    expect((await w.repo.getBankStatus(r.id)).state).toBe('review');
  });
});

describe('bank-side status', () => {
  it('review needs at least one valid reason', async () => {
    const r = await ready(w);
    expect(
      await errorKey(w.svc.setBankStatus(w.who.anfal, r.id, { state: 'review', reasons: [] })),
    ).toBe('validation.reviewReasons');
    expect(
      await errorKey(
        w.svc.setBankStatus(w.who.anfal, r.id, { state: 'review', reasons: ['nonsense'] }),
      ),
    ).toBe('validation.reviewReasons');
  });

  it('records who followed up and when, once', async () => {
    const r = await ready(w);
    w.advanceDays(1);
    const first = await w.svc.setBankStatus(w.who.anfal, r.id, {
      state: 'review',
      reasons: ['docs_missing'],
      followedUp: true,
    });
    expect(first.followedUpById).toBe(w.who.anfal.id);
    w.advanceDays(1);
    const second = await w.svc.setBankStatus(w.who.fatima, r.id, {
      state: 'review',
      reasons: ['docs_missing'],
      followedUp: true,
      note: 'again',
    });
    expect(second.followedUpById).toBe(w.who.anfal.id); // unchanged
    expect(second.followedUpAt).toBe(first.followedUpAt);
    const cleared = await w.svc.setBankStatus(w.who.fatima, r.id, {
      state: 'executing',
      followedUp: false,
    });
    expect(cleared.followedUpById).toBeNull();
    expect(cleared.reasons).toEqual([]);
  });

  it('is only for bank ops, on ready or transferred requests', async () => {
    const r = await inBank(w);
    expect(await errorKey(w.svc.setBankStatus(w.who.anfal, r.id, { state: 'executing' }))).toBe(
      'errors.wrongStatus',
    );
    const rd = await ready(w);
    expect(await errorKey(w.svc.setBankStatus(w.who.husni, rd.id, { state: 'executing' }))).toBe(
      'errors.notAllowed',
    );
  });
});

describe('cancel and delete', () => {
  it('cancel needs a reason; the request is kept', async () => {
    const r = await newRequest(w);
    expect(await errorKey(w.svc.cancelRequest(w.who.ahmed, r.id, 'no'))).toBe('validation.reason');
    const saved = await w.svc.cancelRequest(w.who.ahmed, r.id, 'Duplicate of another');
    expect(saved.status).toBe('cancelled');
    expect(saved.closedReason).toBe('Duplicate of another');
    expect(await w.repo.getRequestById(r.id)).not.toBeNull();
  });

  it('a creator cannot cancel after bank entry; an admin can until transferred', async () => {
    const r = await inBank(w);
    expect(await errorKey(w.svc.cancelRequest(w.who.ahmed, r.id, 'Changed my mind'))).toBe(
      'errors.wrongStatus',
    );
    expect((await w.svc.cancelRequest(w.who.fatima, r.id, 'Wrong supplier')).status).toBe(
      'cancelled',
    );
  });

  it('cannot cancel a transferred request', async () => {
    const r = await ready(w);
    await w.svc.markTransferred(w.who.anfal, r.id, 'FT3', [pdf()]);
    expect(await errorKey(w.svc.cancelRequest(w.who.fatima, r.id, 'Too late now'))).toBe(
      'errors.wrongStatus',
    );
  });

  it('delete: admin only, only before the bank entry, and the log keeps the reference', async () => {
    const r = await newRequest(w);
    expect(await errorKey(w.svc.deleteRequest(w.who.ahmed, r.id))).toBe('errors.notAllowed');
    await w.svc.deleteRequest(w.who.fatima, r.id);
    expect(await w.repo.getRequestById(r.id)).toBeNull();
    const log = await w.repo.listLog(r.id);
    expect(log.map((l) => l.action)).toEqual(['created', 'deleted']);
    expect(log[1].requestRef).toBe(r.ref);

    const banked = await inBank(w);
    expect(await errorKey(w.svc.deleteRequest(w.who.fatima, banked.id))).toBe('errors.wrongStatus');
  });
});

describe('two people acting at once', () => {
  it('a stale version throws ConflictError and changes nothing', async () => {
    const r = await inBank(w);
    await w.svc.decideStage(w.who.husni, r.id, 1, 'approve', '', r.version);
    await expect(
      w.svc.decideStage(w.who.msayed, r.id, 1, 'approve', '', r.version),
    ).rejects.toBeInstanceOf(ConflictError);
    const row = (await w.repo.listApprovals(r.id)).find((a) => a.stageOrder === 1);
    expect(row.status).toBe('approved');
  });

  it('two decisions racing: exactly one wins', async () => {
    const r = await inBank(w);
    const results = await Promise.allSettled([
      w.svc.decideStage(w.who.husni, r.id, 1, 'approve', '', r.version),
      w.svc.decideStage(w.who.msayed, r.id, 1, 'approve', '', r.version),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  });
});

describe('the whole story', () => {
  it('Ahmed creates 1,850,000 SAR and it ends Transferred, with a complete history', async () => {
    const r = await newRequest(w, { amount: 1850000, bank: 'Al Rajhi Bank' });
    await w.svc.markBankCreated(w.who.anfal, r.id, [pdf('bank.pdf')]);
    await w.svc.recordOnBehalf(w.who.fatima, r.id, 1, 'approve', '', pdf('email.pdf'));
    const done = await w.svc.markTransferred(w.who.anfal, r.id, 'FT2630155', [pdf('receipt.pdf')]);
    expect(done.status).toBe('transferred');
    const detail = await w.svc.getRequestDetail(w.who.ahmed, r.ref);
    expect(detail.log.map((l) => l.action)).toEqual([
      'created',
      'bank_created',
      'approved_on_behalf',
      'transferred',
    ]);
    expect(detail.attachments.map((a) => a.kind).sort()).toEqual([
      'approval_evidence',
      'bank_proof',
      'payment_doc',
      'transfer_receipt',
    ]);
  });

  it('approveAll helper reaches Ready for any amount', async () => {
    const r = await inBank(w, { amount: 5000000 });
    expect((await approveAll(w, r.id)).status).toBe('ready');
  });
});

describe('admin', () => {
  it('is for admins only and cannot lock the admin out', async () => {
    expect(await errorKey(w.svc.saveFxRate(w.who.ahmed, 'USD', 3.8))).toBe('errors.notAllowed');
    await w.svc.saveFxRate(w.who.fatima, 'USD', 3.8);
    expect((await w.repo.listFxRates()).find((r) => r.currency === 'USD').rateToSar).toBe(3.8);
    expect(await errorKey(w.svc.saveFxRate(w.who.fatima, 'USD', 0))).toBe('errors.validation');
    expect(await errorKey(w.svc.saveUser(w.who.fatima, { ...w.who.fatima, active: false }))).toBe(
      'errors.selfLockout',
    );
    expect(
      await errorKey(w.svc.saveUser(w.who.fatima, { ...w.who.fatima, roles: ['bank_ops'] })),
    ).toBe('errors.selfLockout');
  });

  it('a changed rate does not alter an existing request', async () => {
    const r = await inBank(w, { currency: 'USD', amount: 100000 });
    await w.svc.saveFxRate(w.who.fatima, 'USD', 4);
    expect((await w.repo.getRequestById(r.id)).amountSar).toBe(375000);
  });
});
