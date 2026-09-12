'use client';

import { KEY_ORDER, TIME_SIGNATURES } from '@engine/config';
import { buildLeadSheetSections } from '@engine/song/lead-sheet-model';
import { resolveScoreContext } from '@engine/songbook/score-context';
import { scoreMeter } from '@engine/songbook/score-duration';
import { prepareScorePlayback } from '@engine/songbook/score-playback';
import type { SemanticScore } from '@engine/songbook/score-types';
import type { InstrumentVoice } from '@engine/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { arrangementOf, convertedCopy } from '../lib/documents';
import { validateEditorText } from '../lib/editor';
import { scoreDisplayIndices, scoreLeadSheet } from '../lib/lead-sheet';
import * as repository from '../lib/repository';
import type { ChartDocument } from '../lib/runtime';
import * as runtime from '../lib/runtime';
import { directionLabel } from '../lib/score-labels';
import { lastOpenedSong, rememberSong } from '../lib/session';
import {
    allSoundsAvailableOffline,
    allSoundsSizeMB,
    installAllSounds,
    packsForInstrument,
    soundsAvailableOffline,
} from '../lib/sounds';
import { start } from '../lib/starters';
import { downloadImportSource, ImportDialog } from './import-dialog';
import { MeasureEditor, type MeasureEditorHandle } from './measure-editor';
import { TempoControl } from './tempo-control';

