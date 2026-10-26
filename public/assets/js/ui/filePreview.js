// @ts-check
// Opens an attached file: pictures and PDFs are shown, anything else only offers the download.

import { html } from './html.js';
import { delegate } from './dom.js';
import { openDialog } from './dialog.js';
import { t } from '../i18n/index.js';
import { fmtSize } from '../i18n/format.js';

/**
 * @param {{services: any, user: import('../data/typedefs.js').User}} ctx
 * @param {string} requestId
 * @param {string} attachmentId
 */
export async function openFilePreview(ctx, requestId, attachmentId) {
  const { meta, blob } = await ctx.services.openAttachment(ctx.user, requestId, attachmentId);
  const url = URL.createObjectURL(blob);
  const preview = meta.mime.startsWith('image/')
    ? html`<img class="preview-img" src="${url}" alt="${meta.fileName}" />`
    : meta.mime === 'application/pdf'
      ? html`<iframe class="preview-frame" src="${url}" title="${meta.fileName}"></iframe>`
      : html`<p class="muted">${t('file.noPreview')}</p>`;
  const dlg = openDialog({
    eyebrow: t(`file.kind.${meta.kind}`),
    title: meta.fileName,
    wide: true,
    body: html`${preview}
      <p class="muted small mono">${fmtSize(meta.sizeBytes)}</p>
      <div class="modal-actions">
        <a class="btn primary" href="${url}" download="${meta.fileName}">${t('file.download')}</a>
        <button type="button" class="btn" data-action="close-preview">${t('common.close')}</button>
      </div>`,
  });
  delegate(dlg.el, 'click', { 'close-preview': () => dlg.close() });
  dlg.closed.then(() => URL.revokeObjectURL(url));
}
