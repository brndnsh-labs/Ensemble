import { validateProgression } from './engine/chords-engine.js';
import { initAudio } from './engine/engine.js';
import { scheduleGlobalEvent } from './engine/scheduler-core.js';
import { generateNotesForStep } from './engine/tick-logic.js';
import { loadDrumPreset } from './instrument-controller.js';
import { dispatch, getState } from './state.js';
import { ACTIONS } from './types.js';

export function installE2EGlobals(): void {
    if (typeof window === 'undefined') {
        return;
    }
    (window as any).ensemble = {
        dispatch,
        getState,
        ACTIONS,
        validateProgression,
        scheduleGlobalEvent,
        initAudio,
        loadDrumPreset,
        generateNotesForStep,
    };
}
