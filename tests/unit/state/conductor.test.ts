import { describe, expect, it } from 'vitest';
import { conductor } from '../../../public/state/conductor.js';

describe('Conductor State Slice', () => {
    it('should have initial state', () => {
        expect(conductor.targetIntensity).toBe(0.35);
        expect(conductor.formIteration).toBe(0);
    });
});
