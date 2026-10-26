// @ts-check
// S6 - bank-side status: requests that are Ready or Transferred, with what is happening at the
// bank. Bank operations edit (status, reasons, note, follow-up); everyone else reads.

import { html } from '../ui/html.js';
import { mount, delegate } from '../ui/dom.js';
import { showToast } from '../ui/toast.js';
import { errorText, filesOf, isConflict } from '../ui/errors.js';
import { openFilePreview } from '../ui/filePreview.js';
import { t, getLang } from '../i18n/index.js';
import { fmtAmount, fmtDate, fmtSize } from '../i18n/format.js';
import { personName } from '../i18n/labels.js';
import { BANK_STATES, REASONS, labelOf } from '../data/lookups.js';
import { canDo } from '../domain/permissions.js';
import { defaultBankFilters, filterBankItems, hasActiveBankFilters } from '../domain/bankList.js';
import { requestHash } from '../router.js';

const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

/** Remembered while the page stays open, like the board's filters. */
let filters = defaultBankFilters();
/** @type {string | null} */
let selectedId = null;

/** @param {string} state */
const pillClass = (state) => (state === 'debited' ? 'ok' : state === 'review' ? 'warn' : 'info');

/**
 * @param {HTMLElement} container
 * @param {{services: any, user: import('../data/typedefs.js').User}} ctx
 * @returns {() => void}  cleanup
 */
