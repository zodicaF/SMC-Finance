import { describe, it, expect } from 'vitest';
import { round2, toSar } from '../public/assets/js/domain/money.js';
import { riyadhYmd, workingDaysBetween } from '../public/assets/js/domain/time.js';
import { nextStatus, statusAfterApprovals } from '../public/assets/js/domain/status.js';
import {
  buildApprovalRows,
  isStalled,
  paymentDetails,
  paymentDetailsChanged,
} from '../public/assets/js/domain/rules.js';
import {
  isValidAccountOrIban,
  accountOrIbanProblem,
  isValidReason,
  isValidSwift,
  normalizeIban,
  normalizeInput,
  validateRequestInput,
  validateFile,
} from '../public/assets/js/domain/validation.js';

const rates = { SAR: 1, USD: 3.75, EUR: 4.35 };

describe('money', () => {
  it('rounds to 2 decimals', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(10.004)).toBe(10);
  });
  it('converts to SAR', () => {
    expect(toSar(400000, 3.75)).toBe(1500000);
    expect(toSar(100.33, 3.75)).toBe(376.24);
  });
});

describe('time', () => {
  it('uses the Riyadh day for references', () => {
    expect(riyadhYmd('2026-10-24T20:59:00Z')).toBe('20261024');
    expect(riyadhYmd('2026-10-24T21:00:00Z')).toBe('20261025'); // midnight in Riyadh
  });
  it('counts only Sunday to Thursday', () => {
    // Sun 18 Oct to Sun 25 Oct 2026: Mon..Thu (4) + Sun (1) = 5 working days
    expect(workingDaysBetween('2026-10-18T06:00:00Z', '2026-10-25T06:00:00Z')).toBe(5);
    // Thursday evening to Sunday morning: only Sunday counts
    expect(workingDaysBetween('2026-10-22T15:00:00Z', '2026-10-25T06:00:00Z')).toBe(1);
    expect(workingDaysBetween('2026-10-18T06:00:00Z', '2026-10-18T09:00:00Z')).toBe(0);
  });
});

describe('approval rows (SPEC 4.1)', () => {
  it('builds the senior stage assigned to the chosen approver, then the open manager stage', () => {
    let n = 0;
    const rows = buildApprovalRows({
      requestId: 'r',
      round: 2,
      newId: () => `a${++n}`,
      seniorApproverId: 'u-senior',
    });
    expect(rows.map((r) => [r.stageOrder, r.status, r.round, r.assignedToId])).toEqual([
      [1, 'pending', 2, 'u-senior'],
      [2, 'pending', 2, null],
    ]);
  });
});

describe('status transitions (SPEC 3)', () => {
  const st = (...s) => s.map((status) => ({ status }));
  it('derives the status from the approvals', () => {
    expect(statusAfterApprovals(st('pending', 'pending'))).toBe('bank_created');
    expect(statusAfterApprovals(st('approved', 'pending'))).toBe('approving');
    expect(statusAfterApprovals(st('approved', 'approved'))).toBe('ready');
    expect(statusAfterApprovals(st('approved', 'rejected'))).toBe('returned');
  });
  it('allows only valid moves', () => {
    expect(nextStatus('submitted', 'bankCreated')).toBe('bank_created');
    expect(nextStatus('approving', 'bankCreated')).toBeNull();
    expect(nextStatus('ready', 'transfer')).toBe('transferred');
    expect(nextStatus('approving', 'transfer')).toBeNull();
    expect(nextStatus('returned', 'resubmit', { detailsChanged: true })).toBe('submitted');
    expect(nextStatus('returned', 'resubmit', { detailsChanged: false })).toBe('bank_created');
    expect(nextStatus('ready', 'resubmit')).toBeNull();
    for (const from of ['submitted', 'bank_created', 'approving', 'ready', 'returned']) {
      expect(nextStatus(from, 'cancel')).toBe('cancelled');
    }
    expect(nextStatus('transferred', 'cancel')).toBeNull();
    expect(nextStatus('cancelled', 'cancel')).toBeNull();
  });
});

