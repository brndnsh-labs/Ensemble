'use client';

import { decodeChartLink, encodeChartLink, RETIRED_CHART_LINK } from '@core/songbook/chart-link';
import { writtenChart } from '@core/songbook/codec';
import type { SemanticScore } from '@core/songbook/score-types';
import type { InstrumentVoice } from '@core/types';
import { keyDistance } from '@core/utils';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
    computeAdoptCandidates,
    hasDecidedAdoption,
    libraryDownloaded,
    pendingGuestCollections,
} from '../lib/account/adopt-guest';
import { heldAccountBanner } from '../lib/account/messages';
import {
    AccountMismatchError,
    accountSync,
    belongsToAnotherAccount,
    OWNER_MESSAGES,
} from '../lib/account/sync-loop';
import { songsOnlyIn } from '../lib/collections';
import {
    blankSong,
    genreOf,
    libraryDocuments,
    OLD_FORMAT_REFUSAL,
    type SectionChange,
} from '../lib/documents';
import { exportDocument } from '../lib/download';
import { checkPlayable } from '../lib/engine-mode';
import { firstBars } from '../lib/first-bars';
import type { HomeSlice } from '../lib/home';
import { type NavEntry, type NavView, navKey } from '../lib/navigation';
import { collectionWrite, framePace, type PlaylistImport } from '../lib/playlist-import';
import * as repository from '../lib/repository';
import type { ChartDocument } from '../lib/runtime';
import * as runtime from '../lib/runtime';
import {
    allSongsSortPreference,
    forgetOpened as forgetOpenedGuest,
    openedAtMap as guestOpenedAtMap,
    recordOpened as recordOpenedGuest,
    rememberAllSongsSort,
    rememberSong,
    rememberStandMode,
    type StandMode,
    standMode,
} from '../lib/session';
import { allSoundsAvailableOffline, installAllSounds, soundsAvailableOffline } from '../lib/sounds';
import { buildStandardDocument, standardFor } from '../lib/standards';
import { readGuestHome, start } from '../lib/starters';
import type { Progress } from '../lib/sync/status';
import { initializeTelemetry, track } from '../lib/telemetry';
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
import { PurgeSongsDialog, RemoveUnreadableDialog } from './account/purge-songs';
import { type AccountDialogMode, SignInDialog } from './account/sign-in';
import { SignOutDialog } from './account/sign-out';
import { useAccountSession } from './account/use-account-session';
import { AllSongs } from './all-songs';
import { type FeelSnapshot, GrooveTab, PracticeTab } from './band-groove';
import type { Lane } from './band-lanes';
import { PlayersTab } from './band-players';
import { BandSheet, type BandTab } from './band-sheet';
import { TradeTab } from './band-trade';
import { ChartSheet, type OpenBar } from './chart-sheet';
import {
    type CollectionDeleteTarget,
    CollectionNameDialog,
    type CollectionNameRequest,
    DeleteCollectionDialog,
} from './collection-dialogs';
import { DeleteGuestSongDialog } from './delete-guest-song';
import { ExportDialog, type ExportFormat } from './export-dialog';
import { FormStrip } from './form-strip';
import { GuidedForm } from './guided-form';
import { downloadImportSource, ImportDialog } from './import-dialog';
import { SettingsSheet } from './settings-sheet';
import { SongHeader } from './song-header';
import { SongMenu, type SongMenuView } from './song-menu';
import { SongRowMenu, type SongRowMenuTarget } from './song-row-menu';
import { type FeaturedSummary, Songbook, type StandardsEntry } from './songbook';
import { StandardsBrowser } from './standards-browser';
import { TransportBar } from './transport-bar';
import { useAccountExit } from './use-account-exit';
import {
    BarDraftError,
    barField,
    barFields,
    commitBarDrafts,
    useBarDrafts,
} from './use-bar-drafts';
import { useBarEditing } from './use-bar-editing';
import { useChartFit } from './use-chart-fit';
import { useChartView } from './use-chart-view';
import { useCollections } from './use-collections';
import { useDeleteUndo } from './use-delete-undo';
import { useFollowScroll } from './use-follow-scroll';
import { useHistoryNavigation } from './use-history-navigation';
import { useModalDialog } from './use-modal-dialog';
import { useNeckPrefs } from './use-neck-prefs';
import { useOfflineInstall } from './use-offline-install';
import { usePalette } from './use-palette';
import { useSongDeletes } from './use-song-deletes';
import { useStageTheme } from './use-stage-theme';
import { useStandConflict } from './use-stand-conflict';
import { useStandToast } from './use-stand-toast';

// The neck and its voicer load only when the neck first shows (#1877).
const NeckStand = lazy(() => import('./neck-stand'));

/**
 * Deep equality over plain JSON data that ignores the order of object keys: a chart read back
 * from storage can list its keys in another order than the one the stand built (#1706).
 */
function sameData(a: unknown, b: unknown): boolean {
    if (a === b) {
        return true;
    }
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
        return false;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        return (
            Array.isArray(a) &&
            Array.isArray(b) &&
            a.length === b.length &&
            a.every((item, index) => sameData(item, b[index]))
        );
    }
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    // An `undefined` field is absent, as it would be once stored.
    const keys = (value: Record<string, unknown>) =>
        Object.keys(value).filter((key) => value[key] !== undefined);
    const leftKeys = keys(left);
    return (
        leftKeys.length === keys(right).length &&
        leftKeys.every((key) => sameData(left[key], right[key]))
    );
}

/**
 * How long a pause in presses and keys a new song's first change waits for before it is kept
 * (#1707, #1726): longer than a press takes from its way down (which can leave a bar on the
 * chart) to its click.
 */
const NEW_SONG_KEEP_DELAY_MS = 500;

/**
 * Whether `next` is `after` as a new song's first-change keep left it (#1707): the same chart,
 * only stored — a new revision and `updatedAt`, nothing the musician changed.
 */
function keptAs(after: ChartDocument, next: ChartDocument): boolean {
    return (
        next.id === after.id &&
        sameData({ ...after, revision: 0, updatedAt: '' }, { ...next, revision: 0, updatedAt: '' })
    );
}

/**
 * Compared as written today (`writtenChart`), not as stored: a chart stored without a field the
 * app now always writes (energy) must not read as edited once captured — which would otherwise
 * hold an account draft against every later remote advance.
 */
const same = (a: ChartDocument, b: ChartDocument) =>
    a.title === b.title && sameData(writtenChart(a.chart), writtenChart(b.chart));

/**
 * `same` with the practice settings left out — tempo, energy, style and the band's mix (the
 * chart's `performance` and `band`). Two documents that differ only there differ in how the
 * song is practised, not in what is written (#1706). A key change is a chart change: transposing
 * rewrites the chord symbols.
 */
const sameMusic = (a: ChartDocument, b: ChartDocument) =>
    a.title === b.title &&
    sameData(
        { ...writtenChart(a.chart), performance: null, band: null },
        { ...writtenChart(b.chart), performance: null, band: null },
    );

