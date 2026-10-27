import { describe, it, expect } from 'vitest';
import { workflowSteps } from '../public/assets/js/domain/workflow.js';

const request = (over = {}) => ({
  status: 'submitted',
  createdById: 'u-req',
  createdAt: '2026-10-20T06:00:00Z',
  seniorApproverId: 'u-senior',
  bankCreatedById: null,
  bankCreatedAt: null,
  transferredById: null,
  transferredAt: null,
  transferRef: null,
  ...over,
});
const row = (stageOrder, over = {}) => ({
  stageOrder,
  status: 'pending',
  decidedById: null,
  decidedAt: null,
  onBehalf: false,
  assignedToId: stageOrder === 1 ? 'u-senior' : null,
  ...over,
});
const inBank = { bankCreatedById: 'u-ops', bankCreatedAt: '2026-10-20T08:00:00Z' };
const approved = (by) => ({ status: 'approved', decidedById: by, decidedAt: '2026-10-21T08:00:00Z' });
const states = (input) => workflowSteps({ approvals: [], bankStatus: null, ...input }).steps.map((s) => s.state);

describe('request tracker steps', () => {
  it('a new request is waiting on bank operations', () => {
    const wf = workflowSteps({ request: request(), approvals: [], bankStatus: null });
    expect(wf.steps.map((s) => s.key)).toEqual(['submitted', 'bank', 'senior', 'manager', 'transfer', 'debit']);
    expect(wf.steps.map((s) => s.state)).toEqual(['done', 'current', 'waiting', 'waiting', 'waiting', 'waiting']);
    expect(wf.steps[0]).toMatchObject({ actorId: 'u-req', at: '2026-10-20T06:00:00Z' });
    expect(wf).toMatchObject({ done: 1, total: 6, finished: false });
  });

  it('after the bank entry it waits on the chosen senior approver, then on any manager', () => {
    const r = request({ status: 'bank_created', ...inBank });
    const first = workflowSteps({ request: r, approvals: [row(1), row(2)], bankStatus: null });
    expect(first.steps.map((s) => s.state)).toEqual(['done', 'done', 'current', 'waiting', 'waiting', 'waiting']);
    expect(first.steps[1]).toMatchObject({ actorId: 'u-ops' });
    expect(first.steps[2]).toMatchObject({ assignedToId: 'u-senior' });

    const second = workflowSteps({
      request: { ...r, status: 'approving' },
      approvals: [row(1, approved('u-senior')), row(2)],
      bankStatus: null,
    });
    expect(second.steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'current', 'waiting', 'waiting']);
    expect(second.steps[2]).toMatchObject({ actorId: 'u-senior', onBehalf: false });
  });

  it('shows an approval recorded on behalf', () => {
    const r = request({ status: 'approving', ...inBank });
    const wf = workflowSteps({
      request: r,
      approvals: [row(1, { ...approved('u-ops'), onBehalf: true }), row(2)],
      bankStatus: null,
    });
    expect(wf.steps[2]).toMatchObject({ state: 'done', actorId: 'u-ops', onBehalf: true });
  });

  it('ready: bank operations must execute the transfer', () => {
    const r = request({ status: 'ready', ...inBank });
    expect(
      states({
        request: r,
        approvals: [row(1, approved('u-senior')), row(2, approved('u-mgr'))],
        bankStatus: { state: 'executing' },
      }),
    ).toEqual(['done', 'done', 'done', 'done', 'current', 'waiting']);
  });

  it('transferred: waits for the bank, flags a bank review, finishes once debited', () => {
    const r = request({
      status: 'transferred',
      ...inBank,
      transferredById: 'u-ops',
      transferredAt: '2026-10-22T08:00:00Z',
      transferRef: 'BNK-1',
    });
    const approvals = [row(1, approved('u-senior')), row(2, approved('u-mgr'))];
    const at = (state) =>
      workflowSteps({ request: r, approvals, bankStatus: { state, updatedById: 'u-ops', updatedAt: '2026-10-23T08:00:00Z' } });
    expect(at('executing').steps.map((s) => s.state).slice(4)).toEqual(['done', 'current']);
    expect(at('executing').steps[4]).toMatchObject({ reference: 'BNK-1', actorId: 'u-ops' });
    expect(at('review').steps[5].state).toBe('attention');
    expect(at('debited')).toMatchObject({ done: 6, finished: true });
  });

  it('a bank review before the transfer does not skip the transfer step', () => {
    const r = request({ status: 'ready', ...inBank });
    expect(
      states({
        request: r,
        approvals: [row(1, approved('u-senior')), row(2, approved('u-mgr'))],
        bankStatus: { state: 'review' },
      }).slice(4),
    ).toEqual(['current', 'waiting']);
  });

  it('returned: the rejected stage is marked and nothing is "now"', () => {
    const r = request({ status: 'returned', ...inBank });
    expect(
      states({
        request: r,
        approvals: [row(1, approved('u-senior')), row(2, { status: 'rejected', decidedById: 'u-mgr' })],
      }),
    ).toEqual(['done', 'done', 'done', 'rejected', 'waiting', 'waiting']);
  });

  it('cancelled: stops where it was', () => {
    expect(states({ request: request({ status: 'cancelled' }) })).toEqual([
      'done',
      'stopped',
      'waiting',
      'waiting',
      'waiting',
      'waiting',
    ]);
  });
});
