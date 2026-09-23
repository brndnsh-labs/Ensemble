import {
    type BandSettings,
    type CompInstrument,
    PPQ,
    STYLE_IDS,
    STYLES,
    type StyleId,
    toMidi,
} from '@band/index';
import { transposeKey } from '@engine/controllers/arranger-controller';
import {
    flushBuffers,
    loadDrumPreset,
    togglePower,
} from '@engine/controllers/instrument-controller';
import {
    loopSection as armSectionLoop,
    clearPracticeLoop,
    getSectionStepBounds,
} from '@engine/controllers/practice-controller';
import { autoVoiceForGenre } from '@engine/data/genre-sound-map';
import { GENRE_NAMES, SMART_GENRES } from '@engine/data/smart-genres';
import { registerScorePlaybackRenderer, validateProgression } from '@engine/engine/chords-engine';
import { analyzeFormUI } from '@engine/engine/conductor';
import {
    initAudio,
    killAllNotes,
    playNote,
    restoreGains,
    syncBusReverbSend,
} from '@engine/engine/engine';
import { isPackInstalled } from '@engine/engine/instrument-registry';
import {
    startPlatformAudioAndWakeLock,
    stopPlatformAudioAndWakeLock,
} from '@engine/engine/platform-orchestrator';
import { scheduler } from '@engine/engine/scheduler-core';
import { isSoloistMonophonicMode } from '@engine/engine/soloist-mode-policy';
import { transposeChordText } from '@engine/engine/transpose';
import {
    downloadExportResult,
    renderCurrentSessionToWav,
    renderStemsToWav,
    STEM_INSTRUMENTS,
    type StemInstrument,
} from '@engine/export/audio-export';
import { exportToMidi } from '@engine/export/midi-export';
import { proposeLegacyScoreConversion } from '@engine/songbook/legacy-score';
import {
    prepareScorePlayback,
    renderScorePlayback,
    scoreArrangement,
} from '@engine/songbook/score-playback';
import type { SemanticScore } from '@engine/songbook/score-types';
import type {
    ChartContent,
    ChartLaneMix,
    ChartNotation,
    SoloistMode,
} from '@engine/songbook/types';
import { dispatch, getState, subscribe } from '@engine/state';
import {
    deriveSoloistModeOnBoot,
    handleEffects,
    reconcileUrlGenreOnBoot,
} from '@engine/state/state-effects';
import {
    ACTIONS,
    type ChordDensity,
    type EnsembleState,
    type InstrumentModule,
    type InstrumentVoice,
    type SwingSub,
} from '@engine/types';
import { transposeKeyName } from '@engine/utils';
import { initWorker, syncWorker } from '@engine/worker-client';
import { renderBandMixToWav, renderBandStemsToWav } from './band-export';
import { BandHost } from './band-host';
import { type ChartDocument, type DocumentContent, validateDocument } from './documents';
import { masterVolumePreference, rememberMasterVolume } from './session';
import { initializeSounds, prepareSound, prepareSounds, validateVoice } from './sounds';

export type { ChartContent, ChartDocument, StemInstrument };
export { GENRE_NAMES };

let boot: Promise<void> | undefined;
let loading = false;
let playIntent = 0;
/**
 * Bumped by {@link cancelExportAudio}; an in-flight {@link exportAudio} call
 * checks this after every await and discards its work (no download) once its
 * own captured value falls behind. Same superseded-intent shape as
 * `playIntent` above — the one difference is a cancelled export is expected
 * (a user action), not a race to quietly lose, so callers must not surface it
 * as an error.
 */
let exportIntent = 0;

/** Thrown from inside {@link exportAudio}'s stem-progress hook to unwind `renderStemsToWav`'s loop the moment a cancel lands, rather than waiting for it to finish every remaining stem. Never escapes {@link exportAudio}. */
class ExportCancelled extends Error {}
/** Lanes whose voice follows the feel while they are left on Auto (#675). */
const AUTO_LANES = ['groove', 'bass', 'chords', 'harmony', 'soloist'] as const;
/**
 * Ceiling on waiting for the scheduler to swap in a staged feel (#1185). One bar
 * at the engine's slowest tempo is ~6s; past this the audio clock is not running
 * (a suspended context, a hidden tab) and waiting longer only strands the UI.
 */
const STAGED_FEEL_TIMEOUT_MS = 12_000;
// Authored source belongs to the host document, never to generated runtime state.
let currentScore: SemanticScore | null = null;

// ---------------------------------------------------------------- the band engine
// `?engine=next` plays the new band engine (`band/`, docs/design/band-engine.md) in place of
// the worker/scheduler generator, through the same voices, buses and sound packs. Everything
// else — charts, the songbook, the mixer, the Feel sheet — is shared. Read once per page.
export const ENGINE_NEXT =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('engine') === 'next';
/** One sixteenth in band ticks: the old engine's step, so step maps convert exactly. */
const STEP_TICKS = PPQ / 4;
/**
 * The genres the band engine plays natively, and the nearest one standing in for each of the
 * rest until they are ported (v0 scope: the rhythm section in four styles).
 */
const STYLE_FOR_GENRE: Record<string, StyleId> = {
    Rock: 'rock',
    Jazz: 'jazz',
    Funk: 'funk',
    Bossa: 'bossa',
    Blues: 'jazz',
    'Neo-Soul': 'funk',
    Disco: 'funk',
    'Hip Hop': 'funk',
    Reggae: 'rock',
    Acoustic: 'rock',
    Country: 'rock',
    Metal: 'rock',
    'Ska-Punk': 'rock',
};
/** The chords-lane sound for each comp instrument (what the band's Auto sound selects). */
const VOICE_FOR_COMP: Record<CompInstrument, InstrumentVoice> = {
    piano: 'pack:grand',
    rhodes: 'pack:rhodes',
    organ: 'pack:hammond-organ',
    clav: 'pack:clavinet',
    guitar: 'pack:electric-guitar-clean',
    nylon: 'pack:nylon-guitar',
};
/**
 * How the band plays the sound on the chords lane: a guitar sound gets guitar grips and
 * strums, the organ holds, the rest are keyboards. Any other sound (the synth) is a piano.
 */
