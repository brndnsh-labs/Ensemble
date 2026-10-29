import { type Dispatch, type RefObject, type SetStateAction, useEffect, useState } from 'react';
import { forgetAdoptionDecision } from '../lib/account/adopt-guest';
import {
    AccountMismatchError,
    accountSync,
    SIGN_OUT_MESSAGES,
    type SignOutPreflight,
    type SyncSnapshot,
} from '../lib/account/sync-loop';
import { libraryDocuments } from '../lib/documents';
import { exportDocument, exportUnreadable } from '../lib/download';
import type { HomeSlice } from '../lib/home';
import type { ChartDocument } from '../lib/runtime';
import * as runtime from '../lib/runtime';
import type { SignOutMode } from './account/sign-out';
import type { AccountView } from './account/use-account-session';
import { useModalDialog } from './use-modal-dialog';

/**
 * The sign-out preflight (#1269), completed with the unsaved edits the LOOP CANNOT SEE.
 *
 * Since #1299 an account chart's unsaved text IS in the account database, so `signOutPreflight`'s
 * own `drafts` count is the real number and this adds what no store holds: a `volatileDrafts` entry
 * — the tab's in-memory copy of an experiment whose storage write was refused. (Guest recovery
 * slots are never counted here: no build since #1299 writes one under an account id, and #1743
 * retired reading them.) Left uncounted, the step
 * would print "Everything on this device has reached your account", hide Export, label the button a
 * plain "Sign out", and then delete the edit it had just said nothing about.
 *
 * Composed HERE rather than inside the loop on purpose: the loop owns the account database, the
 * shell owns guest storage and this tab's memory, and neither should reach across that line.
 */
function withLocalDrafts(
    plan: SignOutPreflight,
    volatile: Map<string, ChartDocument>,
): SignOutPreflight {
    let held = 0;
    const exposed = new Set(plan.atRisk);
    for (const id of plan.documentIds) {
        if (volatile.has(id)) {
            held += 1;
            exposed.add(id);
        }
    }
    return {
        ...plan,
        drafts: plan.drafts + held,
        // Re-ordered by the library rather than left in set-insertion order, so the export writes
        // its files in the order the musician sees the songs listed.
        atRisk: plan.documentIds.filter((id) => exposed.has(id)),
    };
}

/**
 * The sign-out step's reads, in the order the step needs them (#1299, #1351).
 *
 * The retained drafts are fetched HERE, with the plan, rather than when Export is pressed: that
 * button writes one file per at-risk song inside a single user gesture, and an await between two
 * downloads is how a browser's per-gesture cap starts dropping them. Module-level so the effect
 * that calls it does not take a new function reference as a hook dependency every render.
 *
 * The library comes back too, rather than being read off `accountSongs` at export time. An expired
 * session's step (#1351) has no `accountSongs` at all — the loop detaches, the shell's library
 * state goes null with it, and the songbook on screen is the guest one — so the one list that can
 * serve both steps is the one read here, from the account this device HOLDS.
 *
 * `owner` names that account for the expired step; the ordinary one names nothing and lets the
 * attached scope answer, exactly as #1269 always has.
 */
async function readSignOutPlan(
    volatile: Map<string, ChartDocument>,
    owner: string | null,
): Promise<{
    plan: SignOutPreflight;
    drafts: Map<string, ChartDocument>;
    songs: ChartDocument[];
}> {
    const plan = await accountSync.signOutPreflight(owner);
    return {
        plan: withLocalDrafts(plan, volatile),
        // Not for a row this build cannot read (a text chart, #1740): it has no draft to read
        // and is exported as stored.
        drafts: await accountSync.retainedDrafts(
            plan.atRisk.filter((id) => !plan.unreadable.some((row) => row.documentId === id)),
            owner,
        ),
        songs: libraryDocuments(await accountSync.listLibrary(owner)),
    };
}

