import { describe, expect, it } from 'vitest';
import { conductor, conductorReducer } from '../../../public/state/conductor.js';
import { ACTIONS } from '../../../public/types.js';

describe('Conductor State Slice', () => {
    it('should have initial state', () => {
        expect(conductor.targetIntensity).toBe(0.35);
        expect(conductor.larsBpmOffset).toBe(0);
        expect(conductor.loopCount).toBe(0);
    });

    it('should update state via UPDATE_CONDUCTOR_STATE', () => {
        conductorReducer(ACTIONS.UPDATE_CONDUCTOR_STATE, {
            targetIntensity: 0.8,
            larsBpmOffset: 2.5,
        });
        expect(conductor.targetIntensity).toBe(0.8);
        expect(conductor.larsBpmOffset).toBe(2.5);
    });

    it('should reset state via RESET_STATE', () => {
        // First mutate
        conductorReducer(ACTIONS.UPDATE_CONDUCTOR_STATE, {
            targetIntensity: 0.9,
            larsBpmOffset: 5,
            loopCount: 10,
        });

        // Then reset
        conductorReducer(ACTIONS.RESET_STATE);

        expect(conductor.targetIntensity).toBe(0.35);
        expect(conductor.larsBpmOffset).toBe(0);
        expect(conductor.loopCount).toBe(0);
    });
});
