/* eslint-disable */
import { describe, expect, it } from 'vitest';
import { normalizeMidiVelocity } from '../../../public/engine/midi-utils.js';
import { getState } from '../../../public/state.js';
import type { Mutable } from '../../../public/types.js';

const state = getState();
const midi = state.midi as Mutable<typeof state.midi>;

describe('MIDI Velocity Mapping', () => {
    it('should boost low velocities significantly', () => {
        midi.velocitySensitivity = 1.0;

        // 0.1 Internal (Ghost note)
        // Old: 8
        // New (Curve 0.8): ~20+
        const vLow = normalizeMidiVelocity(0.1);
        expect(vLow).toBeGreaterThanOrEqual(20);

        // 0.5 Internal (Soft)
        // Old: 42
        // New: ~55+
        const vMid = normalizeMidiVelocity(0.5);
        expect(vMid).toBeGreaterThan(50);
    });

    it('should clamp max velocity to 127', () => {
        expect(normalizeMidiVelocity(1.5)).toBe(127);
        expect(normalizeMidiVelocity(2.0)).toBe(127);
    });

    it('should respect velocity floor', () => {
        // Even extremely low velocity should be at least 20
        expect(normalizeMidiVelocity(0.02)).toBe(20);
    });
});
