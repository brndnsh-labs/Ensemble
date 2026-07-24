import { loadDrumPreset } from './controllers/instrument-controller.js';
import { loopArcMultiplier } from './engine/arc.js';
import { validateProgression } from './engine/chords-engine.js';
import { initAudio } from './engine/engine.js';
import { isPackLoaded } from './engine/instrument-registry.js';
import { ensurePackLoaded, getPackZones } from './engine/pack-runtime.js';
import { scheduleGlobalEvent } from './engine/scheduler-core.js';
import { generateNotesForStep } from './engine/tick-logic.js';
import { dispatch, getState } from './state.js';
import { ACTIONS } from './types.js';

export function installE2EGlobals(): void {
    if (typeof window === 'undefined') {
        return;
    }
    window.ensemble = {
        dispatch,
        getState,
        ACTIONS,
        validateProgression,
        scheduleGlobalEvent,
        initAudio,
        loadDrumPreset,
        generateNotesForStep,
        loopArcMultiplier,
        ensurePackLoaded,
        getPackZones,
        isPackLoaded,
    };
}
