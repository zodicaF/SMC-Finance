// @ts-check
// The status badge used on cards and lists. Always text, never colour alone.

import { html } from '../html.js';
import { t } from '../../i18n/index.js';

/**
 * @param {string} status  request status
 * @param {{approved: number, total: number}} [progress]
 */
export function statusPill(status, progress) {
  switch (status) {
    case 'submitted':
      return html`<span class="pill warn">${t('pill.awaitingBank')}</span>`;
    case 'bank_created':
    case 'approving':
      return html`<span class="pill warn"
        >${t('pill.approved', { n: progress?.approved ?? 0, total: progress?.total ?? 0 })}</span
      >`;
    case 'ready':
      return html`<span class="pill ok">${t('pill.ready')}</span>`;
    case 'transferred':
      return html`<span class="pill dark">${t('status.transferred')}</span>`;
    case 'returned':
      return html`<span class="pill bad">${t('pill.needsCorrection')}</span>`;
    case 'cancelled':
      return html`<span class="pill">${t('status.cancelled')}</span>`;
    default:
      return html`<span class="pill">${status}</span>`;
  }
}

/** The extra badge for requests stuck in one status. @param {number} workingDays */
export function stalledPill(workingDays) {
  return html`<span class="pill bad" title="${t('card.stalledDays', { n: workingDays })}"
    >${t('pill.stalled')}</span
  >`;
}
