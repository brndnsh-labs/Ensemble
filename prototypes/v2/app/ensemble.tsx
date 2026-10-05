'use client';

import { KEY_ORDER } from '@engine/config';
import { decodeChartLink, encodeChartLink } from '@engine/songbook/chart-link';
import { writtenChart } from '@engine/songbook/codec';
import type { SemanticScore } from '@engine/songbook/score-types';
import type { InstrumentVoice } from '@engine/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    computeAdoptCandidates,
    forgetAdoptionDecision,
    hasDecidedAdoption,
    libraryDownloaded,
    pendingGuestCollections,
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
import { songsOnlyIn } from '../lib/collections';
import {
    arrangementOf,
    blankSong,
    convertedCopy,
    extendedScore,
    genreOf,
    type SectionChange,
    withFollowFeel,
    withoutMeasure,
    withoutSection,
    withSectionSettings,
} from '../lib/documents';
import { validateEditorText } from '../lib/editor';
import { checkPlayable } from '../lib/engine-mode';
import { firstBars } from '../lib/first-bars';
import type { HomeSlice } from '../lib/home';
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
import { collectionWrite, framePace, type PlaylistImport } from '../lib/playlist-import';
import * as repository from '../lib/repository';
import type { ChartDocument } from '../lib/runtime';
import * as runtime from '../lib/runtime';
import {
    allSongsSortPreference,
    forgetOpened as forgetOpenedGuest,
    openedAtMap as guestOpenedAtMap,
    hasDeclinedV1Import,
    recordOpened as recordOpenedGuest,
    rememberAllSongsSort,
    rememberSong,
    rememberV1Import,
    rememberV1ImportDecline,
    rememberV1SessionMark,
    v1ImportLedger,
    v1SessionMark,
} from '../lib/session';
import { withSongMeter } from '../lib/song-meter';
import { allSoundsAvailableOffline, installAllSounds, soundsAvailableOffline } from '../lib/sounds';
import { buildStandardDocument, standardFor } from '../lib/standards';
import { readGuestHome, start } from '../lib/starters';
import type { SavedSong } from '../lib/sync/protocol';
import type { KeepBothResolution } from '../lib/sync/repository';
import type { Progress } from '../lib/sync/status';
import { initializeTelemetry, track } from '../lib/telemetry';
import { hasV1SharePayload, openV1ShareLink, stripV1ShareParams } from '../lib/v1-link';
import { AccountEntry } from './account/account-entry';
import { AccountPage } from './account/account-page';
import { AdoptGuestDialog } from './account/adopt-guest';
import { AdoptRemoteDialog } from './account/adopt-remote';
import { ConflictBanner } from './account/conflict';
import { DeleteSongDialog } from './account/delete-song';
import {
    SyncStatus,
    type SyncStatusProps,
    syncFailureNotice,
    useAccountLibrary,
} from './account/library';
import { type AccountDialogMode, SignInDialog } from './account/sign-in';
import { SignOutDialog, type SignOutMode } from './account/sign-out';
import { useAccountSession, useAccountsSwitch } from './account/use-account-session';
import { AllSongs } from './all-songs';
import { ChartSheet } from './chart-sheet';
import {
    type CollectionDeleteTarget,
    CollectionNameDialog,
    type CollectionNameRequest,
    DeleteCollectionDialog,
} from './collection-dialogs';
import { DeleteGuestSongDialog } from './delete-guest-song';
import { EditPanel } from './edit-panel';
import { FeelSheet, type FeelSnapshot } from './feel-sheet';
import { ImportDialog } from './import-dialog';
import type { MeasureEditorHandle } from './measure-editor';
import { SongHeader } from './song-header';
import { SongMenu } from './song-menu';
import { SongRowMenu, type SongRowMenuTarget } from './song-row-menu';
import { type FeaturedSummary, Songbook, type StandardsEntry } from './songbook';
import { SoundsPanel } from './sounds-panel';
import { StandardsBrowser } from './standards-browser';
import { TradeSheet } from './trade-sheet';
import { TransportBar } from './transport-bar';
import { useChartView } from './use-chart-view';
import { useCollections } from './use-collections';
import { useOfflineInstall } from './use-offline-install';
import { useStageTheme } from './use-stage-theme';

/**
 * Compared as written today (`writtenChart`), not as stored: a change undone by hand on an old
 * chart, which still carries its legacy fields, must not read as an edit — which would
 * otherwise hold an account draft against every later remote advance.
 */
const same = (a: ChartDocument, b: ChartDocument) =>
    a.title === b.title &&
    JSON.stringify(writtenChart(a.chart)) === JSON.stringify(writtenChart(b.chart));

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

/** Read the live engine values the Feel sheet needs but doesn't read off `ChartDocument`. */
function feelSnapshot(): FeelSnapshot {
    const { playback } = runtime.state();
    return {
        bandIntensity: playback.bandIntensity,
        metronome: playback.metronome,
        masterVolume: playback.masterVolume,
        countIn: playback.countIn,
    };
}

// ---------------------------------------------------------------- #1458 Following look-ahead
//
// Module-level and pure DOM math, not component state: the scroll position itself is the only
// thing that needs to change, and computing it fresh off `getBoundingClientRect()` each time
// means there is nothing to keep in sync with React's render — see `CLAUDE.md`'s "keep React
// re-renders cheap" note on this story.

/**
 * Instant under `prefers-reduced-motion: reduce` (Acceptance); smooth otherwise.
 *
 * `'instant'`, not `'auto'`: the `behavior` option's `'auto'` means "do whatever the element's
 * `scroll-behavior` CSS property says", and `.chart-scroll`'s own `scroll-behavior: smooth`
 * (`style.css`) — a class selector — outranks `* { scroll-behavior: auto }`'s reduced-motion
 * override on specificity alone; the universal selector never wins that fight regardless of the
 * media query. `'instant'` is an explicit value the CSS property cannot override.
 */
function scrollBehavior(): ScrollBehavior {
    return typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth';
}

/** `el`'s top in `scrollEl`'s own scrollable content space — stable across a scroll in flight,
 * unlike `getBoundingClientRect()`'s viewport-relative top. */
function docTop(scrollEl: HTMLElement, el: HTMLElement): number {
    return (
        el.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop
    );
}

function clampScrollTop(scrollEl: HTMLElement, top: number): number {
    return Math.max(0, Math.min(top, scrollEl.scrollHeight - scrollEl.clientHeight));
}

/**
 * The doc-space bottom edge of the first ROW strictly below `rowEl`'s own row — not the next
 * `.bar` in document order, which on a 4-per-row desktop layout is usually still a SIBLING in the
 * same row (patch review P3-3: adding its height to `rowEl`'s own double-counted one row as if it
 * were a second one, rather than measuring the next row at all). Naturally includes any
 * `.section-head` between the two rows, since it just reads whatever bar comes next at a lower
 * top, at its ACTUAL rendered position — a taller gap there simply pushes that bar further down.
 * Null past the last row.
 */
function nextRowBottom(scrollEl: HTMLElement, rowEl: HTMLElement): number | null {
    const bars = Array.from(scrollEl.querySelectorAll<HTMLElement>('.bar'));
    const rowTop = rowEl.getBoundingClientRect().top;
    const next = bars
        .slice(bars.indexOf(rowEl))
        .find((bar) => bar.getBoundingClientRect().top > rowTop + 1);
    return next ? docTop(scrollEl, next) + next.getBoundingClientRect().height : null;
}

/**
 * The playing row at the top third of the scroller (Touches #1) — the next two rows then sit
 * fully in the remaining two-thirds on both measured viewports (laptop 4-per-row, phone 2).
 *
 * On a short scroller (a landscape phone, ~250px) a flat 28% can push the playing row down far
 * enough that the next ROW (`nextBottom`, `nextRowBottom` above) no longer fits below it even
 * though the two would fit together at a smaller offset. Clamp the anchor so that, whenever they
 * DO fit together, the anchor never asks for more room than that: the offset only ever shrinks
 * from 28%, so the playing row is never pushed lower than the default position.
 */
function scrollRowIntoView(scrollEl: HTMLElement, rowEl: HTMLElement, nextBottom: number | null) {
    const viewHeight = scrollEl.clientHeight;
    const rowTop = docTop(scrollEl, rowEl);
    let anchor = viewHeight * 0.28;
    if (nextBottom !== null) {
        const combinedHeight = nextBottom - rowTop;
        if (combinedHeight <= viewHeight) {
            anchor = Math.max(0, Math.min(anchor, viewHeight - combinedHeight));
        }
    }
    const top = rowTop - anchor;
    scrollEl.scrollTo({ top: clampScrollTop(scrollEl, top), behavior: scrollBehavior() });
}

/**
 * The jump-ahead scroll (Touches #3): the next bar isn't the adjacent one and is out of view, so
 * put it on screen before its downbeat — anchored the same top-third as the normal row scroll —
 * while keeping the playing bar visible too if both fit in one screenful; if they can't, the
 * target wins outright (the spec's own tie-break).
 */
function scrollForJump(scrollEl: HTMLElement, activeEl: HTMLElement, targetEl: HTMLElement): void {
    const activeTop = docTop(scrollEl, activeEl);
    const activeBottom = activeTop + activeEl.getBoundingClientRect().height;
    const targetTop = docTop(scrollEl, targetEl);
    const targetBottom = targetTop + targetEl.getBoundingClientRect().height;
    const combinedTop = Math.min(activeTop, targetTop);
    const combinedHeight = Math.max(activeBottom, targetBottom) - combinedTop;
    const viewHeight = scrollEl.clientHeight;
    const top =
        combinedHeight <= viewHeight
            ? combinedTop - (viewHeight - combinedHeight) * 0.3
            : targetTop - viewHeight * 0.28;
    scrollEl.scrollTo({ top: clampScrollTop(scrollEl, top), behavior: scrollBehavior() });
}

/** Bar elements in document order, for an adjacency check DOM position alone can't give cleanly
 * (a repeat back or a loop wrap moves to an EARLIER bar, not just a distant later one). */
function barIndex(scrollEl: HTMLElement, el: HTMLElement): number {
    return Array.prototype.indexOf.call(scrollEl.querySelectorAll('.bar'), el);
}

