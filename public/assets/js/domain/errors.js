// @ts-check
// Errors thrown by services and repositories. They carry message KEYS, never sentences,
// so the screen can show them in the current language.

export class RuleError extends Error {
  /**
   * @param {string} key  i18n key such as 'errors.notAllowed'
   * @param {Record<string, any>} [params]  extra data, e.g. { fields } for field errors
   */
  constructor(key, params = {}) {
    super(key);
    this.name = 'RuleError';
    this.key = key;
    this.params = params;
  }
}

export class ConflictError extends Error {
  constructor() {
    super('errors.conflict');
    this.name = 'ConflictError';
    this.key = 'errors.conflict';
  }
}
