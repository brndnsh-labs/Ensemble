import { describe, expect, it } from 'vitest';
import { conductor, conductorReducer } from '../../../public/state/conductor.js';

describe('Conductor State Slice', () => {
    it('should have initial state', () => {
        expect(conductor.targetIntensity).toBe(0.35);
        expect(conductor.formIteration).toBe(0);
    });

    // #1381 — RESET_STATE (this reducer's only case) was v1's hydration-boot
    // fallback, deleted with v1's load/save layer in #1424. Nothing else
    // writes to this slice, so the reducer is a no-op for every action.
    it('handles no actions (nothing dispatches to this slice)', () => {
        expect(conductorReducer({ type: 'UNKNOWN', payload: undefined } as any)).toBe(false);
    });
});