describe('payment details and stalled', () => {
  const request = {
    beneficiary: ' Najd ',
    bank: 'SNB',
    iban: 'sa03 8000',
    swiftCode: '',
    amount: 100,
    currency: 'SAR',
    bankedDetails: {
      beneficiary: 'Najd',
      bank: 'SNB',
      iban: 'SA038000',
      swiftCode: '',
      amount: 100,
      currency: 'SAR',
    },
    status: 'approving',
    statusChangedAt: '2026-10-18T06:00:00Z',
  };
  it('normalises before comparing', () => {
    expect(paymentDetails(request).iban).toBe('SA038000');
    expect(paymentDetailsChanged(request)).toBe(false);
    expect(paymentDetailsChanged({ ...request, iban: 'SA038001' })).toBe(true);
    expect(paymentDetailsChanged({ ...request, amount: 101 })).toBe(true);
    expect(paymentDetailsChanged({ ...request, bankedDetails: null })).toBe(true);
    expect(paymentDetailsChanged({ ...request, swiftCode: 'ncbksaje' })).toBe(true);
  });
  it('counts a different paying account as a change, but not on details saved before that', () => {
    const banked = { ...request.bankedDetails, fromAccountId: 'A1' };
    const r = { ...request, fromAccountId: 'A1', bankedDetails: banked };
    expect(paymentDetailsChanged(r)).toBe(false);
    expect(paymentDetailsChanged({ ...r, fromAccountId: 'B2' })).toBe(true);
    const older = { ...banked };
    delete older.fromAccountId;
    delete older.swiftCode;
    expect(paymentDetailsChanged({ ...r, fromAccountId: 'B2', bankedDetails: older })).toBe(false);
  });
  it('is stalled after more than the allowed working days, never when final', () => {
    expect(isStalled(request, '2026-10-22T06:00:00Z', 3)).toBe(true); // Mon Tue Wed Thu = 4
    expect(isStalled(request, '2026-10-21T06:00:00Z', 3)).toBe(false); // 3
    expect(isStalled({ ...request, status: 'transferred' }, '2026-12-01T00:00:00Z', 3)).toBe(false);
  });
});

