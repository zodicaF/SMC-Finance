// @ts-check
// The storage interface. Services talk only to this. Today it is implemented by
// memoryRepository.js (tests) and localRepository.js (browser IndexedDB); later by a server
// or SharePoint implementation. Every implementation must pass tests/repositoryContract.js.

/**
 * @typedef {import('./typedefs.js').User} User
 * @typedef {import('./typedefs.js').FxRate} FxRate
 * @typedef {import('./typedefs.js').Request} Request
 * @typedef {import('./typedefs.js').Approval} Approval
 * @typedef {import('./typedefs.js').BankStatus} BankStatus
 * @typedef {import('./typedefs.js').AttachmentMeta} AttachmentMeta
 * @typedef {import('./typedefs.js').LogEntry} LogEntry
 */

/**
 * @typedef {Object} Repository
 * @property {() => Promise<User[]>} listUsers
 * @property {(user: User) => Promise<void>} saveUser
 * @property {(id: string) => Promise<void>} deleteUser  hard delete; only safe for a user with no log history
 * @property {() => Promise<Record<string, string>>} getSettings
 * @property {(key: string, value: string) => Promise<void>} saveSetting
 * @property {() => Promise<FxRate[]>} listFxRates
 * @property {(rate: FxRate) => Promise<void>} saveFxRate
 * @property {(isoNow: string) => Promise<string>} nextReference  next TRF-YYYYMMDD-NNNN; never reused
 * @property {() => Promise<Request[]>} listRequests
 * @property {(id: string) => Promise<Request | null>} getRequestById
 * @property {(ref: string) => Promise<Request | null>} getRequestByRef
 * @property {(request: Request) => Promise<void>} insertRequest
 * @property {(request: Request, expectedVersion: number) => Promise<Request>} updateRequest  throws ConflictError when the stored version differs; stores version + 1
 * @property {(id: string) => Promise<void>} deleteRequest  also removes approvals, bank status, files; keeps the log
 * @property {(requestId: string) => Promise<Approval[]>} listApprovals
 * @property {() => Promise<Approval[]>} listAllApprovals
 * @property {(rows: Approval[]) => Promise<void>} saveApprovals  insert or replace by id
 * @property {(requestId: string) => Promise<BankStatus | null>} getBankStatus
 * @property {() => Promise<BankStatus[]>} listBankStatuses
 * @property {(status: BankStatus) => Promise<void>} saveBankStatus
 * @property {(requestId: string) => Promise<AttachmentMeta[]>} listAttachments
 * @property {(meta: AttachmentMeta, file: Blob) => Promise<void>} addAttachment
 * @property {(id: string) => Promise<Blob>} openAttachment
 * @property {(entry: LogEntry) => Promise<void>} appendLog  the log has no update and no delete
 * @property {(requestId: string) => Promise<LogEntry[]>} listLog  oldest first
 * @property {() => Promise<LogEntry[]>} listAllLog  every entry, any request (and admin changes)
 */

/** Every method an implementation must have. Used by the contract test. */
export const REPOSITORY_METHODS = [
  'listUsers',
  'saveUser',
  'deleteUser',
  'getSettings',
  'saveSetting',
  'listFxRates',
  'saveFxRate',
  'nextReference',
  'listRequests',
  'getRequestById',
  'getRequestByRef',
  'insertRequest',
  'updateRequest',
  'deleteRequest',
  'listApprovals',
  'listAllApprovals',
  'saveApprovals',
  'getBankStatus',
  'listBankStatuses',
  'saveBankStatus',
  'listAttachments',
  'addAttachment',
  'openAttachment',
  'appendLog',
  'listLog',
  'listAllLog',
];

export {};
