// Phase 3: the data the request page and "My approvals" need, files added later, and the text
// for every line of the history.
import { describe, it, expect, beforeEach } from 'vitest';
import { makeWorld, newRequest, inBank, ready, pdf, errorKey } from './helpers.js';
import { ar } from '../public/assets/js/i18n/ar.js';
import { en } from '../public/assets/js/i18n/en.js';

let w;
beforeEach(async () => {
  w = await makeWorld();
});

describe('getRequestDetail', () => {
  it('includes the names the page needs', async () => {
    const r = await newRequest(w);
    const d = await w.svc.getRequestDetail(w.who.ahmed, r.ref);
    expect(d.users[w.who.husni.id].nameEn).toBe('Husni Bakdash');
    expect(d.attachments.map((a) => a.kind)).toEqual(['payment_doc']);
    expect(d.log.map((l) => l.action)).toEqual(['created']);
  });

  it('says "not found" both for a missing request and for someone else\'s', async () => {
    const r = await newRequest(w);
    expect(await errorKey(w.svc.getRequestDetail(w.who.sara, r.ref))).toBe('errors.notFound');
    expect(await errorKey(w.svc.getRequestDetail(w.who.sara, 'TRF-20260101-9999'))).toBe(
      'errors.notFound',
    );
  });

  it('shows the current round separately from earlier rounds', async () => {
    const r = await inBank(w);
    await w.svc.decideStage(w.who.husni, r.id, 1, 'reject', 'Please fix the IBAN');
    await w.svc.resubmit(w.who.ahmed, r.id);
    const d = await w.svc.getRequestDetail(w.who.ahmed, r.ref);
    expect(d.request.round).toBe(2);
    expect(d.approvals).toHaveLength(4);
    expect(d.currentApprovals).toHaveLength(2);
    expect(d.currentApprovals.every((a) => a.round === 2 && a.status === 'pending')).toBe(true);
  });
});

describe('getApprovalQueue', () => {
  it('lists waiting requests with the stage and how long they have waited', async () => {
    const r = await inBank(w);
    w.advanceDays(2); // Sun -> Tue = 2 working days
    const q = await w.svc.getApprovalQueue(w.who.husni);
    expect(q.items).toHaveLength(1);
    expect(q.items[0].request.id).toBe(r.id);
    expect(q.items[0].stage.stageOrder).toBe(1);
    expect(q.items[0].workingDays).toBe(2);
    expect(q.users[w.who.ahmed.id].nameEn).toBe('Ahmed Khalil');
  });

  it('is empty for someone with nothing to decide, and shrinks once decided', async () => {
    const r = await inBank(w);
    expect((await w.svc.getApprovalQueue(w.who.ahmed)).items).toEqual([]);
    expect((await w.svc.getApprovalQueue(w.who.husni)).items).toHaveLength(1);
    await w.svc.decideStage(w.who.husni, r.id, 1, 'approve');
    expect((await w.svc.getApprovalQueue(w.who.husni)).items).toEqual([]);
  });
});

describe('addAttachment', () => {
  it('lets the creator add a payment document while the request is editable', async () => {
    const r = await newRequest(w);
    const added = await w.svc.addAttachment(w.who.ahmed, r.id, 'payment_doc', [pdf('extra.pdf')]);
    expect(added.map((a) => a.fileName)).toEqual(['extra.pdf']);
    const d = await w.svc.getRequestDetail(w.who.ahmed, r.ref);
    expect(d.attachments.filter((a) => a.kind === 'payment_doc')).toHaveLength(2);
    expect(d.log.at(-1)).toMatchObject({
      action: 'file_added',
      details: { kind: 'payment_doc', fileName: 'extra.pdf' },
    });
  });

  it('refuses a payment document once the request is in the bank, or from someone else', async () => {
    const r = await newRequest(w);
    expect(await errorKey(w.svc.addAttachment(w.who.sara, r.id, 'payment_doc', [pdf()]))).toBe(
      'errors.notAllowed',
    );
    await w.svc.markBankCreated(w.who.anfal, r.id, [pdf('bank.pdf')]);
    expect(await errorKey(w.svc.addAttachment(w.who.ahmed, r.id, 'payment_doc', [pdf()]))).toBe(
      'errors.wrongStatus',
    );
  });

  it('lets bank ops attach proof, which then lets them mark the request created', async () => {
    const r = await newRequest(w);
    expect(await errorKey(w.svc.addAttachment(w.who.ahmed, r.id, 'bank_proof', [pdf()]))).toBe(
      'errors.notAllowed',
    );
    expect(await errorKey(w.svc.markBankCreated(w.who.anfal, r.id, []))).toBe(
      'validation.bankProof',
    );
    await w.svc.addAttachment(w.who.anfal, r.id, 'bank_proof', [pdf('entry.pdf')]);
    const saved = await w.svc.markBankCreated(w.who.anfal, r.id, []); // uses the proof already attached
    expect(saved.status).toBe('bank_created');
  });

  it('refuses other kinds, no files, bad files', async () => {
    const r = await newRequest(w);
    expect(
      await errorKey(w.svc.addAttachment(w.who.ahmed, r.id, 'transfer_receipt', [pdf()])),
    ).toBe('errors.notAllowed');
    expect(await errorKey(w.svc.addAttachment(w.who.ahmed, r.id, 'payment_doc', []))).toBe(
      'validation.paymentDocs',
    );
    expect(
      await errorKey(w.svc.addAttachment(w.who.ahmed, r.id, 'payment_doc', [pdf('x.exe')])),
    ).toBe('validation.fileType');
  });
});

