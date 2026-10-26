// @ts-check
// S7 - administration (admin only): people and roles, exchange rates, settings, and clearing
// the example data. Changing a rate applies to new requests and resubmissions only: stored
// rates on existing requests are never touched.

import { html } from '../ui/html.js';
import { mount, delegate } from '../ui/dom.js';
import { confirmDialog } from '../ui/dialog.js';
import { openFormDialog, fieldError } from '../ui/formDialog.js';
import { showToast } from '../ui/toast.js';
import { errorText } from '../ui/errors.js';
import { t, getLang } from '../i18n/index.js';
import { fmtDate } from '../i18n/format.js';
import { personName } from '../i18n/labels.js';
import { ROLES } from '../data/lookups.js';

/** Remembered while the page stays open. */
let section = 'users';
let search = '';

const SECTIONS = ['users', 'rates', 'settings'];

/** @param {HTMLElement} root @param {string} id */
const field = (root, id) => /** @type {any} */ (root.querySelector(`#${id}`));

/** @param {string} role */
const rolePill = (role) =>
  html`<span class="pill ${role === 'admin' ? 'dark' : role === 'approver' ? 'ok' : role === 'bank_ops' ? 'info' : ''}"
    >${t(`role.${role}`)}</span
  >`;

/**
 * @param {HTMLElement} container
 * @param {{services: any, user: import('../data/typedefs.js').User}} ctx
 * @returns {() => void}  cleanup
 */
