'use client';

/**
 * The way out of a refused Save (#1267), and of a remote advance this device preserved (#1310,
 * widened #1362).
 *
 * A banner rather than a `<dialog>`, and deliberately: every other account step here is modal
 * because it asks a destructive question that must be answered before anything else happens. This
 * one is the opposite — the chart keeps playing, and the musician is free to go on working and
 * decide later. A modal would interrupt a band mid-song to demand an answer they can give at any
 * time. That still holds with the `candidate` shapes below, because the banner itself risks
 * nothing: the one action here that destroys anything (taking the account's `version`) opens its
 * own confirm step first (`adopt-remote.tsx`), which is where the contract's "discarding requires
 * an explicit confirmation" is met.
 *
 * No merge and no wall-clock winner, in any of the five: `docs/design/ensemble-v2-sync.md` —
 * "Conflicts offer Keep both first. Never merge chord text or choose a winner using wall-clock
 * timestamps"; and "Keeping both creates a fresh document identity through an explicit resolution
 * operation; it does not repurpose the failed ID."
 *
 * Five states, five sentences (see `CloudObservation.conflict` and `SyncSnapshot.candidates`):
 *
 * - `version` — a Save was REFUSED because the account holds a different version. Both survive:
 *   this device's line moves to a new song, and the account's version takes the original's place.
 * - `gone` — the Save was refused and the account holds no version at all: the song was deleted
 *   somewhere else (#1270), or its id is one the account has tombstoned (#1268). There is nothing
 *   to keep alongside, so the action is labelled for what it does and the word "both" — a promise
 *   about a version the cloud does not have — is not used.
 * - `candidate` (#1310) — nothing was refused and nothing is queued. A download found a newer
 *   version and could not apply it, because this device holds an unsaved experiment on that song
 *   or simply has it on the stand, so it was preserved beside the record instead. The one action
 *   is to take the account's version.
 * - `candidate-deleted` (#1362) — the same "nothing refused, nothing queued" shape as `candidate`,
 *   but the preserved kind is `'deleted'`: the account tombstoned this id while local work held it.
 *   There is no version to take, so this shares `gone`'s action instead of `candidate`'s — "Keep
 *   mine as a new song" — which `AccountSongbook.keepBoth` now also settles for a bare `'deleted'`
 *   candidate with an empty queue rather than a refused Save, sourced from the newest LIVE draft
 *   when one holds the record and the saved document otherwise (`liveDraft`'s own rule decides
 *   which — never simply the newest by clock).
 * - `candidate-unsupported` (#1362) — a body this build cannot read, from a newer schema. Nothing
 *   here is ever adoptable and nothing here is ever a local divergence to keep a second copy of —
 *   there is exactly one honest sentence ("update the app") and no button, because no action here
 *   would do anything.
 *
 *   **`version` and `candidate` (not the other three) have two different sentences, and
 *   `unsavedEdits` picks between them** (#1310 patch R2). `reconcile` holds a `version` record on
 *   the OPEN chart alone, so the commonest way to reach `candidate` is with nothing typed at all —
 *   and telling that musician their "unsaved changes" will be discarded invents work they never
 *   did, then points at Save, which the shell disables while the chart is clean. With edits, the
 *   alternative is real and is named in words rather than given a button: saving first is the
 *   ordinary route to `version` above and keeps both lines, and it is not this banner's to perform
 *   — `keepBoth` needs a refused Save in the outbox, and here there is none. `candidate-deleted`
 *   does not need this split: whatever this device holds (a draft, edits, or simply the chart being
 *   open) is preserved by the SAME "Keep mine as a new song" action either way, so there is one
 *   sentence rather than two. `app/account/adopt-remote.tsx` branches on the same `unsavedEdits`
 *   prop, from the same derivation in the shell, so the banner and the confirm step can never
 *   disagree about what a `version` adoption is at stake.
 */

import { REMOTE_UPDATE_MESSAGES } from '../../lib/account/messages';

