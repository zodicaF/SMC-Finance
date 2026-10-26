// Phase 5: the Excel writer, the export data, and the admin rules.
import { describe, it, expect, beforeEach } from 'vitest';
import { makeWorld, newRequest, inBank, ready, errorKey, baseInput, pdf } from './helpers.js';
import {
  buildXlsx,
  columnName,
  crc32,
  excelDate,
  safeSheetName,
  xmlText,
} from '../public/assets/js/domain/xlsx.js';
import { exportRows } from '../public/assets/js/views/exportExcel.js';
import { setLang } from '../public/assets/js/i18n/index.js';
import { loadSampleRequests } from '../public/assets/js/data/seed.js';

/** Reads a stored zip back: name -> text, checking every checksum on the way. */
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = {};
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const dataAt = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(dataAt, dataAt + size);
    expect(crc32(data)).toBe(crc);
    out[name] = new TextDecoder().decode(data);
    at += 46 + nameLen;
  }
  return out;
}

describe('xlsx writer', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('names columns like a spreadsheet', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });

  it('turns an ISO time into an Excel date showing Riyadh time', () => {
    // 2026-01-01 00:00 UTC is 03:00 in Riyadh: serial 46023 + 3/24
    expect(excelDate('2026-01-01T00:00:00Z')).toBeCloseTo(46023.125, 6);
    expect(excelDate('not a date')).toBeNull();
  });

  it('escapes XML and drops characters Excel rejects', () => {
    expect(xmlText('a & <b> "c"\u0001\u000B')).toBe('a &amp; &lt;b&gt; &quot;c&quot;');
  });

  it('makes a safe sheet name', () => {
    expect(safeSheetName('A/B:C?*[x]')).toBe('A B C   x');
    expect(safeSheetName('x'.repeat(40))).toHaveLength(31);
    expect(safeSheetName('   ')).toBe('Sheet1');
  });

  const columns = [
    { header: 'Ref', key: 'ref', type: 'text' },
    { header: 'Amount', key: 'amount', type: 'amount' },
    { header: 'Created', key: 'created', type: 'date' },
    { header: 'Rate', key: 'rate', type: 'rate' },
    { header: 'Round', key: 'round', type: 'int' },
  ];

  it('writes a valid package with typed cells', () => {
    const file = buildXlsx({
      sheetName: 'Transfers',
      columns,
      rows: [
        { ref: 'TRF-1', amount: 1234.5, created: '2026-01-01T00:00:00Z', rate: 3.75, round: 2 },
      ],
    });
    const parts = unzip(file);
    expect(Object.keys(parts).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    const sheet = parts['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain(
      '<c r="A2" t="inlineStr"><is><t xml:space="preserve">TRF-1</t></is></c>',
    );
    expect(sheet).toContain('<c r="B2" s="2"><v>1234.5</v></c>');
    expect(sheet).toContain('<c r="C2" s="3"><v>46023.125</v></c>');
    expect(sheet).toContain('<c r="D2" s="4"><v>3.75</v></c>');
    expect(sheet).toContain('<c r="E2" s="5"><v>2</v></c>');
    expect(sheet).toContain('<autoFilter ref="A1:E2"/>');
    expect(sheet).not.toContain('rightToLeft');
    expect(parts['xl/workbook.xml']).toContain('name="Transfers"');
  });

  it('keeps formulas and odd text as plain text', () => {
    const parts = unzip(
      buildXlsx({
        sheetName: 'S',
        columns: [{ header: 'Name', key: 'name', type: 'text' }],
        rows: [{ name: '=HYPERLINK("http://x")' }, { name: '<b>&' }, { name: 'مستفيد' }],
      }),
    );
    const sheet = parts['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain(
      't="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;http://x&quot;)</t>',
    );
    expect(sheet).not.toContain('<f>');
    expect(sheet).toContain('&lt;b&gt;&amp;');
    expect(sheet).toContain('مستفيد');
  });

  it('leaves empty values as empty cells and flips to right-to-left for Arabic', () => {
    const parts = unzip(
      buildXlsx({
        sheetName: 'S',
        rtl: true,
        columns,
        rows: [{ ref: 'X', amount: null, created: null, rate: undefined, round: '' }],
      }),
    );
    const sheet = parts['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('rightToLeft="1"');
    expect(sheet).not.toContain('r="B2"');
  });

  it('works with no rows', () => {
    const parts = unzip(buildXlsx({ sheetName: 'S', columns, rows: [] }));
    expect(parts['xl/worksheets/sheet1.xml']).toContain('<autoFilter ref="A1:E1"/>');
  });
});

