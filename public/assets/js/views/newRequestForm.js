// @ts-check
// S3 - the "New request" dialog, also used to edit a request that is Submitted or Returned.
// Checks each field as the person leaves it, notes that one approval is needed, and asks
// before throwing away what was typed.

import { html } from '../ui/html.js';
import { mount, delegate } from '../ui/dom.js';
import { openDialog, confirmDialog } from '../ui/dialog.js';
import { t, getLang } from '../i18n/index.js';
import { CATEGORIES, CURRENCIES, labelOf } from '../data/lookups.js';
import { RuleError } from '../domain/errors.js';
import { parseAmountInput, toSar } from '../domain/money.js';
import { validateFile, validateRequestInput } from '../domain/validation.js';
import { fmtAmount, fmtSize } from '../i18n/format.js';
import { personName } from '../i18n/labels.js';

/** Fields that have a message line under them. */
const FIELDS = [
  'beneficiary',
  'bank',
  'iban',
  'category',
  'movement',
  'swiftCode',
  'currency',
  'amount',
  'purpose',
];

/** @typedef {{services: any, user: import('../data/typedefs.js').User}} Ctx */

/**
 * Opens the dialog empty. Resolves with the created request, or undefined when it was closed.
 * @param {Ctx} ctx
 */
export const openNewRequest = (ctx) => openRequestForm(ctx);

/**
 * Opens the dialog filled with an existing request. Resolves with the saved request, or
 * undefined when it was closed.
 * @param {Ctx} ctx @param {import('../data/typedefs.js').Request} request
 */
export const openEditRequest = (ctx, request) => openRequestForm(ctx, request);

/**
 * @param {Ctx} ctx
 * @param {import('../data/typedefs.js').Request} [existing]  set when editing
 */
