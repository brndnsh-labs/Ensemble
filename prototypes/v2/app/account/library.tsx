'use client';

/**
 * The account songbook's surface (#1266): the hook that owns the sync loop's lifecycle, and the
 * status chip that renders `projectSyncStatus`.
 *
 * Both live here because they are one surface — the hook exists to feed the chip and the shell's
 * library reads, and splitting them would put a three-line `useSyncExternalStore` wrapper in a
 * file of its own. Everything that touches `window` or `document` does so in an effect, never
 * during render: none of it exists during the static export's prerender, and the first paint must
 * be the plain guest app regardless.
 *
 * The chip does NOT invent a single verdict. `status.ts` projects three independent facts and
 * this renders three, in their own elements: a Save that is safely on this device and refused by
 * the cloud reads as exactly that, never as one green "saved" badge that would be a lie to the
 * musician who most needs the truth.
 */

import { useEffect, useSyncExternalStore } from 'react';
import type { SessionState } from '../../lib/account/session';
import {
    accountSync,
    type RemoteCandidateKind,
    type SyncSnapshot,
} from '../../lib/account/sync-loop';
import {
    type Progress,
    projectSyncStatus,
    type StatusFacts,
    type StatusView,
} from '../../lib/sync/status';

// Module scope keeps both references stable across renders, which is what `useSyncExternalStore`
// requires to avoid resubscribing (and re-rendering) on every pass.
const subscribe = (listener: () => void) => accountSync.subscribe(listener);
const snapshot = () => accountSync.getSnapshot();

/**
 * Attaches the loop to the signed-in owner, keeps it pointed at the chart on the stand, and
 * registers the only three passive triggers there are: `online`, a `visibilitychange` back to
 * visible, and — from the shell — an explicit Save. No timer, no background sync.
 */
export function useAccountLibrary(
    enabled: boolean,
    session: SessionState,
    activeDocumentId: string | null,
): SyncSnapshot {
    const sync = useSyncExternalStore(subscribe, snapshot, snapshot);
    const owner = enabled && session.status === 'signedIn' ? session.owner : null;

    useEffect(() => {
        if (owner === null) {
            // Signed out: stop using the account store. Nothing local is removed — that is the
            // sign-out preflight's decision (#1269), not a side effect of a header state change.
            accountSync.detach();
            return;
        }
        let alive = true;
        void accountSync.attach(owner).then(() => {
            // Signing in is itself a trigger: the library is downloaded and anything queued from
            // a previous session goes out, without waiting for the musician to do anything.
            if (alive) {
                void accountSync.run();
            }
        });
        return () => {
            alive = false;
        };
    }, [owner]);

    useEffect(() => {
        // Set unconditionally, including to null: "nothing is on the stand" is a fact the
        // download's `isActive` needs as much as a document id.
        accountSync.setActiveDocument(activeDocumentId);
        void accountSync.watch(activeDocumentId);
    }, [activeDocumentId]);

    useEffect(() => {
        if (owner === null) {
            return;
        }
        const trigger = () => {
            void accountSync.run();
        };
        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                trigger();
            }
        };
        window.addEventListener('online', trigger);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('online', trigger);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [owner]);

    return sync;
}

const LOCAL_LABELS = {
    'save-failed': 'Save failed on this device',
    unsaved: 'Unsaved changes',
    unknown: 'Checking this device…',
    saved: 'Saved on this device',
} as const;

const CLOUD_LABELS = {
    unknown: 'Account library not checked yet',
    // #1311 — the chart on the stand is another account's, so there is no cloud fact about it to
    // report at all: the loop can only ask the library this device IS attached to, and that one
    // has never held this song. Short on purpose; the banner above the stand carries the sentence
    // that says what to do, and repeating it in a status chip would be the same words twice.
    foreign: 'Belongs to another account',
    conflict: 'This song differs from your account — choose which to keep',
    // #1270: the one-sided refusal. The cloud has no version to weigh this one against, so the
    // sentence must not offer a choice — it says where the work actually is instead.
    gone: 'No longer in your account — this version is still on this device',
    queued: 'Waiting to upload to your account',
    sending: 'Uploading to your account…',
    confirmed: 'Saved to your account',
    'not-uploaded': 'Not in your account yet',
} as const;

