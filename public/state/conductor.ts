import { deepSignal } from 'deepsignal/core';
import type { Action, ConductorState } from '../types.js';

export type { ConductorState };

export const conductor = deepSignal<ConductorState>({
    targetIntensity: 0.35,
    stepSize: 0.0005,
    form: null,
    formIteration: 0,
});

// #1381 — RESET_STATE was this reducer's only case (v1's hydration-boot
// fallback, deleted with v1's load/save layer in #1424); nothing else ever
// wrote to this slice. Left as a no-op: state.ts's dispatch fan-out still
// calls it unconditionally, same as any other reducer with no matching case.
export function conductorReducer(_action: Action): boolean {
    return false;
}
