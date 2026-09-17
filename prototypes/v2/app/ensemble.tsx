'use client';

import { KEY_ORDER } from '@engine/config';
import { decodeChartLink, encodeChartLink } from '@engine/songbook/chart-link';
import { prepareScorePlayback } from '@engine/songbook/score-playback';
import type { SemanticScore } from '@engine/songbook/score-types';
import type { InstrumentVoice } from '@engine/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { arrangementOf, blankSong, convertedCopy, extendedScore } from '../lib/documents';
import { validateEditorText } from '../lib/editor';
import * as repository from '../lib/repository';
import type { ChartDocument } from '../lib/runtime';
import * as runtime from '../lib/runtime';
import { lastOpenedSong, rememberSong } from '../lib/session';
import { allSoundsAvailableOffline, installAllSounds, soundsAvailableOffline } from '../lib/sounds';
import { start } from '../lib/starters';
import { ChartSheet } from './chart-sheet';
import { EditPanel } from './edit-panel';
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

export default function Ensemble() {
    const [songs, setSongs] = useState<ChartDocument[]>([]);
    const [current, setCurrent] = useState<ChartDocument | null>(null);
    const [saved, setSaved] = useState<ChartDocument | null>(null);
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const volatileDrafts = useRef(new Map<string, ChartDocument>());
    const [recoveryHealthy, setRecoveryHealthy] = useState(true);
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
    const [showControls, setShowControls] = useState(false);
    const [pendingSound, setPendingSound] = useState<{ lane: string; value: string } | null>(null);
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
    const dialog = useRef<HTMLDialogElement>(null);
    const soundsDialog = useRef<HTMLDialogElement>(null);
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
                    setSongs(result);
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
    function draft(next: ChartDocument) {
        setCurrent(next);
        try {
            repository.recover(next);
            volatileDrafts.current.delete(next.id);
            setRecoveryHealthy(true);
            setMessage('Draft recovered on this device');
        } catch (e) {
            volatileDrafts.current.set(next.id, next);
            setRecoveryHealthy(false);
            setError(
                `Draft is only in this tab: ${e instanceof Error ? e.message : String(e)}. Export before closing.`,
            );
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
    async function open(document: ChartDocument) {
        const recovery = repository.recoveryFor(document);
        const next = volatileDrafts.current.get(document.id) || recovery?.document || document;
        runtime.load(next);
        setSaved(document);
        setCurrent(next);
        setSharedDraft(false);
        clearBuffers();
        rememberSong(next.id);
        setLastOpened(next.id);
        setRecoveryHealthy(!volatileDrafts.current.has(document.id));
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
        const created = await repository.save(copy, null);
        setSongs(await repository.list());
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
    function openSong(id: string) {
        void run(async () => {
            const fresh = await repository.list();
            setSongs(fresh);
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
        // A recovered stale draft must not borrow the newer saved revision.
        const result = await repository.save(next, copy ? null : current.revision);
        setSaved(result);
        setCurrent(result);
        rememberSong(result.id);
        setLastOpened(result.id);
        volatileDrafts.current.delete(current.id);
        setRecoveryHealthy(true);
        try {
            repository.clearOwnRecovery(current.id);
        } catch {
            /* The committed save is authoritative; retained recovery is harmless. */
        }
        setSongs(await repository.list());
        setMessage('Saved on this device');
        setMenu(false);
    }
    function newSong() {
        void run(async () => {
            const base = songs[0];
            if (!base) {
                throw new Error('Starter library is not ready.');
            }
            const document = repository.validated(blankSong(base));
            const created = await repository.save(document, null);
            setSongs(await repository.list());
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
            const created = await repository.save(converted, null);
            setSongs(await repository.list());
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
    function exportSong() {
        if (!current) {
            return;
        }
        const candidate = updateChart();
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(repository.validated(candidate), null, 2)], {
                type: 'application/json',
            }),
        );
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${current.title.replace(/[^\p{L}\p{N} -]/gu, '').slice(0, 80) || 'chart'}.ensemble`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
        try {
            return (
                volatileDrafts.current.get(featuredSave.id) ||
                repository.recoveryFor(featuredSave)?.document ||
                featuredSave
            );
        } catch {
            return volatileDrafts.current.get(featuredSave.id) || featuredSave;
        }
    }, [featuredSave, current]);

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
                            }}
                        >
                            My songbook
                        </button>
                    </nav>
                </div>
                <div className="header-right">
                    <span className="local-status">{offline}</span>
                    <span className="concept-tag">Music stand · beta</span>
                </div>
            </header>
            {error && !soundMenu && (
                <div className="error-banner" role="alert">
                    <span>{error}</span>
                    <button onClick={() => setError('')}>Dismiss</button>
                </div>
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
                        const result = await repository.save(
                            { ...candidate, id: crypto.randomUUID() },
                            null,
                        );
                        setSongs(await repository.list());
                        await open(result);
                    });
                }}
            />
            {importing && (current || songs[0]) && (
                <ImportDialog
                    base={current ?? songs[0]}
                    onClose={() => setImporting(false)}
                    onAdd={async (candidate) => {
                        const checked = repository.validated(candidate);
                        if (checked.schemaVersion === 2) {
                            prepareScorePlayback(checked.chart.score);
                        }
                        if (current) {
                            updateChart();
                        }
                        const result = await repository.save(
                            { ...checked, id: crypto.randomUUID() },
                            null,
                        );
                        setSongs(await repository.list());
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
                    songs={songs}
                    featured={featured}
                    continued={!!continuedSave}
                    busy={busy}
                    offline={offline}
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
                            void run(() => {
                                setRecoveryOptions(repository.recoveriesFor(current));
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
                        <span className="footer-tip">{offline}</span>
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
                onClose={() => setMenu(false)}
                onShare={() => void run(shareChartLink)}
                onSaveCopy={() => void run(() => save(true))}
                onExport={() => void run(exportSong)}
                onExportMidi={() => void run(exportMidiFile)}
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
                onOpenRecovery={(record) =>
                    void run(async () => {
                        updateChart();
                        const copy = await repository.save(
                            {
                                ...record.document,
                                id: crypto.randomUUID(),
                                title: `${record.document.title.slice(0, 140)} — recovered`,
                            },
                            null,
                        );
                        setSongs(await repository.list());
                        await open(copy);
                        setMenu(false);
                    })
                }
            />
        </div>
    );
}
