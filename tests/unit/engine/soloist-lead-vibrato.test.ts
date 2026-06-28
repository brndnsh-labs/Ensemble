// @ts-nocheck
// #744 Slice 3 / #745 — per-pack lead-vibrato idiom on the sampled soloist.
// The classical nylon guitar gets a narrower + slower finger vibrato than the
// horn/steel-string default (±18c / 5.5Hz). This guards the profile mapping
// (the by-ear *feel* is Brandon's listen pass; this only pins the numbers so a
// future refactor can't silently revert nylon to the default).
import { describe, expect, it } from 'vitest';
import { leadVibrato } from '../../../public/engine/synth-soloist.js';

const SEED = 12345;

describe('leadVibrato — per-pack idiom (#745)', () => {
    it('defaults to the ±18c / 5.5Hz horn/steel-string profile', () => {
        const def = leadVibrato(SEED);
        expect(def.depthCents).toBe(18);
        // rate carries a ±6% deterministic jitter around the base.
        expect(def.rateHz).toBeGreaterThan(5.5 * 0.94);
        expect(def.rateHz).toBeLessThan(5.5 * 1.06);
        // an unknown pack falls back to the default, not undefined.
        expect(leadVibrato(SEED, 'no-such-pack').depthCents).toBe(18);
        // sax keeps the default (only nylon is tuned down for now).
        expect(leadVibrato(SEED, 'sax-alto').depthCents).toBe(18);
    });

    it('gives the nylon guitar a narrower + slower vibrato', () => {
        const nylon = leadVibrato(SEED, 'nylon-guitar');
        const def = leadVibrato(SEED, 'sax-alto');
        // narrower depth and slower rate — the classical-guitar idiom.
        expect(nylon.depthCents).toBeLessThan(def.depthCents);
        expect(nylon.rateHz).toBeLessThan(def.rateHz);
        // pinned values (the by-ear starting point, Bossa/Acoustic nylon lead).
        expect(nylon.depthCents).toBe(11);
        expect(nylon.rateHz).toBeGreaterThan(4.6 * 0.94);
        expect(nylon.rateHz).toBeLessThan(4.6 * 1.06);
    });

    it('keeps the clean attack window and stays deterministic per seed', () => {
        const a = leadVibrato(SEED, 'nylon-guitar');
        const b = leadVibrato(SEED, 'nylon-guitar');
        expect(a).toEqual(b); // seeded jitter reproduces
        expect(a.delay).toBe(0.12);
        expect(a.ramp).toBe(0.3);
        // different seeds yield different (jittered) rates — not phase-locked.
        expect(leadVibrato(SEED + 1, 'nylon-guitar').rateHz).not.toBe(a.rateHz);
    });
});
