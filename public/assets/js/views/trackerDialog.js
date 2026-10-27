// @ts-check
// The "Tracker" dialog on a request: where the request is in its journey, as six connected
// steps (submitted, entered in the bank, senior approval, manager approval, transfer, bank
// confirmation). The steps come from domain/workflow.js; this file only draws them.

import { html } from '../ui/html.js';
import { openDialog } from '../ui/dialog.js';
import { t, getLang } from '../i18n/index.js';
import { fmtDate } from '../i18n/format.js';
import { personName } from '../i18n/labels.js';
import { workflowSteps } from '../domain/workflow.js';
import {
  alertIcon,
  badgeIcon,
  bankIcon,
  checkIcon,
  crossIcon,
  docIcon,
  pauseIcon,
  personCheckIcon,
  sendIcon,
  shieldCheckIcon,
} from '../ui/icons.js';

/** @typedef {import('../domain/workflow.js').WorkflowStep} WorkflowStep */
/** @typedef {import('../domain/workflow.js').StepKey} StepKey */
/** @typedef {import('../ui/html.js').SafeHtml} SafeHtml */

/** @type {Record<StepKey, () => SafeHtml>} */
const STEP_ICON = {
  submitted: docIcon,
  bank: bankIcon,
  senior: personCheckIcon,
  manager: shieldCheckIcon,
  transfer: sendIcon,
  debit: badgeIcon,
};

/** Who does each step. @type {Record<StepKey, string>} */
const STEP_ROLE = {
  submitted: 'role.creator',
  bank: 'role.bank_ops',
  senior: 'role.senior_approver',
  manager: 'role.manager_approver',
  transfer: 'role.bank_ops',
  debit: 'tracker.role.bank',
};

/**
 * @param {{request: import('../data/typedefs.js').Request,
 *   currentApprovals: import('../data/typedefs.js').Approval[],
 *   bankStatus: import('../data/typedefs.js').BankStatus | null,
 *   users: Record<string, import('../data/typedefs.js').User>}} data  the request page's data
 */
export function openTracker(data) {
  const lang = getLang();
  const r = data.request;
  const wf = workflowSteps({
    request: r,
    approvals: data.currentApprovals,
    bankStatus: data.bankStatus,
  });
  /** @param {string | null} id */
  const name = (id) => (id && data.users[id] ? personName(data.users[id], lang) : '—');
  /** @param {string | null} iso */
  const when = (iso) => (iso ? html`<bdi dir="ltr" class="mono">${fmtDate(iso, lang)}</bdi>` : '');

  /** The node's symbol: the step's own icon until something happened to it. @param {WorkflowStep} s */
  const nodeIcon = (s) =>
    s.state === 'done'
      ? checkIcon()
      : s.state === 'rejected'
        ? crossIcon()
        : s.state === 'stopped'
          ? pauseIcon()
          : s.state === 'attention'
            ? alertIcon()
            : STEP_ICON[s.key]();

  /** The person line under a step. @param {WorkflowStep} s @returns {string} */
  function who(s) {
    if (s.state === 'done' || s.state === 'rejected') {
      if (s.key === 'debit') return '';
      return s.onBehalf ? t('tracker.byOnBehalf', { name: name(s.actorId) }) : name(s.actorId);
    }
    if (s.key === 'senior' && s.assignedToId) {
      return s.state === 'current'
        ? t('tracker.waitingOn', { name: name(s.assignedToId) })
        : name(s.assignedToId);
    }
    if (s.key === 'manager' && s.state === 'current') return t('tracker.anyManager');
    if (s.state === 'attention') return t('tracker.bankHold');
    return '';
  }

  /** How the line after step i looks: finished, flowing into the current step, or not yet. @param {number} i */
  function linkAfter(i) {
    const here = wf.steps[i];
    const next = wf.steps[i + 1];
    if (!next || here.state !== 'done') return 'idle';
    if (next.state === 'done') return 'done';
    if (next.state === 'current' || next.state === 'attention') return 'flow';
    if (next.state === 'rejected') return 'bad';
    return 'idle';
  }

  // The headline: where things stand, in words.
  const current = wf.steps.find((s) => s.state === 'current' || s.state === 'attention');
  /** @type {{tone: string, text: string, sub: SafeHtml | string}} */
  let summary;
  if (r.status === 'cancelled') {
    summary = { tone: 'mute', text: t('tracker.cancelled'), sub: t('tracker.reason', { reason: r.closedReason ?? '' }) };
  } else if (r.status === 'returned') {
    summary = {
      tone: 'bad',
      text: t('tracker.returned', { name: name(r.createdById) }),
      sub: t('tracker.reason', { reason: r.closedReason ?? '' }),
    };
  } else if (wf.finished) {
    summary = { tone: 'ok', text: t('tracker.finished'), sub: '' };
  } else if (current?.state === 'attention') {
    summary = { tone: 'warn', text: t('tracker.bankHold'), sub: '' };
  } else {
    const holder =
      current?.key === 'senior'
        ? name(current.assignedToId)
        : current?.key === 'manager'
          ? t('tracker.anyManager')
          : current?.key === 'debit'
            ? t('tracker.role.bank')
            : t('role.bank_ops');
    summary = {
      tone: 'info',
      text: t('tracker.nowWith', { who: holder }),
      sub: html`${t('tracker.since', { date: '' })}${when(r.statusChangedAt)}`,
    };
  }
  const pct = Math.round((wf.done / wf.total) * 100);
  const progressText = t('tracker.progress', { done: wf.done, total: wf.total });

  const body = html`<div class="tracker">
    <div class="tracker-summary" data-tone="${summary.tone}">
      <div class="tracker-headline">
        <p class="tracker-now">${summary.text}</p>
        ${summary.sub ? html`<p class="tracker-sub">${summary.sub}</p>` : ''}
      </div>
      <div class="tracker-progress">
        <span class="tracker-progress-text">${progressText}</span>
        <div
          class="tracker-bar"
          role="progressbar"
          aria-label="${progressText}"
          aria-valuemin="0"
          aria-valuemax="${wf.total}"
          aria-valuenow="${wf.done}"
        >
          <span style="--p: ${pct}%"></span>
        </div>
      </div>
    </div>
    <ol class="wf">
      ${wf.steps.map(
        (s, i) => html`<li
          class="wf-step"
          data-state="${s.state}"
          data-link="${linkAfter(i)}"
          style="--i: ${i}"
          ${s.state === 'current' ? html`aria-current="step"` : ''}
        >
          <span class="wf-node" aria-hidden="true">${nodeIcon(s)}</span>
          <div class="wf-text">
            <p class="wf-title">${t(`tracker.step.${s.key}`)}</p>
            <p class="wf-role">${t(STEP_ROLE[s.key])}</p>
            <span class="wf-state">${t(`tracker.state.${s.state}`)}</span>
            ${who(s) ? html`<p class="wf-who">${who(s)}</p>` : ''}
            ${s.at && (s.state === 'done' || s.state === 'rejected') ? html`<p class="wf-when">${when(s.at)}</p>` : ''}
            ${
              s.reference && s.state === 'done'
                ? html`<p class="wf-when">${t('tracker.ref', { ref: '' })}<bdi dir="ltr" class="mono">${s.reference}</bdi></p>`
                : ''
            }
          </div>
        </li>`,
      )}
    </ol>
  </div>`;

  const dlg = openDialog({ eyebrow: r.ref, title: t('tracker.title'), body, wide: true });
  dlg.el.classList.add('tracker-dialog');
  return dlg.closed;
}
