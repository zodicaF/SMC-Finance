// @ts-check
// S8: shown for a request that does not exist and for one the user may not open.
// One message for both, so the page never confirms that someone else's request exists.

import { html } from '../ui/html.js';
import { mount } from '../ui/dom.js';
import { t } from '../i18n/index.js';

/** @param {HTMLElement} container */
export function render(container) {
  mount(
    container,
    html`<section class="panel empty">
      <h2>${t('notfound.title')}</h2>
      <p class="muted">${t('notfound.body')}</p>
      <a class="btn" href="#/board">${t('notfound.back')}</a>
    </section>`,
  );
}
