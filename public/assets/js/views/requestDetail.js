// @ts-check
// S4 - one request: details, files, bank entry, approvals, transfer, bank status and history.
// What each person sees and can do depends on their role and on the request's status; the
// wireframes' "B6" preview is the reference. The rules themselves live in domain/permissions.js
// and the services refuse anything not allowed, so this screen only decides what to show.

import { html } from '../ui/html.js';
import { mount, delegate } from '../ui/dom.js';
import { confirmDialog } from '../ui/dialog.js';
import { showToast } from '../ui/toast.js';
import { errorText, filesOf, isConflict } from '../ui/errors.js';
import { openFilePreview } from '../ui/filePreview.js';
import { statusPill } from '../ui/components/statusPill.js';
import { t, getLang } from '../i18n/index.js';
import { fmtAmount, fmtDate, fmtSize } from '../i18n/format.js';
import { categoryLabel, personName } from '../i18n/labels.js';
import { REASONS, labelOf } from '../data/lookups.js';
import { canDo, denyReason } from '../domain/permissions.js';
import { approvalProgress, paymentDetailsChanged } from '../domain/rules.js';
import {
  cancelRequestDialog,
  markTransferredDialog,
  recordOnBehalfDialog,
  rejectStage,
} from './decisionDialogs.js';
import { openEditRequest } from './newRequestForm.js';
import { render as renderNoAccess } from './noAccess.js';

const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const FILE_KINDS = ['payment_doc', 'bank_proof', 'approval_evidence', 'transfer_receipt'];

/**
 * @param {HTMLElement} container
 * @param {{services: any, user: import('../data/typedefs.js').User, params: {ref: string},
 *   afterChange?: () => void}} ctx
 * @returns {() => void}  cleanup
 */
