// @ts-check
// S1 (development version) - pick who to sign in as. Replaced by Microsoft sign-in later.

import { html } from '../ui/html.js';
import { mount } from '../ui/dom.js';
import { t, getLang, LANGS } from '../i18n/index.js';
import { personName } from '../i18n/labels.js';

/**
 * @param {HTMLElement} container
 * @param {{choices: import('../data/typedefs.js').User[]}} options
 */
export function renderSignIn(container, { choices }) {
  const lang = getLang();
  mount(
    container,
    html`<header class="masthead">
        <div class="brand">
          <img class="brand-logo" src="assets/smc-logo.png" alt="SMC Group" />
          <span class="brand-divider"></span>
          <p class="wordmark">${t('app.wordmark')}</p>
        </div>
      </header>
      <div class="entity-stripe"><span></span><span></span><span></span></div>
      <main class="signin">
        <section class="panel signin-card">
          <div class="signin-top">
            <p class="eyebrow">${t('app.eyebrow')}</p>
            <div class="lang-toggle" role="group" aria-label="Language">
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
          </div>
          <h1>${t('app.title')}</h1>
          <h2 class="signin-sub">${t('auth.devTitle')}</h2>
          <p class="muted">${t('auth.devNote')}</p>
          <ul class="people">
            ${choices.map(
              (u) => html`<li>
                <button type="button" class="person" data-action="pick" data-id="${u.id}">
                  <span class="person-name">${personName(u, lang)}</span>
                  <span class="person-roles"
                    >${u.roles.map((r) => html`<span class="pill">${t(`role.${r}`)}</span>`)}</span
                  >
                </button>
              </li>`,
            )}
          </ul>
          <button type="button" class="link" data-action="reset">${t('auth.reset')}</button>
        </section>
      </main>
      <footer class="site-footer">${t('app.footer', { year: String(new Date().getFullYear()) })}</footer>`,
  );
}
