import { type Dispatch, type RefObject, type SetStateAction, useEffect, useState } from 'react';
import { accountSync, OWNER_MESSAGES, type RemoteUpdate } from '../lib/account/sync-loop';
import type { ChartDocument } from '../lib/runtime';
import * as runtime from '../lib/runtime';
import type { KeepBothResolution } from '../lib/sync/repository';
import { useModalDialog } from './use-modal-dialog';

/** What the shell hands `useStandConflict`. */
interface StandConflictOptions {
    /** The chart on the stand, as this render saw it. */
    current: ChartDocument | null;
    /** The chart as last saved: the baseline an experiment is measured against. */
    saved: ChartDocument | null;
    /** The stand holds a retained draft over the saved chart. */
    sharedDraft: boolean;
    /** The stand has unsaved work (the shell's one `dirty` derivation, #1310 patch R2). */
    dirty: boolean;
    /** The account's newer version of the open song, the one adoptable kind (#1362), or null. */
    standVersionCandidate: RemoteUpdate | null;
    /**
     * The shell's chart equality (`same`, module-level in `ensemble.tsx` beside `sameData`), a
     * prop because importing it from the shell would be an import cycle.
     */
    same: (a: ChartDocument, b: ChartDocument) => boolean;
    /** Drafts kept in this tab only, by document id. */
    volatileDrafts: RefObject<Map<string, ChartDocument>>;
    /** Drafts the account store holds, as this tab believes, by document id. */
    accountDrafts: RefObject<Map<string, ChartDocument>>;
    setCurrent: Dispatch<SetStateAction<ChartDocument | null>>;
    setSaved: Dispatch<SetStateAction<ChartDocument | null>>;
    /** The shell's error line. */
    setError: Dispatch<SetStateAction<string>>;
    /** The stand's message toast (`useStandToast`). */
    setMessage: (text: string) => void;
    setRecoveryHealthy: Dispatch<SetStateAction<boolean>>;
    /** The shell's one-action lock. */
    run: (task: () => void | Promise<void>, quiet?: boolean) => Promise<void>;
    /** The chart with every pending bar committed; throws on one that does not read. */
    updateChart: () => ChartDocument;
    /** The account the stand's chart belongs to, or null. */
    standOwner: () => string | null;
    /** The stand's chart is another account's than the one attached (#1311). */
    standBelongsElsewhere: () => boolean;
    /** Binds the stand to the account a write settled to (#1311 patch review R1). */
    bindStand: (next: { store: 'account'; ownerId: string }) => void;
    /** Records the song as just opened. */
    rememberOpened: (id: string) => void;
    /** Keeps a draft in this tab when storing it failed. */
    retainInTab: (next: ChartDocument, failure: unknown) => void;
    /** Re-reads the songbook. */
    refreshSongs: () => Promise<void>;
    /** Puts a song on the stand: the ordinary path a song arrives by. */
    open: (document: ChartDocument) => Promise<{ current: ChartDocument; saved: ChartDocument }>;
}

/** What the conflict banner, the adopt-remote confirm step and `open()` read back. */
interface StandConflict {
    /** The sentence a refused Keep-both produced (#1267), or null. */
    keepBothFailure: string | null;
    /** The sentence a refused adoption produced (#1310), or null. */
    adoptRemoteFailure: string | null;
    /** The adopt-remote confirm step's `<dialog>`. */
    adoptRemoteDialogRef: RefObject<HTMLDialogElement | null>;
    /** The banner's Keep both (#1267). */
    keepBothVersions: () => void;
    /** The confirm step's Use the account's version (#1310). */
    adoptAccountVersion: () => void;
    /** The banner's Use the account's version: opens the confirm step on the offer as it is now. */
    offerAdoptRemote: () => void;
    /** Closes the confirm step. */
    closeAdoptRemote: () => void;
    /** Drops both refusals' sentences: a new chart on the stand has nothing left to explain. */
    clearConflictFailures: () => void;
}

/**
 * The stand's version conflict (#1267, #1310): the banner's Keep both, and Use the account's
 * version with the confirm step in front of it. The shell keeps the banner's and the step's
 * rendering and the paths these reach (`run`, `updateChart`, `open`, the stand binding); this
 * holds the refusals' sentences, the frozen offer and the step's dialog. Call it after
 * `useStandToast`, for `setMessage`.
 */