/**
 * #1298: a permanent transport-level refusal, named per document rather than folded into the
 * pass-level `sync.failure` sentence — that one describes whichever document a LAST pass happened
 * to touch, and would silently go stale or point at the wrong song once a later pass runs against
 * a different one. `'too-large'` says what actually fixes it (shrink the chart); `'refused'` names
 * the one action that works (save it under a fresh identity), never the server's own vocabulary.
 */
const CLOUD_REFUSAL_LABELS = {
    'too-large': 'This chart is too large to upload',
    refused: 'Your account refused this upload — save it as a copy',
} as const;

const OFFLINE_LABELS = {
    unknown: 'Checking offline readiness…',
    incomplete: 'Not ready to play offline yet',
    ready: 'Ready to play offline',
} as const;

/** `null`/`null` means unobserved, so there is nothing honest to say about a count. */
function counted(label: string, progress: Progress): string | null {
    if (progress.required === null || progress.verified === null) {
        return null;
    }
    return `${label} ${progress.verified}/${progress.required}`;
}

export interface SyncStatusProps {
    /** The open chart's committed revision on this device, or null when never saved here. */
    savedRevision: number | null | 'unknown';
    editing: 'clean' | 'dirty';
    lastSave: 'idle' | 'failed';
    /** Whether the unsaved-experiment recovery this device keeps is healthy. */
    recovery: StatusFacts['local']['recovery'];
    shell: StatusFacts['offline']['shell'];
    /** The open chart's sound files. Unobserved until something has actually checked. */
    sounds: Progress;
    /**
     * The chart on the stand belongs to an account this device is not attached to (#1311). The
     * shell derives it; this surface only reports it, and it outranks every other cloud reading
     * because the observation beside it describes the wrong library.
     */
    foreign: boolean;
    /**
     * The remote candidate `reconcile` preserved for the OPEN chart, if any (#1362) — the same
     * value the stand's banner reads (`standCandidate?.kind`). Read only to correct the cloud
     * fact below; the chip otherwise knows nothing about candidates.
     */
    candidateKind: RemoteCandidateKind | null;
    sync: SyncSnapshot;
}

/**
 * The projection `SyncStatus` renders, factored out so #1460's stand-level failure notice
 * (`syncFailureNotice` below) can read the exact same facts without duplicating the activity
 * derivation or the `'deleted'`-candidate correction.
 */
function deriveSyncView({
    savedRevision,
    editing,
    lastSave,
    recovery,
    shell,
    sounds,
    foreign,
    candidateKind,
    sync,
}: SyncStatusProps): { view: StatusView; cloudLabel: string } {
    const observation = sync.observation;
    // `status.ts` refuses "sending" without an observed, non-empty queue, and it is right to:
    // claiming an upload is in flight with nothing to send would invent progress the outbox
    // never had. So the claim is built from the queue, not from the loop's optimism.
    const activity: StatusFacts['cloud']['activity'] =
        sync.failure?.reason === 'expired'
            ? 'reauth'
            : sync.failure !== null
              ? 'retry'
              : sync.sending && observation !== null && observation.pendingCount > 0
                ? 'sending'
                : 'idle';
    const view = projectSyncStatus({
        local: { savedRevision, editing, lastSave, recovery },
        cloud: { observation, activity, foreign },
        offline: { shell, documents: sync.documents, sounds },
    });
    // #1362 — `status.ts` reads the record's stale `remoteRevision`, never a candidate: a download
    // that preserves a `'deleted'` candidate beside a HELD record (`commitDeleted`) never clears
    // the record's own `remoteRevision`, on purpose — that field is what the record used to mirror,
    // and a download does not get to edit the held record it declined to overwrite. So a clean
    // mirror of a now-tombstoned song still projects as `'confirmed'`, and this is the one place
    // that is corrected: the SAME words the refused-Save `'gone'` conflict already uses, because it
    // is the same fact ("your account no longer has this song") reached by a different route.
    const cloudLabel =
        candidateKind === 'deleted' && view.cloud.status === 'confirmed'
            ? CLOUD_LABELS.gone
            : view.cloud.status === 'refused'
              ? CLOUD_REFUSAL_LABELS[view.cloud.refused ?? 'refused']
              : CLOUD_LABELS[view.cloud.status];
    return { view, cloudLabel };
}

