'use client';

import { KEY_ORDER } from '@engine/config';
import { decodeChartLink, encodeChartLink } from '@engine/songbook/chart-link';
import { prepareScorePlayback } from '@engine/songbook/score-playback';
import type { SemanticScore } from '@engine/songbook/score-types';
import type { InstrumentVoice } from '@engine/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    computeAdoptCandidates,
    hasDecidedAdoption,
    libraryDownloaded,
} from '../lib/account/adopt-guest';
import {
    AccountMismatchError,
    accountSync,
    belongsToAnotherAccount,
    type CloudDeleteResult,
    OWNER_MESSAGES,
    type SignOutPreflight,
} from '../lib/account/sync-loop';
import { arrangementOf, blankSong, convertedCopy, extendedScore } from '../lib/documents';
import { validateEditorText } from '../lib/editor';
import * as repository from '../lib/repository';
import type { ChartDocument } from '../lib/runtime';
import * as runtime from '../lib/runtime';
import { lastOpenedSong, rememberSong } from '../lib/session';
import { allSoundsAvailableOffline, installAllSounds, soundsAvailableOffline } from '../lib/sounds';
import { start } from '../lib/starters';
import type { SavedSong } from '../lib/sync/protocol';
import type { KeepBothResolution } from '../lib/sync/repository';
import type { Progress } from '../lib/sync/status';
import { AccountEntry } from './account/account-entry';
import { AccountPage } from './account/account-page';
import { AdoptGuestDialog } from './account/adopt-guest';
import { ConflictBanner } from './account/conflict';
import { DeleteSongDialog } from './account/delete-song';
import { SyncStatus, useAccountLibrary } from './account/library';
import { type AccountDialogMode, SignInDialog } from './account/sign-in';
import { SignOutDialog } from './account/sign-out';
import { useAccountSession, useAccountsEnabled } from './account/use-account-session';
import { ChartSheet } from './chart-sheet';
import { EditPanel } from './edit-panel';
import { FeelSheet, type FeelSnapshot } from './feel-sheet';
import { ImportDialog } from './import-dialog';
import type { MeasureEditorHandle } from './measure-editor';
import { SongHeader } from './song-header';
import { SongMenu } from './song-menu';
import { Songbook } from './songbook';
import { SoundsPanel } from './sounds-panel';
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
 * The sign-out step's two reads, in the order the step needs them (#1299).
 *
 * The retained drafts are fetched HERE, with the plan, rather than when Export is pressed: that
 * button writes one file per at-risk song inside a single user gesture, and an await between two
 * downloads is how a browser's per-gesture cap starts dropping them. Module-level so the effect
 * that calls it does not take a new function reference as a hook dependency every render.
 */
