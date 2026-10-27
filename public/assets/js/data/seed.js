// @ts-check
// Starting data. `loadReferenceData` is what a real installation needs (people, exchange rates,
// settings). `loadSampleRequests` adds example requests in every status so the screens have
// something to show; they are flagged isSample and can be cleared by the admin.
// The email addresses are fake and the exchange rates are placeholders.

import { createServices } from '../services/index.js';

/** @typedef {import('./repository.js').Repository} Repository */
/** @typedef {import('./typedefs.js').User} User */

export const USER_IDS = Object.freeze({
  fatima: 'u-fatima',
  anfal: 'u-anfal',
  husni: 'u-husni',
  mohammedAlsayed: 'u-msayed',
  mohammedAlkharji: 'u-kharji',
  ahmed: 'u-ahmed',
  sara: 'u-sara',
});

/** @returns {User[]} */
export const seedUsers = () => [
  {
    id: USER_IDS.fatima,
    email: 'fatima.alshehri@example.test',
    nameEn: 'Fatima Alshehri',
    nameAr: 'فاطمة الشهري',
    roles: ['admin', 'bank_ops'],
    active: true,
  },
  {
    id: USER_IDS.anfal,
    email: 'anfal.alshammari@example.test',
    nameEn: 'Anfal Alshammari',
    nameAr: 'انفال الشمري',
    roles: ['bank_ops'],
    active: true,
  },
  {
    id: USER_IDS.husni,
    email: 'husni.bakdash@example.test',
    nameEn: 'Husni Bakdash',
    nameAr: 'حسني بكداش',
    roles: ['senior_approver'],
    active: true,
  },
  {
    id: USER_IDS.mohammedAlsayed,
    email: 'mohammed.alsayed@example.test',
    nameEn: 'Mohammed Alsayed',
    nameAr: 'محمد السيد',
    roles: ['senior_approver'],
    active: true,
  },
  {
    id: USER_IDS.mohammedAlkharji,
    email: 'mohammed.alkharji@example.test',
    nameEn: 'Mohammed Al-Kharji',
    nameAr: 'محمد الخريجي',
    roles: ['manager_approver'],
    active: true,
  },
  {
    id: USER_IDS.ahmed,
    email: 'ahmed.khalil@example.test',
    nameEn: 'Ahmed Khalil',
    nameAr: 'أحمد خليل',
    roles: ['creator'],
    active: true,
  },
  {
    id: USER_IDS.sara,
    email: 'sara.alotaibi@example.test',
    nameEn: 'Sara Al-Otaibi',
    nameAr: 'سارة العتيبي',
    roles: ['creator'],
    active: true,
  },
];

/** @param {string} nowIso */
export function referenceData(nowIso) {
  return {
    users: seedUsers(),
    settings: { stalledDays: '3', maxFileMb: '5', baseCurrency: 'SAR' },
    fxRates: [
      ['SAR', 1],
      ['USD', 3.75],
      ['EUR', 4.35],
      ['GBP', 5.0],
      ['AED', 1.0211],
    ].map(([currency, rateToSar]) => ({
      currency: /** @type {string} */ (currency),
      rateToSar: /** @type {number} */ (rateToSar),
      updatedAt: nowIso,
      updatedById: USER_IDS.fatima,
    })),
  };
}

/** @param {Repository} repo @param {string} [nowIso] */
export async function loadReferenceData(repo, nowIso = new Date().toISOString()) {
  const data = referenceData(nowIso);
  for (const user of data.users) await repo.saveUser(user);
  for (const [key, value] of Object.entries(data.settings)) await repo.saveSetting(key, value);
  for (const rate of data.fxRates) await repo.saveFxRate(rate);
}

/** A tiny PDF so sample requests have something to open. @param {string} title */
function samplePdf(title) {
  const safe = title.replace(/[()\\]/g, '');
  const text =
    '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
    `4 0 obj<</Length 70>>stream\nBT /F1 12 Tf 20 60 Td (Sample: ${safe}) Tj ET\nendstream endobj\n` +
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';
  return new Blob([text], { type: 'application/pdf' });
}

