import { arranger, arrangerReducer } from './state/arranger.js';
import { conductor, conductorReducer } from './state/conductor.js';
import { groove, grooveReducer } from './state/groove.js';
import { bass, chords, harmony, instrumentReducer, soloist } from './state/instruments.js';
import { midi, midiReducer } from './state/midi.js';
// Import Modular State Slices
import { playback, playbackReducer } from './state/playback.js';
import { vizReducer, vizState } from './state/visualizer.js';
import type {
    Action,
    ActionPayloadMap,
    ArrangerState,
    BassState,
    ChordState,
    Dispatch,
    EnsembleState,
    GlobalContext,
    GrooveState,
    HarmonyState,
    MidiState,
    SoloistState,
} from './types.js';

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

// --- Worker sync payload builders ---
// One builder per module, shared by the full-snapshot sync (getSyncState, below)
// and the hard-flush sync (syncAndFlushWorker in engine/scheduler-core.ts). Add a
// newly-worker-relevant field here ONCE and both call sites pick it up — the two
// used to be independently hand-maintained and drifted (#906; see the #698
// chords-voice/note-generation sync bug this class of gap already caused).

export function buildPlaybackSyncPayload(playback: GlobalContext) {
    return {
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
        songMode: playback.songMode,
        isEndingPending: playback.isEndingPending,
        currentLoopCount: playback.currentLoopCount,
        // #1016 — section-practice loop bounds. The worker folds its buffer
        // fill within [loopStartStep, loopEndStep) so a drilled section keeps
        // generating notes (rather than filling past into the next section).
        loopStartStep: playback.loopStartStep,
        loopEndStep: playback.loopEndStep,
    };
}

export function buildArrangerSyncPayload(arranger: ArrangerState) {
    return {
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
        seed: arranger.seed,
    };
}

export function buildChordsSyncPayload(chords: ChordState) {
    return {
        style: chords.style,
        octave: chords.octave,
        density: chords.density,
        enabled: chords.enabled,
        volume: chords.volume,
        rhythmicMask: chords.rhythmicMask,
        // #698 — the chords voice now drives NOTE GENERATION (power-chord
        // voicing for the crunch rhythm-guitar pack), so the worker needs it.
        // Previously voice was a main-thread-only audio-routing concern.
        voice: chords.voice,
    };
}

export function buildBassSyncPayload(bass: BassState) {
    return {
        style: bass.style,
        octave: bass.octave,
        enabled: bass.enabled,
        lastFreq: bass.lastFreq,
        volume: bass.volume,
    };
}

export function buildSoloistSyncPayload(soloist: SoloistState) {
    return {
        // Wire shape mirrors the local SoloistState layout (config flat at
        // top; engine-runtime fields under `session` / `audio`) so the
        // worker can apply it with `recursiveSafeSync` directly.
        style: soloist.style,
        octave: soloist.octave,
        enabled: soloist.enabled,
        volume: soloist.volume,
        mode: soloist.mode,
        phrasingIntensity: soloist.phrasingIntensity,
        tradeMode: soloist.tradeMode,
        session: {
            sessionSteps: soloist.session.sessionSteps,
            seed: soloist.session.seed,
        },
        audio: {
            lastFreq: soloist.audio.lastFreq,
        },
    };
}

export function buildHarmonySyncPayload(harmony: HarmonyState) {
    return {
        style: harmony.style,
        octave: harmony.octave,
        enabled: harmony.enabled,
        volume: harmony.volume,
        reverb: harmony.reverb,
        complexity: harmony.complexity,
    };
}

export function buildGrooveSyncPayload(groove: GrooveState) {
    return {
        enabled: groove.enabled,
        genreFeel: groove.genreFeel,
        swing: groove.swing,
        swingSub: groove.swingSub,
        humanize: groove.humanize,
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
    };
}

export function buildMidiSyncPayload(midi: MidiState) {
    return {
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
    };
}

/**
 * Creates a worker-safe, raw snapshot of the global state.
 * Strips deepSignal proxies and filters for necessary worker properties.
 */
export function getSyncState() {
    const { playback, arranger, chords, bass, soloist, harmony, groove, midi } = stateMap;

    return {
        playback: buildPlaybackSyncPayload(playback),
        arranger: buildArrangerSyncPayload(arranger),
        chords: buildChordsSyncPayload(chords),
        bass: buildBassSyncPayload(bass),
        soloist: buildSoloistSyncPayload(soloist),
        harmony: buildHarmonySyncPayload(harmony),
        groove: buildGrooveSyncPayload(groove),
        midi: buildMidiSyncPayload(midi),
    };
}

export { arranger, playback };

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

export const dispatch: Dispatch = (action, ...args) => {
    const payload = args[0] as ActionPayloadMap[typeof action];
    // Accessing deepSignal property directly works like a getter
    const oldBpm = playback.bpm;

    // Bundle into a discriminated Action; reducers switch on action.type.
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
};

/**
 * Subscribe to state changes.
 * @returns Unsubscribe function.
 */
export function subscribe(listener: StateListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