export function render(container, ctx) {
  const { services, user } = ctx;
  const lang = getLang();
  let alive = true;
  /** @type {Awaited<ReturnType<typeof services.getAdminData>> | null} */
  let data = null;

  mount(
    container,
    html`<section class="admin-page">
      <div class="subtabs" role="tablist">
        ${SECTIONS.map(
          (s) => html`<button
            type="button"
            class="subtab"
            role="tab"
            data-action="section"
            data-section="${s}"
            aria-selected="${s === section ? 'true' : 'false'}"
          >
            ${t(`admin.sec.${s}`)}
          </button>`,
        )}
      </div>
      <div id="admin-body"></div>
    </section>`,
  );
  const body = /** @type {HTMLElement} */ (container.querySelector('#admin-body'));

  /** @param {string} id */
  const nameOf = (id) =>
    personName(
      data?.users.find((u) => u.id === id),
      lang,
    );

  function markTabs() {
    container.querySelectorAll('.subtab').forEach((b) => {
      b.setAttribute(
        'aria-selected',
        /** @type {HTMLElement} */ (b).dataset.section === section ? 'true' : 'false',
      );
    });
  }

  // ---- people -----------------------------------------------------------------------------

  /** @param {NonNullable<typeof data>} d */
  function usersView(d) {
    const q = search.trim().toLowerCase();
    const list = d.users.filter(
      (u) => !q || `${u.nameEn} ${u.nameAr} ${u.email}`.toLowerCase().includes(q),
    );
    return html`<div class="toolbar">
        <input
          type="search"
          id="admin-search"
          placeholder="${t('admin.findPerson')}"
          aria-label="${t('admin.findPerson')}"
          autocomplete="off"
          value="${search}"
        />
        <button type="button" class="btn primary" data-action="add-user">
          ${t('admin.addPerson')}
        </button>
      </div>
      <div id="admin-users">${usersTable(list)}</div>
      <p class="muted small">${t('admin.userHint')}</p>`;
  }

  /** @param {import('../data/typedefs.js').User[]} list */
  function usersTable(list) {
    if (list.length === 0)
      return html`<div class="panel state"><p>${t('admin.noPeople')}</p></div>`;
    const deletable = data?.deletableUserIds ?? [];
    return html`<div class="panel table-wrap">
      <table class="grid">
        <thead>
          <tr>
            <th>${t('admin.colPerson')}</th>
            <th>${t('admin.colRoles')}</th>
            <th>${t('admin.colActive')}</th>
            <th><span class="visually-hidden">${t('admin.edit')}</span></th>
          </tr>
        </thead>
        <tbody>
          ${list.map(
            (u) => html`<tr class="${u.active ? '' : 'inactive'}">
              <td>
                <b>${personName(u, lang)}</b><br /><span class="muted small"
                  ><bdi dir="ltr">${u.email}</bdi></span
                >
              </td>
              <td><div class="card-pills">${u.roles.map(rolePill)}</div></td>
              <td>${u.active ? t('admin.on') : t('admin.off')}</td>
              <td>
                <button type="button" class="btn small" data-action="edit-user" data-id="${u.id}">
                  ${t('admin.edit')}
                </button>
                ${
                  deletable.includes(u.id)
                    ? html`<button
                        type="button"
                        class="btn small danger"
                        data-action="delete-user"
                        data-id="${u.id}"
                      >
                        ${t('admin.delete')}
                      </button>`
                    : ''
                }
              </td>
            </tr>`,
          )}
        </tbody>
      </table>
    </div>`;
  }

  /** @param {import('../data/typedefs.js').User | null} existing */
  async function userDialog(existing) {
    const editing = !!existing;
    const saved = await openFormDialog({
      title: t(editing ? 'admin.editPersonTitle' : 'admin.addPersonTitle'),
      intro: t('admin.addPersonIntro'),
      submitLabel: t('common.save'),
      fields: html`
        <div class="field">
          <label for="fd-nameEn">${t('admin.nameEn')}<span class="req" aria-hidden="true"> *</span></label>
          <input id="fd-nameEn" name="nameEn" value="${existing?.nameEn ?? ''}" autocomplete="off" />
          ${fieldError('nameEn')}
        </div>
        <div class="field">
          <label for="fd-nameAr">${t('admin.nameAr')}<span class="req" aria-hidden="true"> *</span></label>
          <input id="fd-nameAr" name="nameAr" dir="rtl" value="${existing?.nameAr ?? ''}" autocomplete="off" />
          ${fieldError('nameAr')}
        </div>
        <div class="field">
          <label for="fd-email">${t('admin.email')}<span class="req" aria-hidden="true"> *</span></label>
          <input id="fd-email" name="email" dir="ltr" type="email" value="${existing?.email ?? ''}" autocomplete="off" />
          ${fieldError('email')}
        </div>
        <fieldset class="bank-field">
          <legend>${t('admin.colRoles')}</legend>
          <div class="bank-choices">
            ${ROLES.map(
              (r) => html`<label class="check"
                ><input type="checkbox" name="role" value="${r}" ${
                  existing?.roles.includes(/** @type {any} */ (r)) ? 'checked' : ''
                } />
                ${t(`role.${r}`)}</label
              >`,
            )}
          </div>
          ${fieldError('roles')}
        </fieldset>
        ${
          editing
            ? html`<label class="check"
                ><input type="checkbox" id="fd-active" ${existing?.active ? 'checked' : ''} />
                ${t('admin.activeLabel')}</label
              >`
            : ''
        }
      `,
      validate: (root) => {
        /** @type {Record<string, string>} */
        const errors = {};
        if (!field(root, 'fd-nameEn').value.trim()) errors.nameEn = 'admin.errName';
        if (!field(root, 'fd-nameAr').value.trim()) errors.nameAr = 'admin.errName';
        if (!/^\S+@\S+\.\S+$/.test(field(root, 'fd-email').value.trim()))
          errors.email = 'admin.errEmail';
        if (root.querySelectorAll('input[name="role"]:checked').length === 0)
          errors.roles = 'admin.errRoles';
        return errors;
      },
      submit: (root) => {
        const input = {
          nameEn: field(root, 'fd-nameEn').value,
          nameAr: field(root, 'fd-nameAr').value,
          email: field(root, 'fd-email').value,
          roles: Array.from(root.querySelectorAll('input[name="role"]:checked')).map(
            (c) => /** @type {HTMLInputElement} */ (c).value,
          ),
        };
        return existing
          ? services.saveUser(user, {
              ...existing,
              ...input,
              active: field(root, 'fd-active').checked,
            })
          : services.addUser(user, input);
      },
    });
    if (saved) {
      showToast(t(editing ? 'admin.userSaved' : 'admin.userAdded'));
      await load();
    }
  }

  /** @param {string} id */
  async function deleteUserConfirm(id) {
    const person = data?.users.find((u) => u.id === id);
    if (!person) return;
    const ok = await confirmDialog({
      title: t('admin.deletePersonTitle'),
      message: t('admin.deletePersonBody', { name: personName(person, lang) }),
      confirmLabel: t('admin.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await services.deleteUser(user, id);
      showToast(t('admin.userDeleted'));
      await load();
    } catch (err) {
      showToast(errorText(err), { error: true });
    }
  }

  // ---- exchange rates -----------------------------------------------------------------------

  /** @param {NonNullable<typeof data>} d */
  function ratesView(d) {
    return html`<p class="muted">${t('admin.ratesHint')}</p>
      <div class="panel table-wrap">
        <table class="grid">
          <thead>
            <tr>
              <th>${t('admin.colCurrency')}</th>
              <th>${t('admin.colRate')}</th>
              <th>${t('admin.colUpdated')}</th>
              <th><span class="visually-hidden">${t('common.save')}</span></th>
            </tr>
          </thead>
          <tbody>
            ${d.rates.map(
              (r) => html`<tr>
                <td class="mono"><b>${r.currency}</b></td>
                <td>
                  <input
                    id="rate-${r.currency}"
                    class="mono"
                    inputmode="decimal"
                    dir="ltr"
                    value="${r.rateToSar}"
                    ${r.currency === 'SAR' ? 'disabled' : ''}
                    aria-label="${t('admin.colRate')} ${r.currency}"
                  />
                </td>
                <td class="muted small">
                  ${fmtDate(r.updatedAt, lang)}${r.updatedById ? html` · ${nameOf(r.updatedById)}` : ''}
                </td>
                <td>
                  ${
                    r.currency === 'SAR'
                      ? ''
                      : html`<button type="button" class="btn small primary" data-action="save-rate" data-currency="${r.currency}">
                        ${t('common.save')}
                      </button>`
                  }
                </td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>`;
  }

  /** @param {string} currency */
  async function saveRate(currency) {
    const rate = Number(field(container, `rate-${currency}`).value);
    await run(() => services.saveFxRate(user, currency, rate), 'admin.rateSaved');
  }

  // ---- settings and sample data ---------------------------------------------------------------

  /** @param {NonNullable<typeof data>} d */
  function settingsView(d) {
    return html`<div class="panel admin-settings">
        <div class="field">
          <label for="set-stalledDays">${t('admin.stalledDays')}</label>
          <input id="set-stalledDays" class="mono" inputmode="numeric" dir="ltr" value="${d.settings.stalledDays ?? '3'}" />
        </div>
        <div class="field">
          <label for="set-maxFileMb">${t('admin.maxFileMb')}</label>
          <input id="set-maxFileMb" class="mono" inputmode="numeric" dir="ltr" value="${d.settings.maxFileMb ?? '10'}" />
        </div>
        <div class="stage-actions">
          <button type="button" class="btn primary" data-action="save-settings">${t('common.save')}</button>
        </div>
      </div>
      <div class="panel">
        <h2>${t('admin.sampleTitle')}</h2>
        <p class="muted">${
          d.sampleCount > 0 ? t('admin.sampleBody', { n: d.sampleCount }) : t('admin.sampleNone')
        }</p>
        <button type="button" class="btn danger" data-action="clear-sample" ${d.sampleCount > 0 ? '' : 'disabled'}>
          ${t('admin.sampleClear')}
        </button>
      </div>`;
  }

  async function saveSettings() {
    await run(async () => {
      await services.saveSetting(user, 'stalledDays', field(container, 'set-stalledDays').value);
      await services.saveSetting(user, 'maxFileMb', field(container, 'set-maxFileMb').value);
    }, 'admin.settingSaved');
  }

  async function clearSamples() {
    const ok = await confirmDialog({
      title: t('admin.sampleConfirmTitle'),
      message: t('admin.sampleConfirmBody', { n: data?.sampleCount ?? 0 }),
      confirmLabel: t('admin.sampleClear'),
      danger: true,
    });
    if (!ok) return;
    try {
      const removed = await services.clearSampleData(user);
      showToast(t('admin.sampleCleared', { n: removed }));
      await load();
    } catch (err) {
      showToast(errorText(err), { error: true });
    }
  }

  // ---- shared -------------------------------------------------------------------------------

  /** Runs a save, shows the result, and reloads. @param {() => Promise<any>} fn @param {string} toastKey */
  async function run(fn, toastKey) {
    try {
      await fn();
      showToast(t(toastKey));
    } catch (err) {
      showToast(errorText(err), { error: true });
    }
    await load();
  }

  function draw() {
    if (!data) return;
    markTabs();
    const view =
      section === 'rates'
        ? ratesView(data)
        : section === 'settings'
          ? settingsView(data)
          : usersView(data);
    mount(body, view);
  }

  async function load() {
    try {
      const result = await services.getAdminData(user);
      if (!alive) return;
      data = result;
      draw();
    } catch (err) {
      console.error(err);
      if (!alive) return;
      mount(
        body,
        html`<div class="panel state error" role="alert">
          <p>${t('admin.error')}</p>
          <button type="button" class="btn" data-action="retry">${t('common.retry')}</button>
        </div>`,
      );
    }
  }

  const stopClicks = delegate(container, 'click', {
    section: (btn) => {
      section = btn.dataset.section ?? 'users';
      draw();
    },
    retry: () => load(),
    'add-user': () => {
      userDialog(null);
    },
    'edit-user': (btn) => {
      const u = data?.users.find((x) => x.id === btn.dataset.id);
      if (u) userDialog(u);
    },
    'delete-user': (btn) => {
      if (btn.dataset.id) deleteUserConfirm(btn.dataset.id);
    },
    'save-rate': (btn) => {
      saveRate(btn.dataset.currency ?? '');
    },
    'save-settings': () => {
      saveSettings();
    },
    'clear-sample': () => {
      clearSamples();
    },
  });

  // The search box reacts to typing only and redraws just the table, never the box itself.
  /** @param {Event} event */
  const onInput = (event) => {
    const target = /** @type {HTMLInputElement} */ (event.target);
    if (target.id !== 'admin-search' || !data) return;
    search = target.value;
    const q = search.trim().toLowerCase();
    const slot = container.querySelector('#admin-users');
    if (slot)
      mount(
        /** @type {HTMLElement} */ (slot),
        usersTable(
          data.users.filter(
            (u) => !q || `${u.nameEn} ${u.nameAr} ${u.email}`.toLowerCase().includes(q),
          ),
        ),
      );
  };
  container.addEventListener('input', onInput);

  mount(body, html`<p class="muted">${t('common.loading')}</p>`);
  load();

  return () => {
    alive = false;
    stopClicks();
    container.removeEventListener('input', onInput);
  };
}
