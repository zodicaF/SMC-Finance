// @ts-check
// S5 - "My approvals": everything waiting for the signed-in person, oldest first. They can
// approve straight from the list, reject with a reason, or open the request to read it first.

import { html } from '../ui/html.js';
import { mount, delegate } from '../ui/dom.js';
import { showToast } from '../ui/toast.js';
import { errorText } from '../ui/errors.js';
import { t, getLang } from '../i18n/index.js';
import { fmtAmount } from '../i18n/format.js';
import { personName } from '../i18n/labels.js';
import { requestHash } from '../router.js';
import { rejectStage } from './decisionDialogs.js';

/** More than this many working days waiting is shown in red. */
const LATE_AFTER_DAYS = 3;

/**
 * @param {HTMLElement} container
 * @param {{services: any, user: import('../data/typedefs.js').User, afterChange?: () => void,
 *   restoreScroll?: () => void}} ctx
 * @returns {() => void}  cleanup
 */
export function render(container, ctx) {
  const { services, user } = ctx;
  const lang = getLang();
  let alive = true;
  let busy = false;
  /** @type {Awaited<ReturnType<typeof services.getApprovalQueue>> | null} */
  let queue = null;

  mount(
    container,
    html`<section class="panel"><p class="muted">${t('common.loading')}</p></section>`,
  );

  function draw() {
    if (!queue) return;
    const { items, users } = queue;
    if (items.length === 0) {
      mount(
        container,
        html`<section class="panel state">
          <h2>${t('approvals.emptyTitle')}</h2>
          <p class="muted">${t('approvals.emptyBody')}</p>
          <a class="btn" href="#/board">${t('notfound.back')}</a>
        </section>`,
      );
      return;
    }
    mount(
      container,
      html`<section class="queue">
        <p class="queue-count">${t('approvals.count', { n: items.length })}</p>
        ${items.map(
          ({ request: r, workingDays }) => html`<article class="panel queue-item">
            <div class="queue-top">
              <div>
                <p class="card-ref mono">
                  <a href="${requestHash(r.ref)}">${r.ref}</a>
                </p>
                <h2>${r.beneficiary}</h2>
                <p class="mono">
                  <bdi dir="ltr">${fmtAmount(r.amount, r.currency)}</bdi>${
                    r.currency !== 'SAR'
                      ? html` · <bdi dir="ltr">≈ ${fmtAmount(r.amountSar, 'SAR')}</bdi>`
                      : ''
                  }
                </p>
                <p class="muted small">
                  ${t('approvals.requestedBy', { name: personName(users[r.createdById], lang) })}
                </p>
              </div>
              <span class="pill ${workingDays > LATE_AFTER_DAYS ? 'bad' : 'warn'}"
                >${
                  workingDays === 0
                    ? t('approvals.today')
                    : workingDays === 1
                      ? t('approvals.waitingOne')
                      : t('approvals.waitingDays', { n: workingDays })
                }</span
              >
            </div>
            <div class="stage-actions">
              <input
                type="text"
                id="note-${r.id}"
                class="note-input"
                placeholder="${t('detail.notePlaceholder')}"
                aria-label="${t('detail.notePlaceholder')}"
              />
              <button type="button" class="btn primary" data-action="approve" data-id="${r.id}">
                ${t('detail.approve')}
              </button>
              <button type="button" class="btn" data-action="reject" data-id="${r.id}">
                ${t('detail.reject')}
              </button>
              <a class="btn" href="${requestHash(r.ref)}">${t('approvals.open')}</a>
            </div>
          </article>`,
        )}
        <p class="muted small">${t('approvals.ownHint')}</p>
      </section>`,
    );
  }

  async function load() {
    try {
      const result = await services.getApprovalQueue(user);
      if (!alive) return;
      queue = result;
      draw();
      ctx.restoreScroll?.();
    } catch (err) {
      console.error(err);
      if (!alive) return;
      mount(
        container,
        html`<div class="panel state error" role="alert">
          <p>${t('approvals.error')}</p>
          <button type="button" class="btn" data-action="retry">${t('common.retry')}</button>
        </div>`,
      );
    }
  }

  /** @param {string | undefined} id */
  const itemOf = (id) => queue?.items.find((/** @type {any} */ i) => i.request.id === id);

  async function done(toastKey) {
    showToast(t(toastKey));
    ctx.afterChange?.();
    await load();
  }

  const stop = delegate(container, 'click', {
    retry: () => load(),
    approve: async (el) => {
      const item = itemOf(el.dataset.id);
      if (!item || busy) return;
      busy = true;
      const note = /** @type {HTMLInputElement | null} */ (
        container.querySelector(`#note-${item.request.id}`)
      );
      try {
        await services.decideStage(
          user,
          item.request.id,
          item.stage.stageOrder,
          'approve',
          note?.value.trim() ?? '',
          item.request.version,
        );
        await done('detail.approved');
      } catch (err) {
        showToast(errorText(err), { error: true });
        await load(); // the list may be out of date
      } finally {
        busy = false;
      }
    },
    reject: async (el) => {
      const item = itemOf(el.dataset.id);
      if (!item) return;
      const result = await rejectStage(ctx, item.request, item.stage, t('detail.approverRole'));
      if (result) await done('detail.rejected');
    },
  });

  load();

  return () => {
    alive = false;
    stop();
  };
}