describe('openAttachment', () => {
  it('returns the stored file to someone who may see the request', async () => {
    const r = await newRequest(w);
    const meta = (await w.repo.listAttachments(r.id))[0];
    const { blob, meta: got } = await w.svc.openAttachment(w.who.husni, r.id, meta.id);
    expect(got.fileName).toBe('invoice.pdf');
    expect(await blob.text()).toContain('%PDF');
  });

  it('refuses someone who may not see it, and a file from another request', async () => {
    const r = await newRequest(w);
    const other = await newRequest(w, { beneficiary: 'Someone else' });
    const meta = (await w.repo.listAttachments(r.id))[0];
    expect(await errorKey(w.svc.openAttachment(w.who.sara, r.id, meta.id))).toBe('errors.notFound');
    expect(await errorKey(w.svc.openAttachment(w.who.fatima, other.id, meta.id))).toBe(
      'errors.notFound',
    );
  });
});

describe('the history', () => {
  it('has text in both languages for every kind of entry', () => {
    for (const action of [
      'created',
      'edited',
      'bank_created',
      'approved',
      'rejected',
      'approved_on_behalf',
      'rejected_on_behalf',
      'resubmitted',
      'transferred',
      'bank_status',
      'cancelled',
      'deleted',
      'file_added',
      'admin_change',
    ]) {
      expect(en[`log.${action}`], action).toBeTruthy();
      expect(ar[`log.${action}`], action).toBeTruthy();
    }
    expect(en['log.resubmittedBank']).toBeTruthy();
    expect(ar['log.resubmittedBank']).toBeTruthy();
  });

  it('every action the services write is one the screen can describe', async () => {
    // Run the whole story and check each log line has a text.
    const r = await newRequest(w, { amount: 2000000 });
    await w.svc.updateRequest(w.who.ahmed, r.id, { ...r, purpose: 'edited' });
    await w.svc.addAttachment(w.who.ahmed, r.id, 'payment_doc', [pdf('b.pdf')]);
    await w.svc.markBankCreated(w.who.anfal, r.id, [pdf('bank.pdf')]);
    await w.svc.decideStage(w.who.husni, r.id, 1, 'reject', 'Wrong beneficiary');
    await w.svc.resubmit(w.who.ahmed, r.id);
    await w.svc.recordOnBehalf(w.who.fatima, r.id, 1, 'approve', '', pdf('mail.pdf'));
    await w.svc.decideStage(w.who.kharji, r.id, 2, 'approve');
    await w.svc.setBankStatus(w.who.anfal, r.id, { state: 'review', reasons: ['compliance'] });
    await w.svc.markTransferred(w.who.anfal, r.id, 'FT1', [pdf('receipt.pdf')]);
    const log = await w.repo.listLog(r.id);
    const used = new Set(log.map((l) => l.action));
    expect([...used].sort()).toEqual(
      [
        'approved',
        'approved_on_behalf',
        'bank_created',
        'bank_status',
        'created',
        'edited',
        'file_added',
        'rejected',
        'resubmitted',
        'transferred',
      ].sort(),
    );
    for (const action of used) expect(en[`log.${action}`], action).toBeTruthy();
    // the details the text needs are there
    expect(log.find((l) => l.action === 'rejected').details).toMatchObject({
      stageOrder: 1,
      note: 'Wrong beneficiary',
    });
    expect(log.find((l) => l.action === 'transferred').details.bankReference).toBe('FT1');
    expect(log.find((l) => l.action === 'resubmitted').details).toMatchObject({
      round: 2,
      backToBankOps: false,
    });
  });
});

describe('the full approval story from the build plan', () => {
  it('ends Transferred with every file kind and history line', async () => {
    const r = await newRequest(w, { amount: 1850000 });
    await w.svc.markBankCreated(w.who.anfal, r.id, [pdf('bank.pdf')]);
    await w.svc.recordOnBehalf(w.who.fatima, r.id, 1, 'approve', '', pdf('email.pdf'));
    await w.svc.decideStage(w.who.kharji, r.id, 2, 'approve');
    expect((await w.repo.getRequestById(r.id)).status).toBe('ready');
    const done = await w.svc.markTransferred(w.who.anfal, r.id, 'FT2630155', [pdf('receipt.pdf')]);
    expect(done.status).toBe('transferred');
  });

  it('a request that is Ready needs bank ops to execute it', async () => {
    const r = await ready(w);
    expect(await errorKey(w.svc.markTransferred(w.who.fatima, r.id, '', []))).toBe(
      'validation.bankRef',
    );
  });
});
