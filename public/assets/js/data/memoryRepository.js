// @ts-check
// In-memory repository. Used by every test; also handy for trying things without a browser.

import { ConflictError } from '../domain/errors.js';
import { riyadhYmd } from '../domain/time.js';

/** @typedef {import('./repository.js').Repository} Repository */

/** @template T @param {T} v @returns {T} */
const clone = (v) => (v === undefined || v === null ? v : structuredClone(v));

/** @returns {Repository} */
export function createMemoryRepository() {
  const users = new Map();
  const settings = new Map();
  const fxRates = new Map();
  const requests = new Map();
  const approvals = new Map();
  const bankStatus = new Map();
  const attachments = new Map();
  const blobs = new Map();
  /** @type {any[]} */
  const log = [];
  /** @type {Map<string, number>} */
  const refCounters = new Map();

  return {
    async listUsers() {
      return clone([...users.values()]);
    },
    async saveUser(user) {
      users.set(user.id, clone(user));
    },
    async deleteUser(id) {
      users.delete(id);
    },
    async getSettings() {
      return Object.fromEntries(settings);
    },
    async saveSetting(key, value) {
      settings.set(key, value);
    },
    async listFxRates() {
      return clone([...fxRates.values()]);
    },
    async saveFxRate(rate) {
      fxRates.set(rate.currency, clone(rate));
    },

    async nextReference(isoNow) {
      const ymd = riyadhYmd(isoNow);
      const n = (refCounters.get(ymd) ?? 0) + 1;
      refCounters.set(ymd, n);
      return `TRF-${ymd}-${String(n).padStart(4, '0')}`;
    },
    async listRequests() {
      return clone([...requests.values()]);
    },
    async getRequestById(id) {
      return clone(requests.get(id) ?? null);
    },
    async getRequestByRef(ref) {
      return clone([...requests.values()].find((r) => r.ref === ref) ?? null);
    },
    async insertRequest(request) {
      if (requests.has(request.id)) throw new Error('Request id already exists');
      if ([...requests.values()].some((r) => r.ref === request.ref)) {
        throw new Error('Request reference already exists');
      }
      requests.set(request.id, clone(request));
    },
    async updateRequest(request, expectedVersion) {
      const current = requests.get(request.id);
      if (!current) throw new Error('Request not found');
      if (current.version !== expectedVersion) throw new ConflictError();
      const next = { ...clone(request), version: expectedVersion + 1 };
      requests.set(request.id, next);
      return clone(next);
    },
    async deleteRequest(id) {
      requests.delete(id);
      for (const [key, row] of approvals) if (row.requestId === id) approvals.delete(key);
      bankStatus.delete(id);
      for (const [key, meta] of attachments) {
        if (meta.requestId === id) {
          attachments.delete(key);
          blobs.delete(key);
        }
      }
    },

    async listApprovals(requestId) {
      return clone(
        [...approvals.values()]
          .filter((a) => a.requestId === requestId)
          .sort((a, b) => a.round - b.round || a.stageOrder - b.stageOrder),
      );
    },
    async listAllApprovals() {
      return clone([...approvals.values()]);
    },
    async saveApprovals(rows) {
      for (const row of rows) approvals.set(row.id, clone(row));
    },
    async getBankStatus(requestId) {
      return clone(bankStatus.get(requestId) ?? null);
    },
    async listBankStatuses() {
      return clone([...bankStatus.values()]);
    },
    async saveBankStatus(status) {
      bankStatus.set(status.requestId, clone(status));
    },

    async listAttachments(requestId) {
      return clone([...attachments.values()].filter((a) => a.requestId === requestId));
    },
    async addAttachment(meta, file) {
      attachments.set(meta.id, clone(meta));
      blobs.set(meta.id, file); // Blobs are immutable, so no copy is needed
    },
    async openAttachment(id) {
      const blob = blobs.get(id);
      if (!blob) throw new Error('File not found');
      return blob;
    },

    async appendLog(entry) {
      log.push(clone(entry));
    },
    async listLog(requestId) {
      return clone(log.filter((e) => e.requestId === requestId));
    },
    async listAllLog() {
      return clone([...log]);
    },
  };
}
