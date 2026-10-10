/** `computeSpectralProbes`: the band shares must not move with what precedes the music (#1556). */
import { describe, expect, it } from 'vitest';
import {
    computeSpectralProbes,
    SPECTRAL_ACTIVITY_THRESHOLD,
} from '../../scripts/audio-analysis.js';

const SR = 44100;
const LSB = 1 / 32768;
const BANDS = ['sub', 'low', 'lowMid', 'mid', 'presence', 'air5k', 'air'] as const;

/** Two bars of a "bass line": a note per half second, alternating 60 Hz and 140 Hz. */
function line(seconds: number): Float32Array {
    const out = new Float32Array(Math.round(seconds * SR));
    for (let i = 0; i < out.length; i++) {
        const t = i / SR;
        const note = Math.floor(t / 0.5);
        const freq = note % 2 === 0 ? 60 : 140;
        const env = Math.exp(-(t - note * 0.5) * 3);
        out[i] = 0.4 * env * Math.sin(2 * Math.PI * freq * t);
    }
    return out;
}

/** `music` after `leadSeconds` of a constant `level` (a master chain settling before note one). */
function withLead(music: Float32Array, leadSeconds: number, level: number): Float32Array {
    const lead = Math.round(leadSeconds * SR);
    const out = new Float32Array(lead + music.length);
    out.fill(level, 0, lead);
    out.set(music, lead);
    return out;
}

describe('computeSpectralProbes', () => {
    it('reads the same shares with 5 LSB of settling before the music as with none', () => {
        const music = line(8);
        const clean = computeSpectralProbes(withLead(music, 0.2, 0), SR);
        // 5 LSB is over the general activity floor (1e-4) and 3 LSB is under it: the two
        // engines' renders, whose probes used to land on different bars.
        expect(5 * LSB).toBeGreaterThan(1e-4);
        expect(5 * LSB).toBeLessThan(SPECTRAL_ACTIVITY_THRESHOLD);
        for (const level of [3 * LSB, 5 * LSB]) {
            const noisy = computeSpectralProbes(withLead(music, 0.2, level), SR);
            for (const band of BANDS) {
                expect(Math.abs(noisy[band] - clean[band]) * 100, band).toBeLessThan(0.5);
            }
        }
        // Under the probe's own floor the region starts on the same sample, so the windows
        // are the same windows and the shares are equal, not merely close.
        const settled = computeSpectralProbes(withLead(music, 0.2, 5 * LSB), SR);
        for (const band of BANDS) {
            expect(settled[band], band).toBeCloseTo(clean[band], 9);
        }
    });

    it('measures every window, not four of them', () => {
        // Nine seconds of a 1 kHz tone, with 60 Hz only where four evenly spread windows
        // would land (the start, each third, the end). A sparse probe reads this as all sub.
        const length = 9 * SR;
        const out = new Float32Array(length);
        const spots = [0, 1, 2, 3].map((i) => Math.floor(((length - 4096) / 3) * i));
        for (let i = 0; i < length; i++) {
            const onSpot = spots.some((spot) => i >= spot - 2048 && i < spot + 6144);
            out[i] = 0.4 * Math.cos((2 * Math.PI * (onSpot ? 60 : 1000) * i) / SR);
        }
        const probes = computeSpectralProbes(out, SR);
        expect(probes.mid).toBeGreaterThan(0.8);
        expect(probes.sub).toBeLessThan(0.15);
        const total = BANDS.reduce((sum, band) => sum + probes[band], 0);
        expect(total).toBeCloseTo(1, 6);
    });

    it('a start offset of a fraction of a window barely moves the shares', () => {
        const music = line(8);
        const a = computeSpectralProbes(music, SR);
        const b = computeSpectralProbes(withLead(music, 1777 / SR, 0), SR);
        for (const band of BANDS) {
            expect(Math.abs(a[band] - b[band]) * 100, band).toBeLessThan(2);
        }
    });

    it('silence, or less than 256 samples of sound, reads as zeros', () => {
        expect(computeSpectralProbes(new Float32Array(SR), SR).centroid).toBe(0);
        const blip = new Float32Array(SR);
        blip.fill(0.5, 100, 200);
        expect(computeSpectralProbes(blip, SR).sub).toBe(0);
    });
});