const COMP_FOR_VOICE: Record<string, CompInstrument> = Object.assign(Object.create(null), {
    ...Object.fromEntries(Object.entries(VOICE_FOR_COMP).map(([comp, voice]) => [voice, comp])),
    'pack:electric-guitar-rhythm': 'guitar',
    'pack:electric-guitar-driven': 'guitar',
});
/** In next mode, a genre the band plays natively picks its own comp instrument's sound. */
function bandAutoComp(genre: string | undefined): InstrumentVoice | null {
    const style = STYLE_IDS.find((id) => STYLES[id].name === genre);
    return ENGINE_NEXT && style ? VOICE_FOR_COMP[STYLES[style].prefers] : null;
}
let band: BandHost | null = null;
let bandSeed = '';
let bandScore: { key: string; score: SemanticScore } | null = null;
let playhead: ReturnType<typeof setInterval> | null = null;

function bandHost(): BandHost {
    band ??= new BandHost({ state: getState, silence: () => void killAllNotes(getState()) });
    return band;
}

/** The chart as a semantic score; a measure-less (v1) chart converts on the fly. */
function scoreForBand(): SemanticScore {
    if (currentScore) {
        return currentScore;
    }
    const content = captureContent();
    const key = JSON.stringify(content.arrangement);
    if (bandScore?.key === key) {
        return bandScore.score;
    }
    const now = new Date(0).toISOString();
    const proposal = proposeLegacyScoreConversion(
        JSON.stringify({
            schemaVersion: 1,
            id: 'live',
            title: 'live',
            createdAt: now,
            updatedAt: now,
            revision: 0,
            chart: content,
        }),
    );
    if (proposal.kind !== 'candidate') {
        throw new Error(
            'This chart cannot play on the new engine yet. Convert it to measures first.',
        );
    }
    bandScore = { key, score: proposal.value.chart.score };
    return bandScore.score;
}

function bandSettings(): BandSettings {
    const { groove, bass, chords, playback } = getState();
    return {
        style: STYLE_FOR_GENRE[groove.lastSmartGenre] ?? 'rock',
        lanes: { drums: groove.enabled, bass: bass.enabled, comp: chords.enabled },
        comp: COMP_FOR_VOICE[chords.voice] ?? 'piano',
        intensity: playback.autoIntensity ? null : playback.bandIntensity,
        swing: groove.swing,
        swingGrid: groove.swingSub === '16th' ? 16 : 8,
        humanize: groove.humanize,
        seed: bandSeed,
    };
}

function bandLoop(): { from: number; to: number } | null {
    const { playback } = getState();
    return playback.loopStartStep >= 0 && playback.loopEndStep > playback.loopStartStep
        ? { from: playback.loopStartStep * STEP_TICKS, to: playback.loopEndStep * STEP_TICKS }
        : null;
}

function startBand(): void {
    const host = bandHost();
    const state = getState();
    const { arranger, playback } = state;
    host.setScore(scoreForBand());
    // The same take-to-take rule as the old engine: a fresh seed per play unless locked —
    // and the fresh one is recorded, so locking it later reproduces the take you heard.
    if (arranger.randomizeSeed || !arranger.seed) {
        dispatch(
            ACTIONS.SET_SONG_SEED,
            Math.floor(Math.random() * 0xffffff)
                .toString(16)
                .padStart(6, '0')
                .toUpperCase(),
        );
    }
    bandSeed = String(getState().arranger.seed);
    if (!playback.chartLocked) {
        dispatch(ACTIONS.SET_CHART_LOCKED, true);
    }
    if (playback.audio?.state === 'suspended') {
        void playback.audio.resume();
    }
    restoreGains(state);
    startPlatformAudioAndWakeLock();
    host.start(bandSettings(), playback.bpm, (playback.startStep || 0) * STEP_TICKS, bandLoop());
    param('playback', 'isPlaying', true);
    playhead ??= setInterval(followPlayhead, 50);
}

function stopBand(): void {
    band?.stop();
    if (playhead) {
        clearInterval(playhead);
        playhead = null;
    }
    param('chords', 'lastActiveChordIndex', null);
    if (getState().playback.isPlaying) {
        param('playback', 'isPlaying', false);
    }
    dispatch(ACTIONS.SET_START_STEP, 0);
    stopPlatformAudioAndWakeLock();
    void killAllNotes(getState());
}

/** Publish the sounding chord for the chart sheet, as the old scheduler did. */
function followPlayhead(): void {
    const tick = band?.songTick();
    if (tick == null) {
        return;
    }
    const step = Math.floor(tick / STEP_TICKS);
    const { arranger, chords } = getState();
    const index = arranger.stepMap.findIndex((entry) => entry.start <= step && step < entry.end);
    if (index >= 0 && index !== chords.lastActiveChordIndex) {
        param('chords', 'lastActiveChordIndex', index);
    }
}

/** Keep the band in step with every change the app makes to the shared state. */
function syncBand(): void {
    const host = band;
    const { playback, groove } = getState();
    if (groove.pendingGenreFeel) {
        // The band takes a new feel at its next barline by itself; commit the staged
        // genre now so the app's view of it (and setGenre's wait) settles at once.
        const payload = groove.pendingGenreFeel as {
            feel?: string;
            swing?: number;
            sub?: string;
            drum?: string;
        };
        param('groove', 'pendingGenreFeel', null);
        if (payload.feel) {
            param('groove', 'genreFeel', payload.feel);
        }
        if (payload.swing !== undefined) {
            param('groove', 'swing', payload.swing);
        }
        if (payload.sub === '8th' || payload.sub === '16th') {
            param('groove', 'swingSub', payload.sub);
        }
        if (payload.drum) {
            void loadDrumPreset(payload.drum);
        }
    }
    // The genre-change effect in `public/` picks the old engine's Auto sound; on the band,
    // a native genre's own comp instrument wins (bossa is heard on nylon). Only an installed
    // pack is taken — the explicit genre change (`setGenre`) installs it beforehand.
    const { chords } = getState();
    const auto = bandAutoComp(groove.lastSmartGenre);
    if (auto && chords.autoSound && chords.voice !== auto && isPackInstalled(auto.slice(5))) {
        dispatch(ACTIONS.SET_INSTRUMENT_VOICE, { module: 'chords', voice: auto, auto: true });
        return; // that dispatch syncs the band again
    }
    if (!host?.playing) {
        return;
    }
    if (!playback.isPlaying) {
        stopBand();
        return;
    }
    host.setTempo(playback.bpm);
    host.setLoop(bandLoop());
    host.update(bandSettings());
}