export function render(container, ctx) {
  const { services, user } = ctx;
  const lang = getLang();
  let alive = true;
  let busy = false;
  let conflict = false;
  /** @type {Awaited<ReturnType<typeof services.getRequestDetail>> | null} */
  let d = null;

  mount(
    container,
    html`<section class="panel"><p class="muted">${t('common.loading')}</p></section>`,
  );

  async function load() {
    try {
      const result = await services.getRequestDetail(user, ctx.params.ref);
      if (!alive) return;
      d = result;
      draw();
    } catch (err) {
      if (!alive) return;
      if (/** @type {any} */ (err)?.key === 'errors.notFound') {
        renderNoAccess(container);
        return;
      }
      console.error(err);
      mount(
        container,
        html`<div class="panel state error" role="alert">
          <p>${t('detail.loadError')}</p>
          <button type="button" class="btn" data-action="retry">${t('common.retry')}</button>
        </div>`,
      );
    }
  }

  // ---- small pieces -----------------------------------------------------------------------

  /** @param {string} label @param {import('../ui/html.js').SafeHtml | string} value */
  const kv = (label, value) => html`<div class="kv"><dt>${label}</dt><dd>${value}</dd></div>`;

  /** @param {string} action @param {string} label @param {string} [cls] @param {Record<string, string | number>} [data] */
  const button = (action, label, cls = '', data = {}) => html`<button
    type="button"
    class="btn ${cls}"
    data-action="${action}"
    ${Object.entries(data).map(([k, v]) => html`data-${k}="${v}" `)}
  >
    ${label}
  </button>`;

  /** @param {NonNullable<typeof d>} data @param {string} id */
  const nameOf = (data, id) => personName(data.users[id], lang);

  /** One line of the history, in words. @param {NonNullable<typeof d>} data @param {any} entry */
  function logLine(data, entry) {
    const det = entry.details ?? {};
    const changed = Array.isArray(det.changed)
      ? det.changed.map((/** @type {string} */ f) => t(`field.${f}`)).join(', ')
      : '';
    const key =
      entry.action === 'resubmitted' && det.backToBankOps
        ? 'log.resubmittedBank'
        : `log.${entry.action}`;
    return t(key, {
      reason: det.reason ?? det.note ?? '',
      ref: det.bankReference ?? '',
      round: det.round ?? '',
      file: det.fileName ?? '',
      kind: det.kind ? t(`file.kind.${det.kind}`) : '',
      from: det.from ? t(`status.${det.from}`) : '',
      to:
        det.to && entry.action === 'bank_status'
          ? t(`bank.${det.to}`)
          : det.to
            ? t(`status.${det.to}`)
            : '',
      changed,
    });
  }

  // ---- sections ---------------------------------------------------------------------------

  /** @param {NonNullable<typeof d>} data */
  function headerSection(data) {
    const r = data.request;
    const progress = approvalProgress(data.currentApprovals);
    const stamp =
      r.status === 'ready'
        ? html`<div class="stamp">${t('detail.stampApproved')}</div>`
        : r.status === 'transferred'
          ? html`<div class="stamp green">${t('status.transferred')}</div>`
          : '';
    return html`<header class="detail-head">
      <div>
        <p class="card-ref mono">${r.ref}</p>
        <h2>${r.beneficiary}</h2>
        <p class="detail-amt mono">${fmtAmount(r.amount, r.currency)}</p>
        <div class="card-pills">${statusPill(r.status, progress)}</div>
      </div>
      ${stamp}
    </header>`;
  }

  /** @param {NonNullable<typeof d>} data */
  function bannerSection(data) {
    const r = data.request;
    if (r.status === 'returned') {
      const rejected = data.currentApprovals.find((a) => a.status === 'rejected');
      const reason = r.closedReason ?? '';
      return html`<div class="banner bad" role="note">
        ${
          rejected?.decidedById
            ? t('detail.returnedBanner', { name: nameOf(data, rejected.decidedById), reason })
            : t('detail.returnedNoName', { reason })
        }
      </div>`;
    }
    if (r.status === 'cancelled') {
      const entry = [...data.log]
        .reverse()
        .find((/** @type {any} */ l) => l.action === 'cancelled');
      return html`<div class="banner mute" role="note">
        ${t('detail.cancelledBanner', {
          name: entry ? nameOf(data, entry.actorId) : '—',
          reason: r.closedReason ?? '',
        })}
      </div>`;
    }
    return '';
  }

  /** @param {NonNullable<typeof d>} data */
  function actionsSection(data) {
    const r = data.request;
    const buttons = [
      button('print', t('detail.print')),
      canDo('edit', user, r) ? button('edit', t('detail.edit')) : '',
      canDo('resubmit', user, r) ? button('resubmit', t('detail.resubmit'), 'primary') : '',
      canDo('cancel', user, r) ? button('cancel', t('detail.cancel')) : '',
      canDo('delete', user, r) ? button('delete', t('detail.delete'), 'danger') : '',
    ];
    return html`<div class="actions-bar">${buttons}</div>`;
  }

  /** @param {NonNullable<typeof d>} data */
  function detailsSection(data) {
    const r = data.request;
    return html`<section class="panel">
      <h3>${t('detail.secDetails')}</h3>
      <dl class="kvs">
        ${kv(t('detail.requestedBy'), `${nameOf(data, r.createdById)} · ${fmtDate(r.createdAt, lang)}`)}
        ${kv(t('detail.category'), categoryLabel(r.category, lang))}
        ${kv(t('detail.movement'), t(`movement.${r.movement}`))}
        ${kv(t('detail.bank'), r.bank || '—')}
        ${kv(t('detail.iban'), r.iban ? html`<bdi dir="ltr" class="mono">${r.iban}</bdi>` : '—')}
        ${
          r.movement === 'external'
            ? kv(
                t('detail.swiftCode'),
                r.swiftCode ? html`<bdi dir="ltr" class="mono">${r.swiftCode}</bdi>` : '—',
              )
            : ''
        }
        ${kv(t('detail.amount'), html`<bdi dir="ltr" class="mono">${fmtAmount(r.amount, r.currency)}</bdi>`)}
        ${
          r.currency !== 'SAR'
            ? kv(
                t('detail.sar'),
                html`<bdi dir="ltr" class="mono">${fmtAmount(r.amountSar, 'SAR')} · ${r.fxRate}</bdi>`,
              )
            : ''
        }
        ${kv(t('detail.purpose'), r.purpose || '—')}
      </dl>
    </section>`;
  }

  /** @param {NonNullable<typeof d>} data */
  function filesSection(data) {
    const r = data.request;
    const files = [...data.attachments].sort(
      (a, b) =>
        FILE_KINDS.indexOf(a.kind) - FILE_KINDS.indexOf(b.kind) ||
        a.uploadedAt.localeCompare(b.uploadedAt),
    );
    return html`<section class="panel">
      <h3>${t('detail.secFiles')}</h3>
      ${
        files.length === 0
          ? html`<p class="muted">${t('detail.noFiles')}</p>`
          : html`<ul class="files">
            ${files.map(
              (f) => html`<li>
                <button type="button" class="link file-name" data-action="open-file" data-id="${f.id}">
                  ${f.fileName}
                </button>
                <span class="pill">${t(`file.kind.${f.kind}`)}</span>
                <span class="sz mono">${fmtSize(f.sizeBytes)}</span>
              </li>`,
            )}
          </ul>`
      }
      ${
        canDo('edit', user, r)
          ? html`<div>
            <label class="btn small" for="add-docs">${t('detail.addDocument')}</label>
            <input type="file" id="add-docs" class="visually-hidden" multiple accept="${FILE_ACCEPT}" />
          </div>`
          : ''
      }
    </section>`;
  }

  /** @param {NonNullable<typeof d>} data */
  function bankEntrySection(data) {
    const r = data.request;
    let body;
    if (r.bankCreatedAt && r.bankCreatedById) {
      body = html`<dl class="kvs">
        ${kv(t('detail.enteredBy'), nameOf(data, r.bankCreatedById))}
        ${kv(t('detail.enteredOn'), fmtDate(r.bankCreatedAt, lang))}
      </dl>`;
    } else if (r.status === 'submitted' && canDo('markBankCreated', user, r)) {
      const proofs = data.attachments.filter((a) => a.kind === 'bank_proof').length;
      body = html`<p class="muted">${t('detail.bankHintOps')}</p>
        <div class="actions-bar">
          <label class="btn small" for="add-proof">${t('detail.addProof')}</label>
          <input type="file" id="add-proof" class="visually-hidden" multiple accept="${FILE_ACCEPT}" />
          ${button('mark-bank', t('detail.markBank'), 'primary')}
          ${proofs === 0 ? html`<span class="muted small">${t('validation.bankProof')}</span>` : ''}
        </div>`;
    } else if (r.status === 'submitted') {
      body = html`<p class="muted">${t('detail.bankHintWait')}</p>`;
    } else {
      body = html`<p class="muted">${t('detail.bankNone')}</p>`;
    }
    const mine = !r.bankCreatedAt && r.status === 'submitted' && canDo('markBankCreated', user, r);
    return html`<section class="panel${mine ? ' act' : ''}">
      <h3>${t('detail.secBank')}</h3>
      ${body}
    </section>`;
  }

  /** @param {NonNullable<typeof d>} data @param {any} row */
  function stageItem(data, row) {
    const r = data.request;
    const rows = data.currentApprovals;
    const inApproval = r.status === 'bank_created' || r.status === 'approving';
    const date = row.decidedAt ? fmtDate(row.decidedAt, lang) : '';
    let dot = html`<span class="dot wait">${row.stageOrder}</span>`;
    /** @type {string} */
    let text;
    if (row.status === 'approved') {
      dot = html`<span class="dot ok">✓</span>`;
      text = row.onBehalf
        ? t('detail.approvedOnBehalf', { by: nameOf(data, row.decidedById), date })
        : t('detail.approvedAt', { date });
    } else if (row.status === 'rejected') {
      dot = html`<span class="dot no">✕</span>`;
      text = row.onBehalf
        ? t('detail.rejectedOnBehalf', { by: nameOf(data, row.decidedById), date })
        : t('detail.rejectedAt', { date });
    } else if (!inApproval) {
      text = t('detail.notDecided');
    } else {
      text = t('detail.waiting');
    }
    const evidence = row.evidenceId ? data.attachments.find((a) => a.id === row.evidenceId) : null;
    const stage = { stage: row, approvals: rows };
    const canDecide = row.status === 'pending' && !denyReason('decide', user, r, stage);
    const canBehalf = row.status === 'pending' && !denyReason('recordOnBehalf', user, r, stage);
    return html`<li class="step">
      ${dot}
      <div class="step-body">
        <p class="step-name">
          <b>${t('detail.approverRole')}</b>
        </p>
        <p class="muted small">${text}</p>
        ${row.note ? html`<p class="small">${t('detail.noteLine', { note: row.note })}</p>` : ''}
        ${
          evidence
            ? html`<p class="small">
              ${t('detail.evidence')}:
              <button type="button" class="link" data-action="open-file" data-id="${evidence.id}">
                ${evidence.fileName}
              </button>
            </p>`
            : ''
        }
        ${
          canDecide
            ? html`<div class="stage-actions">
              <input
                type="text"
                id="note-${row.stageOrder}"
                class="note-input"
                placeholder="${t('detail.notePlaceholder')}"
                aria-label="${t('detail.notePlaceholder')}"
              />
              ${button('approve', t('detail.approve'), 'primary', { order: row.stageOrder })}
              ${button('reject', t('detail.reject'), '', { order: row.stageOrder })}
            </div>`
            : ''
        }
        ${
          canBehalf
            ? html`<div class="stage-actions">
              ${button('behalf', t('detail.behalf'), '', { order: row.stageOrder })}
            </div>`
            : ''
        }
      </div>
    </li>`;
  }

  /** @param {NonNullable<typeof d>} data */
  function approvalsSection(data) {
    const r = data.request;
    const rows = data.currentApprovals;
    const earlier = data.approvals.filter((a) => a.round < r.round);
    const rounds = [...new Set(earlier.map((a) => a.round))].sort((a, b) => b - a);
    // On a phone the section where this person has something to do moves to the top.
    const mine = rows.some(
      (row) =>
        row.status === 'pending' &&
        (!denyReason('decide', user, r, { stage: row, approvals: rows }) ||
          !denyReason('recordOnBehalf', user, r, { stage: row, approvals: rows })),
    );
    return html`<section class="panel${mine ? ' act' : ''}">
      <h3>${t('detail.secApprovals')}${r.round > 1 ? html` <span class="pill">${t('detail.round', { n: r.round })}</span>` : ''}</h3>
      ${
        rows.length === 0
          ? html`<p class="muted">${t('detail.approvalsLocked')}</p>`
          : html`<ol class="timeline">${rows.map((row) => stageItem(data, row))}</ol>`
      }
      ${
        rounds.length > 0
          ? html`<details class="earlier">
            <summary>${t('detail.earlierRounds')}</summary>
            ${rounds.map(
              (n) => html`<div class="earlier-round">
                <p class="lbl">${t('detail.round', { n })}</p>
                <ul class="plain">
                  ${earlier
                    .filter((a) => a.round === n)
                    .map(
                      (a) => html`<li class="small">
                        ${t('detail.approverRole')} —
                        ${
                          a.status === 'approved'
                            ? t('detail.approvedAt', {
                                date: a.decidedAt ? fmtDate(a.decidedAt, lang) : '',
                              })
                            : a.status === 'rejected'
                              ? t('detail.rejectedAt', {
                                  date: a.decidedAt ? fmtDate(a.decidedAt, lang) : '',
                                })
                              : t('detail.notDecided')
                        }
                        ${a.note ? html` · ${t('detail.noteLine', { note: a.note })}` : ''}
                      </li>`,
                    )}
                </ul>
              </div>`,
            )}
          </details>`
          : ''
      }
    </section>`;
  }

  /** @param {NonNullable<typeof d>} data */
  function transferSection(data) {
    const r = data.request;
    let body;
    if (r.status === 'transferred' && r.transferredAt && r.transferredById) {
      body = html`<dl class="kvs">
        ${kv(t('detail.transferredOn'), fmtDate(r.transferredAt, lang))}
        ${kv(t('detail.transferredBy'), nameOf(data, r.transferredById))}
        ${kv(t('detail.bankRef'), html`<bdi dir="ltr" class="mono">${r.transferRef ?? '—'}</bdi>`)}
      </dl>`;
    } else if (r.status === 'ready') {
      body = canDo('markTransferred', user, r)
        ? html`<p class="muted">${t('detail.transferHintOps')}</p>
            <div class="actions-bar">${button('transfer', t('detail.markTransferred'), 'primary')}</div>`
        : html`<p class="muted">${t('detail.transferHintWait')}</p>`;
    } else if (r.status === 'cancelled') {
      body = html`<p class="muted">${t('detail.notTransferred')}</p>`;
    } else {
      body = html`<p class="muted">${t('detail.transferNotReady')}</p>`;
    }
    const mine = r.status === 'ready' && canDo('markTransferred', user, r);
    return html`<section class="panel${mine ? ' act' : ''}">
      <h3>${t('detail.secTransfer')}</h3>
      ${body}
    </section>`;
  }

  /** @param {NonNullable<typeof d>} data */
  function bankStatusSection(data) {
    const b = data.bankStatus;
    if (!b) return '';
    const reasons = b.reasons.map((key) => {
      const item = REASONS.find((x) => x.key === key);
      return item ? labelOf(item, lang) : key;
    });
    return html`<section class="panel">
      <h3>${t('detail.secBankStatus')}</h3>
      <div class="card-pills">
        <span class="pill ${b.state === 'debited' ? 'ok' : b.state === 'review' ? 'warn' : 'info'}"
          >${t(`bank.${b.state}`)}</span
        >
      </div>
      ${
        reasons.length > 0
          ? html`<ul class="plain small">${reasons.map((x) => html`<li>${x}</li>`)}</ul>`
          : ''
      }
      ${b.note ? html`<p class="small">${b.note}</p>` : ''}
      ${
        b.followedUp && b.followedUpById && b.followedUpAt
          ? html`<p class="muted small">
            ${t('detail.followedUp', {
              name: nameOf(data, b.followedUpById),
              date: fmtDate(b.followedUpAt, lang),
            })}
          </p>`
          : ''
      }
      <a class="link" href="#/bank">${t('detail.openBank')}</a>
    </section>`;
  }

  /** @param {NonNullable<typeof d>} data */
  function historySection(data) {
    const entries = [...data.log].reverse();
    return html`<section class="panel">
      <h3>${t('detail.secHistory')}</h3>
      <ol class="history">
        ${entries.map(
          (e) => html`<li>
            <span><b>${nameOf(data, e.actorId)}</b> — ${logLine(data, e)}</span>
            <span class="muted small">${fmtDate(e.createdAt, lang)}</span>
          </li>`,
        )}
      </ol>
    </section>`;
  }

  function draw() {
    if (!d) return;
    mount(
      container,
      html`<article class="detail">
        <a class="link back" href="#/board">‹ ${t('notfound.back')}</a>
        ${
          conflict
            ? html`<div class="banner bad" role="alert">
              ${t('errors.conflict')}
              <button type="button" class="btn small" data-action="reload">${t('detail.reload')}</button>
            </div>`
            : ''
        }
        ${headerSection(d)} ${bannerSection(d)} ${actionsSection(d)} ${detailsSection(d)}
        ${filesSection(d)} ${bankEntrySection(d)} ${approvalsSection(d)} ${transferSection(d)}
        ${bankStatusSection(d)} ${historySection(d)}
      </article>`,
    );
  }

  // ---- actions ----------------------------------------------------------------------------

  /** Runs a service call, then refreshes. A "someone else changed it" error shows the banner. */
  /** @param {() => Promise<any>} fn @param {string} [toastKey] */
  async function act(fn, toastKey) {
    if (busy) return;
    busy = true;
    try {
      await fn();
      if (toastKey) showToast(t(toastKey));
      ctx.afterChange?.();
      conflict = false;
      await load();
    } catch (err) {
      if (isConflict(err)) {
        conflict = true;
        draw();
      } else {
        showToast(errorText(err), { error: true });
      }
    } finally {
      busy = false;
    }
  }

  /** After a dialog closes: nothing happened if it was dismissed. @param {any} result @param {string} toastKey */
  async function afterDialog(result, toastKey) {
    if (!result) return;
    showToast(t(toastKey));
    ctx.afterChange?.();
    conflict = false;
    await load();
  }

  /** @param {HTMLElement} el */
  const stageOf = (el) => {
    const order = Number(el.dataset.order);
    return /** @type {any} */ (d?.currentApprovals.find((a) => a.stageOrder === order));
  };

  const stopClicks = delegate(container, 'click', {
    retry: () => load(),
    reload: () => {
      conflict = false;
      load();
    },
    'open-file': (el) => {
      if (!d) return;
      openFilePreview(ctx, d.request.id, el.dataset.id ?? '').catch((err) =>
        showToast(errorText(err), { error: true }),
      );
    },
    edit: async () => {
      if (d) await afterDialog(await openEditRequest(ctx, d.request), 'detail.saved');
    },
    resubmit: async () => {
      if (!d) return;
      const r = d.request;
      const changed = paymentDetailsChanged(r);
      const ok = await confirmDialog({
        title: t('detail.resubmitTitle'),
        message: changed
          ? t('detail.resubmitChanged')
          : t('detail.resubmitSame', { round: r.round + 1 }),
        confirmLabel: t('detail.resubmitConfirm'),
      });
      if (ok) await act(() => services.resubmit(user, r.id, r.version), 'detail.resubmitted');
    },
    cancel: async () => {
      if (d) await afterDialog(await cancelRequestDialog(ctx, d.request), 'detail.cancelled');
    },
    delete: async () => {
      if (!d) return;
      const r = d.request;
      const ok = await confirmDialog({
        title: t('detail.deleteTitle'),
        message: t('detail.deleteBody'),
        confirmLabel: t('detail.deleteConfirm'),
        danger: true,
      });
      if (!ok) return;
      try {
        await services.deleteRequest(user, r.id);
        showToast(t('detail.deleted'));
        ctx.afterChange?.();
        window.location.hash = '#/board';
      } catch (err) {
        showToast(errorText(err), { error: true });
      }
    },
    print: () => window.print(),
    'mark-bank': () => {
      if (d)
        act(
          () => services.markBankCreated(user, d?.request.id, [], d?.request.version),
          'detail.bankCreated',
        );
    },
    approve: (el) => {
      const stage = stageOf(el);
      if (!d || !stage) return;
      const note = /** @type {HTMLInputElement | null} */ (
        container.querySelector(`#note-${stage.stageOrder}`)
      );
      act(
        () =>
          services.decideStage(
            user,
            d?.request.id,
            stage.stageOrder,
            'approve',
            note?.value.trim() ?? '',
            d?.request.version,
          ),
        'detail.approved',
      );
    },
    reject: async (el) => {
      const stage = stageOf(el);
      if (!d || !stage) return;
      await afterDialog(
        await rejectStage(ctx, d.request, stage, t('detail.approverRole')),
        'detail.rejected',
      );
    },
    behalf: async (el) => {
      const stage = stageOf(el);
      if (!d || !stage) return;
      const names = { stageName: t('detail.approverRole'), approverName: t('detail.approverRole') };
      await afterDialog(
        await recordOnBehalfDialog(ctx, d.request, stage, names),
        'detail.behalfDone',
      );
    },
    transfer: async () => {
      if (d)
        await afterDialog(await markTransferredDialog(ctx, d.request), 'detail.transferredDone');
    },
  });

  /** Files added straight from the page: extra documents, and the bank's proof. @param {Event} event */
  const onChange = async (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !d) return;
    const kind =
      input.id === 'add-docs' ? 'payment_doc' : input.id === 'add-proof' ? 'bank_proof' : null;
    if (!kind) return;
    const files = filesOf(input);
    input.value = '';
    if (files.length === 0) return;
    const id = d.request.id;
    await act(() => services.addAttachment(user, id, kind, files), 'detail.fileAdded');
  };
  container.addEventListener('change', onChange);

  load();

  return () => {
    alive = false;
    stopClicks();
    container.removeEventListener('change', onChange);
  };
}