/** @param {string} name */
function sampleFile(name) {
  const blob = samplePdf(name);
  return { name, mime: 'application/pdf', size: blob.size, blob };
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Twelve example requests covering every status, made by calling the real services as the real
 * users, so the data is exactly what the app itself would have produced.
 * @param {Repository} repo
 * @param {{now?: string, newId?: () => string}} [options]
 */
export async function loadSampleRequests(repo, { now = new Date().toISOString(), newId } = {}) {
  const base = new Date(now).getTime();
  let t = base;
  /** Move the sample clock to `daysAgo` days before now, plus some minutes. @param {number} daysAgo @param {number} [minutes] */
  const at = (daysAgo, minutes = 0) => {
    t = base - daysAgo * DAY + minutes * 60 * 1000;
  };
  const svc = createServices({ repo, clock: () => new Date(t).toISOString(), newId });
  const users = Object.fromEntries((await repo.listUsers()).map((u) => [u.id, u]));
  const U = {
    fatima: users[USER_IDS.fatima],
    anfal: users[USER_IDS.anfal],
    husni: users[USER_IDS.husni],
    msayed: users[USER_IDS.mohammedAlsayed],
    kharji: users[USER_IDS.mohammedAlkharji],
    ahmed: users[USER_IDS.ahmed],
    sara: users[USER_IDS.sara],
  };
  const opts = { sample: true };
  const make = (actor, fields, doc) =>
    svc.createRequest(
      actor,
      {
        bank: '',
        iban: 'SA3510000000123456789012',
        category: 'beneficiary',
        movement: 'internal',
        fromAccountId: '011-713724-001',
        requesterName: actor.nameEn,
        seniorApproverId: U.husni.id,
        purpose: '',
        ...fields,
      },
      [sampleFile(doc)],
      opts,
    );
  const bankEntry = (id, name) => svc.markBankCreated(U.anfal, id, [sampleFile(name)]);

  // 1-2 Submitted
  at(0, -40);
  await make(
    U.ahmed,
    {
      beneficiary: 'Al Faisal Trading Co.',
      amount: 245000,
      movement: 'external',
      swiftCode: 'NCBKSAJE',
      bank: 'Saudi National Bank',
    },
    'invoice-AF-2291.pdf',
  );
  at(0, -20);
  await make(
    U.sara,
    { beneficiary: 'GOSI', amount: 38900, category: 'gov_other', purpose: 'Monthly contributions' },
    'gosi-notice.pdf',
  );

  // 3 Created in bank, 400,000 USD, approval still pending
  at(1, 0);
  const najd = await make(
    U.ahmed,
    {
      beneficiary: 'Najd Logistics',
      amount: 400000,
      fromAccountId: '011-713724-080',
      movement: 'external',
      swiftCode: 'RJHISARI',
      iban: 'SA0380000000608010167519',
      purpose: 'Freight invoice INV-88213',
    },
    'INV-88213.pdf',
  );
  at(1, 60);
  await bankEntry(najd.id, 'bank-entry-najd.pdf');

  // 4 Ready: the senior approval recorded on behalf, with evidence, then the manager approval
  at(3, 0);
  const fitout = await make(
    U.ahmed,
    {
      beneficiary: 'Riyadh Fit-Out LLC',
      amount: 1850000,
      bank: 'Al Rajhi Bank',
      iban: 'SA1220000001234567891519',
      purpose: 'Fit-out milestone 3 of 4',
    },
    'milestone-3-invoice.pdf',
  );
  at(3, 120);
  await bankEntry(fitout.id, 'bank-entry-fitout.pdf');
  at(1, 20);
  await svc.recordOnBehalf(U.fatima, fitout.id, 1, 'approve', '', sampleFile('email-approval.pdf'));
  at(1, 30);
  await svc.decideStage(U.kharji, fitout.id, 2, 'approve');

  // 5 Created in bank and stalled: no approval decided for a while
  at(14, 0);
  const iqama = await make(
    U.sara,
    { beneficiary: 'Iqama renewals - October', amount: 48750, category: 'iqama_renewal' },
    'iqama-list.pdf',
  );
  at(13, 30);
  await bankEntry(iqama.id, 'bank-entry-iqama.pdf');

  // 6 Ready, held for review at the bank and followed up
  at(6, 0);
  const vat = await make(
    U.ahmed,
    { beneficiary: 'ZATCA - VAT Q3', amount: 312600, category: 'vat' },
    'vat-return-q3.pdf',
  );
  at(6, 60);
  await bankEntry(vat.id, 'bank-entry-vat.pdf');
  at(5, 0);
  await svc.decideStage(U.husni, vat.id, 1, 'approve');
  at(4, 12);
  await svc.decideStage(U.kharji, vat.id, 2, 'approve');
  at(1, 0);
  await svc.setBankStatus(U.fatima, vat.id, {
    state: 'review',
    reasons: ['compliance', 'docs_missing'],
    note: 'Bank asked for the ZATCA payment notice',
    followedUp: true,
  });

  // 7 Ready, executing
  at(4, 0);
  const cement = await make(
    U.sara,
    {
      beneficiary: 'Eastern Cement',
      amount: 720000,
      movement: 'external',
      swiftCode: 'RIBLSARI',
      bank: 'Riyad Bank',
      seniorApproverId: U.msayed.id,
    },
    'invoice-EC-5510.pdf',
  );
  at(4, 60);
  await bankEntry(cement.id, 'bank-entry-cement.pdf');
  at(2, 0);
  await svc.decideStage(U.msayed, cement.id, 1, 'approve');
  at(1, 30);
  await svc.decideStage(U.kharji, cement.id, 2, 'approve');

  // 8 and 11 Transferred (one this month, one last month)
  const transferFlow = async (daysAgo, actor, fields, doc, ref) => {
    at(daysAgo + 3, 0);
    const r = await make(actor, fields, doc);
    at(daysAgo + 3, 60);
    await bankEntry(r.id, `bank-entry-${ref}.pdf`);
    at(daysAgo + 1, 0);
    await svc.decideStage(U.husni, r.id, 1, 'approve');
    at(daysAgo, -180);
    await svc.decideStage(U.kharji, r.id, 2, 'approve');
    at(daysAgo, 0);
    await svc.markTransferred(U.anfal, r.id, ref, [sampleFile(`receipt-${ref}.pdf`)]);
    return r;
  };
  await transferFlow(
    2,
    U.sara,
    { beneficiary: 'Employee - M. Hassan', amount: 12000, category: 'employee' },
    'salary-advance.pdf',
    'FT2629881',
  );
  await transferFlow(
    30,
    U.ahmed,
    { beneficiary: 'Gulf Insurance', amount: 150000, movement: 'external', swiftCode: 'SABBSARI' },
    'policy-renewal.pdf',
    'FT2620417',
  );

  // 9 Returned
  at(4, 0);
  const gulf = await make(
    U.ahmed,
    {
      beneficiary: 'Gulf Office Supplies',
      amount: 62400,
      movement: 'external',
      swiftCode: 'SABBSARI',
      iban: 'SA0380000000608010167519',
      seniorApproverId: U.msayed.id,
    },
    'invoice-GOS-114.pdf',
  );
  at(4, 60);
  await bankEntry(gulf.id, 'bank-entry-gulf.pdf');
  at(3, 0);
  await svc.decideStage(U.msayed, gulf.id, 1, 'reject', 'IBAN does not match the vendor letter');

  // 10 Cancelled
  at(5, 0);
  const dup = await make(
    U.sara,
    { beneficiary: 'Al Faisal Trading Co.', amount: 20000 },
    'invoice-dup.pdf',
  );
  at(5, 30);
  await svc.cancelRequest(U.sara, dup.id, 'Duplicate of an earlier request');

  // 12 Created in bank, small amount
  at(0, -90);
  const rent = await make(
    U.ahmed,
    { beneficiary: 'Office rent - Olaya', amount: 18500, category: 'other' },
    'rent-notice.pdf',
  );
  at(0, -60);
  await bankEntry(rent.id, 'bank-entry-rent.pdf');
}
