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
const seniorApprover = user('senior', ['senior_approver']);
const otherSeniorApprover = user('senior2', ['senior_approver']);
const managerApprover = user('manager', ['manager_approver']);
const otherManagerApprover = user('manager2', ['manager_approver']);
const admin = user('adm', ['admin']);
const everyone = { creator, bankOps, seniorApprover, managerApprover, admin };

const req = (status, over = {}) => ({
  id: 'r',
  createdById: 'creator',
  seniorApproverId: 'senior',
  round: 1,
  status,
  bankCreatedAt: null,
  ...over,
});
/** Stage 1 is assigned to a specific senior approver; stage 2 (manager) is open to the role. */
const seniorStage = (over = {}) => ({
  id: 's1',
  stageOrder: 1,
  status: 'pending',
  assignedToId: 'senior',
  ...over,
});
const managerStage = (over = {}) => ({
  id: 's2',
  stageOrder: 2,
  status: 'pending',
  assignedToId: null,
  ...over,
});

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
  it('view: creators see their own, senior approvers what is assigned to them, others all', () => {
    matrix('view', req('submitted'), {
      creator: true,
      bankOps: true,
      seniorApprover: true,
      managerApprover: true,
      admin: true,
    });
    expect(canDo('view', otherCreator, req('submitted'))).toBe(false);
    expect(denyReason('view', otherCreator, req('submitted'))).toBe('errors.notFound');
    expect(canDo('view', otherSeniorApprover, req('approving'))).toBe(false);
    expect(denyReason('view', otherSeniorApprover, req('approving'))).toBe('errors.notFound');
    expect(canDo('view', otherManagerApprover, req('approving'))).toBe(true);
  });

  it('view: someone holding several roles sees what any of them allows', () => {
    const seniorAndCreator = user('senior2', ['senior_approver', 'creator']);
    expect(canDo('view', seniorAndCreator, req('submitted', { createdById: 'senior2' }))).toBe(true);
    expect(canDo('view', seniorAndCreator, req('submitted'))).toBe(false);
    const seniorAndOps = user('senior2', ['senior_approver', 'bank_ops']);
    expect(canDo('view', seniorAndOps, req('submitted'))).toBe(true);
  });

  it('create: not for approvers', () => {
    matrix('create', undefined, {
      creator: true,
      bankOps: true,
      seniorApprover: false,
      managerApprover: false,
      admin: true,
    });
  });

  it('edit: own creator or admin, only when submitted or returned', () => {
    for (const status of ['submitted', 'returned']) {
      matrix('edit', req(status), {
        creator: true,
        bankOps: false,
        seniorApprover: false,
        managerApprover: false,
        admin: true,
      });
    }
    for (const status of ['bank_created', 'approving', 'ready', 'transferred', 'cancelled']) {
      matrix('edit', req(status), {
        creator: false,
        bankOps: false,
        seniorApprover: false,
        managerApprover: false,
        admin: false,
      });
    }
    expect(canDo('edit', otherCreator, req('submitted'))).toBe(false);
  });

  it('mark created in bank: bank ops only, only when submitted', () => {
    matrix('markBankCreated', req('submitted'), {
      creator: false,
      bankOps: true,
      seniorApprover: false,
      managerApprover: false,
      admin: false,
    });
    matrix('markBankCreated', req('bank_created'), {
      creator: false,
      bankOps: false,
      seniorApprover: false,
      managerApprover: false,
      admin: false,
    });
  });

  it('decide stage 1 (senior): only the assigned senior approver, not on their own request', () => {
    const request = req('bank_created');
    const s1 = seniorStage();
    matrix(
      'decide',
      request,
      { creator: false, bankOps: false, seniorApprover: true, managerApprover: false, admin: false },
      { stage: s1, approvals: [s1, managerStage()] },
    );
    // A different senior approver, not the one assigned, may not decide it.
    expect(canDo('decide', otherSeniorApprover, request, { stage: s1, approvals: [s1] })).toBe(
      false,
    );
    expect(
      denyReason('decide', seniorApprover, req('bank_created', { createdById: 'senior' }), {
        stage: s1,
        approvals: [s1],
      }),
    ).toBe('errors.ownRequest');
    expect(
      denyReason('decide', seniorApprover, req('submitted'), { stage: s1, approvals: [s1] }),
    ).toBe('errors.wrongStatus');
    expect(
      denyReason('decide', seniorApprover, request, {
        stage: seniorStage({ status: 'approved' }),
        approvals: [],
      }),
    ).toBe('errors.stageDecided');
  });

  it('decide stage 2 (manager): any manager approver, only after stage 1 is approved', () => {
    const request = req('approving');
    const s1 = seniorStage({ status: 'approved' });
    const s2 = managerStage();
    matrix(
      'decide',
      request,
      { creator: false, bankOps: false, seniorApprover: false, managerApprover: true, admin: false },
      { stage: s2, approvals: [s1, s2] },
    );
    // Any manager approver may decide it, not just one in particular.
    expect(canDo('decide', otherManagerApprover, request, { stage: s2, approvals: [s1, s2] })).toBe(
      true,
    );
    // Not yet - stage 1 is still pending.
    expect(
      denyReason('decide', managerApprover, request, {
        stage: s2,
        approvals: [seniorStage(), s2],
      }),
    ).toBe('errors.stageLocked');
  });

  it('two different people give the two approvals', () => {
    const both = user('senior', ['senior_approver', 'manager_approver']);
    const s1 = seniorStage({ status: 'approved', decidedById: 'senior' });
    const s2 = managerStage();
    expect(denyReason('decide', both, req('approving'), { stage: s2, approvals: [s1, s2] })).toBe(
      'errors.sameApprover',
    );
    // still refused when bank ops recorded stage 1 for them: they were the assigned approver
    const s1behalf = seniorStage({ status: 'approved', decidedById: 'ops', onBehalf: true });
    expect(
      denyReason('decide', both, req('approving'), { stage: s2, approvals: [s1behalf, s2] }),
    ).toBe('errors.sameApprover');
    expect(
      canDo('decide', managerApprover, req('approving'), { stage: s2, approvals: [s1, s2] }),
    ).toBe(true);
  });

  it('stage 1 needs the assigned person to still hold the senior approver role', () => {
    const exSenior = user('senior', ['creator']);
    const s1 = seniorStage();
    expect(denyReason('decide', exSenior, req('bank_created'), { stage: s1, approvals: [s1] })).toBe(
      'errors.notYourStage',
    );
  });

  it('one capacity per request: bank ops work and approving never mix', () => {
    const opsManager = user('opsm', ['bank_ops', 'manager_approver']);
    const s1 = seniorStage({ status: 'approved', decidedById: 'senior' });
    const s2 = managerStage();
    const ctx = { stage: s2, approvals: [s1, s2] };
    expect(denyReason('decide', opsManager, req('approving', { bankCreatedById: 'opsm' }), ctx)).toBe(
      'errors.oneCapacity',
    );
    const recorded = seniorStage({ status: 'approved', decidedById: 'opsm', onBehalf: true });
    expect(
      denyReason('decide', opsManager, req('approving'), { stage: s2, approvals: [recorded, s2] }),
    ).toBe('errors.oneCapacity');
    expect(canDo('decide', opsManager, req('approving', { bankCreatedById: 'ops' }), ctx)).toBe(
      true,
    );
    // the assigned senior approver who also works in bank ops can't record their own stage
    const opsSenior = user('senior', ['bank_ops', 'senior_approver']);
    const pending = seniorStage();
    expect(
      denyReason('recordOnBehalf', opsSenior, req('bank_created'), {
        stage: pending,
        approvals: [pending],
      }),
    ).toBe('errors.oneCapacity');
  });

  it('record on behalf: never for the manager approval, even once the senior has approved', () => {
    const s1 = { ...seniorStage(), status: 'approved' };
    const s2 = managerStage();
    expect(
      denyReason('recordOnBehalf', bankOps, req('approving'), { stage: s2, approvals: [s1, s2] }),
    ).toBe('errors.managerInPerson');
  });

  it('record on behalf: bank ops, never own request, senior stage only', () => {
    const s1 = seniorStage();
    matrix(
      'recordOnBehalf',
      req('approving'),
      { creator: false, bankOps: true, seniorApprover: false, managerApprover: false, admin: false },
      { stage: s1, approvals: [s1] },
    );
    expect(
      denyReason('recordOnBehalf', bankOps, req('approving', { createdById: 'ops' }), {
        stage: s1,
        approvals: [s1],
      }),
    ).toBe('errors.ownRequest');
    const s2 = managerStage();
    expect(
      denyReason('recordOnBehalf', bankOps, req('approving'), {
        stage: s2,
        approvals: [seniorStage(), s2],
      }),
    ).toBe('errors.managerInPerson');
  });

  it('resubmit: own creator or admin, only when returned', () => {
    matrix('resubmit', req('returned'), {
      creator: true,
      bankOps: false,
      seniorApprover: false,
      managerApprover: false,
      admin: true,
    });
    matrix('resubmit', req('approving'), {
      creator: false,
      bankOps: false,
      seniorApprover: false,
      managerApprover: false,
      admin: false,
    });
  });

  it('mark transferred: bank ops only, only when ready', () => {
    matrix('markTransferred', req('ready'), {
      creator: false,
      bankOps: true,
      seniorApprover: false,
      managerApprover: false,
      admin: false,
    });
    matrix('markTransferred', req('approving'), {
      creator: false,
      bankOps: false,
      seniorApprover: false,
      managerApprover: false,
      admin: false,
    });
  });

  it('bank status: bank ops only, when ready or transferred', () => {
    for (const status of ['ready', 'transferred']) {
      matrix('setBankStatus', req(status), {
        creator: false,
        bankOps: true,
        seniorApprover: false,
        managerApprover: false,
        admin: false,
      });
    }
    matrix('setBankStatus', req('approving'), {
      creator: false,
      bankOps: false,
      seniorApprover: false,
      managerApprover: false,
      admin: false,
    });
  });

  it('cancel: creator before bank entry, admin until transferred, never after', () => {
    for (const status of ['submitted', 'returned']) {
      matrix('cancel', req(status), {
        creator: true,
        bankOps: false,
        seniorApprover: false,
        managerApprover: false,
        admin: true,
      });
    }
    for (const status of ['bank_created', 'approving', 'ready']) {
      matrix('cancel', req(status), {
        creator: false,
        bankOps: false,
        seniorApprover: false,
        managerApprover: false,
        admin: true,
      });
    }
    for (const status of ['transferred', 'cancelled']) {
      matrix('cancel', req(status), {
        creator: false,
        bankOps: false,
        seniorApprover: false,
        managerApprover: false,
        admin: false,
      });
    }
  });

  it('delete: never after a resubmit, even though the bank entry was cleared', () => {
    expect(denyReason('delete', admin, req('submitted', { round: 2 }))).toBe('errors.wrongStatus');
  });

  it('delete: admin only, only submitted with no bank entry', () => {
    matrix('delete', req('submitted'), {
      creator: false,
      bankOps: false,
      seniorApprover: false,
      managerApprover: false,
      admin: true,
    });
    matrix('delete', req('submitted', { bankCreatedAt: '2026-10-18T00:00:00Z' }), {
      creator: false,
      bankOps: false,
      seniorApprover: false,
      managerApprover: false,
      admin: false,
    });
    matrix('delete', req('bank_created'), {
      creator: false,
      bankOps: false,
      seniorApprover: false,
      managerApprover: false,
      admin: false,
    });
  });

  it('admin area: admin only', () => {
    matrix('admin', undefined, {
      creator: false,
      bankOps: false,
      seniorApprover: false,
      managerApprover: false,
      admin: true,
    });
  });

  it('inactive and missing users can do nothing', () => {
    expect(canDo('view', user('x', ['admin'], false), req('submitted'))).toBe(false);
    expect(denyReason('create', user('x', ['admin'], false))).toBe('errors.inactive');
    expect(canDo('view', null, req('submitted'))).toBe(false);
  });
});
