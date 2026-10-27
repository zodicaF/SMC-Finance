// @ts-check
// Two highlights behind a row of links: one follows the mouse, one slides to the current
// page (the item with aria-current="page"). The bar must contain `.nav-hover` and
// `.nav-indicator`; CSS makes them glide, this file only sets where they go.

/** @typedef {{x: number, y: number, w: number, h: number}} Box */

/** @param {HTMLElement} el @param {Box} box */
function setBox(el, { x, y, w, h }) {
  el.style.transform = `translate(${x}px, ${y}px)`;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
}

/** Moves without animating, e.g. when it first appears. @param {HTMLElement} el @param {Box} box */
function jumpBox(el, box) {
  el.style.transition = 'none';
  setBox(el, box);
  void el.offsetWidth; // apply the jump before the transition comes back
  el.style.transition = '';
}

/** @param {HTMLElement} item @returns {Box} */
const boxOf = (item) => ({
  x: item.offsetLeft,
  y: item.offsetTop,
  w: item.offsetWidth,
  h: item.offsetHeight,
});

/**
 * @param {HTMLElement} bar
 * @param {string} itemSelector  e.g. '.tab'
 * @returns {{place: () => void, destroy: () => void}}  call `place` after the current item
 *   changes or an item changes size; `destroy` when the bar is thrown away
 */
export function attachGlider(bar, itemSelector) {
  const hover = /** @type {HTMLElement} */ (bar.querySelector('.nav-hover'));
  const indicator = /** @type {HTMLElement} */ (bar.querySelector('.nav-indicator'));

  /** @param {boolean} [animate] */
  function place(animate = true) {
    const current = /** @type {HTMLElement | null} */ (
      bar.querySelector(`${itemSelector}[aria-current="page"]`)
    );
    if (!current) {
      indicator.classList.remove('on');
      return;
    }
    const wasShown = indicator.classList.contains('on');
    if (animate && wasShown) setBox(indicator, boxOf(current));
    else jumpBox(indicator, boxOf(current));
    indicator.classList.add('on');
  }

  /** @param {Event} event */
  const onOver = (event) => {
    const item = /** @type {HTMLElement | null} */ (
      /** @type {Element} */ (event.target).closest?.(itemSelector)
    );
    if (!item || !bar.contains(item)) return;
    if (bar.classList.contains('hovering')) setBox(hover, boxOf(item));
    else jumpBox(hover, boxOf(item)); // first entry: appear in place, then glide from there
    bar.classList.add('hovering');
  };
  const onLeave = () => bar.classList.remove('hovering');
  const onResize = () => place(false);

  bar.addEventListener('pointerover', onOver);
  bar.addEventListener('pointerleave', onLeave);
  window.addEventListener('resize', onResize);
  document.fonts?.ready.then(() => place(false)); // widths change once the web fonts arrive

  return {
    place: () => place(true),
    destroy: () => {
      bar.removeEventListener('pointerover', onOver);
      bar.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', onResize);
    },
  };
}