describe('validation (SPEC 7)', () => {
  const seniorApproverIds = ['u-senior'];
  const vctx = { rates, seniorApproverIds };
  const ok = {
    requesterName: 'Najd Requester',
    seniorApproverId: 'u-senior',
    beneficiary: 'Najd',
    iban: 'SA0380000000608010167519',
    category: 'vat',
    movement: 'internal',
    fromAccountId: '011-713724-080', // SAB Bank, USD
    amount: 10.5,
  };
  it('accepts a valid request', () => {
    expect(validateRequestInput(ok, vctx)).toEqual({});
  });
  it('reports each wrong field', () => {
    const e = validateRequestInput(
      {
        beneficiary: 'N',
        category: 'x',
        movement: 'y',
        currency: 'JPY',
        amount: 0,
        iban: 'SA12',
        purpose: 'x'.repeat(501),
      },
      vctx,
    );
    expect(Object.keys(e).sort()).toEqual([
      'amount',
      'beneficiary',
      'category',
      'currency',
      'fromAccountId',
      'iban',
      'movement',
      'purpose',
      'requesterName',
      'seniorApproverId',
    ]);
  });
  it('rejects more than 2 decimals', () => {
    expect(validateRequestInput({ ...ok, amount: 10.123 }, vctx).amount).toBe('validation.amount');
  });
  it("requires an account number or IBAN, and verifies an IBAN's check digits", () => {
    expect(isValidAccountOrIban('')).toBe(false); // now required, not optional
    expect(isValidAccountOrIban('123')).toBe(false); // far too short to be real
    expect(isValidAccountOrIban('SA03 8000 0000 6080 1016 7519')).toBe(true); // real check digits
    expect(isValidAccountOrIban('SA0380000000608010167')).toBe(false); // wrong length
    // right length and country code, but the check digits don't work out: not a real IBAN
    expect(isValidAccountOrIban('SA0000000000000000000000')).toBe(false);
    expect(isValidAccountOrIban('GB82WEST12345698765432')).toBe(true); // a real foreign IBAN
    expect(isValidAccountOrIban('608010167519')).toBe(true); // a plain account number
    expect(isValidAccountOrIban('6080101')).toBe(false); // too short for an account number
    expect(isValidAccountOrIban('ABCDEFGH')).toBe(false); // letters, not digits
  });
  it('accepts an IBAN typed with Arabic digits, dashes or copied with hidden direction marks', () => {
    expect(isValidAccountOrIban('SA٠٣٨٠٠٠٠٠٠٠٦٠٨٠١٠١٦٧٥١٩')).toBe(true);
    expect(isValidAccountOrIban('SA۰۳۸۰۰۰۰۰۰۰۶۰۸۰۱۰۱۶۷۵۱۹')).toBe(true);
    expect(isValidAccountOrIban('‎SA03-8000-0000-6080-1016-7519‏')).toBe(true);
    expect(isValidAccountOrIban('sa03 8000 0000 6080 1016 7519')).toBe(true);
  });
  it('tells a wrong shape apart from a mistyped digit', () => {
    expect(accountOrIbanProblem('SA0380000000608010167519')).toBeNull();
    expect(accountOrIbanProblem('SA1234567890123456789012')).toBe('validation.ibanCheck');
    expect(accountOrIbanProblem('SA12345')).toBe('validation.iban');
    expect(accountOrIbanProblem('')).toBe('validation.iban');
    expect(normalizeIban(' sa03 8000 ')).toBe('SA038000');
  });
  it('requires a valid SWIFT/BIC code only for external transfers', () => {
    expect(isValidSwift('')).toBe(false);
    expect(isValidSwift('NCBKSAJE')).toBe(true); // 8 characters
    expect(isValidSwift('NCBKSAJEXXX')).toBe(true); // 11 characters, with branch code
    expect(isValidSwift('ncbk sa je')).toBe(true); // case/spaces are normalised
    expect(isValidSwift('NCBKSA')).toBe(false); // too short
    expect(isValidSwift('1234SAJE')).toBe(false); // bank code must be letters
    expect(validateRequestInput({ ...ok, movement: 'external' }, vctx).swiftCode).toBe(
      'validation.swift',
    );
    expect(
      validateRequestInput({ ...ok, movement: 'external', swiftCode: 'NCBKSAJE' }, vctx),
    ).toEqual({});
    // not required, and ignored, for an internal transfer
    expect(validateRequestInput(ok, vctx)).toEqual({});
    // and never stored for an internal transfer, even if typed before switching
    expect(normalizeInput({ ...ok, swiftCode: 'ncbksaje' }).swiftCode).toBe('');
    expect(normalizeInput({ ...ok, movement: 'external', swiftCode: 'ncbk saje' }).swiftCode).toBe(
      'NCBKSAJE',
    );
  });

  it('needs a reason of 5 or more characters', () => {
    expect(isValidReason('')).toBe(false);
    expect(isValidReason('  no  ')).toBe(false);
    expect(isValidReason('Wrong IBAN')).toBe(true);
  });
  it('checks file type and size', () => {
    expect(validateFile({ name: 'a.pdf', mime: 'application/pdf', size: 10 }, 5)).toBeNull();
    expect(validateFile({ name: 'a.exe', mime: 'application/pdf', size: 10 }, 5)).toBe(
      'validation.fileType',
    );
    expect(validateFile({ name: 'a.pdf', mime: 'text/html', size: 10 }, 5)).toBe(
      'validation.fileType',
    );
    expect(validateFile({ name: 'a.png', mime: 'image/png', size: 5 * 1024 * 1024 + 1 }, 5)).toBe(
      'validation.fileSize',
    );
  });
});