/**
 * Which songbook the chart on the stand came from — and, for an account chart, WHOSE account
 * (#1311).
 *
 * The owner is part of the answer rather than a second ref beside it, because the two are one
 * fact and a pair of them is a pair that can disagree. #1299 carried the owner separately for the
 * draft path only, which left the Save path binding a chart to a STORE and not to a library: expire
 * as A, answer "Sign in again" with B's passkey, and `storeSave` still read `'account'` and filed
 * A's chart — or, on Duplicate, a fresh create of A's music — inside B's account.
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
 * Which account this device HOLDS, from storage (#1351 patch R1) — `meta.active`, through the
 * loop rather than by reaching into the repository.
 *
 * Module-level so both readers share one expression: the shell's effect that watches the
 * transitions which can change it, and `useAccountExit`'s clears (handed it as a prop), which
 * have just changed it.
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
        songMinutes: runtime.songMode(),
    };
}

export default function Ensemble() {
    // Two songbooks, never merged and never switched between by a control (#1266, rollout
    // decision 9 S3): the guest library is what a signed-out device plays from, the account
    // library is what a signed-in one plays from, and signing in copies nothing either way.
    //
    // Each songbook is read two ways (#1441). The HOME slice is what the songbook home shows —
    // the Continue song, the recently opened ones by id and a count — and it is all the home page
    // ever reads, so a 2,000-song library opens as fast as a 20-song one. The FULL library is read
    // lazily, the first time a surface needs every song (All songs, search,
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
    // The song rows that read could not hand back (a text chart, #1740), counted with it: read
    // only beside `accountSongs`, so a stale count is never shown without the list it goes with.
    const [accountUnreadable, setAccountUnreadable] = useState(0);
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
    // The latest render's chart and saved version, for a task that waited on a background one
    // (`run`) or outlived the render it began in (the new-song keep): typing goes on meanwhile.
    const currentNow = useRef(current);
    currentNow.current = current;
    const savedNow = useRef(saved);
    savedNow.current = saved;
    /**
     * Which songbook the chart on the stand came from — and whose account it is — or null when
     * nothing is open (#1266, owner-bound since #1311).
     *
     * A session can expire without any user gesture — `createSaveTransport`/`createLibraryTransport`
     * call `session.markExpired()` on any 401 — and `signedIn` flips to false underneath a chart
     * that is still the account's. Without this, `storeSave` would silently re-route to the guest
     * repository: plain Save reports a nonsense conflict, and Duplicate (which passes
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
    // A task the shell runs by itself (a new song's keep, #1707), in flight: `run`'s background
    // path. It disables nothing; an action the musician starts meanwhile waits for it.
    const background = useRef<Promise<boolean> | null>(null);
    // The actions pressed while it ran, in order: each waits for the one before (`run`). Resolves
    // true when what it waited behind was refused.
    const waiting = useRef<Promise<boolean> | null>(null);
    const [error, setError] = useState('');
    // An audition/share link's `?autoplay=1` (#1382): browsers block audio before a gesture,
    // so this arms one instead of playing immediately — the shared-link effect sets it, and
    // the gesture effect below clears it on the first pointer or key event anywhere on the page.
    const [pendingAutoplay, setPendingAutoplay] = useState(false);
    const [editing, setEditing] = useState(false);
    // The stand's remembered mode (#1587): Neck instead of Chart. Editing never touches it — the
    // editor overlays whichever mode it is, and leaving the editor by any path lands back on it.
    // The neck shows on `neck && !editing`.
    const [neck, setNeck] = useState(false);
    const [measureId, setMeasureId] = useState('');
    const [pendingMeasures, setPendingMeasures] = useState(false);
    const pendingText = useRef(false);
    // The bars typed but not yet applied (#1723), one draft per bar, shared by the chart's
    // in-bar field (or the phone's dock) and the bar menu.
    const barDrafts = useBarDrafts(current?.id ?? '', (pending) => {
        pendingText.current = pending;
        setPendingMeasures(pending);
    });
    // The bar whose field is open on the chart (#1723), or null.
    const [openBar, setOpenBar] = useState<OpenBar | null>(null);
    // The bar menu's "Repeat or ending…" (#1725): the Repeats and endings dialog over the chart,
    // reviewing every pending bar, on the bar it was opened from. `blocked`: the pending bars'
    // repeat markers make no form yet, so the dialog opens on the bar's own markers (#1758).
    const [barForm, setBarForm] = useState<{
        score: SemanticScore;
        measureId: string;
        blocked?: string;
    } | null>(null);
    // The selected bar as of now, for a delete that waited its turn (`run`).
    const measureIdNow = useRef(measureId);
    measureIdNow.current = measureId;
    // #1440 — bumped to focus the title field (in the header since #1726) once the editor is up:
    // a row-menu Rename opening the song to recover a live draft (review P1).
    const [titleRequest, setTitleRequest] = useState(0);
    const focusedTitleRequest = useRef(0);
    const [search, setSearch] = useState('');
    const [playing, setPlaying] = useState(false);
    const [playbackPending, setPlaybackPending] = useState(false);
    const [active, setActive] = useState<number | null>(null);
    // The count-in beat sounding now (0-based), or null when not counting in (#1422) — cheap
    // enough to ride the same 60ms poll `playing`/`active` already use, no new interval.
    const [countInBeat, setCountInBeat] = useState<number | null>(null);
    // #1458 — is playback in the ACTIVE bar's last FELT pulse right now? Strengthens the next-bar
    // cue and gates the Following look-ahead's jump-ahead scroll. Edge-triggered off the same
    // 60ms poll below (`runtime.inLastBeat()`, a pure engine read off the song tick the active slot
    // is read from, #1506 — never the chart's own `active` state, which the poll that publishes
    // it can still be a tick behind) rather than a new interval — it only flips twice a bar,
    // nowhere near "per frame".
    const [nextSoon, setNextSoon] = useState(false);
    // #1590 — the neck's own cue: the last felt pulse before the ACTIVE SLOT ends, which in a
    // two-chord bar is mid-bar, where `nextSoon` (the barline's) never fires. Same poll, same
    // tick; it flips twice a chord.
    const [changeSoon, setChangeSoon] = useState(false);
    const { theme, stage, chooseTheme, toggleTheme } = useStageTheme();
    const { palette, choosePalette } = usePalette();
    // Settings (#1783): per-device preferences, on the songbook and on a chart.
    const [settingsOpen, setSettingsOpen] = useState(false);
    const settingsDialog = useModalDialog(settingsOpen);
    const [following, setFollowing] = useState(true);
    // The Song menu (•••, #1756): which of its lists or small dialogs is showing, else null.
    const [songMenu, setSongMenu] = useState<SongMenuView | null>(null);
    const songMenuTrigger = useRef<HTMLButtonElement>(null);
    // Export… (#1756), its own dialog off the Song menu.
    const [exportOpen, setExportOpen] = useState(false);
    // The transport's Key popover (#1757): the song's key, mode, meter and chord notation.
    const [keyOpen, setKeyOpen] = useState(false);
    // It is about the song on the stand: another song (or none) closes it.
    const standId = current?.id;
    // biome-ignore lint/correctness/useExhaustiveDependencies: the stand's song changing is the trigger.
    useEffect(() => {
        setKeyOpen(false);
    }, [standId]);
    const exportDialogRef = useModalDialog(exportOpen);
    const standKeys = useRef<((event: KeyboardEvent) => void) | null>(null);
    const [importing, setImporting] = useState(false);
    const [soundProgress, setSoundProgress] = useState('');
    const [soundsOffline, setSoundsOffline] = useState<boolean | null>(null);
    const [allSoundsOffline, setAllSoundsOffline] = useState<boolean | null>(null);
    // The Band sheet (#1703): closed, or open on one of its tabs. `lastBandTab` is where the
    // transport's Band button reopens it — the tab the musician was last on.
    const [bandTab, setBandTab] = useState<BandTab | null>(null);
    const lastBandTab = useRef<BandTab>('players');
    const bandOpen = bandTab !== null;
    // `metronome`/`masterVolume` are not part of `current.chart` (`STATE_OWNERSHIP_MANIFEST`:
    // session-only or a device preference, never a document field) — this is the shell's own
    // reactive mirror of the live engine values the Feel sheet reads, refreshed whenever it
    // opens. (Energy is the chart's own, `performance.energy`; `bandIntensity` rides along only
    // for the slider's resting position while it is on auto.)
    const [feel, setFeel] = useState<FeelSnapshot>(() => feelSnapshot());
    const [showControls, setShowControls] = useState(false);
    const [pendingSound, setPendingSound] = useState<{ lane: string; value: string } | null>(null);
    // #1278 — a distinct busy flag from `busy` (which `run()` sets for every
    // action) so the audio-export Cancel button in `ExportDialog` stays clickable
    // for the whole render, not just disabled the instant the export starts.
    const [exportingAudio, setExportingAudio] = useState(false);
    const [exportAudioProgress, setExportAudioProgress] = useState('');
    const [recoveryOptions, setRecoveryOptions] = useState<
        Array<{ document: ChartDocument; capturedAt: string }>
    >([]);
    // A chart opened from a `#chart=` share link: unsaved by definition (no `saved`
    // baseline), until "Keep a copy" commits it as a normal library document. A ref AND a state
    // mirror, written only by `markSharedDraft`, for `currentStore`'s reason (#1512): `draft()`
    // runs in the same tick as an `open()` that has just cleared the flag, and must read it as it
    // is NOW, not as the render that made the closure saw it.
    const sharedDraftNow = useRef(false);
    const [sharedDraft, setSharedDraft] = useState(false);
    // A draft that is a brand-new song (#1707), not a stranger's chart: nothing is written until
    // the musician changes it, and then it is kept by itself (`keepNewSong`) — a New song backed
    // straight out of leaves no "Untitled song" behind. Written with `sharedDraftNow`, by
    // `markSharedDraft`, for the same same-tick reason.
    const newSongNow = useRef(false);
    const [newSongDraft, setNewSongDraft] = useState(false);
    // Whether the unsaved draft on the stand came from the standards catalog rather than a shared
    // link (#1700) — the header said "Opened from a shared link" for a standard.
    const [standardDraft, setStandardDraft] = useState(false);
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
    // The shared or standard draft as it landed, so Back can tell an edited one from a glance.
    const draftBaseline = useRef<ChartDocument | null>(null);
    /** Which standard the draft on the stand was built from, so its entry can rebuild it. */
    const standardOnStand = useRef<{ documentId: string; standardId: string } | null>(null);
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
    // #1477 — the collection dialogs, driven from their state like the delete dialog.
    const collectionNameDialogRef = useModalDialog(collectionNaming !== null);
    const [collectionDeleteTarget, setCollectionDeleteTarget] =
        useState<CollectionDeleteTarget | null>(null);
    const [collectionDeleteFailure, setCollectionDeleteFailure] = useState<string | null>(null);
    // The collection THIS TAB's own delete just removed (#1477 review R5) — `deletedRowId`'s rule.
    const [deletedCollectionId, setDeletedCollectionId] = useState<string | null>(null);
    const collectionDeleteDialogRef = useModalDialog(collectionDeleteTarget !== null);
    // The row ⋯ menu (#1440), shared by the All songs page and the songbook home. One menu
    // instance for whichever row is targeted, per `SongRowMenu`'s own note on why; anchored at
    // that row's ⋯ (#1755).
    const [rowMenuFor, setRowMenuFor] = useState<SongRowMenuTarget | null>(null);
    const rowMenuTrigger = useRef<HTMLElement | null>(null);
    // Counts openings, so a ⋯ activated while another row's menu is open (a click with no
    // press before it: a screen reader, a script) mounts a fresh menu at the new ⋯.
    const [rowMenuOpening, setRowMenuOpening] = useState(0);
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
    // Accounts are part of the product on every device (#1357; the `?accounts=off` opt-out went in
    // #1743). The account surfaces mount with the app rather than in the prerendered HTML
    // (`accountsMounted`), so the first paint is the plain guest app and no account control is on
    // screen before React can answer it. `ready` gates the session read so it lands after the
    // songbook is up; nothing here is ever awaited by startup.
    const [accountsMounted, setAccountsMounted] = useState(false);
    useEffect(() => {
        setAccountsMounted(true);
    }, []);
    const account = useAccountSession(ready);
    const [accountDialog, setAccountDialog] = useState<AccountDialogMode | null>(null);
    // The account page (#1264: passkeys, sessions, recovery code) is a second, independent
    // dialog from the sign-in one above — opening it never touches `accountDialog`, and vice
    // versa, so the two can't fight over the same `showModal()`/`close()` pair.
    const [accountPageOpen, setAccountPageOpen] = useState(false);
    // #1268 — copy this device's guest songs into the account: opened automatically once per
    // (device, owner) after a sign-in that finds candidates and has not been answered yet, and
    // manually from the account page's "Add this device's songs" button at any later time.
    const [adoptOpen, setAdoptOpen] = useState(false);
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
    const signedIn = account.session.status === 'signedIn';
    /**
     * #1269 — this device WAS signed in and the server no longer agrees, in THIS page load. Still
     * what the sync chip reads: it is a fact about the session, and "sign in again to upload it"
     * is only true while the queue's own explanation is on screen beside it.
     */
    const expiredSession = account.session.status === 'expired';
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
    const sync = useAccountLibrary(account.session, current?.id ?? null);
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
    const rowInAccount = signedIn && sync.observation?.remoteRevision != null;
    /**
     * Whether the Song menu's Delete… has a song to delete (#1756): a saved one, guest or
     * account. Not a shared or new-song draft (nothing is stored), and not an account chart this
     * device cannot act for — its session gone, or another account attached (#1311) — which
     * `inAccount` and the purge's own owner fence would refuse anyway.
     */
    const standDeletable =
        current !== null &&
        saved !== null &&
        !sharedDraft &&
        (standStore?.store === 'guest' ||
            (standStore?.store === 'account' && signedIn && !standMismatch));
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
        signedIn && standStore?.store === 'account' && !standMismatch && current !== null
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
    const songbookLoading = (ready && !account.settled) || liveHome === null;
    // The band/sound defaults a brand-new or imported song is built from. Falls back through:
    // the live songbook's most recently opened song, else the guest songbook's (a fresh account's
    // library is legitimately empty), else the standards catalog's own defaults (#1439) — a fresh
    // DEVICE's guest songbook is legitimately empty too, now that starter seeding is retired, and
    // "New song" and "Import" must still work on the very first visit, before anything is saved.
    // One document is all this needs, so it comes from the home slices (#1441), never a full read.
    const template =
        liveHome?.rows[0] ?? liveHome?.continued ?? guestHome?.rows[0] ?? defaultTemplate;
    const accountDialogRef = useModalDialog(accountDialog !== null);
    const accountPageDialogRef = useModalDialog(accountPageOpen);
    // A guarded dialog's guard is its own effect beside its comment, in the hook that holds it:
    // the confirm steps (`deleteOpen`, `rowDeleteTarget`, `useSongDeletes`'s; `adoptRemoteOffer`'s
    // hook and guard are `useStandConflict`'s, with `adoptRemoteOffered`) and the sign-out
    // preflight (`signOutMoot`, with its hook, is `useAccountExit`'s).
    const adoptDialogRef = useModalDialog(adoptOpen);
    const bandDialog = useModalDialog(bandOpen);
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
    // Moved up from beside its JSX consumers so the Following look-ahead (`useFollowScroll`,
    // next) — which needs `activeBar` (patch review P3-2) — can read it without a forward
    // reference; `useChartView` has no render boundary of its own, so calling it here instead of
    // later changes nothing about what it computes, only where its already-fresh-every-render
    // result becomes available.
    const {
        followChart,
        blocks,
        displayActive,
        displayNext,
        activeEvent,
        activeBar,
        totalBars,
        writtenBars,
        writtenSections,
    } = useChartView(current, active, playing);
    useFollowScroll(scroll, {
        following,
        active,
        chartId: current?.id,
        nextSoon,
        activeBar,
    });
    // Song mode's readout (#1784): what the band plays now, or would at Play. Stopped, reading it
    // compiles the chart a few times, so it is read again only when the chart (its tempo
    // included), the setting or the transport changes, and only while the Practice tab shows it.
    // biome-ignore lint/correctness/useExhaustiveDependencies: `current`, `songMinutes` and `playing` are re-read triggers.
    const songReadout = useMemo(
        () => (current && bandTab === 'practice' ? runtime.songModeReadout() : null),
        [current, feel.songMinutes, playing, bandTab],
    );
    const neckShowing = neck && !editing;
    const neckPrefs = useNeckPrefs();
    // The chart reads as one page where it can (#1712); editing, it scrolls at a reading size.
    useChartFit(scroll, !current || neckShowing ? null : editing ? 'edit' : 'page', blocks);
    // Bars typed but not yet applied (#1723).
    const hasPendingText = pendingMeasures;
    // An untouched new song is not unsaved work: there is nothing in it to lose (#1707).
    const dirty =
        hasPendingText ||
        (sharedDraft && !newSongDraft) ||
        // A new song changed but not yet kept (the keep waits for a pause in presses,
        // `NEW_SONG_KEEP_DELAY_MS`): Save must stay pressable through the press that left a bar
        // and so made the change.
        (newSongDraft && !!current && !untouchedNewSong(current)) ||
        !!(current && saved && !same(current, saved));
    // Unsaved all the same — only Save commits it — but said apart, so a practice nudge doesn't
    // read like unsaved chart work (#1706).
    const practiceOnly =
        dirty &&
        !hasPendingText &&
        !sharedDraft &&
        !!current &&
        !!saved &&
        sameMusic(current, saved);
    const playbackActive = playing || playbackPending;
    // A tab with something to lose is not reloaded out from under the musician by an update
    // another tab set off (#1889); it reloads once this clears.
    const offline = useOfflineInstall(playbackActive || dirty || busy);
    // Typing on the chart (#1723) is for the editor; leaving it closes the field (what it held is
    // applied or still pending, never lost).
    const typeOnChart = editing && !!current;
    useEffect(() => {
        if (!typeOnChart) {
            setOpenBar(null);
            setBarForm(null);
        }
    }, [typeOnChart]);
    // The bars changed since the chart was last kept, for the dot by each bar number: against the
    // saved song, or the draft as it landed (a standard, a shared link) when there is none.
    const keptBaseline = saved ?? draftBaseline.current;
    const keptBars = useMemo(
        () =>
            new Map(
                keptBaseline?.chart.score.sections.flatMap((section) =>
                    section.measures.map((m) => [m.id, JSON.stringify(m)] as const),
                ) ?? [],
            ),
        [keptBaseline],
    );
    const liveScore = typeOnChart && current ? current.chart.score : null;
    const liveBars = useMemo(
        () =>
            new Map(
                liveScore?.sections.flatMap((section) =>
                    section.measures.map((m) => [m.id, JSON.stringify(m)] as const),
                ) ?? [],
            ),
        [liveScore],
    );
    const chartFields = useMemo(
        () => (liveScore ? barFields(liveScore, barDrafts.drafts) : new Map()),
        [liveScore, barDrafts.drafts],
    );
    const focused = playbackActive && !showControls && !editing;

    useEffect(() => {
        setNeck(standMode() === 'neck');
    }, []);
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
        // A frame's paint is committed inside that frame (`flushSync`, #1693). State set in an
        // animation frame is otherwise committed in a later task, and on a busy main thread the
        // next frame can run first: it sets the next chord, and the one this frame read is never
        // shown although a frame saw it. The first call runs inside this effect, where React is
        // already committing and a nested flush is refused, so it commits the ordinary way.
        const follow = (commit: (paint: () => void) => void) => {
            window.cancelAnimationFrame(frame);
            window.clearTimeout(idle);
            const playingNow = runtime.state().playback.isPlaying;
            // ONE read of the band's clock for the whole paint (#1506): the audio clock can cross
            // a barline between two reads in this one task, and the active bar and the cue below
            // read separately once showed the bar just left with the new bar's cue.
            const tick = playingNow ? runtime.songTick() : null;
            const slot = runtime.playheadSlot(tick);
            commit(() => {
                setPlaying(playingNow);
                // No slot while counting in or between two queued segments: the pointer holds.
                setActive((previous) => (!playingNow ? null : slot >= 0 ? slot : previous));
                setCountInBeat(runtime.countInBeat());
                // #1458 — a pure engine read off the live song tick, not the ACTIVE bar's rendered
                // DOM node: React hasn't necessarily committed `active`'s new value yet on the very
                // frame playback crosses a barline, so reading the OLD bar's DOM attributes here
                // would still see the bar just left after the engine had already moved on.
                setNextSoon(runtime.inLastBeat(tick));
                // The slot this same tick is in, never `active`'s committed value, for the reason
                // above — and off any slot (-1) there is no chord to be leaving.
                setChangeSoon(runtime.inLastBeatOfSlot(tick, slot));
            });
            if (playingNow) {
                frame = window.requestAnimationFrame(inFrame);
            }
            idle = window.setTimeout(inFrame, playingNow ? 250 : 60);
        };
        const inFrame = () => follow(flushSync);
        follow((paint) => paint());
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
     * copy"/Save decides one. Shared by every entry that opens a chart this way: a `#chart=`
     * share link (below), and opening a standard from the catalog (`openStandard`, #1439).
     * Deliberately not `open()`: no `saved` baseline (so it can't masquerade as already
     * committed), no recovery-storage write (the id may be untrusted, or a catalog id that is
     * never meant to collide with a recovery key), and `lastOpened`/`rememberSong` are left alone
     * since this isn't a library entry yet.
     */
    function landDraftOnStand(document: ChartDocument, note: string) {
        setStandardDraft(false);
        runtime.load(document);
        setSaved(null);
        const landed = runtime.withLoadedSounds(document);
        setCurrent(landed);
        draftBaseline.current = landed;
        currentStore.current = null;
        setStandStore(null);
        markSharedDraft(true);
        pendingText.current = false;
        setPendingMeasures(false);
        barDrafts.retire();
        setRecoveryHealthy(true);
        setEditing(false);
        setFollowing(true);
        setMessage(note);
        const section = document.chart.score.sections[0];
        setMeasureId(section.measures[0].id);
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
        // chord text.
        sharedLinkHandled.current = true;
        const hash = window.location.hash;
        const search = window.location.search;
        // A `#chart=` fragment is the only share link. Any other non-empty hash stays on this
        // path too, so a corrupt `#chart=…` still says so. An old v1 `?s=`/`?prog=` link has no
        // fragment and is ignored (#1735): the page opens as the songbook, URL untouched.
        if (!hash) {
            return;
        }
        let alive = true;
        // `track` stays here rather than inside `landDraftOnStand`: `openStandard` (#1439)
        // tracks its own `chart_opened` event instead of `share_opened`.
        const openSharedDraft = (link: ChartDocument, note: string) => {
            track('share_opened');
            // A link that decodes can still be one the band refuses (`checkPlayable`: too long
            // to play, #1632). This runs outside `run()`, so say why here instead of leaving
            // an unhandled rejection and a silent page.
            try {
                landDraftOnStand(link, note);
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
            }
        };
        // Consumed on load either way: a corrupt/foreign payload must not resurrect on
        // reload, and a successfully opened draft must not resurrect after "Keep a copy"
        // replaces it with a saved document. Only the hash goes; the query string survives.
        const consumeLink = () =>
            window.history.replaceState(
                // Keeps the shell's history entry (#1700); only the URL is tidied.
                window.history.state,
                '',
                window.location.pathname + window.location.search,
            );
        // `?autoplay=1` on a `#chart=` link (#1732) arms playback; read before `consumeLink`
        // strips it.
        const wantsAutoplay = new URLSearchParams(search).get('autoplay') === '1';
        void decodeChartLink(hash).then((document) => {
            consumeLink();
            if (!alive) {
                return;
            }
            if (document === RETIRED_CHART_LINK) {
                setError(OLD_FORMAT_REFUSAL);
            } else if (document) {
                openSharedDraft(document, 'Opened from a shared link · not saved yet');
                if (wantsAutoplay) {
                    setPendingAutoplay(true);
                }
            } else {
                setError(
                    'This link could not be opened. It may be corrupted or made with a different version of the app.',
                );
            }
        });
        return () => {
            alive = false;
        };
    }, [ready]);

    // Where the musician is, as a history entry names it (#1700).
    const navView: NavView = current
        ? {
              kind: 'song',
              ref:
                  standardOnStand.current?.documentId === current.id
                      ? { kind: 'standard', id: standardOnStand.current.standardId }
                      : sharedDraft
                        ? { kind: 'draft' }
                        : { kind: 'song', id: current.id },
          }
        : standardsOpen
          ? { kind: 'standards', entry: standardsEntry }
          : allSongsOpen
            ? { kind: 'all', collection: allSongsCollection }
            : { kind: 'home' };
    const navViewKey = navKey(navView);

    const nav = useHistoryNavigation({ ready, navView, busy, working, applyNav });
    // A new song is kept on its first change (#1707). After the change's own `run()` has
    // finished, so this one isn't turned away by the shell's one-action-at-a-time lock — and
    // declared after the pending-Back effect above, so a Back pressed during that change is
    // applied first (`closeSong` keeps the song itself). A keep the store refuses leaves the
    // stand an ordinary unsaved draft — "Keep a copy" and the leave warning — rather than
    // retrying on every render.
    //
    // Once the musician pauses, not straight away (#1726): the commonest first change is a bar
    // left on the chart, and a bar is left by pressing something else — Save, Back, Play, a
    // section's name and Enter. The bar applies on the press's way down (its field's blur), so
    // the keep waits for a pause in presses and keys (`NEW_SONG_KEEP_DELAY_MS`), and any action
    // re-arms it (`busy`). It runs as a quiet `run`: nothing is disabled, so typing goes on
    // through it (the latest chart is what it retains), and an action pressed meanwhile waits for
    // it. Save and Back keep the song themselves when they come first.
    // biome-ignore lint/correctness/useExhaustiveDependencies: `keepNewSong`/`run` are new each render; `current`, `busy` and the flag are what decide.
    useEffect(() => {
        if (!newSongDraft || busy || !current || untouchedNewSong(current)) {
            return;
        }
        let wait = 0;
        const arm = () => {
            window.clearTimeout(wait);
            wait = window.setTimeout(() => {
                void run(async () => {
                    if (!newSongNow.current) {
                        return;
                    }
                    try {
                        await keepNewSong(current, false);
                    } catch (error) {
                        markSharedDraft(true);
                        throw error;
                    }
                }, true);
            }, NEW_SONG_KEEP_DELAY_MS);
        };
        arm();
        const activity = ['pointerdown', 'keydown'] as const;
        for (const type of activity) {
            document.addEventListener(type, arm, true);
        }
        return () => {
            window.clearTimeout(wait);
            for (const type of activity) {
                document.removeEventListener(type, arm, true);
            }
        };
    }, [newSongDraft, busy, current]);
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
    // Into the editor for a row-menu Rename (#1440), the title takes focus (#1235). Nothing else
    // does (#1726): bars are typed where they are read, opened by a press on one.
    useEffect(() => {
        if (editing && !busy && titleRequest !== focusedTitleRequest.current) {
            focusedTitleRequest.current = titleRequest;
            document.querySelector<HTMLInputElement>('#title')?.focus();
        }
    }, [editing, titleRequest, busy]);
    // The bar being edited stays in view of the chart (#1705) — pressed, moved to by Tab or the
    // dock's ‹ ›, or made by a bar or section action.
    useEffect(() => {
        if (editing && measureId) {
            scroll.current
                ?.querySelector('.bar.selected')
                ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }, [editing, measureId]);
    // The Song menu belongs to the chart on the stand: none left there, nothing of it stays open
    // (a delete from another tab, a sign-out), so the next ••• opens it rather than closing it.
    const standOpen = current !== null;
    useEffect(() => {
        if (!standOpen) {
            setSongMenu(null);
            setExportOpen(false);
        }
    }, [standOpen]);
    useEffect(() => {
        if (bandOpen) {
            // Refreshed on every open: these fields can drift from what the sheet last
            // showed (a different song opened, which resets the energy level).
            setFeel(feelSnapshot());
        }
    }, [bandOpen]);
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
    // Called here, where the two delete confirms' guard effects always ran (`useSongDeletes`).
    const {
        guestDeleteTarget,
        purgeTarget,
        unreadableRemoval,
        rowDeleteTarget,
        deleteFailure,
        rowDeleteFailure,
        guestDeleteDialogRef,
        purgeDialogRef,
        unreadableRemovalRef,
        deleteDialogRef,
        rowDeleteDialogRef,
        requestDeleteRow,
        exportGuestDeleteTarget,
        closeGuestDelete,
        deleteGuestSong,
        exportPurgeTarget,
        requestPurgeGone,
        closePurge,
        purgeConfirmed,
        closeRowDeleteConfirm,
        exportRowDeleteTarget,
        deleteRowFromAccount,
        commitCloudDelete,
        requestDeleteStand,
        closeDeleteConfirm,
        deleteFromAccount,
        exportUnreadableSongs,
        requestRemoveUnreadable,
        closeUnreadableRemoval,
        removeUnreadableConfirmed,
    } = useSongDeletes({
        current,
        dirty,
        standStore,
        standDeletable,
        signedIn,
        inAccount,
        rowInAccount,
        rowMenuFor,
        sessionOwner,
        sync,
        setCurrent,
        setSaved,
        setError,
        setHomeNoticeState,
        setDeletedRowId,
        setOpenedAtState,
        currentNow,
        volatileDrafts,
        accountDrafts,
        run,
        refreshSongs,
        exportSong,
        exportableRowDocument,
        closeRowMenu,
        standOwner,
        standBelongsElsewhere,
        bindStand,
        clearBuffers,
    });
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
     * Deliberately off the guest first-paint path, on two counts: `ready` means the guest
     * songbook is already up, and `settled` means the first session read has answered (or the
     * deadline released it). Nothing here is ever awaited by startup or by playback.
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
        if (!ready || !account.settled || account.session.status === 'unknown') {
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
    }, [ready, account.settled, account.session.status, sync.owner]);
    // #1269, #1351, #1271 — leaving the account: the sign-out step, its preflight and the clears.
    // Called here, where the step's moot and preflight effects always ran (`useAccountExit`).
    const {
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
    } = useAccountExit({
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
    });
    useEffect(() => {
        // Mirrored here rather than written during render, the way the dialog itself mirrors its
        // own `open` prop: one place that knows whether a question is on screen (#1359).
        adoptOnScreen.current = adoptOpen;
    }, [adoptOpen]);
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
        }
    }, [signedIn]);
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
            // patch P2-2): this effect re-runs whenever the library's counts change, and the
            // account page's own offer carries no `adoptOffered` mark until it opens.
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
        let alive = true;
        setAllSoundsOffline(null);
        if (bandTab === 'players' && !busy) {
            void allSoundsAvailableOffline().then((available) => {
                if (alive) {
                    setAllSoundsOffline(available);
                }
            });
        }
        return () => {
            alive = false;
        };
    }, [bandTab, busy]);
    useEffect(() => {
        let alive = true;
        setSoundsOffline(null);
        if (current && !busy && bandTab === 'players') {
            void soundsAvailableOffline(current.chart).then((available) => {
                if (alive) {
                    setSoundsOffline(available);
                }
            });
        }
        return () => {
            alive = false;
        };
    }, [current, bandTab, busy]);

    /**
     * One action at a time, with the shell busy while it runs (controls disabled); a second action
     * pressed meanwhile is turned away. `quiet`: a task the shell starts by itself (a new song's
     * keep, #1707) — it disables nothing and leaves the error line alone (it says why the
     * musician's own last action was refused), so typing carries on through it (#1726).
     *
     * Nothing being disabled, the musician can act while it runs: each such action waits its
     * turn behind it, in order (`waiting`), never turned away. A waiting action reads the chart as
     * it is when its turn comes (`currentNow`, through `updateChart`/`applyScore`), not as it was
     * pressed, and a refusal of the keep's is not cleared by the action after it.
     */
    async function run(task: () => void | Promise<void>, quiet = false) {
        if (quiet) {
            if (working.current || background.current || waiting.current) {
                return;
            }
            const done = (async () => {
                try {
                    await task();
                    return false;
                } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                    return true;
                }
            })();
            background.current = done;
            await done;
            background.current = null;
            return;
        }
        const ahead = waiting.current ?? background.current;
        if (ahead) {
            const turn = ahead.then((refused) => perform(task, refused));
            waiting.current = turn.then(() => false);
            const mine = waiting.current;
            await turn;
            if (waiting.current === mine) {
                waiting.current = null;
            }
            return;
        }
        if (working.current) {
            return;
        }
        await perform(task, false);
    }
    /** `run`'s body: the shell busy while `task` runs, its refusal on the error line. */
    async function perform(task: () => void | Promise<void>, keepError: boolean) {
        working.current = true;
        setBusy(true);
        // A feel change now prepares its sounds while the band keeps playing and
        // swaps in at the next bar (#1185); only a failed change stops and resumes.
        // Either way the stand stays stable and Stop stays usable until it settles.
        setPlaybackPending(runtime.state().playback.isPlaying);
        if (!keepError) {
            setError('');
        }
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
    /** The Play/Stop button, and Space on the stand (`standKeys`). */
    function togglePlayback() {
        if (runtime.state().playback.isPlaying || playbackPending) {
            runtime.stop();
            setPlaying(false);
            // A song-mode performance's slots are not the chart's (#1784): drop the stale one now.
            setActive(null);
            setPlaybackPending(false);
            return;
        }
        startPlayback();
    }
    function startPlayback() {
        // FIRST, synchronously, inside the press (as `playSong` does): the start may wait its turn
        // behind a new song's keep (`run`), and mobile Safari only lets audio start in a gesture.
        runtime.warmAudio();
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
            setBandTab(null);
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
    function markSharedDraft(shared: boolean, newSong = false) {
        sharedDraftNow.current = shared;
        setSharedDraft(shared);
        newSongNow.current = shared && newSong;
        setNewSongDraft(shared && newSong);
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
    /**
     * The draft is kept for recovery on this device. Said by the header's "locally recovered"
     * alone — never a toast (#1760): this runs on EVERY edit, and "Draft recovered on this
     * device" told a musician who had recovered nothing that they had, an edit at a time. A real
     * recovery is announced where it happens, by `open()` ("Recovered your unsaved changes").
     */
    function retained(next: ChartDocument) {
        volatileDrafts.current.delete(next.id);
        setRecoveryHealthy(true);
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
     * A concurrent tab's live experiment goes with it, and the tab in question still holds its text
     * and retains it again on its next keystroke.
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
    function draft(next: ChartDocument, baseline = savedNow.current) {
        setCurrent(next);
        currentNow.current = next;
        // A shared draft — a standard or a #chart= link (`landDraftOnStand`) — belongs to no
        // songbook yet and has no `saved` baseline to recover FROM if the tab closes; "Keep a
        // copy"/Save is what turns it into a library entry, and `open()` clears the flag the
        // moment that happens. Writing recovery storage for it here would key a slot under
        // the shared id (a catalog id for a standard) that nothing but a Save — which this isn't
        // — ever clears, so "Older drafts" would grow by one per edited-but-unsaved visit.
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
        setPendingMeasures(false);
        barDrafts.retire();
    }
    // Section tap menu's "Start here" (#1422): jump playback to a section's first performed
    // bar. From the section's menu in Edit (#1726), a name or count still in its field goes in
    // first, in the same action.
    function startHereSection(id: string | undefined, pending: readonly SectionChange[] = []) {
        // `LeadSheetSectionBlock.id` is optional in the shared model (legacy fixtures
        // predate it); every live block sets it, but stay a no-op if one ever doesn't.
        if (!id) {
            return;
        }
        // Re-review P3 — the same reasoning as `startPlayback`: this is another way of starting
        // playback, and a scroll while stopped must not leave it starting unfollowed with the
        // pill already showing.
        setFollowing(true);
        // Inside the press, as `startPlayback` does: the start may wait its turn (`run`).
        runtime.warmAudio();
        void run(async () => {
            if (pending.length > 0) {
                applyScore(withSectionChanges(updateChart().chart.score, id, pending));
            }
            await runtime.startSection(id, setSoundProgress);
            setSoundProgress('');
        });
    }
    /** Into the editor: the one way `editing` turns on. It overlays the stand mode (#1587)
     * without changing it, so leaving the editor by any path returns to Chart or Neck. */
    function showEditor() {
        setEditing(true);
    }
    function showStand(mode: StandMode) {
        setEditing(false);
        setNeck(mode === 'neck');
        rememberStandMode(mode);
    }
    /** The stand's Edit chart: the band stops, the editor opens. */
    function editChart() {
        runtime.stop();
        showEditor();
    }
    /** Adopt `score` as the chart. `onlyBar` names the one pending bar it folded in (leaving a
     * bar on the chart, #1723), and only that draft retires; otherwise every draft does. */
    function applyScore(score: SemanticScore, onlyBar?: string): ChartDocument {
        // The chart as it is now, not as this render saw it: an action that waited its turn
        // (`run`) and a second change in one action both build on the latest.
        const current = currentNow.current;
        if (!current) {
            throw new Error('Open a chart first.');
        }
        const candidate = repository.validated({ ...current, chart: { ...current.chart, score } });
        runtime.load(candidate);
        const next = runtime.captureDocument(candidate);
        draft(next);
        if (onlyBar !== undefined) {
            barDrafts.retire([onlyBar]);
            return next;
        }
        pendingText.current = false;
        setPendingMeasures(false);
        // Retired on successful runtime adoption, not object equality: a subsequent transpose
        // may immediately replace the accepted score again.
        barDrafts.retire();
        return next;
    }
    /**
     * The delete toast's Undo (#1758): the chart and its pending bars exactly as they were before
     * the delete, the bar that was open opened again. Unsaved, like the delete it undoes. Refused
     * if anything has changed since (the toast is gone by then anyway).
     *
     * Pressed while another action runs (Play still loading its sounds), it waits for that action
     * rather than being turned away (`run` turns a second action away): the offer stays up, its
     * clock held, and Undo runs as soon as the shell is free (`undoAfterWork`, #1758 review).
     */
    function undoDelete() {
        if (!deleteUndoNow.current) {
            return;
        }
        if (working.current && !waiting.current && !background.current) {
            undoAfterWork.current = true;
            setUndoHeld(true);
            return;
        }
        void run(() => {
            // The offer as it stands when this turn comes, carried past a new song's keep.
            const undo = deleteUndoNow.current;
            const now = currentNow.current;
            retireUndo();
            if (!undo) {
                return;
            }
            if (
                !now ||
                (now !== undo.after && !keptAs(undo.after, now)) ||
                barDrafts.latest().size > 0
            ) {
                throw new Error('The chart has changed since the delete, so it can’t be undone.');
            }
            // Kept since the snapshot (a new song's first change): the chart goes back, at the
            // revision the songbook now holds.
            const restored =
                now === undo.after
                    ? undo.before
                    : { ...undo.before, revision: now.revision, updatedAt: now.updatedAt };
            runtime.load(restored);
            draft(restored);
            barDrafts.restore(undo.drafts);
            setMeasureId(undo.measureId);
            if (undo.reopen && typeOnChart) {
                // Its field takes focus as it opens.
                setOpenBar({ id: undo.reopen, select: 'end' });
            } else {
                undoFocus.current = undo.reopen
                    ? { measureId: undo.reopen }
                    : { sectionId: undo.sectionId };
            }
        });
    }
    function updateChart(): ChartDocument {
        // The chart as it is now (`applyScore`'s reason), and the bars pending as of now.
        const current = currentNow.current;
        if (!current) {
            throw new Error('Open a song first.');
        }
        if (barDrafts.latest().size === 0) {
            return current;
        }
        try {
            // Every pending bar, by the editor's own rules (`commitBarDrafts`).
            return applyScore(commitBarDrafts(current.chart.score, barDrafts.latest()));
        } catch (error) {
            closeSongMenus();
            showEditor();
            // The bar that needs fixing is selected and opens on the chart, its text ready to
            // correct (#1723), with the refusal in the shell's error line. A fresh opening, so
            // the blur of the field Save was pressed from cannot close it. Not for a bar
            // refused for its repeat or ending settings: those are fixed through its bar menu's
            // Repeat or ending…, so the field is left closed over them (#1724) and the bar
            // stays selected.
            if (error instanceof BarDraftError && error.measureId) {
                setMeasureId(error.measureId);
                const field = barField(current.chart.score, barDrafts.latest(), error.measureId);
                setOpenBar(
                    field && field.text !== null && !error.inForm
                        ? { id: error.measureId, select: 'end' }
                        : null,
                );
            }
            throw error;
        }
    }
    /**
     * Leaves the stand — the one way off it, for the in-app back button and for browser Back
     * (#1700) alike, so both capture an unchecked chart the same way. `after` runs once the stand
     * has gone; `onStay` runs instead when the chart can't be left (invalid text the editor is
     * now showing).
     */
    function closeSong(after?: () => void, onStay?: () => void) {
        void run(async () => {
            let candidate: ChartDocument;
            try {
                candidate = updateChart();
            } catch (error) {
                onStay?.();
                throw error;
            }
            if (newSongNow.current && !untouchedNewSong(candidate)) {
                // Typed into but not yet applied: leaving keeps it, as leaving a saved song keeps
                // its unsaved bars in recovery. Refused, the stand stays — and so does its entry.
                try {
                    await keepNewSong(candidate, false);
                } catch (error) {
                    markSharedDraft(true);
                    onStay?.();
                    throw error;
                }
            }
            runtime.stop();
            setCurrent(null);
            bindStand(null);
            after?.();
        });
    }
    /** Opens the Band sheet on `tab` (#1703), or switches to it when the sheet is already open. */
    function openBand(tab: BandTab) {
        lastBandTab.current = tab;
        setBandTab(tab);
    }
    function toggleLane(lane: Lane) {
        if (current) {
            change(() => runtime.setEnabled(lane, !current.chart.band[lane].enabled));
        }
    }
    function goHome() {
        closeSong();
    }
    /** Shows the view a history entry names (#1700) — the popstate handler's one action. */
    function applyNav(target: NavEntry, from: NavEntry | null) {
        const view = target.view;
        if (navKey(view) === navViewKey) {
            // Already on screen (an entry the shell didn't write sat between them): reopening it
            // would throw away the stand's unchecked text for nothing.
            nav.entry.current = target;
            return;
        }
        if (
            current &&
            sharedDraftNow.current &&
            // A new song is kept by `closeSong` the moment it holds anything: nothing to warn of.
            !newSongNow.current &&
            !nav.leaveDraftWarned.current &&
            (hasPendingText ||
                (draftBaseline.current !== null && !same(current, draftBaseline.current)))
        ) {
            // An edited shared or standard draft exists nowhere else: Back — easily an accidental
            // edge swipe on a phone — says so once rather than dropping it.
            nav.leaveDraftWarned.current = true;
            nav.undoPop(target, from);
            setMessage(
                "This draft isn't saved. Keep a copy to save it, or go back again to leave it.",
            );
            return;
        }
        nav.entry.current = target;
        const browse = () => {
            if (view.kind === 'standards') {
                setAllSongsOpen(false);
                setStandardsEntry((view.entry ?? 'all') as StandardsEntry);
                setStandardsOpen(true);
            } else if (view.kind === 'all') {
                setStandardsOpen(false);
                openAllSongs(view.collection);
            } else {
                setStandardsOpen(false);
                setAllSongsOpen(false);
            }
        };
        if (view.kind !== 'song') {
            if (current) {
                // The chart couldn't be left — the editor is showing why — so the stand stays,
                // and so does its entry.
                closeSong(browse, () => nav.undoPop(target, from));
            } else {
                browse();
            }
            return;
        }
        if (view.ref.kind === 'song') {
            openSong(view.ref.id, () => nav.undoPop(target, from));
        } else if (view.ref.kind === 'standard') {
            openStandard(view.ref.id, () => nav.undoPop(target, from));
        } else {
            // A shared draft lived only on the stand it was opened on; Forward can't rebuild it.
            nav.undoPop(target, from);
        }
    }
    function selectSection(document: ChartDocument, id?: string) {
        const sections = document.chart.score.sections;
        const section = sections.find((s) => s.id === id) || sections[0];
        setMeasureId(section.measures[0].id);
    }
    /**
     * The retained experiment to offer for a chart being opened, from the songbook it came from
     * (#1299) — the account's `drafts` store signed in, guest `localStorage` otherwise. Every
     * caller reads the live songbook, so signed in the chart is an account chart, and only the
     * account store is asked: the guest fallback for a slot a build from before #1299 left under an
     * account id was retired in #1743.
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
        if (!signedIn) {
            return { recovery: repository.recoveryFor(document), unreadable: false };
        }
        try {
            const held = await accountSync.retainedDraft(document.id);
            return {
                recovery: held ? { document: held.document, conflict: held.conflict } : null,
                unreadable: false,
            };
        } catch {
            return { recovery: null, unreadable: true };
        }
    }
    /**
     * Every preserved draft the song menu can offer for the chart on the stand (#1299 patch
     * review P2) — newest first, from the namespace the chart lives in.
     *
     * Since #1299 an account chart's experiments live in the account database, so a guest-only
     * list made a second tab's experiment on this song unreachable: nothing in the product could
     * open it, and the only thing that mentioned it was a sign-out warning. The account rows are
     * the live ones (`preservedDrafts`), which is also why this list can never offer text a Save
     * has already moved past. A guest chart's are its own `localStorage` slots.
     *
     * An unreadable account store answers with nothing rather than an error: the menu is an
     * offer, and a missing offer is not a claim about anything.
     */
    async function recoveryOptionsFor(
        document: ChartDocument,
    ): Promise<Array<{ document: ChartDocument; capturedAt: string }>> {
        if (currentStore.current?.store !== 'account') {
            return repository.recoveriesFor(document);
        }
        // A chart whose account is not the attached one has no rows to read here either (#1311):
        // `preservedDrafts` would query B's store for A's document id, which is at best nothing.
        if (standBelongsElsewhere()) {
            return [];
        }
        try {
            return await accountSync.preservedDrafts(document.id);
        } catch {
            return [];
        }
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
        const next = volatileDrafts.current.get(document.id) || recovery?.document || document;
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
        const savedBaseline = next === document ? onDevice : document;
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
        clearConflictFailures();
        setEditing(false);
        setFollowing(true);
        if (recovery?.conflict) {
            // #1460 review P2 #3 — this needs reading time and a decision (Duplicate), not a
            // ~4s window: `warning` persists with its own close button.
            setMessage('Recovered draft is based on an older save. Duplicate it to keep both.', {
                tone: 'warning',
            });
        } else if (recovery) {
            setMessage('Recovered your unsaved changes');
        } else {
            // A plain open has nothing to announce (#1700): the header already says where the
            // song lives, and a "Saved" toast for a song nobody just saved read as an action that
            // hadn't happened while covering the chart's last row on a phone. Clearing still
            // keeps the previous song's sentence from following the musician into this one.
            setMessage('');
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
     * the paths that write the GUEST songbook whatever the session says (the guest songbook
     * becoming live again after a sign-out or an account deletion).
     */
    async function refreshGuest(): Promise<void> {
        setGuestHome(await readGuestHome());
        if (libraryWanted.current.guest) {
            void reloadGuestLibrary();
        }
    }
    /**
     * Ask for a songbook's WHOLE library (#1441) — All songs, a search and the account page are
     * the surfaces that need every song. Idempotent; a failed read is retried by
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
        } else if (
            liveHome !== null &&
            // The store's `count()` holds the rows the account's full read steps over (#1769);
            // they are not a sign the kept list is stale.
            liveHome.count !== liveSongs.length + (signedIn ? accountUnreadable : 0)
        ) {
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
            const unreadable = await accountSync.unreadableSongs(owner);
            if (read === accountLibraryRead.current) {
                accountSongsOwner.current = owner;
                setAccountSongs(documents);
                setAccountUnreadable(unreadable.length);
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
    /** A row's ⋯ (#1755): opens the menu at it, or closes it when it is already open there. */
    function openRowMenu(id: string, title: string, trigger: HTMLElement) {
        // The ⋯ is `aria-disabled` while busy rather than `disabled`, so the menu's focus can go
        // back to it during the action it started.
        if (busy) {
            return;
        }
        if (rowMenuFor?.id === id && rowMenuTrigger.current === trigger) {
            closeRowMenu();
            return;
        }
        rowMenuTrigger.current = trigger;
        setRowMenuOpening((n) => n + 1);
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
                showEditor();
                setTitleRequest((n) => n + 1);
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
            // to keep an imported chart's original timestamp), so leaving the original's here would make a fresh copy
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
     * Commits a version and, signed in, queues those exact bytes for the owner and asks the loop
     * to send them. Save never waits for the network: an offline Save is an ordinary successful
     * Save with an upload still owed, which is the whole reason local safety and cloud
     * confirmation are reported as two separate facts.
     *
     * `intent.owner` is the account these bytes belong to (#1311), and it is a PARAMETER rather
     * than a read of `currentStore` because the two kinds of caller genuinely differ. A Save, a
     * Duplicate, an editor upgrade and a recovered-draft copy are all the chart on the stand's
     * music under a new wrapper, so they carry the stand's owner and are refused when it is not
     * the attached one. A brand-new song, an imported file and a shared-link copy are nobody's
     * yet: they pass null and belong to whichever account is live. Deriving this from the document
     * id would get Duplicate exactly backwards — a fresh id carrying A's music.
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
                // copy of account content into guest storage on Duplicate (#1266). The full
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
     * Closes the Song menu (#1756), whichever list or small dialog it shows, Export… and the
     * transport's Key popover (#1757): a refusal is shown with nothing open over it.
     */
    function closeSongMenus() {
        setSongMenu(null);
        setExportOpen(false);
        setKeyOpen(false);
    }
    /** The •••: opens the Song menu, or closes it while one of its lists is showing. */
    function toggleSongMenu() {
        if (busy || !current) {
            return;
        }
        if (songMenu === 'actions' || songMenu === 'more') {
            setSongMenu(null);
            return;
        }
        const document = current;
        void run(async () => {
            setRecoveryOptions(await recoveryOptionsFor(document));
            setSongMenu('actions');
        });
    }
    /** Export…'s formats (#1756). Each closes the dialog once its file is written. */
    function exportAs(format: ExportFormat) {
        if (format === 'mix' || format === 'stems') {
            void exportAudioFile(format);
            return;
        }
        void run(async () => {
            try {
                if (format === 'song') {
                    exportSong();
                } else if (format === 'midi') {
                    await exportMidiFile();
                } else if (current?.importSource) {
                    downloadImportSource(current.importSource.text);
                }
            } finally {
                // Written or refused, it closes: a refusal is in the error line behind it.
                setExportOpen(false);
            }
        });
    }
    function openSong(id: string, onMissing?: () => void) {
        void run(async () => {
            // By id (#1441): opening one song never reads the whole songbook.
            const document = await readLiveSong(id);
            if (!document) {
                onMissing?.();
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
    function openStandard(id: string, onMissing?: () => void) {
        void run(async () => {
            const entry = standardFor(id);
            if (!entry) {
                onMissing?.();
                throw new Error('Standard no longer exists.');
            }
            const document = buildStandardDocument(entry);
            // No toast: the header already says "From the standards · not saved" (UI audit).
            landDraftOnStand(document, '');
            standardOnStand.current = { documentId: document.id, standardId: id };
            setStandardDraft(true);
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
        // The ref: a Save that waited on a new song's keep (`run`) began before it was kept.
        if (!current || !savedNow.current) {
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
        } else {
            try {
                repository.clearOwnRecovery(current.id);
            } catch {
                /* The committed save is authoritative; retained recovery is harmless. */
            }
        }
        await refreshSongs();
        // A copy moves the stand onto the new song (`setCurrent(result)` above) — say so by
        // name, or the musician goes on editing what they think is the original (#1700).
        setMessage(
            copy
                ? `Duplicated as “${next.title}” · you’re on the copy now`
                : 'Saved on this device',
        );
        closeSongMenus();
    }
    function newSong() {
        void run(async () => {
            // A draft until it holds something (#1707): `keepNewSong` writes it on the first
            // change, so a New song backed straight out of leaves the songbook as it was.
            const document = repository.validated(blankSong(template));
            landDraftOnStand(document, '');
            markSharedDraft(true, true);
            editChart();
        });
    }
    /** Whether the new song on the stand is still exactly as New song made it (#1707). */
    function untouchedNewSong(candidate: ChartDocument) {
        return draftBaseline.current !== null && same(candidate, draftBaseline.current);
    }
    /**
     * Puts the new song on the stand into the songbook (#1707) and keeps it on the stand as an
     * ordinary saved song. Same id, so the editor (`key={current.id}`) keeps whatever is typed but
     * not yet applied.
     *
     * `commit` is an explicit Save, which commits `next` as it is. Otherwise — the first change, or
     * leaving with bars typed — only the blank song New song made is committed, exactly what New
     * song used to commit the moment it was pressed, and `next` is retained over it as an unsaved
     * draft like any other: an explicit Save is still the only thing that commits the musician's
     * own music.
     */
    async function keepNewSong(next: ChartDocument, commit: boolean) {
        const blank = draftBaseline.current;
        // `template` always has a value, so a brand-new song belongs to whichever songbook is
        // live right now, not to whatever was last on the stand — bound before `storeSave` so its
        // expiry guard reads the truth. Its owner claim is null for the same reason (#1311):
        // these bars are nobody's yet. From the SESSION (`liveStand`), never `sync.owner`: New
        // song is reachable from the songbook the moment the session reports an owner, which is
        // BEFORE `attach()` has published one, and a binding taken from the loop there would be
        // unfenced.
        bindStand(liveStand());
        const created = await storeSave(
            { ...(commit || !blank ? next : blank), revision: 0 },
            null,
            {
                owner: null,
                stand: false,
            },
        );
        markSharedDraft(false);
        draftBaseline.current = null;
        setSaved(created);
        savedNow.current = created;
        rememberOpened(created.id);
        setRecoveryHealthy(true);
        // Not committing, the stand may have moved on while the blank was written (the keep runs
        // in the background, #1726): typing went on, so the latest chart is what is retained.
        const latest = !commit && currentNow.current?.id === next.id ? currentNow.current : next;
        if (commit || !blank || same(latest, created)) {
            setCurrent(created);
        } else {
            // The edit on top of the committed blank: `latest` at the committed revision.
            draft({ ...latest, revision: created.revision, updatedAt: created.updatedAt }, created);
        }
        await refreshSongs();
        track('chart_created');
        return created;
    }
    /** How many times the band plays the form (#1475), from the chart footer (#1511): one
     * unsaved edit. */
    function changeChoruses(choruses: number | undefined) {
        change(() => runtime.setChoruses(choruses), true);
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
            // Done, cancelled or refused, Export… closes; a refusal is in the error line.
            setExportOpen(false);
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
        // the guest slot below is read for a guest chart only, and a store read cannot happen in
        // a memo. It
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
                    : held ||
                      (signedIn ? null : repository.recoveryFor(featuredSave)?.document) ||
                      featuredSave;
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
            key: resolved.chart.score.key,
            isMinor: resolved.chart.score.isMinor,
            bars,
        };
    }, [featuredSave, current, signedIn]);
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
        current && (signedIn || expiredSession)
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
    /**
     * Review P2 #3 — an armed `?autoplay=1` link's hint is derived from `pendingAutoplay` itself,
     * not captured once into `message` text: the link's own note (below) still auto-dismisses
     * after ~4s like any other `info` message, but "tap anywhere to play" must stay lit for as
     * long as autoplay is actually armed, however long that takes.
     */
    const pendingAutoplayHint = pendingAutoplay ? 'tap anywhere to play' : null;
    // #1889 — another tab installed the update; this one waits for the band or the edit.
    const updateHint =
        offline.update === 'deferred' && current
            ? 'Updated in another tab · this one reloads when you stop or save'
            : null;
    const {
        setMessage,
        dismissMessage,
        toastTone,
        toastText,
        messageToken,
        setToastHeld,
        standSyncFailureVisible,
        dismissSyncFailure,
    } = useStandToast({
        busy,
        soundProgress,
        standSyncFailureKey: standSyncFailure?.key ?? null,
        pendingAutoplayHint,
        updateHint,
    });
    const {
        deleteUndo,
        undoLive,
        setUndoHeld,
        offerUndo,
        retireUndo,
        deleteUndoNow,
        undoAfterWork,
        undoFocus,
    } = useDeleteUndo({
        current,
        busy,
        draftsEmpty: barDrafts.drafts.size === 0,
        currentNow,
        keptAs,
        undoDelete,
    });
    const {
        barEditing,
        sectionEditing,
        barMarkers,
        openBarForm,
        applyForm,
        withSectionChanges,
        changeSongMeter,
    } = useBarEditing({
        current,
        currentNow,
        busy,
        typeOnChart,
        openBar,
        chartFields,
        keptBars,
        liveBars,
        barDrafts,
        setOpenBar,
        setMeasureId,
        setBarForm,
        setError,
        measureIdNow,
        working,
        run,
        applyScore,
        updateChart,
        startHereSection,
        closeSongMenus,
        offerUndo,
    });
    const {
        keepBothFailure,
        adoptRemoteFailure,
        adoptRemoteDialogRef,
        keepBothVersions,
        adoptAccountVersion,
        offerAdoptRemote,
        closeAdoptRemote,
        clearConflictFailures,
    } = useStandConflict({
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
    });

    // Keys on the stand (UI audit): Space plays and stops, and PageDown/PageUp step through the
    // chart a section at a time — what a page-turn pedal sends. Only on the stand's chart, with no
    // sheet or dialog open, and never while typing: Space on a focused button or control is that
    // control's own, so it is left alone. Read through a ref so the listener, added once, always
    // sees this render's state.
    standKeys.current = (event: KeyboardEvent) => {
        if (!current || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }
        if (document.querySelector('dialog[open]')) {
            return;
        }
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
            return;
        }
        if (event.key === ' ') {
            if (target?.closest('button, a, [role="button"], [role="tab"], [role="menuitem"]')) {
                return;
            }
            event.preventDefault();
            if (!busy || playbackActive) {
                togglePlayback();
            }
            return;
        }
        if ((event.key === 'PageDown' || event.key === 'PageUp') && !editing && !neckShowing) {
            const box = scroll.current;
            if (!box) {
                return;
            }
            const sections = [...box.querySelectorAll<HTMLElement>('.section')].map(
                (section) =>
                    section.getBoundingClientRect().top -
                    box.getBoundingClientRect().top +
                    box.scrollTop -
                    8,
            );
            // The next section's top, or one screen on when that is nearer: a page turn that
            // never skips bars, in a long section as much as between short ones. A section
            // within a row's height of the view's top is the one being read: the chart's own
            // padding puts the first one a few pixels down.
            const at = box.scrollTop;
            const near = 24;
            const page = box.clientHeight * 0.85;
            const down = event.key === 'PageDown';
            const section = down
                ? sections.find((top) => top > at + near)
                : sections.filter((top) => top < at - near).at(-1);
            const to = down
                ? Math.min(section ?? Infinity, at + page)
                : Math.max(section ?? -Infinity, at - page);
            const max = box.scrollHeight - box.clientHeight;
            if ((down && at >= max - 1) || (!down && at <= 0)) {
                return;
            }
            event.preventDefault();
            setFollowing(false);
            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            box.scrollTo({
                top: Math.max(0, Math.min(max, to)),
                behavior: reduce ? 'instant' : 'smooth',
            });
        }
    };
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => standKeys.current?.(event);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

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
                            // Uncontrolled on purpose (#1635): `search` is only ever written from
                            // this box, so nothing needs to push a value back into it. A controlled
                            // box is rewritten to the state it held by ANY commit that lands
                            // between the browser inserting text and React handling the `input`
                            // event — typing lost, no `onChange`, no results. `defaultValue` still
                            // restores the query when the box remounts on the way back home.
                            defaultValue={search}
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
                    <button
                        className="icon-button settings-btn"
                        aria-label="Settings"
                        aria-haspopup="dialog"
                        aria-expanded={settingsOpen}
                        onClick={() => setSettingsOpen(true)}
                    >
                        <span aria-hidden="true">{'⚙\uFE0E'}</span>
                    </button>
                    {accountsMounted && (
                        <AccountEntry
                            session={account.session}
                            unprotected={account.recoveryEnrolled === false}
                            onSignIn={() => setAccountDialog('signIn')}
                            onFinishProtecting={() => setAccountDialog('recovery')}
                            onOpenAccount={() => {
                                // The account page counts and exports the WHOLE account library
                                // (#1271), so it asks for it the moment it opens (#1441).
                                wantLibrary('account');
                                setAccountPageOpen(true);
                            }}
                        />
                    )}
                </div>
            </header>
            {error && !bandOpen && (
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
                <div
                    className="error-banner notice"
                    role="status"
                    data-testid="account-expired-banner"
                >
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
                        onClick={() => openSignOut('device')}
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
                <div
                    className="error-banner notice"
                    role="status"
                    data-testid="stand-mismatch-banner"
                >
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
                    onUseAccountVersion={offerAdoptRemote}
                />
            )}
            {volatileDrafts.current.size > 0 && (
                <div className="error-banner" role="status">
                    {volatileDrafts.current.size === 1
                        ? "1 draft couldn't be stored on this device. It's kept in this tab only — reopen it and save or export it before you close the tab."
                        : `${volatileDrafts.current.size} drafts couldn't be stored on this device. They're kept in this tab only — reopen them and save or export them before you close the tab.`}
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
                        checkPlayable(candidate.chart.score);
                        // No owner claim (#1311): a file off this device's disk is nobody's chart
                        // until it is committed, so it belongs to whichever account is live —
                        // never to whoever happens to be on the stand behind this dialog.
                        const result = await storeSave(
                            { ...candidate, id: crypto.randomUUID() },
                            null,
                            { owner: null, stand: false },
                        );
                        await refreshSongs();
                        await open(result);
                        setMessage('Imported and saved');
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
                        checkPlayable(checked.chart.score);
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
                        setMessage('Imported and saved');
                        // Both `irealbook`/`irealb` decode the same iReal Pro format; the
                        // telemetry vocabulary tracks the format, not the decoder variant.
                        track('chart_imported', {
                            format: checked.importSource?.format?.startsWith('ireal')
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
                    // The account rows the full read stepped over (#1769), said beside the list.
                    unreadable={signedIn ? accountUnreadable : 0}
                    onExportUnreadable={signedIn ? exportUnreadableSongs : undefined}
                    onRemoveUnreadable={signedIn ? requestRemoveUnreadable : undefined}
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
                    onRemoveGone={requestPurgeGone}
                />
            ) : !current ? (
                <Songbook
                    // What the home shows and nothing more (#1441): the home slice, never the whole
                    // library — `library` is only for search, and only once it has been asked for.
                    home={songbookLoading ? null : liveHome}
                    // The full read's count once one is held (#1782), so the home's notice never
                    // says less than All songs'; the guest full read refuses instead.
                    libraryUnreadable={signedIn && accountSongs !== null ? accountUnreadable : null}
                    onExportUnreadable={signedIn ? exportUnreadableSongs : undefined}
                    onRemoveUnreadable={signedIn ? requestRemoveUnreadable : undefined}
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
                    // Not mid-song: the press reloads this tab whatever it is doing.
                    offlineUpdate={
                        offline.update === 'none' || playbackActive ? null : offline.applyUpdate
                    }
                    accountLibrary={signedIn}
                    loading={songbookLoading}
                    // #1357 patch P1-4 — the first session read was released by its deadline
                    // rather than answered, so this list is a fallback and says so.
                    accountFallback={account.fellBack}
                    // #1310, widened #1362 — only the account library can have one waiting; signed
                    // out the loop publishes none at all, so this is the same empty list either way.
                    remoteCandidates={remoteCandidateRows}
                    search={search}
                    onImport={() => setImporting(true)}
                    onNewSong={newSong}
                    onOpenSong={openSong}
                    lastRemovedId={deletedRowId}
                />
            ) : (
                <main
                    className="workspace"
                    data-focused={focused}
                    // A bar's field is open on the chart. At phone width that is the dock on the
                    // keyboard (#1724), and the transport folds away so the chart keeps its rows
                    // above it (`style.css`).
                    data-bar-open={openBar ? '' : undefined}
                >
                    <SongHeader
                        current={current}
                        busy={busy}
                        dirty={dirty}
                        hasPendingText={hasPendingText}
                        sharedDraft={sharedDraft}
                        standardDraft={standardDraft}
                        newSongDraft={newSongDraft}
                        practiceOnly={practiceOnly}
                        recoveryHealthy={recoveryHealthy}
                        totalBars={totalBars}
                        stage={stage}
                        playbackActive={playbackActive}
                        focused={focused}
                        editing={editing}
                        neck={neck}
                        onHome={goHome}
                        onToggleTheme={toggleTheme}
                        onOpenSettings={() => setSettingsOpen(true)}
                        settingsOpen={settingsOpen}
                        onToggleControls={() => setShowControls(!showControls)}
                        onShowChart={() => showStand('chart')}
                        onShowNeck={() => showStand('neck')}
                        onEditChart={editChart}
                        onTitle={(title) => draft({ ...current, title })}
                        onSave={() =>
                            void run(async () => {
                                // Refs, not this render's state: a Save pressed while a new song
                                // was being kept waited for it (`run`) and must see it kept.
                                if (newSongNow.current) {
                                    await keepNewSong(updateChart(), true);
                                    setMessage('Saved on this device');
                                } else if (sharedDraftNow.current) {
                                    await keepSharedCopy();
                                } else {
                                    await save();
                                }
                            })
                        }
                        menuButtonRef={songMenuTrigger}
                        onMenu={toggleSongMenu}
                    />
                    <TransportBar
                        current={current}
                        busy={busy}
                        playbackActive={playbackActive}
                        countInBeat={countInBeat}
                        onPlayToggle={togglePlayback}
                        onBand={() => openBand(lastBandTab.current)}
                        bandTab={bandTab}
                        onTempo={(value) => change(() => runtime.setTempo(value))}
                        keyOpen={keyOpen}
                        onKeyToggle={() => setKeyOpen((open) => !open)}
                        onKeyClose={() => setKeyOpen(false)}
                        onKey={(key) =>
                            change(
                                () => runtime.transpose(keyDistance(current.chart.score.key, key)),
                                true,
                            )
                        }
                        onMode={(isMinor) => change(() => runtime.setMode(isMinor), true)}
                        onMeter={changeSongMeter}
                        onNotation={(notation) => change(() => runtime.setNotation(notation), true)}
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
                        onToggleLane={toggleLane}
                        onTrade={() => openBand('trade')}
                        tradeBlocked={runtime.tradeBlocked()}
                    />
                    <BandSheet
                        dialogRef={bandDialog}
                        tab={bandTab ?? lastBandTab.current}
                        onTab={openBand}
                        onClose={() => setBandTab(null)}
                        error={bandOpen ? error : ''}
                        players={
                            <PlayersTab
                                current={current}
                                busy={busy}
                                soundProgress={soundProgress}
                                soundsOffline={soundsOffline}
                                allSoundsOffline={allSoundsOffline}
                                pendingSound={pendingSound}
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
                                onVolume={(lane, value) =>
                                    change(() => runtime.setVolume(lane, value))
                                }
                                onReverb={(lane, value) =>
                                    change(() => runtime.setReverb(lane, value))
                                }
                                onToggleLane={toggleLane}
                            />
                        }
                        groove={
                            <GrooveTab
                                current={current}
                                busy={busy}
                                feel={feel}
                                onSwing={(value) => change(() => runtime.setSwing(value))}
                                onSwingSub={(sub) => change(() => runtime.setSwingSub(sub))}
                                onHumanize={(value) => change(() => runtime.setHumanize(value))}
                                onBandIntensity={(value) =>
                                    change(() => {
                                        runtime.setBandIntensity(value);
                                        setFeel((f) => ({ ...f, bandIntensity: value }));
                                    })
                                }
                                onAutoIntensity={(auto) =>
                                    change(() => runtime.setAutoIntensity(auto))
                                }
                            />
                        }
                        trade={
                            <TradeTab
                                current={current}
                                busy={busy}
                                partners={runtime.tradePartners()}
                                blocked={runtime.tradeBlocked()}
                                onChange={(tradeWith, bars, choruses) =>
                                    change(() => runtime.setTrade(tradeWith, bars, choruses))
                                }
                            />
                        }
                        practice={
                            <PracticeTab
                                busy={busy}
                                feel={feel}
                                chartChoruses={current.chart.score.choruses}
                                songReadout={songReadout}
                                onSongMinutes={(minutes) => {
                                    // A device preference, not a chart change: no draft.
                                    runtime.setSongMode(minutes);
                                    setFeel((f) => ({ ...f, songMinutes: minutes }));
                                }}
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
                            />
                        }
                    />
                    <div className={`workspace-body ${editing ? 'editing' : ''}`}>
                        {neckShowing ? (
                            <Suspense fallback={null}>
                                <NeckStand
                                    band={followChart}
                                    stored={neckPrefs.prefs}
                                    onPrefs={neckPrefs.setPrefs}
                                    active={active}
                                    changeSoon={changeSoon}
                                    playing={playbackActive}
                                    onStrum={(midis) => runtime.auditionPitches(midis)}
                                />
                            </Suspense>
                        ) : (
                            <>
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
                                        selectedMeasureId={editing ? measureId : null}
                                        busy={busy}
                                        playing={playing}
                                        playbackActive={playbackActive}
                                        totalBars={totalBars}
                                        onStartHere={(id) => startHereSection(id)}
                                        barEdit={barEditing()}
                                        sectionEdit={sectionEditing()}
                                        onAudition={(index) => runtime.audition(index)}
                                        onChoruses={changeChoruses}
                                    />
                                </div>
                                <FormStrip
                                    blocks={blocks}
                                    displayActive={displayActive}
                                    scroll={scroll}
                                    onNavigate={() => setFollowing(false)}
                                />
                            </>
                        )}
                        {barForm && (
                            <GuidedForm
                                score={barForm.score}
                                selectedMeasureId={barForm.measureId}
                                markers={barMarkers(barForm.measureId)}
                                blocked={barForm.blocked}
                                onGuide={() => {
                                    // The pending bars read again, markers and all.
                                    if (!openBarForm(barForm.measureId)) {
                                        setBarForm(null);
                                    }
                                }}
                                onClose={() => setBarForm(null)}
                                onApply={applyForm}
                            />
                        )}
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
                         * A delete's Undo (#1758): the toast's look, its own element so no other
                         * message (a draft kept, a sound loading) can push it out while it holds.
                         * Always mounted, as the toast is, so its text change is announced. Undo
                         * keeps focus where it was on the way down: a bar's field stays open, and
                         * on a phone its dock stays up rather than fold away under the tap.
                         */}
                        <div
                            className="stand-toast stand-undo"
                            role="status"
                            data-testid="stand-undo"
                            data-empty={!undoLive}
                            // A real mouse only: an iOS tap on the text sends pointer events
                            // too, and must not hold the offer open for good.
                            onPointerEnter={(event) =>
                                event.pointerType === 'mouse' && setUndoHeld(true)
                            }
                            onPointerLeave={(event) =>
                                event.pointerType === 'mouse' && setUndoHeld(false)
                            }
                            onFocus={() => setUndoHeld(true)}
                            onBlur={() => setUndoHeld(false)}
                        >
                            {undoLive && deleteUndo && (
                                <>
                                    <span>{deleteUndo.text}</span>
                                    <button
                                        type="button"
                                        className="toast-action"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={undoDelete}
                                    >
                                        Undo
                                    </button>
                                </>
                            )}
                        </div>
                        {/*
                         * Review P2 #1 — hidden while Song actions is open: it renders the SAME
                         * fact in its own "Status" section (`sync-failure`), and both are
                         * `role="status"` live regions, so leaving this one mounted too would
                         * announce the one change twice.
                         */}
                        {standSyncFailureVisible && standSyncFailure && songMenu !== 'actions' && (
                            <div
                                className="stand-sync-failure"
                                role="status"
                                data-testid="stand-sync-failure"
                            >
                                <span>{standSyncFailure.text}</span>
                                <button
                                    className="toast-close"
                                    aria-label="Dismiss"
                                    onClick={dismissSyncFailure}
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
                         * in `useFollowScroll` that resets its row/jump memory the instant
                         * `following` turns true runs before the look-ahead scroll effect that
                         * reads it, in the same pass. Focus moves to the chart itself on
                         * activation (review P3) since this button unmounts the instant it fires
                         * — `preventScroll` because the look-ahead scroll (`useFollowScroll`) is
                         * already doing the ONE deliberate scroll this tap causes, and
                         * `.chart-scroll`'s own `:focus-visible`-only outline (not plain
                         * `:focus`) is what keeps a pointer tap from drawing a visible ring
                         * around the whole chart.
                         */}
                        {playbackActive && !following && !neckShowing && (
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
                view={songMenu}
                anchor={() =>
                    songMenuTrigger.current?.isConnected ? songMenuTrigger.current : null
                }
                current={current}
                saved={saved}
                busy={busy}
                dirty={dirty}
                canDelete={standDeletable}
                recoveryOptions={recoveryOptions}
                syncStatus={syncStatus}
                shareLinkFallback={shareLinkFallback}
                onView={setSongMenu}
                onShare={() => void run(shareChartLink)}
                onDuplicate={() => void run(() => save(true))}
                onExport={() => setExportOpen(true)}
                onDelete={requestDeleteStand}
                onCloseShareLink={() => setShareLinkFallback(null)}
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
                    })
                }
                onOpenRecovery={(record) =>
                    void run(async () => {
                        updateChart();
                        // The STAND's owner (#1311): a preserved draft is this chart's own
                        // earlier text, so the copy it becomes carries the same account as the
                        // song it was a draft of.
                        const copy = await storeSave(
                            {
                                ...record.document,
                                id: crypto.randomUUID(),
                                title: `${record.document.title.slice(0, 140)} — recovered`,
                            },
                            null,
                            { owner: standOwner(), stand: false },
                        );
                        await refreshSongs();
                        await open(copy);
                        // The stand moves onto the copy; say so, or the musician goes on editing
                        // what they think is the song they had open (#1700).
                        setMessage(`Opened “${copy.title}” · the song you had open is unchanged`);
                        closeSongMenus();
                    })
                }
            />
            <SettingsSheet
                dialogRef={settingsDialog}
                theme={theme}
                onTheme={chooseTheme}
                palette={palette}
                onPalette={choosePalette}
                onClose={() => setSettingsOpen(false)}
            />
            {current && (
                <ExportDialog
                    dialogRef={exportDialogRef}
                    title={current.title}
                    busy={busy}
                    hasSource={!!current.importSource}
                    exportingAudio={exportingAudio}
                    exportAudioProgress={exportAudioProgress}
                    onExport={exportAs}
                    onCancelAudio={() => runtime.cancelExportAudio()}
                    onClose={() => setExportOpen(false)}
                />
            )}
            {accountsMounted && (
                <SignInDialog
                    dialogRef={accountDialogRef}
                    mode={accountDialog ?? 'signIn'}
                    open={accountDialog !== null}
                    onClose={() => setAccountDialog(null)}
                    onAccountChanged={account.refresh}
                />
            )}
            {accountsMounted && (
                <AccountPage
                    dialogRef={accountPageDialogRef}
                    open={accountPageOpen}
                    onClose={() => setAccountPageOpen(false)}
                    onAccountChanged={account.refresh}
                    online={account.online}
                    // The full list's length once read (with the rows it could not hand back, which
                    // the export writes too), else the store's own `count()` from the home slice
                    // (#1441) — both are whole-library facts, neither a partial read.
                    accountSongCount={
                        accountSongs !== null
                            ? accountSongs.length + accountUnreadable
                            : accountHome !== null && accountHome.owner === sessionOwner
                              ? accountHome.slice.count
                              : null
                    }
                    accountUnreadableCount={accountSongs !== null ? accountUnreadable : 0}
                    onExportAccountSongs={exportAccountSongs}
                    // NOT `run(forgetDeletedAccount)` — see `useAccountExit`'s `onAccountDeleted`.
                    onAccountDeleted={onAccountDeleted}
                    onOpenAdopt={() => {
                        setAccountPageOpen(false);
                        setAdoptOpen(true);
                    }}
                    // Same P0 gate as the auto-prompt above: until this device has downloaded the
                    // account library once, "which songs are missing?" has no honest answer here.
                    adoptReady={libraryDownloaded(sync.documents)}
                    signingOut={account.signingOut}
                    // Sign out lives on the account page (#1760). The page closes first, as it does
                    // for the adoption offer, so the preflight is never a modal over a modal.
                    onSignOut={() => {
                        setAccountPageOpen(false);
                        openSignOut('session');
                    }}
                />
            )}
            {signedIn && (
                <AdoptGuestDialog
                    dialogRef={adoptDialogRef}
                    open={adoptOpen}
                    ownerId={sync.owner}
                    online={account.online}
                    onClose={() => {
                        setAdoptOpen(false);
                    }}
                />
            )}
            {(signedIn || heldWithoutSession) && (
                <SignOutDialog
                    dialogRef={signOutDialogRef}
                    mode={signOutStep ?? 'session'}
                    online={account.online}
                    busy={busy || account.signingOut}
                    preflight={signOutPlan}
                    // Each step shows only its OWN sentence (#1351 patch R9).
                    failure={signOutFailure}
                    // The library this step read with its plan, not the songbook's (#1351): an
                    // expired session has no `accountSongs` at all, and the export has to write
                    // exactly the songs the preflight just warned about.
                    songsReady={signOutSongs !== null}
                    onExport={exportSignOutSongs}
                    onSyncNow={syncBeforeSignOut}
                    onConfirm={signOutOfAccount}
                    onClose={closeSignOut}
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
                    onClose={closeAdoptRemote}
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
                    onClose={closeDeleteConfirm}
                />
            )}
            <SongRowMenu
                song={rowMenuFor}
                opening={rowMenuOpening}
                anchor={() => (rowMenuTrigger.current?.isConnected ? rowMenuTrigger.current : null)}
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
                    onClose={closeGuestDelete}
                />
            )}
            {purgeTarget && (
                <PurgeSongsDialog
                    dialogRef={purgeDialogRef}
                    title={purgeTarget.title}
                    count={purgeTarget.ids.length}
                    unconfirmed={!!purgeTarget.unconfirmed}
                    busy={busy}
                    onExport={purgeTarget.title === null ? null : exportPurgeTarget}
                    onConfirm={purgeConfirmed}
                    onClose={closePurge}
                />
            )}
            {unreadableRemoval && (
                <RemoveUnreadableDialog
                    dialogRef={unreadableRemovalRef}
                    count={unreadableRemoval.ids.length}
                    kept={unreadableRemoval.kept}
                    busy={busy}
                    onExport={exportUnreadableSongs}
                    onConfirm={removeUnreadableConfirmed}
                    onClose={closeUnreadableRemoval}
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