export default function Ensemble() {
    // Two songbooks, never merged and never switched between by a control (#1266, rollout
    // decision 9 S3): the guest library is what a signed-out device plays from, the account
    // library is what a signed-in one plays from, and signing in copies nothing either way.
    //
    // Each songbook is read two ways (#1441). The HOME slice is what the songbook home shows —
    // the Continue song, the recently opened ones by id and a count — and it is all the home page
    // ever reads, so a 2,000-song library opens as fast as a 20-song one. The FULL library is read
    // lazily, the first time a surface needs every song (All songs, search, the v1 import plan,
    // the account page's export and count), and then kept for the page session. `null` is "not
    // read (yet)" for both, never "empty": only a home slice's `count` — IndexedDB's own
    // `count()`, not a partial read — may say a songbook has no songs.
    const [guestHome, setGuestHome] = useState<HomeSlice | null>(null);
    const [guestSongs, setGuestSongs] = useState<ChartDocument[] | null>(null);
    const [guestLibraryFailure, setGuestLibraryFailure] = useState<string | null>(null);
    // The account's home slice carries the owner it was read for: a slice that names anybody but
    // the session's owner is not this songbook's answer, and reads as still loading.
    const [accountHome, setAccountHome] = useState<{ owner: string; slice: HomeSlice } | null>(
        null,
    );
    // Null until the account library has actually been read — an empty array is a claim.
    const [accountSongs, setAccountSongs] = useState<ChartDocument[] | null>(null);
    const [accountLibraryFailure, setAccountLibraryFailure] = useState<string | null>(null);
    /**
     * Which full libraries a surface has asked for (#1441). A ref, because every refresh path reads
     * it synchronously after an await and a closure's snapshot of a state could be a render old;
     * `libraryDemand` is the state that re-runs the load effects when a new one is asked for.
     * Never cleared: once a surface has needed the whole songbook, it stays read for the page.
     */
    const libraryWanted = useRef({ guest: false, account: false });
    const [libraryDemand, setLibraryDemand] = useState(0);
    // Latest-read-wins for the two full-library reads, which a burst of refreshes can overlap.
    const guestLibraryRead = useRef(0);
    const accountLibraryRead = useRef(0);
    // Whose library `accountSongs` holds, so a change of account never shows the last one's.
    const accountSongsOwner = useRef<string | null>(null);
    // The boot read already produced a fresh guest home slice; the home effect skips its first run.
    const bootHomeFresh = useRef(false);
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
    // #1460 — the stand's toast replaced the footer's single-slot status line. `messageToken`
    // exists only so the auto-dismiss effect below can tell "the same sentence, set again" from
    // "still the sentence from four seconds ago": two Saves in a row often produce the exact same
    // text, and a dependency on `message` alone would not re-arm the timer for the second one.
    // `setMessage` is a plain function, not the raw state setter, so every one of this file's
    // existing call sites keeps working unchanged; a `tone` of `'warning'` (review P2 #3) is for
    // a sentence that needs deliberate reading or action — it persists with its own close button
    // instead of auto-dismissing.
    type MessageTone = 'info' | 'warning';
    const [message, setMessageState] = useState('');
    const [messageTone, setMessageToneState] = useState<MessageTone>('info');
    const [messageToken, setMessageToken] = useState(0);
    // Re-review P3 — a REF, not the `messageTone` state value, because an async caller (the
    // retention flow below sets "Draft recovered on this device" from inside a promise chain)
    // closes over whatever `messageTone` was when IT started, which can be stale by the time it
    // resolves. The ref is always current at call time, which is what the guard below needs.
    const messageToneRef = useRef<MessageTone>('info');
    function setMessage(text: string, options?: { tone?: MessageTone }) {
        const tone = options?.tone ?? 'info';
        // Re-review P3 — a transient `info` message must not silently replace an undismissed
        // `warning`: the rename flow's own warning ("This song has unsaved changes…") was getting
        // overwritten moments later by the async draft-retention path's plain "Draft recovered on
        // this device". A `warning` can still replace another `warning` (a newer one supersedes);
        // only an `info` call is held off. The close button (below) is the one place `messageTone`
        // resets afterward — a dismissed warning must not go on blocking every `info` forever.
        if (messageToneRef.current === 'warning' && tone === 'info') {
            return;
        }
        messageToneRef.current = tone;
        setMessageToken((token) => token + 1);
        setMessageState(text);
        setMessageToneState(tone);
    }
    /** The toast's own close button — the one path that clears a `warning`, since `setMessage`'s
     * guard above refuses to let a plain `info` call do it. Resets the tone too, or a dismissed
     * warning would go on blocking every `info` message for the rest of the session. */
    function dismissMessage() {
        messageToneRef.current = 'info';
        setMessageState('');
        setMessageToneState('info');
    }
    // Review P2 #1/#5 — the auto-dismiss timer is paused while the toast has the pointer or
    // focus, so a musician reading (or about to click the close button on) a message it would
    // otherwise clear out from under them gets the time back.
    const [toastHeld, setToastHeld] = useState(false);
    // An audition/share link's `?autoplay=1` (#1382): browsers block audio before a gesture,
    // so this arms one instead of playing immediately — the shared-link effect sets it, and
    // the gesture effect below clears it on the first pointer or key event anywhere on the page.
    const [pendingAutoplay, setPendingAutoplay] = useState(false);
    const [editing, setEditing] = useState(false);
    const [sectionId, setSectionId] = useState('');
    const [buffers, setBuffers] = useState(new Map<string, string>());
    const [measureId, setMeasureId] = useState('');
    const [pendingMeasures, setPendingMeasures] = useState(false);
    const measureEditor = useRef<MeasureEditorHandle>(null);
    const pendingText = useRef(false);
    const [editorRequest, setEditorRequest] = useState(0);
    const revealedEditorRequest = useRef(0);
    // #1440 — set just before an `editorRequest` bump that should focus the title field instead
    // of the reveal effect's usual first-textarea target (a row-menu Rename opening the song to
    // recover a live draft, review P1). Read and cleared by that same effect.
    const focusTitleOnReveal = useRef(false);
    const [search, setSearch] = useState('');
    const [playing, setPlaying] = useState(false);
    const [playbackPending, setPlaybackPending] = useState(false);
    const [active, setActive] = useState<number | null>(null);
    // The count-in beat sounding now (0-based), or null when not counting in (#1422) — cheap
    // enough to ride the same 60ms poll `playing`/`active` already use, no new interval.
    const [countInBeat, setCountInBeat] = useState<number | null>(null);
    // #1211 — id of the section a practice loop is armed/running on, or null.
    // Polled alongside playing/active below; the engine is the source of truth.
    const [loopedSectionId, setLoopedSectionId] = useState<string | null>(null);
    // #1458 — is playback in the ACTIVE bar's last FELT pulse right now? Strengthens the next-bar
    // cue and gates the Following look-ahead's jump-ahead scroll. Edge-triggered off the same
    // 60ms poll below (`runtime.inLastBeat()`, a pure engine read off the live song tick — never
    // the chart's own `active` state, which the poll that publishes it can still be a tick behind)
    // rather than a new interval — it only flips twice a bar, nowhere near "per frame".
    const [nextSoon, setNextSoon] = useState(false);
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
    // `metronome`/`masterVolume` are not part of `current.chart` (`STATE_OWNERSHIP_MANIFEST`:
    // session-only or a device preference, never a document field) — this is the shell's own
    // reactive mirror of the live engine values the Feel sheet reads, refreshed whenever it
    // opens. (Energy is the chart's own, `performance.energy`; `bandIntensity` rides along only
    // for the slider's resting position while it is on auto.)
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
    // baseline), until "Keep a copy" commits it as a normal library document. A ref AND a state
    // mirror, written only by `markSharedDraft`, for `currentStore`'s reason (#1512): `draft()`
    // runs in the same tick as an `open()` that has just cleared the flag, and must read it as it
    // is NOW, not as the render that made the closure saw it.
    const sharedDraftNow = useRef(false);
    const [sharedDraft, setSharedDraft] = useState(false);
    // The standards browse surface (#1439): a second songbook-home view, shown instead of the
    // library list while no chart is on the stand. Opening a standard clears it the same way
    // opening a saved song does.
    const [standardsOpen, setStandardsOpen] = useState(false);
    // The All songs page (#1440): a third songbook-home view, alongside the standards browser.
    const [allSongsOpen, setAllSongsOpen] = useState(false);
    /**
     * The collection the All songs page opens on (#1478) — the one a whole-playlist import just
     * wrote — or null for All songs itself. Set only by that import; every other way in clears it.
     */
    const [allSongsCollection, setAllSongsCollection] = useState<string | null>(null);
    // Which home entry point opened the standards browser (#1441) — "Browse all →" or one
    // shelf's link — so the browser opens on that shelf and focus comes back to that button.
    const [standardsEntry, setStandardsEntry] = useState<StandardsEntry>('all');
    // Where focus returns on leaving either sub-view (#1440 review P3). Held HERE, not inside
    // `StandardsBrowser`/`AllSongs`: this shell survives the view swap that remounts `Songbook`
    // (and its entry buttons) on every return, so a ref captured inside the sub-view itself would
    // always be pointing at a node the swap has already thrown away by the time focus needs it —
    // see either component's own note on why.
    const standardsEntryRef = useRef<HTMLButtonElement>(null);
    const allSongsEntryRef = useRef<HTMLButtonElement>(null);
    // Per-device opened-at map (#1440) — never a document field, and scoped to whichever songbook
    // is live the same way `songs` itself is (guest `localStorage`, or the account database read
    // through `accountSync`). Refreshed by the effect beside the account library read below, and
    // updated directly by `recordOpenedPreference`. Stars are no longer here: since #1477 they
    // are the built-in Starred collection (`useCollections`, below).
    const [openedAt, setOpenedAtState] = useState<Map<string, string>>(() => new Map());
    // #1477 — the collection dialogs of the All songs page: naming one (New, Rename) and deleting
    // one, each driven from this state like the row menu's own dialogs.
    const [collectionNaming, setCollectionNaming] = useState<CollectionNameRequest | null>(null);
    const collectionNameDialogRef = useRef<HTMLDialogElement>(null);
    const [collectionDeleteTarget, setCollectionDeleteTarget] =
        useState<CollectionDeleteTarget | null>(null);
    const [collectionDeleteFailure, setCollectionDeleteFailure] = useState<string | null>(null);
    // The collection THIS TAB's own delete just removed (#1477 review R5) — `deletedRowId`'s rule.
    const [deletedCollectionId, setDeletedCollectionId] = useState<string | null>(null);
    const collectionDeleteDialogRef = useRef<HTMLDialogElement>(null);
    // The row ⋯ menu (#1440), shared by the All songs page and the songbook home. One dialog
    // instance for whichever row is targeted, per `SongRowMenu`'s own note on why.
    const [rowMenuFor, setRowMenuFor] = useState<SongRowMenuTarget | null>(null);
    const rowMenuDialogRef = useRef<HTMLDialogElement>(null);
    // The guest-only delete confirm (#1440).
    const [guestDeleteTarget, setGuestDeleteTarget] = useState<{
        id: string;
        title: string;
        hasRecovery: boolean;
    } | null>(null);
    const guestDeleteDialogRef = useRef<HTMLDialogElement>(null);
    // The row menu's account delete confirm (#1440 review P2) — reuses `DeleteSongDialog`, the
    // same tombstone route the stand's own "Song actions" uses (`deleteOpen` below), but bound to
    // a row target instead of `current`: this one must never navigate to open the song, since the
    // musician may only be asking to delete it, not to visit it.
    const [rowDeleteTarget, setRowDeleteTarget] = useState<{ id: string; title: string } | null>(
        null,
    );
    const [rowDeleteFailure, setRowDeleteFailure] = useState<string | null>(null);
    const rowDeleteDialogRef = useRef<HTMLDialogElement>(null);
    // The songbook's own status line (#1440 review P2) — set only by row actions (renamed,
    // duplicated, deleted, "hasn't reached your account yet"), NEVER the stand's `message`
    // (`open()` always sets one, and reusing it here showed a stale stand status on every visit
    // to the songbook — review's own finding on the previous fix). Cleared at the start of the
    // next row action and on leaving the songbook, so nothing stale lingers into an unrelated
    // later visit.
    const [homeNotice, setHomeNoticeState] = useState('');
    // Which row THIS TAB's own delete just removed (#1440 review P5) — read once by
    // `Songbook`/`AllSongs` to decide whether a shrinking list is worth moving focus for. Never
    // set for a sync-driven removal (another device's delete, a library refresh), which must not
    // steal focus from wherever the musician actually is.
    const [deletedRowId, setDeletedRowId] = useState<string | null>(null);
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
    // #1477 — the live songbook's collections, and the star set every surface reads (Starred's
    // songs). Read keyed on the ATTACHED owner, written to whichever songbook `signedIn` names.
    const collections = useCollections({
        signedIn,
        owner: sync.owner,
        sessionOwner: account.session.status === 'signedIn' ? account.session.owner : null,
        collectionsVersion: sync.collectionsVersion,
    });
    const starred = collections.starred;
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
     * The row-menu Delete confirm's own eligibility (#1440 review P2) — `inAccount` minus the
     * two clauses that are about the STAND specifically (`standStore`/`standMismatch`): a row
     * target is never the chart on the stand, so neither concept applies. What is shared is the
     * one real question, asked of whichever document `requestDeleteRow` pointed the watch at: has
     * the cloud ever confirmed this song at all? A `null` `remoteRevision` here is the same "never
     * uploaded" state the stand's own song menu hides its Delete button for — see `inAccount`'s
     * doc comment above — so this dialog does not render for it either, rather than opening on an
     * action with nothing to do.
     */
    const rowInAccount = accountsOn && signedIn && sync.observation?.remoteRevision != null;
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
     * The `standCandidate` narrowed to the one kind that is ever adoptable (#1362) — every caller
     * that offers "Use the account's version" or opens the confirm step in front of it reads THIS,
     * never the raw `standCandidate`, so a `'deleted'` or `'unsupported'` row can never reach either.
     */
    const standVersionCandidate = standCandidate?.kind === 'version' ? standCandidate : null;
    /**
     * Which shape the one banner above the stand is in (#1267, #1310, widened #1362), or `'none'`.
     *
     * A refused Save outranks a preserved candidate, and the two genuinely can coexist — a download
     * that met a parked outbox preserves a body beside it. The refusal is the state that blocks
     * every later Save of this song, and it is the one `keepBoth` resolves; the candidate is
     * reachable again the moment it is resolved.
     */
    const standBanner:
        | 'none'
        | 'version'
        | 'gone'
        | 'candidate'
        | 'candidate-deleted'
        | 'candidate-unsupported' =
        conflict !== 'none'
            ? conflict
            : standCandidate === null
              ? 'none'
              : standCandidate.kind === 'version'
                ? 'candidate'
                : standCandidate.kind === 'deleted'
                  ? 'candidate-deleted'
                  : 'candidate-unsupported';
    // #1389 — once per transition into a shown banner (not once per render it stays up, and not
    // for the songbook screen's own re-renders, which don't hold a `standBanner` at all).
    useEffect(() => {
        if (standBanner !== 'none') {
            track('sync_conflict_shown');
        }
    }, [standBanner]);
    /**
     * The songs the songbook marks, and which sentence each row gets (#1310, widened #1362). Ids
     * and kinds only: the revision beside each one is the stand's business — it is what a `version`
     * adoption is compared against, and a presentational list has nothing to compare.
     */
    const remoteCandidateRows = sync.candidates.map((update) => ({
        id: update.documentId,
        kind: update.kind,
    }));
    // The session's owner, when signed in — the account a home slice has to have been read for.
    const sessionOwner = account.session.status === 'signedIn' ? account.session.owner : null;
    // #1478 — how much room the signed-in account has, by this device's VERIFIED copy of it, for
    // the import's cap line (review R1: or why that can't be told yet). Stable per owner, so the
    // dialog reads it once per playlist and again only as the library download moves.
    const accountImportRoom = useCallback(
        () => accountSync.importRoom(sessionOwner),
        [sessionOwner],
    );
    // The live songbook's home slice (#1441), or null while it has not been read. Signed in, a
    // slice read for anybody else is not an answer yet.
    const liveHome = signedIn
        ? accountHome !== null && accountHome.owner === sessionOwner
            ? accountHome.slice
            : null
        : guestHome;
    // The live songbook's FULL library, or null while no surface has asked for it or its read is
    // still out — never `[]` for "not read". Only surfaces that need every song read this.
    const liveSongs = signedIn ? accountSongs : guestSongs;
    const liveLibraryFailure = signedIn ? accountLibraryFailure : guestLibraryFailure;
    // The last-resort `template` fallback (below): a genre-accurate, never-stored standard,
    // built once and kept referentially stable so it never re-arms the shared-link effect that
    // lists `template` as a dependency.
    const defaultTemplate = useMemo(
        () => buildStandardDocument(standardFor('standard-12-bar-blues')!),
        [],
    );
    // Two things the songbook cannot yet claim: WHICH library this is (the first session read is
    // still out — rendering the guest list and then swapping it for the account library is a
    // wrong answer, not a loading state), and what the live songbook's home holds. `settled` flips
    // on any answer, so an offline cold start still shows the guest songbook.
    const songbookLoading = (accountsOn && ready && !account.settled) || liveHome === null;
    // The band/sound defaults a brand-new or imported song is built from. Falls back through:
    // the live songbook's most recently opened song, else the guest songbook's (a fresh account's
    // library is legitimately empty), else the standards catalog's own defaults (#1439) — a fresh
    // DEVICE's guest songbook is legitimately empty too, now that starter seeding is retired, and
    // "New song" and "Import" must still work on the very first visit, before anything is saved.
    // One document is all this needs, so it comes from the home slices (#1441), never a full read.
    const template =
        liveHome?.rows[0] ?? liveHome?.continued ?? guestHome?.rows[0] ?? defaultTemplate;
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
     *
     * Null while it cannot be decided yet (#1441): the verdict is a diff against the WHOLE guest
     * songbook, which the home page no longer reads, so an offer waits for that lazy read rather
     * than rendering "nothing to bring over" from a songbook nobody has looked at.
     */
    const [v1Plan, setV1Plan] = useState<V1ImportPlan | null>(null);
    /**
     * Why no plan can be made, when none can (#1441 review P2) — the whole guest songbook would
     * not read (one corrupt song is enough: `repository.list` refuses a songbook it cannot wholly
     * read), or the plan itself threw. Said on the card, never a card that silently never
     * appears: an offer the musician ASKED for must always answer.
     */
    const [v1PlanFailure, setV1PlanFailure] = useState<string | null>(null);
    /**
     * Has this page load looked for the old Ensemble's data yet (#1441 review P2)? With the plan
     * now waiting on a lazy read, "no card" is only a fact once this is true and any offer's plan
     * has settled — the songbook publishes that as `data-v1-plan`, so a check that no offer
     * appears has something positive to wait for.
     */
    const [v1Looked, setV1Looked] = useState(false);
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
    /**
     * Re-review P3 — measures `.stand-stack`'s ACTUAL rendered height (0 when nothing shows,
     * taller as the message toast/failure notice/pill stack up) into a CSS custom property, so
     * `.chart-scroll`'s bottom padding only grows past its normal floor while the stack genuinely
     * has something in it, instead of a fixed worst-case reservation eating chart space that used
     * to fit before any of this existed. A callback ref, not `useRef`+`useEffect`: the stack only
     * exists inside the conditionally-rendered stand, so an effect keyed on mount alone would run
     * once at the WHOLE APP's mount (before any chart is ever open) and never re-attach when the
     * stand's own JSX later mounts the node this actually needs to observe.
     */
    const standStackObserver = useRef<ResizeObserver | null>(null);
    const standStackRef = useCallback((el: HTMLDivElement | null) => {
        standStackObserver.current?.disconnect();
        standStackObserver.current = null;
        if (!el) {
            document.documentElement.style.setProperty('--stand-stack-height', '0px');
            return;
        }
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                document.documentElement.style.setProperty(
                    '--stand-stack-height',
                    `${entry.contentRect.height}px`,
                );
            }
        });
        observer.observe(el);
        standStackObserver.current = observer;
    }, []);
    // Following's look-ahead scroll (#1458): the active bar's document-space top the last time
    // it scrolled there, so a chord change WITHIN the same row (no vertical move) is a no-op —
    // null right after Following turns back on, forcing an immediate re-apply ("Resume follow").
    const followRowTop = useRef<number | null>(null);
    // The performed BAR the jump-ahead scroll last fired for (patch review P3-2 — not the
    // `active` slot: a chord landing exactly on the last felt pulse changes slot without
    // changing bar), so the last-beat window (several 60ms ticks) triggers it exactly once
    // rather than on every tick it stays true.
    const followJumpedFor = useRef<number | null>(null);
    const editPanel = useRef<HTMLElement>(null);
    // Moved up from beside its JSX consumers so the Following effects below — which need
    // `activeBar` (patch review P3-2) — can read it without a forward reference; `useChartView`
    // has no render boundary of its own, so calling it here instead of later changes nothing
    // about what it computes, only where its already-fresh-every-render result becomes available.
    const {
        blocks,
        displayActive,
        displayNext,
        activeEvent,
        activeBar,
        totalBars,
        writtenBars,
        writtenSections,
    } = useChartView(current, active);
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
        // #1389 — a real production visit only; no-op everywhere else (dev, ensembletest, the
        // Playwright export). Independent of `start()`'s engine boot below, so a slow/failed
        // boot never delays or blocks the (optional, best-effort) pageview.
        initializeTelemetry();
        let alive = true;
        start()
            .then((result) => {
                if (alive) {
                    setGuestHome(result);
                    bootHomeFresh.current = true;
                    setReady(true);
                }
            })
            .catch((e) => {
                if (alive) {
                    setError(String(e.message || e));
                }
            });
        // The stand follows the performance every animation frame while it plays (#1240), reading
        // the playhead straight off the engine: a fixed-period sample of it could step over a
        // chord shorter than the period (a sixteenth at 240 bpm is 62.5ms). Stopped, a 60ms
        // check notices playback started anywhere else — the lock screen's media controls. A
        // hidden page gets no frames, so a slower timer still notices playback stopping there.
        let frame = 0;
        let idle = 0;
        const follow = () => {
            window.cancelAnimationFrame(frame);
            window.clearTimeout(idle);
            const playingNow = runtime.state().playback.isPlaying;
            const slot = playingNow ? runtime.playheadSlot() : -1;
            setPlaying(playingNow);
            // No slot while counting in or between two queued segments: the pointer holds.
            setActive((previous) => (!playingNow ? null : slot >= 0 ? slot : previous));
            setLoopedSectionId(runtime.loopedSection());
            setCountInBeat(runtime.countInBeat());
            // #1458 — a pure engine read off the live song tick, not the ACTIVE bar's rendered DOM
            // node: React hasn't necessarily committed `active`'s new value yet on the very frame
            // playback crosses a barline, so reading the OLD bar's DOM attributes here would still
            // see the bar just left after the engine had already moved on.
            setNextSoon(runtime.inLastBeat());
            if (playingNow) {
                frame = window.requestAnimationFrame(follow);
            }
            idle = window.setTimeout(follow, playingNow ? 250 : 60);
        };
        follow();
        const preventLoss = (event: BeforeUnloadEvent) => {
            if (volatileDrafts.current.size || pendingText.current) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', preventLoss);
        return () => {
            alive = false;
            window.cancelAnimationFrame(frame);
            window.clearTimeout(idle);
            window.removeEventListener('beforeunload', preventLoss);
        };
    }, []);
    /**
     * Lands `document` on the stand as an unsaved draft — belonging to no songbook until "Keep a
     * copy"/Save decides one. Shared by every entry that opens a chart this way: a `#chart=` or
     * v1 share link (below), and opening a standard from the catalog (`openStandard`, #1439).
     * Deliberately not `open()`: no `saved` baseline (so it can't masquerade as already
     * committed), no recovery-storage write (the id may be untrusted, or a catalog id that is
     * never meant to collide with a recovery key), and `lastOpened`/`rememberSong` are left alone
     * since this isn't a library entry yet.
     */
    function landDraftOnStand(document: ChartDocument, note: string) {
        const withFeel = withFollowFeel(document);
        runtime.load(withFeel);
        setSaved(null);
        setCurrent(runtime.withLoadedSounds(withFeel));
        currentStore.current = null;
        setStandStore(null);
        markSharedDraft(true);
        pendingText.current = false;
        setBuffers(new Map());
        setPendingMeasures(false);
        measureEditor.current?.reset();
        setRecoveryHealthy(true);
        setEditing(false);
        setFollowing(true);
        setMessage(note);
        const section = arrangementOf(withFeel).sections[0];
        setSectionId(section.id);
        if (withFeel.schemaVersion === 2) {
            setMeasureId(
                withFeel.chart.score.sections.find((s) => s.id === section.id)!.measures[0].id,
            );
        }
    }
    // `landDraftOnStand` is a component-scope function declaration, a new reference every
    // render, which useExhaustiveDependencies rightly rejects as a hook dependency.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see above.
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
        // `landDraftOnStand` handles both entries so they open the SAME draft rather than two
        // drifting copies of it. `track` stays here rather than inside that shared helper: this
        // is the one call site that knows `legacy`, and `openStandard` (#1439) tracks its own
        // `chart_opened` event instead of `share_opened`.
        const openSharedDraft = (link: ChartDocument, note: string, legacy: boolean) => {
            track('share_opened', { legacy });
            landDraftOnStand(link, note);
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
                // #1460 review P2 #3 — "tap anywhere to play" is no longer baked into this note:
                // it is derived reactively from `pendingAutoplay` (`pendingAutoplayHint`) so it
                // stays lit for exactly as long as autoplay is armed, not just the ~4s an `info`
                // message gets.
                openSharedDraft(
                    older.document,
                    'Opened from an older shared link · not saved yet',
                    true,
                );
                if (older.autoplay) {
                    setPendingAutoplay(true);
                }
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
                openSharedDraft(document, 'Opened from a shared link · not saved yet', false);
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
    // `startPlayback` is a component-scope function declaration, a new reference every render;
    // listing it would re-arm the listeners on every render while a link's autoplay is
    // pending, the same convention the shared-link effect above documents for `openSharedDraft`.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see above.
    useEffect(() => {
        // An armed `?autoplay=1` link (#1382): browsers block audio before a user gesture, so
        // this waits for the first one anywhere on the page — a click/tap or a key press,
        // exactly what pressing Play itself would supply — then starts the band the same way
        // Play does and disarms itself. `{ once: true }` on each listener means whichever
        // fires first already removed itself; the cleanup below catches the other.
        if (!pendingAutoplay) {
            return;
        }
        const start = (event: Event) => {
            setPendingAutoplay(false);
            const target = event.target;
            // The gesture landed on Play itself (`data-play-toggle`, `transport-bar.tsx`):
            // disarm and let the button's OWN `onClick` start playback. Calling
            // `startPlayback()` here too raced that click — `runtime.toggle()` can resolve
            // inside the ~100ms between a tap's `pointerdown` and its `click`, so by the time
            // `onPlayToggle` ran `isPlaying` already read true and it called `runtime.stop()`,
            // starting and immediately stopping the band on the very tap meant to start it.
            if (target instanceof Element && target.closest('[data-play-toggle]')) {
                return;
            }
            startPlayback();
        };
        // `capture: true` so a nested handler's `stopPropagation` on the way up can't
        // swallow the gesture before this sees it — this listener only ever reads the
        // event, never acts on behalf of whatever it landed on.
        window.addEventListener('pointerdown', start, { once: true, capture: true });
        window.addEventListener('keydown', start, { once: true, capture: true });
        return () => {
            window.removeEventListener('pointerdown', start, { capture: true });
            window.removeEventListener('keydown', start, { capture: true });
        };
    }, [pendingAutoplay]);
    // Disarms autoplay the moment the band is playing by ANY means — including the Play
    // button's own click a moment after the branch above deferred to it — so a later stray
    // tap/key elsewhere on the page can never reach `startPlayback()` a second time.
    useEffect(() => {
        if (playing) {
            setPendingAutoplay(false);
        }
    }, [playing]);
    useEffect(() => {
        // #1274 — look for v1 data only once the songbook is ready: guest startup owns
        // the critical path, and nothing here may delay or block it. A profile whose v1
        // data is corrupt still reaches this (findV1Data reports it as a problem), and a
        // storage read that throws outright leaves the stand exactly as it was.
        if (!ready) {
            return;
        }
        setV1Looked(true);
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
    // `draftsHeldFor` and `wantLibrary` are stable component-scope helpers, not values this effect
    // should re-run for; its real inputs are the three states in the array below.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see above.
    useEffect(() => {
        // #1274 patch N2 — what the card may promise, from the run's own verdicts. Off the
        // render path (it converts through the codec and reads the mark), and re-derived
        // whenever the offer or the songbook moves, which includes right after a run.
        if (!v1Data) {
            setV1Plan(null);
            setV1PlanFailure(null);
            return;
        }
        if (guestSongs === null) {
            setV1Plan(null);
            if (guestLibraryFailure !== null) {
                // The read that the plan is a diff against failed. Said, with its reason —
                // a guess in either direction ("nothing new" or "import all") would be wrong.
                setV1PlanFailure(
                    `Some songs on this device couldn’t be read, so the old Ensemble’s songs can’t be compared with them yet. ${guestLibraryFailure}`,
                );
                return;
            }
            // A whole-library pass (#1441): ask for the guest songbook and wait for it.
            setV1PlanFailure(null);
            wantLibrary('guest');
            return;
        }
        const base = current ?? guestSongs[0] ?? defaultTemplate;
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
            setV1PlanFailure(null);
        } catch (failure) {
            // A plan must never take the songbook down — and it must not make the card vanish
            // either, taking the unreadable-v1 problems it lists with it. Said instead.
            setV1Plan(null);
            setV1PlanFailure(
                `The old Ensemble’s songs couldn’t be compared with this songbook. ${failure instanceof Error ? failure.message : String(failure)}`,
            );
        }
    }, [v1Data, guestSongs, guestLibraryFailure, current]);
    useEffect(() => {
        if (editing && !busy && editorRequest !== revealedEditorRequest.current) {
            // Reveal the actual input, including an already-open editor's selected section.
            revealedEditorRequest.current = editorRequest;
            // #1440 — a row-menu Rename that opened the song to recover a live draft asks for
            // the title field instead of the usual first chord textarea.
            const focusTitle = focusTitleOnReveal.current;
            focusTitleOnReveal.current = false;
            const input = focusTitle
                ? editPanel.current?.querySelector<HTMLInputElement>('#title')
                : editPanel.current?.querySelector<HTMLTextAreaElement>('textarea');
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
    // on disk (a Save committed, a download advanced or removed a record) — but since #1441 only
    // once a surface has asked for the WHOLE library (`wantLibrary`); the home page reads its own
    // slice. `sync.owner` rather than `signedIn` is the gate: it is published only once the loop
    // has a scope, so the first read cannot race the attach. Nothing here touches
    // `current`/`saved` — the list changing is never allowed to change the chart on the stand.
    // `libraryVersion` and `libraryDemand` are not read in the body: they are "the stored library
    // moved" and "a surface just asked", and re-running this read is exactly why the effect
    // depends on them. `reloadAccountLibrary` is a component-scope function.
    // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate re-run triggers.
    useEffect(() => {
        if (sync.owner === null) {
            accountLibraryRead.current += 1;
            accountSongsOwner.current = null;
            setAccountSongs(null);
            setAccountLibraryFailure(null);
            return;
        }
        if (accountSongsOwner.current !== null && accountSongsOwner.current !== sync.owner) {
            // Another account's list is never shown as this one's while this one's is read.
            accountSongsOwner.current = null;
            setAccountSongs(null);
        }
        if (!libraryWanted.current.account) {
            return;
        }
        void reloadAccountLibrary(sync.owner);
    }, [sync.owner, sync.libraryVersion, libraryDemand]);
    // #1440 — the opened-at map follows whichever songbook is live, the same gate
    // `accountSongs` uses above: `sync.owner` publishes only once the loop has attached, so the
    // first read cannot race it, and a sign-out (owner going null) falls straight back to the
    // guest reads. `libraryVersion` is not read in the body — see the comment on the effect above.
    // `alive` guards the same race the sibling effect does (review #1440 P2): a slow account read
    // started before a sign-out must not land after it and overwrite the guest sets it already
    // fell back to.
    // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate re-run trigger.
    useEffect(() => {
        if (sync.owner === null) {
            setOpenedAtState(guestOpenedAtMap());
            return;
        }
        let alive = true;
        accountSync
            .openedAtMap()
            .then((map) => {
                if (alive) {
                    setOpenedAtState(map);
                }
            })
            .catch(() => {
                // Best-effort preference read; the songbook still renders without opened-at
                // data, and the next sign-in/out or library-version bump tries again.
            });
        return () => {
            alive = false;
        };
    }, [sync.owner, sync.libraryVersion]);
    /**
     * A change of account, as the attached loop publishes it. Which chart to continue (#1299) is no
     * longer read here: it is part of each songbook's home slice since #1441 (`homeLibrary`,
     * `readGuestHome`), so an account's own "last opened" still comes from its database and
     * signing out still falls back to the guest key.
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
    useEffect(() => {
        if (rowMenuFor) {
            rowMenuDialogRef.current?.showModal();
        } else {
            rowMenuDialogRef.current?.close();
        }
    }, [rowMenuFor]);
    // #1477 — the collection dialogs, driven from their state like the row menu above.
    useEffect(() => {
        if (collectionNaming) {
            collectionNameDialogRef.current?.showModal();
        } else {
            collectionNameDialogRef.current?.close();
        }
    }, [collectionNaming]);
    useEffect(() => {
        if (collectionDeleteTarget) {
            collectionDeleteDialogRef.current?.showModal();
        } else {
            collectionDeleteDialogRef.current?.close();
        }
    }, [collectionDeleteTarget]);
    useEffect(() => {
        if (guestDeleteTarget) {
            guestDeleteDialogRef.current?.showModal();
        } else {
            guestDeleteDialogRef.current?.close();
        }
    }, [guestDeleteTarget]);
    // Closes itself if `rowInAccount` goes false while open (the same posture the stand's own
    // `deleteOpen` effect takes) — a queued Save landing mid-confirm, or the account detaching,
    // must not leave a confirm button pointed at a state that no longer supports it. Releases the
    // watch/claim on the way out like every other exit (#1440 review P2) — without it, this path
    // left `activeDocumentId`/the watch pointed at the row forever, so a later download pass kept
    // flagging it as a candidate long after the confirm step itself was gone. Inlined rather than
    // calling `closeRowDeleteConfirm` so this effect's dependency list stays exhaustive without
    // naming a plain function that is recreated every render.
    useEffect(() => {
        if (!rowInAccount) {
            if (rowDeleteTarget) {
                setRowDeleteTarget(null);
                accountSync.setActiveDocument(null);
                void accountSync.watch(null);
            }
            return;
        }
        if (rowDeleteTarget) {
            rowDeleteDialogRef.current?.showModal();
        } else {
            rowDeleteDialogRef.current?.close();
        }
    }, [rowDeleteTarget, rowInAccount]);
    // Focus returns to the entry point on the way back from either sub-view (#1440 review P3),
    // rather than falling to `<body>` — see `standardsEntryRef`'s own note above for why this has
    // to live here rather than inside `StandardsBrowser`/`AllSongs`. Guarded by the PREVIOUS value
    // so this only fires on the true→false transition, never on the render that first opens one.
    const wasStandardsOpen = useRef(false);
    useEffect(() => {
        if (wasStandardsOpen.current && !standardsOpen) {
            standardsEntryRef.current?.focus();
        }
        wasStandardsOpen.current = standardsOpen;
    }, [standardsOpen]);
    const wasAllSongsOpen = useRef(false);
    useEffect(() => {
        if (wasAllSongsOpen.current && !allSongsOpen) {
            allSongsEntryRef.current?.focus();
        }
        wasAllSongsOpen.current = allSongsOpen;
    }, [allSongsOpen]);
    // The songbook's own status line is cleared on leaving it (#1440 review P2) — opening a chart
    // shows the STAND's own status instead, and a later, unrelated return to the songbook must
    // not resurrect whatever a row action said minutes ago.
    useEffect(() => {
        if (current) {
            setHomeNoticeState('');
        }
    }, [current]);
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
    //
    // Reads `standVersionCandidate`, not `standCandidate` (#1362): this offer is "Use the account's
    // version", and a `'deleted'` or `'unsupported'` row is never that offer.
    const adoptRemoteOffered = standVersionCandidate !== null;
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
    /**
     * The inputs the last COMPLETED zero-candidate check ran against (#1441 review P5), or null.
     *
     * `computeAdoptCandidates` reads the whole guest songbook and the whole account library, and
     * this effect re-runs on every download progress publish, every dialog and every return from
     * the stand. When nothing it diffs has changed since a check that found nothing to offer, the
     * answer is the same "nothing", so it is not asked again. The key is the owner, the account
     * library's downloaded counts and the guest songbook's own `count()` — candidates are decided
     * by document ID, so only a song arriving or leaving on either side can change the answer.
     * Only a check that finished with zero candidates is remembered: one that found some opens the
     * offer (and `adoptOffered` takes over), and one that failed or was superseded proves nothing.
     */
    const adoptCheckedKey = useRef<string | null>(null);
    // Read by the effect below without re-running it: a guest write changes the key, and the
    // next ordinary trigger then checks again, exactly when it always would have.
    const guestSongCount = useRef<number | null>(null);
    guestSongCount.current = guestHome?.count ?? null;
    useEffect(() => {
        const owner = sync.owner;
        if (owner === null) {
            // Signed out: this attach is over, and the next one — same account or not — is a
            // fresh offer rather than one this device has already made.
            adoptOffered.current = null;
            adoptCheckedKey.current = null;
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
        const key = `${owner}|${sync.documents.required}|${sync.documents.verified}|${guestSongCount.current}`;
        if (adoptCheckedKey.current === key) {
            return;
        }
        let alive = true;
        void computeAdoptCandidates(owner)
            .then(async (offer) => {
                // No song to add, but guest collections the account's copies lack (#1477 review
                // R3), is an offer too: the dialog then asks about the collections alone. Only a
                // device that has never answered on this owner reaches it (the gate above): one
                // signing into an account that already holds its songs under the same ids — a
                // second device with the same seeded or imported songs — or one whose songs were
                // adopted without this device being asked. A device that answered before uses
                // the account page's button, which asks no matter what.
                const collections =
                    offer.candidates.length === 0
                        ? await pendingGuestCollections(owner).catch(() => 0)
                        : 0;
                if (alive && offer.candidates.length === 0 && collections === 0) {
                    adoptCheckedKey.current = key;
                }
                if (alive && (offer.candidates.length > 0 || collections > 0)) {
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
    // #1441 — the guest songbook's FULL library, read once a surface asks for it (`wantLibrary`)
    // and kept for the page. A read that failed leaves it null with its reason in
    // `guestLibraryFailure`, and the next ask retries. `libraryDemand` is the ask;
    // `reloadGuestLibrary` is a component-scope function.
    // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate re-run trigger.
    useEffect(() => {
        if (!ready || !libraryWanted.current.guest || guestSongs !== null) {
            return;
        }
        void reloadGuestLibrary();
    }, [ready, libraryDemand, guestSongs]);
    /**
     * #1441 — the live songbook's HOME slice, re-read whenever the home page comes back into view
     * (leaving the stand is when "recently opened" last changed) and whenever the account library
     * moved on disk. This is the only read the home page makes: the Continue song and the ≤8
     * recently opened ones by id, plus a `count()`.
     *
     * Signed in, it waits for the loop's published owner to be the session's — the same gate the
     * full-library read uses — and a refusal while the attach settles is "not ready yet", exactly
     * as `refreshSongs` treats it. Signed out, the boot read (`start()`) has already produced one,
     * so the first run is skipped rather than read twice. `libraryVersion` is a trigger only.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate re-run triggers.
    useEffect(() => {
        if (!ready || onStand) {
            return;
        }
        if (bootHomeFresh.current) {
            bootHomeFresh.current = false;
            if (!signedIn) {
                return;
            }
        }
        let alive = true;
        const fail = (failure: unknown) => {
            if (alive && !(failure instanceof AccountMismatchError)) {
                setError(failure instanceof Error ? failure.message : String(failure));
            }
        };
        if (signedIn) {
            const owner = sync.owner;
            if (owner === null || owner !== sessionOwner) {
                return;
            }
            accountSync.homeLibrary(owner).then((slice) => {
                if (alive) {
                    setAccountHome({ owner, slice });
                }
            }, fail);
        } else {
            readGuestHome().then((slice) => {
                if (alive) {
                    setGuestHome(slice);
                }
            }, fail);
        }
        return () => {
            alive = false;
        };
    }, [ready, onStand, signedIn, sync.owner, sessionOwner, sync.libraryVersion]);
    useEffect(() => {
        if (feelMenu) {
            // Refreshed on every open: these fields can drift from what the sheet last
            // showed (a different song opened, which resets the energy level).
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
    // "Resume follow" re-applies the look-ahead immediately (Touches #4): forget the last row we
    // scrolled to and the slot we last jumped for, so the two effects below don't mistake picking
    // follow back up for "nothing moved" and sit still.
    useEffect(() => {
        if (following) {
            followRowTop.current = null;
            followJumpedFor.current = null;
        }
    }, [following]);
    // Stop, and opening a different chart, both retire whatever row/jump memory the last song's
    // playback left behind — otherwise a `Start here` that lands on the very row a scrollbar drag
    // last remembered would wrongly read as "nothing moved" and sit still.
    useEffect(() => {
        if (active === null) {
            followRowTop.current = null;
            followJumpedFor.current = null;
        }
    }, [active]);
    useEffect(() => {
        if (!current?.id) {
            return;
        }
        followRowTop.current = null;
        followJumpedFor.current = null;
    }, [current?.id]);
    // `followJumpedFor`'s de-dupe (below) is keyed on the PERFORMED BAR (`activeBar`), which is a
    // fixed array position the band re-walks every lap — so it recurs identically on lap 2, lap 3,
    // and so on. Retiring it the moment `nextSoon` goes false (the playing bar's last-beat window
    // closing) means the NEXT time any bar's last beat arrives — the very same bar index
    // included — the jump-ahead is live again, rather than permanently spent after its first fire.
    useEffect(() => {
        if (!nextSoon) {
            followJumpedFor.current = null;
        }
    }, [nextSoon]);
    // Following's look-ahead scroll (#1458, Touches #1): on each ROW change — not bar change — put
    // the playing row at the top third of `.chart-scroll`, so the next two rows stay fully visible.
    // Keyed on `active` (which changes at chord granularity, at least once per bar) rather than a
    // poll: `followRowTop` turns a same-row chord change into a no-op via the guard below.
    useEffect(() => {
        if (!following || active === null) {
            return;
        }
        const scrollEl = scroll.current;
        const activeEl = scrollEl?.querySelector<HTMLElement>('[data-active="true"]');
        if (!scrollEl || !activeEl) {
            return;
        }
        if (scrollEl.scrollHeight <= scrollEl.clientHeight + 1) {
            return; // Acceptance: a chart that already fits never scrolls.
        }
        const top = docTop(scrollEl, activeEl);
        if (followRowTop.current !== null && Math.abs(top - followRowTop.current) < 1) {
            return; // Same row as last time: a chord changed, not a row.
        }
        followRowTop.current = top;
        scrollRowIntoView(scrollEl, activeEl, nextRowBottom(scrollEl, activeEl));
    }, [active, following]);
    // The jump-ahead (#1458, Touches #3): fires once per bar, on `nextSoon`'s rising edge (the
    // playing bar's last beat), only when the next performed bar isn't document-adjacent to the
    // active one and isn't already on screen — a repeat back, an ending skip, the form's loop to
    // bar 1, or a practice loop's wrap. `followJumpedFor` is the de-dupe, keyed on the PERFORMED
    // BAR rather than `active`'s slot (patch review P3-2): a chord landing exactly on the last
    // felt pulse changes `active` without changing the bar, and a slot-keyed de-dupe would let
    // that re-fire the jump a second time inside the very same bar. `nextSoon` stays true for
    // several 60ms ticks, this must act on only the first one (and is retired above the moment
    // `nextSoon` next goes false, so lap 2's last beat can fire it again).
    useEffect(() => {
        if (
            !nextSoon ||
            !following ||
            activeBar === null ||
            followJumpedFor.current === activeBar
        ) {
            return;
        }
        const scrollEl = scroll.current;
        const activeEl = scrollEl?.querySelector<HTMLElement>('[data-active="true"]');
        const targetEl = scrollEl?.querySelector<HTMLElement>('[data-next]');
        if (!scrollEl || !activeEl || !targetEl) {
            return;
        }
        if (scrollEl.scrollHeight <= scrollEl.clientHeight + 1) {
            return;
        }
        if (barIndex(scrollEl, targetEl) === barIndex(scrollEl, activeEl) + 1) {
            return; // Adjacent — the row-scroll effect above already keeps it visible.
        }
        const scrollRect = scrollEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const inView = targetRect.top >= scrollRect.top && targetRect.bottom <= scrollRect.bottom;
        if (inView) {
            return;
        }
        followJumpedFor.current = activeBar;
        scrollForJump(scrollEl, activeEl, targetEl);
    }, [nextSoon, following, activeBar]);

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
     * Start the band playing — `TransportBar`'s Play button when it isn't already playing, and
     * an armed `?autoplay=1` link's gesture handler below (#1382). One function so the two
     * callers can't drift: an autoplay link is otherwise indistinguishable from a musician
     * pressing Play themselves.
     */
    function startPlayback() {
        void run(async () => {
            // #1460 — a hint like "tap anywhere to play" is stale the instant the band actually
            // starts; the toast that replaced the footer no longer has "Band is playing" to
            // silently outrank it, so this clears it explicitly.
            setMessage('');
            // Review P3 — a scroll while STOPPED already turns Following off (`chart-scroll`'s
            // handler); without this, pressing Play then landed on a stand that was playing,
            // unfollowed, with the Resume-follow pill already showing before anything moved.
            setFollowing(true);
            const next = updateChart();
            setEditing(false);
            setShowControls(false);
            setSoundMenu(false);
            await runtime.toggle(setSoundProgress);
            setPlaying(runtime.state().playback.isPlaying);
            setSoundsOffline(await soundsAvailableOffline(next.chart));
            setSoundProgress('');
        });
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
    /** The ONE writer of the shared-draft flag (#1512): the ref and its state mirror together. */
    function markSharedDraft(shared: boolean) {
        sharedDraftNow.current = shared;
        setSharedDraft(shared);
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
                // #1440's per-song map, alongside this function's own single Continue-card
                // pointer — same owner, same fence.
                recordOpenedPreference(id, stand.ownerId);
            }
        } else {
            rememberSong(id);
            recordOpenedPreference(id, null);
        }
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
        // A shared draft — a standard or a #chart=/v1 link (`landDraftOnStand`) — belongs to no
        // songbook yet and has no `saved` baseline to recover FROM if the tab closes; "Keep a
        // copy"/Save is what turns it into a library entry, and `open()` clears the flag the
        // moment that happens. Writing recovery storage for it here would key a slot under
        // the shared id (a catalog id for a standard) that nothing but a Save — which this isn't
        // — ever clears, so "Preserved drafts" would grow by one per edited-but-unsaved visit.
        // Read from the ref (#1512): a caller that has just awaited `open()` holds a closure
        // whose `sharedDraft` still describes the chart that was on the stand before it.
        if (sharedDraftNow.current) {
            return;
        }
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
    // Section tap menu's "Start here" (#1422): jump playback to a section's first performed
    // bar, same `id`-may-be-undefined guard as `toggleSectionLoop` above.
    function startHereSection(id: string | undefined) {
        if (!id) {
            return;
        }
        // Re-review P3 — the same reasoning as `startPlayback`: this is another way of starting
        // playback, and a scroll while stopped must not leave it starting unfollowed with the
        // pill already showing.
        setFollowing(true);
        void run(async () => {
            await runtime.startSection(id, setSoundProgress);
            setLoopedSectionId(runtime.loopedSection());
            setSoundProgress('');
        });
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
    /**
     * Returns the resolved `{ current, saved }` pair it just committed to state (#1440 review
     * P4) — a caller that needs to act on the FRESH chart right after opening (rather than
     * `current`/`saved`'s own stale closure snapshot from before this ran) reads it from here.
     */
    async function open(
        document: ChartDocument,
    ): Promise<{ current: ChartDocument; saved: ChartDocument }> {
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
        const savedBaseline = next === stored ? onDevice : stored;
        setSaved(savedBaseline);
        setCurrent(onDevice);
        // The songbook this chart came from AND the account it belongs to, for as long as it is
        // on the stand (#1311). From the SESSION, not `sync.owner` — see `liveStand` for why the
        // loop's snapshot is null in exactly the window this has to be right in.
        bindStand(liveStand());
        markSharedDraft(false);
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
        if (recovery?.conflict) {
            // #1460 review P2 #3 — this needs reading time and a decision (Save a copy), not a
            // ~4s window: `warning` persists with its own close button.
            setMessage('Recovered draft is based on an older save. Save a copy to keep both.', {
                tone: 'warning',
            });
        } else if (recovery) {
            setMessage('Recovered your unsaved setup');
        } else {
            setMessage('Saved on this device');
        }
        selectSection(next);
        return { current: onDevice, saved: savedBaseline };
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
        track('share_created');
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
     *
     * Since #1441 "re-read" means the HOME slice, awaited — it is small, and the home is what the
     * musician lands on — plus the full library only if a surface has already asked for it, and
     * then in the background, so a Save on a large songbook never waits seconds for a list it is
     * not showing. Nothing reads the list back from here any more: a caller that acts on one song
     * reads that song by id (`readLiveSong`).
     */
    async function refreshSongs(): Promise<void> {
        if (signedIn) {
            // Named with the account the SESSION reports (#1351 patch R6), for the reason
            // `liveStand` reads the session rather than `sync.owner`: this branch is gated on a
            // session fact while the loop reads a storage one, and `attach` runs from a passive
            // effect that can lag `meta.active`. In that window an unnamed read would hand back
            // the account this device still HOLDS — A's library, rendered as B's. Named, the loop
            // refuses it, and the caller's error handling says so instead.
            const owner = sessionOwner;
            if (owner === null) {
                return;
            }
            try {
                setAccountHome({ owner, slice: await accountSync.homeLibrary(owner) });
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
                // So the account home is left exactly as it is (null = still loading), and the
                // `sync.owner`-keyed effects re-read it the moment the attach settles. No banner
                // and no retry loop: this is a read, and something else is already going to do it.
                return;
            }
            if (libraryWanted.current.account) {
                void reloadAccountLibrary(owner);
            }
            return;
        }
        await refreshGuest();
    }
    /**
     * The guest songbook's home slice, and its full library when a surface has asked for it — for
     * the paths that write the GUEST songbook whatever the session says (the v1 import, and the
     * guest songbook becoming live again after a sign-out or an account deletion).
     */
    async function refreshGuest(): Promise<void> {
        setGuestHome(await readGuestHome());
        if (libraryWanted.current.guest) {
            void reloadGuestLibrary();
        }
    }
    /**
     * Ask for a songbook's WHOLE library (#1441) — All songs, a search, the v1 import plan and the
     * account page are the surfaces that need every song. Idempotent; a failed read is retried by
     * the next ask.
     */
    function wantLibrary(which: 'guest' | 'account') {
        const failed = which === 'guest' ? guestLibraryFailure : accountLibraryFailure;
        if (!libraryWanted.current[which] || failed !== null) {
            libraryWanted.current[which] = true;
            setLibraryDemand((demand) => demand + 1);
        }
    }
    function wantLiveLibrary() {
        wantLibrary(signedIn ? 'account' : 'guest');
    }
    /**
     * Open the All songs page with a list that is current (#1441 review P3). A full list read
     * earlier in the page is kept, but another tab may have written since, so opening the page
     * re-reads it. When the home's own `count()` already disagrees with the kept list, the kept
     * one is dropped first and the page shows loading — never "All 21 songs" on the home and then
     * a page of 20. When they agree, the page shows the kept list at once and the re-read
     * replaces it (a rename in another tab changes no count).
     */
    function openAllSongs(collectionId: string | null = null) {
        setAllSongsCollection(collectionId);
        const which = signedIn ? 'account' : 'guest';
        if (liveSongs === null || !libraryWanted.current[which]) {
            wantLibrary(which);
        } else if (liveHome !== null && liveHome.count !== liveSongs.length) {
            if (signedIn) {
                accountSongsOwner.current = null;
                setAccountSongs(null);
                if (sessionOwner !== null) {
                    void reloadAccountLibrary(sessionOwner);
                }
            } else {
                // The guest load effect re-reads a wanted songbook whose list is null.
                setGuestSongs(null);
            }
        } else if (signedIn) {
            if (sessionOwner !== null) {
                void reloadAccountLibrary(sessionOwner);
            }
        } else {
            void reloadGuestLibrary();
        }
        setAllSongsOpen(true);
    }
    /**
     * The guest songbook, all of it, validated — `repository.list()`, which refuses a songbook it
     * cannot wholly read. That refusal is kept as a reason for the surfaces that needed the list
     * (`guestLibraryFailure`), never turned into an empty songbook. Latest read wins.
     */
    async function reloadGuestLibrary() {
        const read = ++guestLibraryRead.current;
        try {
            const documents = await repository.list();
            if (read === guestLibraryRead.current) {
                setGuestSongs(documents);
                setGuestLibraryFailure(null);
            }
        } catch (failure) {
            if (read === guestLibraryRead.current) {
                setGuestSongs(null);
                setGuestLibraryFailure(
                    failure instanceof Error ? failure.message : String(failure),
                );
            }
        }
    }
    /**
     * The account library, all of it (#1266), named with `owner` for #1351 patch R6's reason. A
     * refusal while an attach settles is "not ready yet" and changes nothing; any other failure is
     * said, as the library read always has, and kept for the surfaces that needed the list.
     */
    async function reloadAccountLibrary(owner: string) {
        const read = ++accountLibraryRead.current;
        try {
            const documents = libraryDocuments(await accountSync.listLibrary(owner));
            if (read === accountLibraryRead.current) {
                accountSongsOwner.current = owner;
                setAccountSongs(documents);
                setAccountLibraryFailure(null);
            }
        } catch (failure) {
            if (read !== accountLibraryRead.current || failure instanceof AccountMismatchError) {
                return;
            }
            const reason = failure instanceof Error ? failure.message : String(failure);
            setAccountLibraryFailure(reason);
            setError(reason);
        }
    }
    /**
     * One song from the live songbook, by id (#1441) — what opening, renaming, duplicating or
     * exporting a row reads, instead of the whole library. Null when the songbook no longer holds
     * it; a stored document that does not validate throws its own reason.
     */
    async function readLiveSong(id: string): Promise<ChartDocument | null> {
        if (signedIn) {
            return accountSync.readSong(id, sessionOwner);
        }
        return repository.get(id);
    }
    /**
     * Star or unstar one song — since #1477 a Save of the built-in Starred collection, which the
     * first star creates. Shown at once (`useCollections` applies it before the write lands); a
     * write that fails undoes it and says why on the songbook's own line — at the account's
     * document cap, the same remedy a song Save at the cap is given.
     */
    function toggleStar(id: string) {
        setHomeNoticeState('');
        collections.toggleStar(id, !starred.has(id)).catch((failure: unknown) => {
            setHomeNoticeState(failure instanceof Error ? failure.message : String(failure));
        });
    }
    /**
     * Write a whole iReal playlist into the live songbook (#1478): its songs in ONE transaction,
     * then the collection holding them — the songbook `storeSave` would write a single import to,
     * by the same rule. Signed in, the account's one transaction (`accountSync.importPlaylist`)
     * holds songs AND collection and states the cap again as it writes; a guest's songs and
     * collection live in two databases (`lib/repository.ts`), so they are two transactions, songs
     * first. One re-read of the songbook afterwards, never one per song.
     *
     * Then, from the songbook, the All songs page opens on the collection; from the stand the
     * chart stays where it is and the stand says where the songs went.
     */
    async function importPlaylist(plan: PlaylistImport, onProgress: (text: string) => void) {
        if (currentStore.current?.store === 'account' && !signedIn) {
            // `storeSave`'s own guard: never a silent copy into the guest songbook.
            throw new Error(
                'Your session expired — sign in again to import into your account. Nothing was imported.',
            );
        }
        const write = collectionWrite(plan);
        const pace = framePace();
        onProgress(`Saving ${plan.songs.length.toLocaleString('en-US')} songs on this device…`);
        if (signedIn) {
            if (sessionOwner === null) {
                throw new Error('Your account is still connecting. Nothing was imported.');
            }
            await accountSync.importPlaylist(plan.songs, write, sessionOwner, pace);
            // One pass to start the upload; the outbox drains the rest pass by pass.
            void accountSync.run().catch(() => {});
        } else {
            await repository.importSongs(plan.songs, pace);
            try {
                await repository.editCollection(write.documentId, write.edit);
            } catch (failure) {
                // The guest's songs and collections are two databases, so the songs are already
                // saved. Said plainly, with the way back: a rerun finds them as duplicates and
                // makes the collection from the copies already here — so the songbook the dialog
                // checks duplicates against is re-read and AWAITED before the error re-enables
                // its button (review R8): a quick retry against the old list would import every
                // song a second time.
                // The re-read first, and a failing home refresh cannot skip it or replace the
                // sentence below (review R8 nit).
                await reloadGuestLibrary();
                await refreshSongs().catch(() => {});
                throw new Error(
                    `The songs were imported, but the collection could not be saved: ${failure instanceof Error ? failure.message : String(failure)} Import the playlist again to make it; its songs will be recognized as already in your songbook.`,
                );
            }
        }
        track('chart_imported', { format: 'ireal' });
        await refreshSongs();
        await collections.reload();
        const sentence = `Imported ${plan.songs.length.toLocaleString('en-US')} ${plan.songs.length === 1 ? 'song' : 'songs'} into “${plan.collection.name}”.`;
        if (current) {
            setMessage(`${sentence} Find them under Collections on All songs.`);
            return;
        }
        openAllSongs(write.documentId);
        setHomeNoticeState(sentence);
    }
    /** Add the row menu's song to one of the songbook's collections (#1477). */
    function addRowToCollection(collectionId: string) {
        const target = rowMenuFor;
        if (!target) {
            return;
        }
        closeRowMenu();
        void run(async () => {
            const added = await collections.addSong(collectionId, target.id);
            const name =
                collections.collections?.find((entry) => entry.document.id === collectionId)
                    ?.document.name ?? 'the collection';
            setHomeNoticeState(
                added ? `Added “${target.title}” to “${name}”` : `Already in “${name}”`,
            );
        });
    }
    /** A new collection holding just the row menu's song (#1477's "Add to collection…"). */
    function createCollectionWithRow(name: string) {
        const target = rowMenuFor;
        if (!target) {
            return;
        }
        closeRowMenu();
        void run(async () => {
            await collections.create(name, [target.id]);
            setHomeNoticeState(`Added “${target.title}” to “${name}”`);
        });
    }
    /** New collection / Rename, answered by `CollectionNameDialog` (#1477). */
    function submitCollectionName(name: string) {
        const request = collectionNaming;
        if (!request) {
            return;
        }
        setCollectionNaming(null);
        void run(async () => {
            if (request.kind === 'new') {
                await collections.create(name);
                setHomeNoticeState(`Created “${name}”`);
            } else {
                await collections.rename(request.collectionId, name);
                setHomeNoticeState(`Renamed to “${name}”`);
            }
        });
    }
    /** Open the delete confirm for one user collection, counting what "also delete" would take. */
    function requestDeleteCollection(collectionId: string) {
        const entry = collections.collections?.find((item) => item.document.id === collectionId);
        if (!entry || entry.document.builtIn) {
            return;
        }
        setHomeNoticeState('');
        setCollectionDeleteFailure(null);
        setCollectionDeleteTarget({
            collectionId,
            name: entry.document.name,
            songCount: entry.resolvedSongIds.length,
            onlyHere: songsOnlyIn(collectionId, collections.collections ?? []),
        });
    }
    /**
     * Delete a collection (#1443 decision 3) — and, only when the box was checked, the songs in it
     * that are in no other collection, through the songbook's EXISTING delete paths: the guest
     * repository's own delete, or the account's online cloud delete (`commitCloudDelete`, the
     * tombstone route every account song delete takes). Songs FIRST, the collection LAST, so an
     * interruption — a refused cloud delete, a closed tab — leaves the collection standing with
     * the songs still to delete, never song deletes nobody can see a reason for. For a guest the
     * two halves are two databases, which is exactly why the order matters.
     */
    function deleteCollectionConfirmed(alsoDeleteSongs: boolean) {
        const target = collectionDeleteTarget;
        if (!target) {
            return;
        }
        const owner = sync.owner;
        void run(async () => {
            setCollectionDeleteFailure(null);
            let deletedSongs = 0;
            // Re-decided NOW (#1477 review R4), and only ever NARROWED (C3): a song another
            // collection gained meanwhile is no longer "in no other collection" and stays, while a
            // song that arrived in this collection meanwhile was never shown to the musician, so
            // it is never deleted either — the confirm-time read may only take songs OFF the list
            // the dialog showed.
            let onlyHere: string[] = [];
            if (alsoDeleteSongs) {
                // And the collection's own delete is asked first: one still uploading must stop
                // this before a single song is gone, not after.
                const refusal = await collections.deleteRefusal(target.collectionId);
                if (refusal !== null) {
                    setCollectionDeleteFailure(refusal);
                    return;
                }
                onlyHere = songsOnlyIn(target.collectionId, await collections.fresh()).filter(
                    (songId) => target.onlyHere.includes(songId),
                );
                for (const songId of onlyHere) {
                    if (signedIn) {
                        const done = deletedSongs;
                        const result = await commitCloudDelete(songId, owner, {
                            // Stopped part-way (#1477 review C4): the sentence says how far it
                            // got, and the dialog's counts move to what is actually left.
                            setFailure: (message) =>
                                setCollectionDeleteFailure(
                                    done === 0
                                        ? message
                                        : `${message} ${done} of ${onlyHere.length} songs were deleted; the collection and the rest are kept.`,
                                ),
                            dialogOpen: () => !!collectionDeleteDialogRef.current?.open,
                        });
                        if (result === null) {
                            const gone = new Set(onlyHere.slice(0, done));
                            if (done > 0) {
                                setCollectionDeleteTarget((current) =>
                                    current?.collectionId === target.collectionId
                                        ? {
                                              ...current,
                                              songCount: current.songCount - done,
                                              onlyHere: current.onlyHere.filter(
                                                  (id) => !gone.has(id),
                                              ),
                                          }
                                        : current,
                                );
                            }
                            await refreshSongs();
                            return;
                        }
                    } else {
                        try {
                            await repository.remove(songId);
                        } catch (failure) {
                            // Stopped part-way: the collection is kept (songs first, collection
                            // last), and the songs already gone leave the list now, not later.
                            if (deletedSongs > 0) {
                                await refreshSongs();
                            }
                            throw failure;
                        }
                        forgetOpenedGuest(songId);
                    }
                    deletedSongs += 1;
                }
                setOpenedAtState((previous) => {
                    const updated = new Map(previous);
                    for (const songId of onlyHere) {
                        updated.delete(songId);
                    }
                    return updated;
                });
            }
            let message: string;
            try {
                message = await collections.remove(target.collectionId);
            } catch (failure) {
                setCollectionDeleteFailure(
                    failure instanceof Error ? failure.message : String(failure),
                );
                if (deletedSongs > 0) {
                    await refreshSongs();
                }
                return;
            }
            // Closing the dialog and naming the removal in one render (R5): the page then moves
            // focus to the All songs filter, after the dialog has let go of it.
            setCollectionDeleteTarget(null);
            setDeletedCollectionId(target.collectionId);
            if (deletedSongs > 0) {
                await refreshSongs();
                message = `Collection deleted, with ${deletedSongs === 1 ? '1 song' : `${deletedSongs} songs`} that were in no other collection.`;
            }
            setHomeNoticeState(message);
        });
    }
    /**
     * Records this song as opened just now (#1440) — a per-song preference, alongside the
     * existing single Continue-card pointer `rememberOpened` (below) already writes. Never a
     * document edit: this touches neither `songs`/`operations` nor the guest `documents` store.
     *
     * `owner` is the STAND's resolved owner (`rememberOpened`'s own `stand.ownerId`, already
     * checked against `standBelongsElsewhere`), not a fresh read of `sync.owner` — the two can
     * differ for one render while an account attach is settling, and this must land in the same
     * songbook the chart itself was just bound to, never a guess at the live one.
     */
    function recordOpenedPreference(id: string, owner: string | null) {
        if (owner !== null) {
            accountSync.recordOpened(id, owner).catch(() => {
                /* A preference nobody can store is still a chart just opened. */
            });
        } else {
            recordOpenedGuest(id);
        }
        setOpenedAtState((previous) => {
            const updated = new Map(previous);
            updated.set(id, new Date().toISOString());
            return updated;
        });
    }
    function closeRowMenu() {
        setRowMenuFor(null);
    }
    function openRowMenu(id: string, title: string) {
        // The next row action starting clears whatever the LAST one said (#1440 review P2) — an
        // Export or a Star from this new menu would otherwise leave an unrelated "Renamed to…"
        // sitting on screen indefinitely.
        setHomeNoticeState('');
        setRowMenuFor({ id, title });
    }
    /**
     * Renames a song by id (#1440) — never requires it to be the chart on the stand: row menus
     * render only while `current` is null, so there is no "already open" case here (review #1440
     * P5 — an earlier `isOpen`/`setCurrent` branch tested exactly that unreachable state).
     *
     * A live draft — this writer's or another's, OR this tab's own in-memory `volatileDrafts`
     * fallback (review #1440 P4 — the earlier version consulted only `retainedDraftFor`, missing
     * exactly the case `open()` itself also protects) — must never be silently destroyed by an
     * in-place rename (review #1440 P1): an account Save retires every writer's older drafts, and
     * a guest rename bumps `updatedAt`, which is what stops `recoveryFor` from ever offering that
     * slot again. `retainedDraftFor`'s `unreadable` flag fails CLOSED here too (review #1440 P4):
     * a draft read that FAILED is not evidence there is no draft, so it takes the same "open
     * instead" branch as finding one, rather than gambling on an in-place rename.
     *
     * The song opens instead — through the normal `open()` path, which recovers whichever draft
     * applies exactly as opening always does — and the title the musician just typed into the row
     * menu is carried forward as a fresh edit on top of it (review #1440 P4: discarding it was the
     * earlier version's other gap), focused in the stand's own title field, leaving the Save to
     * the musician. Only a song with nothing at all to lose renames in place.
     */
    function renameRow(title: string) {
        const target = rowMenuFor;
        if (!target) {
            return;
        }
        closeRowMenu();
        const trimmed = title.slice(0, 150);
        void run(async () => {
            const document = await readLiveSong(target.id);
            if (!document) {
                throw new Error('Song no longer exists.');
            }
            const { recovery, unreadable } = await retainedDraftFor(document);
            if (recovery || unreadable || volatileDrafts.current.has(document.id)) {
                const opened = await open(document);
                draft({ ...opened.current, title: trimmed }, opened.saved);
                focusTitleOnReveal.current = true;
                setEditing(true);
                setEditorRequest((n) => n + 1);
                // Re-review P3 — BOTH branches are `warning`: touch has no hover to pause an
                // `info` message's ~4s clock, so a musician who tapped Rename and looked away for
                // a moment would otherwise lose an important "your title is queued, Save to keep
                // it" sentence with no way to have read it in time. `warning`-to-`warning` is
                // always allowed to replace (unlike `info`-over-`warning`, `setMessage`'s own
                // guard above) — load-bearing here, since `open()` just above can itself have set
                // a `warning` ("Recovered draft is based on an older save…") that this must win
                // over, not silently lose to.
                if (unreadable && !recovery) {
                    setMessage(
                        'Couldn’t confirm whether this song has unsaved changes — opened it here instead of renaming in place. Your new title is filled in; Save to keep it.',
                        { tone: 'warning' },
                    );
                } else {
                    setMessage(
                        'This song has unsaved changes — opened it here so renaming won’t lose them. Your new title is filled in; Save to keep it.',
                        { tone: 'warning' },
                    );
                }
                return;
            }
            if (signedIn) {
                await storeSave({ ...document, title: trimmed }, document.revision, {
                    owner: sync.owner,
                    stand: false,
                });
            } else {
                // The guest songbook's own rename (#1440) — reuses `save`'s compare-and-swap
                // rather than a hand-rolled read-then-write here.
                await repository.rename(target.id, trimmed);
            }
            await refreshSongs();
            setHomeNoticeState(`Renamed to “${trimmed}”`);
        });
    }
    /**
     * Duplicates a song by id (#1440) — "<title> copy" under a fresh id, in whichever songbook
     * the original lives in. `owner: null` (never `sync.owner`), like a brand-new song or an
     * import: this mints an id nobody has claimed yet, and `storeSave`'s own note on `intent.owner`
     * is explicit that a fresh id belongs to whichever account is live, not to a stand binding.
     */
    function duplicateRow() {
        const target = rowMenuFor;
        if (!target) {
            return;
        }
        closeRowMenu();
        void run(async () => {
            const document = await readLiveSong(target.id);
            if (!document) {
                throw new Error('Song no longer exists.');
            }
            // `createdAt`/`updatedAt` reset to now, as `keepSharedCopy` does (review #1440 P3):
            // the guest `repository.save` honours a brand-new row's OWN `createdAt` (deliberately,
            // for v1-import provenance), so leaving the original's here would make a fresh copy
            // sort as if it were made back when the original was.
            const now = new Date().toISOString();
            const copyDocument = {
                ...document,
                id: crypto.randomUUID(),
                title: `${document.title.slice(0, 145)} copy`,
                revision: 0,
                createdAt: now,
                updatedAt: now,
            };
            await storeSave(copyDocument, null, { owner: null, stand: false });
            await refreshSongs();
            setHomeNoticeState('Duplicated');
        });
    }
    /**
     * What a row's Export should actually write (#1440 review P3) — the retained draft, if one
     * exists, the same as the stand's own Export always writes whatever is live on the stand
     * rather than silently falling back to the last committed version. The committed document
     * otherwise.
     */
    async function exportableRowDocument(id: string): Promise<ChartDocument | null> {
        const document = await readLiveSong(id);
        if (!document) {
            return null;
        }
        const { recovery } = await retainedDraftFor(document);
        return recovery?.document ?? document;
    }
    function exportRow() {
        const target = rowMenuFor;
        if (!target) {
            return;
        }
        void run(async () => {
            const document = await exportableRowDocument(target.id);
            if (document) {
                exportDocument(document);
            }
        });
    }
    /**
     * Delete… from the row menu (#1440). An account song ALWAYS goes through the existing
     * tombstone route (`accountSync.deleteFromCloud`, the same call `deleteFromAccount` makes) —
     * never a local-only delete. A guest song deletes locally through its own confirm step below.
     *
     * Unlike the stand's own "Song actions → Delete from my account", this must NEVER navigate
     * (review #1440 P2): the musician asked to delete a row, not to visit it, and opening it first
     * — the earlier approach — loaded the chart, wrote the Continue pointer and an opened-at
     * timestamp, and stranded the musician on the stand if they cancelled. `setActiveDocument`/
     * `watch` gets the same `sync.observation` the confirm step needs without any of that; it is
     * released again in `closeRowDeleteConfirm` below.
     *
     * A song the cloud has never acknowledged (`remoteRevision` still null — a queued-but-unsent
     * Save, most commonly) has nothing to delete there yet. The stand's own song menu handles this
     * by simply not rendering its Delete button (`inAccount`'s doc comment); this can't know that
     * before asking, so it asks, then explains rather than opening a dialog with a dead confirm.
     */
    function requestDeleteRow() {
        const target = rowMenuFor;
        if (!target) {
            return;
        }
        closeRowMenu();
        if (signedIn) {
            void run(async () => {
                accountSync.setActiveDocument(target.id);
                await accountSync.watch(target.id);
                if (accountSync.getSnapshot().observation?.remoteRevision == null) {
                    releaseRowDeleteClaim();
                    setHomeNoticeState(
                        'This song hasn’t finished syncing to your account yet — there’s nothing there to delete.',
                    );
                    return;
                }
                setRowDeleteFailure(null);
                setRowDeleteTarget({ id: target.id, title: target.title });
            });
        } else {
            setGuestDeleteTarget({
                id: target.id,
                title: target.title,
                hasRecovery: repository.recoverySlotCount(target.id) > 0,
            });
        }
    }
    function exportGuestDeleteTarget() {
        const target = guestDeleteTarget;
        if (!target) {
            return;
        }
        void run(async () => {
            const document = await exportableRowDocument(target.id);
            if (document) {
                exportDocument(document);
            }
        });
    }
    /**
     * Drops the active claim/watch `requestDeleteRow` set up (#1440 review P2/P3) — never the
     * dialog state, so both the confirm step's own Cancel AND the effect that un-eligibility
     * closes it from can call this without fighting over who clears `rowDeleteTarget`.
     */
    function releaseRowDeleteClaim() {
        accountSync.setActiveDocument(null);
        void accountSync.watch(null);
    }
    /** Cancel — the confirm step's own close, routed through the one release function (#1440 P2). */
    function closeRowDeleteConfirm() {
        setRowDeleteTarget(null);
        releaseRowDeleteClaim();
    }
    function exportRowDeleteTarget() {
        const target = rowDeleteTarget;
        if (!target) {
            return;
        }
        void run(async () => {
            const document = await exportableRowDocument(target.id);
            if (document) {
                exportDocument(document);
            }
        });
    }
    /**
     * The row menu's account delete (#1440 review P2) — the same `commitCloudDelete` commit
     * `deleteFromAccount` shares, reached without ever putting this song on the stand.
     */
    function deleteRowFromAccount() {
        const target = rowDeleteTarget;
        if (!target) {
            return;
        }
        const owner = sync.owner;
        void run(async () => {
            const result = await commitCloudDelete(target.id, owner, {
                setFailure: setRowDeleteFailure,
                dialogOpen: () => !!rowDeleteDialogRef.current?.open,
            });
            if (result === null) {
                return;
            }
            setDeletedRowId(target.id);
            closeRowDeleteConfirm();
            await refreshSongs();
            setHomeNoticeState(result.message);
        });
    }
    /**
     * The guest songbook's own delete (#1440) — local-only, never used for an account song.
     *
     * Never needs to clear the stand: row menus render only while `current` is null, so the
     * target here can never be the open chart (review #1440 P5 — an earlier branch tested that
     * unreachable state). Deleting the Continue song or a song with a live draft both resolve by
     * inertness instead: `lastOpenedSong`'s stale pointer (like the account's own `lastOpenedKey`)
     * is never read as proof a song still exists — `continuedSave`'s `.find` against the freshly
     * re-read `songs` list is, so a pointer left behind after this runs is simply never matched.
     */
    function deleteGuestSong() {
        const target = guestDeleteTarget;
        if (!target) {
            return;
        }
        void run(async () => {
            await repository.remove(target.id);
            forgetOpenedGuest(target.id);
            // Starred and every other collection keep the id (#1474: a song delete never rewrites
            // a collection); it no longer resolves, so it is simply not shown.
            setOpenedAtState((previous) => {
                if (!previous.has(target.id)) {
                    return previous;
                }
                const updated = new Map(previous);
                updated.delete(target.id);
                return updated;
            });
            setDeletedRowId(target.id);
            setGuestDeleteTarget(null);
            await refreshSongs();
            setHomeNoticeState('Deleted');
        });
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
     * The one place `accountSync.deleteFromCloud` is called (#1440 review P3) — shared by the
     * stand's own route (`deleteFromAccount`) and the row menu's (`deleteRowFromAccount`), so the
     * two cannot drift on what a refusal means or on pruning this device's own guest-namespace
     * recovery slot for the id on a genuinely clean delete (an earlier version of the row route
     * dropped that half entirely).
     *
     * The active claim is dropped BEFORE the request goes out — `reconcile`'s preservation rule
     * retains anything "active", so deleting with the song still claimed would retain the very
     * copy the musician just asked to remove — and restored to `documentId` on a failure or
     * refusal, since both callers want the same thing then: a retry, or the confirm step if still
     * open, keeps reading THIS song's own observation rather than whatever the watch fell back to.
     * `setFailure`/`dialogOpen` are the one caller-specific part — which failure state to set, and
     * which dialog's open-ness decides whether `setError` also has to carry the refusal, since a
     * step already dismissed while the request was in flight has nowhere else to show it.
     *
     * Returns `null` on both a refusal and a rethrown exception (`run()`'s own catch turns the
     * exception into the shell's error line, same as before this was extracted) — a caller only
     * has more to do when this resolves to an actual `'deleted'` result.
     */
    async function commitCloudDelete(
        documentId: string,
        owner: string | null,
        options: { setFailure: (message: string) => void; dialogOpen: () => boolean },
    ): Promise<CloudDeleteResult | null> {
        accountSync.setActiveDocument(null);
        let result: CloudDeleteResult;
        try {
            result = await accountSync.deleteFromCloud(documentId, owner);
        } catch (failure) {
            accountSync.setActiveDocument(documentId);
            options.setFailure(failure instanceof Error ? failure.message : String(failure));
            throw failure;
        }
        if (result.kind === 'refused') {
            accountSync.setActiveDocument(documentId);
            options.setFailure(result.message);
            if (!options.dialogOpen()) {
                setError(result.message);
            }
            return null;
        }
        if (!result.retained) {
            // The account copy is gone and this device kept nothing — a retained draft is one of
            // the things that would have made it `retained`, so since #1299 the only thing left to
            // drop is this writer's guest-namespace recovery slot from before it. Otherwise the
            // deleted song reappears as a recovery offer on the next visit.
            try {
                repository.clearOwnRecovery(documentId);
            } catch {
                /* Recovery is a convenience; a stale entry is not worth failing the delete. */
            }
        }
        return result;
    }
    /**
     * Delete the open chart from the cloud (#1270) — the one destructive account operation in the
     * product, and deliberately not a side effect of anything else.
     *
     * The claim is dropped through `setActiveDocument` rather than by unmounting the chart, so a
     * refused delete leaves the musician exactly where they were. It is called explicitly rather
     * than left to the `useAccountLibrary` effect that normally mirrors `current?.id`: effects run
     * after the render that follows a state change, and the loop reads `activeDocumentId` at the
     * moment it commits.
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
            const result = await commitCloudDelete(documentId, owner, {
                setFailure: setDeleteFailure,
                dialogOpen: () => !!deleteDialogRef.current?.open,
            });
            if (result === null) {
                // Nothing was deleted, so nothing about this session changes: the chart keeps its
                // claim and the dialog stays open carrying the reason. Closing it and dropping a
                // toast would leave the musician guessing whether it worked.
                return;
            }
            runtime.stop();
            setDeleteOpen(false);
            setCurrent(null);
            setSaved(null);
            bindStand(null);
            clearBuffers();
            setDeletedRowId(documentId);
            await refreshSongs();
            // The songbook's own line (#1440 review P2), not the stand's `message`: this delete
            // just closed the chart and landed back on the songbook, and `message` has no
            // audience there — see `homeNotice`'s own doc comment.
            setHomeNoticeState(result.message);
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
            setAccountHome(null);
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
        const owner = heldOwner;
        // Every song this account held here, for the guest-slot sweep below. The library the
        // account page asked for (#1441) is normally already read; if not, it is read now, before
        // the local clear removes it — and a read that fails sweeps nothing rather than blocking
        // the deletion, since these slots are belt and braces.
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
    function openSong(id: string) {
        void run(async () => {
            // By id (#1441): opening one song never reads the whole songbook.
            const document = await readLiveSong(id);
            if (!document) {
                throw new Error('Song no longer exists.');
            }
            await open(document);
            // #1440 — this is also the All songs page's own `onOpenSong`, and unlike
            // `openStandard` a real song has no "leaving" gesture of its own here: without this,
            // `goHome` (which never resets either sub-view flag) would land back on the All
            // songs page instead of the library list `standardsOpen`'s reset already keeps true.
            setAllSongsOpen(false);
            track('chart_opened', { source: 'songbook' });
        });
    }
    /**
     * Opens a standards-catalog entry (#1439) the same way a shared `#chart=` link lands: an
     * unsaved draft (`landDraftOnStand`), never written to storage. The catalog is built fresh
     * on every open (`buildStandardDocument`), never cached — so re-opening the same standard
     * twice never shares mutable state with an earlier draft. Save (or "Keep a copy") mints the
     * musician's own copy under a fresh id; the catalog entry itself never changes.
     */
    function openStandard(id: string) {
        void run(async () => {
            const entry = standardFor(id);
            if (!entry) {
                throw new Error('Standard no longer exists.');
            }
            landDraftOnStand(buildStandardDocument(entry), 'Opened a standard · not saved yet');
            setStandardsOpen(false);
            track('chart_opened', { source: 'standard' });
        });
    }
    /**
     * The Continue card's ▶ Play (#1441): opens the song exactly as `openSong` does — recovered
     * draft and all — and starts the band, without revealing the editor. One `run()`, not
     * `openSong` followed by `startPlayback`: `run()` is a mutex, so the second would be dropped,
     * and `startPlayback` reads `current` from a render that has not seen this song yet.
     */
    function playSong(id: string) {
        // FIRST, synchronously, while this is still the tap's own call stack: everything below
        // awaits storage before `runtime.toggle` runs, and mobile Safari only lets an
        // AudioContext start (and the silent unlock element play) inside the gesture. The
        // transport's own Play reaches `initAudio` before its first await; this is how a Play that
        // must open its song first does the same.
        runtime.warmAudio();
        void run(async () => {
            const document = await readLiveSong(id);
            if (!document) {
                throw new Error('Song no longer exists.');
            }
            const opened = await open(document);
            setAllSongsOpen(false);
            track('chart_opened', { source: 'songbook' });
            await runtime.toggle(setSoundProgress);
            setPlaying(runtime.state().playback.isPlaying);
            setSoundsOffline(await soundsAvailableOffline(opened.current.chart));
            setSoundProgress('');
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
            // `template` always has a value (`defaultTemplate` is the last-resort fallback), so
            // a brand-new song belongs to whichever songbook is live right now, not to whatever
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
            track('chart_created');
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
            const base = current ?? library[0] ?? defaultTemplate;
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
            // The guest songbook, home and whole — awaited here, unlike `refreshGuest`'s background
            // read, because the offer's next plan is a diff against exactly what just landed.
            setGuestHome(await readGuestHome());
            await reloadGuestLibrary();
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
            if (landed.length > 0) {
                track('chart_imported', { format: 'v1' });
            }
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
                    ...(v1Plan?.blocked ?? []).map((item) => item.digest),
                ],
                'shown',
            );
        }
        setV1Data(null);
        setV1Result(null);
    }
    /**
     * "Try the bar editor · keep original": saves a measure copy of the text chart on the stand
     * and opens it, leaving the original as it was. Null when the stand holds no text chart.
     * Throws, before anything is created, when the chart cannot be converted or played.
     */
    async function openMeasureCopy() {
        const original = updateChart();
        if (original.schemaVersion !== 1) {
            return null;
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
        return { created, ...(await open(created)) };
    }
    function upgradeEditor() {
        void run(async () => {
            const opened = await openMeasureCopy();
            if (!opened) {
                return;
            }
            revealEditor(arrangementOf(opened.created).sections[0].id);
            setMessage('Editable copy created · your original song is unchanged');
        });
    }
    /**
     * How many times the band plays the form (#1475), from the Edit panel or the chart footer
     * (#1511): one unsaved edit. A text chart has no count, so the footer's pick first makes the
     * same measure copy "Try the bar editor · keep original" makes, then counts the copy.
     */
    function changeChoruses(choruses: number | undefined) {
        if (current?.schemaVersion !== 1) {
            change(() => runtime.setChoruses(choruses), true);
            return;
        }
        void run(async () => {
            const opened = await openMeasureCopy();
            if (!opened) {
                return;
            }
            runtime.setChoruses(choruses);
            // `open()` just bound the copy, so its baseline is passed in: this render's `saved`
            // still describes the original.
            draft(runtime.captureDocument(opened.current), opened.saved);
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
    // #1277 — the band's `.mid` (`runtime.exportMidi`): rendered on the side, so it
    // never touches the live band or audio and is safe mid-playback. It sanitizes the
    // filename itself; pending text is applied first, as `exportSong` does above.
    async function exportMidiFile() {
        if (!current) {
            return;
        }
        const candidate = updateChart();
        await runtime.exportMidi(candidate.title);
    }
    // #1278 — the band's offline WAV render (`runtime.exportAudio`, on a detached
    // state clone). Deliberately NOT routed through `run()`:
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
    // The Continue card (#1441): the live songbook's own "last opened" song, read by id with the
    // home slice, else its most recently opened row. A device with no songs has no card at all —
    // it gets the first-visit layout, where the standards are the page.
    const continuedSave = liveHome?.continued ?? null;
    const featuredSave = continuedSave ?? liveHome?.rows[0] ?? null;
    const featured: FeaturedSummary | null = useMemo(() => {
        if (!featuredSave) {
            return null;
        }
        // `accountDrafts` is what makes the card preview an ACCOUNT chart's unsaved edit (#1299):
        // the guest slot below no longer holds one, and a store read cannot happen in a memo. It
        // only answers for a song this TAB has opened or prefetched, though — on a cold load the
        // map is empty and the card previews the committed copy, which is the honest answer here
        // rather than a claim about a draft nobody has read (#1299 patch review P3).
        const held =
            volatileDrafts.current.get(featuredSave.id) ??
            accountDrafts.current.get(featuredSave.id);
        let resolved: ChartDocument;
        try {
            resolved =
                current?.id === featuredSave.id
                    ? current
                    : held || repository.recoveryFor(featuredSave)?.document || featuredSave;
        } catch {
            resolved = current?.id === featuredSave.id ? current : held || featuredSave;
        }
        let bars: string[] = [];
        try {
            bars = firstBars(resolved, 8);
        } catch {
            // A preview that cannot be read shows no bars; the song still opens and plays.
        }
        return {
            id: resolved.id,
            title: resolved.title,
            genre: genreOf(resolved),
            bpm: resolved.chart.performance.bpm,
            key: arrangementOf(resolved).key,
            isMinor: arrangementOf(resolved).isMinor,
            bars,
        };
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
    /**
     * #1460 — hoisted out of the JSX so `syncFailureNotice` (the stand's own persistent notice,
     * without opening Song actions) reads the exact same facts `<SyncStatus>` renders inside the
     * menu. One object, two consumers, never two derivations that could disagree.
     */
    const syncStatusProps: SyncStatusProps | null =
        accountsOn && current && (signedIn || expiredSession)
            ? {
                  savedRevision: saved ? saved.revision : null,
                  editing: dirty ? 'dirty' : 'clean',
                  lastSave: saveFailed ? 'failed' : 'idle',
                  recovery: !dirty ? 'none' : recoveryHealthy ? 'confirmed' : 'failed',
                  shell: offline.shell,
                  sounds: soundsProgress,
                  // #1311 — outranks every other cloud reading: the loop can only watch this
                  // document id in the account that IS attached, which has never held it, so
                  // without this the chip would read "Not in your account yet" about a song that
                  // is fully saved in somebody else's library.
                  foreign: standMismatch,
                  // #1362 — the same value the stand's banner reads, so the chip and the banner
                  // can never disagree about which candidate (if any) describes this chart.
                  candidateKind: standCandidate?.kind ?? null,
                  sync,
              }
            : null;
    // #1460 — moved from the footer into Song actions's own "Status" section.
    const syncStatus = syncStatusProps && <SyncStatus {...syncStatusProps} />;
    /**
     * #1460 acceptance, review P2 #2 — "a forced sync failure / expired session shows a
     * persistent notice on the stand without opening the menu", but ONLY for a fact nothing else
     * already says: a local Save failure has the top `.error-banner` (`run()`'s catch), and an
     * expired/reauth session has `account-expired-banner` (`heldWithoutSession`) — both excluded
     * inside `syncFailureNotice` itself, so this is retry/offline pass failures and permanent
     * cloud refusals only. `dismissedSyncFailureKey` is the underlying FACT (a failure reason or
     * a refused kind), never the rendered sentence (review P3): a 413 re-worded between
     * `sync.failure`'s pass-level message and `CLOUD_REFUSAL_LABELS`'s per-document one must not
     * reappear just because the words changed.
     */
    const standSyncFailure = syncStatusProps ? syncFailureNotice(syncStatusProps) : null;
    const [dismissedSyncFailureKey, setDismissedSyncFailureKey] = useState<string | null>(null);
    const standSyncFailureVisible =
        standSyncFailure !== null && standSyncFailure.key !== dismissedSyncFailureKey;
    // Review P3 — clears the dismissal the moment the VISIBLE fact moves on from it, not only
    // when it goes null: without this, a fact that goes A → B → A (never passing through null in
    // between — a retry failure whose wording flips back and forth across passes) would find its
    // second "A" still matching the stale dismissal and stay silenced forever.
    useEffect(() => {
        setDismissedSyncFailureKey((prev) =>
            prev !== null && prev !== standSyncFailure?.key ? null : prev,
        );
    }, [standSyncFailure?.key]);
    /**
     * Review P3 — "Updating…" must not flash on every `run()`: the busy toast only shows once
     * `soundProgress` actually has something to say, or `busy` has held for ~300ms without one.
     */
    const [busyToastVisible, setBusyToastVisible] = useState(false);
    useEffect(() => {
        if (!busy) {
            setBusyToastVisible(false);
            return;
        }
        if (soundProgress) {
            setBusyToastVisible(true);
            return;
        }
        const timer = window.setTimeout(() => setBusyToastVisible(true), 300);
        return () => window.clearTimeout(timer);
    }, [busy, soundProgress]);
    /**
     * Review P2 #3 — an armed `?autoplay=1` link's hint is derived from `pendingAutoplay` itself,
     * not captured once into `message` text: the link's own note (below) still auto-dismisses
     * after ~4s like any other `info` message, but "tap anywhere to play" must stay lit for as
     * long as autoplay is actually armed, however long that takes.
     */
    const pendingAutoplayHint = pendingAutoplay ? 'tap anywhere to play' : null;
    // Re-review P3 — `busyToastVisible` flips false via an effect, which runs AFTER the render
    // that already has `busy === false`: without this extra `busy` check, that one render would
    // still read the stale `busyToastVisible === true` and flash "Updating…" the instant a fast
    // action finished, which is exactly the flash `busyToastVisible`'s own debounce exists to
    // prevent on the way IN.
    const showBusy = busy && busyToastVisible;
    /**
     * #1460 — the stand's message toast, replacing the footer's single-slot status line. Busy
     * (debounced above) outranks a `message`; within `message`, `'warning'` persists with its own
     * close button, `'info'` auto-dismisses below. "Band is playing" and the offline label are
     * gone outright, not read here at all (acceptance: they appear nowhere on the stand). Review
     * P2 #1 — this is its OWN element now: a standing sync failure no longer masks it (see the
     * `.stand-stack` markup below).
     */
    const toastTone: 'busy' | 'warning' | 'info' = showBusy
        ? 'busy'
        : messageTone === 'warning' && message
          ? 'warning'
          : 'info';
    const toastText = showBusy
        ? soundProgress || 'Updating…'
        : [message || null, pendingAutoplayHint].filter(Boolean).join(' · ') || null;
    // Auto-dismiss a plain `info` message ~4s after it is actually SHOWN (masked time under the
    // busy spinner doesn't count against it, nor does the toast being hovered/focused — review
    // P2 #3/#5) — never `warning`, which persists until its own close button, and never the old
    // top-of-page banner (unrelated to this toast, `.error-banner` above), which handles errors
    // its own way. `messageToken` re-arms the timer for two identical messages in a row; it is
    // deliberately unread in the body below.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see above.
    useEffect(() => {
        if (toastTone !== 'info' || !message || toastHeld) {
            return;
        }
        const timer = window.setTimeout(() => setMessageState(''), 4000);
        return () => window.clearTimeout(timer);
    }, [message, messageToken, toastTone, toastHeld]);
    // Re-review P3 — WebKit fires no `focusout` when the focused element (the warning's close
    // button) is removed from under it, so `toastHeld` could get stuck `true` forever the moment
    // a warning is dismissed while focused. Resetting it whenever the toast goes empty is the
    // general fix: there is nothing left to "hold" once it has nothing to show.
    useEffect(() => {
        if (!toastText) {
            setToastHeld(false);
        }
    }, [toastText]);

    // The songbook home itself, not the stand or one of its two sub-views (#1441): the top bar's
    // search, Import chart and New song belong to this view only.
    const homeView = ready && !current && !standardsOpen && !allSongsOpen;

    return (
        <div
            className={`app-shell ${current ? 'song-open' : ''} ${focused ? 'performance-focus' : ''}`}
        >
            <header className="site-header" hidden={!!current} data-home={homeView}>
                <button
                    className="brand"
                    disabled={busy}
                    onClick={() => {
                        runtime.stop();
                        setCurrent(null);
                        bindStand(null);
                        setStandardsOpen(false);
                        setAllSongsOpen(false);
                    }}
                >
                    Ensemble
                </button>
                {/* #1441 — ONE search box, across the musician's songs (title and composer) and
                    the standards. Focusing it starts the lazy full-library read, so the songs half
                    of the results is usually ready by the time a word is typed. */}
                {homeView && (
                    <label className="search home-search">
                        <span className="sr">Search your songs and the standards</span>
                        <input
                            type="search"
                            placeholder="Search titles and composers, yours and the standards…"
                            value={search}
                            onFocus={wantLiveLibrary}
                            onChange={(event) => {
                                wantLiveLibrary();
                                setSearch(event.target.value);
                            }}
                        />
                    </label>
                )}
                {homeView && (
                    <div className="header-tools">
                        <button className="btn" disabled={busy} onClick={() => setImporting(true)}>
                            Import chart
                        </button>
                        <button className="btn accent" disabled={busy} onClick={newSong}>
                            ＋ New song
                        </button>
                    </div>
                )}
                <div className="header-right">
                    {accountsOn && (
                        <AccountEntry
                            session={account.session}
                            unprotected={account.recoveryEnrolled === false}
                            busy={account.signingOut}
                            online={account.online}
                            signOutFailure={account.signOutFailure}
                            onSignIn={() => setAccountDialog('signIn')}
                            onFinishProtecting={() => setAccountDialog('recovery')}
                            onOpenAccount={() => {
                                // The account page counts and exports the WHOLE account library
                                // (#1271), so it asks for it the moment it opens (#1441).
                                wantLibrary('account');
                                setAccountPageOpen(true);
                            }}
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
                    // explains the other. `candidate-unsupported` renders no button at all, so it
                    // has no failure to show either (#1362).
                    failure={
                        standBanner === 'candidate'
                            ? adoptRemoteFailure
                            : standBanner === 'candidate-unsupported'
                              ? null
                              : keepBothFailure
                    }
                    onKeepBoth={keepBothVersions}
                    // #1310 — the `candidate` shape's action opens the confirm step rather than
                    // doing anything: this is the one choice here that destroys something. The
                    // offer is FROZEN here (patch R5) from `standVersionCandidate`, never the raw
                    // `standCandidate` (#1362) — this handler is wired to `'candidate'` alone
                    // (`ConflictBanner`'s own routing), but the value it freezes must still never
                    // be a `'deleted'`/`'unsupported'` row reached by some future caller.
                    onUseAccountVersion={() => {
                        setAdoptRemoteFailure(null);
                        setAdoptRemoteOffer(standVersionCandidate);
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
                        track('chart_imported', { format: 'file' });
                        track('chart_opened', { source: 'import' });
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
                        // Both `irealbook`/`irealb` decode the same iReal Pro format; the
                        // telemetry vocabulary tracks the format, not the decoder variant.
                        track('chart_imported', {
                            format:
                                checked.schemaVersion === 2 &&
                                checked.importSource?.format?.startsWith('ireal')
                                    ? 'ireal'
                                    : 'file',
                        });
                        track('chart_opened', { source: 'import' });
                    }}
                    playlist={{
                        library: songbookLoading ? null : liveSongs,
                        collections: collections.collections,
                        onWantLibrary: wantLiveLibrary,
                        accountRoom: signedIn ? accountImportRoom : null,
                        onRefreshLibrary: signedIn
                            ? () => void accountSync.run().catch(() => {})
                            : null,
                        libraryProgress: signedIn
                            ? `${sync.documents.verified}/${sync.documents.required}`
                            : null,
                        onImport: importPlaylist,
                    }}
                />
            )}
            {/*
             * The songbook's own status line (#1440 review P2) — "Renamed to…", "Duplicated",
             * "Deleted", or the row-delete "hasn't finished syncing" explanation — said somewhere
             * that is actually ON SCREEN while browsing the songbook, and never the STAND's own
             * `message` (`open()` sets one on every open, which showed up as a stale leftover
             * status on every later visit to the songbook before this — the review's own finding
             * on the previous fix). Always mounted, with only its text changing, so a screen
             * reader actually announces a row action's outcome (fixes P3 #5 in the same review):
             * an element that pops into existence already containing text is not guaranteed an
             * announcement the way a live region's TEXT CHANGE is.
             */}
            {!current && (
                <div
                    className="status-banner"
                    role="status"
                    data-testid="shell-message"
                    data-empty={!homeNotice}
                >
                    <span>{homeNotice}</span>
                </div>
            )}
            {/*
             * #1478 — the upload a whole-playlist import leaves behind, said on the songbook too:
             * the sync chip lives in Song actions, which needs a chart on the stand, and a 1,350-song
             * import drains over many passes. The count is the loop's (`songsWaiting`), read from
             * storage, and the pass's own reason follows when one is holding it up.
             */}
            {!current && signedIn && sync.songsWaiting > 1 && (
                <p className="upload-progress" role="status" data-testid="songs-uploading">
                    {`Songs · ${sync.songsWaiting.toLocaleString('en-US')} waiting to upload to your account`}
                    {sync.failure ? ` · ${sync.failure.message}` : ''}
                </p>
            )}
            {!ready ? (
                <main className="loading">
                    <h1>Getting the band together.</h1>
                    <p>Loading your local songbook and musical engine.</p>
                </main>
            ) : !current && standardsOpen ? (
                <StandardsBrowser
                    initialShelf={standardsEntry === 'all' ? null : standardsEntry}
                    onBack={() => setStandardsOpen(false)}
                    onOpen={openStandard}
                />
            ) : !current && allSongsOpen ? (
                <AllSongs
                    // The full library, read lazily (#1441) — `null` until it lands, which the page
                    // shows as loading, never as a songbook with no songs.
                    songs={songbookLoading ? null : liveSongs}
                    failure={liveLibraryFailure}
                    accountLibrary={signedIn}
                    starred={starred}
                    openedAt={openedAt}
                    remoteCandidates={remoteCandidateRows}
                    busy={busy}
                    initialSort={allSongsSortPreference()}
                    onSortChange={rememberAllSongsSort}
                    initialCollectionId={allSongsCollection}
                    onBack={() => setAllSongsOpen(false)}
                    onOpenSong={openSong}
                    onToggleStar={toggleStar}
                    onOpenRowMenu={openRowMenu}
                    lastRemovedId={deletedRowId}
                    collections={collections.collections}
                    onNewCollection={() => setCollectionNaming({ kind: 'new' })}
                    onRenameCollection={(collectionId, name) =>
                        setCollectionNaming({ kind: 'rename', collectionId, name })
                    }
                    onDeleteCollection={requestDeleteCollection}
                    removedCollectionId={deletedCollectionId}
                />
            ) : !current ? (
                <Songbook
                    // What the home shows and nothing more (#1441): the home slice, never the whole
                    // library — `library` is only for search, and only once it has been asked for.
                    home={songbookLoading ? null : liveHome}
                    // Gated like `home`: until the session settles this may be the WRONG songbook's
                    // list (a guest list standing in for an account one), so search says it is
                    // still looking rather than listing guest songs as "Your songs".
                    library={songbookLoading ? null : liveSongs}
                    libraryFailure={liveLibraryFailure}
                    featured={songbookLoading ? null : featured}
                    openedAt={openedAt}
                    onPlaySong={playSong}
                    onOpenStandard={openStandard}
                    onBrowseStandards={(entry) => {
                        setStandardsEntry(entry);
                        setStandardsOpen(true);
                    }}
                    standardsEntry={standardsEntry}
                    standardsEntryRef={standardsEntryRef}
                    starred={starred}
                    onToggleStar={toggleStar}
                    onOpenRowMenu={openRowMenu}
                    onOpenAllSongs={() => {
                        openAllSongs();
                    }}
                    allSongsEntryRef={allSongsEntryRef}
                    continued={continuedSave !== null}
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
                    // #1310, widened #1362 — only the account library can have one waiting; signed
                    // out the loop publishes none at all, so this is the same empty list either way.
                    remoteCandidates={remoteCandidateRows}
                    search={search}
                    onImport={() => setImporting(true)}
                    onNewSong={newSong}
                    onOpenSong={openSong}
                    lastRemovedId={deletedRowId}
                    v1Import={
                        // An offer the app opened by itself is for the GUEST songbook and is
                        // not shown over an account library (patch R2); one the musician
                        // asked for from the song menu always is, and says where the songs
                        // land through `accountPointer` below.
                        // The plan is a diff against the whole guest songbook, read lazily
                        // (#1441): the offer waits for it rather than guessing, while a finished
                        // run's result needs no plan to be said.
                        v1Data &&
                        (v1Data.asked || !signedIn) &&
                        (v1Plan || v1PlanFailure !== null || v1Result !== null)
                            ? {
                                  // What Import would actually do, not what v1 holds (patch
                                  // R12/N2): the menu path offers everything, ledger
                                  // included, so most of an offer is routinely already here.
                                  songs: v1Plan?.fresh ?? 0,
                                  alreadyHere: v1Plan?.alreadyHere ?? 0,
                                  // v1 data that could not be read, plus anything the run
                                  // would refuse — said before the button, not only after.
                                  problems: [
                                      ...v1Data.offer.problems.map((problem) => ({
                                          label: problem.label,
                                          reason: problem.reason,
                                      })),
                                      ...(v1Plan?.blocked ?? []),
                                  ],
                                  result: v1Result,
                                  unavailable: v1Plan ? null : v1PlanFailure,
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
                    v1Present={v1Present}
                    v1PlanSettled={
                        v1Looked &&
                        (!v1Data || v1Plan !== null || v1PlanFailure !== null || v1Result !== null)
                    }
                    onOpenV1Import={openV1Import}
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
                        countInBeat={countInBeat}
                        onPlayToggle={() => {
                            if (runtime.state().playback.isPlaying || playbackPending) {
                                runtime.stop();
                                setPlaying(false);
                                setPlaybackPending(false);
                                return;
                            }
                            startPlayback();
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
                            change(async () => {
                                // Tracked HERE, not inside `runtime.setGenre` (#1389): this is
                                // the transport bar's real call site, so it only fires on an
                                // actual musician gesture. `lib/starters.ts`'s one-time sample
                                // seeding used to call `setGenre` directly too (retired by
                                // #1439's standards catalog, which never calls it at all), which
                                // is why this stayed a separate call site rather than moving
                                // inside `setGenre` itself.
                                await runtime.setGenre(genre, setSoundProgress);
                                track('genre_changed', { genre });
                            }, true)
                        }
                        onToggleLane={(key) =>
                            change(() => runtime.setEnabled(key, !current.chart.band[key].enabled))
                        }
                        onTrade={() => setTradeMenu(true)}
                        tradeBlocked={runtime.tradeBlocked()}
                    />
                    <TradeSheet
                        dialogRef={tradeDialog}
                        current={current}
                        busy={busy}
                        partners={runtime.tradePartners()}
                        blocked={runtime.tradeBlocked()}
                        onClose={() => setTradeMenu(false)}
                        onChange={(tradeWith, bars, choruses) =>
                            change(() => runtime.setTrade(tradeWith, bars, choruses))
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
                        onBandIntensity={(value) =>
                            change(() => {
                                runtime.setBandIntensity(value);
                                setFeel((f) => ({ ...f, bandIntensity: value }));
                            })
                        }
                        onAutoIntensity={(auto) => change(() => runtime.setAutoIntensity(auto))}
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
                        onCountIn={(enabled) =>
                            change(() => {
                                runtime.setCountIn(enabled);
                                setFeel((f) => ({ ...f, countIn: enabled }));
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
                                displayNext={displayNext}
                                nextSoon={nextSoon}
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
                                onStartHere={startHereSection}
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
                                onChoruses={changeChoruses}
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
                            onChoruses={changeChoruses}
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
                    {/*
                     * #1460 — one fixed, bottom-centred stack (review P2 #1/#4): the message
                     * toast, the sync-failure notice and the Resume-follow pill each get their
                     * own element in normal flex-column flow, so none can ever overlap or mask
                     * another (the old single-slot toast let a standing sync failure hide every
                     * later "Link copied"/"Saved" message; the pill and the toast could overlap
                     * by a few px at some viewport sizes). Order top-to-bottom: message, failure,
                     * pill — the pill stays the reachable-most control.
                     */}
                    <div className="stand-stack" ref={standStackRef}>
                        {/*
                         * The footer's single status line is now this toast: no longer able to
                         * say "Band is playing" or the offline label at all. Always mounted with
                         * an empty state (`data-empty`), same reasoning as `homeNotice`'s status
                         * line (#1440): a freshly-inserted region is not reliably announced, but
                         * a live region's TEXT CHANGE is.
                         */}
                        <div
                            className="stand-toast"
                            role="status"
                            data-testid="stand-toast"
                            data-tone={toastTone}
                            data-empty={!toastText}
                            onMouseEnter={() => setToastHeld(true)}
                            onMouseLeave={() => setToastHeld(false)}
                            onFocus={() => setToastHeld(true)}
                            onBlur={() => setToastHeld(false)}
                        >
                            {/*
                             * Review re-review P2 #2 — a REPEAT of the exact same sentence (two
                             * Saves in a row) is otherwise invisible to assistive tech: React
                             * bails out of re-rendering a text node whose value hasn't changed, so
                             * nothing in the live region actually mutates. The previous fix (a
                             * hidden counter beside the text) didn't work either: the region isn't
                             * `aria-atomic`, so a mutation on a SIBLING node doesn't re-announce
                             * this one, and `aria-hidden` on the counter still let some
                             * screen readers read its bare number aloud. Keying the text node
                             * itself on `messageToken` is what actually fixes it: React UNMOUNTS
                             * and remounts the span on every `setMessage` call (even for identical
                             * text), which is a real node replacement inside the live region —
                             * genuinely announced, nothing extra ever read.
                             */}
                            <span key={messageToken}>{toastText}</span>
                            {toastTone === 'warning' && (
                                <button
                                    className="toast-close"
                                    aria-label="Dismiss"
                                    onClick={dismissMessage}
                                >
                                    ×
                                </button>
                            )}
                        </div>
                        {/*
                         * Review P2 #1 — hidden while Song actions is open: it renders the SAME
                         * fact in its own "Status" section (`sync-failure`), and both are
                         * `role="status"` live regions, so leaving this one mounted too would
                         * announce the one change twice.
                         */}
                        {standSyncFailureVisible && standSyncFailure && !menu && (
                            <div
                                className="stand-sync-failure"
                                role="status"
                                data-testid="stand-sync-failure"
                            >
                                <span>{standSyncFailure.text}</span>
                                <button
                                    className="toast-close"
                                    aria-label="Dismiss"
                                    onClick={() => setDismissedSyncFailureKey(standSyncFailure.key)}
                                >
                                    ×
                                </button>
                            </div>
                        )}
                        {/*
                         * The footer's toggle ("Following"/"Resume follow", either direction) is
                         * gone. Wheel/touch/scroll-key already turn Following off (`chart-scroll`'s
                         * own handlers above); the only control left is the way back, and only
                         * while there is something to resume TO. `setFollowing(true)` alone is
                         * enough to "re-apply the row scroll immediately" (acceptance): the effect
                         * above that resets `followRowTop`/`followJumpedFor` the instant
                         * `following` turns true runs before the look-ahead scroll effect that
                         * reads them, in the same pass. Focus moves to the chart itself on
                         * activation (review P3) since this button unmounts the instant it fires
                         * — `preventScroll` because the look-ahead scroll above is already doing
                         * the ONE deliberate scroll this tap causes, and `.chart-scroll`'s own
                         * `:focus-visible`-only outline (not plain `:focus`) is what keeps a
                         * pointer tap from drawing a visible ring around the whole chart.
                         */}
                        {playbackActive && !following && (
                            <button
                                className="resume-follow-pill"
                                data-testid="resume-follow"
                                onClick={() => {
                                    setFollowing(true);
                                    scroll.current?.focus({ preventScroll: true });
                                }}
                            >
                                <span aria-hidden="true">↓</span> Resume follow
                            </button>
                        )}
                    </div>
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
                syncStatus={syncStatus}
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
                    // The full list's length once read, else the store's own `count()` from the
                    // home slice (#1441) — both are whole-library facts, neither a partial read.
                    accountSongCount={
                        accountSongs?.length ??
                        (accountHome !== null && accountHome.owner === sessionOwner
                            ? accountHome.slice.count
                            : null)
                    }
                    onExportAccountSongs={() =>
                        void run(async () => {
                            // EVERY song, unlike the sign-out step's at-risk subset (#1271): the
                            // cloud copy is about to stop existing, so "it comes back on the next
                            // sign-in" is no longer true of any of them.
                            // Read here if the account page's own ask (#1441) has not landed
                            // yet — never an empty export standing in for an unread library.
                            const library =
                                accountSongs ??
                                libraryDocuments(await accountSync.listLibrary(sessionOwner));
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
            {standVersionCandidate !== null && current && (
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
            <SongRowMenu
                dialogRef={rowMenuDialogRef}
                song={rowMenuFor}
                starred={!!rowMenuFor && starred.has(rowMenuFor.id)}
                busy={busy}
                onClose={closeRowMenu}
                onToggleStar={() => rowMenuFor && toggleStar(rowMenuFor.id)}
                onRename={renameRow}
                onDuplicate={duplicateRow}
                onExport={exportRow}
                onDelete={requestDeleteRow}
                collections={
                    collections.collections === null
                        ? null
                        : collections.collections
                              .filter((entry) => !entry.document.builtIn)
                              .map((entry) => ({
                                  id: entry.document.id,
                                  name: entry.document.name,
                                  contains:
                                      !!rowMenuFor &&
                                      entry.document.songIds.includes(rowMenuFor.id),
                              }))
                }
                onAddToCollection={addRowToCollection}
                onCreateCollection={createCollectionWithRow}
            />
            <CollectionNameDialog
                dialogRef={collectionNameDialogRef}
                request={collectionNaming}
                busy={busy}
                onSubmit={submitCollectionName}
                onClose={() => setCollectionNaming(null)}
            />
            <DeleteCollectionDialog
                dialogRef={collectionDeleteDialogRef}
                target={collectionDeleteTarget}
                accountLibrary={signedIn}
                online={account.online}
                busy={busy}
                failure={collectionDeleteFailure}
                onConfirm={deleteCollectionConfirmed}
                onClose={() => setCollectionDeleteTarget(null)}
            />
            {guestDeleteTarget && (
                <DeleteGuestSongDialog
                    dialogRef={guestDeleteDialogRef}
                    title={guestDeleteTarget.title}
                    busy={busy}
                    hasRecovery={guestDeleteTarget.hasRecovery}
                    onExport={exportGuestDeleteTarget}
                    onConfirm={deleteGuestSong}
                    onClose={() => setGuestDeleteTarget(null)}
                />
            )}
            {rowDeleteTarget && rowInAccount && (
                <DeleteSongDialog
                    dialogRef={rowDeleteDialogRef}
                    title={rowDeleteTarget.title}
                    online={account.online}
                    busy={busy}
                    unsavedEdits={false}
                    pendingCount={sync.observation?.pendingCount ?? 0}
                    failure={rowDeleteFailure}
                    onExport={exportRowDeleteTarget}
                    onConfirm={deleteRowFromAccount}
                    onClose={closeRowDeleteConfirm}
                />
            )}
        </div>
    );
}
