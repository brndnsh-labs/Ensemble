/**
 * The node Web Audio shim (`scripts/node-webaudio.ts`) pins an `AudioParam`'s value at the start
 * of every `setTargetAtTime` / `setValueCurveAtTime`, because `node-web-audio-api` 2.2.0 evaluates
 * those events before their start time. Chromium follows the spec's formulas (measured with the
 * parity probes the shim's comment cites), so this holds the shimmed render to the formulas.
 */
import '../../scripts/node-webaudio.js';

const SR = 44100;

async function renderGain(schedule: (gain: AudioParam) => void): Promise<Float32Array> {
    const ctx = new OfflineAudioContext(1, SR * 1.5, SR);
    const source = ctx.createConstantSource();
    const gain = ctx.createGain();
    schedule(gain.gain);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
    const rendered = await ctx.startRendering();
    const out = new Float32Array(rendered.length);
    rendered.copyFromChannel(out, 0);
    return out;
}

const at = (samples: Float32Array, t: number) => samples[Math.round(t * SR)];
const target = (v0: number, v1: number, t0: number, tau: number, t: number) =>
    v1 + (v0 - v1) * Math.exp(-(t - t0) / tau);

describe('node Web Audio shim: automation follows the spec before and after an event', () => {
    it('holds the previous value until a setTargetAtTime starts, then decays by the formula', async () => {
        const out = await renderGain((g) => {
            g.setValueAtTime(0.8, 0);
            g.setTargetAtTime(0.0001, 0.2, 0.15);
        });
        expect(at(out, 0.1)).toBeCloseTo(0.8, 5);
        expect(at(out, 0.199)).toBeCloseTo(0.8, 5);
        for (const t of [0.25, 0.4, 0.8]) {
            expect(at(out, t)).toBeCloseTo(target(0.8, 0.0001, 0.2, 0.15, t), 4);
        }
    });

    it('an attack then a release, each a setTargetAtTime, chain through their start values', async () => {
        const out = await renderGain((g) => {
            g.setValueAtTime(0, 0.2);
            g.setTargetAtTime(0.8, 0.2, 0.01);
            g.setTargetAtTime(0, 0.5, 0.1);
        });
        expect(at(out, 0.1)).toBeCloseTo(1, 5); // the default, untouched before 0.2
        expect(at(out, 0.21)).toBeCloseTo(target(0, 0.8, 0.2, 0.01, 0.21), 3);
        const atRelease = target(0, 0.8, 0.2, 0.01, 0.5);
        expect(at(out, 0.6)).toBeCloseTo(target(atRelease, 0, 0.5, 0.1, 0.6), 4);
    });

    it('a release scheduled after a linear attack does not touch the sustain before it', async () => {
        const out = await renderGain((g) => {
            g.setValueAtTime(0, 0);
            g.linearRampToValueAtTime(0.8, 0.2);
            g.setTargetAtTime(0.0001, 0.5, 0.15);
        });
        expect(at(out, 0.1)).toBeCloseTo(0.4, 4);
        expect(at(out, 0.35)).toBeCloseTo(0.8, 5);
        expect(at(out, 0.7)).toBeCloseTo(target(0.8, 0.0001, 0.5, 0.15, 0.7), 4);
    });

    it('a cancel followed by a setTargetAtTime keeps the value that was in force', async () => {
        const out = await renderGain((g) => {
            g.setValueAtTime(0.8, 0);
            g.linearRampToValueAtTime(0, 1.4);
            g.cancelScheduledValues(0.5);
            g.setTargetAtTime(0.0001, 0.5, 0.1);
        });
        expect(at(out, 0.3)).toBeCloseTo(0.8, 5);
        expect(at(out, 0.7)).toBeCloseTo(target(0.8, 0.0001, 0.5, 0.1, 0.7), 4);
    });

    it('a `.value =` assignment counts as the value in force for a later setTargetAtTime', async () => {
        const out = await renderGain((g) => {
            g.setValueAtTime(0.8, 0);
            g.value = 0.3; // later than the set at the same time, so it wins (the spec's rule)
            g.setTargetAtTime(0.0001, 0.5, 0.1);
        });
        expect(at(out, 0.3)).toBeCloseTo(0.3, 5);
        expect(at(out, 0.7)).toBeCloseTo(target(0.3, 0.0001, 0.5, 0.1, 0.7), 4);
    });

    it('an exponential ramp runs to its value, and a release after it starts from that value', async () => {
        const out = await renderGain((g) => {
            g.setValueAtTime(0.8, 0.2);
            g.exponentialRampToValueAtTime(0.2, 0.6);
            g.setTargetAtTime(0.0001, 0.8, 0.1);
        });
        expect(at(out, 0.4)).toBeCloseTo(0.8 * (0.2 / 0.8) ** 0.5, 4);
        expect(at(out, 0.7)).toBeCloseTo(0.2, 5);
        expect(at(out, 1.0)).toBeCloseTo(target(0.2, 0.0001, 0.8, 0.1, 1.0), 4);
    });

    it('holds the previous value until a setValueCurveAtTime starts', async () => {
        const curve = new Float32Array(64);
        for (let i = 0; i < 64; i++) {
            curve[i] = 0.8 * Math.sin((Math.PI * i) / 63);
        }
        const out = await renderGain((g) => {
            g.setValueAtTime(0.5, 0.1);
            g.setValueCurveAtTime(curve, 0.2, 1.0);
        });
        expect(at(out, 0.15)).toBeCloseTo(0.5, 5);
        expect(at(out, 0.7)).toBeCloseTo(0.8, 2); // the curve's peak, mid-way
        expect(at(out, 1.3)).toBeCloseTo(0, 5); // holds the curve's last value after it ends
    });
});