/** Start the transport on whichever engine this page plays. */
function startPlayback(): void {
    if (ENGINE_NEXT) {
        startBand();
    } else {
        dispatch(ACTIONS.TOGGLE_PLAY);
    }
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const param = (module: string, name: string, value: unknown) =>
    dispatch(ACTIONS.SET_PARAM, { module, param: name, value });

function mix(lane: ChartLaneMix): ChartLaneMix {
    return {
        enabled: lane.enabled,
        voice: lane.voice,
        autoSound: lane.autoSound,
        volume: lane.volume,
        reverb: lane.reverb,
    };
}

/** Explicit semantic projection, never a clone of the live/audio state tree. */
export function captureContent(): ChartContent {
    const {
        arranger: a,
        playback: p,
        chords: c,
        bass: b,
        soloist: s,
        harmony: h,
        groove: g,
    } = getState();
    return clone({
        arrangement: {
            sections: a.sections,
            key: a.key,
            timeSignature: a.timeSignature,
            grouping: a.grouping,
            isMinor: a.isMinor,
            notation: a.notation,
            lastChordPreset: a.lastChordPreset,
        },
        performance: {
            bpm: p.bpm,
            complexity: p.complexity,
            seed: a.seed,
            randomizeSeed: a.randomizeSeed,
        },
        band: {
            chords: {
                ...mix(c),
                style: c.style,
                instrument: (c as unknown as { instrument?: string }).instrument,
                octave: c.octave,
                density: c.density,
            },
            bass: { ...mix(b), style: b.style, octave: b.octave },
            soloist: {
                ...mix(s),
                style: s.style,
                preset: s.preset,
                octave: s.octave,
                mode: s.mode,
                autoMode: s.autoMode,
                phrasingIntensity: s.phrasingIntensity,
                tradeMode: s.tradeMode,
            },
            harmony: { ...mix(h), style: h.style, octave: h.octave, complexity: h.complexity },
            groove: {
                ...mix(g),
                measures: g.measures,
                swing: g.swing,
                swingSub: g.swingSub,
                humanize: g.humanize,
                lastDrumPreset: g.lastDrumPreset,
                genreFeel: g.genreFeel,
                lastSmartGenre: g.lastSmartGenre,
                pattern: g.instruments.map((i) => ({ name: i.name, steps: i.steps })),
            },
        },
    } as ChartContent);
}

function rebuild(): void {
    validateProgression(getState(), dispatch);
    if (!getState().arranger.progression.length) {
        throw new Error('The chart has no playable chords. Check your chord text.');
    }
    analyzeFormUI(getState().arranger);
    syncWorker();
    flushBuffers();
    restoreGains(getState());
    for (const lane of ['groove', 'bass', 'chords', 'harmony', 'soloist'] as const) {
        syncBusReverbSend(getState(), lane);
    }
}

function captureSessionContent(): DocumentContent {
    const content = captureContent();
    return currentScore
        ? { score: clone(currentScore), performance: content.performance, band: content.band }
        : content;
}

export function captureDocument(document: ChartDocument): ChartDocument {
    return validateDocument({ ...document, chart: captureSessionContent() });
}

/** Display-only maps for bars bypassed by navigation; never installed in live state. */
export function writtenChart() {
    const state = getState();
    const plan = state.arranger.scorePlan;
    if (!plan) {
        return state.arranger;
    }
    const detached = {
        ...state,
        arranger: {
            ...state.arranger,
            scorePlan: {
                ...plan,
                visits: plan.sections.flatMap((entry, sectionIndex) =>
                    entry.measures.map((_, measureIndex) => ({
                        sectionIndex,
                        measureIndex,
                        sectionPass: 0,
                        repeatPasses: [],
                    })),
                ),
            },
        },
    };
    validateProgression(detached);
    return detached.arranger;
}

/** Uses the same buffer ownership and monophonic guard as the current page bootstrap. */
function receiveNotes(notes: unknown[], resolution: true | undefined): void {
    const state = getState();
    if (state.playback.resolutionTriggered && !resolution) {
        return;
    }
    const bassSteps = new Set<number>();
    const soloSteps = new Set<number>();
    for (const value of notes) {
        const note = value as { module: InstrumentModule; step: number };
        if (note.module === 'bass') {
            if (!bassSteps.has(note.step)) {
                state.bass.buffer.set(note.step, []);
                bassSteps.add(note.step);
            }
            state.bass.buffer.get(note.step)!.push(value as never);
        } else if (note.module === 'soloist') {
            if (
                isSoloistMonophonicMode(state.soloist.mode) &&
                state.soloist.audio.buffer.has(note.step)
            ) {
                continue;
            }
            if (!soloSteps.has(note.step)) {
                state.soloist.audio.buffer.set(note.step, []);
                soloSteps.add(note.step);
            }
            state.soloist.audio.buffer.get(note.step)!.push(value as never);
        } else if (
            note.module === 'chords' ||
            note.module === 'harmony' ||
            note.module === 'groove'
        ) {
            const buffer = state[note.module].buffer;
            if (!buffer.has(note.step)) {
                buffer.set(note.step, []);
            }
            buffer.get(note.step)!.push(value as never);
        }
    }
    if (state.playback.isPlaying) {
        scheduler(state, dispatch);
    }
}

/** One runtime per browser page, independent of React mount/unmount and route views. */
export function initialize(): Promise<void> {
    if (!boot) {
        registerScorePlaybackRenderer(renderScorePlayback);
        boot = (async () => {
            initializeSounds();
            // Under `?engine=next` the old generator still answers flushes, but nothing it
            // produces may reach the scheduler: the band host owns the audio.
            initWorker(
                () => {
                    if (!ENGINE_NEXT) {
                        scheduler(getState(), dispatch);
                    }
                },
                (notes, _sent, _duration, resolution) => {
                    if (!ENGINE_NEXT) {
                        receiveNotes(notes, resolution);
                    }
                },
            );
            await loadDrumPreset('Basic Rock');
            // Guest startup must not download audio without an install/selection gesture.
            for (const module of ['groove', 'bass', 'chords', 'harmony', 'soloist'] as const) {
                param(module, 'autoSound', false);
            }
            subscribe((action, state, context) => {
                if (loading) {
                    return;
                }
                syncWorker(action.type, action.payload);
                // The async genre effect is awaited explicitly by setGenre below.
                if (action.type !== ACTIONS.SET_GENRE_FEEL) {
                    handleEffects(action, state, context);
                }
                if (ENGINE_NEXT) {
                    syncBand();
                }
            });
            // #1276 — `playback.masterVolume` is `preferences`-owned (never part of a
            // saved chart), so it's hydrated from its own device-local key here rather
            // than from `apply()`. `initAudio()` reads `playback.masterVolume` straight
            // off state at graph-build time (`engine.ts`), so setting it this early is
            // enough even though guest startup defers `initAudio()` past this point.
            const storedMasterVolume = masterVolumePreference();
            if (storedMasterVolume !== null) {
                param('playback', 'masterVolume', storedMasterVolume);
            }
            rebuild();
            document.addEventListener('visibilitychange', () => {
                const { playback } = getState();
                if (
                    document.visibilityState === 'visible' &&
                    playback.isPlaying &&
                    playback.audio?.state === 'suspended'
                ) {
                    void playback.audio.resume().catch(() => {});
                }
            });
            window.addEventListener('pagehide', stop);
            // The listening-gate tools (`scripts/mix-report.ts`) render offline through
            // `window.ensemble`. Next inlines the flag at build time, so a production build
            // compiles this branch — and the bridge module — out entirely.
            if (process.env.NEXT_PUBLIC_RENDER_BRIDGE === '1') {
                const { installRenderBridge } = await import('@engine/render-bridge');
                installRenderBridge();
                document.documentElement.dataset.renderBridge = 'ready';
            }
        })();
    }
    return boot;
}

export function stop(): void {
    playIntent++;
    // #1211 — Stop always releases an armed/live practice loop; the drill is a
    // performance-mode overlay on the transport, not a setting that survives it.
    if (ENGINE_NEXT) {
        // Stop the band before clearing the loop, so the loop change can't restart it.
        if (band?.playing || getState().playback.isPlaying) {
            stopBand();
        }
        clearPracticeLoop();
        return;
    }
    clearPracticeLoop();
    if (getState().playback.isPlaying) {
        dispatch(ACTIONS.TOGGLE_PLAY);
    }
}

/**
 * Arm a section-practice loop (#1211). Wraps the practice controller so the app
 * shell never imports `@engine/controllers/*` directly. Returns false (and
 * changes nothing) when the section id doesn't resolve to a step span — e.g. a
 * stale id from a chart that changed shape after this render.
 */
export function loopSection(sectionId: string): boolean {
    if (!getSectionStepBounds(sectionId)) {
        return false;
    }
    armSectionLoop(sectionId);
    return true;
}

/** Drop out of a running or armed practice loop (#1211). */
export function clearLoop(): void {
    clearPracticeLoop();
}

/**
 * The id of the section currently armed/looping, or null when no loop is set.
 * Maps `playback.loopStartStep/loopEndStep` back to the `arranger.sectionMap`
 * entry with the matching span — using `getSectionStepBounds` so a section with
 * more than one map entry (a written repeat) resolves the same collapsed span
 * `loopSection` armed it with, rather than a single raw map row (#1211).
 */
export function loopedSection(): string | null {
    const { playback, arranger } = getState();
    if (playback.loopStartStep < 0) {
        return null;
    }
    const ids = new Set(arranger.sectionMap.map((entry) => entry.id));
    for (const id of ids) {
        const bounds = getSectionStepBounds(id);
        if (
            bounds &&
            bounds.start === playback.loopStartStep &&
            bounds.end === playback.loopEndStep
        ) {
            return id;
        }
    }
    return null;
}

export async function toggle(progress: (text: string) => void): Promise<void> {
    if (getState().playback.isPlaying) {
        stop();
        return;
    }
    // Keep AudioContext creation on the gesture stack for mobile Safari.
    initAudio(getState());
    const intent = ++playIntent;
    await prepareSounds(captureContent(), progress);
    if (intent !== playIntent) {
        return;
    }
    startPlayback();
}

export async function setVoice(
    module: InstrumentModule,
    voice: InstrumentVoice,
    progress: (text: string) => void,
    auto = false,
): Promise<void> {
    validateVoice(module, voice);
    if (voice !== 'synth') {
        await prepareSound(voice.slice(5), progress);
    }
    // Keep the old selection throughout download/failure. Dispatch through the
    // established effects and worker delta (including crunch chord voicing).
    dispatch(ACTIONS.SET_INSTRUMENT_VOICE, { module, voice, auto });
    if (auto && module === 'soloist') {
        // Auto dispatch normally runs inside genre resolution; this explicit
        // picker also needs its established voice-to-phrasing reconciliation.
        deriveSoloistModeOnBoot(getState(), dispatch);
    }
    rebuild();
}

/** Live bus gain — mirrors `InstrumentSettings.tsx`'s `updateInstrumentAudio`. */
export function setVolume(module: InstrumentModule, value: number): void {
    dispatch(ACTIONS.SET_VOLUME, { module, value });
}

/** Live reverb send — the `SET_REVERB` sibling of `setVolume`. */
export function setReverb(module: InstrumentModule, value: number): void {
    dispatch(ACTIONS.SET_REVERB, { module, value });
}

/**
 * Bass/chords/harmony/soloist all read `<lane>.style` live at note-generation
 * time (see `instrument-styles.ts`); this is the one manual style picker each
 * of those four lanes has ever had in either app. Flush the worker's
 * lookahead buffer afterward so the new style is audible at the next
 * scheduled note rather than waiting for the pre-generated buffer to drain —
 * `InstrumentSettings.tsx`'s chords-style handler does the same
 * (`refreshArrangerUI`) for the one style picker v1 exposes.
 */
export function setStyle(module: InstrumentModule, style: string): void {
    dispatch(ACTIONS.SET_STYLE, { module, style });
    rebuild();
}

/** Chords-only: `SET_DENSITY`'s reducer writes `chords.density` unconditionally. */
export function setDensity(density: ChordDensity): void {
    dispatch(ACTIONS.SET_DENSITY, density);
}

/** Soloist phrasing mode — mirrors `InstrumentSettings.tsx`'s Auto/Monophonic/Guitar group. */
export function setSoloistMode(mode: 'auto' | SoloistMode): void {
    if (mode === 'auto') {
        dispatch(ACTIONS.SET_SOLOIST_AUTO_MODE, true);
    } else {
        dispatch(ACTIONS.SET_SOLOIST_MODE, mode);
        dispatch(ACTIONS.SET_SOLOIST_AUTO_MODE, false);
    }
}

// #1276 — Feel sheet. `groove.swing`/`swingSub`/`humanize` and `playback.complexity`
// are `document`-owned (`STATE_OWNERSHIP_MANIFEST`): they ride `captureContent()`'s
// existing `band.groove`/`performance` projection already, so no codec change is
// needed here, only the dispatch — same shape as `setStyle` above minus the
// worker-buffer flush, since none of these change note *selection*, only feel
// parameters the worker already re-reads live (`SET_SWING`/`SET_SWING_SUB`/
// `SET_COMPLEXITY` all have their own delta case in `worker-client.ts`).

/** `SET_SWING`'s reducer stores the raw 0-100 shuffle amount, not a 0-1 fraction. */
export function setSwing(value: number): void {
    dispatch(ACTIONS.SET_SWING, value);
}

/** `SET_SWING_SUB`'s reducer ignores an unrecognized grid rather than defaulting it. */
export function setSwingSub(sub: SwingSub): void {
    dispatch(ACTIONS.SET_SWING_SUB, sub);
}

/** Also a raw 0-100 value, like `setSwing` — not the 0-1 scale `setVolume`/`setReverb` use. */
export function setHumanize(value: number): void {
    dispatch(ACTIONS.SET_HUMANIZE, value);
}

/** 0-1 document field; the conductor's own opinion lives in the sibling runtime-derived
 * `playback.conductorDensity`/`conductorHarmonyComplexity` fields (#1064) and never
 * writes here. */
export function setComplexity(value: number): void {
    dispatch(ACTIONS.SET_COMPLEXITY, value);
}

// `playback.bandIntensity`/`autoIntensity`/`metronome` are `runtime-derived` —
// session-only by design (`docs/design/write-ownership.md` §3), never part of
// `ChartContent` or a preferences key. A user dispatch onto them is fine (the law
// only forbids a *runtime system* writing a document/preferences field); they
// simply reset to their engine defaults on next boot, same as v1.

/** Manual band-energy override; ignored by the engine while `autoIntensity` is on. */
export function setBandIntensity(value: number): void {
    dispatch(ACTIONS.SET_BAND_INTENSITY, value);
}

/** Hands band energy to the conductor's own ramp, mirroring `InstrumentRail.tsx`. */
export function setAutoIntensity(auto: boolean): void {
    dispatch(ACTIONS.SET_AUTO_INTENSITY, auto);
}

/** Click track on/off — session-only, like the two above. */
export function setMetronome(enabled: boolean): void {
    dispatch(ACTIONS.SET_METRONOME, enabled);
}

/**
 * `preferences`-owned: persists to its own device-local key (`session.ts`)
 * immediately, independent of the chart's own Save — mirrors v1's
 * `debounceSaveState` persisting `masterVolume` outside the chart-dirty flow
 * (`state/persistence.ts`). The live bus ramp itself is `state-effects.ts`'s
 * `SET_PARAM(masterVolume)` case, run by the `handleEffects` call already wired
 * into this module's dispatch subscriber.
 */
export function setMasterVolume(value: number): void {
    dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'masterVolume', value });
    rememberMasterVolume(value);
}