describe('export data', () => {
  let w;
  beforeEach(async () => {
    w = await makeWorld();
    setLang('en');
  });

  it('creators export their own requests only; others export everything', async () => {
    await newRequest(w); // Ahmed
    await w.svc.createRequest(w.who.sara, baseInput({ beneficiary: 'Sara Co' }), [pdf()]);
    expect((await w.svc.getExportData(w.who.ahmed)).items).toHaveLength(1);
    expect((await w.svc.getExportData(w.who.sara)).items).toHaveLength(1);
    expect((await w.svc.getExportData(w.who.fatima)).items).toHaveLength(2);
    expect((await w.svc.getExportData(w.who.husni)).items).toHaveLength(2);
  });

  it('can be limited to the requests on screen, but never beyond what the person may see', async () => {
    const a = await newRequest(w);
    const s = await w.svc.createRequest(w.who.sara, baseInput(), [pdf()]);
    expect((await w.svc.getExportData(w.who.fatima, [a.id])).items).toHaveLength(1);
    expect((await w.svc.getExportData(w.who.fatima, [])).items).toHaveLength(0);
    expect((await w.svc.getExportData(w.who.ahmed, [a.id, s.id])).items).toHaveLength(1);
  });

  it('turns a transferred request with a held bank status into a full row', async () => {
    const r = await ready(w, { currency: 'USD', amount: 400000, iban: 'SA0380000000608010167519' });
    await w.svc.setBankStatus(w.who.anfal, r.id, {
      state: 'review',
      reasons: ['compliance', 'docs_missing'],
      followedUp: true,
    });
    await w.svc.markTransferred(w.who.anfal, r.id, 'FT123', [pdf('receipt.pdf')]);
    const data = await w.svc.getExportData(w.who.fatima);
    const [row] = exportRows(data, 'en');
    expect(row).toMatchObject({
      status: 'Transferred',
      currency: 'USD',
      amount: 400000,
      rate: 3.75,
      amountSar: 1500000,
      approvals: '1/1',
      transferRef: 'FT123',
      bankStatus: 'Held for bank review',
      bankReasons: 'Compliance / AML checks, Missing required documents',
      followedUp: 'Yes',
      stalled: 'No',
      iban: 'SA0380000000608010167519',
    });
    expect(row.created).toBe(r.createdAt);
    setLang('ar');
    const [ar] = exportRows(data, 'ar');
    expect(ar.followedUp).toBe('نعم');
    expect(ar.bankReasons).toContain('، ');
  });

  it('flags a stalled request', async () => {
    await inBank(w);
    w.advanceDays(10);
    const [row] = exportRows(await w.svc.getExportData(w.who.fatima), 'en');
    expect(row.stalled).toBe('Yes');
    expect(row.daysInStatus).toBeGreaterThan(3);
  });
});

