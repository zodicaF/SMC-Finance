// @ts-check
// Browser repository on IndexedDB. Data stays in this browser only: fine for development and
// trying the screens, not for a team. Replaced later by a server or SharePoint implementation.

import { ConflictError } from '../domain/errors.js';
import { riyadhYmd } from '../domain/time.js';

/** @typedef {import('./repository.js').Repository} Repository */

/** @type {Record<string, {keyPath: string, indexes?: [string, string, IDBIndexParameters?][]}>} */
const SCHEMA = {
  users: { keyPath: 'id' },
  settings: { keyPath: 'key' },
  fxRates: { keyPath: 'currency' },
  requests: { keyPath: 'id', indexes: [['ref', 'ref', { unique: true }]] },
  approvals: { keyPath: 'id', indexes: [['requestId', 'requestId']] },
  bankStatus: { keyPath: 'requestId' },
  attachments: { keyPath: 'id', indexes: [['requestId', 'requestId']] },
  blobs: { keyPath: 'id' },
  log: { keyPath: 'id', indexes: [['requestId', 'requestId']] },
  counters: { keyPath: 'key' },
};

/** Promise for one IndexedDB request. @param {IDBRequest} req */
const wrap = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/**
 * @param {{name?: string, indexedDB?: IDBFactory}} [options]  `indexedDB` lets tests pass a fake
 * @returns {Repository & {close: () => Promise<void>}}  `close` is for the dev reset button only
 */