export interface ConflictBannerProps {
    /** Never `'none'`: the shell renders nothing at all in that case. */
    conflict: 'version' | 'gone' | 'candidate' | 'candidate-deleted' | 'candidate-unsupported';
    busy: boolean;
    /**
     * Does this device hold changes to the open song that no version contains (#1310 patch R2)?
     * Read only by the `candidate` shape, which is the one that can be reached with a perfectly
     * clean chart — the two refusal shapes always follow a Save.
     */
    unsavedEdits: boolean;
    /** The last attempt's sentence, when one failed. The shell clears it on the next attempt. */
    failure: string | null;
    onKeepBoth: () => void;
    /** Opens the confirm step for `'candidate'`. Never called for any other shape. */
    onUseAccountVersion: () => void;
}

const COPY = {
    version: {
        title: 'Changed on another device',
        detail: 'Your account has a different version of this song. Keep both saves yours as a separate song and brings the account’s version in here — nothing is merged and nothing is thrown away.',
        note: 'Until then, saves of this song wait on this device.',
        action: 'Keep both',
        testId: 'conflict-keep-both',
    },
    gone: {
        title: 'No longer in your account',
        detail: 'This song isn’t in your account any more — it was deleted somewhere else. Your version is still here, and your account will keep refusing it under that name until it gets one of its own.',
        note: 'Until then, saves of this song wait on this device.',
        action: 'Keep mine as a new song',
        testId: 'conflict-keep-both',
    },
    candidate: {
        title: REMOTE_UPDATE_MESSAGES.marker,
        detail: 'Your unsaved changes to this song are still here, so the newer version is waiting rather than replacing them. Taking it discards those changes — nothing is merged.',
        note: 'To keep both, save your own version first: your account will offer that as a separate song.',
        action: 'Use the account’s version',
        testId: 'conflict-use-account',
    },
    /**
     * A tombstone this device preserved rather than a refused Save (#1362) — same words as `gone`
     * for the title, because it is the same fact; a different `detail`, because there was never a
     * refusal to describe. The action reuses `gone`'s route: `keepBoth` settles this one from the
     * saved record instead of a queue tail.
     */
    'candidate-deleted': {
        title: REMOTE_UPDATE_MESSAGES.deletedMarker,
        detail: 'Your account no longer has this song — it was deleted somewhere else. Your version is still here.',
        note: 'Keeping it files your copy as a new song in your songbook.',
        action: 'Keep mine as a new song',
        testId: 'conflict-keep-both',
    },
    /** A body this build cannot decode (#1362). No action exists, so none is offered. */
    'candidate-unsupported': {
        title: REMOTE_UPDATE_MESSAGES.unsupportedMarker,
        detail: 'Your account has a version of this song this copy of Ensemble cannot read yet.',
        note: null,
        action: null,
        testId: null,
    },
} as const;

/**
 * The same offer with nothing at stake: this song is simply open here, so the download left the
 * newer version waiting rather than swapping it under the stand mid-song. There is no second line
 * to keep, so the note that names one is dropped entirely rather than softened.
 */
const CLEAN_CANDIDATE = {
    detail: 'This song is open here, so the newer version is waiting rather than replacing it. Taking it brings your account’s version onto the stand.',
    note: null,
} as const;

export function ConflictBanner({
    conflict,
    busy,
    unsavedEdits,
    failure,
    onKeepBoth,
    onUseAccountVersion,
}: ConflictBannerProps) {
    const base = COPY[conflict];
    const copy = conflict === 'candidate' && !unsavedEdits ? { ...base, ...CLEAN_CANDIDATE } : base;
    return (
        <div
            className="conflict-banner"
            role="status"
            data-testid="conflict-banner"
            data-conflict={conflict}
        >
            <div className="conflict-banner-text">
                <strong data-testid="conflict-title">{copy.title}</strong>
                <span>{copy.detail}</span>
                {copy.note !== null && <span>{copy.note}</span>}
                {failure !== null && (
                    <span className="sync-failure" data-testid="conflict-failure">
                        {failure}
                    </span>
                )}
            </div>
            {copy.action !== null && (
                <button
                    className="btn"
                    data-testid={copy.testId}
                    disabled={busy}
                    onClick={conflict === 'candidate' ? onUseAccountVersion : onKeepBoth}
                >
                    {copy.action}
                </button>
            )}
        </div>
    );
}
