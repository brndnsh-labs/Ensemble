/**
 * The voices' two import-free laws, which the band plays through: how a note's `muted` field
 * becomes gain (`mute-contract.ts`, read by the band host and the bass voice) and how a bass
 * velocity becomes amplitude (`velocity-shaping.ts`, read by the bass voice). Their old tests
 * went with the old engine's MIDI paths (#1404).
 */
import { describe, expect, it } from 'vitest';
import {
    MUTE_ATTENUATION,
    muteGain,
    normalizeMuteAmount,
} from '../../../public/engine/mute-contract.js';
import {
    BASS_VELOCITY_DOMAIN_MAX,
    bassVelocityToAmplitude,
} from '../../../public/engine/velocity-shaping.js';

describe('mute contract', () => {
    it('reads a boolean as its extremes and clamps a number to 0..1', () => {
        expect(normalizeMuteAmount(true)).toBe(1);
        expect(normalizeMuteAmount(false)).toBe(0);
        expect(normalizeMuteAmount(0.4)).toBe(0.4);
        expect(normalizeMuteAmount(3)).toBe(1);
        expect(normalizeMuteAmount(-1)).toBe(0);
        // A malformed payload stays non-finite, so a caller's own guard still fires.
        expect(normalizeMuteAmount(Number.NaN)).toBeNaN();
    });

    it('leaves an open note at full gain, a muted one at the attenuated floor, never NaN', () => {
        expect(muteGain(false)).toBe(1);
        expect(muteGain(undefined)).toBe(1);
        expect(muteGain(true)).toBeCloseTo(1 - MUTE_ATTENUATION);
        expect(muteGain(0.5)).toBeCloseTo(1 - 0.5 * MUTE_ATTENUATION);
        expect(muteGain(Number.NaN)).toBe(1);
        expect(muteGain(10)).toBeGreaterThanOrEqual(0);
    });
});

describe('bass velocity law', () => {
    it('is the square root up to unity, then sub-linear but still rising through the accents', () => {
        expect(bassVelocityToAmplitude(0)).toBe(0);
        expect(bassVelocityToAmplitude(0.25)).toBeCloseTo(0.5);
        expect(bassVelocityToAmplitude(1)).toBe(1);
        const accent = bassVelocityToAmplitude(1.15);
        // The base→accent step must clear ~1 dB to be heard in a mix.
        expect(20 * Math.log10(accent)).toBeGreaterThan(1);
        const top = bassVelocityToAmplitude(BASS_VELOCITY_DOMAIN_MAX);
        expect(top).toBeGreaterThan(accent);
        expect(top).toBeLessThan(BASS_VELOCITY_DOMAIN_MAX);
    });

    it('never returns a non-finite or negative amplitude', () => {
        expect(bassVelocityToAmplitude(Number.NaN)).toBe(0);
        expect(bassVelocityToAmplitude(Number.POSITIVE_INFINITY)).toBe(0);
        expect(bassVelocityToAmplitude(-2)).toBe(0);
    });
});
