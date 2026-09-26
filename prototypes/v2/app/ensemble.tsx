'use client';

import { KEY_ORDER } from '@engine/config';
import { decodeChartLink, encodeChartLink } from '@engine/songbook/chart-link';
import type { SemanticScore } from '@engine/songbook/score-types';
import type { InstrumentVoice } from '@engine/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    computeAdoptCandidates,
    forgetAdoptionDecision,
    hasDecidedAdoption,
    libraryDownloaded,
} from '../lib/account/adopt-guest';
import { stripAccountsParam } from '../lib/account/feature';
import { heldAccountBanner } from '../lib/account/messages';
import {
    AccountMismatchError,
    accountSync,
    belongsToAnotherAccount,
    type CloudDeleteResult,
    OWNER_MESSAGES,
    type RemoteUpdate,
    SIGN_OUT_MESSAGES,
    type SignOutPreflight,
} from '../lib/account/sync-loop';
import {
    arrangementOf,
    blankSong,
    convertedCopy,
    extendedScore,
    type SectionChange,
    withFollowFeel,
    withoutMeasure,
    withoutSection,
    withSectionSettings,
} from '../lib/documents';
import { validateEditorText } from '../lib/editor';
import { checkPlayable } from '../lib/engine-mode';
import {
    describeV1Outcome,
    findV1Data,
    hasV1Data,
    importV1,
    planV1Import,
    V1_SESSION_ID,
    type V1Finding,
    type V1ImportPlan,
    v1ImportContext,
    v1ImportOffer,
} from '../lib/import-v1';
import * as repository from '../lib/repository';
import type { ChartDocument } from '../lib/runtime';
import * as runtime from '../lib/runtime';
import {
    hasDeclinedV1Import,
    lastOpenedSong,
    rememberSong,
    rememberV1Import,
    rememberV1ImportDecline,
    rememberV1SessionMark,
    v1ImportLedger,
    v1SessionMark,
} from '../lib/session';
import { withSongMeter } from '../lib/song-meter';
import { allSoundsAvailableOffline, installAllSounds, soundsAvailableOffline } from '../lib/sounds';
import { start } from '../lib/starters';
import type { SavedSong } from '../lib/sync/protocol';
import type { KeepBothResolution } from '../lib/sync/repository';
import type { Progress } from '../lib/sync/status';
import { hasV1SharePayload, openV1ShareLink, stripV1ShareParams } from '../lib/v1-link';
import { AccountEntry } from './account/account-entry';
import { AccountPage } from './account/account-page';
import { AdoptGuestDialog } from './account/adopt-guest';
import { AdoptRemoteDialog } from './account/adopt-remote';
import { ConflictBanner } from './account/conflict';
import { DeleteSongDialog } from './account/delete-song';
import { SyncStatus, useAccountLibrary } from './account/library';
import { type AccountDialogMode, SignInDialog } from './account/sign-in';
import { SignOutDialog, type SignOutMode } from './account/sign-out';
import { useAccountSession, useAccountsSwitch } from './account/use-account-session';
import { ChartSheet } from './chart-sheet';
import { EditPanel } from './edit-panel';
import { FeelSheet, type FeelSnapshot } from './feel-sheet';
import { ImportDialog } from './import-dialog';
import type { MeasureEditorHandle } from './measure-editor';
import { SongHeader } from './song-header';
import { SongMenu } from './song-menu';
import { Songbook } from './songbook';
import { SoundsPanel } from './sounds-panel';
import { TradeSheet } from './trade-sheet';
import { TransportBar } from './transport-bar';
import { useChartView } from './use-chart-view';
import { useOfflineInstall } from './use-offline-install';
import { useStageTheme } from './use-stage-theme';

const same = (a: ChartDocument, b: ChartDocument) =>
    a.title === b.title && JSON.stringify(a.chart) === JSON.stringify(b.chart);

/**
 * Which songbook the chart on the stand came from — and, for an account chart, WHOSE account
 * (#1311).
 *
 * The owner is part of the answer rather than a second ref beside it, because the two are one
 * fact and a pair of them is a pair that can disagree. #1299 carried the owner separately for the
 * draft path only, which left the Save path binding a chart to a STORE and not to a library: expire
 * as A, answer "Sign in again" with B's passkey, and `storeSave` still read `'account'` and filed
 * A's chart — or, on `Save a copy`, a fresh create of A's music — inside B's account.
 *
 * `ownerId` is REQUIRED for an account chart (#1311 patch review R1). An account binding with no
 * owner is an unfenced binding — `belongsToAnotherAccount` reads a null as "makes no claim", so
 * one that survived a change of account would wave every later write straight through, which is
 * precisely the leak this type exists to close. Making it impossible to express beats remembering
 * not to write one, and the two places that produce a binding (`liveStand`, and the owner a
 * committed write reports back) can both always name an account.
 */
type StandStore = { store: 'account'; ownerId: string } | { store: 'guest' };

/**
 * The account library in the order the songbook already reads in (#1266): most recently updated
 * first, exactly as `lib/repository.ts`'s guest `list()` returns it. `AccountSongbook.list` pages
 * in document-ID order instead — the right choice for a resumable cursor, and an arbitrary one to
 * a musician — so the ordering a person sees is the shell's to apply, not storage's to change.
 */
