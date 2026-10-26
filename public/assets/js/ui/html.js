// @ts-check
// The only way markup is built. Every value put into a template is escaped, so user text can
// never become HTML. To insert markup that is already safe (a nested template, an array of
// templates) just interpolate it: the result of html`` is recognised and not escaped again.

export class SafeHtml {
  /** @param {string} value */
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

/** @param {unknown} v */
export function escapeHtml(v) {
  return String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** @param {unknown} v @returns {string} */
function render(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(render).join('');
  return escapeHtml(v);
}

/**
 * Tagged template: html`<p class="${cls}">${userText}</p>`
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) out += render(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Mark a string as already safe. Only for constants you wrote yourself, never for user text.
 * @param {string} s */
export const raw = (s) => new SafeHtml(s);
