// @ts-check
// D1 to D4: the dialogs for actions that need a reason, a file or a reference.
// Each one opens, checks the fields, calls the service, and resolves with the result
// (or undefined when the person closed it).

import { html } from '../ui/html.js';
import { openFormDialog, fieldError } from '../ui/formDialog.js';
import { filesOf } from '../ui/errors.js';
import { t } from '../i18n/index.js';
import { fmtAmount } from '../i18n/format.js';
import { isValidReason } from '../domain/validation.js';

/** @typedef {{services: any, user: import('../data/typedefs.js').User}} Ctx */
/** @typedef {import('../data/typedefs.js').Request} Request */
/** @typedef {import('../data/typedefs.js').Approval} Approval */

/** @param {HTMLElement} root @param {string} id */
const field = (root, id) => /** @type {any} */ (root.querySelector(`#${id}`));

const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

/**
 * A reason is required: used for rejecting a stage (D1) and cancelling a request (D3).
 * @param {{title: string, intro: string, label: string, confirmLabel: string,
 *   submit: (reason: string) => Promise<any>}} options
 */
export function askReason({ title, intro, label, confirmLabel, submit }) {
  return openFormDialog({
    title,
    intro,
    submitLabel: confirmLabel,
    danger: true,
    fields: html`<div class="field">
      <label for="fd-reason">${label}<span class="req" aria-hidden="true"> *</span></label>
      <textarea id="fd-reason" name="reason" rows="3" autofocus></textarea>
      ${fieldError('reason')}
    </div>`,
    validate: (root) => {
      /** @type {Record<string, string>} */
      const errors = {};
      if (!isValidReason(field(root, 'fd-reason').value)) errors.reason = 'validation.reason';
      return errors;
    },
    submit: (root) => submit(field(root, 'fd-reason').value.trim()),
  });
}

/**
 * D1: reject a stage.
 * @param {Ctx} ctx @param {Request} request @param {Approval} stage @param {string} stageName
 */
export function rejectStage(ctx, request, stage, stageName) {
  return askReason({
    title: t('reject.title'),
    intro: t('reject.intro', { ref: request.ref, stage: stageName }),
    label: t('reject.reason'),
    confirmLabel: t('reject.confirm'),
    submit: (reason) =>
      ctx.services.decideStage(
        ctx.user,
        request.id,
        stage.stageOrder,
        'reject',
        reason,
        request.version,
      ),
  });
}

/**
 * D3: cancel a request.
 * @param {Ctx} ctx @param {Request} request
 */
export function cancelRequestDialog(ctx, request) {
  return askReason({
    title: t('cancel.title'),
    intro: t('cancel.intro', { ref: request.ref }),
    label: t('cancel.reason'),
    confirmLabel: t('cancel.confirm'),
    submit: (reason) => ctx.services.cancelRequest(ctx.user, request.id, reason, request.version),
  });
}

/**
 * D2: bank ops record a decision the approver gave outside the app (an email, a message). The
 * proof file is required, and the history will say it was recorded on their behalf.
 * @param {Ctx} ctx @param {Request} request @param {Approval} stage
 * @param {{stageName: string, approverName: string}} names
 */
export function recordOnBehalfDialog(ctx, request, stage, { stageName, approverName }) {
  return openFormDialog({
    title: t('behalf.title'),
    intro: t('behalf.intro', { stage: stageName, approver: approverName }),
    submitLabel: t('behalf.confirm'),
    fields: html`<fieldset class="field">
        <legend class="lbl">${t('behalf.decision')}</legend>
        <div class="radios">
          <label class="radio"
            ><input type="radio" name="decision" value="approve" checked /> ${t('detail.approve')}</label
          >
          <label class="radio"
            ><input type="radio" name="decision" value="reject" /> ${t('detail.reject')}</label
          >
        </div>
      </fieldset>
      <div class="field">
        <label for="fd-note">${t('behalf.note')}</label>
        <textarea id="fd-note" name="note" rows="2"></textarea>
        ${fieldError('note')}
      </div>
      <div class="field">
        <label for="fd-evidence"
          >${t('behalf.evidence')}<span class="req" aria-hidden="true"> *</span></label
        >
        <input type="file" id="fd-evidence" name="evidence" accept="${FILE_ACCEPT}" />
        ${fieldError('evidence')}
      </div>`,
    validate: (root) => {
      /** @type {Record<string, string>} */
      const errors = {};
      const decision = root.querySelector('input[name="decision"]:checked')?.getAttribute('value');
      if (filesOf(field(root, 'fd-evidence')).length === 0) errors.evidence = 'validation.evidence';
      if (decision === 'reject' && !isValidReason(field(root, 'fd-note').value)) {
        errors.note = 'validation.reason';
      }
      return errors;
    },
    submit: (root) => {
      const decision = root.querySelector('input[name="decision"]:checked')?.getAttribute('value');
      return ctx.services.recordOnBehalf(
        ctx.user,
        request.id,
        stage.stageOrder,
        decision,
        field(root, 'fd-note').value.trim(),
        filesOf(field(root, 'fd-evidence'))[0],
        request.version,
      );
    },
  });
}

/**
 * D4: bank ops confirm the money was sent. The bank's reference and the receipt are required.
 * The amount and beneficiary are repeated so a wrong request is noticed before confirming.
 * @param {Ctx} ctx @param {Request} request
 */
export function markTransferredDialog(ctx, request) {
  return openFormDialog({
    title: t('transfer.title'),
    intro: `${fmtAmount(request.amount, request.currency)} · ${request.beneficiary}`,
    submitLabel: t('transfer.confirm'),
    fields: html`<div class="field">
        <label for="fd-reference"
          >${t('transfer.reference')}<span class="req" aria-hidden="true"> *</span></label
        >
        <input type="text" id="fd-reference" name="reference" class="mono" dir="ltr" autocomplete="off" autofocus />
        ${fieldError('reference')}
      </div>
      <div class="field">
        <label for="fd-receipt"
          >${t('transfer.receipt')}<span class="req" aria-hidden="true"> *</span></label
        >
        <input type="file" id="fd-receipt" name="receipt" multiple accept="${FILE_ACCEPT}" />
        ${fieldError('receipt')}
      </div>`,
    validate: (root) => {
      /** @type {Record<string, string>} */
      const errors = {};
      if (!field(root, 'fd-reference').value.trim()) errors.reference = 'validation.bankRef';
      if (filesOf(field(root, 'fd-receipt')).length === 0) errors.receipt = 'validation.receipt';
      return errors;
    },
    submit: (root) =>
      ctx.services.markTransferred(
        ctx.user,
        request.id,
        field(root, 'fd-reference').value.trim(),
        filesOf(field(root, 'fd-receipt')),
        request.version,
      ),
  });
}
