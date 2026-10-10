/** `scripts/live-checks.ts` on synthetic signals: each check must read a planted fact. */
import {
    compareLevels,
    decodeCaptureChannel,
    denseBandShares,
    stopClick,
    stopSilence,
    tempoFit,
} from '../../scripts/live-checks.js';

const SR = 44100;

/** A tone that plays until `stopAt` seconds, then decays with time constant `tau` (0 = hard cut). */
function toneThenStop(seconds: number, stopAt: number, tau: number, frequency = 220): Float32Array {
    const out = new Float32Array(Math.round(seconds * SR));
    for (let i = 0; i < out.length; i++) {
        const t = i / SR;
        const env = t < stopAt ? 1 : tau === 0 ? 0 : Math.exp(-(t - stopAt) / tau);
        out[i] = 0.5 * env * Math.sin(2 * Math.PI * frequency * t);
    }
    return out;
}

/** Clicks (short noise bursts) on every sixteenth at `bpm`, starting at `start` seconds. */
function clickTrack(seconds: number, bpm: number, start = 0.5): Float32Array {
    const out = new Float32Array(Math.round(seconds * SR));
    const sixteenth = 60 / bpm / 4;
    let seed = 7;
    for (let t = start; t < seconds - 0.05; t += sixteenth) {
        const at = Math.round(t * SR);
        for (let i = 0; i < 220; i++) {
            seed = (seed * 1103515245 + 12345) >>> 0;
            out[at + i] = (seed / 4294967296 - 0.5) * Math.exp(-i / 60);
        }
    }
    return out;
}