export function useStandConflict({
    current,
    saved,
    sharedDraft,
    dirty,
    standVersionCandidate,
    same,
    volatileDrafts,
    accountDrafts,
    setCurrent,
    setSaved,
    setError,
    setMessage,
    setRecoveryHealthy,
    run,
    updateChart,
    standOwner,
    standBelongsElsewhere,
    bindStand,
    rememberOpened,
    retainInTab,
    refreshSongs,
    open,
}: StandConflictOptions): StandConflict {
    // #1267 — the sentence a refused Keep-both produced, rendered inside the banner it was asked
    // from. The banner is not modal, so the shell's own error line is readable too — but the
    // reason belongs beside the button that earned it.
    const [keepBothFailure, setKeepBothFailure] = useState<string | null>(null);
    /**
     * #1310 — the confirm step for taking the account's newer version of the open song.
     *
     * It holds the OFFER, not a boolean (patch R5): the exact update the musician was looking at
     * when they pressed the button, frozen so the compare-and-swap cannot silently re-base. A pass
     * landing a newer version while this step is open used to slide under the confirmation, and the
     * whole point of the CAS is that nobody adopts a version they never saw.
     */
    const [adoptRemoteOffer, setAdoptRemoteOffer] = useState<RemoteUpdate | null>(null);
    /**
     * The sentence a refused adoption produced, rendered in the confirm step AND — once that step
     * has closed itself — in the banner it was opened from. One piece of state for one sentence:
     * whichever of the two surfaces is on screen carries it, and neither shows it twice.
     */
    const [adoptRemoteFailure, setAdoptRemoteFailure] = useState<string | null>(null);
    // #1310 — `offered` is a dependency, not just a guard, for the reason the cloud-delete step's
    // `inAccount` is: the confirm step unmounts when its own question stops existing (a pass
    // adopting the body elsewhere, a Save queued, the chart closed), and an offer left set would
    // spring it open again over the next chart that qualifies.
    //
    // Reads `standVersionCandidate`, not `standCandidate` (#1362): this offer is "Use the account's
    // version", and a `'deleted'` or `'unsupported'` row is never that offer.
    const adoptRemoteOffered = standVersionCandidate !== null;
    const adoptRemoteDialogRef = useModalDialog(adoptRemoteOffer !== null && adoptRemoteOffered);
    useEffect(() => {
        if (adoptRemoteOffer !== null && !adoptRemoteOffered) {
            setAdoptRemoteOffer(null);
        }
    }, [adoptRemoteOffer, adoptRemoteOffered]);
    /**
     * Resolve the refused Save on the stand by keeping both (#1267) — the one way out of a
     * conflicted outbox head, which is otherwise terminal and parks every later Save of this song
     * behind it.
     *
     * The chart KEEPS PLAYING, and that is the whole shape of this. The local line is what is on
     * the stand; the resolution gives it a new identity in storage, and the shell's job is to point
     * `current`/`saved`/`currentStore` at that identity without a bar of the music changing.
     * Nothing is loaded into the runtime, nothing is stopped, no section is re-selected — what
     * moves on `current` is its id, the revision that goes with it (the create is local revision 0,
     * so a later plain Save must name 0, not the number the failed line had reached) and the marked
     * title storage filed it under.
     *
     * The bar editor is committed before any of that, because `current.id` is what those editors
     * are keyed on — see the note inside.
     *
     * The unsaved experiment follows the line rather than the identity the account kept. `current`
     * IS that experiment — the recovery slot and the in-tab map are only where it is persisted — so
     * the carry is to write it under the new id and then drop EVERY writer's slot for the old one,
     * as sign-out does: the old id now holds the account's version, and a slot left under it is
     * this device's chart text sitting beneath a song it is not a draft of.
     *
     * The active claim moves through `setActiveDocument` explicitly rather than being left to the
     * effect that mirrors `current?.id`: effects run after the render that follows a state change,
     * and the pass this resolution triggers reads that id at the moment it commits.
     */
    function keepBothVersions() {
        if (!current) {
            return;
        }
        const owner = standOwner();
        void run(async () => {
            setKeepBothFailure(null);
            if (standBelongsElsewhere()) {
                // #1311, and before the bar editor is committed: keeping both CREATES a line in
                // the attached account's library, and this chart is not that account's. The
                // banner is already withheld for a mismatched stand (`conflict`), so this is the
                // second layer in front of the loop's own — and for that same reason the sentence
                // goes to the shell's error line too, since the banner it would otherwise live in
                // is exactly the thing a mismatch removes.
                setKeepBothFailure(OWNER_MESSAGES.mismatch);
                setError(OWNER_MESSAGES.mismatch);
                return;
            }
            // The editor is committed FIRST, exactly as `save()` does — and for a reason that is
            // specific to this operation. `current.id` is about to change: the pending bars are
            // scoped to it (`useBarDrafts`) and `TempoControl` is mounted with `key={current.id}`,
            // so the change throws away every bar typed but not applied, while `pendingMeasures`
            // stays true and the chip goes on saying "Unsaved changes" about text that no longer
            // exists anywhere. An unparseable bar throws out of here the way it throws out of Save
            // — the editor reopens on the bar that needs fixing, and the resolution has not run.
            const original = updateChart();
            // Recomputed rather than read from the render's `dirty`: the commit above has just
            // folded whatever was pending INTO `original`, so what is unsaved from here is exactly
            // what that document holds over the account's own baseline.
            const experiment = sharedDraft || !!(saved && !same(original, saved));
            // `ownerId` is the scope the transaction settled to, which is what the stand is
            // rebound from below — never this render's snapshot (#1311 patch review R1).
            let resolution: (KeepBothResolution & { ownerId: string }) | null;
            try {
                resolution = await accountSync.keepBoth(original.id, owner);
            } catch (failure) {
                // Written to the banner as well as the shell's error line: the banner is where the
                // button was, and it is the thing the musician is looking at.
                setKeepBothFailure(failure instanceof Error ? failure.message : String(failure));
                throw failure;
            }
            if (resolution === null) {
                // The refusal is already gone — resolved in another tab, or overtaken by a pass.
                // Nothing moved, so nothing here may move either; the list is re-read in case it
                // did elsewhere.
                await refreshSongs();
                return;
            }
            const moved = {
                ...original,
                id: resolution.documentId,
                revision: resolution.document.revision,
                // Storage marks the kept line's title, so the two songs a `version` refusal leaves
                // behind can be told apart in the songbook. The stand has to read the name it is
                // actually filed under: left on the old one, the chip would report an unsaved
                // change nobody made and the next Save would quietly rename it back.
                title: resolution.document.title,
            };
            accountSync.setActiveDocument(moved.id);
            setCurrent(moved);
            // As resolved on this device, like `current` (#1405), or the chip reports a sound
            // resolved on open as an unsaved change.
            setSaved(runtime.withLoadedSounds(resolution.document));
            // The account the transaction actually SETTLED TO, reported back by the loop rather
            // than read from this render's snapshot (#1311 patch review R1).
            bindStand({ store: 'account', ownerId: resolution.ownerId });
            rememberOpened(moved.id);
            if (experiment) {
                // Storage has already re-keyed the rows a PREVIOUS edit captured onto the new id;
                // this is the one live in the editor right now, which no store has seen (#1299).
                volatileDrafts.current.delete(moved.id);
                accountDrafts.current.set(moved.id, moved);
                // Reported only once the store has answered, like `draft()` (#1299 patch review
                // P3): the flag is a claim about a write that can still fail. The success arm sets
                // no message — this resolution has its own sentence below.
                accountSync.recover(moved, moved.revision, resolution.ownerId).then(
                    () => setRecoveryHealthy(true),
                    (failure: unknown) => retainInTab(moved, failure),
                );
            }
            volatileDrafts.current.delete(original.id);
            accountDrafts.current.delete(original.id);
            await refreshSongs();
            setMessage(
                resolution.conflict === 'version'
                    ? 'Kept both · yours is a new song, and your account’s version is back in your songbook'
                    : 'Kept yours as a new song · your account no longer has the original',
            );
        });
    }
    /**
     * Take the account's newer version of the chart on the stand (#1310) — the mirror of
     * `keepBothVersions`, and the only other resolution this product offers for a song two devices
     * have moved apart.
     *
     * Everything about it is the opposite shape of Keep both, which is why it is a second handler
     * rather than a branch inside that one. Keep both keeps this device's music and never touches a
     * bar of it: the chart stays on the stand, playing, and only its identity moves. This gives the
     * music up. So it goes through `open()` — the ordinary path a song arrives on the stand by —
     * which loads the adopted document into the runtime, stops playback on the way (`runtime.load`
     * stops before it applies), sets the saved baseline, re-binds the stand and re-reads whatever
     * recovery there is for that id, which the transaction has just made "none". Re-pointing
     * `current` the way Keep both does would leave the runtime playing the version that was just
     * discarded.
     *
     * The confirm step in front of it is where the discard is agreed to, with the export offered
     * first (`adopt-remote.tsx`). By the time this runs, that has been answered.
     *
     * The revision is the one the CONFIRM STEP was opened against (`adoptRemoteOffer`), not the one
     * this render happens to hold (patch R5). A pass landing a newer version while the step is open
     * would otherwise re-base the compare-and-swap silently, which is the exact thing the CAS
     * exists to prevent: the musician answers about the version they were shown. When they differ,
     * storage answers `'stale'`, the step closes, and the banner behind it is already describing
     * the newer one.
     */
    function adoptAccountVersion() {
        const update = adoptRemoteOffer;
        // The frozen offer names a document as well as a revision, and the step's title comes
        // from `current`: an offer for any other song is not the one this step described.
        if (!current || update === null || update.documentId !== current.id) {
            return;
        }
        // Captured before the awaits, like `owner`: whether anything was at stake is what the
        // closing sentence reports, and by the time it runs `open()` has replaced the chart.
        const discarding = dirty;
        const owner = standOwner();
        void run(async () => {
            setAdoptRemoteFailure(null);
            if (standBelongsElsewhere()) {
                // #1311's second layer, ahead of the loop's own. The banner is already withheld
                // for a mismatched stand, so this is only reachable by a session changing under
                // an open step — and the step is modal, so the sentence goes inside it as well as
                // to the shell's error line.
                setAdoptRemoteFailure(OWNER_MESSAGES.mismatch);
                setError(OWNER_MESSAGES.mismatch);
                return;
            }
            let resolution: Awaited<ReturnType<typeof accountSync.adoptRemoteVersion>>;
            try {
                resolution = await accountSync.adoptRemoteVersion(
                    update.documentId,
                    update.revision,
                    owner,
                );
            } catch (failure) {
                setAdoptRemoteFailure(failure instanceof Error ? failure.message : String(failure));
                throw failure;
            }
            if (typeof resolution === 'string') {
                // Nothing was adopted and nothing local moved. Each refusal is a different fact
                // and gets its own sentence: a newer version arrived (so the choice on screen was
                // about a version that is no longer the one waiting), a Save was queued in the
                // meantime (so the work at stake is no longer only an unsaved experiment), or the
                // divergence is simply gone.
                //
                // The step CLOSES on all three (patch R5), and each sentence then goes to the one
                // surface that is still there to carry it. `'stale'` leaves a banner behind — a
                // newer version is waiting, which is what the refusal was about — so it renders
                // beside the button it belongs to. The other two WITHDRAW the offer: a queued Save
                // hides the banner and a settled divergence removes it, so their sentence goes to
                // the shell instead of into a modal that is about to unmount: the refusal to the
                // error line, and `'none'` to the neutral status line — "up to date" is good news
                // (another tab resolved it), and must not be announced as an alert.
                setAdoptRemoteOffer(null);
                if (resolution === 'stale') {
                    setAdoptRemoteFailure(
                        'A newer version arrived while this was open. Nothing was changed — choose again if you still want it.',
                    );
                } else if (resolution === 'queued') {
                    setError(
                        'You have a saved version of this song waiting to upload. Nothing was changed — let it upload, and your account will offer to keep both.',
                    );
                } else {
                    setMessage(
                        'Your account’s newer version is no longer waiting — this song is up to date here.',
                    );
                }
                await refreshSongs();
                return;
            }
            setAdoptRemoteOffer(null);
            // The experiment this device was holding is gone from the account store, so nothing
            // may go on claiming it here either.
            volatileDrafts.current.delete(update.documentId);
            accountDrafts.current.delete(update.documentId);
            // The STAND moves first, and the list after (patch R3). The transaction has committed
            // either way, so the one thing still at stake is what is on screen: if the library
            // re-read throws first, `open()` never runs and the stand goes on showing the
            // discarded document as clean — and the next keystroke retains it back into the store
            // as a draft of a song that no longer holds that music.
            await open(resolution.document);
            // The account the transaction actually SETTLED TO, reported back by the loop rather
            // than read from this render's snapshot (#1311 patch review R1). `open()` binds the
            // stand from the session a moment earlier; this is the same rule `keepBothVersions`
            // follows, and the two must not disagree about whose library this song is in.
            bindStand({ store: 'account', ownerId: resolution.ownerId });
            // No second draft sweep here, deliberately. A retention this tab fired before the
            // confirm (`draft()` writes fire-and-forget) requested its transaction BEFORE the
            // adoption's, and IndexedDB runs them in request order, so it cannot land after the
            // rows were removed. A sweep after `open()` could only ever catch ANOTHER tab's fresh
            // experiment on the adopted song — work this step never described and may not discard.
            await refreshSongs();
            setMessage(
                discarding
                    ? 'Now showing your account’s version · your unsaved changes were discarded'
                    : 'Now showing your account’s version',
            );
        });
    }

    // #1310 — the `candidate` shape's action opens the confirm step rather than
    // doing anything: this is the one choice here that destroys something. The
    // offer is FROZEN here (patch R5) from `standVersionCandidate`, never the raw
    // `standCandidate` (#1362) — this handler is wired to `'candidate'` alone
    // (`ConflictBanner`'s own routing), but the value it freezes must still never
    // be a `'deleted'`/`'unsupported'` row reached by some future caller.
    function offerAdoptRemote() {
        setAdoptRemoteFailure(null);
        setAdoptRemoteOffer(standVersionCandidate);
    }
    function closeAdoptRemote() {
        setAdoptRemoteOffer(null);
    }
    function clearConflictFailures() {
        setKeepBothFailure(null);
        setAdoptRemoteFailure(null);
    }
    return {
        keepBothFailure,
        adoptRemoteFailure,
        adoptRemoteDialogRef,
        keepBothVersions,
        adoptAccountVersion,
        offerAdoptRemote,
        closeAdoptRemote,
        clearConflictFailures,
    };
}