describe('admin', () => {
  let w;
  beforeEach(async () => {
    w = await makeWorld();
  });

  it('is for admins only', async () => {
    for (const call of [
      () => w.svc.getAdminData(w.who.anfal),
      () =>
        w.svc.addUser(w.who.husni, {
          nameEn: 'A',
          nameAr: 'ب',
          email: 'a@x.com',
          roles: ['creator'],
        }),
      () => w.svc.saveFxRate(w.who.ahmed, 'USD', 3.8),
      () => w.svc.saveSetting(w.who.husni, 'stalledDays', '4'),
      () => w.svc.clearSampleData(w.who.anfal),
      () => w.svc.deleteUser(w.who.anfal, w.who.sara.id),
    ]) {
      expect(await errorKey(call())).toBe('errors.notAllowed');
    }
  });

  it('a changed rate does not alter existing requests', async () => {
    const r = await newRequest(w, { currency: 'USD', amount: 1000 });
    await w.svc.saveFxRate(w.who.fatima, 'USD', 4);
    const kept = await w.repo.getRequestById(r.id);
    expect([kept.fxRate, kept.amountSar]).toEqual([3.75, 3750]);
    const next = await newRequest(w, { currency: 'USD', amount: 1000 });
    expect([next.fxRate, next.amountSar]).toEqual([4, 4000]);
  });

  it('adds a person, rejects a duplicate email and bad input', async () => {
    const added = await w.svc.addUser(w.who.fatima, {
      nameEn: ' New Person ',
      nameAr: 'شخص جديد',
      email: 'New.Person@Example.com',
      roles: ['creator'],
    });
    expect(added).toMatchObject({ nameEn: 'New Person', active: true });
    const saved = (await w.repo.listUsers()).find((u) => u.id === added.id);
    expect(saved.email).toBe('new.person@example.com');
    expect(
      await errorKey(
        w.svc.addUser(w.who.fatima, {
          nameEn: 'X',
          nameAr: 'س',
          email: 'NEW.person@example.com',
          roles: ['creator'],
        }),
      ),
    ).toBe('errors.emailTaken');
    expect(
      await errorKey(
        w.svc.addUser(w.who.fatima, {
          nameEn: '',
          nameAr: 'س',
          email: 'q@x.com',
          roles: ['creator'],
        }),
      ),
    ).toBe('errors.validation');
    expect(
      await errorKey(
        w.svc.addUser(w.who.fatima, {
          nameEn: 'X',
          nameAr: 'س',
          email: 'q@x.com',
          roles: ['boss'],
        }),
      ),
    ).toBe('errors.validation');
  });

  it('deletes a person who never acted, but not one with history or the admin themself', async () => {
    const added = await w.svc.addUser(w.who.fatima, {
      nameEn: 'Unused Person',
      nameAr: 'شخص غير مستخدم',
      email: 'unused@x.com',
      roles: ['creator'],
    });
    // addUser itself is attributed to Fatima, not the new person, so they have no history yet.
    expect((await w.svc.getAdminData(w.who.fatima)).deletableUserIds).toContain(added.id);
    await w.svc.deleteUser(w.who.fatima, added.id);
    expect((await w.repo.listUsers()).find((u) => u.id === added.id)).toBeUndefined();

    // Ahmed created a request, so he has history and cannot be deleted.
    await newRequest(w);
    const data = await w.svc.getAdminData(w.who.fatima);
    expect(data.deletableUserIds).not.toContain(w.who.ahmed.id);
    expect(await errorKey(w.svc.deleteUser(w.who.fatima, w.who.ahmed.id))).toBe(
      'errors.userHasHistory',
    );

    // Nobody, not even an admin, can delete themselves.
    expect(data.deletableUserIds).not.toContain(w.who.fatima.id);
    expect(await errorKey(w.svc.deleteUser(w.who.fatima, w.who.fatima.id))).toBe(
      'errors.cannotDeleteSelf',
    );
  });

  it('will not lock the admin out, but can switch off or demote any other user', async () => {
    expect(
      await errorKey(w.svc.saveUser(w.who.fatima, { ...w.who.fatima, roles: ['bank_ops'] })),
    ).toBe('errors.selfLockout');
    await w.svc.saveUser(w.who.fatima, { ...w.who.husni, active: false });
    expect((await w.repo.listUsers()).find((u) => u.id === w.who.husni.id).active).toBe(false);
    await w.svc.saveUser(w.who.fatima, { ...w.who.sara, active: false });
    expect((await w.repo.listUsers()).find((u) => u.id === w.who.sara.id).active).toBe(false);
  });

  it('checks settings', async () => {
    await w.svc.saveSetting(w.who.fatima, 'stalledDays', '5');
    expect((await w.repo.getSettings()).stalledDays).toBe('5');
    for (const bad of ['0', '31', '-1', '2.5', 'abc']) {
      expect(await errorKey(w.svc.saveSetting(w.who.fatima, 'stalledDays', bad))).toBe(
        'errors.validation',
      );
    }
    expect(await errorKey(w.svc.saveSetting(w.who.fatima, 'maxFileMb', '500'))).toBe(
      'errors.validation',
    );
    expect(await errorKey(w.svc.saveSetting(w.who.fatima, 'colour', 'red'))).toBe(
      'errors.validation',
    );
  });

  it('a new stalled setting changes what counts as stalled', async () => {
    await inBank(w);
    w.advanceDays(5); // 4 working days at least
    expect((await w.svc.getBoard(w.who.fatima)).items[0].stalled).toBe(true);
    await w.svc.saveSetting(w.who.fatima, 'stalledDays', '30');
    expect((await w.svc.getBoard(w.who.fatima)).items[0].stalled).toBe(false);
  });

  it('clears only the example requests', async () => {
    await loadSampleRequests(w.repo);
    const real = await newRequest(w);
    const data = await w.svc.getAdminData(w.who.fatima);
    expect(data.sampleCount).toBeGreaterThan(5);
    expect(data.requestCount).toBe(data.sampleCount + 1);
    const removed = await w.svc.clearSampleData(w.who.fatima);
    expect(removed).toBe(data.sampleCount);
    const left = await w.repo.listRequests();
    expect(left.map((r) => r.id)).toEqual([real.id]);
    expect((await w.svc.getAdminData(w.who.fatima)).sampleCount).toBe(0);
    expect((await w.repo.listUsers()).length).toBe(data.users.length); // people stay
  });
});
