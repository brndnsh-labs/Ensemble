/**
 * What happens next after the server asks this device to wait (a 429), in ONE place (#1478 review
 * R2). Since 2026-10-02 the loop resumes by itself when the back-off ends — while the page is open
 * and visible (`armResume`); a hidden tab resumes when it is shown again. The wait is
 * `BACKOFF_FALLBACK_MS` (a minute) in production, which reads no `Retry-After` today; any wait is
 * clamped to [`BACKOFF_MIN_MS`, `BACKOFF_MAX_MS`] (`backoffWait`, `resumeDelay`).
 */
export const RATE_LIMIT_RESUMES =
    'Uploading continues by itself in about a minute while Ensemble is open, or when you come back to it.';

/**
 * Every failure sentence leads with the local truth. A musician whose Save was refused by the
 * server has not lost anything, and the first thing they need to know is that — the reason comes
 * second, and the server's own vocabulary (`quota_exceeded`, `rate_limited`) never appears.
 */
export const SYNC_MESSAGES = {
    offline: 'Saved on this device · we’ll upload it when you’re back online.',
    rateLimited: `Saved on this device · the server asked us to wait. ${RATE_LIMIT_RESUMES}`,
    quota: 'Saved on this device · your account library is full. Delete a song in the cloud to make room.',
    tooLarge: 'Saved on this device · this chart is too large to upload.',
    /**
     * The one sentence here that does NOT promise a retry, because a retry cannot change the
     * answer: the account has already decided about these exact bytes. "Save it as a copy" is the
     * step that actually works — a new document id and a new operation id are a request the
     * account has never seen.
     */
    refused:
        'Saved on this device · your account refused this upload and retrying won’t change that. Save it as a copy to upload it.',
    expired: 'Saved on this device · sign in again to upload it.',
    server: 'Saved on this device · we couldn’t reach your account library. We’ll try again.',
} as const;

/**
 * The same posture as `SYNC_MESSAGES` for the one operation that is not a Save (#1270): lead with
 * what is true of this device, never print the server's vocabulary, and never claim something was
 * removed that was not — nor that nothing was, when this device cannot know.
 *
 * That last half is why there is no "nothing was deleted" sentence for a dead network or a 5xx.
 * The request may have reached the account and committed there; the reply is what went missing.
 * Saying "Nothing was deleted" would be a guess dressed as a fact, and the one guess this surface
 * must never make — so those outcomes get `uncertain`, which is exactly as much as is known.
 *
 * Deliberately a separate table rather than more `SYNC_MESSAGES` entries: every sentence there
 * begins "Saved on this device", because every one of them is about a Save that is safe here and
 * has not reached the cloud. A delete has the opposite shape — the request is the thing that did
 * or did not happen in the cloud — and stretching that prefix over it would be a template, not
 * an honest sentence.
 */
export const DELETE_MESSAGES = {
    rateLimited: 'Your account asked us to wait. Nothing was deleted — try again shortly.',
    expired: 'Sign in again to delete this from your account. Nothing was deleted.',
    /**
     * The outcome this device cannot see: a dead network, a 5xx, a reply it could not read. The
     * retry is safe to offer because the frozen operation id makes the next attempt a REPLAY —
     * the server answers it from its receipt rather than deleting a second time.
     */
    uncertain:
        'We couldn’t confirm this with your account. It may or may not have been deleted — try again and we’ll finish it safely.',
    /** The account read the request and would not act on it, so nothing in it changed. */
    refused: 'Your account refused this request. Nothing was deleted.',
    /** 409 conflict: the id is live at a revision this request did not expect. */
    changed:
        'This song changed in your account since you opened it. Nothing was deleted — close it, let your account sync, then reopen and try again.',
    /** 404: the owner has no such id and no tombstone for it. */
    absent: 'That song isn’t in your account.',
    /** Local: a record the cloud has never confirmed. There is nothing up there to delete. */
    unconfirmed: 'This song hasn’t reached your account yet, so there’s nothing there to delete.',
    /** The delete landed, but local work meant the copy on this device was kept. */
    retained: 'Deleted from your account. Your unsent work stays on this device.',
    deleted: 'Deleted from your account.',
} as const;

