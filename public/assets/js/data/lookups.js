// @ts-check
// Fixed lists. Labels carry both languages (ported from the old tracker).

export const CURRENCIES = ['SAR', 'USD', 'EUR', 'GBP', 'AED'];
export const ROLES = ['creator', 'bank_ops', 'approver', 'admin'];
export const ATTACHMENT_KINDS = [
  'payment_doc',
  'bank_proof',
  'transfer_receipt',
  'approval_evidence',
  'debit_proof',
];
export const BANK_STATES = ['executing', 'review', 'debited'];
export const MOVEMENTS = ['internal', 'external'];

export const ALLOWED_FILE_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
export const ALLOWED_FILE_EXT = /\.(pdf|jpe?g|png)$/i;

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