async function openRequestForm(ctx, existing) {
  const editing = !!existing;
  const lang = getLang();
  const form = await ctx.services.getFormContext(ctx.user);
  const currencies = CURRENCIES.filter((c) => c in form.rates);
  /** @type {File[]} */
  let files = [];
  let dirty = false;
  let docError = '';
  const submitLabel = editing ? t('form.saveChanges') : t('form.submit');

  /** @param {string} name @param {string} text @param {boolean} [required] */
  const label = (name, text, required = false) =>
    html`<label for="nr-${name}"
      >${text}${required ? html`<span class="req" aria-hidden="true"> *</span>` : ''}</label
    >`;
  /** @param {string} name */
  const err = (name) => html`<p class="err" id="err-${name}"></p>`;

  const body = html`<form id="nr-form" novalidate>
    <div class="form-grid">
      <div class="field full">
        <span class="lbl">${t('form.requestedBy')}</span>
        <div class="readonly">
          ${personName(ctx.user, lang)} <span class="hint">· ${t('form.requestedByHint')}</span>
        </div>
      </div>
      <div class="field">
        ${label('beneficiary', t('form.beneficiary'), true)}
        <input type="text" id="nr-beneficiary" name="beneficiary" autocomplete="off" aria-describedby="err-beneficiary" autofocus />
        ${err('beneficiary')}
      </div>
      <div class="field">
        ${label('bank', t('form.bank'))}
        <input type="text" id="nr-bank" name="bank" autocomplete="off" aria-describedby="err-bank" />
        ${err('bank')}
      </div>
      <div class="field">
        ${label('iban', t('form.iban'), true)}
        <input type="text" id="nr-iban" name="iban" class="mono" dir="ltr" placeholder="SAxx xxxx xxxx xxxx xxxx xxxx" autocomplete="off" aria-describedby="err-iban" />
        ${err('iban')}
      </div>
      <fieldset class="field">
        <legend class="lbl">${t('form.movement')}<span class="req" aria-hidden="true"> *</span></legend>
        <div class="radios">
          <label class="radio"><input type="radio" name="movement" value="internal" checked /> ${t('movement.internal')}</label>
          <label class="radio"><input type="radio" name="movement" value="external" /> ${t('movement.external')}</label>
        </div>
        ${err('movement')}
      </fieldset>
      <div class="field" id="nr-swift-wrap" hidden>
        ${label('swiftCode', t('form.swiftCode'), true)}
        <input type="text" id="nr-swiftCode" name="swiftCode" class="mono" dir="ltr" placeholder="AAAABBCCXXX" autocomplete="off" aria-describedby="err-swiftCode" />
        ${err('swiftCode')}
      </div>
      <div class="field full">
        ${label('category', t('form.category'), true)}
        <select id="nr-category" name="category" aria-describedby="err-category">
          <option value="">${t('form.chooseCategory')}</option>
          ${CATEGORIES.map((c) => html`<option value="${c.key}">${labelOf(c, lang)}</option>`)}
        </select>
        ${err('category')}
      </div>
      <div class="field">
        ${label('currency', t('form.currency'), true)}
        <select id="nr-currency" name="currency" aria-describedby="err-currency">
          ${currencies.map((c) => html`<option value="${c}">${c}</option>`)}
        </select>
        ${err('currency')}
      </div>
      <div class="field">
        ${label('amount', t('form.amount'), true)}
        <input type="text" id="nr-amount" name="amount" class="mono" dir="ltr" inputmode="decimal" placeholder="0.00" autocomplete="off" aria-describedby="err-amount" />
        ${err('amount')}
      </div>
      <div class="field full"><p class="tier" id="nr-tier" aria-live="polite"></p></div>
      <div class="field full">
        ${label('purpose', t('form.purpose'))}
        <textarea id="nr-purpose" name="purpose" rows="2" aria-describedby="err-purpose"></textarea>
        ${err('purpose')}
      </div>
      ${
        editing
          ? html`<p class="field full muted small">${t('form.editDocsHint')}</p>`
          : html`<div class="field full">
        <span class="lbl">${t('form.docs')}<span class="req" aria-hidden="true"> *</span></span>
        <div class="drop-wrap">
          <input type="file" id="nr-file" class="visually-hidden" multiple
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" aria-describedby="err-paymentDocs" />
          <label class="drop" for="nr-file" id="nr-drop">${t('form.drop', { mb: form.maxFileMb })}</label>
        </div>
        <div id="nr-files"></div>
        ${err('paymentDocs')}
      </div>`
      }
    </div>
    <p class="form-error" id="nr-formerror" role="alert" hidden></p>
    <div class="modal-actions">
      <button type="submit" class="btn primary" id="nr-submit">${submitLabel}</button>
      <button type="button" class="btn" data-action="cancel">${t('common.cancel')}</button>
    </div>
  </form>`;

  const dlg = openDialog({
    eyebrow: existing ? existing.ref : t('form.eyebrow'),
    title: editing ? t('form.editTitle') : t('form.title'),
    body,
    wide: true,
    onCancel: async () =>
      !dirty ||
      confirmDialog({
        title: t('discard.title'),
        message: t('discard.body'),
        confirmLabel: t('discard.confirm'),
        cancelLabel: t('discard.keep'),
        danger: true,
      }),
  });
  const root = dlg.el;
  /** @param {string} id */
  const q = (id) => /** @type {any} */ (root.querySelector(`#${id}`));

  if (existing) {
    q('nr-beneficiary').value = existing.beneficiary;
    q('nr-bank').value = existing.bank;
    q('nr-iban').value = existing.iban;
    q('nr-category').value = existing.category;
    q('nr-currency').value = existing.currency;
    q('nr-amount').value = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(existing.amount);
    q('nr-purpose').value = existing.purpose;
    q('nr-swiftCode').value = existing.swiftCode;
    const radio = /** @type {HTMLInputElement | null} */ (
      root.querySelector(`input[name="movement"][value="${existing.movement}"]`)
    );
    if (radio) radio.checked = true;
  }

  /** Shows the SWIFT field only for external transfers. */
  function updateSwiftVisibility() {
    const external =
      root.querySelector('input[name="movement"]:checked')?.getAttribute('value') === 'external';
    q('nr-swift-wrap').hidden = !external;
    if (!external) {
      q('nr-swiftCode').value = '';
      setError('swiftCode', undefined);
    }
  }

  // ---- reading and checking -----------------------------------------------------------------

  const values = () => ({
    beneficiary: q('nr-beneficiary').value,
    bank: q('nr-bank').value,
    iban: q('nr-iban').value,
    category: q('nr-category').value,
    movement: root.querySelector('input[name="movement"]:checked')?.getAttribute('value') ?? '',
    swiftCode: q('nr-swiftCode').value,
    currency: q('nr-currency').value,
    amount: parseAmountInput(q('nr-amount').value),
    purpose: q('nr-purpose').value,
  });

  /** @param {string} name @param {string} text */
  function setErrorText(name, text) {
    const line = q(`err-${name}`);
    if (line) line.textContent = text;
    const control = root.querySelector(`[name="${name}"]`);
    if (control && name !== 'movement')
      control.setAttribute('aria-invalid', text ? 'true' : 'false');
  }
  /** @param {string} name @param {string | undefined} key */
  const setError = (name, key) => setErrorText(name, key ? t(key) : '');
  const validateAll = () => validateRequestInput(values(), { rates: form.rates });

  /** @param {Record<string, string>} errors */
  function showAll(errors) {
    for (const name of FIELDS) setError(name, errors[name]);
    if (errors.paymentDocs) docError = t(errors.paymentDocs);
    setErrorText('paymentDocs', docError);
  }

  // ---- live parts ---------------------------------------------------------------------------

  function updateTier() {
    const amount = parseAmountInput(q('nr-amount').value);
    const currency = q('nr-currency').value;
    const rate = form.rates[currency];
    const tier = q('nr-tier');
    if (!(amount > 0) || !rate || currency === 'SAR') {
      tier.textContent = '';
      return;
    }
    const sar = toSar(amount, rate);
    tier.textContent = t('tier.converted', { sar: fmtAmount(sar, 'SAR'), rate: String(rate) });
  }

  function renderFiles() {
    if (!q('nr-files')) return; // editing: documents are added from the request page
    mount(
      q('nr-files'),
      html`${
        files.length > 0
          ? html`<ul class="files">
            ${files.map(
              (f, i) => html`<li>
                <span class="file-name">${f.name}</span>
                <span class="sz mono">${fmtSize(f.size)}</span>
                <button type="button" class="link" data-action="remove-file" data-index="${i}">
                  ${t('form.remove')}
                </button>
              </li>`,
            )}
          </ul>`
          : ''
      }`,
    );
  }

  /** @param {Iterable<File>} list */
  function addFiles(list) {
    /** @type {string[]} */
    const problems = [];
    for (const file of list) {
      const key = validateFile(
        { name: file.name, mime: file.type, size: file.size },
        form.maxFileMb,
      );
      if (key) problems.push(`${file.name}: ${t(key)}`);
      else files.push(file);
    }
    dirty = true;
    docError = problems.join(' · ');
    setErrorText('paymentDocs', docError);
    renderFiles();
  }

  // ---- events -------------------------------------------------------------------------------

  /** @param {Event} event */
  function fieldOf(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const name = target.getAttribute?.('name') ?? '';
    return FIELDS.includes(name) ? name : '';
  }

  root.addEventListener('input', (event) => {
    dirty = true;
    const name = fieldOf(event);
    if (!name) return;
    if (name === 'amount' || name === 'currency') updateTier();
    // Once a message is showing, clear it as soon as the value is fixed.
    if (q(`err-${name}`)?.textContent) setError(name, validateAll()[name]);
  });
  root.addEventListener('change', (event) => {
    dirty = true;
    const name = fieldOf(event);
    if (name === 'currency') updateTier();
    if (name === 'movement') updateSwiftVisibility();
    if (name === 'category' || name === 'currency' || name === 'movement') {
      setError(name, validateAll()[name]);
    }
    const target = /** @type {HTMLInputElement} */ (event.target);
    if (target.id === 'nr-file') {
      addFiles(Array.from(target.files ?? []));
      target.value = ''; // so the same file can be chosen again
    }
  });
  root.addEventListener('focusout', (event) => {
    const name = fieldOf(event);
    if (!name || name === 'movement') return;
    if (name === 'amount') {
      const n = parseAmountInput(q('nr-amount').value);
      if (n > 0 && Math.round(n * 100) === n * 100) {
        q('nr-amount').value = new Intl.NumberFormat('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(n);
      }
    }
    // Only complain about a field the person has actually typed in or chosen. Empty required
    // fields are reported when they press "Create request".
    const control = /** @type {HTMLInputElement} */ (event.target);
    if (control.value.trim() !== '') setError(name, validateAll()[name]);
  });

  const drop = q('nr-drop');
  if (drop) {
    for (const type of ['dragenter', 'dragover']) {
      drop.addEventListener(type, (/** @type {Event} */ e) => {
        e.preventDefault();
        drop.classList.add('over');
      });
    }
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (/** @type {DragEvent} */ e) => {
      e.preventDefault();
      drop.classList.remove('over');
      addFiles(Array.from(e.dataTransfer?.files ?? []));
    });
  }

  delegate(root, 'click', {
    cancel: () => dlg.requestClose(),
    'remove-file': (btn) => {
      files = files.filter((_, i) => i !== Number(btn.dataset.index));
      docError = '';
      setErrorText('paymentDocs', '');
      renderFiles();
    },
  });

  /** @param {string} text */
  function setFormError(text) {
    const line = q('nr-formerror');
    line.textContent = text;
    line.hidden = !text;
  }

  // Hide the red "fix the highlighted fields" banner as soon as nothing is wrong any more.
  function settleFormError() {
    if (q('nr-formerror').hidden) return;
    const stillWrong = Array.from(root.querySelectorAll('.err')).some((e) => e.textContent?.trim());
    if (!stillWrong) setFormError('');
  }
  for (const type of ['input', 'change', 'focusout', 'click', 'drop']) {
    root.addEventListener(type, settleFormError);
  }

  q('nr-form').addEventListener('submit', async (/** @type {Event} */ event) => {
    event.preventDefault();
    setFormError('');
    const errors = validateAll();
    if (!editing && files.length === 0 && !docError) errors.paymentDocs = 'validation.paymentDocs';
    showAll(errors);
    if (Object.keys(errors).length > 0 || docError) {
      setFormError(t('form.fixErrors'));
      /** @type {HTMLElement | null} */ (root.querySelector('[aria-invalid="true"]'))?.focus();
      if (!root.querySelector('[aria-invalid="true"]')) q('nr-file')?.focus();
      return;
    }

    const submit = q('nr-submit');
    submit.disabled = true;
    submit.textContent = t('common.saving');
    try {
      const saved = existing
        ? await ctx.services.updateRequest(ctx.user, existing.id, values(), existing.version)
        : await ctx.services.createRequest(
            ctx.user,
            values(),
            files.map((f) => ({ name: f.name, mime: f.type, size: f.size, blob: f })),
          );
      dlg.close(saved);
    } catch (error) {
      if (error instanceof RuleError && error.params?.fields) {
        showAll(error.params.fields);
        setFormError(t('form.fixErrors'));
      } else if (error instanceof Error && 'key' in error) {
        setFormError(t(/** @type {any} */ (error).key));
      } else {
        console.error(error);
        setFormError(t('errors.unexpected'));
      }
      submit.disabled = false;
      submit.textContent = submitLabel;
    }
  });

  updateTier();
  updateSwiftVisibility();
  renderFiles();
  return dlg.closed;
}
