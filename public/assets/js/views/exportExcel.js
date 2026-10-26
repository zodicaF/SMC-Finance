// @ts-check
// "Export to Excel": one row per request, headers in the current language. In Arabic the sheet
// opens right-to-left. Amounts and dates are real numbers and dates; references, IBANs and names
// are text. Creators only ever get their own requests (the service decides, not this screen).

import { buildXlsx } from '../domain/xlsx.js';
import { downloadFile, XLSX_MIME } from '../ui/download.js';
import { showToast } from '../ui/toast.js';
import { errorText } from '../ui/errors.js';
import { t, getLang } from '../i18n/index.js';
import { categoryLabel, joinNames, personName } from '../i18n/labels.js';
import { REASONS, labelOf } from '../data/lookups.js';

/** @typedef {import('../domain/xlsx.js').Column} Column */

/** @type {[string, Column['type'], number][]} key, type, width */
const COLUMNS = [
  ['ref', 'text', 22],
  ['status', 'text', 18],
  ['created', 'date', 18],
  ['createdBy', 'text', 22],
  ['beneficiary', 'text', 30],
  ['bank', 'text', 22],
  ['iban', 'text', 30],
  ['swiftCode', 'text', 16],
  ['category', 'text', 30],
  ['movement', 'text', 12],
  ['currency', 'text', 10],
  ['amount', 'amount', 16],
  ['rate', 'rate', 10],
  ['amountSar', 'amount', 16],
  ['purpose', 'text', 36],
  ['round', 'int', 8],
  ['approvals', 'text', 12],
  ['bankEntered', 'date', 18],
  ['bankEnteredBy', 'text', 22],
  ['transferred', 'date', 18],
  ['transferredBy', 'text', 22],
  ['transferRef', 'text', 24],
  ['bankStatus', 'text', 24],
  ['bankReasons', 'text', 40],
  ['followedUp', 'text', 12],
  ['daysInStatus', 'int', 12],
  ['stalled', 'text', 10],
  ['closedReason', 'text', 36],
];

/**
 * The sheet's rows from the service data. Exported so a test can check them.
 * Text such as statuses comes from the current language, which `lang` must match.
 * @param {{items: {request: import('../data/typedefs.js').Request, progress: {approved: number, total: number}, bankStatus: import('../data/typedefs.js').BankStatus | null, stalled: boolean, workingDays: number}[], users: Record<string, import('../data/typedefs.js').User>}} data
 * @param {'ar' | 'en'} lang
 */
export function exportRows(data, lang) {
  const yes = t('export.yes');
  const no = t('export.no');
  /** @param {string | null} id */
  const who = (id) => (id ? personName(data.users[id], lang) : '');
  return data.items.map(({ request: r, progress, bankStatus: b, stalled, workingDays }) => ({
    ref: r.ref,
    status: t(`status.${r.status}`),
    created: r.createdAt,
    createdBy: who(r.createdById),
    beneficiary: r.beneficiary,
    bank: r.bank,
    iban: r.iban,
    swiftCode: r.swiftCode,
    category: categoryLabel(r.category, lang),
    movement: t(`movement.${r.movement}`),
    currency: r.currency,
    amount: r.amount,
    rate: r.fxRate,
    amountSar: r.amountSar,
    purpose: r.purpose,
    round: r.round,
    approvals: progress.total > 0 ? `${progress.approved}/${progress.total}` : '',
    bankEntered: r.bankCreatedAt,
    bankEnteredBy: who(r.bankCreatedById),
    transferred: r.transferredAt,
    transferredBy: who(r.transferredById),
    transferRef: r.transferRef ?? '',
    bankStatus: b ? t(`bank.${b.state}`) : '',
    bankReasons: b
      ? joinNames(
          b.reasons.map((k) => {
            const item = REASONS.find((x) => x.key === k);
            return item ? labelOf(item, lang) : k;
          }),
          lang,
        )
      : '',
    followedUp: b ? (b.followedUp ? yes : no) : '',
    daysInStatus: workingDays,
    stalled: stalled ? yes : no,
    closedReason: r.closedReason ?? '',
  }));
}

/**
 * Builds the workbook for the requests the person is looking at and downloads it.
 * @param {{services: any, user: import('../data/typedefs.js').User}} ctx
 * @param {string[]} [ids]  the requests on screen; every request they may see when omitted
 */
export async function exportToExcel(ctx, ids) {
  const lang = getLang();
  try {
    const data = await ctx.services.getExportData(ctx.user, ids);
    if (data.items.length === 0) {
      showToast(t('export.empty'), { error: true });
      return;
    }
    const file = buildXlsx({
      sheetName: t('export.sheet'),
      rtl: lang === 'ar',
      columns: COLUMNS.map(([key, type, width]) => ({
        key,
        type,
        width,
        header: t(`export.col.${key}`),
      })),
      rows: exportRows(data, lang),
    });
    downloadFile(file, `${t('export.file')}-${data.nowIso.slice(0, 10)}.xlsx`, XLSX_MIME);
    showToast(t('export.done', { n: data.items.length }));
  } catch (err) {
    showToast(errorText(err), { error: true });
  }
}