/**
 * The sentences signing out can need beyond the preflight's own counts (#1269, #1351).
 *
 * Revoking the session is the irreversible half and it goes first, so by the time the local wipe
 * can fail the sign-out has already happened — there is no honest way to take it back, and
 * re-attaching a revoked account would strand the shell signed in to a session the server has
 * dropped. What is left is to say what did NOT happen, in the same posture as the tables above:
 * lead with the fact, never print a storage error, and name the step that finishes the job.
 */
export const SIGN_OUT_MESSAGES = {
    /**
     * Signed out, records stayed, and the step that retries the clear IS reachable: the failed
     * clear put the owner back into `meta.active`, so this device still HOLDS the account whose
     * songs are still here and the banner offers "Sign out on this device" for exactly that state.
     */
    notCleared:
        'Signed out — but your account’s songs could not be removed from this device. Use “Sign out on this device” to try again.',
    /**
     * The same outcome with the fence restore ALSO refused (#1351 patch N2), so `meta.active` names
     * nobody, no banner renders, and naming a control that is not on screen would be a instruction
     * to press something that does not exist. A reload is the honest next move: it re-reads storage
     * that may well have recovered by then.
     */
    notClearedStranded:
        'Signed out — but your account’s songs could not be removed from this device. Reload this page and try again.',
    /**
     * "Sign out on this device" that did not happen at all (#1351 patch N2). The fence never moved
     * and not a row was touched, so "Signed out —" would be the one word this sentence must not
     * open with: the device is exactly what it was, and trying again is a real option.
     */
    notChanged: 'Couldn’t sign out on this device — nothing was changed. Try again.',
    /**
     * "Sign out on this device" (#1351) run against an account this device no longer holds —
     * another tab signed in as somebody else while the expired banner was still on screen here.
     * Nothing was removed and nothing was moved: the refusal happens before the fence.
     *
     * Deliberately not `OWNER_MESSAGES.mismatch`, which is a sentence about a CHART on the stand
     * and would tell a musician to export a song this step never mentioned.
     */
    elsewhere:
        'This device is signed in to a different account now, so there was nothing here to sign out of. Sign out from the account that’s signed in.',
} as const;

/**
 * The one sentence an account-store write refused for belonging to SOMEONE ELSE produces (#1311).
 *
 * Deliberately one constant rather than an entry in each table above: the refusal is the same fact
 * whether it stopped a Save, a retained draft, a Keep-both or a cloud delete, and a musician who
 * meets it twice through two different actions must not be told two different stories about which
 * account their chart is in. It is also the only sentence here that is NOT about a document's
 * relationship with the cloud — nothing was attempted against the server at all — so stretching
 * `SYNC_MESSAGES`' "Saved on this device" prefix or `DELETE_MESSAGES`' "nothing was deleted" over
 * it would be a template rather than an honest sentence.
 *
 * It names the two things that actually work: export the chart (a file on the musician's own disk
 * needs no account), or sign back in as the account that holds it. It never suggests a retry,
 * because nothing about trying again changes whose account this device is attached to.
 *
 * **What the fence is for, and what it is deliberately not.** It stops a SILENT crossing: a write
 * the musician never asked to make into this account, produced by a keystroke or a Save landing
 * somewhere they had no way to see. Exporting the chart and then importing that file into the
 * signed-in account is the opposite of that — two deliberate human acts, with a file on disk in
 * between — and it is by design not refused. The sentence says "export it" because that IS the
 * supported way to carry music between accounts on one device.
 */
/** What a collection delete says (#1477). The songs in it are never touched by one. */
export const COLLECTION_MESSAGES = {
    deleted: 'Collection deleted. Its songs are still in your songbook.',
    uploading: 'This collection is still uploading to your account. Try again once it has synced.',
} as const;

export const OWNER_MESSAGES = {
    mismatch:
        'This chart belongs to a different account on this device — export it, or sign back in as that account.',
} as const;
