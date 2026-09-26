import { describe, expect, it } from 'vitest';
import { conductor, conductorReducer } from '../../../public/state/conductor.js';
import { ACTIONS, type Mutable } from '../../../public/types.js';

describe('Conductor State Slice', () => {
    it('should have initial state', () => {
        expect(conductor.targetIntensity).toBe(0.35);
        expect(conductor.formIteration).toBe(0);
    });

    it('should reset state via RESET_STATE', () => {
        // First mutate
        const mutable = conductor as Mutable<typeof conductor>;
        mutable.targetIntensity = 0.9;
        mutable.formIteration = 10;

        // Then reset
        conductorReducer({ type: ACTIONS.RESET_STATE, payload: undefined });

        expect(conductor.targetIntensity).toBe(0.35);
        expect(conductor.formIteration).toBe(0);
    });
});
