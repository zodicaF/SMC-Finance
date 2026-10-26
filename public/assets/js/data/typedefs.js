// @ts-check
// Shapes of the data (see docs/DATA_TABLES.md). Types only; nothing to run.

/** @typedef {'creator' | 'bank_ops' | 'approver' | 'admin'} Role */
/** @typedef {'submitted' | 'bank_created' | 'approving' | 'ready' | 'transferred' | 'returned' | 'cancelled'} RequestStatus */
/** @typedef {'payment_doc' | 'bank_proof' | 'transfer_receipt' | 'approval_evidence' | 'debit_proof'} AttachmentKind */
/** @typedef {'executing' | 'review' | 'debited'} BankState */

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} email
 * @property {string} nameEn
 * @property {string} nameAr
 * @property {Role[]} roles
 * @property {boolean} active
 */

/**
 * @typedef {Object} FxRate
 * @property {string} currency
 * @property {number} rateToSar
 * @property {string} updatedAt
 * @property {string} updatedById
 */

/**
 * @typedef {Object} PaymentDetails
 * @property {string} beneficiary
 * @property {string} bank
 * @property {string} iban
 * @property {string} swiftCode
 * @property {number} amount
 * @property {string} currency
 */

/**
 * @typedef {Object} Request
 * @property {string} id
 * @property {string} ref
 * @property {number} version
 * @property {string} createdById
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string} statusChangedAt
 * @property {RequestStatus} status
 * @property {number} round
 * @property {string} beneficiary
 * @property {string} bank
 * @property {string} iban
 * @property {string} category
 * @property {'internal' | 'external'} movement
 * @property {string} swiftCode  required for `external`, empty for `internal`
 * @property {string} currency
 * @property {number} amount
 * @property {number} fxRate
 * @property {number} amountSar
 * @property {string} purpose
 * @property {string | null} bankCreatedById
 * @property {string | null} bankCreatedAt
 * @property {PaymentDetails | null} bankedDetails  payment details as entered in the bank
 * @property {string | null} transferredById
 * @property {string | null} transferredAt
 * @property {string | null} transferRef
 * @property {string | null} closedReason
 * @property {boolean} isSample
 */

/**
 * @typedef {Object} Approval
 * @property {string} id
 * @property {string} requestId
 * @property {number} round
 * @property {number} stageOrder
 * @property {'pending' | 'approved' | 'rejected'} status
 * @property {string | null} decidedById
 * @property {boolean} onBehalf
 * @property {string | null} evidenceId
 * @property {string | null} note
 * @property {string | null} decidedAt
 */

/**
 * @typedef {Object} AttachmentMeta
 * @property {string} id
 * @property {string} requestId
 * @property {AttachmentKind} kind
 * @property {string} fileName
 * @property {string} mime
 * @property {number} sizeBytes
 * @property {string} uploadedById
 * @property {string} uploadedAt
 */

/**
 * @typedef {Object} BankStatus
 * @property {string} requestId
 * @property {BankState} state
 * @property {string[]} reasons
 * @property {string} note
 * @property {boolean} followedUp
 * @property {string | null} followedUpById
 * @property {string | null} followedUpAt
 * @property {string | null} updatedById
 * @property {string | null} updatedAt
 */

/**
 * @typedef {Object} LogEntry
 * @property {string} id
 * @property {string | null} requestId  null for admin changes
 * @property {string} requestRef
 * @property {string} actorId
 * @property {string} action
 * @property {Record<string, any>} details
 * @property {string} createdAt
 */

/**
 * A file chosen by the user, as the services receive it.
 * @typedef {Object} FileInput
 * @property {string} name
 * @property {string} mime
 * @property {number} size
 * @property {Blob} blob
 */

export {};
