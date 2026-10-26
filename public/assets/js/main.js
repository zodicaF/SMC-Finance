// @ts-check
// Start-up: language, sign-in, the page shell (header, tabs, user), and the router.

import { t, setLang, getLang, getDir, LANGS } from './i18n/index.js';
import { personName } from './i18n/labels.js';
import { html } from './ui/html.js';
import { mount, delegate } from './ui/dom.js';
import { showToast } from './ui/toast.js';
import { confirmDialog } from './ui/dialog.js';
import { startRouter, requestHash } from './router.js';
import { createApp } from './appContext.js';
import { canDo, hasRole } from './domain/permissions.js';
import * as board from './views/board.js';
import * as myApprovals from './views/myApprovals.js';
import * as bankStatus from './views/bankStatus.js';
import * as admin from './views/admin.js';
import * as requestDetail from './views/requestDetail.js';
import * as noAccess from './views/noAccess.js';
import { renderSignIn } from './views/signIn.js';
import { openNewRequest } from './views/newRequestForm.js';

const LANG_KEY = 'tt-lang';

/**
 * Tabs, and who may see them: [route name, text key, visible for this user].
 * @type {[string, string, (user: import('./data/typedefs.js').User) => boolean][]}
 */
const TABS = [
  ['board', 'nav.board', () => true],
  ['approvals', 'nav.approvals', (u) => hasRole(u, 'approver')],
  ['bank', 'nav.bank', () => true],
  ['admin', 'nav.admin', (u) => canDo('admin', u)],
];
/** @type {Record<string, {render: (c: HTMLElement, ctx: any) => void | (() => void)}>} */
const VIEWS = {
  board,
  approvals: myApprovals,
  bank: bankStatus,
  admin,
  request: requestDetail,
  notfound: noAccess,
};

/** @type {Awaited<ReturnType<typeof createApp>>} */
let app;
/** @type {import('./data/typedefs.js').User | null} */
let user = null;
/** @type {{name: string, params: Record<string, string>}} */
let route = { name: 'board', params: {} };
/** @type {(() => void) | null} */
let cleanupView = null;
/** Where each list was scrolled to when the person opened a request from it. */
/** @type {Record<string, number>} */
const savedScroll = {};
let cameFromRequest = false;

const root = /** @type {HTMLElement} */ (document.getElementById('root'));