/**
 * Chord-notation preference — `document`-owned, but the ONE Feel-sheet field split
 * across the dual chart schema: a schemaVersion-1 chart keeps it on `arranger.notation`
 * directly (what `dispatch` below writes, and what `captureContent()`'s `arrangement`
 * projection reads), while a schemaVersion-2 (score) chart's saved copy lives on the
 * authored `currentScore.notation` instead — `captureSessionContent()` clones
 * `currentScore` verbatim for that schema and never reads `arranger.notation` for it.
 * Patch both so either schema's next `captureDocument()` reflects the change. No
 * `rebuild()`/`editScore()`: notation is a pure display selector over the chord's
 * already-precomputed `display: FormattedChordNames` (all three notations are always
 * present), so it never touches arrangement layout, generation, or the worker.
 */
export function setNotation(notation: ChartNotation): void {
    dispatch(ACTIONS.SET_NOTATION, notation);
    if (currentScore) {
        currentScore = { ...currentScore, notation };
    }
}

/**
 * The voice an Auto lane resolves to. `genre`/`chordStyle` default to the live
 * setup; pass them to resolve against a feel that has not been applied yet.
 */
export function recommendedVoice(
    module: InstrumentModule,
    genre?: string,
    chordStyle?: string,
): InstrumentVoice {
    const state = getState();
    const bandVoice =
        module === 'chords' ? bandAutoComp(genre ?? state.groove.lastSmartGenre) : null;
    if (bandVoice) {
        return bandVoice;
    }
    // Resolve the intended mapping, not a temporary synth fallback based on RAM.
    // Every caller prepares these files before committing the choice or playing.
    return autoVoiceForGenre(
        genre ?? state.groove.lastSmartGenre,
        module,
        () => true,
        chordStyle ?? state.chords.style,
    );
}

