import { describe, it, expect } from 'vitest';
import { createMemoryRepository } from '../public/assets/js/data/memoryRepository.js';
import { loadReferenceData, loadSampleRequests } from '../public/assets/js/data/seed.js';

describe('sample data', () => {
  it('loads twelve requests that cover every status, all flagged as samples', async () => {
    const repo = createMemoryRepository();
    const now = '2026-10-25T08:00:00.000Z';
    await loadReferenceData(repo, now);
    await loadSampleRequests(repo, { now });
    const requests = await repo.listRequests();
    expect(requests).toHaveLength(12);
    expect(requests.every((r) => r.isSample)).toBe(true);
    const statuses = new Set(requests.map((r) => r.status));
    expect([...statuses].sort()).toEqual([
      'bank_created',
      'cancelled',
      'ready',
      'returned',
      'submitted',
      'transferred',
    ]);
    // references are unique and well formed
    const refs = requests.map((r) => r.ref);
    expect(new Set(refs).size).toBe(12);
    expect(refs.every((r) => /^TRF-\d{8}-\d{4}$/.test(r))).toBe(true);
  });

  it('includes the cases the wireframes show', async () => {
    const repo = createMemoryRepository();
    const now = '2026-10-25T08:00:00.000Z';
    await loadReferenceData(repo, now);
    await loadSampleRequests(repo, { now });
    const byName = Object.fromEntries((await repo.listRequests()).map((r) => [r.beneficiary, r]));
    const fitout = byName['Riyadh Fit-Out LLC'];
    const rows = await repo.listApprovals(fitout.id);
    expect(rows.map((r) => [r.stageOrder, r.status, r.onBehalf])).toEqual([
      [1, 'approved', true],
      [2, 'approved', false],
    ]);
    expect(byName['Najd Logistics'].amountSar).toBe(1500000);
    expect(byName['Gulf Office Supplies'].closedReason).toBe(
      'IBAN does not match the vendor letter',
    );
    expect((await repo.getBankStatus(byName['ZATCA - VAT Q3'].id)).state).toBe('review');
    expect(byName['Employee - M. Hassan'].transferRef).toBe('FT2629881');
  });
});