/**
 * #1460 review P2 #2 — the stand's own notice, keyed by the underlying FACT rather than by its
 * rendered sentence, so a caller can tell "the same failure, reworded" from "a genuinely
 * different one" without string-matching (P3: a 413 moving from `sync.failure`'s pass-level
 * message to `CLOUD_REFUSAL_LABELS`'s per-document one is still the SAME fact and must not
 * reappear after being dismissed just because the words changed — see the export below).
 */
export interface StandSyncFailure {
    text: string;
    /** Stable across a re-word of the same underlying fact; never the sentence itself. */
    key: string;
}

/**
 * #1460 — the one fact worth surfacing on the STAND itself, without opening Song actions: a
 * failure NOTHING ELSE already says. Everything else `SyncStatus` shows (three routine facts)
 * moved into the menu; a `foreign` reading already has its own permanent banner
 * (`OWNER_MESSAGES.mismatch`, driven by the same `standMismatch` this component's `foreign` prop
 * carries), so it is deliberately not repeated here.
 *
 * Re-review P2 #1 — a local Save failure is checked FIRST and DOES surface here, reversing the
 * previous round's assumption that the top `.error-banner` alone covers it: `run()` opens with
 * `setError('')`, so the very next `run()` anywhere — opening Song actions to go check, pressing
 * Play, a feel change — wipes that banner while the local failure is still true. The stand's own
 * notice is keyed independently (`local:save-failed`) and stays up until the NEXT Save actually
 * succeeds, regardless of what else runs in between. `expired`/reauth is still excluded: that
 * banner (`account-expired-banner`, driven by `heldWithoutSession`) is a storage-derived fact,
 * not a `run()`-cleared one, so it genuinely does persist on its own.
 *
 * Re-review P3 — a pass-level `too-large`/`refused` failure (`sync.failure.reason`) is keyed as
 * `refused:<kind>`, the SAME namespace `view.cloud.status === 'refused'`'s per-document reading
 * uses below: a 413 that gets re-worded between the two forms across passes is still one fact,
 * and must not reappear after being dismissed just because the words changed.
 *
 * Null means nothing is left to say here: no local Save failure, no expired-session pass
 * failure, no other pass-level retry/reauth failure, and the cloud has not permanently refused
 * this document.
 */
export function syncFailureNotice(props: SyncStatusProps): StandSyncFailure | null {
    const { view } = deriveSyncView(props);
    if (view.local.status === 'save-failed') {
        return { text: LOCAL_LABELS['save-failed'], key: 'local:save-failed' };
    }
    if (props.sync.failure !== null) {
        const { reason } = props.sync.failure;
        if (reason === 'expired') {
            return null;
        }
        const key =
            reason === 'too-large' || reason === 'refused' ? `refused:${reason}` : `pass:${reason}`;
        return { text: props.sync.failure.message, key };
    }
    if (view.cloud.status === 'refused') {
        const refused = view.cloud.refused ?? 'refused';
        return { text: CLOUD_REFUSAL_LABELS[refused], key: `refused:${refused}` };
    }
    return null;
}

export function SyncStatus(props: SyncStatusProps) {
    const { view, cloudLabel } = deriveSyncView(props);
    const { sync } = props;
    const songs = counted('Songs', view.offline.documents);
    const soundFiles = counted('Sounds', view.offline.sounds);
    return (
        <div className="sync-status" data-testid="sync-status">
            <span className="sync-fact" data-testid="sync-local">
                {LOCAL_LABELS[view.local.status]}
            </span>
            <span className="sync-fact" data-testid="sync-cloud">
                {cloudLabel}
                {view.cloud.status === 'queued' && view.cloud.pendingCount !== null
                    ? ` (${view.cloud.pendingCount})`
                    : ''}
            </span>
            <span className="sync-fact" data-testid="sync-offline">
                {OFFLINE_LABELS[view.offline.status]}
                {songs === null && soundFiles === null
                    ? ''
                    : ` · ${[songs, soundFiles].filter((part) => part !== null).join(' · ')}`}
            </span>
            {sync.failure !== null && (
                <span className="sync-failure" role="status" data-testid="sync-failure">
                    {sync.failure.message}
                </span>
            )}
        </div>
    );
}
