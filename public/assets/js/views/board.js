// @ts-check
// S2 - the board: stat tiles, search and filters, and one column per status.

import { html } from '../ui/html.js';
import { mount, delegate } from '../ui/dom.js';
import { t, getLang } from '../i18n/index.js';
import { CATEGORIES, COMPANY_ACCOUNTS, MOVEMENTS, accountOf, labelOf } from '../data/lookups.js';
import {
  activeFilterCount,
  applyFilters,
  boardStats,
  buildColumns,
  defaultFilters,
  hasActiveFilters,
  sortItems,
} from '../domain/board.js';
import { parseAmountInput } from '../domain/money.js';
import { fmtNumber } from '../i18n/format.js';
import { categoryLabel, personName } from '../i18n/labels.js';
import { requestCard } from '../ui/components/requestCard.js';
import { exportToExcel } from './exportExcel.js';
import { checkCircleIcon, clockIcon, filterIcon, inboxIcon, undoIcon } from '../ui/icons.js';

/** @type {import('../domain/board.js').BoardSort[]} */
const SORTS = ['newest', 'oldest', 'amountDesc'];
/** @type {import('../domain/board.js').DatePreset[]} */
const DATES = ['', 'today', 'week', 'month', 'lastMonth', 'exact', 'custom'];
const COMPANIES = [...new Set(COMPANY_ACCOUNTS.map((a) => a.company))];
/** @param {string} id */
const accountCompany = (id) => accountOf(id)?.company;

/** Remembered while the page stays open, so coming back to the board keeps the search. */
let filters = defaultFilters();
/** Whether the Filters panel is open; remembered like the filters. */
let panelOpen = false;
/** On a phone the columns become one list and this status chip picks which one ('' = all). */
let chip = '';
/** Where the selected-status highlight sat last, so the next redraw can glide from there.
 * @type {{x: number, w: number} | null} */