/** Called only after the explicit bulk install has fully succeeded. */
export async function applyGenreSounds(progress: (text: string) => void): Promise<void> {
    for (const module of AUTO_LANES) {
        const voice = recommendedVoice(module);
        if (voice !== 'synth') {
            await prepareSound(voice.slice(5), progress);
        }
    }
    for (const module of ['groove', 'bass', 'chords', 'harmony', 'soloist'] as const) {
        dispatch(ACTIONS.SET_INSTRUMENT_VOICE, {
            module,
            voice: recommendedVoice(module),
            auto: true,
        });
    }
    deriveSoloistModeOnBoot(getState(), dispatch);
    rebuild();
}

function apply(content: DocumentContent): void {
    const score = 'score' in content ? clone(content.score) : null;
    const plan = score ? prepareScorePlayback(score) : null;
    const arrangement =
        score && plan ? scoreArrangement(score, plan) : (content as ChartContent).arrangement;
    param('arranger', 'scorePlan', plan);
    currentScore = score;
    for (const [key, value] of Object.entries(arrangement)) {
        param('arranger', key, value);
    }
    param('arranger', 'seed', content.performance.seed);
    param('arranger', 'randomizeSeed', content.performance.randomizeSeed);
    param('playback', 'bpm', content.performance.bpm);
    param('playback', 'complexity', content.performance.complexity);
    for (const module of ['chords', 'bass', 'soloist', 'harmony', 'groove'] as const) {
        for (const [key, value] of Object.entries(content.band[module])) {
            if (key !== 'pattern') {
                param(module, key, value);
            }
        }
    }
    // Optional legacy source selector must not leak from the outgoing chart.
    param('chords', 'instrument', content.band.chords.instrument);
    param(
        'groove',
        'instruments',
        getState().groove.instruments.map((instrument) => ({
            ...instrument,
            muted: false,
            steps: [
                ...(content.band.groove.pattern.find((p) => p.name === instrument.name)?.steps ||
                    []),
            ],
        })),
    );
    dispatch(ACTIONS.SET_PRACTICE_LOOP, null);
    dispatch(ACTIONS.SET_START_STEP, 0);
    param('arranger', 'history', []);
}

