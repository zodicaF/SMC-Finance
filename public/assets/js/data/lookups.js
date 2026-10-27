// @ts-check
// Fixed lists. Labels carry both languages (ported from the old tracker).

export const CURRENCIES = ['SAR', 'USD', 'EUR', 'GBP', 'AED'];
export const ROLES = ['creator', 'bank_ops', 'senior_approver', 'manager_approver', 'admin'];
export const ATTACHMENT_KINDS = [
  'payment_doc',
  'bank_proof',
  'transfer_receipt',
  'approval_evidence',
  'debit_proof',
];
export const BANK_STATES = ['executing', 'review', 'debited'];
export const MOVEMENTS = ['internal', 'external'];

/** Used when a setting has never been saved (SPEC: stalled after 3 working days, 5 MB files). */
export const DEFAULT_SETTINGS = Object.freeze({ stalledDays: 3, maxFileMb: 5 });

export const ALLOWED_FILE_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
export const ALLOWED_FILE_EXT = /\.(pdf|jpe?g|png)$/i;

/** The company's own accounts a request can pay from. Company and bank names are proper
 * nouns, kept as-is in both languages (the same way a beneficiary's bank name is free text,
 * never translated). The account number is unique, so it doubles as the lookup id. */
export const COMPANY_ACCOUNTS = [
  { id: '011-713724-001', company: 'Saudi Media Company', bank: 'SAB Bank', currency: 'SAR' },
  { id: '011-713724-002', company: 'Saudi Media Company', bank: 'SAB Bank', currency: 'SAR' },
  { id: '011-713724-003', company: 'Saudi Media Company', bank: 'SAB Bank', currency: 'SAR' },
  { id: '011-713724-006', company: 'Saudi Media Company', bank: 'SAB Bank', currency: 'SAR' },
  { id: '011-713724-080', company: 'Saudi Media Company', bank: 'SAB Bank', currency: 'USD' },
  { id: '1000029619940', company: 'Saudi Media Company', bank: 'RYD Bank', currency: 'SAR' },
  { id: '24900000266301', company: 'Saudi Media Company', bank: 'SNB Bank', currency: 'SAR' },
  { id: '24900000305609', company: 'Saudi Media Company', bank: 'SNB Bank', currency: 'SAR' },
  { id: '24900000324902', company: 'Saudi Media Company', bank: 'SNB Bank', currency: 'SAR' },
  { id: '430131353390024', company: 'Saudi Media Company', bank: 'Al Bilad Bank', currency: 'SAR' },
  { id: 'R1214200154', company: 'Saudi Media Company', bank: 'Al Faransi Bank', currency: 'SAR' },
  {
    id: '50400-001-0006089069583',
    company: 'Saudi Media Company',
    bank: 'Rajhi Bank',
    currency: 'SAR',
  },
  { id: '611-115890-001', company: 'Growth Company', bank: 'SAB Bank', currency: 'SAR' },
  { id: '611-115890-081', company: 'Growth Company', bank: 'SAB Bank', currency: 'EUR' },
  { id: '611-115890-080', company: 'Growth Company', bank: 'SAB Bank', currency: 'USD' },
  { id: '091-064907-001', company: 'SMC Media Company', bank: 'SAB Bank', currency: 'SAR' },
  { id: '091-064907-002', company: 'SMC Media Company', bank: 'SAB Bank', currency: 'SAR' },
  { id: '091-064907-003', company: 'SMC Media Company', bank: 'SAB Bank', currency: 'SAR' },
  { id: '091-064907-004', company: 'SMC Media Company', bank: 'SAB Bank', currency: 'SAR' },
  { id: '091-064907-080', company: 'SMC Media Company', bank: 'SAB Bank', currency: 'USD' },
  { id: '2000528349940', company: 'SMC Media Company', bank: 'RYD Bank', currency: 'SAR' },
  { id: '24900000389105', company: 'SMC Media Company', bank: 'SNB Bank', currency: 'SAR' },
  { id: '091-064865-001', company: 'SMC Vibes Company', bank: 'SAB Bank', currency: 'SAR' },
  { id: '091-064865-002', company: 'SMC Vibes Company', bank: 'SAB Bank', currency: 'SAR' },
  { id: '091-064865-003', company: 'SMC Vibes Company', bank: 'SAB Bank', currency: 'SAR' },
  { id: '091-064865-080', company: 'SMC Vibes Company', bank: 'SAB Bank', currency: 'USD' },
  { id: '2000527559940', company: 'SMC Vibes Company', bank: 'RYD Bank', currency: 'SAR' },
  { id: '24900000388708', company: 'SMC Vibes Company', bank: 'SNB Bank', currency: 'SAR' },
  { id: '091-066951-001', company: 'SMC CAPITAL Company', bank: 'SAB Bank', currency: 'SAR' },
  { id: '091-066951-080', company: 'SMC CAPITAL Company', bank: 'SAB Bank', currency: 'USD' },
  { id: '2000527439940', company: 'SMC CAPITAL Company', bank: 'RYD Bank', currency: 'SAR' },
  {
    id: '091-066936-001',
    company: 'Numad Data and Ai Company',
    bank: 'SAB Bank',
    currency: 'SAR',
  },
  {
    id: '091-066936-080',
    company: 'Numad Data and Ai Company',
    bank: 'SAB Bank',
    currency: 'USD',
  },
  {
    id: '2000527799940',
    company: 'Numad Data and Ai Company',
    bank: 'RYD Bank',
    currency: 'SAR',
  },
  {
    id: '2000527790440',
    company: 'Numad Data and Ai Company',
    bank: 'RYD Bank',
    currency: 'USD',
  },
  { id: '2000536939940', company: 'SMC TECH Company', bank: 'RYD Bank', currency: 'SAR' },
  { id: '2000536930440', company: 'SMC TECH Company', bank: 'RYD Bank', currency: 'USD' },
  {
    id: '091-091058-001',
    company: 'Modern Content Creators Network',
    bank: 'SAB Bank',
    currency: 'SAR',
  },
];

