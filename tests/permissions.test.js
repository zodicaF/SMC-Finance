// Every cell of the permission matrix in docs/SPEC.md section 2.
import { describe, it, expect } from 'vitest';
import { canDo, denyReason } from '../public/assets/js/domain/permissions.js';

const user = (id, roles, active = true) => ({
  id,
  email: `${id}@x.test`,
  nameEn: id,
  nameAr: id,
  roles,
  active,
});
const creator = user('creator', ['creator']);
const otherCreator = user('creator2', ['creator']);
const bankOps = user('ops', ['bank_ops']);
const approver = user('appr', ['approver']);
const otherApprover = user('appr2', ['approver']);
const admin = user('adm', ['admin']);
const everyone = { creator, bankOps, approver, admin };

const req = (status, over = {}) => ({
  id: 'r',
  createdById: 'creator',
  status,
  bankCreatedAt: null,
  ...over,
});
const stage = (over = {}) => ({ id: 's1', status: 'pending', ...over });

/** @param {Record<string, boolean>} expected role -> allowed */
function matrix(action, request, expected, ctx) {
  for (const [role, allowed] of Object.entries(expected)) {
    expect(
      canDo(action, everyone[role], request, ctx),
      `${action} as ${role} on ${request?.status}`,
    ).toBe(allowed);
  }
}

describe('permission matrix', () => {
  it('view: creators see only their own, everyone else sees all', () => {
    matrix('view', req('submitted'), { creator: true, bankOps: true, approver: true, admin: true });
    expect(canDo('view', otherCreator, req('submitted'))).toBe(false);
    expect(denyReason('view', otherCreator, req('submitted'))).toBe('errors.notFound');
  });

  it('create: not for approvers', () => {
    matrix('create', undefined, { creator: true, bankOps: true, approver: false, admin: true });
  });

  it('edit: own creator or admin, only when submitted or returned', () => {
    for (const status of ['submitted', 'returned']) {
      matrix('edit', req(status), { creator: true, bankOps: false, approver: false, admin: true });
    }
    for (const status of ['bank_created', 'approving', 'ready', 'transferred', 'cancelled']) {
      matrix('edit', req(status), {
        creator: false,
        bankOps: false,
        approver: false,
        admin: false,
      });
    }
    expect(canDo('edit', otherCreator, req('submitted'))).toBe(false);
  });

  it('mark created in bank: bank ops only, only when submitted', () => {
    matrix('markBankCreated', req('submitted'), {
      creator: false,
      bankOps: true,
      approver: false,
      admin: false,
    });
    matrix('markBankCreated', req('bank_created'), {
      creator: false,
      bankOps: false,
      approver: false,
      admin: false,
    });
  });

  it('decide: any approver, not on their own request', () => {
    const request = req('bank_created');
    const s = stage();
    matrix(
      'decide',
      request,
      { creator: false, bankOps: false, approver: true, admin: false },
      { stage: s, approvals: [s] },
    );
    // Any approver may decide, not just one in particular.
    expect(canDo('decide', otherApprover, request, { stage: s, approvals: [s] })).toBe(true);
    expect(
      denyReason('decide', approver, req('bank_created', { createdById: 'appr' }), {
        stage: s,
        approvals: [s],
      }),
    ).toBe('errors.ownRequest');
    expect(denyReason('decide', approver, req('submitted'), { stage: s, approvals: [s] })).toBe(
      'errors.wrongStatus',
    );
    expect(
      denyReason('decide', approver, request, {
        stage: stage({ status: 'approved' }),
        approvals: [],
      }),
    ).toBe('errors.stageDecided');
  });

  it('record on behalf: bank ops, never own request', () => {
    const s = stage();
    matrix(
      'recordOnBehalf',
      req('approving'),
      { creator: false, bankOps: true, approver: false, admin: false },
      { stage: s },
    );
    expect(
      denyReason('recordOnBehalf', bankOps, req('approving', { createdById: 'ops' }), { stage: s }),
    ).toBe('errors.ownRequest');
  });

  it('resubmit: own creator or admin, only when returned', () => {
    matrix('resubmit', req('returned'), {
      creator: true,
      bankOps: false,
      approver: false,
      admin: true,
    });
    matrix('resubmit', req('approving'), {
      creator: false,
      bankOps: false,
      approver: false,
      admin: false,
    });
  });

  it('mark transferred: bank ops only, only when ready', () => {
    matrix('markTransferred', req('ready'), {
      creator: false,
      bankOps: true,
      approver: false,
      admin: false,
    });
    matrix('markTransferred', req('approving'), {
      creator: false,
      bankOps: false,
      approver: false,
      admin: false,
    });
  });

  it('bank status: bank ops only, when ready or transferred', () => {
    for (const status of ['ready', 'transferred']) {
      matrix('setBankStatus', req(status), {
        creator: false,
        bankOps: true,
        approver: false,
        admin: false,
      });
    }
    matrix('setBankStatus', req('approving'), {
      creator: false,
      bankOps: false,
      approver: false,
      admin: false,
    });
  });

  it('cancel: creator before bank entry, admin until transferred, never after', () => {
    for (const status of ['submitted', 'returned']) {
      matrix('cancel', req(status), {
        creator: true,
        bankOps: false,
        approver: false,
        admin: true,
      });
    }
    for (const status of ['bank_created', 'approving', 'ready']) {
      matrix('cancel', req(status), {
        creator: false,
        bankOps: false,
        approver: false,
        admin: true,
      });
    }
    for (const status of ['transferred', 'cancelled']) {
      matrix('cancel', req(status), {
        creator: false,
        bankOps: false,
        approver: false,
        admin: false,
      });
    }
  });

  it('delete: admin only, only submitted with no bank entry', () => {
    matrix('delete', req('submitted'), {
      creator: false,
      bankOps: false,
      approver: false,
      admin: true,
    });
    matrix('delete', req('submitted', { bankCreatedAt: '2026-10-18T00:00:00Z' }), {
      creator: false,
      bankOps: false,
      approver: false,
      admin: false,
    });
    matrix('delete', req('bank_created'), {
      creator: false,
      bankOps: false,
      approver: false,
      admin: false,
    });
  });

  it('admin area: admin only', () => {
    matrix('admin', undefined, { creator: false, bankOps: false, approver: false, admin: true });
  });

  it('inactive and missing users can do nothing', () => {
    expect(canDo('view', user('x', ['admin'], false), req('submitted'))).toBe(false);
    expect(denyReason('create', user('x', ['admin'], false))).toBe('errors.inactive');
    expect(canDo('view', null, req('submitted'))).toBe(false);
  });
});
