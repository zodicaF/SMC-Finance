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
    add(
      'p',
      'أغلق أي نافذة أخرى مفتوحة على هذا التطبيق ثم اضغط Ctrl + F5. إن استمرت المشكلة فاضغط "إعادة ضبط بيانات التجربة"، أو أرسل التفاصيل أدناه إلى فريق تقنية المعلومات.',
      'ar',
    );
    add('h2', "The app didn't start", 'en');
    add(
      'p',
      'Close any other tab with this app open, then press Ctrl + F5. If it keeps happening, press "Reset test data", or send the details below to IT.',
      'en',
    );
    add('pre', problems.length ? problems.join('\n') : 'No error was reported; the start-up did not finish.');
    const actions = document.createElement('div');
    actions.className = 'boot-actions';
    box.append(actions);
    /** @param {string} text @param {string} cls @param {() => void} onClick */
    const button = (text, cls, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = text;
      b.addEventListener('click', onClick);
      actions.append(b);
    };
    button('Reload · إعادة التحميل', 'btn primary', () => window.location.reload());
    // Test phase only: the data lives in this browser. Same database name as appContext.js.
    button('Reset test data · إعادة ضبط بيانات التجربة', 'btn', () => {
      try {
        sessionStorage.clear();
      } catch {
        /* storage blocked: nothing to clear */
      }
      const req = indexedDB.deleteDatabase('transfer-tracker');
      req.onsuccess = req.onerror = req.onblocked = () => window.location.reload();
    });
    root.append(box);
  }, 6000);
})();