export function load(document: ChartDocument): void {
    const checked = validateDocument(document);
    if (checked.schemaVersion === 2) {
        prepareScorePlayback(checked.chart.score);
    }
    stop();
    const previous = captureSessionContent();
    loading = true;
    try {
        apply(checked.chart);
        rebuild();
    } catch (error) {
        apply(previous);
        rebuild();
        throw error;
    } finally {
        loading = false;
    }
}

/**
 * Verify — downloading only if a file is missing — every sound the incoming feel
 * will select for a lane still on Auto. Deliberately runs before any engine state
 * changes: nothing is committed while this is in flight, so a failure has nothing
 * to undo and a band that is already playing keeps its time straight through it.
 */
async function prepareFeelSounds(name: string, progress: (text: string) => void): Promise<void> {
    const state = getState();
    // `resolveAutoVoices` reads the style the feel is about to install, so resolve
    // the chords lane against that rather than the outgoing style.
    const chordStyle = SMART_GENRES[name].chord ?? state.chords.style;
    for (const module of AUTO_LANES) {
        if (!state[module].autoSound) {
            continue;
        }
        const voice = recommendedVoice(module, name, chordStyle);
        if (voice !== 'synth') {
            await prepareSound(voice.slice(5), progress);
        }
    }
}

/**
 * Resolve once the scheduler has swapped in a feel that was staged for the next
 * measure start, or `false` if it never will. Polling is deliberate: the swap
 * happens inside `applyPendingGenre` in the audio scheduling loop, which offers no
 * completion signal to subscribe to, and a stopped scheduler never reaches a bar.
 */
function awaitStagedFeel(): Promise<boolean> {
    const deadline = Date.now() + STAGED_FEEL_TIMEOUT_MS;
    return new Promise((resolve) => {
        const check = () => {
            const { groove, playback } = getState();
            if (!groove.pendingGenreFeel) {
                resolve(true);
            } else if (!playback.isPlaying || Date.now() > deadline) {
                resolve(false);
            } else {
                setTimeout(check, 25);
            }
        };
        check();
    });
}