export function createLocalRepository({
  name = 'transfer-tracker',
  indexedDB = globalThis.indexedDB,
} = {}) {
  /** @type {Promise<IDBDatabase>} */
  const dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [store, def] of Object.entries(SCHEMA)) {
        const os = db.createObjectStore(store, { keyPath: def.keyPath });
        for (const [idx, keyPath, opts] of def.indexes ?? []) os.createIndex(idx, keyPath, opts);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  /**
   * Run `fn` inside one transaction. Do not await anything that is not an IndexedDB request
   * inside `fn`, or the transaction closes.
   * @template T
   * @param {string[]} stores
   * @param {'readonly' | 'readwrite'} mode
   * @param {(...s: IDBObjectStore[]) => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async function run(stores, mode, fn) {
    const db = await dbPromise;
    const tx = db.transaction(stores, mode);
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    });
    done.catch(() => {});
    try {
      const out = await fn(...stores.map((s) => tx.objectStore(s)));
      await done;
      return out;
    } catch (err) {
      try {
        tx.abort();
      } catch {
        /* already finished */
      }
      throw err;
    }
  }

  /** @param {string} store */
  const getAll = (store) =>
    run([store], 'readonly', (s) => /** @type {Promise<any[]>} */ (wrap(s.getAll())));
  /** @param {string} store @param {any} value */
  const put = (store, value) =>
    run([store], 'readwrite', async (s) => void (await wrap(s.put(value))));

  return {
    async close() {
      (await dbPromise).close();
    },
    listUsers: () => getAll('users'),
    saveUser: (user) => put('users', user),
    deleteUser: (id) => run(['users'], 'readwrite', async (s) => void (await wrap(s.delete(id)))),
    async getSettings() {
      const rows = await getAll('settings');
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
    saveSetting: (key, value) => put('settings', { key, value }),
    listFxRates: () => getAll('fxRates'),
    saveFxRate: (rate) => put('fxRates', rate),

    nextReference(isoNow) {
      const ymd = riyadhYmd(isoNow);
      return run(['counters'], 'readwrite', async (s) => {
        const key = `ref:${ymd}`;
        const rec = /** @type {any} */ (await wrap(s.get(key)));
        const n = (rec?.last ?? 0) + 1;
        await wrap(s.put({ key, last: n }));
        return `TRF-${ymd}-${String(n).padStart(4, '0')}`;
      });
    },
    listRequests: () => getAll('requests'),
    getRequestById: (id) =>
      run(
        ['requests'],
        'readonly',
        async (s) => /** @type {any} */ ((await wrap(s.get(id))) ?? null),
      ),
    getRequestByRef: (ref) =>
      run(
        ['requests'],
        'readonly',
        async (s) => /** @type {any} */ ((await wrap(s.index('ref').get(ref))) ?? null),
      ),
    insertRequest: (request) =>
      run(['requests'], 'readwrite', async (s) => void (await wrap(s.add(request)))),
    updateRequest: (request, expectedVersion) =>
      run(['requests'], 'readwrite', async (s) => {
        const current = /** @type {any} */ (await wrap(s.get(request.id)));
        if (!current) throw new Error('Request not found');
        if (current.version !== expectedVersion) throw new ConflictError();
        const next = { ...request, version: expectedVersion + 1 };
        await wrap(s.put(next));
        return next;
      }),
    deleteRequest: (id) =>
      run(
        ['requests', 'approvals', 'bankStatus', 'attachments', 'blobs'],
        'readwrite',
        async (requests, approvals, bankStatus, attachments, blobs) => {
          await wrap(requests.delete(id));
          await wrap(bankStatus.delete(id));
          const approvalKeys = /** @type {IDBValidKey[]} */ (
            await wrap(approvals.index('requestId').getAllKeys(id))
          );
          for (const key of approvalKeys) await wrap(approvals.delete(key));
          const fileKeys = /** @type {IDBValidKey[]} */ (
            await wrap(attachments.index('requestId').getAllKeys(id))
          );
          for (const key of fileKeys) {
            await wrap(attachments.delete(key));
            await wrap(blobs.delete(key));
          }
        },
      ),

    async listApprovals(requestId) {
      const rows = await run(
        ['approvals'],
        'readonly',
        (s) => /** @type {Promise<any[]>} */ (wrap(s.index('requestId').getAll(requestId))),
      );
      return rows.sort((a, b) => a.round - b.round || a.stageOrder - b.stageOrder);
    },
    listAllApprovals: () => getAll('approvals'),
    saveApprovals: (rows) =>
      run(['approvals'], 'readwrite', async (s) => {
        for (const row of rows) await wrap(s.put(row));
      }),
    getBankStatus: (requestId) =>
      run(
        ['bankStatus'],
        'readonly',
        async (s) => /** @type {any} */ ((await wrap(s.get(requestId))) ?? null),
      ),
    listBankStatuses: () => getAll('bankStatus'),
    saveBankStatus: (status) => put('bankStatus', status),

    listAttachments: (requestId) =>
      run(
        ['attachments'],
        'readonly',
        (s) => /** @type {Promise<any[]>} */ (wrap(s.index('requestId').getAll(requestId))),
      ),
    async addAttachment(meta, file) {
      const data = await file.arrayBuffer(); // read before opening the transaction
      await run(['attachments', 'blobs'], 'readwrite', async (attachments, blobs) => {
        await wrap(attachments.put(meta));
        await wrap(blobs.put({ id: meta.id, type: meta.mime, data }));
      });
    },
    async openAttachment(id) {
      const rec = await run(
        ['blobs'],
        'readonly',
        async (s) => /** @type {any} */ (await wrap(s.get(id))),
      );
      if (!rec) throw new Error('File not found');
      return new Blob([rec.data], { type: rec.type });
    },

    appendLog: (entry) =>
      run(['log', 'counters'], 'readwrite', async (log, counters) => {
        const rec = /** @type {any} */ (await wrap(counters.get('logSeq')));
        const seq = (rec?.last ?? 0) + 1;
        await wrap(counters.put({ key: 'logSeq', last: seq }));
        await wrap(log.put({ ...entry, seq }));
      }),
    async listLog(requestId) {
      const rows = await run(
        ['log'],
        'readonly',
        (s) => /** @type {Promise<any[]>} */ (wrap(s.index('requestId').getAll(requestId))),
      );
      return rows.sort((a, b) => a.seq - b.seq).map(({ seq: _seq, ...entry }) => entry);
    },
    async listAllLog() {
      const rows = await getAll('log');
      return rows.sort((a, b) => a.seq - b.seq).map(({ seq: _seq, ...entry }) => entry);
    },
  };
}