const lanes = [
    ['groove', 'Drums'],
    ['bass', 'Bass'],
    ['chords', 'Chords'],
    ['harmony', 'Harmony'],
    ['soloist', 'Soloist'],
] as const;
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
    const [following, setFollowing] = useState(true);
    const [offline, setOffline] = useState('Preparing offline access…');
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
    const dialog = useRef<HTMLDialogElement>(null);
    const soundsDialog = useRef<HTMLDialogElement>(null);
    const file = useRef<HTMLInputElement>(null);
    const scroll = useRef<HTMLDivElement>(null);
    const editor = useRef<HTMLTextAreaElement>(null);
    const editPanel = useRef<HTMLElement>(null);
    const hasPendingText = buffers.size > 0 || pendingMeasures;
    const text =
        buffers.get(sectionId) ??
        (current
            ? arrangementOf(current).sections.find((section) => section.id === sectionId)?.value
            : '') ??
        '';
    const dirty = hasPendingText || !!(current && saved && !same(current, saved));
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
        }, 60);
        const preventLoss = (event: BeforeUnloadEvent) => {
            if (volatileDrafts.current.size || pendingText.current) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', preventLoss);
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker
                .register('/v2/sw.js', { scope: '/v2/', updateViaCache: 'none' })
                .then(async (registration) => {
                    // navigator.serviceWorker.ready may resolve the old root app's
                    // worker. Only this registration earns the preview's ready label.
                    if (registration.active?.state !== 'activated') {
                        await new Promise<void>((resolve, reject) => {
                            const worker =
                                registration.installing ||
                                registration.waiting ||
                                registration.active;
                            if (!worker) {
                                reject(new Error('No preview worker'));
                                return;
                            }
                            const check = () => {
                                if (worker.state === 'activated') {
                                    worker.removeEventListener('statechange', check);
                                    resolve();
                                }
                                if (worker.state === 'redundant') {
                                    worker.removeEventListener('statechange', check);
                                    reject(new Error('Offline installation failed'));
                                }
                            };
                            worker.addEventListener('statechange', check);
                            check();
                        });
                    }
                    if (alive) {
                        setOffline(
                            registration.waiting
                                ? 'Update ready · close all preview tabs to install'
                                : 'App available offline',
                        );
                    }
                    registration.addEventListener('updatefound', () => {
                        registration.installing?.addEventListener('statechange', () => {
                            if (registration.waiting && alive) {
                                setOffline('Update ready · close all preview tabs to install');
                            }
                        });
                    });
                })
                .catch(() => {
                    if (alive) {
                        setOffline('Offline download unavailable · retry by reloading');
                    }
                });
        } else {
            setOffline('Offline installation unavailable in this browser');
        }
        return () => {
            alive = false;
            window.clearInterval(timer);
            window.removeEventListener('beforeunload', preventLoss);
        };
    }, []);
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
        // Genre preparation briefly pauses the engine, not the musician's intent.
        // Keep the stand stable and Stop usable until this operation settles.
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
            const document = repository.validated({
                schemaVersion: 2,
                id: crypto.randomUUID(),
                title: 'Untitled song',
                revision: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                chart: {
                    performance: base.chart.performance,
                    band: base.chart.band,
                    score: {
                        key: 'C',
                        isMinor: false,
                        notation: 'name',
                        meter: '4/4',
                        grouping: null,
                        sections: [
                            {
                                id: crypto.randomUUID(),
                                label: 'A',
                                repeat: 1,
                                measures: ['C', 'G', 'Am', 'F'].map((symbol) => ({
                                    id: crypto.randomUUID(),
                                    content: {
                                        kind: 'events',
                                        events: [{ kind: 'chord', symbol, duration: [4, 1] }],
                                    },
                                })),
                            },
                        ],
                    },
                },
            });
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
            const score = structuredClone(next.chart.score);
            const selectedSection =
                score.sections.find((s) => s.measures.some((m) => m.id === measureId)) ??
                score.sections[0];
            const section = newSection
                ? {
                      id: crypto.randomUUID(),
                      label: String.fromCharCode(65 + (score.sections.length % 26)),
                      repeat: 1,
                      measures: [],
                  }
                : selectedSection;
            if (newSection) {
                score.sections.push(section);
            }
            let context = resolveScoreContext(score, section);
            for (const measure of section.measures) {
                context = resolveScoreContext(context, measure);
            }
            const id = crypto.randomUUID();
            section.measures.push({
                id,
                content: {
                    kind: 'events',
                    events: [
                        {
                            kind: 'chord',
                            symbol: context.key + (context.isMinor ? 'm' : ''),
                            duration: scoreMeter(context.meter).length,
                        },
                    ],
                },
            });
            applyScore(score);
            setMeasureId(id);
            setSectionId(section.id);
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
    const blocks = useMemo(() => {
        if (!current) {
            return [];
        }
        const a = runtime.state().arranger;
        if (current.schemaVersion === 2) {
            const writtenCount = current.chart.score.sections.reduce(
                (n, section) => n + section.measures.length,
                0,
            );
            const visitedCount = new Set(a.progression.map((chord) => chord.measureId)).size;
            return scoreLeadSheet(
                a,
                current.chart.score,
                visitedCount < writtenCount ? runtime.writtenChart() : undefined,
            );
        }
        return buildLeadSheetSections(a.progression, a.sections, TIME_SIGNATURES[a.timeSignature]);
    }, [current]);
    const displayIndices = useMemo(
        () => (current?.schemaVersion === 2 ? scoreDisplayIndices(runtime.state().arranger) : []),
        [current],
    );
    const displayActive = active === null ? null : (displayIndices[active] ?? active);
    const activeEvent = active === null ? null : runtime.state().arranger.stepMap[active];
    const totalBars = blocks.reduce((n, b) => n + b.measures.length, 0);
    const writtenBars = useMemo(
        () =>
            new Map(
                current?.schemaVersion === 2
                    ? current.chart.score.sections.flatMap((section) =>
                          section.measures.map((bar) => [bar.id, bar] as const),
                      )
                    : [],
            ),
        [current],
    );
    const writtenSections = useMemo(
        () =>
            new Map(
                current?.schemaVersion === 2
                    ? current.chart.score.sections.map((section) => [section.id, section] as const)
                    : [],
            ),
        [current],
    );
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
    let barNumber = 0;

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
                    <span className="concept-tag">V2 · working preview</span>
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
                <main className="home">
                    <div className="home-intro">
                        <div>
                            <span className="eyebrow">Your next good session</span>
                            <h1>Let’s play something.</h1>
                            <p>A chart, a backing band, and a little room to explore.</p>
                        </div>
                        <div className="home-actions">
                            <button
                                className="btn"
                                disabled={busy}
                                onClick={() => setImporting(true)}
                            >
                                Import chart
                            </button>
                            <button className="btn primary" disabled={busy} onClick={newSong}>
                                ＋ New song
                            </button>
                        </div>
                    </div>
                    <div className="home-grid">
                        <div>
                            {featured && (
                                <section className="continue-card">
                                    <div className="continue-copy">
                                        <span className="eyebrow">
                                            {continuedSave
                                                ? 'Pick up where you left off'
                                                : 'A good place to start'}
                                        </span>
                                        <h3>{featured.title}</h3>
                                        <p>
                                            {featured.chart.band.groove.lastSmartGenre} ·{' '}
                                            {featured.chart.performance.bpm} BPM ·{' '}
                                            {arrangementOf(featured).key}
                                            {arrangementOf(featured).isMinor ? 'm' : ''}
                                        </p>
                                        <button
                                            className="btn"
                                            disabled={busy}
                                            onClick={() => openSong(featured.id)}
                                        >
                                            Open chart →
                                        </button>
                                    </div>
                                    <div className="continue-art" aria-hidden="true">
                                        <div className="mini-heading">
                                            A little room to improvise
                                        </div>
                                        <div className="mini-grid">
                                            {['C7', 'F7', 'C7', 'G7', 'F7', 'F7', 'C7', 'G7'].map(
                                                (c, i) => (
                                                    // biome-ignore lint/suspicious/noArrayIndexKey: Fixed decorative sample, never reordered.
                                                    <span key={i}>{c}</span>
                                                ),
                                            )}
                                        </div>
                                    </div>
                                </section>
                            )}
                            <div className="section-heading library-heading">
                                <h2>Your songbook</h2>
                                <label className="search">
                                    <span className="sr">Search songs</span>
                                    <input
                                        placeholder="Find a song…"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                    />
                                </label>
                            </div>
                            <table className="song-table">
                                <thead>
                                    <tr>
                                        <th>Song</th>
                                        <th>Key</th>
                                        <th className="hide-mobile">Tempo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {songs
                                        .filter((s) =>
                                            s.title.toLowerCase().includes(search.toLowerCase()),
                                        )
                                        .map((s) => (
                                            <tr className="song-row" key={s.id}>
                                                <td>
                                                    <button
                                                        className="song-link"
                                                        disabled={busy}
                                                        onClick={() => openSong(s.id)}
                                                    >
                                                        <span className="song-glyph">♪</span>
                                                        <span>
                                                            <span className="song-name">
                                                                {s.title}
                                                            </span>
                                                            <span className="song-detail">
                                                                {s.chart.band.groove.lastSmartGenre}{' '}
                                                                · Saved locally
                                                            </span>
                                                        </span>
                                                    </button>
                                                </td>
                                                <td className="song-key">
                                                    {arrangementOf(s).key}
                                                    {arrangementOf(s).isMinor ? 'm' : ''}
                                                </td>
                                                <td className="hide-mobile">
                                                    {s.chart.performance.bpm}
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                            <p className="offline-note">
                                {offline}. Browser storage can be cleared; export songs you want to
                                keep.
                            </p>
                        </div>
                        <aside>
                            <section className="quick-jam">
                                <span className="eyebrow">No blank page required</span>
                                <h2>Just start playing.</h2>
                                <p>
                                    Pick a chart, change the key or the feel, and make it your own.
                                </p>
                                {songs
                                    .filter((s) => s.id.startsWith('starter-'))
                                    .map((s) => (
                                        <button
                                            className="jam-tile"
                                            key={s.id}
                                            disabled={busy}
                                            onClick={() => openSong(s.id)}
                                        >
                                            <span className="jam-symbol">♭</span>
                                            <span>
                                                <strong>
                                                    {s.chart.band.groove.lastSmartGenre}
                                                </strong>
                                                <small>{s.title}</small>
                                            </span>
                                        </button>
                                    ))}
                            </section>
                            <section className="sync-card">
                                <h3>Your band, wherever you play.</h3>
                                <p>
                                    Accounts and cloud songbooks are the next stage. This preview is
                                    device-local, with real playback and portable Ensemble files.
                                </p>
                                <p className="preview-note">
                                    iReal import, chord discovery, and sharing are not implemented
                                    here yet.
                                </p>
                            </section>
                        </aside>
                    </div>
                    <footer className="home-footer">
                        <span>Made for practice, writing, and getting lost in a good groove.</span>
                        <span>Foundation preview · {process.env.NEXT_PUBLIC_SOURCE_REV}</span>
                    </footer>
                </main>
            ) : (
                <main className="workspace" data-focused={focused}>
                    <div className="song-header">
                        <div className="song-heading">
                            <button
                                className="icon-button back-btn"
                                aria-label="Back to songbook"
                                disabled={busy}
                                onClick={goHome}
                            >
                                ←
                            </button>
                            <div>
                                <h1 className="song-title">{current.title}</h1>
                                <div className="song-subtitle">
                                    <span className={dirty ? 'unsaved' : ''}>
                                        {hasPendingText
                                            ? 'Unsaved chord text · this tab only'
                                            : dirty
                                              ? recoveryHealthy
                                                  ? 'Unsaved setup · locally recovered'
                                                  : 'Unsaved setup · this tab only'
                                              : 'Saved on this device'}
                                    </span>
                                    <span>{totalBars} bars</span>
                                    <span>{arrangementOf(current).timeSignature}</span>
                                </div>
                            </div>
                        </div>
                        <div className="song-actions">
                            <button
                                className="btn sounds-button"
                                onClick={() => setSoundMenu(true)}
                            >
                                Sounds
                            </button>
                            {playbackActive && (
                                <button
                                    className="btn focus-toggle"
                                    aria-pressed={focused}
                                    onClick={() => setShowControls(!showControls)}
                                >
                                    {focused ? 'Show controls' : 'Focus chart'}
                                </button>
                            )}
                            <div className="mode-switch">
                                <button
                                    className={!editing ? 'active' : ''}
                                    onClick={() => setEditing(false)}
                                >
                                    Chart
                                </button>
                                <button
                                    className={editing ? 'active' : ''}
                                    disabled={busy}
                                    onClick={() => revealEditor()}
                                >
                                    Edit chart
                                </button>
                            </div>
                            <button
                                className="btn primary save-btn"
                                disabled={busy || !dirty}
                                onClick={() => void run(() => save())}
                            >
                                Save
                            </button>
                            <button
                                className="icon-button menu-btn"
                                aria-label="Song actions"
                                disabled={busy}
                                onClick={() =>
                                    void run(() => {
                                        setRecoveryOptions(repository.recoveriesFor(current));
                                        setMenu(true);
                                    })
                                }
                            >
                                •••
                            </button>
                        </div>
                    </div>
                    <div className="transport-bar">
                        <div className="transport-cluster">
                            <button
                                className="play-button"
                                aria-label={playbackActive ? 'Stop playback' : 'Start playback'}
                                disabled={busy && !playbackActive}
                                onClick={() => {
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
                            >
                                {playbackActive ? '■' : '▶'}
                            </button>
                            <TempoControl
                                key={current.id}
                                value={current.chart.performance.bpm}
                                disabled={busy}
                                onCommit={(value) => change(() => runtime.setTempo(value))}
                            />
                        </div>
                        <div className="key-setting">
                            <label className="setting-label" htmlFor="song-key">
                                Key
                            </label>
                            <select
                                id="song-key"
                                className="setting-select"
                                disabled={busy}
                                value={arrangementOf(current).key}
                                onChange={(event) =>
                                    change(
                                        () =>
                                            runtime.transpose(
                                                KEY_ORDER.indexOf(event.target.value) -
                                                    KEY_ORDER.indexOf(arrangementOf(current).key),
                                            ),
                                        true,
                                    )
                                }
                            >
                                {KEY_ORDER.map((key) => (
                                    <option key={key} value={key}>
                                        {key}
                                        {arrangementOf(current).isMinor ? 'm' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="genre-setting">
                            <label className="setting-label" htmlFor="genre">
                                Feel
                            </label>
                            <select
                                id="genre"
                                className="setting-select"
                                disabled={busy}
                                value={current.chart.band.groove.lastSmartGenre}
                                onChange={(e) =>
                                    change(
                                        () => runtime.setGenre(e.target.value, setSoundProgress),
                                        true,
                                    )
                                }
                            >
                                {runtime.GENRE_NAMES.map((g) => (
                                    <option key={g}>{g}</option>
                                ))}
                            </select>
                        </div>
                        <div className="band-controls" aria-label="Band instruments">
                            {lanes.map(([key, label]) => (
                                <button
                                    key={key}
                                    className={`band-toggle ${current.chart.band[key].enabled ? 'on' : 'off'}`}
                                    disabled={busy}
                                    aria-pressed={current.chart.band[key].enabled}
                                    onClick={() =>
                                        change(() =>
                                            runtime.setEnabled(
                                                key,
                                                !current.chart.band[key].enabled,
                                            ),
                                        )
                                    }
                                >
                                    <span className="dot" />
                                    <span className="label">{label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    <dialog
                        className="sound-panel"
                        ref={soundsDialog}
                        aria-labelledby="sounds-title"
                        onClose={() => setSoundMenu(false)}
                    >
                        <div className="sounds-heading">
                            <div>
                                <h2 id="sounds-title">Your band's sound</h2>
                                <p>Install once. Play anywhere.</p>
                            </div>
                            <button
                                className="icon-button"
                                aria-label="Close sounds"
                                onClick={() => setSoundMenu(false)}
                            >
                                ✕
                            </button>
                        </div>
                        <div className="sound-install">
                            <button
                                className="btn primary"
                                disabled={busy}
                                onClick={() =>
                                    change(async () => {
                                        await installAllSounds(setSoundProgress);
                                        await runtime.applyGenreSounds(setSoundProgress);
                                    })
                                }
                            >
                                {busy ? 'Preparing sounds…' : 'Install all & use genre sounds'}
                            </button>
                            <p>
                                About {allSoundsSizeMB.toFixed(1)} MB. Chooses sounds for this
                                song's feel; changing the feel follows along. Save to keep this
                                setup.
                            </p>
                            <small>
                                {allSoundsOffline === null
                                    ? 'Checking installed sounds…'
                                    : allSoundsOffline
                                      ? 'All sound packs available offline'
                                      : 'Missing downloads will be installed. Completed files are reused.'}
                            </small>
                        </div>
                        {error && soundMenu && (
                            <div className="error-banner" role="alert">
                                {error}
                            </div>
                        )}
                        <p className="sound-progress" role="status">
                            {soundProgress}
                        </p>
                        <div className="sounds-status">
                            <span>
                                {soundsOffline === null
                                    ? 'Checking downloads…'
                                    : soundsOffline
                                      ? 'Song sounds available offline'
                                      : 'Some sounds need downloading'}
                            </span>
                            <span>Or choose each instrument:</span>
                        </div>
                        <div className="sound-choices">
                            {lanes.map(([lane, label]) => (
                                <label key={lane}>
                                    {label} sound
                                    <select
                                        aria-label={`${label} sound`}
                                        value={
                                            pendingSound?.lane === lane
                                                ? pendingSound.value
                                                : current.chart.band[lane].autoSound
                                                  ? 'auto'
                                                  : current.chart.band[lane].voice
                                        }
                                        disabled={busy}
                                        onChange={(event) => {
                                            const value = event.target.value;
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
                                    >
                                        <option value="auto">Follow feel</option>
                                        <option value="synth">Built-in</option>
                                        {packsForInstrument(lane).map((pack) => (
                                            <option key={pack.id} value={`pack:${pack.id}`}>
                                                {pack.name} · {pack.approxSizeMB} MB
                                            </option>
                                        ))}
                                    </select>
                                    <small>
                                        {current.chart.band[lane].autoSound && (
                                            <span className="resolved-sound">
                                                Using{' '}
                                                {packsForInstrument(lane).find(
                                                    (pack) =>
                                                        current.chart.band[lane].voice ===
                                                        `pack:${pack.id}`,
                                                )?.name || 'Built-in'}
                                            </span>
                                        )}
                                        {
                                            packsForInstrument(lane).find(
                                                (pack) =>
                                                    current.chart.band[lane].voice ===
                                                    `pack:${pack.id}`,
                                            )?.attribution
                                        }
                                    </small>
                                </label>
                            ))}
                        </div>
                        <p>
                            Choosing a sound downloads it for offline use. Save keeps your choices
                            with this song. Browser storage can still be cleared or evicted.
                        </p>
                    </dialog>
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
                            }}
                            tabIndex={0}
                            aria-label="Chord chart"
                        >
                            <article className="sheet">
                                {blocks.map((block) => (
                                    <section
                                        className="section"
                                        key={block.measures[0]?.chords[0]?.globalIndex}
                                    >
                                        <div className="section-head">
                                            <span className="section-letter">
                                                {block.label || 'A'}
                                            </span>
                                            <span className="section-name">
                                                {arrangementOf(current).sections.find(
                                                    (s) => s.id === block.id,
                                                )?.key || arrangementOf(current).key}
                                            </span>
                                            {current.schemaVersion === 2 &&
                                                (current.chart.score.sections.find(
                                                    (s) => s.id === block.id,
                                                )?.repeat ?? 1) > 1 && (
                                                    <span className="section-repeat">
                                                        Section ×
                                                        {
                                                            current.chart.score.sections.find(
                                                                (s) => s.id === block.id,
                                                            )?.repeat
                                                        }
                                                    </span>
                                                )}
                                            {editing && (
                                                <button
                                                    className="section-edit"
                                                    disabled={busy}
                                                    onClick={() => {
                                                        if (current.schemaVersion === 2) {
                                                            setMeasureId(
                                                                block.measures[0]?.chords[0]
                                                                    ?.measureId ?? '',
                                                            );
                                                        }
                                                        revealEditor(block.id);
                                                    }}
                                                >
                                                    Edit section
                                                </button>
                                            )}
                                        </div>
                                        <div className="bars">
                                            {block.measures.map((measure, i) => {
                                                barNumber++;
                                                const writtenBar = writtenBars.get(
                                                    measure.chords[0]?.measureId ?? '',
                                                );
                                                const notes = writtenBar?.annotations ?? [];
                                                const measureRepeat =
                                                    writtenBar?.content.kind === 'repeat'
                                                        ? writtenBar.content
                                                        : null;
                                                const navigation = [
                                                    ...(writtenBar?.start ?? []),
                                                    ...(writtenBar?.end ?? []),
                                                ].filter((mark) =>
                                                    ['segno', 'coda', 'fine', 'jump'].includes(
                                                        mark.kind,
                                                    ),
                                                );
                                                const owningSection = writtenSections.get(
                                                    measure.sectionId ?? '',
                                                );
                                                const sectionSeam =
                                                    measure.isSeamlessStart &&
                                                    measure.sectionId !== block.id;
                                                const repeatStart = writtenBar?.start?.some(
                                                    (mark) => mark.kind === 'repeat-start',
                                                );
                                                const repeatEnd = writtenBar?.end?.find(
                                                    (mark) => mark.kind === 'repeat-end',
                                                );
                                                const endingStart = writtenBar?.start?.find(
                                                    (mark) => mark.kind === 'ending-start',
                                                );
                                                const endingEnd = writtenBar?.end?.some(
                                                    (mark) => mark.kind === 'ending-end',
                                                );
                                                const endingEndBefore = writtenBar?.start?.some(
                                                    (mark) => mark.kind === 'ending-end',
                                                );
                                                return (
                                                    <div
                                                        className={`bar ${measure.chords.some((c) => c.globalIndex === displayActive) ? 'active' : ''} ${i === block.measures.length - 1 ? 'end' : ''} ${repeatStart ? 'repeat-start' : ''} ${repeatEnd ? 'repeat-end' : ''} ${endingStart ? 'ending-start' : ''} ${endingEnd ? 'ending-end' : ''}`}
                                                        data-measure-id={writtenBar?.id}
                                                        data-active={measure.chords.some(
                                                            (c) => c.globalIndex === displayActive,
                                                        )}
                                                        key={measure.chords[0]?.globalIndex}
                                                    >
                                                        <span className="bar-number">
                                                            {barNumber}
                                                        </span>
                                                        {navigation.length > 0 && (
                                                            <span className="bar-navigation">
                                                                {navigation
                                                                    .map(directionLabel)
                                                                    .join(' · ')}
                                                            </span>
                                                        )}
                                                        {endingStart && (
                                                            <span
                                                                className="ending-label"
                                                                aria-label={`Ending passes ${endingStart.passes.join(', ')}`}
                                                                title={`Ending passes ${endingStart.passes.join(', ')}`}
                                                            >
                                                                {endingStart.passes.join(', ')}.
                                                            </span>
                                                        )}
                                                        {endingEnd && !endingStart && (
                                                            <span
                                                                className="ending-close"
                                                                aria-label="End ending after this bar"
                                                            />
                                                        )}
                                                        {endingEndBefore && (
                                                            <span
                                                                className="ending-close ending-close-before"
                                                                aria-label="End previous ending before this bar"
                                                            />
                                                        )}
                                                        {repeatStart && (
                                                            <span
                                                                className="repeat-sign repeat-sign-start"
                                                                aria-label="Start repeat"
                                                            >
                                                                𝄆
                                                            </span>
                                                        )}
                                                        {repeatEnd && (
                                                            <span
                                                                className="repeat-sign repeat-sign-end"
                                                                aria-label={`End repeat, ${repeatEnd.times} total passes`}
                                                            >
                                                                𝄇
                                                                {repeatEnd.times !== 2 && (
                                                                    <small>
                                                                        ×{repeatEnd.times}
                                                                    </small>
                                                                )}
                                                            </span>
                                                        )}
                                                        {current.schemaVersion === 2 && editing && (
                                                            <button
                                                                className="bar-edit"
                                                                disabled={busy}
                                                                aria-label={`Edit bar ${barNumber}`}
                                                                onClick={() => {
                                                                    setMeasureId(
                                                                        measure.chords[0]
                                                                            ?.measureId ?? '',
                                                                    );
                                                                    revealEditor(measure.sectionId);
                                                                }}
                                                            >
                                                                Edit
                                                            </button>
                                                        )}
                                                        {current.schemaVersion === 2 &&
                                                            (i === 0 ||
                                                                sectionSeam ||
                                                                measure.chords[0]?.key !==
                                                                    block.measures[i - 1]?.chords[0]
                                                                        ?.key ||
                                                                measure.chords[0]?.keyIsMinor !==
                                                                    block.measures[i - 1]?.chords[0]
                                                                        ?.keyIsMinor ||
                                                                measure.chords[0]?.timeSignature !==
                                                                    block.measures[i - 1]?.chords[0]
                                                                        ?.timeSignature) && (
                                                                <span className="bar-context">
                                                                    {sectionSeam &&
                                                                        owningSection && (
                                                                            <b
                                                                                aria-label={`Section ${owningSection.label}, ${owningSection.repeat} total passes`}
                                                                                title={`Section ${owningSection.label}, ${owningSection.repeat} total passes`}
                                                                            >
                                                                                {
                                                                                    owningSection.label
                                                                                }{' '}
                                                                                · ×
                                                                                {
                                                                                    owningSection.repeat
                                                                                }{' '}
                                                                                ·{' '}
                                                                            </b>
                                                                        )}
                                                                    {measure.chords[0]?.key}
                                                                    {measure.chords[0]?.keyIsMinor
                                                                        ? 'm'
                                                                        : ''}{' '}
                                                                    ·{' '}
                                                                    {
                                                                        measure.chords[0]
                                                                            ?.timeSignature
                                                                    }
                                                                </span>
                                                            )}
                                                        {notes
                                                            .filter(
                                                                (note) =>
                                                                    note.placement === 'above',
                                                            )
                                                            .map((note, index) => (
                                                                <span
                                                                    className="bar-note"
                                                                    // biome-ignore lint/suspicious/noArrayIndexKey: Authored annotations have no IDs; these display-only spans hold no local state.
                                                                    key={`${note.at.join('/')}-${index}`}
                                                                >
                                                                    {note.text}
                                                                </span>
                                                            ))}
                                                        {measure.chords
                                                            .filter(
                                                                (_, index) =>
                                                                    !measureRepeat || index === 0,
                                                            )
                                                            .map((c) => (
                                                                <button
                                                                    className="chord chord-button"
                                                                    aria-current={
                                                                        (
                                                                            measureRepeat
                                                                                ? measure.chords.some(
                                                                                      (event) =>
                                                                                          event.globalIndex ===
                                                                                          displayActive,
                                                                                  )
                                                                                : displayActive ===
                                                                                  c.globalIndex
                                                                        )
                                                                            ? 'true'
                                                                            : undefined
                                                                    }
                                                                    data-start-step={
                                                                        (measureRepeat
                                                                            ? measure.chords.some(
                                                                                  (event) =>
                                                                                      event.globalIndex ===
                                                                                      displayActive,
                                                                              )
                                                                            : displayActive ===
                                                                              c.globalIndex) &&
                                                                        activeEvent
                                                                            ? activeEvent.start
                                                                            : c.start
                                                                    }
                                                                    data-end-step={
                                                                        (measureRepeat
                                                                            ? measure.chords.some(
                                                                                  (event) =>
                                                                                      event.globalIndex ===
                                                                                      displayActive,
                                                                              )
                                                                            : displayActive ===
                                                                              c.globalIndex) &&
                                                                        activeEvent
                                                                            ? activeEvent.end
                                                                            : c.end
                                                                    }
                                                                    style={
                                                                        current.schemaVersion === 2
                                                                            ? {
                                                                                  flex:
                                                                                      c.end -
                                                                                      c.start,
                                                                              }
                                                                            : undefined
                                                                    }
                                                                    key={c.globalIndex}
                                                                    disabled={
                                                                        playing ||
                                                                        busy ||
                                                                        c.globalIndex < 0
                                                                    }
                                                                    aria-label={
                                                                        measureRepeat
                                                                            ? `Repeated bar: ${measure.chords.map((event) => event.absName).join(', ')}`
                                                                            : `Audition ${c.absName}`
                                                                    }
                                                                    title={
                                                                        measureRepeat
                                                                            ? measure.chords
                                                                                  .map(
                                                                                      (event) =>
                                                                                          event.absName,
                                                                                  )
                                                                                  .join(' · ')
                                                                            : undefined
                                                                    }
                                                                    onClick={() =>
                                                                        runtime.audition(
                                                                            c.globalIndex,
                                                                        )
                                                                    }
                                                                >
                                                                    {measureRepeat
                                                                        ? measureRepeat.display ===
                                                                          'one-bar'
                                                                            ? '%'
                                                                            : measureRepeat.display ===
                                                                                'two-bar-start'
                                                                              ? '𝄎 1'
                                                                              : '𝄎 2'
                                                                        : c.absName}
                                                                </button>
                                                            ))}
                                                        {notes
                                                            .filter(
                                                                (note) =>
                                                                    note.placement === 'below',
                                                            )
                                                            .map((note, index) => (
                                                                <span
                                                                    className="bar-note"
                                                                    // biome-ignore lint/suspicious/noArrayIndexKey: Authored annotations have no IDs; these display-only spans hold no local state.
                                                                    key={`${note.at.join('/')}-${index}`}
                                                                >
                                                                    {note.text}
                                                                </span>
                                                            ))}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </section>
                                ))}
                                <div className="chart-bottom" hidden={playbackActive}>
                                    <span>Tap a chord to hear it while stopped.</span>
                                    <span>{totalBars} bars · repeats continuously</span>
                                </div>
                            </article>
                        </div>
                        <aside className="edit-panel" ref={editPanel} hidden={!editing}>
                            <h2>Edit your chart</h2>
                            <p hidden={current.schemaVersion === 2}>
                                Separate bars with |. Chords in the same bar share its beats
                                equally.
                            </p>
                            <label className="panel-label" htmlFor="title">
                                Song title
                            </label>
                            <input
                                id="title"
                                disabled={busy}
                                className="section-text title-input"
                                maxLength={160}
                                value={current.title}
                                onChange={(e) => draft({ ...current, title: e.target.value })}
                            />
                            {current.schemaVersion === 2 ? (
                                <>
                                    <MeasureEditor
                                        key={current.id}
                                        ref={measureEditor}
                                        score={current.chart.score}
                                        selectedMeasureId={measureId}
                                        onSelect={setMeasureId}
                                        disabled={busy}
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
                                    />
                                    <div className="dialog-actions">
                                        <button
                                            className="btn"
                                            disabled={busy}
                                            onClick={() => extendScore(false)}
                                        >
                                            ＋ Bar
                                        </button>
                                        <button
                                            className="btn"
                                            disabled={busy}
                                            onClick={() => extendScore(true)}
                                        >
                                            ＋ Section
                                        </button>
                                    </div>
                                    <p className="preview-note">
                                        Save includes all edited bars. Unchecked typing stays in
                                        this tab until you update or save.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <button className="btn" disabled={busy} onClick={upgradeEditor}>
                                        Try the bar editor · keep original
                                    </button>
                                    <label className="panel-label" htmlFor="section">
                                        Section
                                    </label>
                                    <select
                                        id="section"
                                        disabled={busy}
                                        value={sectionId}
                                        onChange={(e) => selectSection(current, e.target.value)}
                                    >
                                        {arrangementOf(current).sections.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.label}
                                                {buffers.has(s.id) ? ' · edited' : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <label className="panel-label" htmlFor="chord-text">
                                        Chord text
                                    </label>
                                    <textarea
                                        id="chord-text"
                                        ref={editor}
                                        className="section-text"
                                        disabled={busy}
                                        aria-describedby="editor-help"
                                        value={text}
                                        onChange={(e) => editText(e.target.value)}
                                    />
                                    <div className="dialog-actions">
                                        <button
                                            className="btn primary"
                                            disabled={busy}
                                            onClick={() =>
                                                void run(() => {
                                                    updateChart();
                                                })
                                            }
                                        >
                                            Update chart
                                        </button>
                                        <button
                                            className="btn"
                                            disabled={busy}
                                            onClick={() =>
                                                void run(() => {
                                                    const next = updateChart();
                                                    const id = crypto.randomUUID();
                                                    const sections = [
                                                        ...arrangementOf(next).sections,
                                                        {
                                                            id,
                                                            label: String.fromCharCode(
                                                                65 +
                                                                    (arrangementOf(current).sections
                                                                        .length %
                                                                        26),
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
                                        >
                                            ＋ Section
                                        </button>
                                    </div>
                                    <p className="preview-note" id="editor-help">
                                        Save includes your typed chords. Update chart previews them
                                        without saving. Unchecked text stays in this tab only;
                                        playback and returning to your songbook check it first.
                                    </p>
                                </>
                            )}
                        </aside>
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
            <dialog
                ref={dialog}
                className="modal-box"
                onCancel={() => setMenu(false)}
                onClose={() => setMenu(false)}
            >
                <h2>Keep a good take.</h2>
                <p>
                    Saved setups and recovered drafts stay on this device. Export a file to move a
                    song to another computer.
                </p>
                <div className="dialog-actions">
                    <button
                        className="btn primary"
                        disabled={busy}
                        onClick={() => void run(() => save(true))}
                    >
                        Save a copy
                    </button>
                    <button className="btn" disabled={busy} onClick={() => void run(exportSong)}>
                        Export file
                    </button>
                    {current?.schemaVersion === 2 && current.importSource && (
                        <button
                            className="btn"
                            disabled={busy}
                            onClick={() => downloadImportSource(current.importSource!.text)}
                        >
                            Download original source
                        </button>
                    )}
                    <button
                        className="btn"
                        disabled={busy}
                        onClick={() => {
                            setMenu(false);
                            setImporting(true);
                        }}
                    >
                        Import chart
                    </button>
                    <button
                        className="btn"
                        disabled={busy || !dirty}
                        onClick={() =>
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
                    >
                        Revert to saved
                    </button>
                    <button className="btn" onClick={() => setMenu(false)}>
                        Close
                    </button>
                </div>
                {recoveryOptions.length > 0 && (
                    <details className="recovery-list">
                        <summary>Preserved drafts ({recoveryOptions.length})</summary>
                        <p>
                            Older or competing drafts are kept here even after a newer save. Open
                            one as an independent copy, leaving your current setup intact.
                        </p>
                        {recoveryOptions.map((record) => (
                            <button
                                className="jam-tile"
                                key={`${record.capturedAt}-${record.document.revision}-${JSON.stringify(record.document.chart)}`}
                                disabled={busy}
                                onClick={() =>
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
                            >
                                <span>
                                    <strong>
                                        Open copy of {record.document.title} ·{' '}
                                        {record.document.chart.performance.bpm} BPM
                                    </strong>
                                    <small>
                                        {new Date(record.capturedAt).toLocaleString()} · based on
                                        revision {record.document.revision}
                                    </small>
                                </span>
                            </button>
                        ))}
                    </details>
                )}
            </dialog>
        </div>
    );
}