/** @param {string} id @returns {typeof COMPANY_ACCOUNTS[number] | undefined} */
export const accountOf = (id) => COMPANY_ACCOUNTS.find((a) => a.id === id);

export const CATEGORIES = [
  {
    key: 'beneficiary',
    ar: 'حوالة لمستفيد (مورد / جهة خارجية)',
    en: 'Transfer to a beneficiary (vendor / third party)',
  },
  { key: 'employee', ar: 'دفعة لموظف', en: 'Payment to an employee' },
  { key: 'iqama_renewal', ar: 'تجديد إقامة', en: 'Iqama renewal' },
  { key: 'work_permit', ar: 'رخصة عمل', en: 'Work permit' },
  { key: 'sponsorship_transfer', ar: 'نقل كفالة', en: 'Sponsorship transfer' },
  { key: 'profession_change', ar: 'تغيير مهنة', en: 'Profession change' },
  { key: 'exit_reentry', ar: 'تأشيرة خروج وعودة', en: 'Exit and re-entry visa' },
  { key: 'vat', ar: 'ضريبة القيمة المضافة', en: 'VAT' },
  { key: 'withholding_tax', ar: 'ضريبة الاستقطاع', en: 'Withholding tax' },
  { key: 'gov_other', ar: 'مبالغ حكومية أخرى للسداد', en: 'Other government amounts due' },
  { key: 'violations', ar: 'مخالفات', en: 'Violations / fines' },
  { key: 'other', ar: 'أخرى', en: 'Other' },
];

/** Reasons a transfer can be held for review at the bank. */
export const REASONS = [
  {
    key: 'external_review',
    ar: 'حوالة خارجية تتطلب تدقيقًا إضافيًا',
    en: 'External transfer requiring extra vetting',
  },
  {
    key: 'large_amount',
    ar: 'مبلغ كبير يتجاوز الحد الرقابي اليومي',
    en: 'Large amount exceeding daily compliance limit',
  },
  {
    key: 'small_flag',
    ar: 'مبلغ صغير موقوف لمطابقة الأنماط',
    en: 'Small amount flagged for pattern matching',
  },
  {
    key: 'beneficiary_check',
    ar: 'التحقق من بيانات / هوية المستفيد',
    en: 'Beneficiary identity/details verification',
  },
  { key: 'compliance', ar: 'إجراءات الامتثال ومكافحة غسل الأموال', en: 'Compliance / AML checks' },
  { key: 'docs_missing', ar: 'نقص في المستندات المطلوبة', en: 'Missing required documents' },
  { key: 'other', ar: 'سبب آخر', en: 'Other reason' },
];

/**
 * Label of a lookup item in a language.
 * @param {{ar: string, en: string}} item
 * @param {'ar' | 'en'} lang
 */
export const labelOf = (item, lang) => (lang === 'ar' ? item.ar : item.en);