async function readSignOutPlan(
    volatile: Map<string, ChartDocument>,
): Promise<{ plan: SignOutPreflight; drafts: Map<string, ChartDocument> }> {
    const plan = await accountSync.signOutPreflight();
    return {
        plan: withLocalDrafts(plan, volatile),
        drafts: await accountSync.retainedDrafts(plan.atRisk),
    };
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
    // Accounts are dark-launched (#1262): every merge publishes this app to the public `/v2/`
    // beta, so the entry point, the dialog and every `/api/*` request stay behind a per-device
    // opt-in (`/v2/?accounts=on`) until the account work is finished. `ready` gates the session
    // read so it lands after the songbook is up; nothing here is ever awaited by startup.
    const accountsOn = useAccountsEnabled();
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
    // #1269 — the sign-out preflight, and what it found. `null` while the read is still out: the
    // step says "checking" rather than "nothing at stake", which would be a claim.
    const [signOutOpen, setSignOutOpen] = useState(false);
    const [signOutPlan, setSignOutPlan] = useState<SignOutPreflight | null>(null);
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
    // #1266 — signed in, the songbook IS the account library. `current?.id` is the chart on the
    // stand: the loop hands it to the download's `isActive` so a remote update can never be
    // swapped in underneath whoever is playing.
    const signedIn = accountsOn && account.session.status === 'signedIn';
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
    const dialog = useRef<HTMLDialogElement>(null);
    const accountDialogRef = useRef<HTMLDialogElement>(null);
    const accountPageDialogRef = useRef<HTMLDialogElement>(null);
    const deleteDialogRef = useRef<HTMLDialogElement>(null);
    const signOutDialogRef = useRef<HTMLDialogElement>(null);
    const adoptDialogRef = useRef<HTMLDialogElement>(null);
    const soundsDialog = useRef<HTMLDialogElement>(null);
    const feelDialog = useRef<HTMLDialogElement>(null);
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
        // before `runtime.load` is safe to call. `sharedLinkHandled` guards against
        // re-processing on every `ready`-dependent re-render, not just the first.
        if (!ready || sharedLinkHandled.current || !window.location.hash) {
            return;
        }
        sharedLinkHandled.current = true;
        const hash = window.location.hash;
        let alive = true;
        void decodeChartLink(hash).then((document) => {
            // Consumed on load either way: a corrupt/foreign fragment must not
            // resurrect on reload, and a successfully opened draft must not
            // resurrect after "Keep a copy" replaces it with a saved document.
            window.history.replaceState(
                null,
                '',
                window.location.pathname + window.location.search,
            );
            if (!alive) {
                return;
            }
            if (document) {
                // Inlined rather than a separate `openSharedDraft` helper: this is
                // its only call site, and keeping it inline avoids a
                // useExhaustiveDependencies conflict (a plain function declaration
                // is a new reference every render — biome rightly rejects it as a
                // hook dependency, and this effect must only run once anyway,
                // guarded by `sharedLinkHandled`). Deliberately not `open()`: no
                // `saved` baseline (so it can't masquerade as already committed),
                // no recovery-storage write (the sender's document id is untrusted
                // and shouldn't collide with this device's own recovery keys), and
                // `lastOpened`/`rememberSong` are left alone since this isn't a
                // library entry yet. "Keep a copy" (`keepSharedCopy`) is what turns
                // it into one.
                runtime.load(document);
                setSaved(null);
                setCurrent(document);
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
                setMessage('Opened from a shared link · not saved yet');
                const section = arrangementOf(document).sections[0];
                setSectionId(section.id);
                if (document.schemaVersion === 2) {
                    setMeasureId(
                        document.chart.score.sections.find((s) => s.id === section.id)!.measures[0]
                            .id,
                    );
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
            .listLibrary()
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
    // #1269 — the sign-out preflight. `signedIn` is a dependency, not just a guard: a session that
    // expires underneath this step makes its own question moot (there is no session left to
    // revoke), and a flag left true would spring the step open again on the next sign-in.
    useEffect(() => {
        if (!signedIn) {
            setSignOutOpen(false);
            return;
        }
        if (!signOutOpen) {
            signOutDialogRef.current?.close();
            return;
        }
        signOutDialogRef.current?.showModal();
    }, [signOutOpen, signedIn]);
    // The preflight read is its own effect, keyed on `sync.owner` rather than `signedIn`: the loop
    // publishes an owner only once it actually has a scope, so this cannot race the attach and be
    // left permanently on "checking" for a step opened the moment after signing in. Re-read on
    // every open rather than cached — a Save queued since the last time is the work it names.
    useEffect(() => {
        if (!signOutOpen || sync.owner === null) {
            return;
        }
        let alive = true;
        readSignOutPlan(volatileDrafts.current)
            .then(({ plan, drafts }) => {
                if (alive) {
                    // Folded in, never assigned over (#1299 patch review P3): this read covers
                    // only the ids it asked about, and replacing the map would drop what this tab
                    // knows about every other song — including the chart it has open.
                    for (const [id, held] of drafts) {
                        accountDrafts.current.set(id, held);
                    }
                    setSignOutPlan(plan);
                }
            })
            .catch(() => {
                // An unreadable store is not evidence that nothing is at stake, so the step stays
                // on "checking" — which leaves the destructive button disabled.
            });
        return () => {
            alive = false;
        };
    }, [signOutOpen, sync.owner]);
    useEffect(() => {
        if (adoptOpen) {
            adoptDialogRef.current?.showModal();
        } else {
            adoptDialogRef.current?.close();
        }
    }, [adoptOpen]);
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
     */
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
    }, [sync.owner, sync.documents, accountDialog]);
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
     * (`retentionScope`), and rejects only when the device is genuinely signed out — which leaves
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
     * else (#1311). The loop refuses that write anyway (`retentionScope`), and the fallback below
     * would catch it — but the fallback's sentence would be a storage failure's, and nothing has
     * failed here: this is a refusal with a reason, said in its own words and without a pointless
     * round trip to a store that is going to say no. The text stays in memory, which is where the
     * banner and `exportSong` can still reach it.
     */
    function draft(next: ChartDocument) {
        setCurrent(next);
        if (saved && same(next, saved)) {
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
        setSaved(document);
        setCurrent(next);
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
        // for, and carrying its sentence into the next chart's banner would explain nothing.
        setKeepBothFailure(null);
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
            const documents = libraryDocuments(await accountSync.listLibrary());
            setAccountSongs(documents);
            return documents;
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
            setSaved(resolution.document);
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
        void run(async () => {
            runtime.stop();
            if ((await account.signOut()) === 'kept') {
                return;
            }
            setSignOutOpen(false);
            setSignOutPlan(null);
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
            // Read directly rather than through `refreshSongs`: `signedIn` is still true in this
            // closure's render, and that path would ask a loop that no longer has an account.
            setGuestSongs(await repository.list());
            // Read live rather than from the `sync` snapshot this render closed over: the loop
            // publishes this during the await above. A wipe that failed after a confirmed
            // revocation is still a sign-out — but the songs really are still here, so the
            // cheerful sentence would be a lie and the reason has to reach the musician.
            const failure = accountSync.getSnapshot().failure;
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
        runtime.stop();
        await account.forgetDeletedAccount();
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
        setGuestSongs(await repository.list());
        // Read live rather than from the `sync` snapshot this render closed over, exactly as
        // `signOutOfAccount` does: a wipe that failed after the account was already deleted is
        // still a deletion, but the songs really are still here and the reason has to be said.
        const failure = accountSync.getSnapshot().failure;
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
    function upgradeEditor() {
        void run(async () => {
            const original = updateChart();
            if (original.schemaVersion !== 1) {
                return;
            }
            const converted = convertedCopy(original);
            // Capability preflight before creating a copy or changing the active song.
            prepareScorePlayback(converted.chart.score);
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
        accountsOn && current && (signedIn || account.session.status === 'expired') ? (
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
                                setSignOutOpen(true);
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
            {accountsOn && account.session.status === 'expired' && (
                <div className="error-banner" role="status" data-testid="account-expired-banner">
                    <span>
                        Sign in again to keep syncing. Everything you saved is still on this device.
                    </span>
                    <button onClick={() => setAccountDialog('signIn')}>Sign in again</button>
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
            {conflict !== 'none' && (
                <ConflictBanner
                    conflict={conflict}
                    busy={busy}
                    failure={keepBothFailure}
                    onKeepBoth={keepBothVersions}
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
                            prepareScorePlayback(candidate.chart.score);
                        }
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
                            prepareScorePlayback(checked.chart.score);
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
                    search={search}
                    onSearch={setSearch}
                    onImport={() => setImporting(true)}
                    onNewSong={newSong}
                    onOpenSong={openSong}
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
                onRevert={() =>
                    void run(() => {
                        if (!saved) {
                            return;
                        }
                        runtime.load(saved);
                        draft(saved);
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
                                ...record.document,
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
                    onClose={() => setAdoptOpen(false)}
                />
            )}
            {accountsOn && signedIn && (
                <SignOutDialog
                    dialogRef={signOutDialogRef}
                    online={account.online}
                    busy={busy || account.signingOut}
                    preflight={signOutPlan}
                    failure={
                        account.signOutFailure !== null &&
                        account.signOutFailure.kind !== 'cancelled'
                            ? account.signOutFailure.message
                            : null
                    }
                    songsReady={accountSongs !== null}
                    onExport={() =>
                        void run(() => {
                            // Only the songs holding work the account has not got. The rest of the
                            // library is already in the cloud and comes back on the next sign-in,
                            // so writing it out too would bury the files that matter.
                            for (const id of signOutPlan?.atRisk ?? []) {
                                const song = accountSongs?.find((held) => held.id === id);
                                if (!song) {
                                    continue;
                                }
                                // The EDITED bytes, not the committed ones — same precedence as
                                // `open()`, shared with #1271's export-everything offer.
                                exportDocument(latestLocalVersion(song));
                            }
                        })
                    }
                    onSyncNow={() =>
                        void run(async () => {
                            await accountSync.run();
                            const { plan, drafts } = await readSignOutPlan(volatileDrafts.current);
                            // Folded in, for the reason the sign-out read states.
                            for (const [id, held] of drafts) {
                                accountDrafts.current.set(id, held);
                            }
                            setSignOutPlan(plan);
                        })
                    }
                    onConfirm={signOutOfAccount}
                    onClose={() => setSignOutOpen(false)}
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