describe('live checks', () => {
    it('stopSilence: a band that fades after Stop is silent; one that keeps ringing is not', () => {
        const stop = Math.round(1.0 * SR);
        const fades = stopSilence(toneThenStop(3, 1.0, 0.05), SR, stop);
        expect(fades.verifiable).toBe(true);
        expect(fades.silent).toBe(true);
        expect(fades.afterDb).toBeLessThan(-60);
        expect(fades.beforeDb).toBeCloseTo(-9.0, 0);
        expect(fades.decayMs).not.toBeNull();
        expect(fades.decayMs as number).toBeLessThan(400);
        expect(fades.tailDb).toBeLessThan(fades.beforeDb);

        const rings = stopSilence(toneThenStop(3, 1.0, 10), SR, stop);
        expect(rings.silent).toBe(false);
        expect(rings.afterDb).toBeGreaterThan(-12);
        expect(rings.decayMs).toBeNull();
    });

    it('stopClick: a cut at a peak reads as a click; at a zero crossing or faded it does not', () => {
        const stop = Math.round(1.0 * SR);
        // Cut on the sample carrying the tone's peak inside the first period after Stop: the step
        // is then the whole peak, which is the discontinuity the detector is built to catch. A
        // cut lower on the waveform scores under 1; that sensitivity is the detector's, documented
        // in audio-verify.ts (`CLICK_DISCONTINUITY`).
        const tone = toneThenStop(1.5, 1.5, 0);
        let peakAt = stop;
        for (let i = stop; i < stop + Math.round(SR / 220); i++) {
            if (Math.abs(tone[i]) > Math.abs(tone[peakAt])) {
                peakAt = i;
            }
        }
        const cutAtPeak = tone.slice();
        cutAtPeak.fill(0, peakAt + 1);
        expect(stopClick(cutAtPeak, SR, stop).click).toBe(true);

        const zeroCrossing = tone.slice();
        zeroCrossing.fill(0, stop); // 1.0 s is a whole number of 220 Hz periods: the tone is at 0
        expect(stopClick(zeroCrossing, SR, stop).click).toBe(false);

        const faded = toneThenStop(1.5, 1.0, 0.05);
        expect(stopClick(faded, SR, stop).click).toBe(false);
    });

    it('stopSilence: a capture that never sounded, or ends too soon, is not verifiable', () => {
        const stop = Math.round(1.0 * SR);
        const dead = stopSilence(new Float32Array(3 * SR), SR, stop);
        expect(dead.verifiable).toBe(false);
        expect(dead.silent).toBe(false);
        expect(dead.reason).toMatch(/never played/);
        const short = stopSilence(toneThenStop(2.0, 1.0, 0.05), SR, stop);
        expect(short.verifiable).toBe(false);
        expect(short.reason).toMatch(/ends .* before/);
        expect(stopClick(toneThenStop(1.2, 1.0, 0), SR, stop).verifiable).toBe(false);
    });

    it('tempoFit: a swung offbeat as the first onset does not drag the grid with it', () => {
        // Clicks on the grid at 120, plus an offbeat 40 ms late at the very start.
        const track = clickTrack(8, 120);
        const sixteenth = 60 / 120 / 4;
        const early = Math.round((0.5 - sixteenth + 0.04) * SR);
        for (let i = 0; i < 220; i++) {
            track[early + i] = 0.5 * Math.exp(-i / 60) * (i % 2 ? 1 : -1);
        }
        const fit = tempoFit(track, SR, 120);
        expect(fit).not.toBeNull();
        expect(fit!.medianDeviationMs).toBeLessThan(2);
        expect(Math.abs(fit!.driftMsPerBar)).toBeLessThan(1);
    });

    it('tempoFit: clicks on the grid at the nominal tempo read as no deviation and no drift', () => {
        const fit = tempoFit(clickTrack(8, 120), SR, 120);
        expect(fit).not.toBeNull();
        expect(fit!.onsets).toBeGreaterThan(50);
        expect(fit!.medianDeviationMs).toBeLessThan(2);
        expect(Math.abs(fit!.driftMsPerBar)).toBeLessThan(1);
        expect(fit!.bpmEstimate).toBeCloseTo(120, 0);
    });

    it('tempoFit: a band at 121 against a nominal 120 shows the drift and the real tempo', () => {
        // Six seconds: the residual against the nominal grid must stay inside half a sixteenth
        // (±62 ms at 120) for the linear fit to read it, and 121 against 120 gains ~16.5 ms a bar.
        const fit = tempoFit(clickTrack(6, 121), SR, 120);
        expect(fit).not.toBeNull();
        // 121 against 120 runs early: about −16.5 ms per bar.
        expect(fit!.driftMsPerBar).toBeLessThan(-14);
        expect(fit!.driftMsPerBar).toBeGreaterThan(-19);
        expect(fit!.bpmEstimate).toBeCloseTo(121, 0);
    });

    it('compareLevels: the same signal is 0 dB apart; a 6 dB quieter live take is −6', () => {
        const a = toneThenStop(2, 2, 0);
        const quieter = a.map((v) => v * 0.5);
        const same = compareLevels(
            { samples: a, sampleRate: SR, from: 0, to: a.length },
            { samples: a, sampleRate: SR, from: 0, to: a.length },
        );
        expect(same.deltaDb).toBeCloseTo(0, 6);
        expect(same.withinThreshold).toBe(true);
        expect(Object.values(same.bandDeltaPoints).every((d) => Math.abs(d) < 1e-6)).toBe(true);
        const quiet = compareLevels(
            { samples: quieter, sampleRate: SR, from: 0, to: a.length },
            { samples: a, sampleRate: SR, from: 0, to: a.length },
        );
        expect(quiet.deltaDb).toBeCloseTo(-6.02, 1);
        expect(quiet.withinThreshold).toBe(false);
    });

    it('denseBandShares: a 60 Hz tone lands in the sub band', () => {
        const shares = denseBandShares(toneThenStop(1, 1, 0, 60), SR);
        expect(shares.sub).toBeGreaterThan(0.9);
    });

    it('decodeCaptureChannel: round-trips float32 through base64, small buffers included', () => {
        const samples = new Float32Array([0.5, -0.25, 1e-7, 3]);
        const base64 = Buffer.from(samples.buffer).toString('base64');
        expect(Array.from(decodeCaptureChannel(base64))).toEqual(Array.from(samples));
    });
});
