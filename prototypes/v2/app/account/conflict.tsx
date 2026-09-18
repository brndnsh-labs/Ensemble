'use client';

/**
 * The way out of a refused Save (#1267).
 *
 * A banner rather than a `<dialog>`, and deliberately: every other account step here is modal
 * because it asks a destructive question that must be answered before anything else happens. This
 * one is the opposite — nothing is at risk, the chart keeps playing, and the musician is free to
 * go on working and decide later. A modal would interrupt a band mid-song to demand an answer to a
 * question that has no wrong choice.
 *
 * There is ONE action, because the contract allows one: `docs/design/ensemble-v2-sync.md` —
 * "Conflicts offer Keep both first. Never merge chord text or choose a winner using wall-clock
 * timestamps"; and "Keeping both creates a fresh document identity through an explicit resolution
 * operation; it does not repurpose the failed ID." No merge, and no "overwrite theirs" — the
 * remote version is a version someone made, and this product does not offer a button that throws
 * one away.
 *
 * Two refusals, two sentences, one action (see `CloudObservation.conflict`):
 *
 * - `version` — the account holds a DIFFERENT version of this song. Both survive: this device's
 *   line moves to a new song, and the account's version takes the original's place here.
 * - `gone` — the account holds no version at all: the song was deleted from it somewhere else
 *   (#1270), or the id it was created under is one the account has tombstoned (#1268). There is
 *   nothing to keep alongside, so the action is labelled for what it actually does, and the word
 *   "both" — which would be a promise about a version the cloud does not have — is not used.
 */

export interface ConflictBannerProps {
    /** Never `'none'`: the shell renders nothing at all in that case. */
    conflict: 'version' | 'gone';
    busy: boolean;
    /** The last attempt's sentence, when one failed. The shell clears it on the next attempt. */
    failure: string | null;
    onKeepBoth: () => void;
}

const COPY = {
    version: {
        title: 'Changed on another device',
        detail: 'Your account has a different version of this song. Keep both saves yours as a separate song and brings the account’s version in here — nothing is merged and nothing is thrown away.',
        action: 'Keep both',
    },
    gone: {
        title: 'No longer in your account',
        detail: 'This song isn’t in your account any more — it was deleted somewhere else. Your version is still here, and your account will keep refusing it under that name until it gets one of its own.',
        action: 'Keep mine as a new song',
    },
} as const;

export function ConflictBanner({ conflict, busy, failure, onKeepBoth }: ConflictBannerProps) {
    const copy = COPY[conflict];
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
                <span>Until then, saves of this song wait on this device.</span>
                {failure !== null && (
                    <span className="sync-failure" data-testid="conflict-failure">
                        {failure}
                    </span>
                )}
            </div>
            <button
                className="btn"
                data-testid="conflict-keep-both"
                disabled={busy}
                onClick={onKeepBoth}
            >
                {copy.action}
            </button>
        </div>
    );
}
