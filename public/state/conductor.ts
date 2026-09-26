import { deepSignal } from 'deepsignal/core';
import type { ConductorState } from '../types.js';

export type { ConductorState };

// #1381 — no reducer here: RESET_STATE was this slice's only case (v1's
// hydration-boot fallback, deleted with v1's load/save layer in #1424), and
// nothing else ever wrote to it — state.ts's dispatch fan-out called a
// permanently no-op `conductorReducer` for every action in the app. The slice
// itself stays: `section-overrides.ts` still reads `conductor.targetIntensity`
// (always its 0.35 default, since nothing writes it), and it remains part of
// `EnsembleState`/the offline-render clone.
export const conductor = deepSignal<ConductorState>({
    targetIntensity: 0.35,
    stepSize: 0.0005,
    form: null,
    formIteration: 0,
});
