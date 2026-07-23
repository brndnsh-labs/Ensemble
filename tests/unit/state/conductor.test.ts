import { describe, expect, it } from 'vitest';
import { conductor, conductorReducer } from '../../../public/state/conductor.js';
import { ACTIONS } from '../../../public/types.js';

describe('Conductor State Slice', () => {
    it('should have initial state', () => {
        expect(conductor.targetIntensity).toBe(0.35);
        expect(conductor.formIteration).toBe(0);
    });

    it('should update state via UPDATE_CONDUCTOR_STATE', () => {
        conductorReducer({
            type: ACTIONS.UPDATE_CONDUCTOR_STATE,
            payload: {
                targetIntensity: 0.8,
            },
        });
        expect(conductor.targetIntensity).toBe(0.8);
    });

    it('should reset state via RESET_STATE', () => {
        // First mutate
        conductorReducer({
            type: ACTIONS.UPDATE_CONDUCTOR_STATE,
            payload: {
                targetIntensity: 0.9,
                formIteration: 10,
            },
        });

        // Then reset
        conductorReducer({ type: ACTIONS.RESET_STATE, payload: undefined });

        expect(conductor.targetIntensity).toBe(0.35);
        expect(conductor.formIteration).toBe(0);
    });
});
