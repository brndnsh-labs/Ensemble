import { transposeKey } from '@engine/controllers/arranger-controller';
import {
    flushBuffers,
    loadDrumPreset,
    togglePower,
} from '@engine/controllers/instrument-controller';
import { GENRE_NAMES, SMART_GENRES } from '@engine/data/smart-genres';
import { validateProgression } from '@engine/engine/chords-engine';
import { analyzeFormUI } from '@engine/engine/conductor';
import { initAudio, playNote, restoreGains, syncBusReverbSend } from '@engine/engine/engine';
import { scheduler } from '@engine/engine/scheduler-core';
import { isSoloistMonophonicMode } from '@engine/engine/soloist-mode-policy';
import { validateChartDocument } from '@engine/songbook/codec';
import type { ChartContent, ChartDocument, ChartLaneMix } from '@engine/songbook/types';
import { dispatch, getState, subscribe } from '@engine/state';
import { handleEffects, reconcileUrlGenreOnBoot } from '@engine/state/state-effects';
import {
    ACTIONS,
    type EnsembleState,
    type InstrumentModule,
    type InstrumentVoice,
} from '@engine/types';
import { initWorker, syncWorker } from '@engine/worker-client';
import { initializeSounds, prepareSound, prepareSounds, validateVoice } from './sounds';

export type { ChartContent, ChartDocument };
export { GENRE_NAMES };

let boot: Promise<void> | undefined;
let loading = false;
let playIntent = 0;
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
            bpm: p.rampBpmTarget > 0 ? p.rampBpmTarget : p.bpm,
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
        boot = (async () => {
            initializeSounds();
            initWorker(
                () => scheduler(getState(), dispatch),
                (notes, _sent, _duration, resolution) => receiveNotes(notes, resolution),
            );
            await loadDrumPreset('Basic Rock');
            subscribe((action, state, context) => {
                if (loading) {
                    return;
                }
                syncWorker(action.type, action.payload);
                // The async genre effect is awaited explicitly by setGenre below.
                if (action.type !== ACTIONS.SET_GENRE_FEEL) {
                    handleEffects(action, state, context);
                }
            });
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
        })();
    }
    return boot;
}

export function stop(): void {
    playIntent++;
    if (getState().playback.isPlaying) {
        dispatch(ACTIONS.TOGGLE_PLAY);
    }
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
    dispatch(ACTIONS.TOGGLE_PLAY);
}

export async function setVoice(
    module: InstrumentModule,
    voice: InstrumentVoice,
    progress: (text: string) => void,
): Promise<void> {
    validateVoice(module, voice);
    if (voice !== 'synth') {
        await prepareSound(voice.slice(5), progress);
    }
    // Keep the old selection throughout download/failure. Dispatch through the
    // established effects and worker delta (including crunch chord voicing).
    dispatch(ACTIONS.SET_INSTRUMENT_VOICE, { module, voice, auto: false });
    rebuild();
}

function apply(content: ChartContent): void {
    for (const [key, value] of Object.entries(content.arrangement)) {
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
    const result = validateChartDocument(document);
    if (result.kind !== 'ok') {
        throw new Error('This chart document is invalid or from an unsupported version.');
    }
    stop();
    const previous = captureContent();
    loading = true;
    try {
        apply(result.value.chart);
        rebuild();
    } catch (error) {
        apply(previous);
        rebuild();
        throw error;
    } finally {
        loading = false;
    }
}

export async function setGenre(name: string): Promise<void> {
    if (!Object.hasOwn(SMART_GENRES, name)) {
        throw new Error('Unknown genre.');
    }
    const wasPlaying = getState().playback.isPlaying;
    stop();
    dispatch(ACTIONS.SET_GENRE_FEEL, { genreName: name, ...SMART_GENRES[name] });
    await reconcileUrlGenreOnBoot(getState(), name, null, dispatch);
    rebuild();
    if (wasPlaying) {
        dispatch(ACTIONS.TOGGLE_PLAY);
    }
}

export function setTempo(bpm: number): void {
    dispatch(ACTIONS.SET_BPM, Math.max(40, Math.min(300, Math.round(bpm))));
}
export function setEnabled(module: InstrumentModule, enabled: boolean): void {
    if (getState()[module].enabled !== enabled) {
        togglePower(module);
    }
}
export function transpose(delta: number): void {
    transposeKey(delta);
}
export function editSections(sections: ChartContent['arrangement']['sections']): void {
    const before = captureContent();
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
export function state(): EnsembleState {
    return getState();
}
