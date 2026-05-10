import { arranger, arrangerReducer } from './state/arranger.js';
import { conductor, conductorReducer } from './state/conductor.js';
import { groove, grooveReducer } from './state/groove.js';
import { bass, chords, harmony, instrumentReducer, soloist } from './state/instruments.js';
import { midi, midiReducer } from './state/midi.js';
// Import Modular State Slices
import { playback, playbackReducer } from './state/playback.js';
import { vizReducer, vizState } from './state/visualizer.js';
import { ACTIONS } from './types.js';

// --- Global Export for E2E ---
if (typeof window !== 'undefined') {
    /** @type {Promise<any> | null} */
    let toolLoaderPromise = null;

    const ensemble = {
        dispatch,
        getState,
        ACTIONS,
        loadTools: () => {
            if (!toolLoaderPromise) {
                toolLoaderPromise = Promise.all([
                    import('./engine/chords-engine.js'),
                    import('./engine/scheduler-core.js'),
                    import('./engine/engine.js'),
                    import('./instrument-controller.js'),
                    import('./engine/tick-logic.js'),
                ]).then(
                    ([
                        chordsEngine,
                        schedulerCore,
                        engineModule,
                        instrumentController,
                        tickLogic,
                    ]) => {
                        Object.assign(ensemble, {
                            validateProgression: chordsEngine.validateProgression,
                            scheduleGlobalEvent: schedulerCore.scheduleGlobalEvent,
                            initAudio: engineModule.initAudio,
                            loadDrumPreset: instrumentController.loadDrumPreset,
                            generateNotesForStep: tickLogic.generateNotesForStep,
                        });
                        return ensemble;
                    },
                );
            }

            return toolLoaderPromise;
        },
    };

    /** @type {any} */ (window).ensemble = ensemble;
}

// Central State Map for Generic PARAM Updates
/**
 * @typedef {import('./types.js').EnsembleState} StateMap
 */

/**
 * @type {StateMap}
 */
export const stateMap = {
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
 * @returns {import('./types.js').EnsembleState}
 */
export function getState() {
    return stateMap;
}

/**
 * Creates a worker-safe, raw snapshot of the global state.
 * Strips deepSignal proxies and filter for necessary worker properties.
 * @returns {Object}
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
            style: soloist.style,
            octave: soloist.octave,
            enabled: soloist.enabled,
            lastFreq: soloist.lastFreq,
            volume: soloist.volume,
            mode: soloist.mode,
            sessionSteps: soloist.sessionSteps,
            seed: soloist.seed,
            sessionSeed: soloist.sessionSeed,
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
            instruments: groove.instruments.map((/** @type {any} */ i) => ({
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
    /**
     * @param {string} key
     * @returns {any}
     */
    get: (key) => {
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
    /**
     * @param {string} key
     * @param {any} val
     */
    save: (key, val) => {
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

/** @type {Set<Function>} */
const listeners = new Set();

/**
 * Dispatch a state change action.
 * @template {keyof import('./types.js').ActionPayloadMap | string} T
 * @param {T} action - The action type (e.g., ACTIONS.SET_BAND_INTENSITY).
 * @param {T extends keyof import('./types.js').ActionPayloadMap ? import('./types.js').ActionPayloadMap[T] : any} [payload] - The data associated with the action.
 */
export function dispatch(action, payload) {
    // Accessing deepSignal property directly works like a getter
    const oldBpm = playback.bpm;

    // Delegate to Reducers
    playbackReducer(action, payload);
    arrangerReducer(action, payload);
    conductorReducer(action, payload);
    instrumentReducer(action, payload);
    grooveReducer(action, payload, playback);
    midiReducer(action, payload);
    vizReducer(action, payload);

    // Notify listeners
    listeners.forEach((listener) => listener(action, payload, stateMap, { oldBpm, dispatch }));
}

/**
 * Subscribe to state changes.
 * @param {Function} listener - Callback function receiving (action, payload, state).
 * @returns {Function} Unsubscribe function.
 */
export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