function savedLang() {
  try {
    return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

/** @param {string} lang */
function applyLang(lang) {
  setLang(lang);
  document.documentElement.lang = getLang();
  document.documentElement.dir = getDir();
  document.title = t('app.title');
  try {
    localStorage.setItem(LANG_KEY, getLang());
  } catch {
    /* private window: the choice just is not remembered */
  }
}

// ---- screens ------------------------------------------------------------------------------

/** @param {unknown} err */
function showFatal(err) {
  console.error(err);
  mount(
    root,
    html`<div class="app">
      <section class="panel state error" role="alert">
        <h2>${t('app.fatalTitle')}</h2>
        <p class="muted">${t('app.fatalBody')}</p>
        <p class="mono small">${err instanceof Error ? err.message : String(err)}</p>
      </section>
    </div>`,
  );
}

async function renderSignInScreen() {
  stopView();
  renderSignIn(root, { choices: await app.auth.listSignInChoices() });
}

function renderShell() {
  if (!user) return;
  const me = user;
  const lang = getLang();
  const tabs = TABS.filter(([, , visible]) => visible(me));
  mount(
    root,
    html`<a class="skip-link" href="#view" data-action="skip">${t('nav.skip')}</a>
      <div class="app">
        <header class="masthead">
          <div>
            <p class="eyebrow">${t('app.eyebrow')}</p>
            <h1>${t('app.title')}</h1>
            <p class="sub">${t('app.sub')}</p>
          </div>
          <div class="head-actions">
            <div class="user-pill">
              <span class="user-name">${personName(me, lang)}</span>
              ${me.roles.map((r) => html`<span class="pill">${t(`role.${r}`)}</span>`)}
              <button type="button" class="btn small" data-action="sign-out">
                ${t('auth.signOut')}
              </button>
            </div>
            <div class="lang-toggle" role="group" aria-label="${t('nav.language')}">
              ${LANGS.map(
                (l) => html`<button
                  type="button"
                  data-action="lang"
                  data-lang="${l}"
                  aria-pressed="${lang === l ? 'true' : 'false'}"
                >
                  ${l.toUpperCase()}
                </button>`,
              )}
            </div>
            ${
              canDo('create', me)
                ? html`<button type="button" class="btn primary" data-action="new-request">
                  ${t('action.newRequest')}
                </button>`
                : ''
            }
          </div>
        </header>
        <nav class="tabs" aria-label="${t('nav.main')}">
          ${tabs.map(
            ([name, key]) => html`<a class="tab" href="#/${name}" data-tab="${name}">${t(key)}</a>`,
          )}
        </nav>
        <main id="view" tabindex="-1"></main>
      </div>`,
  );
  renderView();
  refreshApprovalBadge();
}

function stopView() {
  if (cleanupView) cleanupView();
  cleanupView = null;
}

/** Can the signed-in user open this route? */
function routeAllowed() {
  const tab = TABS.find(([name]) => name === route.name);
  return !tab || (!!user && tab[2](user));
}

function makeCtx() {
  return {
    app,
    services: app.services,
    user: /** @type {import('./data/typedefs.js').User} */ (user),
    params: route.params,
    lang: getLang(),
    canCreate: !!user && canDo('create', user),
    openNewRequest: startNewRequest,
    refresh: renderView,
    /** Lists call this once they have drawn: back from a request, scroll to where they were. */
    restoreScroll: () => {
      const y = savedScroll[route.name];
      if (cameFromRequest && y !== undefined) window.scrollTo(0, y);
      delete savedScroll[route.name];
      cameFromRequest = false;
    },
    /** Views call this after changing something, so the red count on "My approvals" is right. */
    afterChange: refreshApprovalBadge,
  };
}

function renderView() {
  stopView();
  const container = document.getElementById('view');
  if (!container || !user) return;
  const view = routeAllowed() ? (VIEWS[route.name] ?? noAccess) : noAccess;
  const result = view.render(container, makeCtx());
  cleanupView = typeof result === 'function' ? result : null;
  const current = route.name === 'request' ? 'board' : route.name;
  document.querySelectorAll('.tab').forEach((tab) => {
    if (tab.getAttribute('data-tab') === current) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
}

/** The red number on "My approvals". */
async function refreshApprovalBadge() {
  const tab = document.querySelector('[data-tab="approvals"]');
  if (!tab || !user) return;
  try {
    const waiting = (await app.services.myApprovals(user)).length;
    tab.querySelector('.count-badge')?.remove();
    if (waiting > 0) {
      const badge = document.createElement('span');
      badge.className = 'count-badge';
      badge.textContent = String(waiting);
      tab.append(badge);
    }
  } catch (err) {
    console.error(err);
  }
}

// ---- actions ------------------------------------------------------------------------------

async function startNewRequest() {
  if (!user) return;
  try {
    const created = await openNewRequest(makeCtx());
    if (!created) return;
    showToast(t('form.created', { ref: created.ref }));
    window.location.hash = requestHash(created.ref); // open the new request's page
    refreshApprovalBadge();
  } catch (err) {
    console.error(err);
    const key = err instanceof Error && 'key' in err ? String(/** @type {any} */ (err).key) : '';
    showToast(t(key || 'errors.unexpected'), { error: true });
  }
}

delegate(root, 'click', {
  // "#view" would be taken by the hash router as a page name, so the link is handled here.
  skip: (_el, event) => {
    event.preventDefault();
    document.getElementById('view')?.focus();
  },
  lang: (el) => {
    applyLang(el.dataset.lang ?? 'ar');
    if (user) renderShell();
    else renderSignInScreen();
  },
  'new-request': () => {
    startNewRequest();
  },
  'sign-out': async () => {
    await app.auth.signOut();
    user = null;
    renderSignInScreen();
  },
  pick: async (el) => {
    try {
      user = await app.auth.signIn(el.dataset.id ?? '');
      renderShell();
    } catch (err) {
      console.error(err);
      showToast(t('errors.unexpected'), { error: true });
    }
  },
  reset: async () => {
    const ok = await confirmDialog({
      title: t('auth.resetTitle'),
      message: t('auth.resetBody'),
      confirmLabel: t('auth.resetConfirm'),
      danger: true,
    });
    if (!ok) return;
    await app.resetSampleData();
    window.location.reload();
  },
});

// ---- start --------------------------------------------------------------------------------

async function boot() {
  applyLang(savedLang());
  try {
    app = await createApp();
    user = await app.auth.getCurrentUser();
  } catch (err) {
    showFatal(err);
    return;
  }
  startRouter((next) => {
    if (['board', 'approvals', 'bank'].includes(route.name) && next.name === 'request') {
      savedScroll[route.name] = window.scrollY;
    }
    cameFromRequest = route.name === 'request' && next.name !== 'request';
    const changed = route.name !== next.name || route.params.ref !== next.params.ref;
    route = next;
    if (!user) return;
    if (document.getElementById('view')) renderView();
    else renderShell();
    // A screen reader should land on the new page, not stay on the link that was pressed.
    if (changed) document.getElementById('view')?.focus({ preventScroll: true });
  });
  // Coming back to the tab: the lists show what happened meanwhile (unless a dialog is open).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !user) return;
    if (!['board', 'approvals'].includes(route.name)) return;
    if (document.querySelector('dialog[open]')) return;
    renderView();
    refreshApprovalBadge();
  });
  if (!user) renderSignInScreen();
}

boot();