export async function setGenre(
    name: string,
    progress: (text: string) => void = () => {},
): Promise<void> {
    if (!Object.hasOwn(SMART_GENRES, name)) {
        throw new Error('Unknown genre.');
    }
    const wasPlaying = getState().playback.isPlaying;
    const previous = captureSessionContent();
    const payload = { genreName: name, ...SMART_GENRES[name] };
    // Captured before anything can stop the transport, so a Stop pressed during
    // preparation is still detectable as a cancellation further down.
    const intent = playIntent;
    try {
        // #1185 — prepare first, commit second. The old order stopped the band up
        // front so that preparation could not fail into a half-changed engine; the
        // same protection comes free from mutating nothing until the sounds are
        // verified, and the band plays on through the check.
        await prepareFeelSounds(name, progress);
        // Read before the dispatch, not after: the reducer only stages a feel when
        // the transport is already running, and the scheduler can make the swap
        // during the await below — so the state afterwards cannot tell the two
        // paths apart.
        const staged = getState().playback.isPlaying;
        dispatch(ACTIONS.SET_GENRE_FEEL, payload);
        // While playing, that reducer stages the feel and the scheduler swaps it in
        // at the next measure start (`applyPendingGenre`), re-anchoring the beat and
        // flushing the worker itself. So this dispatch plus the auto-voice effects
        // are the entire engine change: no teardown, no rebuild, no restart. A
        // `rebuild()` here would kill the notes the swap has just scheduled.
        await reconcileUrlGenreOnBoot(getState(), name, null, dispatch);
        if (!staged) {
            rebuild();
            return;
        }
        progress('Switching feel at the next bar…');
        if (await awaitStagedFeel()) {
            if (payload.drum && getState().groove.lastDrumPreset !== payload.drum) {
                // The swap fires its drum preset without awaiting it. Settle that
                // here so the document the caller captures next cannot pair the new
                // feel with the outgoing genre's pattern.
                await loadDrumPreset(payload.drum);
            }
        } else {
            // Stopped before the bar line (or the audio clock stalled), so the swap
            // will never happen on its own. Finish it here: with the transport
            // stopped the same payload applies immediately and brings its drum
            // preset with it, leaving the engine and the captured document
            // describing one setup rather than half of each.
            stop();
            dispatch(ACTIONS.SET_GENRE_FEEL, payload);
            await reconcileUrlGenreOnBoot(getState(), name, null, dispatch);
            rebuild();
        }
    } catch (error) {
        // A Stop that landed while we were preparing cancels the change outright:
        // the musician asked for silence, not for a band that resurrects itself.
        const cancelled = intent !== playIntent;
        stop();
        const resumeIntent = playIntent;
        loading = true;
        try {
            // A failure after the dispatch on line ~482 can leave a staged feel
            // behind: `apply()` restores the previous *document* content, but
            // `pendingGenreFeel` is runtime-derived and not part of that content,
            // so nothing else clears it. Left set, the scheduler would apply the
            // very feel we just failed to verify at the next measure start once
            // playback resumes below — landing the band on the failed genre while
            // `groove.genreFeel`/the UI still (correctly) read the previous one.
            param('groove', 'pendingGenreFeel', null);
            apply(previous);
            rebuild();
        } finally {
            loading = false;
        }
        if (wasPlaying && !cancelled) {
            // A failed new feel must not strand a still-playable old band. Recheck
            // its files too: an evicted old pack cannot earn silent synth fallback.
            try {
                await prepareSounds(previous, progress);
            } catch {
                throw new Error(
                    'Could not change feel or resume the previous sounds. Reconnect and press Play.',
                );
            }
            if (resumeIntent === playIntent) {
                startPlayback();
            }
        }
        throw error;
    }
}

export function setTempo(bpm: number): void {
    dispatch(ACTIONS.SET_BPM, Math.max(40, Math.min(240, Math.round(bpm))));
}
export function setEnabled(module: InstrumentModule, enabled: boolean): void {
    if (getState()[module].enabled !== enabled) {
        togglePower(module);
    }
}
export function transpose(delta: number): void {
    if (currentScore) {
        const score = clone(currentScore);
        score.key = transposeKeyName(score.key, delta);
        for (const section of score.sections) {
            if (section.key) {
                section.key = transposeKeyName(section.key, delta);
            }
            for (const measure of section.measures) {
                if (measure.key) {
                    measure.key = transposeKeyName(measure.key, delta);
                }
                if (measure.content.kind === 'events') {
                    for (const event of measure.content.events) {
                        if (event.kind === 'chord') {
                            event.symbol = transposeChordText(event.symbol, delta);
                            if (event.alternates) {
                                event.alternates = event.alternates.map((symbol) =>
                                    transposeChordText(symbol, delta),
                                );
                            }
                        }
                    }
                }
            }
        }
        const wasPlaying = getState().playback.isPlaying;
        editScore(score);
        if (wasPlaying) {
            startPlayback();
        }
        return;
    }
    transposeKey(delta);
}
/**
 * The song's own major/minor (#1375) — `score.isMinor` only, never a section or bar override.
 * Chord names are not rewritten, and the key stays where it is: unlike v1's relative-key toggle,
 * v2's key is the score's own, so a musician who wants A minor picks A, then Minor. Measure-based
 * charts only, like the Edit panel's Song meter that sits beside it.
 */
export function setMode(isMinor: boolean): void {
    if (!currentScore) {
        throw new Error('Open a measure-based chart first.');
    }
    if (currentScore.isMinor === isMinor) {
        return;
    }
    const wasPlaying = getState().playback.isPlaying;
    editScore({ ...clone(currentScore), isMinor });
    if (wasPlaying) {
        startPlayback();
    }
}
export function editScore(score: SemanticScore): void {
    prepareScorePlayback(score);
    const before = captureSessionContent();
    stop();
    loading = true;
    try {
        const { performance, band } = before;
        apply({ score, performance, band });
        rebuild();
    } catch (error) {
        apply(before);
        rebuild();
        throw error;
    } finally {
        loading = false;
    }
}
export function editSections(sections: ChartContent['arrangement']['sections']): void {
    if (currentScore) {
        throw new Error('Use the measure editor for this chart.');
    }
    const before = captureSessionContent();
    stop();
    loading = true;
    try {
        param('arranger', 'sections', clone(sections));
        rebuild();
    } catch (error) {
        apply(before);
        rebuild();
        throw error;
    } finally {
        loading = false;
    }
}
export function audition(index: number): void {
    if (getState().playback.isPlaying) {
        return;
    }
    initAudio(getState());
    const state = getState();
    const chord = state.arranger.progression[index];
    if (!chord || !state.playback.audio) {
        return;
    }
    for (const frequency of chord.freqs) {
        playNote(state, frequency, state.playback.audio.currentTime, 0.65, {
            vol: 0.12,
            instrument: 'Piano',
            ignoreSustain: true,
        });
    }
}
/**
 * Downloads a multi-track `.mid` of the current arrangement (#1277). Delegates
 * to the shared `exportToMidi` entry point — the same detached-worker realm v1's
 * ShareModal uses, so there is no second MIDI code path (root CLAUDE.md's "MIDI
 * has three interpretation paths" rule: live, MIDI-out, `.mid` — never a fourth).
 * The export clones state via `cloneStateForDetachedGeneration` and generates in
 * a fresh Worker, so it never touches the live scheduler/audio graph — safe to
 * call while the band is playing.
 */
