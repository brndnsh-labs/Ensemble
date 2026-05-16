import { arranger, arrangerReducer } from './state/arranger.js';
import { conductor, conductorReducer } from './state/conductor.js';
import { groove, grooveReducer } from './state/groove.js';
import { bass, chords, harmony, instrumentReducer, soloist } from './state/instruments.js';
import { midi, midiReducer } from './state/midi.js';
// Import Modular State Slices
import { playback, playbackReducer } from './state/playback.js';
import { vizReducer, vizState } from './state/visualizer.js';
import type { Action, ActionPayloadMap, EnsembleState } from './types.js';

/** @deprecated Use EnsembleState directly */
export type StateMap = EnsembleState;

export const stateMap: EnsembleState = {
    playback,
    chords,
    bass,
    soloist,
    groove,
    harmony,
    arranger,
    vizState,
    midi,
    conductor,
};

/**
 * Unified getter for global state.
 * Use this instead of importing individual state slices to ensure
 * easier refactoring and better type safety in the future.
 */
export function getState(): EnsembleState {
    return stateMap;
}

/**
 * Creates a worker-safe, raw snapshot of the global state.
 * Strips deepSignal proxies and filters for necessary worker properties.
 */
export function getSyncState() {
    const { playback, arranger, chords, bass, soloist, harmony, groove, midi } = stateMap;

    return {
        playback: {
            isPlaying: playback.isPlaying,
            step: playback.step,
            bpm: playback.bpm,
            bandIntensity: playback.bandIntensity,
            complexity: playback.complexity,
            autoIntensity: playback.autoIntensity,
            practiceMode: playback.practiceMode,
            sessionTimer: playback.sessionTimer,
            sessionStartTime: playback.sessionStartTime,
            modals: {},
            intent: playback.intent,
            conductorVelocity: playback.conductorVelocity,
            lyricalBias: playback.lyricalBias,
            songMode: playback.songMode,
            isEndingPending: playback.isEndingPending,
        },
        arranger: {
            progression: arranger.progression,
            stepMap: arranger.stepMap,
            sectionMap: arranger.sectionMap,
            totalSteps: arranger.totalSteps,
            key: arranger.key,
            isMinor: arranger.isMinor,
            timeSignature: arranger.timeSignature,
            grouping: arranger.grouping,
            sections: arranger.sections,
            measureMap: arranger.measureMap,
        },
        chords: {
            style: chords.style,
            octave: chords.octave,
            density: chords.density,
            enabled: chords.enabled,
            volume: chords.volume,
            rhythmicMask: chords.rhythmicMask,
        },
        bass: {
            style: bass.style,
            octave: bass.octave,
            enabled: bass.enabled,
            lastFreq: bass.lastFreq,
            volume: bass.volume,
        },
        soloist: {
            // Wire format remains flat — worker keeps its own flat mirror.
            style: soloist.style,
            octave: soloist.octave,
            enabled: soloist.enabled,
            lastFreq: soloist.audio.lastFreq,
            volume: soloist.volume,
            mode: soloist.mode,
            sessionSteps: soloist.session.sessionSteps,
            seed: soloist.seed,
            sessionSeed: soloist.session.seed,
            phrasingIntensity: soloist.phrasingIntensity,
            tradeMode: soloist.tradeMode,
            hookRetentionProb: soloist.hookRetentionProb,
        },
        harmony: {
            style: harmony.style,
            octave: harmony.octave,
            enabled: harmony.enabled,
            volume: harmony.volume,
            reverb: harmony.reverb,
            complexity: harmony.complexity,
            pocketOffset: harmony.pocketOffset,
        },
        groove: {
            enabled: groove.enabled,
            genreFeel: groove.genreFeel,
            swing: groove.swing,
            swingSub: groove.swingSub,
            humanize: groove.humanize,
            pocket: groove.pocket,
            creativity: groove.creativity,
            sectionSeedMap: groove.sectionSeedMap,
            lastDrumPreset: groove.lastDrumPreset,
            fillActive: groove.fillActive,
            variations: groove.variations,
            measures: groove.measures,
            orchestrationMap: groove.orchestrationMap,
            fillMap: groove.fillMap,
            accentMap: groove.accentMap,
            seedTimelineStartStep: groove.seedTimelineStartStep,
            instruments: groove.instruments.map((i: any) => ({
                name: i.name,
                steps: [...i.steps],
                muted: i.muted,
            })),
        },
        midi: {
            enabled: midi.enabled,
            chordsChannel: midi.chordsChannel,
            bassChannel: midi.bassChannel,
            soloistChannel: midi.soloistChannel,
            harmonyChannel: midi.harmonyChannel,
            drumsChannel: midi.drumsChannel,
            latency: midi.latency,
            chordsOctave: midi.chordsOctave,
            bassOctave: midi.bassOctave,
            soloistOctave: midi.soloistOctave,
            harmonyOctave: midi.harmonyOctave,
            drumsOctave: midi.drumsOctave,
            velocitySensitivity: midi.velocitySensitivity,
        },
    };
}

// Export individual state slices for dynamic imports
export {
    arranger,
    arrangerReducer,
    bass,
    chords,
    conductor,
    conductorReducer,
    groove,
    grooveReducer,
    harmony,
    instrumentReducer,
    midi,
    midiReducer,
    playback,
    playbackReducer,
    soloist,
    vizReducer,
    vizState,
};

// Persistence Helpers
export const storage = {
    get: (key: string): any => {
        if (typeof localStorage === 'undefined' || !localStorage?.getItem) {
            return [];
        }
        try {
            return JSON.parse(localStorage.getItem(`ensemble_${key}`) || '[]');
        } catch (e) {
            console.error(`[State] Failed to load ${key} from storage:`, e);
            return [];
        }
    },
    save: (key: string, val: any): void => {
        if (typeof localStorage === 'undefined' || !localStorage?.setItem) {
            return;
        }
        try {
            localStorage.setItem(`ensemble_${key}`, JSON.stringify(val));
        } catch (e) {
            console.warn(`[State] Failed to save ${key} to storage:`, e);
        }
    },
};

// --- Event Bus / State Manager ---

type StateListener = (
    action: string,
    payload: any,
    state: EnsembleState,
    meta: { oldBpm: number; dispatch: typeof dispatch },
) => void;

const listeners = new Set<StateListener>();

export function dispatch<T extends keyof ActionPayloadMap>(
    action: T,
    payload: ActionPayloadMap[T],
): void;
export function dispatch(action: string, payload?: any): void;
export function dispatch(action: any, payload?: any): void {
    // Accessing deepSignal property directly works like a getter
    const oldBpm = playback.bpm;

    // Bundle into a discriminated Action; reducers switch on action.type.
    // Unmapped string actions still flow through — they hit each reducer's default arm.
    const a = { type: action, payload } as Action;

    // Delegate to Reducers
    playbackReducer(a);
    arrangerReducer(a);
    conductorReducer(a);
    instrumentReducer(a);
    grooveReducer(a, playback);
    midiReducer(a);
    vizReducer(a);

    // Notify listeners (legacy two-arg shape preserved)
    listeners.forEach((listener) => listener(action, payload, stateMap, { oldBpm, dispatch }));
}

/**
 * Subscribe to state changes.
 * @returns Unsubscribe function.
 */
export function subscribe(listener: StateListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
