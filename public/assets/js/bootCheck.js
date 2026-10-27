// @ts-check
// If the app has not drawn anything a few seconds after loading, show why instead of a blank
// page. A plain (non-module) script on purpose: it must run even when the app's modules fail
// to load, so it can't use the i18n module and carries its own two-language text.

(function () {
  /** @type {string[]} */
  const problems = [];
  window.addEventListener(
    'error',
    (event) => {
      const target = /** @type {any} */ (event.target);
      if (target && target !== window && (target.src || target.href)) {
        problems.push(`Could not load ${target.src || target.href}`);
      } else {
        problems.push(`${event.message || 'Error'}${event.filename ? ` (${event.filename}:${event.lineno})` : ''}`);
      }
    },
    true,
  );
  window.addEventListener('unhandledrejection', (event) => {
    const reason = /** @type {any} */ (event.reason);
    problems.push(String((reason && (reason.stack || reason.message)) || reason));
  });

  window.setTimeout(() => {
    const root = document.getElementById('root');
    if (!root || root.childElementCount > 0) return;
    const box = document.createElement('section');
    box.className = 'boot-error';
    box.setAttribute('role', 'alert');
    /** @param {string} tag @param {string} text @param {string} [lang] */
    const add = (tag, text, lang) => {
      const el = document.createElement(tag);
      el.textContent = text;
      if (lang) el.setAttribute('lang', lang);
      if (lang === 'ar') el.setAttribute('dir', 'rtl');
      box.append(el);
      return el;
    };
    add('h1', 'تعذّر تشغيل التطبيق', 'ar');
    add('p', 'اضغط Ctrl + F5 لإعادة التحميل. إن استمرت المشكلة فأرسل التفاصيل أدناه إلى فريق تقنية المعلومات.', 'ar');
    add('h2', "The app didn't start", 'en');
    add('p', 'Press Ctrl + F5 to reload. If it keeps happening, send the details below to IT.', 'en');
    add('pre', problems.length ? problems.join('\n') : 'No error was reported; the start-up did not finish.');
    const button = add('button', 'Reload · إعادة التحميل');
    button.setAttribute('type', 'button');
    button.className = 'btn primary';
    button.addEventListener('click', () => window.location.reload());
    root.append(box);
  }, 6000);
})();