export function exportMidi(filename: string): Promise<void> {
    if (ENGINE_NEXT) {
        const host = bandHost();
        host.setScore(scoreForBand());
        bandSeed ||= String(getState().arranger.seed || 'ensemble');
        const { events, timeline } = host.render(bandSettings());
        const bytes = toMidi(events, timeline, { bpm: getState().playback.bpm, title: filename });
        const name = `${filename.replace(/[^a-zA-Z0-9\s\-_()]/g, '').trim() || 'ensemble'}.mid`;
        downloadExportResult({
            blob: new Blob([bytes], { type: 'audio/midi' }),
            durationSeconds: 0,
            sampleRate: 0,
            filename: name,
        });
        return Promise.resolve();
    }
    return exportToMidi({ filename });
}

/** Cancels the in-flight {@link exportAudio} call, if any (#1278). Cooperative,
 * not a true mid-render abort — see {@link exportAudio}'s doc comment. */
export function cancelExportAudio(): void {
    exportIntent++;
}

/**
 * Downloads a WAV mix, or one WAV per stem, of the current arrangement
 * (#1278). On the old engine, delegates to the shared `renderCurrentSessionToWav`/
 * `renderStemsToWav` (public/export/audio-export.ts) — the same detached-clone
 * offline render v1's `ShareModal` uses (`cloneStateForRender`), so the live
 * scheduler/state tree is never written during the render; nothing here
 * dispatches. Under `?engine=next`, `band-export.ts`'s `renderBandMixToWav`/
 * `renderBandStemsToWav` render `BandHost.render()`'s event stream instead —
 * same detached-clone-plus-`OfflineAudioContext` mechanics, and the same
 * `playBandEvent` voice mapping the live band host schedules with, so an
 * exported next-mode mix matches what was heard live. Stems there are
 * drums/bass/chords (the comp) only: `soloist`/`harmony` have no band lane to render, and
 * `renderBandStemsToWav` drops them rather than erroring.
 *
 * Sampled voices must be installed before the render can use them —
 * `resolveInstrumentSource` (instrument-registry.ts) silently resolves an
 * uninstalled `pack:<id>` voice to the built-in synth, which would export
 * audio that doesn't match what the Sounds picker shows as selected for this
 * chart. Reuse the exact install path `toggle()` (Play) already runs before
 * playback — `prepareSounds` with the same progress callback shape — so a
 * missing pack visibly downloads first instead of the render silently
 * proceeding on a synth stand-in; a failed/declined install throws here and
 * the caller surfaces that as an error rather than exporting anyway.
 *
 * Cancellation is cooperative: `OfflineAudioContext` has no cancel primitive,
 * so a mix export (one render) can only be discarded after it finishes
 * (checked once more before the download fires). A stems export can stop
 * between stems — `onStemProgress` fires synchronously before each one starts,
 * so throwing {@link ExportCancelled} there unwinds `renderStemsToWav`'s loop
 * before any further stem renders — but a stem already in flight still
 * finishes. Either way, a cancelled call never reaches `downloadExportResult`.
 */
export async function exportAudio(
    kind: 'mix' | 'stems',
    filename: string,
    progress: (text: string) => void,
    instruments: StemInstrument[] = STEM_INSTRUMENTS,
): Promise<void> {
    const intent = ++exportIntent;
    await prepareSounds(captureContent(), progress);
    if (intent !== exportIntent) {
        return;
    }
    if (ENGINE_NEXT) {
        const host = bandHost();
        host.setScore(scoreForBand());
        bandSeed ||= String(getState().arranger.seed || 'ensemble');
        const bpm = getState().playback.bpm;
        if (kind === 'mix') {
            progress('Rendering mix…');
            const { events, timeline } = host.render(bandSettings());
            const result = await renderBandMixToWav(events, timeline, bpm, { filename });
            if (intent !== exportIntent) {
                return;
            }
            downloadExportResult(result);
            return;
        }
        // A stem always renders its lane even if it's muted live (the old engine's own stem
        // contract — see `renderStemsToWav`'s doc comment), so force every lane on for the one
        // pass every stem below is sliced from, rather than muting/soloing per-stem state.
        const { events, timeline } = host.render({
            ...bandSettings(),
            lanes: { drums: true, bass: true, comp: true },
        });
        try {
            const results = await renderBandStemsToWav(events, timeline, bpm, instruments, {
                filename,
                onStemProgress: ({ instrument, index, total }) => {
                    if (intent !== exportIntent) {
                        throw new ExportCancelled();
                    }
                    progress(`Rendering ${instrument} (${index + 1}/${total})…`);
                },
            });
            if (intent === exportIntent) {
                for (const result of results) {
                    downloadExportResult(result);
                }
            }
        } catch (error) {
            if (!(error instanceof ExportCancelled)) {
                throw error;
            }
        }
        return;
    }
    if (kind === 'mix') {
        progress('Rendering mix…');
        const result = await renderCurrentSessionToWav({ filename });
        if (intent !== exportIntent) {
            return;
        }
        downloadExportResult(result);
        return;
    }
    try {
        const results = await renderStemsToWav(instruments, {
            filename,
            onStemProgress: ({ instrument, index, total }) => {
                if (intent !== exportIntent) {
                    throw new ExportCancelled();
                }
                progress(`Rendering ${instrument} (${index + 1}/${total})…`);
            },
        });
        if (intent === exportIntent) {
            for (const result of results) {
                downloadExportResult(result);
            }
        }
    } catch (error) {
        if (!(error instanceof ExportCancelled)) {
            throw error;
        }
    }
}

export function state(): EnsembleState {
    return getState();
}
