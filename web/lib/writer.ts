/**
 * This page load's writer identity, shared by BOTH places an unsaved experiment can be retained
 * (#1299).
 *
 * A recovery is per WRITER, not per device: a duplicated tab is holding its own live experiment on
 * the same song, and neither may silently overwrite the other. So each page load is a separate
 * writer, minted once here rather than per call — recoveries stay discoverable across reloads, and
 * a duplicated tab cannot inherit a live writer identity.
 *
 * It lives in its own module because the two stores that key on it have to agree about it while
 * owning nothing of each other: a guest chart's draft is a `localStorage` slot in
 * `lib/repository.ts`'s namespace, an account chart's is a row in the account database's `drafts`
 * store (`lib/sync/repository.ts`), and which one a draft goes to is decided per chart by the shell.
 *
 * The account store validates this through `identifier()` in `lib/sync/protocol.ts`, so the
 * fallback is spelled inside that grammar too.
 */
export const writerId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'unavailable';
