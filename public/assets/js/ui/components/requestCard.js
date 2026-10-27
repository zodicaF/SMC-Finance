// @ts-check
// One request on the board. The same five lines every time: reference, beneficiary, amount,
// one line of context, and the status.

import { html } from '../html.js';
import { statusPill, stalledPill } from './statusPill.js';
import { t } from '../../i18n/index.js';
import { fmtAmount, fmtDate, fmtNumber } from '../../i18n/format.js';
import { personName, categoryLabel } from '../../i18n/labels.js';
import { requestHash } from '../../router.js';

/**
 * @param {import('../../domain/board.js').BoardItem} item
 * @param {{users: Record<string, import('../../data/typedefs.js').User>, lang: 'ar' | 'en'}} ctx
 */
function contextLine(item, { lang }) {
  const r = item.request;
  switch (r.status) {
    case 'submitted':
      return html`${categoryLabel(r.category, lang)}`;
    case 'bank_created': {
      const awaiting = t('card.awaitingApproval');
      return r.currency === 'SAR'
        ? html`${awaiting}`
        : html`<bdi dir="ltr" class="mono">≈ ${fmtAmount(r.amountSar, 'SAR')}</bdi> · ${awaiting}`;
    }
    case 'approving':
      return html`${item.waitingOnApprover ? t('card.waitingApprover') : categoryLabel(r.category, lang)}`;
    case 'ready':
      return html`${t('card.approvedOn', { date: fmtDate(r.statusChangedAt, lang) })}`;
    case 'transferred':
      return html`${t('card.bankRefLabel')} <bdi dir="ltr" class="mono">${r.transferRef}</bdi>`;
    case 'returned':
    case 'cancelled':
      return html`${r.closedReason ?? ''}`;
    default:
      return html``;
  }
}

/**
 * @param {import('../../domain/board.js').BoardItem} item
 * @param {{users: Record<string, import('../../data/typedefs.js').User>, lang: 'ar' | 'en'}} ctx
 */
export function requestCard(item, ctx) {
  const r = item.request;
  const cls = `card${item.stalled ? ' stalled' : ''}${r.status === 'returned' ? ' returned' : ''}`;
  return html`<a class="${cls}" href="${requestHash(r.ref)}" data-status="${r.status}">
    <span class="card-top">
      <span class="card-ben">${r.beneficiary}</span>
      <span class="card-pills"
        >${statusPill(r.status, item.progress)}${item.stalled ? stalledPill(item.workingDays) : ''}</span
      >
    </span>
    <span class="card-amt"
      ><bdi dir="ltr"><span class="mono">${fmtNumber(r.amount)}</span>
      <span class="card-cur">${r.currency}</span></bdi></span
    >
    <span class="card-ctx">${contextLine(item, ctx)}</span>
    <span class="card-foot">
      <span class="card-ref mono">${r.ref}</span>
      <span class="card-who">${personName(ctx.users[r.createdById], ctx.lang)}</span>
    </span>
  </a>`;
}
