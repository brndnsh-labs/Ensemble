import { arranger, arrangerReducer } from './state/arranger.js';
import { conductor, conductorReducer } from './state/conductor.js';
import { groove, grooveReducer } from './state/groove.js';
import { bass, chords, harmony, instrumentReducer, soloist } from './state/instruments.js';
import { midi, midiReducer } from './state/midi.js';
// Import Modular State Slices
import { playback, playbackReducer } from './state/playback.js';
import { vizReducer, vizState } from './state/visualizer.js';
import type { Action, ActionPayloadMap, ArrangerState, Dispatch, EnsembleState } from './types.js';

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
    action: Action,
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

    // Notify listeners with the same discriminated Action reducers already switch on.
    listeners.forEach((listener) => listener(a, stateMap, { oldBpm, dispatch }));
};

/**
 * Subscribe to state changes.
 * @returns Unsubscribe function.
 */
export function subscribe(listener: StateListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