/** What the shell hands `useAccountExit`. */
interface AccountExitOptions {
    /** The account session's sign-out and deletion paths, and a refused logout's sentence. */
    account: Pick<
        AccountView,
        'signOut' | 'signOutOnThisDevice' | 'forgetDeletedAccount' | 'signOutFailure'
    >;
    /** The loop's published snapshot: its `owner` is the attached account, or null. */
    sync: Pick<SyncSnapshot, 'owner'>;
    /** The session is signed in. */
    signedIn: boolean;
    /** This device holds an account with no session (#1351): the expired banner is up. */
    heldWithoutSession: boolean;
    /** Which account this device holds on disk, or null (#1351) — the shell's, render reads it. */
    heldOwner: string | null;
    setHeldOwner: Dispatch<SetStateAction<string | null>>;
    /** The owner a deletion ran for in this tab (#1351 patch N1) — the shell's, render reads it. */
    setDeletedOwner: Dispatch<SetStateAction<string | null>>;
    /** The account library, once read (#1441); null is "not read", never "empty". */
    accountSongs: ChartDocument[] | null;
    setAccountSongs: Dispatch<SetStateAction<ChartDocument[] | null>>;
    setAccountHome: Dispatch<SetStateAction<{ owner: string; slice: HomeSlice } | null>>;
    /** The signed-in session's owner, or null. */
    sessionOwner: string | null;
    setCurrent: Dispatch<SetStateAction<ChartDocument | null>>;
    setSaved: Dispatch<SetStateAction<ChartDocument | null>>;
    /** The shell's error line. */
    setError: Dispatch<SetStateAction<string>>;
    /** The songbook's own status line (`homeNotice`). */
    setHomeNoticeState: Dispatch<SetStateAction<string>>;
    /** Drafts kept in this tab only, by document id. */
    volatileDrafts: RefObject<Map<string, ChartDocument>>;
    /** Drafts the account store holds, as this tab believes, by document id. */
    accountDrafts: RefObject<Map<string, ChartDocument>>;
    /** Which songbook the chart on the stand came from (the shell's `StandStore`), or null. */
    currentStore: RefObject<{ store: 'account' | 'guest' } | null>;
    /** The owner this device was already offered the guest-song copy for (#1268 patch P3-6a). */
    adoptOffered: RefObject<string | null>;
    /** The shell's one-action lock. */
    run: (task: () => void | Promise<void>, quiet?: boolean) => Promise<void>;
    /** Unbinds the stand: the only binding these paths write is none. */
    bindStand: (next: null) => void;
    /** Drops every pending bar and the editor's buffers. */
    clearBuffers: () => void;
    /** Re-reads the guest songbook, whatever the session says. */
    refreshGuest: () => Promise<void>;
    /** Which account this device holds, from storage: the shell's module-level `heldAccount`. */
    heldAccount: () => Promise<string | null>;
}

/** What the account page, the sign-out step and the expired banner read back. */
interface AccountExit {
    /** Which sign-out step is open (#1351), or null. */
    signOutStep: SignOutMode | null;
    /** What the open step's preflight found, or null while it is still checking. */
    signOutPlan: SignOutPreflight | null;
    /** The library the open step exports from, read with its plan (#1351). */
    signOutSongs: ChartDocument[] | null;
    /** The sentence the open step shows (#1351 patch R9), or null. */
    signOutFailure: string | null;
    /** The sign-out step's `<dialog>`. */
    signOutDialogRef: RefObject<HTMLDialogElement | null>;
    /** Opens a sign-out step on a fresh question. */
    openSignOut: (mode: SignOutMode) => void;
    /** Closes the sign-out step. */
    closeSignOut: () => void;
    /** The step's confirm (#1269, #1351). */
    signOutOfAccount: () => void;
    /** The step's Export: the at-risk songs only. */
    exportSignOutSongs: () => void;
    /** The step's Sync now: a pass, then the plan read again. */
    syncBeforeSignOut: () => void;
    /** The account page's export-everything offer (#1271). */
    exportAccountSongs: () => void;
    /** The account page's local half of a deletion the server has already done (#1271). */
    onAccountDeleted: () => Promise<void>;
}

/**
 * Leaving an account (#1269, #1271, #1351): Sign out, Sign out on this device, and the local half
 * of Delete my account — the step's state, its preflight, the clears and the exports in front of
 * them. The shell keeps the controls that open the step (the account page, the expired banner),
 * the held and deleted owners render reads, and the paths these reach (`run`, `bindStand`,
 * `useSongbookLibrary`'s `refreshGuest`). Call it after the effect that reads `heldAccount()`, where the sign-out
 * preflight's effects always ran.
 */