function libraryDocuments(library: SavedSong[]): ChartDocument[] {
    return library
        .map((song) => song.document)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * The sign-out preflight (#1269), completed with the unsaved edits the LOOP CANNOT SEE.
 *
 * Since #1299 an account chart's unsaved text IS in the account database, so `signOutPreflight`'s
 * own `drafts` count is the real number and this adds what no store holds: a `volatileDrafts` entry
 * — the tab's in-memory copy of an experiment whose storage write was refused — and any guest
 * recovery slot left under an account id by a build from before #1299. Left uncounted, the step
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
        let slots = 0;
        try {
            slots = repository.recoverySlotCount(id);
        } catch {
            /* Unreadable storage is not evidence of nothing; the in-tab map still answers. */
        }
        const local = slots + (volatile.has(id) ? 1 : 0);
        if (local > 0) {
            held += local;
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
        drafts: await accountSync.retainedDrafts(plan.atRisk, owner),
        songs: libraryDocuments(await accountSync.listLibrary(owner)),
    };
}

/**
 * Which account this device HOLDS, from storage (#1351 patch R1) — `meta.active`, through the
 * loop rather than by reaching into the repository.
 *
 * Module-level so both readers below share one expression: the effect that watches the
 * transitions which can change it, and the clear, which has just changed it.
 *
 * An unreadable store answers null, which hides the sign-out offer rather than showing one that
 * cannot name what it would clear — the conservative direction, and the same one `heldScope`
 * takes when it refuses.
 */
function heldAccount(): Promise<string | null> {
    return accountSync.heldOwner().catch(() => null);
}

/** Read the live engine values the Feel sheet needs but `ChartDocument` doesn't carry. */
function feelSnapshot(): FeelSnapshot {
    const { playback } = runtime.state();
    return {
        bandIntensity: playback.bandIntensity,
        autoIntensity: playback.autoIntensity,
        metronome: playback.metronome,
        masterVolume: playback.masterVolume,
    };
}

export default function Ensemble() {
    // Two songbooks, never merged and never switched between by a control (#1266, rollout
    // decision 9 S3): the guest library is what a signed-out device plays from, the account
    // library is what a signed-in one plays from, and signing in copies nothing either way.
    const [guestSongs, setGuestSongs] = useState<ChartDocument[]>([]);
    // Null until the account library has actually been read — an empty array is a claim.
    const [accountSongs, setAccountSongs] = useState<ChartDocument[] | null>(null);
    const [current, setCurrent] = useState<ChartDocument | null>(null);
    const [saved, setSaved] = useState<ChartDocument | null>(null);
    /**
     * Which songbook the chart on the stand came from — and whose account it is — or null when
     * nothing is open (#1266, owner-bound since #1311).
     *
     * A session can expire without any user gesture — `createSaveTransport`/`createLibraryTransport`
     * call `session.markExpired()` on any 401 — and `signedIn` flips to false underneath a chart
     * that is still the account's. Without this, `storeSave` would silently re-route to the guest
     * repository: plain Save reports a nonsense conflict, and `Save a copy` (which passes
     * `expected = null`) SUCCEEDS and writes account content into guest IndexedDB.
     *
     * The `ownerId` half answers the other question that store alone could not (#1311): WHICH
     * account. `'account'` is not one destination, it is one per person who has signed in on this
     * device, and every account-store write the shell makes now carries this owner so the loop can
     * refuse one that names somebody else's library.
     *
     * **A ref AND a state mirror, one writer.** The ref is the synchronous read an event handler
     * needs — `newSong` sets it and `storeSave` reads it back in the same tick, and an action must
     * decide against the binding as it is NOW, not as the last render saw it. The state is what
     * RENDER may read, because a ref does not re-render and a mismatch that is a standing fact has
     * to survive on screen (#1311 patch review R5). Both are written only by `bindStand`, so there
     * is one authority with two views rather than two facts that can drift.
     */
    const currentStore = useRef<StandStore | null>(null);
    const [standStore, setStandStore] = useState<StandStore | null>(null);
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const volatileDrafts = useRef(new Map<string, ChartDocument>());
    /**
     * The account drafts this TAB knows about (#1299): the ones it has retained itself, plus a
     * prefetch of the whole at-risk set before each export offer — both of which need an answer
     * synchronously, and the store's is a promise.
     *
     * Never a source of truth. The account database is; this is refreshed from it whenever an
     * export is prepared, replaced by what `open()` reads back, and dropped the moment the account
     * leaves this device.
     */
    const accountDrafts = useRef(new Map<string, ChartDocument>());
    /**
     * The last account this loop actually attached to, null only before the first one. Deliberately
     * NOT cleared on detach: an expiry publishes `owner: null` on its way past, so a ref that
     * followed it could never tell "signed back in as the same account" from "signed in as another
     * one" — which is the only transition the effect below acts on.
     */
    const attachedOwner = useRef<string | null>(null);
    /**
     * Which account this device HOLDS on disk, or null (#1351, storage-derived per patch R1).
     *
     * A STORAGE fact, read through `heldAccount()`, never a mirror of anything in memory. That is
     * the whole correction: an earlier draft followed the loop's published owner, which made the
     * sign-out offer depend on the session state — and `expired` only exists in the page load
     * where a live session lapsed (`session.ts` moves a `signedIn` session to `expired`, and a
     * cold `unknown` straight to `guest`). So a RELOAD of an expired device landed on `guest` with
     * every one of that account's rows still here and nothing on screen able to name them, which
     * is exactly the sequence this story exists for: the device changes hands, and it is restarted
     * in between.
     *
     * Written in two places, one expression: the effect below, on every transition that can change
     * it, and the sign-out cleanup, which has just changed it and re-reads rather than assuming —
     * a clear that failed after the fence moved puts the owner back (patch R2), and the offer has
     * to come back with it or the retry is unreachable.
     */
    const [heldOwner, setHeldOwner] = useState<string | null>(null);
    /**
     * The owner a DELETION ran for in this tab, when its local clear did not finish (#1351 patch
     * N1). In-memory on purpose: it is the one thing storage cannot tell us apart — `meta.active`
     * naming an account looks identical whether that account still exists or was deleted a second
     * ago — and a reload legitimately falls back to the generic held-account sentence, which stays
     * true. What it buys is that this tab never offers to sign in to an account it just deleted.
     */
    const [deletedOwner, setDeletedOwner] = useState<string | null>(null);
    const [recoveryHealthy, setRecoveryHealthy] = useState(true);
    // #1266 — whether the LAST explicit Save failed locally. `status.ts` ranks that above an
    // older successful revision, so it cannot be inferred from `saved` and needs its own fact.
    const [saveFailed, setSaveFailed] = useState(false);
    const working = useRef(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [editing, setEditing] = useState(false);
    const [sectionId, setSectionId] = useState('');
    const [buffers, setBuffers] = useState(new Map<string, string>());
    const [measureId, setMeasureId] = useState('');
    const [pendingMeasures, setPendingMeasures] = useState(false);
    const measureEditor = useRef<MeasureEditorHandle>(null);
    const pendingText = useRef(false);
    const [lastOpened, setLastOpened] = useState<string | null>(null);
    const [editorRequest, setEditorRequest] = useState(0);
    const revealedEditorRequest = useRef(0);
    const [search, setSearch] = useState('');
    const [playing, setPlaying] = useState(false);
    const [playbackPending, setPlaybackPending] = useState(false);
    const [active, setActive] = useState<number | null>(null);
    // #1211 — id of the section a practice loop is armed/running on, or null.
    // Polled alongside playing/active below; the engine is the source of truth.
    const [loopedSectionId, setLoopedSectionId] = useState<string | null>(null);
    const { stage, toggleTheme } = useStageTheme();
    const [following, setFollowing] = useState(true);
    const offline = useOfflineInstall();
    const [menu, setMenu] = useState(false);
    const [importing, setImporting] = useState(false);
    const [soundProgress, setSoundProgress] = useState('');
    const [soundsOffline, setSoundsOffline] = useState<boolean | null>(null);
    const [allSoundsOffline, setAllSoundsOffline] = useState<boolean | null>(null);
    const [soundMenu, setSoundMenu] = useState(false);
    const [feelMenu, setFeelMenu] = useState(false);
    const [tradeMenu, setTradeMenu] = useState(false);
    // `bandIntensity`/`autoIntensity`/`metronome`/`masterVolume` are not part of
    // `current.chart` (`STATE_OWNERSHIP_MANIFEST`: session-only or a device
    // preference, never a document field) — this is the shell's own reactive mirror
    // of the live engine values the Feel sheet reads, refreshed whenever it opens.
    const [feel, setFeel] = useState<FeelSnapshot>(() => feelSnapshot());
    const [showControls, setShowControls] = useState(false);
    const [pendingSound, setPendingSound] = useState<{ lane: string; value: string } | null>(null);
    // #1278 — a distinct busy flag from `busy` (which `run()` sets for every
    // action) so the audio-export Cancel button in `SongMenu` stays clickable
    // for the whole render, not just disabled the instant the export starts.
    const [exportingAudio, setExportingAudio] = useState(false);
    const [exportAudioProgress, setExportAudioProgress] = useState('');
    const [recoveryOptions, setRecoveryOptions] = useState<
        ReturnType<typeof repository.recoveriesFor>
    >([]);
    // A chart opened from a `#chart=` share link: unsaved by definition (no `saved`
    // baseline), until "Keep a copy" commits it as a normal library document.
    const [sharedDraft, setSharedDraft] = useState(false);
    // Set only when the Clipboard API is unavailable or the write is rejected
    // (notably the Playwright WebKit project, which grants no clipboard
    // permission) — the visible fallback the acceptance criteria calls for.
    const [shareLinkFallback, setShareLinkFallback] = useState<string | null>(null);
    const sharedLinkHandled = useRef(false);
    // Accounts are on by default since the cutover (#1262, flipped by #1357); `?accounts=off` is
    // the per-device way out, and it silences the entry point, the dialog and every `/api/*`
    // request. `accounts.turnOn` is the way back, offered on the songbook — the parameter is
    // stripped from the URL the moment it applies, so it cannot be the only route. `ready` gates
    // the session read so it lands after the songbook is up; nothing here is ever awaited by
    // startup.
    const accounts = useAccountsSwitch();
    const accountsOn = accounts.enabled;
    const account = useAccountSession(accountsOn && ready);
    const [accountDialog, setAccountDialog] = useState<AccountDialogMode | null>(null);
    // The account page (#1264: passkeys, sessions, recovery code) is a second, independent
    // dialog from the sign-in one above — opening it never touches `accountDialog`, and vice
    // versa, so the two can't fight over the same `showModal()`/`close()` pair.
    const [accountPageOpen, setAccountPageOpen] = useState(false);
    // #1270 — the cloud-delete confirm step, and the sentence the last refused attempt produced.
    // Both are the shell's, because the shell owns every `<dialog>` in this app.
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteFailure, setDeleteFailure] = useState<string | null>(null);
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
    // #1268 — copy this device's guest songs into the account: opened automatically once per
    // (device, owner) after a sign-in that finds candidates and has not been answered yet, and
    // manually from the account page's "Add this device's songs" button at any later time.
    const [adoptOpen, setAdoptOpen] = useState(false);
    /**
     * Which guest songs the OPEN offer is about (#1359), or null for the whole guest songbook.
     *
     * Only the post-import path sets it: a signed-in import writes the guest songbook, and the
     * offer that follows is the second half of that one gesture, so it asks about the songs that
     * just landed rather than about every guest song this device happens to hold. State rather
     * than a ref because the dialog recomputes its offer from it, and cleared by whichever control
     * opens or closes an offer so a scope can never outlive the import it came from.
     */
    const [adoptScope, setAdoptScope] = useState<readonly string[] | null>(null);
    /**
     * The owner this device has already been OFFERED the copy for during this attach (#1268 patch
     * review P3-6a). `hasDecidedAdoption` only remembers an ANSWER, so an escaped prompt — Escape
     * or the backdrop, deliberately not a decision — was re-opened by the very next `accountDialog`
     * transition. A ref rather than state: nothing renders from it, and it must not re-trigger the
     * effect that writes it. Cleared when the owner goes null, so the next sign-in asks again.
     */
    const adoptOffered = useRef<string | null>(null);
    /**
     * Is an offer on screen right now (#1359 patch P2-2)?
     *
     * A mirror of `adoptOpen` rather than the state itself, because the sign-in effect below must
     * be able to BAIL on it without taking it as a dependency: in the dependency array it would
     * re-run the moment a dialog closed, and an offer the musician escaped without answering would
     * be reopened as the whole-songbook question — the nag `adoptOffered` exists to prevent.
     */
    const adoptOnScreen = useRef(false);
    // #1266 — signed in, the songbook IS the account library. `current?.id` is the chart on the
    // stand: the loop hands it to the download's `isActive` so a remote update can never be
    // swapped in underneath whoever is playing.
    const signedIn = accountsOn && account.session.status === 'signedIn';
    /**
     * #1269 — this device WAS signed in and the server no longer agrees, in THIS page load. Still
     * what the sync chip reads: it is a fact about the session, and "sign in again to upload it"
     * is only true while the queue's own explanation is on screen beside it.
     */
    const expiredSession = accountsOn && account.session.status === 'expired';
    /**
     * This device HOLDS an account and has no live session for it (#1351 patch R1) — the banner's
     * condition, and the one state in which "Sign out on this device" exists.
     *
     * Two routes into it, and the honest condition covers both because it asks storage rather than
     * the session: the session lapsed in this page load (`expired`), or it lapsed and the page was
     * reloaded, which lands on `guest` with `meta.active` unchanged. `unknown` is excluded, not
     * treated as guest — before the first session read this device does not know whether it has a
     * live session, and offering to clear the account on that basis would be a guess.
     *
     * A plain guest device that has never signed in holds nothing, so `heldOwner` is null and this
     * is false without the session state ever mattering.
     */
    const heldWithoutSession =
        accountsOn &&
        heldOwner !== null &&
        (account.session.status === 'expired' || account.session.status === 'guest');
    /**
     * Which of the three things that banner is about (#1351 patch N1) — because ONE sentence said
     * in all three states is a lie in two of them. `deleted` outranks the session state: this tab
     * watched the account go, and "sign in again" must never be offered for it.
     */
    const banner = heldAccountBanner(
        heldOwner !== null && heldOwner === deletedOwner
            ? 'deleted'
            : account.session.status === 'expired'
              ? 'expired'
              : 'guest',
    );
    const sync = useAccountLibrary(accountsOn, account.session, current?.id ?? null);
    /**
     * Does the chart on the stand belong to an account this device is NOT attached to (#1311)?
     *
     * Derived at RENDER time, from the state mirror rather than the ref, because this is a
     * standing fact and not an event: it has to survive `run()`'s `setError('')`, a re-render, a
     * press of Play, and anything else that clears a transient line. It is also why `bindStand`
     * writes state at all — a ref alone could be true for minutes with nothing on screen saying so
     * (#1311 patch review R5).
     *
     * `sync.owner` is the loop's published owner; `standStore.ownerId` is the account the chart
     * was bound to when it was opened or last committed. The same comparison the handlers make
     * through `standBelongsElsewhere`, over the same predicate — this one reads the mirror, that
     * one reads the ref, because a render may only read state and an action must read the truth
     * as of now.
     */
    const standMismatch =
        standStore?.store === 'account' && belongsToAnotherAccount(standStore.ownerId, sync.owner);
    /**
     * Is the chart on the stand one the ACCOUNT holds a confirmed copy of (#1270)?
     *
     * All five clauses are load-bearing. `signedIn` and `currentStore` together are what keep a
     * guest chart, and an account chart whose session lapsed underneath it, out of a destructive
     * cloud operation — the same pairing `storeSave`'s expiry guard rests on. `sync.observation` is
     * the watched document's own cloud fact, read from storage rather than inferred, and a null
     * `remoteRevision` means the cloud has never acknowledged this song: there is nothing up there
     * to delete, so the action is not offered rather than offered and then refused.
     *
     * `standMismatch` is the fifth (#1311). In practice the observation clause already answers it
     * — B's store holds no record for A's document id, so `remoteRevision` is null — but that is a
     * coincidence of two facts lining up, and the question "may this device act on this chart's
     * account copy?" deserves to be asked outright rather than inferred.
     */
    const inAccount =
        accountsOn &&
        signedIn &&
        standStore?.store === 'account' &&
        !standMismatch &&
        sync.observation?.remoteRevision != null;
    /**
     * Is the Save at the head of this song's outbox refused, and which way (#1267)?
     *
     * Deliberately NOT `inAccount`: that answer also requires a confirmed `remoteRevision`, and a
     * `gone` conflict is precisely the case where there is none — an adoption refused by a
     * tombstone (#1268) never had one. The three clauses that are shared are the ones that decide
     * whether this chart is the account's at all: a guest chart, and an account chart whose session
     * lapsed underneath it, have no account queue to be stuck in.
     *
     * The observation is the watched document's own cloud fact, read from storage by the loop —
     * `useAccountLibrary` keeps it pointed at `current?.id` — so this is never inferred from a
     * request result.
     *
     * A chart whose account is not the one attached is not the account's at all as far as this
     * device is concerned (#1311), so the banner — whose only button WRITES — is not offered.
     */
    const conflict: 'none' | 'version' | 'gone' =
        accountsOn &&
        signedIn &&
        standStore?.store === 'account' &&
        !standMismatch &&
        current !== null
            ? (sync.observation?.conflict ?? 'none')
            : 'none';
    /**
     * The remote advance this device preserved for the chart on the stand, or null (#1310).
     *
     * The same five clauses `conflict` rests on — this is the same kind of fact about the same
     * chart, and a banner whose only button WRITES must not be offered for a song this device is
     * not attached to the account of.
     *
     * The SIXTH is the queue, and it is the one that decides whether this is an OFFER at all.
     * Adoption is refused outright for a document with anything in its outbox
     * (`AccountSongbook.adoptRemoteVersion`), because the work it discards has to be work the
     * musician never committed — so with a Save waiting, this would be a button that provably
     * cannot do anything. That case is not silent: the chip reads "Waiting to upload", the row in
     * the songbook still carries its marker, and the pass that sends that Save is what turns this
     * into an ordinary refused-Save conflict with Keep both on it.
     */
    const standCandidate =
        accountsOn &&
        signedIn &&
        standStore?.store === 'account' &&
        !standMismatch &&
        current !== null &&
        sync.observation?.pendingCount === 0
            ? (sync.candidates.find((update) => update.documentId === current.id) ?? null)
            : null;
    /**
     * Which shape the one banner above the stand is in (#1267, #1310), or `'none'`.
     *
     * A refused Save outranks a preserved candidate, and the two genuinely can coexist — a download
     * that met a parked outbox preserves a body beside it. The refusal is the state that blocks
     * every later Save of this song, and it is the one `keepBoth` resolves; the candidate is
     * reachable again the moment it is resolved.
     */
    const standBanner: 'none' | 'version' | 'gone' | 'candidate' =
        conflict !== 'none' ? conflict : standCandidate !== null ? 'candidate' : 'none';
    /**
     * The songs the songbook marks (#1310). Ids only: the list needs to know WHICH rows, and the
     * revision beside each one is the stand's business — it is what an adoption is compared
     * against, and a presentational list has nothing to compare.
     */
    const candidateIds = sync.candidates.map((update) => update.documentId);
    // `?? []` is the LIST, not the claim: "we haven't read the account library yet" is carried
    // separately to the songbook as `loading`, so an unread library never renders as an empty one.
    const songs = signedIn ? (accountSongs ?? []) : guestSongs;
    // Two things the songbook cannot yet claim: WHICH library this is (the first session read is
    // still out — rendering the guest list and then swapping it for the account library is a
    // wrong answer, not a loading state), and, once signed in, what the account library holds.
    // `settled` flips on any answer, so an offline cold start still shows the guest songbook.
    const songbookLoading =
        (accountsOn && ready && !account.settled) || (signedIn && accountSongs === null);
    // The band/sound defaults a brand-new or imported song is built from. It falls back to the
    // guest starters because a fresh account's library is legitimately empty, and "New song" and
    // "Import" must still work on the very first visit after signing in.
    const template = songs[0] ?? guestSongs[0];
    // #1274 — the v1 import offer: what this browser's old-Ensemble profile holds
    // (`finding`), what is still on offer after the ledger (`offer`), and the result
    // line of a run that just happened. Read once, after the songbook is ready.
    // `asked` is how this offer got here: the musician chose it from the song menu, rather
    // than the app opening it on its own. It decides whether the card may show over an
    // ACCOUNT songbook (patch R2) — an unasked one may not, because the songs land in the
    // guest songbook and nobody asked about that library.
    const [v1Data, setV1Data] = useState<{
        finding: V1Finding;
        offer: V1Finding;
        asked: boolean;
    } | null>(null);
    const [v1Result, setV1Result] = useState<string | null>(null);
    // Does this origin hold an old-Ensemble profile at all? Separate from `v1Data`, which is
    // only ever the CURRENT offer: the song menu's way back is shown for as long as there is
    // v1 data on this device, including after everything has been imported or declined.
    const [v1Present, setV1Present] = useState(false);
    const v1Checked = useRef(false);
    /**
     * What pressing Import would actually do, decided by the SAME verdict the run uses
     * (#1274 patch N2) against the songbook as it is right now.
     *
     * In state rather than derived at render: reaching the verdict converts the v1 session
     * (and any progression not yet here) through the canonical codec, and it reads the
     * session mark out of `localStorage` — neither belongs in a render body (patch N6). The
     * effect below recomputes it whenever the offer or the songbook moves.
     */
    const [v1Plan, setV1Plan] = useState<V1ImportPlan>({ fresh: 0, alreadyHere: 0, blocked: [] });
    const dialog = useRef<HTMLDialogElement>(null);
    const accountDialogRef = useRef<HTMLDialogElement>(null);
    const accountPageDialogRef = useRef<HTMLDialogElement>(null);
    const deleteDialogRef = useRef<HTMLDialogElement>(null);
    const signOutDialogRef = useRef<HTMLDialogElement>(null);
    const adoptDialogRef = useRef<HTMLDialogElement>(null);
    const adoptRemoteDialogRef = useRef<HTMLDialogElement>(null);
    const soundsDialog = useRef<HTMLDialogElement>(null);
    const feelDialog = useRef<HTMLDialogElement>(null);
    const tradeDialog = useRef<HTMLDialogElement>(null);
    const file = useRef<HTMLInputElement>(null);
    const scroll = useRef<HTMLDivElement>(null);
    const editPanel = useRef<HTMLElement>(null);
    const hasPendingText = buffers.size > 0 || pendingMeasures;
    const text =
        buffers.get(sectionId) ??
        (current
            ? arrangementOf(current).sections.find((section) => section.id === sectionId)?.value
            : '') ??
        '';
    const dirty = hasPendingText || sharedDraft || !!(current && saved && !same(current, saved));
    const playbackActive = playing || playbackPending;
    const focused = playbackActive && !showControls && !editing;

    useEffect(() => {
        let alive = true;
        start()
            .then((result) => {
                if (alive) {
                    setGuestSongs(result);
                    setLastOpened(lastOpenedSong());
                    setReady(true);
                }
            })
            .catch((e) => {
                if (alive) {
                    setError(String(e.message || e));
                }
            });
        const timer = window.setInterval(() => {
            const state = runtime.state();
            setPlaying(state.playback.isPlaying);
            setActive(state.playback.isPlaying ? state.chords.lastActiveChordIndex : null);
            setLoopedSectionId(runtime.loopedSection());
        }, 60);
        const preventLoss = (event: BeforeUnloadEvent) => {
            if (volatileDrafts.current.size || pendingText.current) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', preventLoss);
        return () => {
            alive = false;
            window.clearInterval(timer);
            window.removeEventListener('beforeunload', preventLoss);
        };
    }, []);
    useEffect(() => {
        // Runtime must be initialized (awaited inside `start()`, gated on `ready`)
        // before `runtime.load` is safe to call.
        if (!ready || sharedLinkHandled.current) {
            return;
        }
        // Latched HERE, before anything is decided, because a share link is a property of the
        // page LOAD and nothing else (#1279 patch R1). Latching only when a link was found
        // left this effect armed on an ordinary URL, and it re-reads `window.location` on
        // every run: a same-document fragment navigation (pasting a `#chart=` URL into the
        // tab the musician is already working in — the browser does nothing) followed by any
        // re-run would then open the stranger's chart over the stand and discard unsaved
        // chord text. `template` is in the dependency array for `useExhaustiveDependencies`
        // and is harmless with the latch in front of it; it is already resolved on the first
        // `ready` render, since `start()`'s `.then` batches `setGuestSongs` with `setReady`.
        sharedLinkHandled.current = true;
        const hash = window.location.hash;
        const search = window.location.search;
        // Which entry, if either, owns this page load (#1279 patch R5) — in order:
        //   1. a `#chart=` fragment, so the modern link always wins where both are present;
        //   2. otherwise a v1 `?s=`/`?prog=` payload, INCLUDING under an unrelated fragment
        //      (a `#:~:text=` scroll anchor, a chat client's `#`) that is nobody's share link;
        //   3. otherwise any other non-empty hash, which stays on the v2 path so a corrupt
        //      `#chart=…` still says so.
        // The `chart` key is `chart-link.ts`'s `CHART_LINK_KEY`; read here rather than
        // imported because `public/` is live v1 production code this story does not touch.
        const chartFragment = new URLSearchParams(hash.replace(/^#/, '')).has('chart');
        const entry = chartFragment ? 'v2' : hasV1SharePayload(search) ? 'v1' : hash ? 'v2' : null;
        if (!entry) {
            return;
        }
        let alive = true;
        // Effect-local, so both entries open the SAME draft rather than two drifting copies
        // of it, and so `useExhaustiveDependencies` has nothing to object to: a
        // component-scope function declaration is a new reference every render, which biome
        // rightly rejects as a hook dependency. Deliberately not `open()`: no `saved`
        // baseline (so it can't masquerade as already committed), no recovery-storage write
        // (the sender's document id is untrusted and shouldn't collide with this device's
        // own recovery keys), and `lastOpened`/`rememberSong` are left alone since this
        // isn't a library entry yet. "Keep a copy" (`keepSharedCopy`) is what turns it into
        // one.
        const openSharedDraft = (link: ChartDocument, note: string) => {
            const document = withFollowFeel(link);
            runtime.load(document);
            setSaved(null);
            setCurrent(runtime.withLoadedSounds(document));
            // A shared draft belongs to no songbook yet; "Keep a copy" decides that.
            // `bindStand` inlined: a component-scope function is a new reference every
            // render, which useExhaustiveDependencies rightly rejects as a dependency.
            currentStore.current = null;
            setStandStore(null);
            setSharedDraft(true);
            // Inlined clearBuffers()/selectSection(): both are plain function
            // declarations (a new reference every render), which
            // useExhaustiveDependencies rightly rejects as hook dependencies.
            pendingText.current = false;
            setBuffers(new Map());
            setPendingMeasures(false);
            measureEditor.current?.reset();
            setRecoveryHealthy(true);
            setEditing(false);
            setFollowing(true);
            setMessage(note);
            const section = arrangementOf(document).sections[0];
            setSectionId(section.id);
            if (document.schemaVersion === 2) {
                setMeasureId(
                    document.chart.score.sections.find((s) => s.id === section.id)!.measures[0].id,
                );
            }
        };
        // Consumed on load either way: a corrupt/foreign payload must not resurrect on
        // reload, and a successfully opened draft must not resurrect after "Keep a copy"
        // replaces it with a saved document. The hash goes, the v1 parameters go (#1279),
        // and so does the account flag — a share link must never carry a feature-flag side
        // effect (`accountsFlagRequest` refuses to APPLY one; leaving it in the tidied URL
        // would just let the next reload apply it instead). Everything else survives.
        const consumeLink = () =>
            window.history.replaceState(
                null,
                '',
                window.location.pathname +
                    stripV1ShareParams(stripAccountsParam(window.location.search)),
            );
        if (entry === 'v1') {
            // The band and tempo defaults for the two fields v1 never persisted; see
            // `linkSession` for how little else of this actually reaches the chart. A
            // songbook with nothing in it yet falls back to the live engine's defaults.
            const older = openV1ShareLink(
                search,
                template
                    ? { performance: template.chart.performance, band: template.chart.band }
                    : runtime.captureContent(),
            );
            consumeLink();
            if (older.kind === 'ok') {
                openSharedDraft(older.document, 'Opened from an older shared link · not saved yet');
            } else {
                setError("This older link couldn't be opened");
            }
            return;
        }
        void decodeChartLink(hash).then((document) => {
            consumeLink();
            if (!alive) {
                return;
            }
            if (document) {
                openSharedDraft(document, 'Opened from a shared link · not saved yet');
            } else {
                setError(
                    'This link could not be opened. It may be corrupted or made with a different version of the app.',
                );
            }
        });
        return () => {
            alive = false;
        };
    }, [ready, template]);
    useEffect(() => {
        // #1274 — look for v1 data only once the songbook is ready: guest startup owns
        // the critical path, and nothing here may delay or block it. A profile whose v1
        // data is corrupt still reaches this (findV1Data reports it as a problem), and a
        // storage read that throws outright leaves the stand exactly as it was.
        if (!ready) {
            return;
        }
        try {
            // Two `getItem`s (patch R3). Whether this origin has an old-Ensemble profile AT
            // ALL is what decides the song menu's permanent way back (DECISION 2026-09-19) —
            // it has to stay there after everything has been imported or declined — and it
            // must not cost a decode of up to 500 saved progressions on every single load.
            if (!hasV1Data(window.localStorage)) {
                return;
            }
            setV1Present(true);
            // Signed in, the songbook on screen is the ACCOUNT library and this import writes
            // the guest one, so nothing is opened unasked: the menu entry — which `v1Present`
            // keeps visible — is the way in, and says where the songs land (patch R2). The
            // one-shot latch is deliberately NOT set on this path, so signing out later still
            // gets the offer.
            if (signedIn || hasDeclinedV1Import() || v1Checked.current) {
                return;
            }
            v1Checked.current = true;
            const finding = findV1Data(window.localStorage);
            const offer = v1ImportOffer(finding, v1ImportLedger());
            if (offer.sources.length || offer.problems.length) {
                setV1Data({ finding, offer, asked: false });
            }
        } catch {
            // The old app's data is a bonus, never a prerequisite for playing here.
        }
    }, [ready, signedIn]);
    // `draftsHeldFor` is a stable component-scope helper, not a value this effect should
    // re-run for; its real inputs are the three states in the array below.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see above.
    useEffect(() => {
        // #1274 patch N2 — what the card may promise, from the run's own verdicts. Off the
        // render path (it converts through the codec and reads the mark), and re-derived
        // whenever the offer or the songbook moves, which includes right after a run.
        if (!v1Data) {
            setV1Plan({ fresh: 0, alreadyHere: 0, blocked: [] });
            return;
        }
        const base = current ?? guestSongs[0];
        if (!base) {
            return;
        }
        try {
            setV1Plan(
                planV1Import(
                    v1Data.offer,
                    v1ImportContext(v1Data.finding, {
                        performance: base.chart.performance,
                        band: base.chart.band,
                    }),
                    new Map(
                        guestSongs.map((song) => [
                            song.id,
                            { document: song, drafts: draftsHeldFor(song.id) },
                        ]),
                    ),
                    v1SessionMark(),
                ),
            );
        } catch {
            // A plan is a nicety; never let it take the songbook down. The run itself
            // reaches its own verdicts and reports whatever it finds.
        }
    }, [v1Data, guestSongs, current]);
    useEffect(() => {
        if (editing && !busy && editorRequest !== revealedEditorRequest.current) {
            // Reveal the actual input, including an already-open editor's selected section.
            revealedEditorRequest.current = editorRequest;
            const input = editPanel.current?.querySelector<HTMLTextAreaElement>('textarea');
            input?.focus({ preventScroll: true });
            editPanel.current?.scrollIntoView({ block: 'start' });
            input?.scrollIntoView({ block: 'nearest' });
        }
    }, [editing, editorRequest, busy]);
    useEffect(() => {
        if (menu) {
            dialog.current?.showModal();
        } else {
            dialog.current?.close();
        }
    }, [menu]);
    useEffect(() => {
        if (soundMenu) {
            soundsDialog.current?.showModal();
        } else {
            soundsDialog.current?.close();
        }
    }, [soundMenu]);
    useEffect(() => {
        if (accountDialog) {
            accountDialogRef.current?.showModal();
        } else {
            accountDialogRef.current?.close();
        }
    }, [accountDialog]);
    // #1266 — the account library is re-read on sign-in and whenever the loop reports it changed
    // on disk (a Save committed, a download advanced or removed a record). `sync.owner` rather
    // than `signedIn` is the gate: it is published only once the loop has a scope, so the first
    // read cannot race the attach. Nothing here touches `current`/`saved` — the list changing is
    // never allowed to change the chart on the stand.
    // `libraryVersion` is not read in the body: it is the loop's "the stored library moved"
    // signal, and re-running this read is exactly why the effect depends on it.
    // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate re-run trigger.
    useEffect(() => {
        if (sync.owner === null) {
            setAccountSongs(null);
            return;
        }
        let alive = true;
        accountSync
            // Named (#1351 patch R6): `listLibrary` resolves through `heldScope`, which answers
            // from `meta.active` when nothing is attached, so an unnamed read is a storage read
            // with no owner to check it against. This effect is keyed on the loop's own published
            // owner, so naming it can only ever agree — until it does not, and then it is refused
            // rather than rendered as somebody else's library.
            .listLibrary(sync.owner)
            .then((library) => {
                if (alive) {
                    setAccountSongs(libraryDocuments(library));
                }
            })
            .catch((e: unknown) => {
                if (alive) {
                    setError(e instanceof Error ? e.message : String(e));
                }
            });
        return () => {
            alive = false;
        };
    }, [sync.owner, sync.libraryVersion]);
    /**
     * Which chart to continue, from the songbook that is live (#1299). An account's own "last
     * opened" is in its database, so signing in adopts it and signing out falls back to the guest
     * key — the alternative being a Continue card pointing at a song this device cannot open.
     *
     * Keyed on `sync.owner` for the same reason the reads above are: it is published only once the
     * loop has a scope, so this cannot race the attach.
     *
     * It is also where a change of ACCOUNT used to CLEAR the stand (#1299 patch review P2). A
     * session can expire under an account chart and "Sign in again" can be answered with a
     * different passkey; the loop then attaches B while the stand still holds A's song, and the
     * next keystroke or Save would file A's chart under B.
     *
     * #1311 keeps the chart instead, and takes the refusal to the writes themselves: the stand is
     * bound to its owner (`currentStore`), every account-store write the shell makes carries that
     * owner, and the loop compares it to the scope it holds. Pulling the song off the stand was
     * the blunter half of the old stopgap and it cost the musician the one thing that always
     * works — A's chart is not in B's library, so once it is gone from the stand there is nothing
     * left on this device to export it FROM. Keeping it costs nothing: the writes are refused at
     * two independent layers, the destructive cloud actions are not offered (`inAccount`,
     * `conflict`), and the refusal sentence names export as the way out.
     *
     * `accountDrafts` still goes, because it is this tab's cache of A's account rows and B's
     * database is what answers now. The chart on the stand does not need it — `current` IS the
     * text, and `exportSong` writes `current`.
     *
     * Nothing here announces the mismatch any more (#1311 patch review R5). It used to set the
     * shell's error line once, which the very next `run()` wiped — pressing Play was enough — and
     * left the musician with a Save button and a chip that both invited the one action guaranteed
     * to be refused. The mismatch is a STANDING fact, so it is derived at render (`standMismatch`)
     * and rendered for as long as it holds, rather than fired as an event.
     */
    useEffect(() => {
        if (sync.owner === null) {
            accountDrafts.current = new Map();
            setLastOpened(lastOpenedSong());
            return;
        }
        const previous = attachedOwner.current;
        attachedOwner.current = sync.owner;
        if (previous !== null && previous !== sync.owner) {
            // The chart on the stand is deliberately left where it is: `standMismatch` renders
            // the explanation, both layers refuse every write, and playback is none of this
            // effect's business — the old stopgap stopped the band because it was about to take
            // the chart away, and nothing about a change of account makes the music unplayable.
            accountDrafts.current = new Map();
        }
        let alive = true;
        accountSync
            .lastOpened()
            .then((id) => {
                if (alive) {
                    setLastOpened(id);
                }
            })
            .catch(() => {
                /* A preference that will not read is simply no preference. */
            });
        return () => {
            alive = false;
        };
    }, [sync.owner]);
    useEffect(() => {
        if (accountPageOpen) {
            accountPageDialogRef.current?.showModal();
        } else {
            accountPageDialogRef.current?.close();
        }
    }, [accountPageOpen]);
    // `inAccount` is a dependency, not just a guard: the confirm step unmounts when the answer
    // turns false (a session expiring under an account chart is the realistic way), and a flag
    // left true would spring the dialog open again on the next chart that qualifies.
    useEffect(() => {
        if (!inAccount) {
            setDeleteOpen(false);
            return;
        }
        if (deleteOpen) {
            deleteDialogRef.current?.showModal();
        } else {
            deleteDialogRef.current?.close();
        }
    }, [deleteOpen, inAccount]);
    /**
     * #1351 patch R1 — read which account this device HOLDS, from storage.
     *
     * Deliberately off the guest first-paint path, on three counts: `ready` means the guest
     * songbook is already up, `settled` means the first session read has answered (or the
     * deadline released it), and `accountsOn` is false for a device that opted out — which since
     * #1357 is the only device that skips this entirely, the default having flipped to on.
     * Nothing here is ever awaited by startup or by playback.
     *
     * `unknown` is excluded rather than read: the answer would be fine, but acting on it is not —
     * see `heldWithoutSession`.
     *
     * `sync.owner` is not read in the body: it is the loop's "I attached or detached" signal, and
     * `attach` is what moves `meta.active` to a new owner — re-running this read is exactly why
     * the effect depends on it. The only other thing that moves the pointer is the clear, which
     * writes `heldOwner` itself rather than going round through a counter.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate re-run trigger.
    useEffect(() => {
        if (!accountsOn || !ready || !account.settled || account.session.status === 'unknown') {
            return;
        }
        let alive = true;
        void heldAccount().then((owner) => {
            if (alive) {
                setHeldOwner(owner);
            }
        });
        return () => {
            alive = false;
        };
    }, [accountsOn, ready, account.settled, account.session.status, sync.owner]);
    // #1269 — the sign-out preflight. The session state is a dependency, not just a guard, and
    // each step watches the state that gives it a question to ask: the ordinary one is moot the
    // moment the session it would revoke is gone, and the device one (#1351) the moment this
    // device stops holding an account with no session — a fresh sign-in, or its own clear. A flag
    // left set would spring either open again.
    useEffect(() => {
        const moot =
            (signOutStep === 'session' && !signedIn) ||
            (signOutStep === 'device' && !heldWithoutSession);
        if (signOutStep === null || moot) {
            if (moot) {
                setSignOutStep(null);
            }
            signOutDialogRef.current?.close();
            return;
        }
        signOutDialogRef.current?.showModal();
    }, [signOutStep, signedIn, heldWithoutSession]);
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
    }, [signOutStep, heldOwner, sync.owner]);
    useEffect(() => {
        // Mirrored here rather than written during render, the way the dialog itself mirrors its
        // own `open` prop: one place that knows whether a question is on screen (#1359).
        adoptOnScreen.current = adoptOpen;
        if (adoptOpen) {
            adoptDialogRef.current?.showModal();
        } else {
            adoptDialogRef.current?.close();
        }
    }, [adoptOpen]);
    /**
     * What the post-import offer is decided against, as of the LATEST render (#1359 patch P1-2).
     *
     * `importV1Songs` awaits a whole import run before it decides whether to open the offer, and
     * `signedIn`/`sync` inside it are the snapshots of whichever render defined that handler — the
     * moment the button was pressed. Two things really go wrong when the run is the slow one: a
     * session that expires mid-run still passes a stale `signedIn` and sets `adoptOpen` true while
     * the dialog is no longer rendered (the flag sticks, and the account page's button is then a
     * no-op for the rest of the page load, since `adoptOpen` never transitions), and a library
     * that finishes downloading mid-run is still read as not downloaded and says nothing at all.
     *
     * So the three facts are re-read from here after the awaits. A ref updated on every commit,
     * not state: nothing renders from it, and it must not re-run anything.
     */
    const adoptGate = useRef({
        signedIn,
        owner: sync.owner,
        documents: sync.documents,
    });
    // No dependency array on purpose: this is a mirror of the current render, not a reaction to
    // one particular field changing.
    useEffect(() => {
        adoptGate.current = { signedIn, owner: sync.owner, documents: sync.documents };
    });
    /**
     * An offer cannot outlive the session it is about (#1359 patch P1-2).
     *
     * The dialog only renders while signed in, so a sign-out (or an expiry) with one on screen
     * takes the dialog away without touching `adoptOpen` — which then stays true, and every later
     * `setAdoptOpen(true)` is a no-op transition that never reaches `showModal`. Clearing the flag
     * with the session is what keeps the account page's standing button working after signing back
     * in during the same page load.
     */
    useEffect(() => {
        if (!signedIn) {
            setAdoptOpen(false);
            setAdoptScope(null);
        }
    }, [signedIn]);
    // #1310 — `offered` is a dependency, not just a guard, for the reason the cloud-delete step's
    // `inAccount` is: the confirm step unmounts when its own question stops existing (a pass
    // adopting the body elsewhere, a Save queued, the chart closed), and an offer left set would
    // spring it open again over the next chart that qualifies.
    const adoptRemoteOffered = standCandidate !== null;
    useEffect(() => {
        if (!adoptRemoteOffered) {
            setAdoptRemoteOffer(null);
            return;
        }
        if (adoptRemoteOffer !== null) {
            adoptRemoteDialogRef.current?.showModal();
        } else {
            adoptRemoteDialogRef.current?.close();
        }
    }, [adoptRemoteOffer, adoptRemoteOffered]);
    /**
     * #1268 — offer the copy once per sign-in, once this device can actually tell what the account
     * already holds. `sync.owner` is the right dependency for the same reason the preflight effect
     * above uses it rather than `signedIn`: it is published only once `attach` actually has a
     * scope, so this cannot race it and open on a scope that isn't ready to be read from yet.
     *
     * `libraryDownloaded(sync.documents)` is the P0 gate (#1268 patch review): the offer is a DIFF
     * against the account library, and `attach` publishes `UNOBSERVED` until a download has paged
     * the whole manifest. Computing it before then diffs against an empty library and re-offers
     * every song the account already has — which on a second device, or after a cloud delete, is a
     * create for a document id the server already holds. `sync.documents` is therefore a
     * dependency: the download lands well after the owner does.
     *
     * `accountDialog !== null` holds this off while the sign-in dialog — including its OWN
     * recovery-code step, which keeps that dialog open well after the account already exists and
     * `sync.owner` is already set — is still showing. Without it this raced a second `showModal()`
     * on top of the first, blocking "Not now"/"Finish" underneath it. `accountDialog` is in the
     * dependency array so this re-evaluates the moment that dialog actually closes, not only when
     * the owner changes.
     *
     * `hasDecidedAdoption` guards a decline (or a completed Add) from ever reopening this on a
     * later sign-in to the same account on this device, and `adoptOffered` guards an ESCAPED
     * prompt — which is deliberately not a decision — from reopening on the next `accountDialog`
     * or download transition within this attach. Finding zero candidates does NOT count as either:
     * nothing was asked, so a guest song created later in this session, or on the next sign-in,
     * still gets offered.
     *
     * `onStand` holds it off while a chart is open. The download gate above means this opens
     * whenever the library lands, and on a slow connection that is after the musician has
     * already opened a song — found on the live test host (2026-09-20), where the modal arrived
     * over a half-typed title and took the Save button away. The question is about the songbook,
     * so it waits for the songbook: `onStand` is a dependency, and going back re-asks it.
     */
    const onStand = current !== null;
    useEffect(() => {
        const owner = sync.owner;
        if (owner === null) {
            // Signed out: this attach is over, and the next one — same account or not — is a
            // fresh offer rather than one this device has already made.
            adoptOffered.current = null;
            return;
        }
        if (
            accountDialog !== null ||
            onStand ||
            // A question already on screen is never re-asked underneath its own musician (#1359
            // patch P2-2): this effect re-runs whenever the library's counts change, and an
            // import's scoped offer carries no `adoptOffered` mark of its own until it opens, so
            // without this a download landing mid-answer would turn "Add the song you just
            // brought over?" into the whole-songbook question with the buttons in the same place.
            adoptOnScreen.current ||
            adoptOffered.current === owner ||
            hasDecidedAdoption(owner) ||
            !libraryDownloaded(sync.documents)
        ) {
            return;
        }
        let alive = true;
        void computeAdoptCandidates(owner)
            .then((offer) => {
                if (alive && offer.candidates.length > 0) {
                    adoptOffered.current = owner;
                    // The sign-in offer is about the whole guest songbook; only an import scopes
                    // one (#1359), and a scope left over from an earlier offer must not narrow it.
                    setAdoptScope(null);
                    setAdoptOpen(true);
                }
            })
            .catch(() => {
                // An unreadable store is not evidence there is nothing to offer; simply don't
                // auto-prompt this time. The account page's own button still reaches this.
            });
        return () => {
            alive = false;
        };
    }, [sync.owner, sync.documents, accountDialog, onStand]);
    useEffect(() => {
        if (feelMenu) {
            // Refreshed on every open: these four fields can drift from what the
            // sheet last showed (a different song's live session values, or a
            // conductor tick that moved band intensity while the sheet was closed).
            setFeel(feelSnapshot());
            feelDialog.current?.showModal();
        } else {
            feelDialog.current?.close();
        }
    }, [feelMenu]);
    useEffect(() => {
        if (tradeMenu) {
            tradeDialog.current?.showModal();
        } else {
            tradeDialog.current?.close();
        }
    }, [tradeMenu]);
    useEffect(() => {
        let alive = true;
        setAllSoundsOffline(null);
        if (soundMenu && !busy) {
            void allSoundsAvailableOffline().then((available) => {
                if (alive) {
                    setAllSoundsOffline(available);
                }
            });
        }
        return () => {
            alive = false;
        };
    }, [soundMenu, busy]);
    useEffect(() => {
        let alive = true;
        setSoundsOffline(null);
        if (current && !busy && soundMenu) {
            void soundsAvailableOffline(current.chart).then((available) => {
                if (alive) {
                    setSoundsOffline(available);
                }
            });
        }
        return () => {
            alive = false;
        };
    }, [current, soundMenu, busy]);
    useEffect(() => {
        if (!following || active === null) {
            return;
        }
        const bar = scroll.current?.querySelector<HTMLElement>('[data-active="true"]');
        if (bar && scroll.current) {
            const bounds = scroll.current.getBoundingClientRect(),
                item = bar.getBoundingClientRect();
            if (item.bottom > bounds.bottom - 35 || item.top < bounds.top) {
                bar.scrollIntoView({ block: 'center', behavior: 'auto' });
            }
        }
    }, [active, following]);

    async function run(task: () => void | Promise<void>) {
        if (working.current) {
            return;
        }
        working.current = true;
        setBusy(true);
        // A feel change now prepares its sounds while the band keeps playing and
        // swaps in at the next bar (#1185); only a failed change stops and resumes.
        // Either way the stand stays stable and Stop stays usable until it settles.
        setPlaybackPending(runtime.state().playback.isPlaying);
        setError('');
        try {
            await task();
        } catch (e) {
            setSoundProgress('');
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            working.current = false;
            setBusy(false);
            setPlaying(runtime.state().playback.isPlaying);
            setPlaybackPending(false);
            setSoundProgress('');
        }
    }
    /**
     * The ONE writer of the stand's binding (#1311 patch review R1/R5): the synchronous ref an
     * action reads back in the same tick, and the state a render is allowed to read, always
     * together. Every assignment in this file goes through here — except one, inside the shared-link
     * effect, which inlines the same pair, because a component-scope function is a new reference every render
     * and `useExhaustiveDependencies` rightly refuses it as a hook dependency.
     */
    function bindStand(next: StandStore | null) {
        currentStore.current = next;
        setStandStore(next);
    }
    /**
     * The songbook this device writes to right now, bound to the account the SESSION names
     * (#1311 patch review R1).
     *
     * Read from `account.session`, never from `sync.owner`: `signedIn` flips true the instant the
     * session reports an owner, and `attach()` runs from an effect AFTER that render, so the loop
     * has published nothing yet. A binding taken from the loop's snapshot in that window is
     * `ownerId: null` — an unfenced account binding that then survives a later change of account
     * and waves A's chart straight into B. The session cannot be null here by construction: this
     * is the very owner `useAccountLibrary` is about to attach to.
     *
     * The redundant `status === 'signedIn'` is what narrows `account.session` for TypeScript;
     * `signedIn` is a boolean and carries no narrowing with it.
     */
    function liveStand(): StandStore {
        return signedIn && account.session.status === 'signedIn'
            ? { store: 'account', ownerId: account.session.owner }
            : { store: 'guest' };
    }
    /**
     * The account the chart on the stand belongs to, captured when it was opened or last committed
     * (#1299 patch review P2, folded into `currentStore` by #1311) — not "whoever is attached right
     * now", which is a different question the moment a session expires.
     *
     * Null for a guest chart and for no chart: the shell making no claim, which the loop reads as
     * "whichever account this device holds". Never null for an account chart — see `StandStore`.
     */
    function standOwner(): string | null {
        const stand = currentStore.current;
        return stand?.store === 'account' ? stand.ownerId : null;
    }
    /**
     * Does the chart on the stand belong to an account this device is no longer attached to
     * (#1311)? The shell's own half of the fence, asked against what IT believes — the loop asks
     * the same predicate against the scope it actually holds, and neither trusts the other.
     *
     * The action-time twin of the render-time `standMismatch`: same predicate, same two inputs,
     * but read off the REF, because a handler must decide against the binding as it is at the
     * moment it runs rather than as the last committed render saw it.
     *
     * Both halves of the fence are load-bearing, and they catch different moments. The loop
     * catches the one the shell cannot see: a pass, another tab or a `signOut` can move the
     * attached scope while an `await` in a handler is still unwinding, so the scope a write lands
     * in is only ever knowable inside the loop. This half refuses without a round trip, and
     * without touching a store that would only say no.
     */
    function standBelongsElsewhere(): boolean {
        return belongsToAnotherAccount(standOwner(), sync.owner);
    }
    /**
     * Remember the chart on the stand, in the songbook it came from (#1299).
     *
     * An account chart's "last opened" is one of that account's own facts — it names a song only
     * that account holds — so it lives in the account database and leaves with it. The guest key
     * keeps answering for guest charts, and for a signed-out device that is the only songbook there
     * is. Fire-and-forget: the Continue card is a convenience, and nothing waits on it.
     *
     * An account chart the attached account does not hold is remembered NOWHERE (#1311): B's
     * `meta` must not name A's song, and the guest key must not either — a Continue card pointing
     * at a chart in neither of this device's songbooks is a dead link. Belt and braces, since
     * every caller here has just committed or opened under the live account; "last opened" is
     * still a write into an account database, and that rule has no exceptions worth carving.
     */
    function rememberOpened(id: string) {
        const stand = currentStore.current;
        if (stand?.store === 'account') {
            if (!standBelongsElsewhere()) {
                // The owner travels with it (#1311 patch review R4): the loop refuses this write
                // too, so neither layer is the only thing keeping A's id out of B's `meta`.
                accountSync.rememberOpened(id, stand.ownerId).catch(() => {
                    /* A preference nobody can store is still a chart just opened. */
                });
            }
        } else {
            rememberSong(id);
        }
        setLastOpened(id);
    }
    /**
     * The in-tab fallback both retention paths share when storage would not take the draft.
     *
     * A REFUSAL is not a storage failure, and gets its own sentence (#1311 patch review R7). The
     * "Draft is only in this tab:" wrapper is an apology for something going wrong on this device;
     * an account mismatch is the product working, and the sentence already says what to do about
     * it. Branched on the TYPE, never on the words — which is the whole reason the refusal is a
     * typed error.
     *
     * The trailing stop is trimmed off whatever the wrapper does carry (#1311 patch review R6):
     * a message that is already a sentence would otherwise render "…went away.. Export before
     * closing."
     */
    function retainInTab(next: ChartDocument, failure: unknown) {
        volatileDrafts.current.set(next.id, next);
        setRecoveryHealthy(false);
        if (failure instanceof AccountMismatchError) {
            setError(`${failure.message} Your edit is kept in this tab until then.`);
            return;
        }
        const reason = failure instanceof Error ? failure.message : String(failure);
        setError(`Draft is only in this tab: ${reason.replace(/\.$/, '')}. Export before closing.`);
    }
    function retained(next: ChartDocument) {
        volatileDrafts.current.delete(next.id);
        setRecoveryHealthy(true);
        setMessage('Draft recovered on this device');
    }
    /**
     * Retain nothing for one chart, in the songbook it came from — the account's `drafts` rows or
     * the guest slots, never both (#1299 patch review P1).
     *
     * EVERY writer's, deliberately, unlike the `discardDraft`/`clearOwnRecovery` pair a Save uses.
     * This runs when the chart on the stand has come back to its committed version, and that is a
     * statement about the song rather than about this page load: a writer id is minted per page
     * load, so the row an open RECOVERED FROM usually belongs to an earlier one. Dropping only
     * this writer's would leave that row to be recovered again on the next open — the musician
     * reverts, reloads, and the edit they threw away is back on the stand.
     *
     * A concurrent tab's live experiment goes with it. That is the same trade `clearRecovery`
     * makes at sign-out, and the tab in question still holds its text and retains it again on its
     * next keystroke.
     *
     * A chart whose account is not the attached one clears only what THIS TAB holds (#1311). The
     * account half would be a delete against B's `drafts` store keyed by A's document id: a no-op
     * on any store that is actually B's, and a destructive one the moment that assumption is
     * wrong. The guest half is not offered either — nothing account-side has ever been written
     * there, and reaching for it would be the guest namespace answering for an account chart,
     * which is exactly what #1299 removed.
     */
    function retainNothingFor(id: string) {
        volatileDrafts.current.delete(id);
        const stand = currentStore.current;
        if (stand?.store === 'account') {
            accountDrafts.current.delete(id);
            if (standBelongsElsewhere()) {
                return;
            }
            accountSync.discardDrafts(id, stand.ownerId).catch(() => {
                /* Recovery is a convenience; a row that will not clear is not worth an error. */
            });
            return;
        }
        try {
            repository.clearRecovery(id);
        } catch {
            /* Recovery is a convenience; a slot that will not clear is not worth an error. */
        }
    }
    /**
     * Retain the unsaved experiment, in the songbook the chart on the stand came from (#1299).
     *
     * An account chart's goes to that account's own database, never the guest `localStorage`
     * namespace: it is content that belongs to an account, so it has to be inside the thing
     * sign-out and delete-account remove, and it has to be the thing a library download's
     * preservation rule can SEE — `reconcile` counts a retained draft as local work worth keeping,
     * and a draft it cannot read is a remote version quietly replacing an edit.
     *
     * `currentStore` alone decides, deliberately without `signedIn`. A session can expire under an
     * account chart, and that is exactly the moment a draft must not be lost: the account store is
     * local, this device still holds the account, and the guest namespace is the one place this
     * text may not go. `accountSync.recover` reaches the held account for precisely this case
     * (`heldScope`), and rejects only when the device is genuinely signed out — which leaves
     * no account chart on the stand to be asking.
     *
     * Fire-and-forget, unlike the synchronous guest write: an IndexedDB write cannot be finished
     * inside an edit handler. The in-tab fallback is what a rejection falls back to, exactly as a
     * refused `localStorage` write does today — but "recovered on this device" is only said once
     * the store has actually answered (#1299 patch review P3), because it is a claim about a write
     * that may still fail. The `accountDrafts` entry goes in immediately either way: the export
     * paths read it synchronously and this tab does hold that text.
     *
     * Nothing is retained for a chart that matches its committed version (#1299 patch review P1).
     * "Revert to saved" is exactly that, and so is any change that lands back on the saved text: a
     * retained row identical to the commit is a draft of nothing, and it would hold this record
     * against every later remote advance, tell the sign-out step an experiment is at stake, and
     * answer a cloud delete `retained` — forever, because nothing but a Save ever clears it.
     *
     * An account chart whose account is not the attached one is retained in this TAB and nowhere
     * else (#1311). The loop refuses that write anyway (`heldScope`), and the fallback below
     * would catch it — but the fallback's sentence would be a storage failure's, and nothing has
     * failed here: this is a refusal with a reason, said in its own words and without a pointless
     * round trip to a store that is going to say no. The text stays in memory, which is where the
     * banner and `exportSong` can still reach it.
     */
    function draft(next: ChartDocument, baseline = saved) {
        setCurrent(next);
        if (baseline && same(next, baseline)) {
            retainNothingFor(next.id);
            setRecoveryHealthy(true);
            return;
        }
        const stand = currentStore.current;
        if (stand?.store === 'account') {
            if (standBelongsElsewhere()) {
                // The TYPED refusal, so `retainInTab` reports it as the refusal it is rather
                // than dressing it up as a storage failure (#1311 patch review R7).
                retainInTab(next, new AccountMismatchError(stand.ownerId, sync.owner));
                return;
            }
            accountDrafts.current.set(next.id, next);
            accountSync.recover(next, next.revision, stand.ownerId).then(
                () => retained(next),
                (failure: unknown) => retainInTab(next, failure),
            );
            return;
        }
        try {
            repository.recover(next);
            retained(next);
        } catch (e) {
            retainInTab(next, e);
        }
    }
    function change(action: () => void | Promise<void>, includeText = false) {
        if (!current) {
            return;
        }
        void run(async () => {
            const next = includeText ? updateChart() : current;
            await action();
            draft(runtime.captureDocument(next));
        });
    }
    function clearBuffers() {
        pendingText.current = false;
        setBuffers(new Map());
        setPendingMeasures(false);
        measureEditor.current?.reset();
    }
    function editText(value: string) {
        const next = new Map(buffers);
        if (
            value ===
            (current ? arrangementOf(current).sections.find((s) => s.id === sectionId)?.value : '')
        ) {
            next.delete(sectionId);
        } else {
            next.set(sectionId, value);
        }
        pendingText.current = next.size > 0;
        setBuffers(next);
    }
    // #1211 — long-press on a section letter arms/releases a practice loop
    // confined to that section. Idempotent toggle: re-reads the engine after
    // dispatching rather than trusting local state, so it stays correct if the
    // loop was cleared elsewhere (Stop, Escape, editing) between renders.
    function toggleSectionLoop(id: string | undefined) {
        // `LeadSheetSectionBlock.id` is optional in the shared model (legacy fixtures
        // predate it); every live block sets it, but stay a no-op rather than arm a
        // loop keyed on `undefined` if one ever doesn't.
        if (!id) {
            return;
        }
        if (runtime.loopedSection() === id) {
            runtime.clearLoop();
        } else {
            runtime.loopSection(id);
        }
        setLoopedSectionId(runtime.loopedSection());
    }
    function revealEditor(id = sectionId) {
        runtime.stop();
        setSectionId(id);
        setEditing(true);
        setEditorRequest((request) => request + 1);
    }
    function applyScore(score: SemanticScore): ChartDocument {
        if (current?.schemaVersion !== 2) {
            throw new Error('Open a measure-based chart first.');
        }
        const candidate = repository.validated({ ...current, chart: { ...current.chart, score } });
        runtime.load(candidate);
        const next = runtime.captureDocument(candidate);
        draft(next);
        pendingText.current = false;
        setPendingMeasures(false);
        // A subsequent transpose may immediately replace the accepted score again.
        // Retire these raw buffers on successful runtime adoption, not object equality.
        measureEditor.current?.reset();
        return next;
    }
    function updateChart(): ChartDocument {
        if (!current) {
            throw new Error('Open a song first.');
        }
        if (current.schemaVersion === 2) {
            if (!pendingMeasures) {
                return current;
            }
            try {
                if (!measureEditor.current) {
                    throw new Error('Reopen the measure editor to check your changes.');
                }
                return applyScore(measureEditor.current.commit());
            } catch (error) {
                setMenu(false);
                setEditing(true);
                throw error;
            }
        }
        if (!buffers.size) {
            return current;
        }
        try {
            const sections = arrangementOf(current).sections.map((section) => ({
                ...section,
                value: buffers.get(section.id) ?? section.value,
            }));
            for (const section of sections) {
                if (buffers.has(section.id)) {
                    try {
                        validateEditorText(section.label, section.value);
                    } catch (error) {
                        setSectionId(section.id);
                        throw error;
                    }
                }
            }
            // Check the canonical document bounds before rebuilding the playable chart.
            const candidate = repository.validated({
                ...current,
                chart: {
                    ...current.chart,
                    arrangement: { ...arrangementOf(current), sections },
                },
            });
            runtime.editSections(arrangementOf(candidate).sections);
            const next = runtime.captureDocument(candidate);
            draft(next);
            clearBuffers();
            return next;
        } catch (error) {
            setMenu(false);
            setEditing(true);
            setEditorRequest((request) => request + 1);
            throw error;
        }
    }
    function goHome() {
        void run(() => {
            updateChart();
            runtime.stop();
            setCurrent(null);
            bindStand(null);
        });
    }
    function selectSection(document: ChartDocument, id?: string) {
        const section =
            arrangementOf(document).sections.find((s) => s.id === id) ||
            arrangementOf(document).sections[0];
        setSectionId(section.id);
        if (document.schemaVersion === 2) {
            setMeasureId(
                document.chart.score.sections.find((s) => s.id === section.id)!.measures[0].id,
            );
        }
    }
    /**
     * The retained experiment to offer for a chart being opened, from the songbook it came from
     * (#1299) — the account's `drafts` store signed in, guest `localStorage` otherwise.
     *
     * Signed in, the guest namespace is still consulted as a FALLBACK, and only as one: a device
     * that ran a build from before #1299 can hold a slot under an account id, and that slot is the
     * musician's own work. Offering it once through the same menu is how it comes back; the next
     * successful Save of that song is what finally clears it. Nothing ever writes there for an
     * account chart again.
     *
     * `unreadable` keeps "this song has no retained draft" apart from "this device could not ask"
     * (#1299 patch review P2). Collapsing the two opened the committed copy as if it were the
     * whole truth, and the first keystroke then retained an experiment over a draft nobody had
     * seen. It still opens the chart — refusing to open a song because a draft read failed helps
     * nobody — but it says so, and it leaves this tab's `accountDrafts` entry alone rather than
     * replacing it with an answer it never got.
     */
    async function retainedDraftFor(document: ChartDocument): Promise<{
        recovery: { document: ChartDocument; conflict: boolean } | null;
        unreadable: boolean;
    }> {
        let unreadable = false;
        if (signedIn) {
            try {
                const held = await accountSync.retainedDraft(document.id);
                if (held) {
                    return { recovery: held, unreadable: false };
                }
            } catch {
                unreadable = true;
            }
        }
        return { recovery: repository.recoveryFor(document), unreadable };
    }
    /**
     * Every preserved draft the song menu can offer for the chart on the stand (#1299 patch
     * review P2) — newest first, from BOTH namespaces.
     *
     * Since #1299 an account chart's experiments live in the account database, so a guest-only
     * list made a second tab's experiment on this song unreachable: nothing in the product could
     * open it, and the only thing that mentioned it was a sign-out warning. The account rows are
     * the live ones (`preservedDrafts`), which is also why this list can never offer text a Save
     * has already moved past. The guest slots stay merged in because a build from before #1299
     * may have left one under an account id, and that is the musician's own work too.
     *
     * An unreadable account store answers with the guest half rather than an error: the menu is
     * an offer, and a missing offer is not a claim about anything.
     */
    async function recoveryOptionsFor(document: ChartDocument) {
        const slots = repository.recoveriesFor(document);
        // A chart whose account is not the attached one has no rows to read here either (#1311):
        // `preservedDrafts` would query B's store for A's document id, which is at best nothing.
        if (currentStore.current?.store !== 'account' || standBelongsElsewhere()) {
            return slots;
        }
        let held: Array<{ document: ChartDocument; capturedAt: string }> = [];
        try {
            held = await accountSync.preservedDrafts(document.id);
        } catch {
            /* Unreadable account store; the legacy slots below are still worth offering. */
        }
        return [...held, ...slots].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
    }
    async function open(document: ChartDocument) {
        const { recovery, unreadable } = await retainedDraftFor(document);
        // A retained draft opens exactly as the musician left it; only the stored song is
        // upgraded (`withFollowFeel`, #1405).
        const stored = withFollowFeel(document);
        const next = volatileDrafts.current.get(document.id) || recovery?.document || stored;
        if (signedIn && !unreadable) {
            // What the store just answered, replacing whatever this tab believed about that song —
            // including nothing, on the first open after a reload.
            accountDrafts.current.delete(document.id);
            if (recovery) {
                accountDrafts.current.set(document.id, recovery.document);
            }
        }
        runtime.load(next);
        const onDevice = runtime.withLoadedSounds(next);
        setSaved(next === stored ? onDevice : stored);
        setCurrent(onDevice);
        // The songbook this chart came from AND the account it belongs to, for as long as it is
        // on the stand (#1311). From the SESSION, not `sync.owner` — see `liveStand` for why the
        // loop's snapshot is null in exactly the window this has to be right in.
        bindStand(liveStand());
        setSharedDraft(false);
        clearBuffers();
        rememberOpened(next.id);
        setRecoveryHealthy(!unreadable && !volatileDrafts.current.has(document.id));
        if (unreadable) {
            setError(
                'Couldn’t read your retained draft for this song — this is the last saved version. Export before editing.',
            );
        }
        // `lastSave` is a fact about the chart on the stand, and this is a different chart:
        // carrying a previous song's failed Save into it would rank "Save failed on this device"
        // above a local status that is, for this document, simply true (#1266).
        setSaveFailed(false);
        // Same reasoning (#1267): a Keep-both that failed is a fact about the song it was asked
        // for, and carrying its sentence into the next chart's banner would explain nothing. The
        // adoption step's own sentence (#1310) goes for the same reason — including when this
        // open IS the adoption, which has nothing left to explain.
        setKeepBothFailure(null);
        setAdoptRemoteFailure(null);
        setEditing(false);
        setFollowing(true);
        setMessage(
            recovery
                ? recovery.conflict
                    ? 'Recovered draft is based on an older save. Save a copy to keep both.'
                    : 'Recovered your unsaved setup'
                : 'Saved on this device',
        );
        selectSection(next);
    }
    /** Commits the open shared draft as a new, independently-owned library document. */
    async function keepSharedCopy() {
        if (!current) {
            return;
        }
        const candidate = updateChart();
        const now = new Date().toISOString();
        const copy = {
            ...candidate,
            id: crypto.randomUUID(),
            revision: 0,
            createdAt: now,
            updatedAt: now,
        };
        // No owner claim (#1311): a shared draft belongs to no songbook at all until this commit
        // decides one, so it is the live account's — `currentStore` is already null here.
        const created = await storeSave(copy, null, { owner: null, stand: false });
        await refreshSongs();
        await open(created);
        setMessage('Saved a local copy');
    }
    /**
     * Copies a `#chart=` share link for the chart currently open. Falls back to
     * showing the raw URL when the Clipboard API is unavailable or the write is
     * rejected (the Playwright WebKit project grants no clipboard permission by
     * default, matching some real mobile Safari contexts).
     */
    async function shareChartLink() {
        if (!current) {
            return;
        }
        const candidate = updateChart();
        const encoded = await encodeChartLink(candidate);
        const url = `${window.location.origin}${window.location.pathname}${encoded}`;
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(url);
                setShareLinkFallback(null);
                setMessage('Link copied · opens as an unsaved draft');
                return;
            } catch {
                /* Fall through to the visible fallback below. */
            }
        }
        setShareLinkFallback(url);
    }
    /**
     * Re-reads whichever songbook this device is playing from. Signed in that is the account
     * library (#1266); signed out it is the guest one. The two are never merged and never
     * switched between by a control (rollout decision 9 S3) — which is also why this only ever
     * writes the LIST state: re-listing must never reach into `current`/`saved` and change the
     * chart on the stand.
     */
    async function refreshSongs(): Promise<ChartDocument[]> {
        if (signedIn) {
            // Named with the account the SESSION reports (#1351 patch R6), for the reason
            // `liveStand` reads the session rather than `sync.owner`: this branch is gated on a
            // session fact while `listLibrary` reads a storage one, and `attach` runs from a
            // passive effect that can lag `meta.active`. In that window an unnamed read would hand
            // back the account this device still HOLDS — A's library, rendered as B's. Named, the
            // loop refuses it, and the caller's error handling says so instead.
            const owner = account.session.status === 'signedIn' ? account.session.owner : null;
            try {
                const documents = libraryDocuments(await accountSync.listLibrary(owner));
                setAccountSongs(documents);
                return documents;
            } catch (failure) {
                if (!(failure instanceof AccountMismatchError)) {
                    throw failure;
                }
                // NOT READY YET, not an error (#1351 patch N3). `signedIn` flips the instant the
                // session names an owner and `attach` runs from a passive effect one render later,
                // so in that window `meta.active` still names the previous account and the named
                // read is refused. That is the fence working; it is not something to tell a
                // musician about, and `OWNER_MESSAGES.mismatch` — a sentence about a CHART on the
                // stand — would be doubly wrong in front of a library listing.
                //
                // So the account list is left exactly as it is (null = still loading), and the
                // `sync.owner`-keyed effect above re-reads it the moment the attach settles. No
                // banner and no retry loop: this is a read, and something else is already going to
                // do it.
                return accountSongs ?? [];
            }
        }
        const fresh = await repository.list();
        setGuestSongs(fresh);
        return fresh;
    }
    /**
     * Commits a version and, signed in, queues those exact bytes for the owner and asks the loop
     * to send them. Save never waits for the network: an offline Save is an ordinary successful
     * Save with an upload still owed, which is the whole reason local safety and cloud
     * confirmation are reported as two separate facts.
     *
     * `intent.owner` is the account these bytes belong to (#1311), and it is a PARAMETER rather
     * than a read of `currentStore` because the two kinds of caller genuinely differ. A Save, a
     * `Save a copy`, an editor upgrade and a recovered-draft copy are all the chart on the stand's
     * music under a new wrapper, so they carry the stand's owner and are refused when it is not
     * the attached one. A brand-new song, an imported file and a shared-link copy are nobody's
     * yet: they pass null and belong to whichever account is live. Deriving this from the document
     * id would get `Save a copy` exactly backwards — a fresh id carrying A's music.
     *
     * `intent.stand` is who owns the BINDING afterwards (#1311 patch review R1b). Only `save()`
     * both commits and keeps the result on the stand without going through `open()`; every other
     * caller either opens the created document next — which binds it properly — or is writing a
     * document that has nothing to do with the chart currently showing. Rebinding on those was a
     * real hole: an Import committed under B while A's chart was still open re-pointed the stand
     * at B, and a `refreshSongs()`/`open()` that then threw left A's music sitting on a stand
     * claiming to belong to B, with both layers of the fence waving it through.
     */
    async function storeSave(
        document: ChartDocument,
        expected: number | null,
        intent: { owner: string | null; stand: boolean },
    ) {
        try {
            if (currentStore.current?.store === 'account' && !signedIn) {
                // The session lapsed under an account chart. Falling through would write it to
                // the GUEST songbook — a conflict that isn't one on a plain Save, and a silent
                // copy of account content into guest storage on `Save a copy` (#1266). The full
                // sign-out flow, including what to offer instead, is #1269's.
                throw new Error(
                    'Your session expired — sign in again to save this to your account. Your changes stay on this device.',
                );
            }
            if (!signedIn) {
                const committed = await repository.save(document, expected);
                if (intent.stand) {
                    bindStand({ store: 'guest' });
                }
                setSaveFailed(false);
                return committed;
            }
            if (belongsToAnotherAccount(intent.owner, sync.owner)) {
                // The shell's half of the fence (#1311). It refuses before a single byte is
                // committed, without a round trip to a store that would only say no, and the
                // chart stays exactly where it is so it can still be exported.
                throw new AccountMismatchError(intent.owner, sync.owner);
            }
            const song = await accountSync.save(document, expected, intent.owner);
            if (intent.stand) {
                // `song.ownerId` is the account the commit ACTUALLY landed under, reported back
                // by the loop from the scope it settled to (#1311 patch review R1). Binding from
                // a render snapshot instead is how a stale null owner becomes an unfenced stand.
                bindStand({ store: 'account', ownerId: song.ownerId });
            }
            setSaveFailed(false);
            // Save is one of the four things that runs a pass. Not awaited: the commit is
            // already durable, and the upload is the loop's problem from here.
            void accountSync.run();
            return song.document;
        } catch (failure) {
            // A mismatch is not a failed Save (#1311 patch review R5): nothing on this device
            // went wrong, and "Save failed on this device" would blame the one store that is
            // working perfectly. Caught by TYPE, never by matching the sentence.
            if (!(failure instanceof AccountMismatchError)) {
                setSaveFailed(true);
            }
            throw failure;
        }
    }
    /**
     * Delete the open chart from the cloud (#1270) — the one destructive account operation in the
     * product, and deliberately not a side effect of anything else.
     *
     * The chart gives up its ACTIVE claim before the request goes out, and that is the point.
     * `reconcile`'s preservation rule counts the chart on the stand as local work worth keeping, so
     * deleting with the song still claimed would retain the very copy the musician just asked to
     * remove — and leave it in the account songbook list, flagged, with no way to finish the job. A
     * draft or an unsent Save still retains it, which is that rule working as intended: that work
     * exists nowhere else.
     *
     * The claim is dropped through `setActiveDocument` rather than by unmounting the chart, so a
     * refused delete leaves the musician exactly where they were. It is called explicitly rather
     * than left to the `useAccountLibrary` effect that normally mirrors `current?.id`: effects run
     * after the render that follows a state change, and the loop reads `activeDocumentId` at the
     * moment it commits.
     *
     * Every path that leaves the record in place gives the claim back, THROWN paths included. A
     * delete can fail by exception as well as by refusal — a session that went away mid-request, a
     * reply this build could not read, storage that would not commit — and none of those is
     * evidence the cloud copy is gone. An unprotected chart on the stand is exactly what the next
     * download pass is allowed to adopt a remote body or a tombstone over.
     */
    function deleteFromAccount() {
        if (!current) {
            return;
        }
        const documentId = current.id;
        const owner = standOwner();
        void run(async () => {
            if (standBelongsElsewhere()) {
                // #1311, and asked BEFORE the active claim is dropped: this device is attached to
                // another account, so the revision it would name is a fact about a library it is
                // not reading. `inAccount` already hides the action, so this is the second layer;
                // the loop's own check is the third. Written to the shell's error line as well as
                // the confirm step, because `inAccount` going false is what UNMOUNTS that step —
                // a reason rendered only there would be a refusal nobody could read.
                setDeleteFailure(OWNER_MESSAGES.mismatch);
                setError(OWNER_MESSAGES.mismatch);
                return;
            }
            accountSync.setActiveDocument(null);
            let result: CloudDeleteResult;
            try {
                result = await accountSync.deleteFromCloud(documentId, owner);
            } catch (failure) {
                accountSync.setActiveDocument(documentId);
                // Written to the confirm step as well, because that step is modal: everything
                // behind it is inert, so a reason rendered only in the shell's error line is one
                // the musician cannot read until they dismiss the thing they were answering.
                setDeleteFailure(failure instanceof Error ? failure.message : String(failure));
                // Rethrown, not swallowed: `run()` is what turns it into that error line, which
                // is what carries the reason if the step was dismissed while this was in flight.
                throw failure;
            }
            if (result.kind === 'refused') {
                // Nothing was deleted, so nothing about this session changes: the chart keeps its
                // claim and the dialog stays open carrying the reason. Closing it and dropping a
                // toast would leave the musician guessing whether it worked.
                accountSync.setActiveDocument(documentId);
                setDeleteFailure(result.message);
                if (!deleteDialogRef.current?.open) {
                    // The confirm step was dismissed while the request was in flight, so the line
                    // above has nowhere to render. The reason still has to reach the musician.
                    setError(result.message);
                }
                return;
            }
            runtime.stop();
            setDeleteOpen(false);
            setCurrent(null);
            setSaved(null);
            bindStand(null);
            clearBuffers();
            if (!result.retained) {
                // The account copy is gone and this device kept nothing — a retained draft is one
                // of the things that would have made it `retained`, so since #1299 the only thing
                // left to drop is this writer's slot from before it. Otherwise the deleted song
                // reappears as a recovery offer on the next visit.
                try {
                    repository.clearOwnRecovery(documentId);
                } catch {
                    /* Recovery is a convenience; a stale entry is not worth failing the delete. */
                }
            }
            await refreshSongs();
            setMessage(result.message);
        });
    }
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
            // specific to this operation. `current.id` is about to change, and `MeasureEditor` and
            // `TempoControl` are mounted with `key={current.id}`: a remount throws away every bar
            // typed but not applied, while `pendingMeasures` stays true and the chip goes on
            // saying "Unsaved changes" about text that no longer exists anywhere. An unparseable
            // bar throws out of here the way it throws out of Save — the editor reopens on the bar
            // that needs fixing, and the resolution has not run.
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
                // no message — this resolution has its own sentence below, and a later "Draft
                // recovered on this device" would land on top of it.
                accountSync.recover(moved, moved.revision, resolution.ownerId).then(
                    () => setRecoveryHealthy(true),
                    (failure: unknown) => retainInTab(moved, failure),
                );
            }
            volatileDrafts.current.delete(original.id);
            accountDrafts.current.delete(original.id);
            try {
                // Belt and braces: an account chart's experiment is in the account store now, so
                // this only ever reaches a slot left by a build from before #1299 — and the old id
                // holds the ACCOUNT's version from here on, which that text is not a draft of.
                repository.clearRecovery(original.id);
            } catch {
                /* Recovery is a convenience; a stale slot must not fail the resolution. */
            }
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
            // may go on claiming it here either. The guest slot is belt and braces since #1299:
            // only a build from before it could have left one under an account id.
            volatileDrafts.current.delete(update.documentId);
            accountDrafts.current.delete(update.documentId);
            try {
                repository.clearRecovery(update.documentId);
            } catch {
                /* Recovery is a convenience; a stale slot must not fail the resolution. */
            }
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
     * The recovery slots go last and by id, and since #1299 they are belt and braces: an account
     * chart's unsaved text is in that account's database, which `clearAccount` has just emptied.
     * What this still reaches is a slot left under an account id by a build from before that — the
     * same plaintext on the same shared device — so it stays. `clearRecovery` takes EVERY writer's
     * slot for each id, not just this page load's, and by `documentIds` rather than `atRisk`:
     * every one of this account's documents is being removed from this device, so every one of
     * their slots goes with it.
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
            // Unconditional: `saved` is an account chart's committed baseline, and nothing of that
            // account may outlive the sign-out. (The header carrying Sign out is hidden while a
            // chart is open, so in practice `currentStore` is already null by the time this runs —
            // which is exactly why the guard below must not be what protects `saved`.)
            setSaved(null);
            if (currentStore.current?.store === 'account') {
                setCurrent(null);
                bindStand(null);
                clearBuffers();
            }
            setAccountSongs(null);
            accountDrafts.current = new Map();
            for (const id of documentIds) {
                volatileDrafts.current.delete(id);
                try {
                    repository.clearRecovery(id);
                } catch {
                    /* Recovery is a convenience; a stale entry must not fail the sign-out. */
                }
            }
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
            setGuestSongs(await repository.list());
            if (failure) {
                setError(failure.message);
                return;
            }
            setMessage('Signed out · your guest songbook is unchanged');
        });
    }
    /**
     * The newest local version of one account song (#1269's export precedence, extracted for
     * #1271): this tab's retained draft first, then the account's own retained draft, then a guest
     * slot from before #1299, then the committed library copy. The work an export exists to rescue
     * is exactly the part that is NOT in the library copy, so writing that copy alone would hand
     * back a file missing the very edit the warning was about.
     *
     * Synchronous by design — see `readSignOutPlan` for why the account half is prefetched rather
     * than awaited between two downloads.
     */
    function latestLocalVersion(song: ChartDocument): ChartDocument {
        const retained = volatileDrafts.current.get(song.id) ?? accountDrafts.current.get(song.id);
        if (retained) {
            return retained;
        }
        try {
            return repository.recoveryFor(song)?.document ?? song;
        } catch {
            /* Unreadable slot; the committed copy is still worth a file. */
            return song;
        }
    }
    /**
     * Delete the account (#1271) — what this device does once the server says the account is gone.
     *
     * Playback stops FIRST, for the same reason sign-out stops it: the chart on the stand is about
     * to stop existing on this device. Then the LOCAL half of #1269's sign-out runs
     * (`forgetDeletedAccount` — fence, forget, `markSignedOut`), with no logout round trip in
     * front of it: the delete route already removed the session row and cleared the cookie, so a
     * logout could only answer "already gone". Everything after that is the same shell cleanup
     * sign-out does, including the account songs' guest recovery slots — belt and braces since
     * #1299, and still the only place a slot written by an older build of this app can be.
     *
     * Never `signOutPlan`'s ids here: that plan only exists while the sign-out step is open. The
     * account library the shell is already holding is the same set of documents.
     */
    async function forgetDeletedAccount() {
        const documentIds = (accountSongs ?? []).map((song) => song.id);
        const owner = heldOwner;
        runtime.stop();
        // Remembered BEFORE the await, and whatever it does (#1351 patch N1): from here on this
        // tab must never offer to sign in to `owner`, and the one case that matters is the one
        // where the call below leaves its records behind.
        setDeletedOwner(owner);
        await account.forgetDeletedAccount();
        setHeldOwner(await heldAccount());
        setSaved(null);
        if (currentStore.current?.store === 'account') {
            setCurrent(null);
            bindStand(null);
            clearBuffers();
        }
        setAccountSongs(null);
        accountDrafts.current = new Map();
        for (const id of documentIds) {
            volatileDrafts.current.delete(id);
            try {
                repository.clearRecovery(id);
            } catch {
                /* Recovery is a convenience; a stale entry must not fail the deletion. */
            }
        }
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
        setGuestSongs(await repository.list());
        if (failure) {
            setError(failure.message);
            return;
        }
        setMessage('Account deleted · your guest songbook is unchanged');
    }
    function openSong(id: string) {
        void run(async () => {
            const fresh = await refreshSongs();
            const document = fresh.find((s) => s.id === id);
            if (!document) {
                throw new Error('Song no longer exists.');
            }
            await open(document);
        });
    }
    async function save(copy = false) {
        if (!current || !saved) {
            return;
        }
        const candidate = updateChart();
        const next = copy
            ? {
                  ...candidate,
                  id: crypto.randomUUID(),
                  title: `${candidate.title.slice(0, 150)} — copy`,
              }
            : candidate;
        // A recovered stale draft must not borrow the newer saved revision. The owner claim is the
        // STAND's, for `copy` as much as for a plain Save (#1311): a copy mints a fresh document
        // id, but the music inside it is the chart on the stand's, so a copy made while attached
        // to another account is the same leak wearing a new id.
        const result = await storeSave(next, copy ? null : current.revision, {
            owner: standOwner(),
            stand: true,
        });
        setSaved(result);
        setCurrent(result);
        rememberOpened(result.id);
        volatileDrafts.current.delete(current.id);
        setRecoveryHealthy(true);
        if (currentStore.current?.store === 'account') {
            accountDrafts.current.delete(current.id);
            // This writer's row only, exactly like `clearOwnRecovery` below: another tab editing
            // this song holds its own live experiment, and this Save does not speak for it (#1299).
            accountSync.discardDraft(current.id, standOwner()).catch(() => {
                /* The committed Save is authoritative; a retained row is harmless. */
            });
            try {
                // Every writer's guest slot, and only for an ACCOUNT chart: nothing writes there
                // for one any more, so whatever is left is a slot from before #1299 — account
                // content in the guest namespace, which is the thing this story removes. It was
                // offered once by `retainedDraftFor`, and the commit it was offered against has
                // now happened.
                //
                // Load-bearing invariant, and the reason this is safe to do by id alone: the two
                // id spaces never overlap. A guest document id is minted by `crypto.randomUUID`
                // in this app and an account one by the same call inside the account database —
                // so a slot found under an account chart's id can only ever be that same chart's,
                // written by a build that routed account recovery through the guest namespace.
                repository.clearRecovery(current.id);
            } catch {
                /* Recovery is a convenience; a stale slot must not fail the Save. */
            }
        } else {
            try {
                repository.clearOwnRecovery(current.id);
            } catch {
                /* The committed save is authoritative; retained recovery is harmless. */
            }
        }
        await refreshSongs();
        setMessage('Saved on this device');
        setMenu(false);
    }
    function newSong() {
        void run(async () => {
            if (!template) {
                throw new Error('Starter library is not ready.');
            }
            // A brand-new song belongs to whichever songbook is live right now, not to whatever
            // was last on the stand — set before `storeSave` so its expiry guard reads the truth.
            // Its owner claim is null for the same reason (#1311): these bars are nobody's yet.
            // From the SESSION (`liveStand`), never `sync.owner`: New song is reachable from the
            // songbook the moment the session reports an owner, which is BEFORE `attach()` has
            // published one, and a binding taken from the loop there would be unfenced.
            bindStand(liveStand());
            const document = repository.validated(blankSong(template));
            const created = await storeSave(document, null, { owner: null, stand: false });
            await refreshSongs();
            await open(created);
            revealEditor(arrangementOf(created).sections[0].id);
        });
    }
    /**
     * Copy the offered v1 songs into the GUEST songbook (#1274).
     *
     * Straight through `repository`, never `storeSave`: these are v1's songs arriving on
     * this device, they make no owner claim, and they must not land in an account library
     * or re-point the stand's binding (#1311). #1268's "Add this device's songs" is the
     * bridge from here into an account — and signed in, this run now opens that same offer
     * itself (#1359), scoped to what it just brought over, rather than leaving one intent
     * split across two gestures. What the import WRITES is unchanged: the guest songbook,
     * and only on the musician's explicit Add does anything reach the account.
     *
     * Item-atomic and resumable: each song that lands is saved and remembered on its
     * own, so a failure partway through keeps everything before it and a rerun picks up
     * only what is still missing. The v1 keys are never written — `findV1Data` was only
     * ever handed a read-only storage view.
     */
    function importV1Songs() {
        if (!v1Data) {
            return;
        }
        void run(async () => {
            const library = await repository.list();
            const base = current ?? library[0];
            if (!base) {
                throw new Error('Songbook is not ready yet. Reload and try again.');
            }
            // One ledger write per batch, not per song (patch R6): `rememberV1Import` reads,
            // merges and re-serialises the whole ledger, so calling it 500 times is O(n²) and
            // 500 synchronous `setItem`s. A run interrupted between flushes loses at most the
            // last few digests, which costs nothing — the deterministic document ids make a
            // re-offered item land as `alreadyPresent` rather than as a duplicate.
            const pending: string[] = [];
            const flush = () => {
                if (pending.length) {
                    rememberV1Import(pending.splice(0), 'imported');
                }
            };
            const outcome = await importV1({
                offer: v1Data.offer,
                // The whole finding, not the offer: a progression imported now still
                // wants the key and meter of the v1 session, even if that session was
                // already brought over on an earlier run.
                context: v1ImportContext(v1Data.finding, {
                    performance: base.chart.performance,
                    band: base.chart.band,
                }),
                existing: new Map(
                    library.map((song) => [
                        song.id,
                        { document: song, drafts: draftsHeldFor(song.id) },
                    ]),
                ),
                sessionMark: v1SessionMark(),
                save: (document, expected) => repository.save(document, expected),
                remember: (digest) => {
                    pending.push(digest);
                    if (pending.length >= 50) {
                        flush();
                    }
                },
                markSession: rememberV1SessionMark,
            });
            flush();
            // Everything this run SHOWED and will do nothing more about (patch R1): the
            // automatic offer stops re-opening for those exact bytes, while the menu entry
            // still lists them, and v1 data that changes is a new digest and offered again.
            rememberV1Import(outcome.acknowledged, 'shown');
            setGuestSongs(await repository.list());
            setV1Data({
                finding: v1Data.finding,
                offer: v1ImportOffer(v1Data.finding, v1ImportLedger()),
                asked: v1Data.asked,
            });
            setV1Result(describeV1Outcome(outcome));
            /**
             * Signed in, the second half of the same gesture (#1359): the songs are in the guest
             * songbook, and the offer to copy them into the account opens by itself instead of
             * pointing at a button on the account page.
             *
             * OPENING it consults nothing — the same `setAdoptOpen(true)` the account page's "Add
             * this device's songs" button runs, and deliberately not `hasDecidedAdoption`: this is
             * the musician asking, so a standing "Not now" from a sign-in does not silence it.
             * ANSWERING it (Add or Not now) records the same per-device answer any answer has
             * always recorded (`rememberAdoptionDecision`, in the dialog), which also retires the
             * whole-songbook sign-in offer for this owner. That is deliberate: re-asking about the
             * same songs on the next sign-in, right after a "Not now" here, is exactly the nag the
             * latch exists to prevent, and the account page's button remains the way back.
             * `forgetAdoptionDecision` is account-deletion-only (#1351) and is not called here.
             *
             * Four conditions. `landed` is this run's own work: something actually reached the
             * guest songbook (a run that found everything already here, was blocked, or failed
             * asks nothing new). The other three come from `adoptGate`, which is the latest
             * COMMITTED render rather than the one that defined this handler — an import run is
             * slow enough to outlive the facts it started with (patch P1-2). This device must
             * still be SIGNED IN, which by `signedIn`'s own definition excludes an expired
             * session and a device holding an account without one; the loop must have published
             * an owner; and the account library must have been downloaded, since the offer is a
             * diff against it and a library not yet downloaded re-offers songs the account
             * already has (#1268's P0). Without that download this says nothing — the card's
             * pointer to the account page is still on screen and is the way through.
             */
            const landed = [...outcome.imported, ...outcome.updated].map((song) => song.id);
            const gate = adoptGate.current;
            if (
                landed.length > 0 &&
                gate.signedIn &&
                gate.owner !== null &&
                libraryDownloaded(gate.documents)
            ) {
                // This attach has now made its offer (#1359 patch P2-2). The sign-in effect's own
                // escape guard, set for the same reason it sets it: an offer the musician escapes
                // without answering must not be reopened — as the whole-songbook question, no
                // less — by the next download or dialog transition.
                adoptOffered.current = gate.owner;
                setAdoptScope(landed);
                setAdoptOpen(true);
            }
        });
    }
    /**
     * Unsaved edits this device is holding for one song — the half of "has this been edited
     * here?" that a document's own revision cannot see (#1274). Never fatal: storage that
     * refuses to be read is not evidence of no draft, so it counts as one.
     */
    function draftsHeldFor(id: string): number {
        // Only the session's verdict (`sessionUpdate`) reads a draft count, and each count is a
        // full scan of `localStorage` — so a 500-song songbook must not pay for 500 of them.
        if (id !== V1_SESSION_ID) {
            return 0;
        }
        try {
            return repository.recoverySlotCount(id);
        } catch {
            return 1;
        }
    }
    /**
     * The song menu's permanent way back into the import (DECISION 2026-09-19).
     *
     * Re-reads v1 storage rather than reusing the startup finding — the old app may have
     * been used in another tab since — and offers the WHOLE finding, ledger and decline
     * ignored: this is the musician asking, so everything v1 holds is on the table. Items
     * already in the songbook report as "already here" rather than landing twice.
     */
    function openV1Import() {
        setMenu(false);
        void run(async () => {
            if (current) {
                // Committed FIRST (patch R13): `updateChart()` throws on invalid chart text,
                // and arming the offer before it would leave the card set but never shown —
                // the musician back on a stand with an editor error and an invisible import
                // waiting behind it. Same path the header's Home button takes.
                updateChart();
                runtime.stop();
                setCurrent(null);
                bindStand(null);
            }
            const finding = findV1Data(window.localStorage);
            setV1Present(finding.sources.length > 0 || finding.problems.length > 0);
            setV1Result(null);
            setV1Data({ finding, offer: finding, asked: true });
        });
    }
    /**
     * The card's one dismiss gesture. `declined` is the CARD's answer, because the card is
     * what the musician read: only the button that actually says "Not now" declines, and an
     * offer they asked for from the menu never does (patch N1). Deriving it here from
     * `v1Result` was the bug — a card whose button says "Done" was recording a permanent
     * device-wide decline.
     *
     * A decline is per-DEVICE (DECISION 2026-09-19): the automatic offer never opens again,
     * whatever v1 data appears later.
     *
     * Dismissing without a run still acknowledges the PROBLEMS the card displayed (patch
     * N1c). Those are unreadable v1 data — they will read the same way on every load, and
     * with no Import button in that shape nothing else would ever record them, so the
     * automatic offer would re-open forever. Never the sources: an importable song stays on
     * offer until it is imported or the whole offer is declined.
     */
    function dismissV1(declined: boolean) {
        if (declined) {
            rememberV1ImportDecline();
        }
        if (v1Data && !v1Result) {
            // Everything the card DISPLAYED with a reason: unreadable data, and the items the run
            // would refuse (`V1ImportPlan.blocked`). Never an importable source.
            rememberV1Import(
                [
                    ...v1Data.offer.problems.map((problem) => problem.digest),
                    ...v1Plan.blocked.map((item) => item.digest),
                ],
                'shown',
            );
        }
        setV1Data(null);
        setV1Result(null);
    }
    function upgradeEditor() {
        void run(async () => {
            const original = updateChart();
            if (original.schemaVersion !== 1) {
                return;
            }
            const converted = convertedCopy(original);
            // Capability preflight before creating a copy or changing the active song.
            checkPlayable(converted.chart.score);
            // The stand's owner (#1311): a converted copy is the open chart's music, so it is as
            // much that account's as a `Save a copy` is.
            const created = await storeSave(converted, null, {
                owner: standOwner(),
                stand: false,
            });
            await refreshSongs();
            await open(created);
            revealEditor(arrangementOf(created).sections[0].id);
            setMessage('Editable copy created · your original song is unchanged');
        });
    }
    function extendScore(newSection: boolean) {
        void run(() => {
            const next = updateChart();
            if (next.schemaVersion !== 2) {
                return;
            }
            const extended = extendedScore(next.chart.score, measureId, newSection);
            applyScore(extended.score);
            setMeasureId(extended.measureId);
            setSectionId(extended.sectionId);
        });
    }
    function shrinkScore(wholeSection: boolean) {
        void run(() => {
            const next = updateChart();
            if (next.schemaVersion !== 2) {
                return;
            }
            // The editor's selection names the bar; its section is found from the score, since
            // `sectionId` follows the v1 text editor and may be stale for a measure chart.
            const score = next.chart.score;
            const holding = score.sections.find((s) => s.measures.some((m) => m.id === measureId));
            const result = wholeSection
                ? withoutSection(score, holding?.id ?? '')
                : withoutMeasure(score, measureId);
            if (result.kind === 'blocked') {
                throw new Error(result.message);
            }
            applyScore(result.score);
            setMeasureId(result.measureId);
            setSectionId(result.sectionId);
        });
    }
    function changeSection(id: string, change: SectionChange) {
        void run(() => {
            // Pending bar edits are committed first, as for every other chart edit.
            const next = updateChart();
            if (next.schemaVersion !== 2) {
                return;
            }
            const result = withSectionSettings(next.chart.score, id, change);
            if (result.kind === 'blocked') {
                if (result.measureId) {
                    setMeasureId(result.measureId);
                }
                throw new Error(result.message);
            }
            applyScore(result.score);
        });
    }
    function changeSongMeter(meter: string) {
        void run(() => {
            // Pending bar edits are committed first, by the editor's own rules, so the change is
            // made to the one validated candidate rather than beside unchecked typing.
            const next = updateChart();
            if (next.schemaVersion !== 2) {
                return;
            }
            const result = withSongMeter(next.chart.score, meter);
            if (result.kind === 'blocked') {
                setMeasureId(result.measureId);
                throw new Error(result.message);
            }
            applyScore(result.score);
        });
    }
    /**
     * Write one chart to a file on this device. Extracted from `exportSong` for #1269's sign-out
     * preflight, which exports songs from the LIBRARY rather than the stand — the header (and its
     * Sign out button) is hidden while a chart is open, so at that moment there is no chart on the
     * stand to export and the work at risk is named by document id.
     *
     * `onExportAccountSongs`'s export-everything offer (#1271) and the sign-out preflight's own
     * export both call this once per song in a plain loop, one user gesture triggering several
     * downloads. Chromium allows a handful of same-gesture downloads through without prompting,
     * which is what the checks assert (`*.chromium.spec.ts`); Safari and Firefox are known to
     * prompt before the second download or drop later ones silently past their own per-gesture
     * cap. There is no E2E coverage for either engine here — WebKit/Firefox-specific handling
     * (batching into one archive, or a click-through per file) is unverified and out of scope.
     */
    function exportDocument(candidate: ChartDocument) {
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(repository.validated(candidate), null, 2)], {
                type: 'application/json',
            }),
        );
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${candidate.title.replace(/[^\p{L}\p{N} -]/gu, '').slice(0, 80) || 'chart'}.ensemble`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function exportSong() {
        if (!current) {
            return;
        }
        exportDocument(updateChart());
    }
    // #1277 — reuse the shared `.mid` exporter (runs in its own detached worker
    // realm, so it never touches the live scheduler/audio and is safe to call
    // mid-playback). `exportToMidi` sanitizes the filename itself, matching how
    // `exportSong` above applies pending text first.
    async function exportMidiFile() {
        if (!current) {
            return;
        }
        const candidate = updateChart();
        await runtime.exportMidi(candidate.title);
    }
    // #1278 — reuse the same detached-clone WAV renderer v1's `ShareModal` uses
    // (`renderCurrentSessionToWav`/`renderStemsToWav` in
    // public/export/audio-export.ts). Deliberately NOT routed through `run()`:
    // that helper's shared `busy` flag would also disable the Cancel button
    // this needs to stay clickable for the whole render, so this mirrors `run()`'s
    // shape (the same `working` mutex, so it still can't overlap another action)
    // with its own `exportingAudio` flag layered on top.
    async function exportAudioFile(kind: 'mix' | 'stems') {
        if (!current || working.current) {
            return;
        }
        working.current = true;
        setBusy(true);
        setExportingAudio(true);
        setError('');
        try {
            const candidate = updateChart();
            await runtime.exportAudio(kind, candidate.title, setExportAudioProgress);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            working.current = false;
            setBusy(false);
            setExportingAudio(false);
            setExportAudioProgress('');
        }
    }
    const { blocks, displayActive, activeEvent, totalBars, writtenBars, writtenSections } =
        useChartView(current, active);
    const continuedSave = songs.find((song) => song.id === lastOpened);
    const featuredSave =
        continuedSave || songs.find((song) => song.id === 'starter-blues') || songs[0];
    const featured = useMemo(() => {
        if (!featuredSave) {
            return null;
        }
        if (current?.id === featuredSave.id) {
            return current;
        }
        // `accountDrafts` is what makes the card preview an ACCOUNT chart's unsaved edit (#1299):
        // the guest slot below no longer holds one, and a store read cannot happen in a memo. It
        // only answers for a song this TAB has opened or prefetched, though — on a cold load the
        // map is empty and the card previews the committed copy, which is the honest answer here
        // rather than a claim about a draft nobody has read (#1299 patch review P3).
        const held =
            volatileDrafts.current.get(featuredSave.id) ??
            accountDrafts.current.get(featuredSave.id);
        try {
            return held || repository.recoveryFor(featuredSave)?.document || featuredSave;
        } catch {
            return held || featuredSave;
        }
    }, [featuredSave, current]);
    /**
     * `offline.sounds` for the status chip. `soundsAvailableOffline` answers one yes/no about the
     * whole set the open chart needs, so the honest count is that single requirement — verified
     * or not — and `null` for as long as nothing has actually checked. A per-pack count would
     * need `lib/sounds.ts` to report one; inventing numbers here would over-claim readiness,
     * which is the exact failure this fact exists to prevent.
     */
    const soundsProgress: Progress =
        soundsOffline === null
            ? { required: null, verified: null }
            : { required: 1, verified: soundsOffline ? 1 : 0 };
    /**
     * Three separate facts, never one badge (#1266). Rendered only on the MUSIC STAND, and only
     * for a device with an account.
     *
     * Not on the songbook page: with no chart open, `savedRevision`, the open chart's sounds and
     * the cloud observation are all genuinely unobserved, so the chip there was three permanent
     * "we haven't checked" lines — an honest projection of nothing, which reads as a broken
     * badge rather than as a fact.
     *
     * `expired` is included alongside `signedIn` deliberately: that is precisely when the loop's
     * "sign in again to upload it" sentence is true, and unmounting the chip on the state change
     * that produces it would make the sentence unreachable.
     */
    const syncStatus =
        accountsOn && current && (signedIn || expiredSession) ? (
            <SyncStatus
                savedRevision={saved ? saved.revision : null}
                editing={dirty ? 'dirty' : 'clean'}
                lastSave={saveFailed ? 'failed' : 'idle'}
                recovery={!dirty ? 'none' : recoveryHealthy ? 'confirmed' : 'failed'}
                shell={offline.shell}
                sounds={soundsProgress}
                // #1311 — outranks every other cloud reading: the loop can only watch this
                // document id in the account that IS attached, which has never held it, so
                // without this the chip would read "Not in your account yet" about a song that
                // is fully saved in somebody else's library.
                foreign={standMismatch}
                sync={sync}
            />
        ) : null;

    return (
        <div
            className={`app-shell ${current ? 'song-open' : ''} ${focused ? 'performance-focus' : ''}`}
        >
            <header className="site-header" hidden={!!current}>
                <div className="header-left">
                    <button
                        className="brand"
                        disabled={busy}
                        onClick={() => {
                            runtime.stop();
                            setCurrent(null);
                            bindStand(null);
                        }}
                    >
                        ♬ ensemble
                    </button>
                    <nav className="site-nav" aria-label="Main">
                        <button
                            className={!current ? 'active' : ''}
                            disabled={busy}
                            onClick={() => {
                                runtime.stop();
                                setCurrent(null);
                                bindStand(null);
                            }}
                        >
                            My songbook
                        </button>
                    </nav>
                </div>
                <div className="header-right">
                    <span className="local-status">{offline.label}</span>
                    <span className="concept-tag">Music stand · beta</span>
                    {accountsOn && (
                        <AccountEntry
                            session={account.session}
                            unprotected={account.recoveryEnrolled === false}
                            busy={account.signingOut}
                            online={account.online}
                            signOutFailure={account.signOutFailure}
                            onSignIn={() => setAccountDialog('signIn')}
                            onFinishProtecting={() => setAccountDialog('recovery')}
                            onOpenAccount={() => setAccountPageOpen(true)}
                            onSignOut={() => {
                                setSignOutPlan(null);
                                setSignOutSongs(null);
                                setSignOutStepFailure(null);
                                setSignOutStep('session');
                            }}
                        />
                    )}
                </div>
            </header>
            {error && !soundMenu && (
                <div className="error-banner" role="alert">
                    <span>{error}</span>
                    <button onClick={() => setError('')}>Dismiss</button>
                </div>
            )}
            {/*
             * #1269 — an expired session, said once, everywhere. The stand's sync chip already
             * carries the queue's half of this ("sign in again to upload it"), but the chip only
             * exists with a chart open: a musician who signs out of nothing, closes the song and
             * goes back to the songbook would otherwise see their library silently fall back to
             * the guest one with no explanation anywhere. `role="status"`, not `alert`: nothing
             * was lost, and the sentence says so.
             */}
            {heldWithoutSession && (
                <div className="error-banner" role="status" data-testid="account-expired-banner">
                    <span>{banner.sentence}</span>
                    {/*
                     * Absent after a deletion this tab ran (#1351 patch N1): there is no account
                     * left to sign in to, and a button saying otherwise is the one reading
                     * `forgetDeletedAccount` exists to prevent, with something to click on.
                     */}
                    {banner.signIn !== null && (
                        <button onClick={() => setAccountDialog('signIn')}>{banner.signIn}</button>
                    )}
                    {/*
                     * #1351 — the other way out, and the only one that removes this account's data
                     * from a device that is changing hands. `signOut()` needs a live scope and a
                     * logout round trip, and a device with no session has neither; this runs the
                     * same preflight and the same local clear with the revocation already settled.
                     *
                     * It is inside the banner rather than beside it because the two belong to one
                     * question — this device holds an account nobody is signed in to, so keep it
                     * or clear it — and because with a chart open the site header is hidden, which
                     * makes the banner the only place either answer can be reached from.
                     */}
                    <button
                        data-testid="account-expired-sign-out"
                        disabled={busy}
                        onClick={() => {
                            setSignOutPlan(null);
                            setSignOutSongs(null);
                            setSignOutStepFailure(null);
                            setSignOutStep('device');
                        }}
                    >
                        Sign out on this device
                    </button>
                </div>
            )}
            {/*
             * #1311 — the chart on the stand belongs to an account this device is not attached to.
             *
             * DERIVED and PERSISTENT, never a one-shot line (#1311 patch review R5). It survives
             * `run()`'s `setError('')`, a re-render and a press of Play, and it has no Dismiss:
             * while the mismatch stands, every account write is refused, so a musician who
             * dismissed it would be left with a Save button and a chip that both invite the one
             * action that cannot work. It goes away the moment the fact does — by signing back in
             * as that account, or by leaving the chart.
             *
             * `role="status"`, matching the expired banner beside it rather than the error line's
             * `alert`: nothing was lost, nothing went wrong on this device, and the chart is still
             * here to export. Rendered only with a chart open, because with nothing on the stand
             * there is no mismatch to be in.
             */}
            {standMismatch && current && (
                <div className="error-banner" role="status" data-testid="stand-mismatch-banner">
                    <span>{OWNER_MESSAGES.mismatch}</span>
                </div>
            )}
            {/*
             * #1267 — the refused Save, and the one move that resolves it. Above the stand rather
             * than inside it because it is a fact about the SONG, not about the chart view, and
             * next to the other banners because that is where this app says things that are true
             * regardless of which surface is open. `role="status"`, not `alert`: nothing was lost.
             */}
            {standBanner !== 'none' && (
                <ConflictBanner
                    conflict={standBanner}
                    busy={busy}
                    // #1310 patch R2 — ONE derivation, shared with the confirm step below, so the
                    // banner can never promise to discard changes the musician does not have.
                    unsavedEdits={dirty}
                    // Each shape shows only its OWN sentence: a refused Keep-both is a fact about
                    // a queue, a refused adoption is a fact about a preserved version, and neither
                    // explains the other.
                    failure={standBanner === 'candidate' ? adoptRemoteFailure : keepBothFailure}
                    onKeepBoth={keepBothVersions}
                    // #1310 — the third shape's action opens the confirm step rather than doing
                    // anything: this is the one choice here that destroys something. The offer is
                    // FROZEN here (patch R5), so the answer is about the version on screen now.
                    onUseAccountVersion={() => {
                        setAdoptRemoteFailure(null);
                        setAdoptRemoteOffer(standCandidate);
                    }}
                />
            )}
            {volatileDrafts.current.size > 0 && (
                <div className="error-banner" role="status">
                    {volatileDrafts.current.size} draft(s) could not be stored. They are retained in
                    this tab only. Reopen and export or save them before closing.
                </div>
            )}
            <input
                ref={file}
                type="file"
                className="file-input"
                accept=".ensemble,.json"
                aria-label="Import Ensemble document"
                onChange={(event) => {
                    const source = event.target.files?.[0];
                    event.target.value = '';
                    if (!source) {
                        return;
                    }
                    void run(async () => {
                        if (current) {
                            updateChart();
                        }
                        if (source.size > 1_048_576) {
                            throw new Error('Chart files must be 1 MB or smaller.');
                        }
                        const candidate = repository.validated(JSON.parse(await source.text()));
                        if (candidate.schemaVersion === 2) {
                            checkPlayable(candidate.chart.score);
                        }
                        // No owner claim (#1311): a file off this device's disk is nobody's chart
                        // until it is committed, so it belongs to whichever account is live —
                        // never to whoever happens to be on the stand behind this dialog.
                        const result = await storeSave(
                            { ...withFollowFeel(candidate), id: crypto.randomUUID() },
                            null,
                            { owner: null, stand: false },
                        );
                        await refreshSongs();
                        await open(result);
                    });
                }}
            />
            {importing && (current || template) && (
                <ImportDialog
                    base={current ?? template}
                    onClose={() => setImporting(false)}
                    onAdd={async (candidate) => {
                        const checked = repository.validated(candidate);
                        if (checked.schemaVersion === 2) {
                            checkPlayable(checked.chart.score);
                        }
                        if (current) {
                            updateChart();
                        }
                        // No owner claim, exactly as the file import above (#1311).
                        const result = await storeSave(
                            { ...checked, id: crypto.randomUUID() },
                            null,
                            { owner: null, stand: false },
                        );
                        await refreshSongs();
                        await open(result);
                    }}
                />
            )}
            {!ready ? (
                <main className="loading">
                    <h1>Getting the band together.</h1>
                    <p>Loading your local songbook and musical engine.</p>
                </main>
            ) : !current ? (
                <Songbook
                    songs={songbookLoading ? [] : songs}
                    featured={featured}
                    continued={!!continuedSave}
                    busy={busy}
                    offline={offline.label}
                    accountLibrary={signedIn}
                    loading={songbookLoading}
                    // #1357 patch P1-4 — the first session read was released by its deadline
                    // rather than answered, so this list is a fallback and says so.
                    accountFallback={accountsOn && account.fellBack}
                    // #1357 patch P2-1 — the in-product way back from `?accounts=off`. Gated on
                    // `resolved` so it cannot be rendered before this device's answer is read,
                    // when `enabled` is `false` for everybody. Insurance rather than an observed
                    // fix: today the switch's effect resolves before `ready` flips, so the
                    // songbook never mounts in that state anyway (measured — see the note in
                    // `checks/account-entry.spec.ts`). It costs one boolean and it stops that
                    // ordering being load-bearing.
                    accountsOff={accounts.resolved && !accountsOn}
                    onEnableAccounts={accounts.turnOn}
                    // #1310 — only the account library can have one waiting; signed out the loop
                    // publishes none at all, so this is the same empty list either way.
                    newerInAccount={candidateIds}
                    search={search}
                    onSearch={setSearch}
                    onImport={() => setImporting(true)}
                    onNewSong={newSong}
                    onOpenSong={openSong}
                    v1Import={
                        // An offer the app opened by itself is for the GUEST songbook and is
                        // not shown over an account library (patch R2); one the musician
                        // asked for from the song menu always is, and says where the songs
                        // land through `accountPointer` below.
                        v1Data && (v1Data.asked || !signedIn)
                            ? {
                                  // What Import would actually do, not what v1 holds (patch
                                  // R12/N2): the menu path offers everything, ledger
                                  // included, so most of an offer is routinely already here.
                                  songs: v1Plan.fresh,
                                  alreadyHere: v1Plan.alreadyHere,
                                  // v1 data that could not be read, plus anything the run
                                  // would refuse — said before the button, not only after.
                                  problems: [
                                      ...v1Data.offer.problems.map((problem) => ({
                                          label: problem.label,
                                          reason: problem.reason,
                                      })),
                                      ...v1Plan.blocked,
                                  ],
                                  result: v1Result,
                                  // An offer the musician asked for never records a decline,
                                  // whatever shape it is in (patch N1b).
                                  asked: v1Data.asked,
                                  // Guest-songbook work (#1274): signed in, the songs land in
                                  // this device's songbook and #1268's account-page button is
                                  // how they reach the account (patch R2).
                                  accountPointer: signedIn,
                              }
                            : null
                    }
                    onImportV1={importV1Songs}
                    onDismissV1={dismissV1}
                />
            ) : (
                <main className="workspace" data-focused={focused}>
                    <SongHeader
                        current={current}
                        busy={busy}
                        dirty={dirty}
                        hasPendingText={hasPendingText}
                        sharedDraft={sharedDraft}
                        recoveryHealthy={recoveryHealthy}
                        totalBars={totalBars}
                        stage={stage}
                        playbackActive={playbackActive}
                        focused={focused}
                        editing={editing}
                        onHome={goHome}
                        onToggleTheme={toggleTheme}
                        onSounds={() => setSoundMenu(true)}
                        onToggleControls={() => setShowControls(!showControls)}
                        onShowChart={() => setEditing(false)}
                        onEditChart={() => revealEditor()}
                        onSave={() => void run(() => (sharedDraft ? keepSharedCopy() : save()))}
                        onMenu={() =>
                            void run(async () => {
                                setRecoveryOptions(await recoveryOptionsFor(current));
                                setMenu(true);
                            })
                        }
                    />
                    <TransportBar
                        current={current}
                        busy={busy}
                        playbackActive={playbackActive}
                        onPlayToggle={() => {
                            if (runtime.state().playback.isPlaying || playbackPending) {
                                runtime.stop();
                                setPlaying(false);
                                setPlaybackPending(false);
                                return;
                            }
                            void run(async () => {
                                const next = updateChart();
                                setEditing(false);
                                setShowControls(false);
                                setSoundMenu(false);
                                await runtime.toggle(setSoundProgress);
                                setPlaying(runtime.state().playback.isPlaying);
                                setSoundsOffline(await soundsAvailableOffline(next.chart));
                                setSoundProgress('');
                            });
                        }}
                        onFeel={() => setFeelMenu(true)}
                        onTempo={(value) => change(() => runtime.setTempo(value))}
                        onKey={(key) =>
                            change(
                                () =>
                                    runtime.transpose(
                                        KEY_ORDER.indexOf(key) -
                                            KEY_ORDER.indexOf(arrangementOf(current).key),
                                    ),
                                true,
                            )
                        }
                        onGenre={(genre) =>
                            change(() => runtime.setGenre(genre, setSoundProgress), true)
                        }
                        onToggleLane={(key) =>
                            change(() => runtime.setEnabled(key, !current.chart.band[key].enabled))
                        }
                        onTrade={() => setTradeMenu(true)}
                    />
                    <TradeSheet
                        dialogRef={tradeDialog}
                        current={current}
                        busy={busy}
                        partners={runtime.tradePartners()}
                        onClose={() => setTradeMenu(false)}
                        onChange={(tradeWith, bars) =>
                            change(() => runtime.setTrade(tradeWith, bars))
                        }
                    />
                    <SoundsPanel
                        dialogRef={soundsDialog}
                        open={soundMenu}
                        current={current}
                        busy={busy}
                        error={error}
                        soundProgress={soundProgress}
                        soundsOffline={soundsOffline}
                        allSoundsOffline={allSoundsOffline}
                        pendingSound={pendingSound}
                        onClose={() => setSoundMenu(false)}
                        onInstallAll={() =>
                            change(async () => {
                                await installAllSounds(setSoundProgress);
                                await runtime.applyGenreSounds(setSoundProgress);
                            })
                        }
                        onChooseSound={(lane, value) => {
                            if (working.current) {
                                return;
                            }
                            setPendingSound({ lane, value });
                            change(async () => {
                                try {
                                    await runtime.setVoice(
                                        lane,
                                        value === 'auto'
                                            ? runtime.recommendedVoice(lane)
                                            : (value as InstrumentVoice),
                                        setSoundProgress,
                                        value === 'auto',
                                    );
                                } finally {
                                    setPendingSound(null);
                                }
                            });
                        }}
                        onVolume={(lane, value) => change(() => runtime.setVolume(lane, value))}
                        onReverb={(lane, value) => change(() => runtime.setReverb(lane, value))}
                        onStyle={(lane, value) => change(() => runtime.setStyle(lane, value))}
                        onDensity={(value) => change(() => runtime.setDensity(value))}
                        onSoloistMode={(mode) => change(() => runtime.setSoloistMode(mode))}
                    />
                    <FeelSheet
                        dialogRef={feelDialog}
                        current={current}
                        busy={busy}
                        feel={feel}
                        onClose={() => setFeelMenu(false)}
                        onSwing={(value) => change(() => runtime.setSwing(value))}
                        onSwingSub={(sub) => change(() => runtime.setSwingSub(sub))}
                        onHumanize={(value) => change(() => runtime.setHumanize(value))}
                        onComplexity={(value) => change(() => runtime.setComplexity(value))}
                        onBandIntensity={(value) =>
                            change(() => {
                                runtime.setBandIntensity(value);
                                setFeel((f) => ({ ...f, bandIntensity: value }));
                            })
                        }
                        onAutoIntensity={(auto) =>
                            change(() => {
                                runtime.setAutoIntensity(auto);
                                setFeel((f) => ({ ...f, autoIntensity: auto }));
                            })
                        }
                        onMetronome={(enabled) =>
                            change(() => {
                                runtime.setMetronome(enabled);
                                setFeel((f) => ({ ...f, metronome: enabled }));
                            })
                        }
                        onMasterVolume={(value) =>
                            change(() => {
                                runtime.setMasterVolume(value);
                                setFeel((f) => ({ ...f, masterVolume: value }));
                            })
                        }
                        onNotation={(notation) => change(() => runtime.setNotation(notation))}
                    />
                    <div className={`workspace-body ${editing ? 'editing' : ''}`}>
                        <div
                            className="chart-scroll"
                            ref={scroll}
                            onWheel={() => setFollowing(false)}
                            onTouchMove={() => setFollowing(false)}
                            onKeyDown={(e) => {
                                if (
                                    [
                                        'ArrowDown',
                                        'ArrowUp',
                                        'PageDown',
                                        'PageUp',
                                        'Home',
                                        'End',
                                    ].includes(e.key)
                                ) {
                                    setFollowing(false);
                                }
                                // #1211 — Escape clears an active practice loop from
                                // anywhere in the chart (bubbles up from a focused
                                // section-letter button too).
                                if (e.key === 'Escape' && loopedSectionId) {
                                    runtime.clearLoop();
                                    setLoopedSectionId(null);
                                }
                            }}
                            tabIndex={0}
                            aria-label="Chord chart"
                        >
                            <ChartSheet
                                current={current}
                                blocks={blocks}
                                displayActive={displayActive}
                                activeEvent={activeEvent}
                                writtenBars={writtenBars}
                                writtenSections={writtenSections}
                                loopedSectionId={loopedSectionId}
                                editing={editing}
                                busy={busy}
                                playing={playing}
                                playbackActive={playbackActive}
                                totalBars={totalBars}
                                onToggleLoop={toggleSectionLoop}
                                onEditSection={(block) => {
                                    if (current.schemaVersion === 2) {
                                        setMeasureId(block.measures[0]?.chords[0]?.measureId ?? '');
                                    }
                                    revealEditor(block.id);
                                }}
                                onEditBar={(measure) => {
                                    setMeasureId(measure.chords[0]?.measureId ?? '');
                                    revealEditor(measure.sectionId);
                                }}
                                onAudition={(index) => runtime.audition(index)}
                            />
                        </div>
                        <EditPanel
                            panelRef={editPanel}
                            measureEditorRef={measureEditor}
                            current={current}
                            editing={editing}
                            busy={busy}
                            measureId={measureId}
                            sectionId={sectionId}
                            buffers={buffers}
                            text={text}
                            onTitle={(title) => draft({ ...current, title })}
                            onSongMeter={changeSongMeter}
                            onSongMode={(isMinor) => change(() => runtime.setMode(isMinor), true)}
                            onSelectMeasure={setMeasureId}
                            onPendingChange={(pending) => {
                                pendingText.current = pending;
                                setPendingMeasures(pending);
                            }}
                            onApply={(score) =>
                                void run(() => {
                                    applyScore(score);
                                })
                            }
                            onApplyForm={(score) => {
                                if (working.current) {
                                    throw new Error(
                                        'Wait for the current change, then Apply again.',
                                    );
                                }
                                applyScore(score);
                            }}
                            onExtend={extendScore}
                            onRemove={shrinkScore}
                            onSectionChange={changeSection}
                            onUpgrade={upgradeEditor}
                            onSelectSection={(id) => selectSection(current, id)}
                            onEditText={editText}
                            onUpdateChart={() =>
                                void run(() => {
                                    updateChart();
                                })
                            }
                            onAddSection={() =>
                                void run(() => {
                                    const next = updateChart();
                                    const id = crypto.randomUUID();
                                    const sections = [
                                        ...arrangementOf(next).sections,
                                        {
                                            id,
                                            label: String.fromCharCode(
                                                65 + (arrangementOf(current).sections.length % 26),
                                            ),
                                            value: 'C | C | F | G',
                                            repeat: 1,
                                        },
                                    ];
                                    repository.validated({
                                        ...next,
                                        chart: {
                                            ...next.chart,
                                            arrangement: {
                                                ...arrangementOf(next),
                                                sections,
                                            },
                                        },
                                    });
                                    runtime.editSections(sections);
                                    draft(runtime.captureDocument(next));
                                    revealEditor(id);
                                })
                            }
                        />
                    </div>
                    <footer className="playback-footer">
                        <span role="status">
                            {busy
                                ? soundProgress || 'Updating…'
                                : playing
                                  ? 'Band is playing'
                                  : message}
                        </span>
                        {syncStatus}
                        <span className="footer-tip">{offline.label}</span>
                        <button className="follow-btn" onClick={() => setFollowing(!following)}>
                            {following ? 'Following' : 'Resume follow'}
                        </button>
                    </footer>
                </main>
            )}
            <SongMenu
                dialogRef={dialog}
                current={current}
                saved={saved}
                busy={busy}
                dirty={dirty}
                shareLinkFallback={shareLinkFallback}
                recoveryOptions={recoveryOptions}
                inAccount={inAccount}
                onClose={() => setMenu(false)}
                onShare={() => void run(shareChartLink)}
                onSaveCopy={() => void run(() => save(true))}
                onExport={() => void run(exportSong)}
                onExportMidi={() => void run(exportMidiFile)}
                exportingAudio={exportingAudio}
                exportAudioProgress={exportAudioProgress}
                onExportAudioMix={() => void exportAudioFile('mix')}
                onExportAudioStems={() => void exportAudioFile('stems')}
                onCancelExportAudio={() => runtime.cancelExportAudio()}
                onImport={() => {
                    setMenu(false);
                    setImporting(true);
                }}
                v1Available={v1Present}
                onBringOverV1={openV1Import}
                onRevert={() =>
                    void run(() => {
                        if (!saved) {
                            return;
                        }
                        runtime.load(saved);
                        // Re-resolved on this device (#1405): Install all may have run since
                        // open, or `saved` came in under a draft and was never resolved.
                        const reverted = runtime.withLoadedSounds(saved);
                        setSaved(reverted);
                        draft(reverted, reverted);
                        clearBuffers();
                        selectSection(saved);
                        setMenu(false);
                    })
                }
                onDeleteFromAccount={() => {
                    setDeleteFailure(null);
                    setMenu(false);
                    setDeleteOpen(true);
                }}
                onOpenRecovery={(record) =>
                    void run(async () => {
                        updateChart();
                        // The STAND's owner (#1311): a preserved draft is this chart's own
                        // earlier text, so the copy it becomes carries the same account as the
                        // song it was a draft of.
                        const copy = await storeSave(
                            {
                                ...withFollowFeel(record.document, record.capturedAt),
                                id: crypto.randomUUID(),
                                title: `${record.document.title.slice(0, 140)} — recovered`,
                            },
                            null,
                            { owner: standOwner(), stand: false },
                        );
                        await refreshSongs();
                        await open(copy);
                        setMenu(false);
                    })
                }
            />
            {accountsOn && (
                <SignInDialog
                    dialogRef={accountDialogRef}
                    mode={accountDialog ?? 'signIn'}
                    open={accountDialog !== null}
                    onClose={() => setAccountDialog(null)}
                    onAccountChanged={account.refresh}
                />
            )}
            {accountsOn && (
                <AccountPage
                    dialogRef={accountPageDialogRef}
                    open={accountPageOpen}
                    onClose={() => setAccountPageOpen(false)}
                    onAccountChanged={account.refresh}
                    online={account.online}
                    accountSongCount={accountSongs?.length ?? null}
                    onExportAccountSongs={() =>
                        void run(async () => {
                            // EVERY song, unlike the sign-out step's at-risk subset (#1271): the
                            // cloud copy is about to stop existing, so "it comes back on the next
                            // sign-in" is no longer true of any of them.
                            const library = accountSongs ?? [];
                            // Read once, before the first file: the retained drafts are what makes
                            // these the newest versions, and awaiting between two downloads is
                            // what loses the later ones (#1299). Folded in rather than assigned
                            // over, for the reason the sign-out read states.
                            for (const [id, held] of await accountSync.retainedDrafts(
                                library.map((song) => song.id),
                            )) {
                                accountDrafts.current.set(id, held);
                            }
                            for (const song of library) {
                                exportDocument(latestLocalVersion(song));
                            }
                        })
                    }
                    // NOT `run(forgetDeletedAccount)`: `run()` silently no-ops when another task
                    // is already `working` (e.g. an in-flight autosave), and `runDelete` in
                    // `account-page.tsx` calls this only AFTER the server has already deleted the
                    // account — a no-op here would leave `runDelete` reporting "deleted" while
                    // this device's local half never ran. Called directly, with its own
                    // try/catch, so it always runs and still reports a failure the same way
                    // `run()` does.
                    onAccountDeleted={async () => {
                        try {
                            await forgetDeletedAccount();
                        } catch (e) {
                            setError(e instanceof Error ? e.message : String(e));
                        }
                    }}
                    onOpenAdopt={() => {
                        setAccountPageOpen(false);
                        // The standing invitation is about every guest song (#1359).
                        setAdoptScope(null);
                        setAdoptOpen(true);
                    }}
                    // Same P0 gate as the auto-prompt above: until this device has downloaded the
                    // account library once, "which songs are missing?" has no honest answer here.
                    adoptReady={libraryDownloaded(sync.documents)}
                />
            )}
            {accountsOn && signedIn && (
                <AdoptGuestDialog
                    dialogRef={adoptDialogRef}
                    open={adoptOpen}
                    ownerId={sync.owner}
                    online={account.online}
                    scopeGuestIds={adoptScope}
                    onClose={() => {
                        setAdoptOpen(false);
                        setAdoptScope(null);
                    }}
                />
            )}
            {accountsOn && (signedIn || heldWithoutSession) && (
                <SignOutDialog
                    dialogRef={signOutDialogRef}
                    mode={signOutStep ?? 'session'}
                    online={account.online}
                    busy={busy || account.signingOut}
                    preflight={signOutPlan}
                    // Each step shows only its OWN sentence (#1351 patch R9). `account.signOutFailure`
                    // belongs to a refused logout, which is a fact about the session step; rendering
                    // it inside the device step would explain a request that step never made.
                    failure={
                        signOutStep === 'device'
                            ? signOutStepFailure
                            : (signOutStepFailure ??
                              (account.signOutFailure !== null &&
                              account.signOutFailure.kind !== 'cancelled'
                                  ? account.signOutFailure.message
                                  : null))
                    }
                    // The library this step read with its plan, not the songbook's (#1351): an
                    // expired session has no `accountSongs` at all, and the export has to write
                    // exactly the songs the preflight just warned about.
                    songsReady={signOutSongs !== null}
                    onExport={() =>
                        void run(() => {
                            // Only the songs holding work the account has not got. The rest of the
                            // library is already in the cloud and comes back on the next sign-in,
                            // so writing it out too would bury the files that matter.
                            for (const id of signOutPlan?.atRisk ?? []) {
                                const song = signOutSongs?.find((held) => held.id === id);
                                if (!song) {
                                    continue;
                                }
                                // The EDITED bytes, not the committed ones — same precedence as
                                // `open()`, shared with #1271's export-everything offer.
                                exportDocument(latestLocalVersion(song));
                            }
                        })
                    }
                    // Never reachable from the expired step: the button is not rendered there,
                    // because a pass needs the session that has just gone.
                    onSyncNow={() =>
                        void run(async () => {
                            await accountSync.run();
                            const { plan, drafts, songs } = await readSignOutPlan(
                                volatileDrafts.current,
                                null,
                            );
                            // Folded in, for the reason the sign-out read states.
                            for (const [id, held] of drafts) {
                                accountDrafts.current.set(id, held);
                            }
                            setSignOutSongs(songs);
                            setSignOutPlan(plan);
                        })
                    }
                    onConfirm={signOutOfAccount}
                    onClose={() => setSignOutStep(null)}
                />
            )}
            {standCandidate !== null && current && (
                <AdoptRemoteDialog
                    dialogRef={adoptRemoteDialogRef}
                    title={current.title}
                    busy={busy}
                    unsavedEdits={dirty}
                    failure={adoptRemoteFailure}
                    // The chart as it stands, pending bars included — the same bytes Save would
                    // commit, which is exactly what is about to be discarded.
                    onExport={() => void run(exportSong)}
                    onConfirm={adoptAccountVersion}
                    onClose={() => setAdoptRemoteOffer(null)}
                />
            )}
            {inAccount && current && (
                <DeleteSongDialog
                    dialogRef={deleteDialogRef}
                    title={current.title}
                    online={account.online}
                    busy={busy}
                    unsavedEdits={dirty}
                    pendingCount={sync.observation?.pendingCount ?? 0}
                    failure={deleteFailure}
                    onExport={() => void run(exportSong)}
                    onConfirm={deleteFromAccount}
                    onClose={() => setDeleteOpen(false)}
                />
            )}
        </div>
    );
}