export function render(container, ctx) {
  const { services, user } = ctx;
  const lang = getLang();
  let alive = true;
  let busy = false;
  let conflict = false;
  /** @type {Awaited<ReturnType<typeof services.getBankList>> | null} */
  let data = null;
  /** What the person is typing in the editor. Kept here, not in the page, so it survives redraws. */
  let draft = {
    state: 'executing',
    reasons: /** @type {string[]} */ ([]),
    note: '',
    followedUp: false,
  };
  /** The request the draft was taken from. */
  let draftFor = '';

  mount(
    container,
    html`<section class="bank-page">
      <div class="toolbar">
        <input
          type="search"
          id="bank-search"
          placeholder="${t('bank.search')}"
          aria-label="${t('bank.search')}"
          autocomplete="off"
        />
        <select id="bank-state" aria-label="${t('bank.allStates')}">
          <option value="">${t('bank.allStates')}</option>
          ${BANK_STATES.map((s) => html`<option value="${s}">${t(`bank.${s}`)}</option>`)}
        </select>
        <label class="check"
          ><input type="checkbox" id="bank-notfollowed" /> ${t('bank.onlyNotFollowed')}</label
        >
      </div>
      <div id="bank-body"></div>
    </section>`,
  );

  /** @param {string} id */
  const el = (id) => /** @type {any} */ (container.querySelector(`#${id}`));
  el('bank-search').value = filters.search;
  el('bank-state').value = filters.state;
  el('bank-notfollowed').checked = filters.notFollowedUp;
  const body = el('bank-body');

  /** @param {string} id */
  const nameOf = (id) => (data?.users[id] ? personName(data.users[id], lang) : '');

  /** @param {string} key */
  const reasonLabel = (key) => {
    const item = REASONS.find((x) => x.key === key);
    return item ? labelOf(item, lang) : key;
  };

  function selectedItem() {
    return data?.items.find((i) => i.request.id === selectedId) ?? null;
  }

  /** Start a fresh draft from what is saved. */
  function resetDraft() {
    const item = selectedItem();
    if (!item) return;
    const b = item.bankStatus;
    draft = { state: b.state, reasons: [...b.reasons], note: b.note, followedUp: b.followedUp };
    draftFor = item.request.id;
  }

  // ---- drawing ----------------------------------------------------------------------------

  function showError() {
    mount(
      body,
      html`<div class="panel state error" role="alert">
        <p>${t('bank.error')}</p>
        <button type="button" class="btn" data-action="retry">${t('common.retry')}</button>
      </div>`,
    );
  }

  /** @param {NonNullable<typeof data>['items'][number]} item */
  function listRow({ request: r, bankStatus: b }) {
    return html`<button
      type="button"
      class="bank-row${r.id === selectedId ? ' selected' : ''}"
      data-action="select"
      data-id="${r.id}"
      aria-pressed="${r.id === selectedId ? 'true' : 'false'}"
    >
      <span class="card-ref mono">${r.ref}</span>
      <span class="bank-row-name">${r.beneficiary}</span>
      <span class="mono"><bdi dir="ltr">${fmtAmount(r.amount, r.currency)}</bdi></span>
      <span class="card-pills">
        <span class="pill ${pillClass(b.state)}">${t(`bank.${b.state}`)}</span>
        ${b.followedUp ? html`<span class="pill ok">${t('bank.followedTag')}</span>` : ''}
      </span>
    </button>`;
  }

  /** @param {import('../data/typedefs.js').AttachmentMeta[]} proofs */
  function proofList(proofs) {
    if (proofs.length === 0) return '';
    return html`<ul class="files">
      ${proofs.map(
        (f) => html`<li>
          <button type="button" class="link file-name" data-action="open-file" data-id="${f.id}">
            ${f.fileName}
          </button>
          <span class="sz mono">${fmtSize(f.sizeBytes)}</span>
        </li>`,
      )}
    </ul>`;
  }

  /** @param {NonNullable<typeof data>['items'][number]} item */
  function editor({ request: r, bankStatus: b, history, debitProofs }) {
    const canEdit = canDo('setBankStatus', user, r);
    const reasons = canEdit ? draft.reasons : b.reasons;
    const state = canEdit ? draft.state : b.state;
    const lines =
      history.length === 0
        ? html`<p class="muted small">${t('bank.historyNone')}</p>`
        : html`<ol class="history">
            ${[...history].reverse().map(
              (e) => html`<li>
                <span
                  ><b>${nameOf(e.actorId)}</b> ${t('bank.historyLine', { state: t(`bank.${e.details.to}`) })}${
                    Array.isArray(e.details.reasons) && e.details.reasons.length > 0
                      ? html` · ${e.details.reasons.map(reasonLabel).join('، ')}`
                      : ''
                  }${e.details.followedUp ? html` · ${t('bank.followedTag')}` : ''}</span
                >
                <span class="muted small">${fmtDate(e.createdAt, lang)}</span>
              </li>`,
            )}
          </ol>`;

    const form = canEdit
      ? html`<fieldset class="bank-field">
            <legend>${t('bank.fieldStatus')}</legend>
            <div class="bank-choices">
              ${BANK_STATES.map(
                (s) => html`<label class="check"
                  ><input type="radio" name="bank-state-choice" value="${s}" ${
                    draft.state === s ? 'checked' : ''
                  } />
                  ${t(`bank.${s}`)}</label
                >`,
              )}
            </div>
          </fieldset>
          ${
            draft.state === 'review'
              ? html`<fieldset class="bank-field">
                  <legend>${t('bank.fieldReasons')}</legend>
                  <div class="bank-choices stacked">
                    ${REASONS.map(
                      (x) => html`<label class="check"
                        ><input type="checkbox" name="bank-reason" value="${x.key}" ${
                          draft.reasons.includes(x.key) ? 'checked' : ''
                        } />
                        ${labelOf(x, lang)}</label
                      >`,
                    )}
                  </div>
                  <p class="err" id="bank-reason-err" role="alert"></p>
                </fieldset>`
              : ''
          }
          ${
            draft.state === 'debited'
              ? html`<div class="field">
                  <label for="bank-proof-file">${t('bank.fieldProof')}</label>
                  <input type="file" id="bank-proof-file" multiple accept="${FILE_ACCEPT}" />
                  ${proofList(debitProofs)}
                  ${
                    debitProofs.length === 0
                      ? html`<span class="muted small">${t('validation.debitProof')}</span>`
                      : ''
                  }
                  <p class="err" id="bank-proof-err" role="alert"></p>
                </div>`
              : ''
          }
          <div class="field">
            <label for="bank-note">${t('bank.fieldNote')}</label>
            <textarea id="bank-note" rows="3" maxlength="500">${draft.note}</textarea>
          </div>
          <label class="check"
            ><input type="checkbox" id="bank-followed" ${draft.followedUp ? 'checked' : ''} />
            ${t('bank.followedLabel')}</label
          >
          ${
            b.followedUp && b.followedUpById && b.followedUpAt
              ? html`<p class="muted small">
                ${t('detail.followedUp', {
                  name: nameOf(b.followedUpById),
                  date: fmtDate(b.followedUpAt, lang),
                })}
              </p>`
              : ''
          }
          <div class="stage-actions">
            <button type="button" class="btn primary" id="bank-save" data-action="save">
              ${t('bank.save')}
            </button>
            <a class="btn" href="${requestHash(r.ref)}">${t('bank.openRequest')}</a>
          </div>`
      : html`<p><span class="pill ${pillClass(state)}">${t(`bank.${state}`)}</span></p>
          ${
            reasons.length > 0
              ? html`<ul class="plain small">${reasons.map((k) => html`<li>${reasonLabel(k)}</li>`)}</ul>`
              : ''
          }
          ${state === 'debited' ? proofList(debitProofs) : ''}
          ${b.note ? html`<p class="small">${b.note}</p>` : ''}
          ${
            b.followedUp && b.followedUpById && b.followedUpAt
              ? html`<p class="muted small">
                ${t('detail.followedUp', {
                  name: nameOf(b.followedUpById),
                  date: fmtDate(b.followedUpAt, lang),
                })}
              </p>`
              : ''
          }
          <p class="muted small">${t('bank.readOnly')}</p>
          <div class="stage-actions">
            <a class="btn" href="${requestHash(r.ref)}">${t('bank.openRequest')}</a>
          </div>`;

    return html`<section class="panel bank-editor" aria-live="polite">
      <h2>${t('bank.editorTitle', { ref: r.ref })}</h2>
      <p class="muted small">
        ${r.beneficiary} · <bdi dir="ltr">${fmtAmount(r.amount, r.currency)}</bdi>
      </p>
      ${
        conflict
          ? html`<div class="banner bad" role="alert">
            ${t('errors.conflict')}
            <button type="button" class="btn small" data-action="retry">${t('bank.reload')}</button>
          </div>`
          : ''
      }
      ${form}
      <h3>${t('bank.history')}</h3>
      ${lines}
    </section>`;
  }

  /** Draws the list and the editor. The search box and filters are never redrawn. */
  function draw() {
    if (!data) return;
    if (data.items.length === 0) {
      mount(
        body,
        html`<div class="panel state">
          <h2>${t('bank.emptyTitle')}</h2>
          <p class="muted">${t('bank.emptyBody')}</p>
        </div>`,
      );
      return;
    }
    const shown = filterBankItems(data.items, filters);
    if (shown.length === 0) {
      mount(
        body,
        html`<div class="panel state">
          <p>${t('bank.noResults')}</p>
          ${
            hasActiveBankFilters(filters)
              ? html`<button type="button" class="btn" data-action="clear">
                ${t('board.clearFilters')}
              </button>`
              : ''
          }
        </div>`,
      );
      return;
    }
    // Keep the selection if it is still listed, otherwise take the first row.
    if (!shown.some((i) => i.request.id === selectedId)) selectedId = shown[0].request.id;
    if (draftFor !== selectedId) resetDraft();
    const current = shown.find((i) => i.request.id === selectedId) ?? shown[0];
    mount(
      body,
      html`<div class="bank-split">
        <div class="bank-list">
          <p class="queue-count">${t('bank.count', { n: shown.length })}</p>
          ${shown.map(listRow)}
        </div>
        ${editor(current)}
      </div>`,
    );
  }

  /** Only the editor changes (a status or reason was ticked). */
  function drawEditor() {
    const item = selectedItem();
    const slot = container.querySelector('.bank-editor');
    if (!item || !slot) return draw();
    const wrap = document.createElement('div');
    mount(wrap, editor(item));
    slot.replaceWith(/** @type {Element} */ (wrap.firstElementChild));
  }

  async function load() {
    try {
      const result = await services.getBankList(user);
      if (!alive) return;
      data = result;
      conflict = false;
      draftFor = ''; // take a fresh draft from what is saved
      draw();
    } catch (err) {
      console.error(err);
      if (alive) showError();
    }
  }

  // ---- actions ----------------------------------------------------------------------------

  async function save() {
    const item = selectedItem();
    if (!item || busy) return;
    if (draft.state === 'review' && draft.reasons.length === 0) {
      const slot = el('bank-reason-err');
      if (slot) slot.textContent = t('validation.reviewReasons');
      return;
    }
    const proofInput = el('bank-proof-file');
    const proofFiles = draft.state === 'debited' && proofInput ? filesOf(proofInput) : [];
    if (draft.state === 'debited' && proofFiles.length === 0 && item.debitProofs.length === 0) {
      const slot = el('bank-proof-err');
      if (slot) slot.textContent = t('validation.debitProof');
      return;
    }
    busy = true;
    const button = el('bank-save');
    if (button) {
      button.disabled = true;
      button.textContent = t('common.saving');
    }
    try {
      await services.setBankStatus(user, item.request.id, draft, item.request.version, proofFiles);
      showToast(t('bank.saved'));
      await load();
    } catch (err) {
      if (isConflict(err)) {
        conflict = true;
        drawEditor();
      } else {
        showToast(errorText(err), { error: true });
        if (button) {
          button.disabled = false;
          button.textContent = t('bank.save');
        }
      }
    } finally {
      busy = false;
    }
  }

  const stopClicks = delegate(container, 'click', {
    select: (btn) => {
      selectedId = btn.dataset.id ?? null;
      conflict = false;
      draw();
    },
    'open-file': (btn) => {
      const item = selectedItem();
      if (!item) return;
      openFilePreview(ctx, item.request.id, btn.dataset.id ?? '').catch((err) =>
        showToast(errorText(err), { error: true }),
      );
    },
    clear: () => {
      filters = defaultBankFilters();
      el('bank-search').value = '';
      el('bank-state').value = '';
      el('bank-notfollowed').checked = false;
      draw();
    },
    retry: () => load(),
    save: () => {
      save();
    },
  });

  // Text reacts to typing only; selects and ticks react to "change" (see CLAUDE.md: redrawing on
  // a text box's "change" would drop the next click).
  /** @param {Event} event */
  const onInput = (event) => {
    const target = /** @type {HTMLInputElement} */ (event.target);
    if (target.id === 'bank-search') {
      if (filters.search === target.value) return;
      filters.search = target.value;
      draw();
    } else if (target.id === 'bank-note') {
      draft.note = target.value; // no redraw while typing
    }
  };
  /** @param {Event} event */
  const onChange = (event) => {
    const target = /** @type {HTMLInputElement} */ (event.target);
    if (target.id === 'bank-state') {
      filters.state = /** @type {any} */ (target.value);
      draw();
    } else if (target.id === 'bank-notfollowed') {
      filters.notFollowedUp = target.checked;
      draw();
    } else if (target.name === 'bank-state-choice') {
      draft.state = target.value;
      drawEditor();
    } else if (target.name === 'bank-reason') {
      draft.reasons = target.checked
        ? [...draft.reasons, target.value]
        : draft.reasons.filter((k) => k !== target.value);
      const slot = el('bank-reason-err');
      if (slot && draft.reasons.length > 0) slot.textContent = '';
    } else if (target.id === 'bank-followed') {
      draft.followedUp = target.checked;
    } else if (target.id === 'bank-proof-file') {
      const slot = el('bank-proof-err');
      if (slot && target.files && target.files.length > 0) slot.textContent = '';
    }
  };
  container.addEventListener('input', onInput);
  container.addEventListener('change', onChange);

  mount(body, html`<p class="muted">${t('common.loading')}</p>`);
  load();

  return () => {
    alive = false;
    stopClicks();
    container.removeEventListener('input', onInput);
    container.removeEventListener('change', onChange);
  };
}