export function useAccountExit({
    account,
    sync,
    signedIn,
    heldWithoutSession,
    heldOwner,
    setHeldOwner,
    setDeletedOwner,
    accountSongs,
    setAccountSongs,
    setAccountHome,
    sessionOwner,
    setCurrent,
    setSaved,
    setError,
    setHomeNoticeState,
    volatileDrafts,
    accountDrafts,
    currentStore,
    adoptOffered,
    run,
    bindStand,
    clearBuffers,
    refreshGuest,
    heldAccount,
}: AccountExitOptions): AccountExit {
    // #1269 — the sign-out preflight, and what it found. `null` while the read is still out: the
    // step says "checking" rather than "nothing at stake", which would be a claim.
    // Null when no step is open; otherwise which of the two it is (#1351) — one fact rather than
    // an open flag and a mode that could disagree about which question is on screen.
    const [signOutStep, setSignOutStep] = useState<SignOutMode | null>(null);
    const [signOutPlan, setSignOutPlan] = useState<SignOutPreflight | null>(null);
    /**
     * The account library the open sign-out step exports FROM, read with its plan (#1351).
     *
     * Not `accountSongs`: an expired session has none — the loop detached, so the shell's library
     * state is null and the songbook on screen is the guest one — and the ordinary step is better
     * off with this too, since it is read at the moment the step opens rather than whenever the
     * library list last happened to refresh.
     */
    const [signOutSongs, setSignOutSongs] = useState<ChartDocument[] | null>(null);
    /**
     * The sentence the OPEN step produced, rendered inside its own dialog (#1351 patch R3/R12).
     *
     * A `<dialog>` opened with `showModal()` makes the rest of the tree inert, so `run()`'s error
     * banner — which is where a thrown sign-out refusal used to land — is behind it and cannot be
     * read or dismissed. Both refusals this step can produce go here instead: a confirm refused
     * because another tab signed in as somebody else, and the PREFLIGHT refused for the same
     * reason, which otherwise left the step on "Checking…" forever with nothing said.
     *
     * Cleared by whichever control opens a step, so a stale answer never greets a fresh question.
     */
    const [signOutStepFailure, setSignOutStepFailure] = useState<string | null>(null);
    // The step's guard is its own effect below, beside its comment (`signOutMoot`).
    const signOutMoot =
        (signOutStep === 'session' && !signedIn) ||
        (signOutStep === 'device' && !heldWithoutSession);
    const signOutDialogRef = useModalDialog(signOutStep !== null && !signOutMoot);
    // #1269 — the sign-out preflight. The session state is a dependency, not just a guard, and
    // each step watches the state that gives it a question to ask: the ordinary one is moot the
    // moment the session it would revoke is gone, and the device one (#1351) the moment this
    // device stops holding an account with no session — a fresh sign-in, or its own clear. A flag
    // left set would spring either open again.
    useEffect(() => {
        if (signOutMoot) {
            setSignOutStep(null);
        }
    }, [signOutMoot]);
    // The preflight read is its own effect, keyed on the owner the step is about rather than on
    // the session state: for the ordinary step that is the loop's published owner, which exists
    // only once it actually has a scope, so this cannot race the attach and be left permanently on
    // "checking" for a step opened the moment after signing in. For the expired step (#1351) the
    // loop has no owner to publish and the account this device HOLDS is the answer. Re-read on
    // every open rather than cached — a Save queued since the last time is the work it names.
    useEffect(() => {
        const owner = signOutStep === 'device' ? heldOwner : sync.owner;
        if (signOutStep === null || owner === null) {
            return;
        }
        let alive = true;
        // Named to the loop only for the expired step, which is the one that cannot derive it.
        // The ordinary step names nothing and lets the attached scope answer, as #1269 always has.
        readSignOutPlan(volatileDrafts.current, signOutStep === 'device' ? owner : null)
            .then(({ plan, drafts, songs }) => {
                if (alive) {
                    // Folded in, never assigned over (#1299 patch review P3): this read covers
                    // only the ids it asked about, and replacing the map would drop what this tab
                    // knows about every other song — including the chart it has open.
                    for (const [id, held] of drafts) {
                        accountDrafts.current.set(id, held);
                    }
                    setSignOutSongs(songs);
                    setSignOutPlan(plan);
                }
            })
            .catch((error: unknown) => {
                if (!alive) {
                    return;
                }
                if (error instanceof AccountMismatchError) {
                    // Another tab signed in as somebody else between this step opening and its
                    // read (#1351 patch R12). Caught BY TYPE, not by matching a sentence, and
                    // said INSIDE the dialog — swallowed, this left the step on "Checking…" with
                    // no explanation and a permanently disabled button.
                    setSignOutStepFailure(SIGN_OUT_MESSAGES.elsewhere);
                    return;
                }
                // An unreadable store is not evidence that nothing is at stake, so the step stays
                // on "checking" — which leaves the destructive button disabled.
            });
        return () => {
            alive = false;
        };
        // `volatileDrafts` and `accountDrafts` are the shell's refs: the same objects every
        // render, so naming them re-runs nothing.
    }, [signOutStep, heldOwner, sync.owner, volatileDrafts, accountDrafts]);
    /**
     * What this device does once an account has left it, whichever way the server side was
     * settled (#1915): `signOutOfAccount` after #1269's awaited logout or #1351's dead session,
     * `forgetDeletedAccount` after #1271's server-side deletion. Puts the shell back to a guest
     * device — the account chart's baseline, the stand if it holds an account chart, the account
     * library and home, and this tab's drafts for `documentIds`, every song this account held here.
     */
    function clearDeviceAfterExit(documentIds: readonly string[]) {
        // Unconditional: `saved` is an account chart's committed baseline, and nothing of that
        // account may outlive its exit. (The header's account chip, the way to Sign out, is
        // hidden while a chart is open, so in practice `currentStore` is already null by the
        // time this runs — which is exactly why the guard below must not be what protects
        // `saved`.)
        setSaved(null);
        if (currentStore.current?.store === 'account') {
            setCurrent(null);
            bindStand(null);
            clearBuffers();
        }
        setAccountSongs(null);
        setAccountHome(null);
        accountDrafts.current = new Map();
        for (const id of documentIds) {
            volatileDrafts.current.delete(id);
        }
    }
    /**
     * Sign out of the account (#1269) — the other destructive account operation, and the one where
     * unsent work gets destroyed if nothing stands in front of it.
     *
     * Playback stops FIRST, through the runtime's own entrypoint: the chart on the stand is about
     * to stop existing on this device, and a band playing a song out of a songbook that has been
     * removed is the kind of half-state the fence exists to make impossible everywhere else.
     *
     * Then `accountSync.signOut` does the ordered part — fence, revoke, forget — and this puts the
     * shell back to a guest device around it. A `'kept'` outcome changes nothing at all: the server
     * never confirmed, so the account is still attached, the step stays open, and the sentence the
     * hook captured is what the musician reads.
     *
     * The `'device'` step (#1351) answers the same question for a device that HOLDS an account
     * with no live session, and everything below it is shared: the same ordered local half through
     * the same `accountSync.signOut`, with `revoke` pre-resolved because the session is already
     * dead, and the same cleanup. Only the way the server side is settled differs, and only the
     * outcome differs on the way out — there is no `'kept'` for it, because nothing was asked of a
     * server that could have refused. Its refusals are reported INSIDE the step (patch R3), since
     * the dialog is modal and `run()`'s banner is inert behind it.
     *
     * An account chart's unsaved text is in that account's database (#1299), which `clearAccount`
     * has just emptied; this tab's in-memory drafts go by `documentIds` rather than `atRisk`,
     * since every one of this account's documents is being removed from this device.
     */
    function signOutOfAccount() {
        const documentIds = signOutPlan?.documentIds ?? [];
        // Captured before the awaits: the step can unmount underneath them — an expired session
        // becomes a guest one the moment `markSignedOut` lands — and the cleanup below still has
        // to know which question was answered.
        const step = signOutStep;
        const owner = heldOwner;
        void run(async () => {
            runtime.stop();
            if (step === 'device') {
                // #1351 — no logout round trip and no network at all: the session is already
                // dead. Everything else is #1269's ordered local half, unchanged.
                //
                // A throw here means NOTHING happened — the fence never moved and every row is
                // still on the disk (patch R2) — so the step stays open with the sentence in it
                // and none of the cleanup below runs. Rendered inside the dialog rather than
                // through `run()`, whose banner is in the inert tree behind a modal (patch R3).
                try {
                    if (owner === null) {
                        // Unreachable: the control that sets this step is not rendered without an
                        // account to name. Said out loud rather than returned silently — a
                        // destructive confirm that quietly did nothing is the worst answer here.
                        throw new Error(SIGN_OUT_MESSAGES.elsewhere);
                    }
                    await account.signOutOnThisDevice(owner);
                } catch (failure) {
                    setSignOutStepFailure(
                        failure instanceof Error ? failure.message : String(failure),
                    );
                    return;
                }
            } else if ((await account.signOut()) === 'kept') {
                return;
            }
            // Re-read rather than assumed (#1351 patch R1/R2): normally this device now holds
            // nothing, but a clear that failed after the fence moved has put the owner back, and
            // the offer has to come back with it or there is no way left to try again.
            setHeldOwner(await heldAccount());
            setSignOutStep(null);
            setSignOutPlan(null);
            setSignOutSongs(null);
            clearDeviceAfterExit(documentIds);
            // Read live rather than from the `sync` snapshot this render closed over: the loop
            // publishes this during the sign-out above. A wipe that failed after a confirmed
            // revocation is still a sign-out — but the songs really are still here, so the
            // cheerful sentence would be a lie and the reason has to reach the musician.
            const failure = accountSync.getSnapshot().failure;
            // The "already asked about copying your guest songs" answer (`hasDecidedAdoption`) is
            // deliberately KEPT across a sign-out: #1268's decline is per device and permanent, and
            // the same musician signing back in must not be asked again. Only an account DELETION
            // forgets it (`forgetDeletedAccount`) — that owner can never sign in here again.
            // Read directly rather than through `refreshSongs`: `signedIn` is still true in this
            // closure's render, and that path would ask a loop that no longer has an account.
            await refreshGuest();
            if (failure) {
                setError(failure.message);
                return;
            }
            // #1460 review P3 — Sign out is only reachable from the songbook header (hidden while
            // a chart is open), so `current` is already null by the time this runs and the
            // stand's `message` toast would never be mounted to show it. `homeNotice` is the
            // songbook's own status line for exactly this kind of "state just changed" sentence.
            setHomeNoticeState('Signed out · your guest songbook is unchanged');
        });
    }
    /**
     * The newest local version of one account song (#1269's export precedence, extracted for
     * #1271): this tab's retained draft first, then the account's own retained draft, then the
     * committed library copy. The work an export exists to rescue
     * is exactly the part that is NOT in the library copy, so writing that copy alone would hand
     * back a file missing the very edit the warning was about.
     *
     * Synchronous by design — see `readSignOutPlan` for why the account half is prefetched rather
     * than awaited between two downloads.
     */
    function latestLocalVersion(song: ChartDocument): ChartDocument {
        return volatileDrafts.current.get(song.id) ?? accountDrafts.current.get(song.id) ?? song;
    }
    /**
     * Delete the account (#1271) — what this device does once the server says the account is gone.
     *
     * Playback stops FIRST, for the same reason sign-out stops it: the chart on the stand is about
     * to stop existing on this device. Then the LOCAL half of #1269's sign-out runs
     * (`forgetDeletedAccount` — fence, forget, `markSignedOut`), with no logout round trip in
     * front of it: the delete route already removed the session row and cleared the cookie, so a
     * logout could only answer "already gone". Everything after that is the same shell cleanup
     * sign-out does.
     *
     * Never `signOutPlan`'s ids here: that plan only exists while the sign-out step is open. The
     * account library the shell is already holding is the same set of documents.
     */
    async function forgetDeletedAccount() {
        const owner = heldOwner;
        // Every song this account held here, for this tab's in-memory drafts below. The library
        // the account page asked for (#1441) is normally already read; if not, it is read now,
        // before the local clear removes it — and a read that fails forgets nothing rather than
        // blocking the deletion.
        const documentIds = (
            accountSongs ??
            (await accountSync
                .listLibrary(owner)
                .then(libraryDocuments)
                .catch(() => []))
        ).map((song) => song.id);
        runtime.stop();
        // Remembered BEFORE the await, and whatever it does (#1351 patch N1): from here on this
        // tab must never offer to sign in to `owner`, and the one case that matters is the one
        // where the call below leaves its records behind.
        setDeletedOwner(owner);
        await account.forgetDeletedAccount();
        setHeldOwner(await heldAccount());
        clearDeviceAfterExit(documentIds);
        // Read live rather than from the `sync` snapshot this render closed over, exactly as
        // `signOutOfAccount` does: a wipe that failed after the account was already deleted is
        // still a deletion, but the songs really are still here and the reason has to be said.
        const failure = accountSync.getSnapshot().failure;
        if (owner !== null && failure === null) {
            // #1351 patch R11 — the same `localStorage` key the two sign-out paths sweep, and the
            // clearest case for it: the account does not exist any more, so its per-device answer
            // about copying guest songs is a dangling owner id and nothing else. Gated on the
            // clear having landed, like the sign-out path's (patch N5).
            forgetAdoptionDecision(owner);
            adoptOffered.current = null;
        }
        await refreshGuest();
        if (failure) {
            setError(failure.message);
            return;
        }
        // #1460 review P3 — same reasoning as sign-out above: the account page only opens from
        // the songbook header (hidden while a chart is open), so `current` is already null and
        // `homeNotice` is the line that will actually be on screen.
        setHomeNoticeState('Account deleted · your guest songbook is unchanged');
    }
    /**
     * The account page's export-everything offer (#1271), in front of Delete my account.
     */
    function exportAccountSongs() {
        void run(async () => {
            // EVERY song, unlike the sign-out step's at-risk subset (#1271): the
            // cloud copy is about to stop existing, so "it comes back on the next
            // sign-in" is no longer true of any of them.
            // Read here if the account page's own ask (#1441) has not landed
            // yet — never an empty export standing in for an unread library.
            const library =
                accountSongs ?? libraryDocuments(await accountSync.listLibrary(sessionOwner));
            // Read once, before the first file: the retained drafts are what makes
            // these the newest versions, and awaiting between two downloads is
            // what loses the later ones (#1299). Folded in rather than assigned
            // over, for the reason the sign-out read states.
            for (const [id, held] of await accountSync.retainedDrafts(
                library.map((song) => song.id),
            )) {
                accountDrafts.current.set(id, held);
            }
            // And the rows this build cannot read, as they are stored, read before
            // the first file for the same reason.
            const unreadable = await accountSync.unreadableSongs(sessionOwner);
            for (const song of library) {
                exportDocument(latestLocalVersion(song));
            }
            for (const row of unreadable) {
                exportUnreadable(row);
            }
        });
    }
    // NOT `run(forgetDeletedAccount)`: `run()` silently no-ops when another task
    // is already `working` (e.g. an in-flight autosave), and `runDelete` in
    // `account-page.tsx` calls this only AFTER the server has already deleted the
    // account — a no-op here would leave `runDelete` reporting "deleted" while
    // this device's local half never ran. Called directly, with its own
    // try/catch, so it always runs and still reports a failure the same way
    // `run()` does.
    async function onAccountDeleted() {
        try {
            await forgetDeletedAccount();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }
    // Cleared on every open, so a stale answer never greets a fresh question.
    function openSignOut(mode: SignOutMode) {
        setSignOutPlan(null);
        setSignOutSongs(null);
        setSignOutStepFailure(null);
        setSignOutStep(mode);
    }
    function closeSignOut() {
        setSignOutStep(null);
    }
    // Each step shows only its OWN sentence (#1351 patch R9). `account.signOutFailure`
    // belongs to a refused logout, which is a fact about the session step; rendering
    // it inside the device step would explain a request that step never made.
    const signOutFailure =
        signOutStep === 'device'
            ? signOutStepFailure
            : (signOutStepFailure ??
              (account.signOutFailure !== null && account.signOutFailure.kind !== 'cancelled'
                  ? account.signOutFailure.message
                  : null));
    function exportSignOutSongs() {
        void run(() => {
            // Only the songs holding work the account has not got. The rest of the
            // library is already in the cloud and comes back on the next sign-in,
            // so writing it out too would bury the files that matter.
            for (const id of signOutPlan?.atRisk ?? []) {
                const song = signOutSongs?.find((held) => held.id === id);
                if (!song) {
                    // A row this build cannot read: its stored bytes, as they are.
                    const row = signOutPlan?.unreadable.find((held) => held.documentId === id);
                    if (row) {
                        exportUnreadable(row);
                    }
                    continue;
                }
                // The EDITED bytes, not the committed ones — same precedence as
                // `open()`, shared with #1271's export-everything offer.
                exportDocument(latestLocalVersion(song));
            }
        });
    }
    // Never reachable from the expired step: the button is not rendered there,
    // because a pass needs the session that has just gone.
    function syncBeforeSignOut() {
        void run(async () => {
            await accountSync.run();
            const { plan, drafts, songs } = await readSignOutPlan(volatileDrafts.current, null);
            // Folded in, for the reason the sign-out read states.
            for (const [id, held] of drafts) {
                accountDrafts.current.set(id, held);
            }
            setSignOutSongs(songs);
            setSignOutPlan(plan);
        });
    }
    return {
        signOutStep,
        signOutPlan,
        signOutSongs,
        signOutFailure,
        signOutDialogRef,
        openSignOut,
        closeSignOut,
        signOutOfAccount,
        exportSignOutSongs,
        syncBeforeSignOut,
        exportAccountSongs,
        onAccountDeleted,
    };
}
