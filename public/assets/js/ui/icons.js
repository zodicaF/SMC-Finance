// @ts-check
// Small inline icons for stat tiles (SPEC: KPI tile). Plain strokes, 18px, inherit colour via
// currentColor so they pick up --ink-muted wherever they're placed. Static markup only - never
// put user text through these.

import { html } from './html.js';

const wrap = (body) => html`<svg
  class="tile-icon"
  width="18"
  height="18"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  ${body}
</svg>`;

/** Tray / work queue. */
export const inboxIcon = () =>
  wrap(
    html`<path d="M4 13 7 4h10l3 9" /><path
      d="M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6h-5a3 3 0 0 1-6 0H4Z"
    />`,
  );

/** Time waiting. */
export const clockIcon = () =>
  wrap(html`<circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" />`);

/** Sent back for changes. */
export const undoIcon = () =>
  wrap(html`<path d="M4 10h11a5 5 0 1 1 0 10h-2" /><path d="M8 5 4 10l4 5" />`);

/** Approved / done. */
export const checkCircleIcon = () =>
  wrap(html`<circle cx="12" cy="12" r="8.5" /><path d="m8.5 12.5 2.5 2.5 4.5-5" />`);

/** A document (request submitted). */
export const docIcon = () =>
  wrap(
    html`<path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7Z" /><path
        d="M14 3v4h4M9 12h6M9 16h4"
      />`,
  );

/** A bank building. */
export const bankIcon = () =>
  wrap(html`<path d="M3 10h18L12 4ZM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />`);

/** A person with a tick (an approval). */
export const personCheckIcon = () =>
  wrap(
    html`<circle cx="10" cy="8" r="3.5" /><path d="M3.5 20a6.5 6.5 0 0 1 11-4.7" /><path
        d="m15 18 2 2 4-4"
      />`,
  );

/** A shield with a tick (the final internal approval). */
export const shieldCheckIcon = () =>
  wrap(html`<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Z" /><path d="m9 12 2 2 4-4" />`);

/** Money leaving (transfer executed). */
export const sendIcon = () => wrap(html`<path d="M4 12 20 4l-5 16-3-7Z" /><path d="m12 13 8-9" />`);

/** A badge with a tick (confirmed by the bank). */
export const badgeIcon = () =>
  wrap(
    html`<path
        d="M12 3l2.4 1.8 3 .1.9 2.8 2.3 1.9-.9 2.9.9 2.8-2.3 1.9-.9 2.8-3 .1L12 21l-2.4-1.9-3-.1-.9-2.8-2.3-1.9.9-2.8-.9-2.9 2.3-1.9.9-2.8 3-.1Z"
      /><path d="m9 12 2 2 4-4" />`,
  );

/** A tick. */
export const checkIcon = () => wrap(html`<path d="m5 12.5 4.5 4.5L19 7.5" />`);

/** A cross. */
export const crossIcon = () => wrap(html`<path d="M6 6l12 12M18 6 6 18" />`);

/** Paused / stopped. */
export const pauseIcon = () => wrap(html`<path d="M9 6v12M15 6v12" />`);

/** Needs attention. */
export const alertIcon = () => wrap(html`<path d="M12 7v6M12 17h.01" />`);

/** Filters (sliders). */
export const filterIcon = () =>
  wrap(
    html`<path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle
        cx="10"
        cy="17"
        r="2"
      />`,
  );
