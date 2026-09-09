import { transposeKey } from '@engine/controllers/arranger-controller';
import {
    flushBuffers,
    loadDrumPreset,
    togglePower,
} from '@engine/controllers/instrument-controller';
import { autoVoiceForGenre } from '@engine/data/genre-sound-map';
import { GENRE_NAMES, SMART_GENRES } from '@engine/data/smart-genres';
import { registerScorePlaybackRenderer, validateProgression } from '@engine/engine/chords-engine';
import { analyzeFormUI } from '@engine/engine/conductor';
import { initAudio, playNote, restoreGains, syncBusReverbSend } from '@engine/engine/engine';
import { scheduler } from '@engine/engine/scheduler-core';
import { isSoloistMonophonicMode } from '@engine/engine/soloist-mode-policy';
import { transposeChordText } from '@engine/engine/transpose';
import {
    prepareScorePlayback,
    renderScorePlayback,
    scoreArrangement,
} from '@engine/songbook/score-playback';
import type { SemanticScore } from '@engine/songbook/score-types';
import type { ChartContent, ChartLaneMix } from '@engine/songbook/types';
import { dispatch, getState, subscribe } from '@engine/state';
import {
    deriveSoloistModeOnBoot,
    handleEffects,
    reconcileUrlGenreOnBoot,
} from '@engine/state/state-effects';
import {
    ACTIONS,
    type EnsembleState,
    type InstrumentModule,
    type InstrumentVoice,
} from '@engine/types';
import { transposeKeyName } from '@engine/utils';
import { initWorker, syncWorker } from '@engine/worker-client';
import { type ChartDocument, type DocumentContent, validateDocument } from './documents';
import { initializeSounds, prepareSound, prepareSounds, validateVoice } from './sounds';

export type { ChartContent, ChartDocument };
export { GENRE_NAMES };

let boot: Promise<void> | undefined;
let loading = false;
let playIntent = 0;
// Authored source belongs to the host document, never to generated runtime state.
let currentScore: SemanticScore | null = null;
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
            initWorker(
                () => scheduler(getState(), dispatch),
                (notes, _sent, _duration, resolution) => receiveNotes(notes, resolution),
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

export function recommendedVoice(module: InstrumentModule): InstrumentVoice {
    const state = getState();
    // Resolve the intended mapping, not a temporary synth fallback based on RAM.
    // Every caller prepares these files before committing the choice or playing.
    return autoVoiceForGenre(state.groove.lastSmartGenre, module, () => true, state.chords.style);
}

/** Called only after the explicit bulk install has fully succeeded. */
export async function applyGenreSounds(progress: (text: string) => void): Promise<void> {
    for (const module of ['groove', 'bass', 'chords', 'harmony', 'soloist'] as const) {
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

export async function setGenre(
    name: string,
    progress: (text: string) => void = () => {},
): Promise<void> {
    if (!Object.hasOwn(SMART_GENRES, name)) {
        throw new Error('Unknown genre.');
    }
    const wasPlaying = getState().playback.isPlaying;
    const previous = captureSessionContent();
    stop();
    const intent = playIntent;
    try {
        dispatch(ACTIONS.SET_GENRE_FEEL, { genreName: name, ...SMART_GENRES[name] });
        for (const module of ['groove', 'bass', 'chords', 'harmony', 'soloist'] as const) {
            if (getState()[module].autoSound) {
                const voice = recommendedVoice(module);
                if (voice !== 'synth') {
                    await prepareSound(voice.slice(5), progress);
                }
            }
        }
        await reconcileUrlGenreOnBoot(getState(), name, null, dispatch);
        rebuild();
        if (wasPlaying && intent === playIntent) {
            await prepareSounds(captureContent(), progress);
            if (intent === playIntent) {
                dispatch(ACTIONS.TOGGLE_PLAY);
            }
        }
    } catch (error) {
        loading = true;
        try {
            apply(previous);
            rebuild();
        } finally {
            loading = false;
        }
        if (wasPlaying && intent === playIntent) {
            // A failed new feel must not strand a still-playable old band. Recheck
            // its files too: an evicted old pack cannot earn silent synth fallback.
            try {
                await prepareSounds(previous, progress);
            } catch {
                throw new Error(
                    'Could not change feel or resume the previous sounds. Reconnect and press Play.',
                );
            }
            if (intent === playIntent) {
                dispatch(ACTIONS.TOGGLE_PLAY);
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
            dispatch(ACTIONS.TOGGLE_PLAY);
        }
        return;
    }
    transposeKey(delta);
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
export function state(): EnsembleState {
    return getState();
}
