// @ts-check
// S2 - the board: stat tiles, search and filters, and one column per status.

import { html } from '../ui/html.js';
import { mount, delegate } from '../ui/dom.js';
import { t, getLang } from '../i18n/index.js';
import { CATEGORIES, labelOf } from '../data/lookups.js';
import {
  applyFilters,
  boardStats,
  buildColumns,
  defaultFilters,
  hasActiveFilters,
} from '../domain/board.js';
import { requestCard } from '../ui/components/requestCard.js';
import { exportToExcel } from './exportExcel.js';

/** Remembered while the page stays open, so coming back to the board keeps the search. */
let filters = defaultFilters();
/** On a phone the columns become one list and this status chip picks which one ('' = all). */
let chip = '';

/**
 * @param {HTMLElement} container
 * @param {{services: any, user: import('../data/typedefs.js').User, canCreate: boolean,
 *   openNewRequest: () => void, restoreScroll?: () => void}} ctx
 * @returns {() => void}  cleanup
 */
export function render(container, ctx) {
  const lang = getLang();
  let alive = true;
  /** @type {Awaited<ReturnType<typeof ctx.services.getBoard>> | null} */
  let data = null;
  /** The requests the filters currently leave on the board; the Excel export takes these. */
  let shownIds = /** @type {string[]} */ ([]);

  mount(
    container,
    html`<section class="board-page">
      <div class="stats" id="board-stats" role="group" aria-label="${t('nav.board')}"></div>
      <div class="toolbar">
        <input
          type="search"
          id="board-search"
          placeholder="${t('board.search')}"
          aria-label="${t('board.search')}"
          autocomplete="off"
        />
        <select id="board-category" aria-label="${t('form.category')}">
          <option value="">${t('board.allCategories')}</option>
          ${CATEGORIES.map((c) => html`<option value="${c.key}">${labelOf(c, lang)}</option>`)}
        </select>
        <label class="check"
          ><input type="checkbox" id="board-stalled" /> ${t('board.onlyStalled')}</label
        >
        <label class="check"
          ><input type="checkbox" id="board-cancelled" /> ${t('board.showCancelled')}</label
        >
        <button type="button" class="btn" data-action="export">${t('export.button')}</button>
      </div>
      <div id="board-body"></div>
    </section>`,
  );

  /** @param {string} id */
  const el = (id) => /** @type {any} */ (container.querySelector(`#${id}`));
  el('board-search').value = filters.search;
  el('board-category').value = filters.category;
  el('board-stalled').checked = filters.onlyStalled;
  el('board-cancelled').checked = filters.showCancelled;

  const body = el('board-body');
  const statsEl = el('board-stats');

  function showLoading() {
    mount(
      statsEl,
      html`${[1, 2, 3, 4].map(() => html`<div class="stat skeleton" aria-hidden="true"></div>`)}`,
    );
    mount(
      body,
      html`<div class="board" style="--cols:5" aria-busy="true" aria-label="${t('common.loading')}">
        ${[1, 2, 3, 4, 5].map(
          () => html`<div class="col">
            <div class="skeleton line"></div>
            <div class="skeleton card-skel"></div>
            <div class="skeleton card-skel"></div>
          </div>`,
        )}
      </div>`,
    );
  }

  function showError() {
    mount(statsEl, html``);
    mount(
      body,
      html`<div class="panel state error" role="alert">
        <p>${t('board.error')}</p>
        <button type="button" class="btn" data-action="retry">${t('common.retry')}</button>
      </div>`,
    );
  }

  function update() {
    if (!data) return;
    const { items, users, nowIso } = data;
    const stats = boardStats(items, nowIso);
    /** @param {string} key @param {number} value @param {'' | 'review' | 'ready' | 'month'} stat */
    const tile = (key, value, stat) => html`<button
      type="button"
      class="stat"
      data-action="stat"
      data-stat="${stat}"
      ${stat ? html`aria-pressed="${filters.stat === stat ? 'true' : 'false'}"` : ''}
    >
      <span class="num mono">${value}</span>
      <span class="lbl">${t(key)}</span>
    </button>`;
    mount(
      statsEl,
      html`${tile('board.stat.total', stats.total, '')}${tile('board.stat.review', stats.review, 'review')}${tile('board.stat.ready', stats.ready, 'ready')}${tile('board.stat.month', stats.month, 'month')}`,
    );

    if (items.length === 0) {
      mount(
        body,
        html`<div class="panel state">
          <h2>${t('board.emptyTitle')}</h2>
          <p class="muted">${t('board.emptyBody')}</p>
          ${
            ctx.canCreate
              ? html`<button type="button" class="btn primary" data-action="new-request">
                ${t('action.newRequest')}
              </button>`
              : ''
          }
        </div>`,
      );
      return;
    }

    const shown = applyFilters(items, filters, { users, nowIso });
    shownIds = shown.map((i) => i.request.id);
    if (shown.length === 0) {
      mount(
        body,
        html`<div class="panel state">
          <p>${t('board.noResults')}</p>
          ${
            hasActiveFilters(filters)
              ? html`<button type="button" class="btn" data-action="clear">
                ${t('board.clearFilters')}
              </button>`
              : ''
          }
        </div>`,
      );
      return;
    }

    const columns = buildColumns(shown, filters, nowIso);
    const cardCtx = { users, lang };
    if (chip && !columns.some((c) => c.status === chip)) chip = '';
    mount(
      body,
      html`<div class="chips" role="group" aria-label="${t('board.chipsLabel')}">
          <button type="button" class="chip" data-action="chip" data-status="" aria-pressed="${chip === '' ? 'true' : 'false'}">
            ${t('board.chipAll')} <span class="mono">${shown.length}</span>
          </button>
          ${columns.map(
            (col) => html`<button
              type="button"
              class="chip"
              data-action="chip"
              data-status="${col.status}"
              aria-pressed="${chip === col.status ? 'true' : 'false'}"
            >
              ${t(`status.${col.status}`)} <span class="mono">${col.items.length}</span>
            </button>`,
          )}
        </div>
        <div class="board" style="--cols:${columns.length}" data-chip="${chip}">
        ${columns.map(
          (
            col,
          ) => html`<section class="col${col.status === 'returned' ? ' returned' : ''}" data-status="${col.status}">
            <header class="col-head">
              <h2>${t(`status.${col.status}`)}</h2>
              <span class="count mono">${col.items.length}</span>
            </header>
            <div class="col-cards">
              ${
                col.items.length > 0
                  ? col.items.map((item) => requestCard(item, cardCtx))
                  : html`<p class="col-empty">${t('board.colEmpty')}</p>`
              }
            </div>
            ${
              col.status === 'transferred' && col.hidden > 0
                ? html`<p class="col-note">
                  ${t('board.olderHidden', { n: col.hidden })}
                  <button type="button" class="link" data-action="see-all">
                    ${t('board.seeAll')}
                  </button>
                </p>`
                : ''
            }
            ${
              col.status === 'transferred' && filters.showAllTransferred
                ? html`<p class="col-note">
                  <button type="button" class="link" data-action="month-only">
                    ${t('board.thisMonthOnly')}
                  </button>
                </p>`
                : ''
            }
          </section>`,
        )}
      </div>`,
    );
  }

  async function load() {
    showLoading();
    try {
      const result = await ctx.services.getBoard(ctx.user);
      if (!alive) return;
      data = result;
      update();
      ctx.restoreScroll?.(); // coming back from a request: same place in the list
    } catch (err) {
      console.error(err);
      if (alive) showError();
    }
  }

  const stopClicks = delegate(container, 'click', {
    stat: (btn) => {
      const stat = /** @type {any} */ (btn.dataset.stat ?? '');
      filters.stat = filters.stat === stat ? '' : stat;
      update();
    },
    clear: () => {
      filters = defaultFilters();
      el('board-search').value = '';
      el('board-category').value = '';
      el('board-stalled').checked = false;
      el('board-cancelled').checked = false;
      update();
    },
    'see-all': () => {
      filters.showAllTransferred = true;
      update();
    },
    'month-only': () => {
      filters.showAllTransferred = false;
      update();
    },
    chip: (btn) => {
      chip = btn.dataset.status ?? '';
      update();
    },
    retry: () => load(),
    export: () => {
      exportToExcel(ctx, shownIds); // what the filters leave on the board
    },
    'new-request': () => ctx.openNewRequest(),
  });

  // The search box reacts to typing only. Reacting to "change" as well would redraw the board
  // when the box loses focus, which is between the mouse press and release of the next click,
  // and the click would be lost.
  /** @param {Event} event */
  const onType = (event) => {
    const target = /** @type {HTMLInputElement} */ (event.target);
    if (target.id !== 'board-search' || filters.search === target.value) return;
    filters.search = target.value;
    update();
  };
  /** @param {Event} event */
  const onChoose = (event) => {
    const target = /** @type {HTMLInputElement} */ (event.target);
    if (target.id === 'board-category') filters.category = target.value;
    else if (target.id === 'board-stalled') filters.onlyStalled = target.checked;
    else if (target.id === 'board-cancelled') filters.showCancelled = target.checked;
    else return;
    update();
  };
  container.addEventListener('input', onType);
  container.addEventListener('change', onChoose);

  load();

  return () => {
    alive = false;
    stopClicks();
    container.removeEventListener('input', onType);
    container.removeEventListener('change', onChoose);
  };
}