let lastIndicator = null;

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
  /** @type {ReturnType<typeof setTimeout> | 0} */
  let typingTimer = 0;

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
        <button
          type="button"
          class="btn filter-btn"
          id="board-filter-btn"
          data-action="toggle-filters"
          aria-expanded="false"
          aria-controls="board-filters"
        >
          ${filterIcon()} ${t('board.filters')}
          <span class="filter-badge mono" id="board-filter-count" hidden></span>
        </button>
        <select id="board-sort" aria-label="${t('board.sort')}">
          ${SORTS.map((s) => html`<option value="${s}">${t(`board.sort.${s}`)}</option>`)}
        </select>
        <button type="button" class="btn" data-action="export">${t('export.button')}</button>
      </div>
      <div
        class="filter-panel"
        id="board-filters"
        role="region"
        aria-label="${t('board.filtersPanel')}"
        hidden
      >
        <div class="filter-grid">
          <div class="field filter-date">
            <label class="lbl" for="board-date">${t('board.filter.date')}</label>
            <div class="filter-date-row">
              <select id="board-date">
                ${DATES.map(
                  (d) => html`<option value="${d}">${t(`board.date.${d || 'any'}`)}</option>`,
                )}
              </select>
              <div class="filter-dates" id="board-date-exact" hidden>
                <input type="date" id="board-date-on" aria-label="${t('board.date.day')}" />
              </div>
              <div class="filter-dates" id="board-date-custom" hidden>
                <label class="filter-inline"
                  ><span>${t('board.date.from')}</span>
                  <input type="date" id="board-date-from"
                /></label>
                <label class="filter-inline"
                  ><span>${t('board.date.to')}</span> <input type="date" id="board-date-to"
                /></label>
              </div>
            </div>
          </div>
          <div class="field">
            <label class="lbl" for="board-requester">${t('board.filter.requester')}</label>
            <select id="board-requester">
              <option value="">${t('board.anyone')}</option>
            </select>
          </div>
          <div class="field">
            <label class="lbl" for="board-company">${t('board.filter.company')}</label>
            <select id="board-company">
              <option value="">${t('board.allCompanies')}</option>
              ${COMPANIES.map((c) => html`<option value="${c}">${c}</option>`)}
            </select>
          </div>
          <div class="field">
            <label class="lbl" for="board-account">${t('board.filter.account')}</label>
            <select id="board-account"></select>
          </div>
          <div class="field">
            <label class="lbl" for="board-movement">${t('form.movement')}</label>
            <select id="board-movement">
              <option value="">${t('board.allMovements')}</option>
              ${MOVEMENTS.map((m) => html`<option value="${m}">${t(`movement.${m}`)}</option>`)}
            </select>
          </div>
          <div class="field">
            <span class="lbl" id="board-amount-lbl">${t('board.filter.amount')}</span>
            <div class="filter-pair">
              <input
                type="text"
                id="board-amount-min"
                class="mono"
                dir="ltr"
                inputmode="decimal"
                autocomplete="off"
                placeholder="${t('board.amountMin')}"
                aria-label="${t('board.filter.amount')} · ${t('board.amountMin')}"
              />
              <span class="muted" aria-hidden="true">–</span>
              <input
                type="text"
                id="board-amount-max"
                class="mono"
                dir="ltr"
                inputmode="decimal"
                autocomplete="off"
                placeholder="${t('board.amountMax')}"
                aria-label="${t('board.filter.amount')} · ${t('board.amountMax')}"
              />
            </div>
          </div>
          <div class="field">
            <label class="lbl" for="board-category">${t('form.category')}</label>
            <select id="board-category">
              <option value="">${t('board.allCategories')}</option>
              ${CATEGORIES.map((c) => html`<option value="${c.key}">${labelOf(c, lang)}</option>`)}
            </select>
          </div>
          <div class="field filter-checks">
            <label class="check"
              ><input type="checkbox" id="board-stalled" /> ${t('board.onlyStalled')}</label
            >
            <label class="check"
              ><input type="checkbox" id="board-cancelled" /> ${t('board.showCancelled')}</label
            >
          </div>
        </div>
        <div class="filter-actions">
          <button type="button" class="btn" data-action="clear">${t('board.clearAll')}</button>
          <button type="button" class="btn primary" data-action="toggle-filters">
            ${t('board.done')}
          </button>
        </div>
      </div>
      <div class="filter-tags" id="board-tags"></div>
      <div id="board-body"></div>
    </section>`,
  );

  /** @param {string} id */
  const el = (id) => /** @type {any} */ (container.querySelector(`#${id}`));
  const body = el('board-body');
  const statsEl = el('board-stats');

  /** The account list holds only the chosen company's accounts, and waits until one is chosen. */
  function populateAccounts() {
    const select = el('board-account');
    const accounts = filters.company
      ? COMPANY_ACCOUNTS.filter((a) => a.company === filters.company)
      : [];
    if (!accounts.some((a) => a.id === filters.accountId)) filters.accountId = '';
    select.disabled = !filters.company;
    mount(
      select,
      html`<option value="">
          ${filters.company ? t('board.allAccounts') : t('form.pickCompanyFirst')}
        </option>
        ${accounts.map(
          (a) => html`<option value="${a.id}">${a.bank} — ${a.currency} — ${a.id}</option>`,
        )}`,
    );
    select.value = filters.accountId;
  }

  /** Shows the one-day box or the two-date boxes, depending on the date choice. */
  function showDateInputs() {
    el('board-date-exact').hidden = filters.date !== 'exact';
    el('board-date-custom').hidden = filters.date !== 'custom';
  }

  /** @param {number | null} n */
  const amountText = (n) => (n === null ? '' : fmtNumber(n));

  /** Puts every control back in step with `filters` (after a tag is removed or all are cleared). */
  function syncControls() {
    el('board-search').value = filters.search;
    el('board-sort').value = filters.sort;
    el('board-date').value = filters.date;
    el('board-date-from').value = filters.dateFrom;
    el('board-date-to').value = filters.dateTo;
    el('board-date-on').value = filters.dateOn;
    showDateInputs();
    el('board-requester').value = filters.requesterId;
    el('board-company').value = filters.company;
    populateAccounts();
    el('board-movement').value = filters.movement;
    el('board-amount-min').value = amountText(filters.amountMin);
    el('board-amount-max').value = amountText(filters.amountMax);
    el('board-amount-min').removeAttribute('aria-invalid');
    el('board-amount-max').removeAttribute('aria-invalid');
    el('board-category').value = filters.category;
    el('board-stalled').checked = filters.onlyStalled;
    el('board-cancelled').checked = filters.showCancelled;
  }

  /** @param {boolean} open @param {boolean} [moveFocus] */
  function setPanel(open, moveFocus = false) {
    panelOpen = open;
    el('board-filters').hidden = !open;
    el('board-filter-btn').setAttribute('aria-expanded', String(open));
    if (moveFocus) (open ? el('board-date') : el('board-filter-btn')).focus();
  }

  syncControls();
  setPanel(panelOpen);

  /** The people who created at least one of the loaded requests, by name. */
  function populateRequesters() {
    if (!data) return;
    const { items, users } = data;
    const ids = [...new Set(items.map((i) => i.request.createdById))].filter((id) => users[id]);
    const people = ids
      .map((id) => ({ id, name: personName(users[id], lang) }))
      .sort((a, b) => a.name.localeCompare(b.name, lang));
    mount(
      el('board-requester'),
      html`<option value="">${t('board.anyone')}</option>
        ${people.map((p) => html`<option value="${p.id}">${p.name}</option>`)}`,
    );
    if (!ids.includes(filters.requesterId)) filters.requesterId = '';
    el('board-requester').value = filters.requesterId;
  }

  /**
   * The filters that are on, as removable tags.
   * @param {Record<string, import('../data/typedefs.js').User>} users
   * @returns {{key: string, label: string}[]}
   */
  function activeTags(users) {
    const f = filters;
    /** @type {{key: string, label: string}[]} */
    const tags = [];
    if (f.date && f.date !== 'custom' && f.date !== 'exact') {
      tags.push({ key: 'date', label: t(`board.date.${f.date}`) });
    }
    if (f.date === 'exact' && f.dateOn) {
      tags.push({ key: 'date', label: t('board.date.on', { date: f.dateOn }) });
    }
    if (f.date === 'custom' && (f.dateFrom || f.dateTo)) {
      const label =
        f.dateFrom && f.dateTo
          ? t('board.date.range', { from: f.dateFrom, to: f.dateTo })
          : f.dateFrom
            ? t('board.date.since', { from: f.dateFrom })
            : t('board.date.until', { to: f.dateTo });
      tags.push({ key: 'date', label });
    }
    if (f.requesterId && users[f.requesterId]) {
      tags.push({ key: 'requester', label: personName(users[f.requesterId], lang) });
    }
    if (f.company) tags.push({ key: 'company', label: f.company });
    if (f.accountId) tags.push({ key: 'account', label: f.accountId });
    if (f.movement) tags.push({ key: 'movement', label: t(`movement.${f.movement}`) });
    if (f.amountMin !== null || f.amountMax !== null) {
      const min = amountText(f.amountMin);
      const max = amountText(f.amountMax);
      const label =
        min && max
          ? t('board.tag.amountRange', { min, max })
          : min
            ? t('board.tag.amountMin', { min })
            : t('board.tag.amountMax', { max });
      tags.push({ key: 'amount', label });
    }
    if (f.category) tags.push({ key: 'category', label: categoryLabel(f.category, lang) });
    if (f.onlyStalled) tags.push({ key: 'stalled', label: t('board.onlyStalled') });
    if (f.showCancelled) tags.push({ key: 'cancelled', label: t('board.showCancelled') });
    return tags;
  }

  /** @param {number} shownCount @param {number} total @param {Record<string, any>} users */
  function renderTagsAndBadge(shownCount, total, users) {
    const count = activeFilterCount(filters);
    const badge = el('board-filter-count');
    badge.textContent = String(count);
    badge.hidden = count === 0;
    el('board-filter-btn').classList.toggle('has-filters', count > 0);
    const tags = activeTags(users);
    mount(
      el('board-tags'),
      hasActiveFilters(filters)
        ? html`<p class="filter-count">
              ${t('board.showing', { n: shownCount, total })}
            </p>
            ${tags.map(
              (tag) => html`<button
                type="button"
                class="filter-tag"
                data-action="remove-filter"
                data-key="${tag.key}"
                aria-label="${t('board.tag.remove', { label: tag.label })}"
              >
                <span>${tag.label}</span><span class="filter-tag-x" aria-hidden="true">×</span>
              </button>`,
            )}
            ${
              tags.length > 0
                ? html`<button type="button" class="link" data-action="clear">
                    ${t('board.clearAll')}
                  </button>`
                : ''
            }`
        : html``,
    );
  }

  function showLoading() {
    mount(
      statsEl,
      html`${[1, 2, 3, 4].map(() => html`<div class="stat skeleton" aria-hidden="true"></div>`)}`,
    );
    mount(
      body,
      html`<div class="col-cards" aria-busy="true" aria-label="${t('common.loading')}">
        ${[1, 2, 3, 4, 5].map(() => html`<div class="skeleton card-skel"></div>`)}
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
    /** @param {string} key @param {number} value @param {'' | 'review' | 'ready' | 'month'} stat
     * @param {() => import('../ui/html.js').SafeHtml} icon */
    const tile = (key, value, stat, icon) => html`<button
      type="button"
      class="stat"
      data-action="stat"
      data-stat="${stat}"
      ${stat ? html`aria-pressed="${filters.stat === stat ? 'true' : 'false'}"` : ''}
    >
      <span class="lbl-row"><span class="lbl">${t(key)}</span>${icon()}</span>
      <span class="num mono">${value}</span>
    </button>`;
    mount(
      statsEl,
      html`${tile('board.stat.total', stats.total, '', inboxIcon)}${tile('board.stat.review', stats.review, 'review', clockIcon)}${tile('board.stat.ready', stats.ready, 'ready', undoIcon)}${tile('board.stat.month', stats.month, 'month', checkCircleIcon)}`,
    );

    const shown = applyFilters(items, filters, { users, nowIso, accountCompany });
    shownIds = shown.map((i) => i.request.id);
    renderTagsAndBadge(shown.length, items.length, users);

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
    const activeColumn = chip ? columns.find((c) => c.status === chip) : null;
    const visibleItems = activeColumn
      ? activeColumn.items
      : sortItems(
          columns.flatMap((c) => c.items),
          filters.sort,
        );
    // The "older transfers" note only makes sense while looking at Transferred, or at everything.
    const transferredCol = columns.find((c) => c.status === 'transferred');
    const showTransferredNote = (chip === '' || chip === 'transferred') && !!transferredCol;
    mount(
      body,
      html`<div class="chips" role="group" aria-label="${t('board.chipsLabel')}">
          <span class="chip-hover" aria-hidden="true"></span>
          <span class="chip-indicator" aria-hidden="true"></span>
          <button type="button" class="chip" data-action="chip" data-status="" aria-pressed="${chip === '' ? 'true' : 'false'}">
            <span class="chip-label">${t('board.chipAll')}</span>
            <span class="chip-count mono">${shown.length}</span>
          </button>
          ${columns.map(
            (col) => html`<button
              type="button"
              class="chip"
              data-action="chip"
              data-status="${col.status}"
              aria-pressed="${chip === col.status ? 'true' : 'false'}"
            >
              <span class="chip-dot" aria-hidden="true"></span>
              <span class="chip-label">${t(`status.${col.status}`)}</span>
              <span class="chip-count mono">${col.items.length}</span>
            </button>`,
          )}
        </div>
        <div class="board-list">
          ${
            visibleItems.length > 0
              ? html`<div class="col-cards">
                ${visibleItems.map((item) => requestCard(item, cardCtx))}
              </div>`
              : html`<p class="col-empty">${t('board.colEmpty')}</p>`
          }
          ${
            showTransferredNote && transferredCol.hidden > 0
              ? html`<p class="col-note">
                ${t('board.olderHidden', { n: transferredCol.hidden })}
                <button type="button" class="link" data-action="see-all">
                  ${t('board.seeAll')}
                </button>
              </p>`
              : ''
          }
          ${
            showTransferredNote && filters.showAllTransferred
              ? html`<p class="col-note">
                <button type="button" class="link" data-action="month-only">
                  ${t('board.thisMonthOnly')}
                </button>
              </p>`
              : ''
          }
        </div>`,
    );
    placeIndicator();
  }

  /** @param {HTMLElement} el @param {{x: number, w: number}} box */
  const setBox = (el, { x, w }) => {
    el.style.transform = `translateX(${x}px)`;
    el.style.width = `${w}px`;
  };
  /** Moves without animating, e.g. to the starting point of a glide. @param {HTMLElement} el @param {{x: number, w: number}} box */
  const jumpBox = (el, box) => {
    el.style.transition = 'none';
    setBox(el, box);
    void el.offsetWidth; // apply the jump before the transition comes back
    el.style.transition = '';
  };
  /** @param {HTMLElement} chipEl */
  const boxOf = (chipEl) => ({ x: chipEl.offsetLeft, w: chipEl.offsetWidth });

  /** The bar is redrawn on every update, so the highlight starts where it was and glides to the new status. */
  function placeIndicator() {
    const bar = body.querySelector('.chips');
    const indicator = /** @type {HTMLElement | null} */ (bar?.querySelector('.chip-indicator'));
    const selected = /** @type {HTMLElement | null} */ (bar?.querySelector('.chip[aria-pressed="true"]'));
    if (!indicator || !selected) return;
    if (lastIndicator) jumpBox(indicator, lastIndicator);
    lastIndicator = boxOf(selected);
    setBox(indicator, lastIndicator);
  }

  /** @param {Event} event */
  const onPointerOver = (event) => {
    const chipEl = /** @type {HTMLElement | null} */ (
      /** @type {Element} */ (event.target).closest?.('.chips .chip')
    );
    const bar = chipEl?.parentElement;
    const glow = /** @type {HTMLElement | null} */ (bar?.querySelector('.chip-hover'));
    if (!chipEl || !bar || !glow) return;
    if (bar.classList.contains('hovering')) setBox(glow, boxOf(chipEl));
    else jumpBox(glow, boxOf(chipEl)); // first entry: appear in place, then glide from there
    bar.classList.add('hovering');
  };
  /** @param {PointerEvent} event */
  const onPointerOut = (event) => {
    const target = /** @type {Element} */ (event.target);
    const related = /** @type {Node | null} */ (event.relatedTarget);
    const bar = target.closest?.('.chips');
    if (bar && !bar.contains(related)) bar.classList.remove('hovering');
    const card = /** @type {HTMLElement | null} */ (target.closest?.('.card'));
    if (card && !card.contains(related)) {
      lastMove = null; // a frame already queued must not tilt it again
      card.style.removeProperty('--rx');
      card.style.removeProperty('--ry');
    }
  };

  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  /** @type {PointerEvent | null} */
  let lastMove = null;
  let tiltFrame = 0;
  /** The light follows the pointer and the card leans a few degrees towards it. @param {PointerEvent} event */
  const onPointerMove = (event) => {
    if (event.pointerType !== 'mouse') return;
    lastMove = event;
    if (!tiltFrame) tiltFrame = requestAnimationFrame(tilt); // at most once per frame
  };
  function tilt() {
    tiltFrame = 0;
    const event = lastMove;
    lastMove = null;
    if (!event) return;
    const card = /** @type {HTMLElement | null} */ (
      /** @type {Element} */ (event.target).closest?.('.card')
    );
    if (!card) return;
    const box = card.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    card.style.setProperty('--mx', `${x}px`);
    card.style.setProperty('--my', `${y}px`);
    if (calm.matches) return;
    const maxTilt = 4;
    card.style.setProperty('--ry', `${((x / box.width - 0.5) * 2 * maxTilt).toFixed(2)}deg`);
    card.style.setProperty('--rx', `${((0.5 - y / box.height) * 2 * maxTilt).toFixed(2)}deg`);
  }
  const onResize = () => {
    lastIndicator = null;
    placeIndicator();
  };

  async function load() {
    showLoading();
    try {
      const result = await ctx.services.getBoard(ctx.user);
      if (!alive) return;
      data = result;
      populateRequesters();
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
      filters = { ...defaultFilters(), sort: filters.sort };
      syncControls();
      update();
    },
    'toggle-filters': () => setPanel(!panelOpen, true),
    'remove-filter': (btn) => {
      switch (btn.dataset.key) {
        case 'date':
          filters.date = '';
          filters.dateFrom = '';
          filters.dateTo = '';
          filters.dateOn = '';
          break;
        case 'movement':
          filters.movement = '';
          break;
        case 'requester':
          filters.requesterId = '';
          break;
        case 'company':
          filters.company = '';
          break;
        case 'account':
          filters.accountId = '';
          break;
        case 'amount':
          filters.amountMin = null;
          filters.amountMax = null;
          break;
        case 'category':
          filters.category = '';
          break;
        case 'stalled':
          filters.onlyStalled = false;
          break;
        case 'cancelled':
          filters.showCancelled = false;
          break;
      }
      syncControls();
      update();
      el('board-search').focus(); // the tag that had focus is gone
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

  /** Blank = no limit; something that isn't a number is flagged and ignored.
   * @param {HTMLInputElement} input @returns {number | null} */
  function readAmount(input) {
    const text = input.value.trim();
    const n = parseAmountInput(text);
    const bad = text !== '' && !Number.isFinite(n);
    if (bad) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    return text === '' || bad ? null : n;
  }

  // Text boxes react to typing only. Reacting to "change" as well would redraw the board when
  // the box loses focus, which is between the mouse press and release of the next click, and
  // the click would be lost.
  /** @param {Event} event */
  const onType = (event) => {
    const target = /** @type {HTMLInputElement} */ (event.target);
    if (target.id === 'board-search') {
      if (filters.search === target.value) return;
      filters.search = target.value;
    } else if (target.id === 'board-amount-min') filters.amountMin = readAmount(target);
    else if (target.id === 'board-amount-max') filters.amountMax = readAmount(target);
    else return;
    // Typing fast with thousands of cards: redraw once the person pauses.
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      typingTimer = 0;
      update();
    }, 150);
  };
  // A redraw between the mouse press and release of a click on a chip or card would swallow
  // the click, so a pending redraw waits until the click has happened.
  let heldBack = false;
  const onPointerDown = () => {
    if (!typingTimer) return;
    clearTimeout(typingTimer);
    typingTimer = 0;
    heldBack = true;
  };
  const onPointerUp = () => {
    if (!heldBack) return;
    heldBack = false;
    setTimeout(() => alive && update(), 0); // after the click event
  };
  /** @param {Event} event */
  const onChoose = (event) => {
    const target = /** @type {HTMLInputElement} */ (event.target);
    switch (target.id) {
      case 'board-category':
        filters.category = target.value;
        break;
      case 'board-stalled':
        filters.onlyStalled = target.checked;
        break;
      case 'board-cancelled':
        filters.showCancelled = target.checked;
        break;
      case 'board-sort':
        filters.sort = /** @type {any} */ (target.value);
        break;
      case 'board-date':
        filters.date = /** @type {any} */ (target.value);
        showDateInputs();
        break;
      case 'board-date-on':
        filters.dateOn = target.value;
        break;
      case 'board-movement':
        filters.movement = /** @type {any} */ (target.value);
        break;
      case 'board-date-from':
        filters.dateFrom = target.value;
        break;
      case 'board-date-to':
        filters.dateTo = target.value;
        break;
      case 'board-requester':
        filters.requesterId = target.value;
        break;
      case 'board-company':
        filters.company = target.value;
        populateAccounts();
        break;
      case 'board-account':
        filters.accountId = target.value;
        break;
      default:
        return;
    }
    update();
  };
  /** Escape closes the Filters panel and returns to its button. @param {KeyboardEvent} event */
  const onKey = (event) => {
    if (event.key !== 'Escape' || !panelOpen) return;
    if (!el('board-filters').contains(/** @type {Node} */ (event.target))) return;
    setPanel(false, true);
  };
  container.addEventListener('input', onType);
  container.addEventListener('change', onChoose);
  container.addEventListener('keydown', onKey);
  container.addEventListener('pointerover', onPointerOver);
  container.addEventListener('pointerout', onPointerOut);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointerup', onPointerUp);
  window.addEventListener('resize', onResize);

  load();

  return () => {
    alive = false;
    lastIndicator = null;
    clearTimeout(typingTimer);
    cancelAnimationFrame(tiltFrame);
    container.removeEventListener('pointerdown', onPointerDown);
    container.removeEventListener('pointerup', onPointerUp);
    stopClicks();
    container.removeEventListener('input', onType);
    container.removeEventListener('change', onChoose);
    container.removeEventListener('keydown', onKey);
    container.removeEventListener('pointerover', onPointerOver);
    container.removeEventListener('pointerout', onPointerOut);
    container.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('resize', onResize);
  };
}
