import { loadDrumPreset } from './controllers/instrument-controller.js';
import { loopArcMultiplier } from './engine/arc.js';
import { validateProgression } from './engine/chords-engine.js';
import { generateSoloistAccents } from './engine/drum-seeder.js';
import { initAudio } from './engine/engine.js';
import { calculateStepDuration } from './engine/groove-engine.js';
import { isPackLoaded } from './engine/instrument-registry.js';
import { ensurePackLoaded, getPackZones } from './engine/pack-runtime.js';
import { scheduleGlobalEvent } from './engine/scheduler-core.js';
import { generateSessionSeed } from './engine/soloist-seeder.js';
import { generateNotesForStep } from './engine/tick-logic.js';
import { getEffectiveMeterAtStep } from './meter.js';
import { dispatch, getState } from './state.js';
import { ACTIONS } from './types.js';

/**
 * The offline-render bridge: engine internals on `window.ensemble` for the listening-gate
 * tools (`scripts/mix-report.ts` and the scripts that drive it — `mix:ab`, `mix:verify`,
 * `plant-defects`). The v2 runtime installs it only in a build made with
 * `NEXT_PUBLIC_RENDER_BRIDGE=1`, which `mix:report` makes for itself; a production build
 * never sets the flag, so the branch and this module are compiled out of it.
 */
export function installRenderBridge(): void {
    if (typeof window === 'undefined') {
        return;
    }
    window.ensemble = {
        dispatch,
        getState,
        ACTIONS,
        validateProgression,
        scheduleGlobalEvent,
        calculateStepDuration,
        getEffectiveMeterAtStep,
        initAudio,
        loadDrumPreset,
        generateNotesForStep,
        generateSessionSeed,
        generateSoloistAccents,
        loopArcMultiplier,
        ensurePackLoaded,
        getPackZones,
        isPackLoaded,
    };
}
