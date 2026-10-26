// @ts-check
// The sign-in interface. The screens only know this shape. Today it is implemented by
// devAuthProvider.js (a "sign in as" picker); later by Microsoft 365 sign-in.

/** @typedef {import('../data/typedefs.js').User} User */

/**
 * @typedef {Object} AuthProvider
 * @property {() => Promise<User | null>} getCurrentUser  null when nobody is signed in or the account is gone
 * @property {() => Promise<User[]>} listSignInChoices  development only: who can be picked
 * @property {(userId: string) => Promise<User>} signIn
 * @property {() => Promise<void>} signOut
 */

export {};
