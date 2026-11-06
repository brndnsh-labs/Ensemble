import { expect, test } from 'vitest';
import { MASTER_LIMITER, wireMasterLimiter } from '../../core/engine/master-limiter.js';
import { computeTruePeakDb } from '../../scripts/audio-analysis.js';

/**
 * The master limiter (#2002) in a real `OfflineAudioContext`, through the real worklet module:
 * the same file and the same wiring `initAudio` uses. Node renders run it too (every
 * `mix:report`/`golden` render goes through it), but this is the browser's audio thread.
 */
const SAMPLE_RATE = 44100;

async function limit(
    fill: (channel: Float32Array, ch: number) => void,
    seconds = 2,
): Promise<{ input: Float32Array[]; output: Float32Array[] }> {
    const frames = SAMPLE_RATE * seconds;
    const ctx = new OfflineAudioContext(2, frames, SAMPLE_RATE);
    const buffer = ctx.createBuffer(2, frames, SAMPLE_RATE);
    const input = [0, 1].map((ch) => {
        const data = buffer.getChannelData(ch);
        fill(data, ch);
        return data.slice();
    });
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const into = ctx.createGain();
    source.connect(into);
    await wireMasterLimiter(ctx, into, ctx.destination);
    source.start(0);
    const rendered = await ctx.startRendering();
    return { input, output: [rendered.getChannelData(0), rendered.getChannelData(1)] };
}

/** A hot mix stand-in: a loud bass sine, noise bursts every half second, a near-Nyquist tone
 * whose inter-sample peaks a sample-peak limiter misses. */
function hotMix(data: Float32Array, ch: number): void {
    let seed = 7 + ch;
    for (let i = 0; i < data.length; i++) {
        seed = (seed * 16807) % 2147483647;
        const t = i / SAMPLE_RATE;
        const beat = t % 0.5;
        data[i] =
            0.8 * Math.sin(2 * Math.PI * 55 * t) +
            (beat < 0.02 ? ((seed / 2147483647) * 2 - 1) * 2.5 * (1 - beat / 0.02) : 0) +
            0.3 * Math.sin(2 * Math.PI * 11025 * t + Math.PI / 4 + ch);
    }
}

test('holds a signal 13 dB over the ceiling under −1 dBTP', async () => {
    const { input, output } = await limit(hotMix);
    expect(computeTruePeakDb(input)).toBeGreaterThan(10);
    expect(computeTruePeakDb(output)).toBeLessThanOrEqual(MASTER_LIMITER.ceilingDb);
});

test('leaves a signal under the ceiling untouched, only delayed by the look-ahead', async () => {
    const { input, output } = await limit((data) => {
        for (let i = 0; i < data.length; i++) {
            data[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE);
        }
    });
    // The delay: the look-ahead window plus the interpolation filter's centre, less one.
    const delay = Math.round((MASTER_LIMITER.lookaheadMs * SAMPLE_RATE) / 1000) + 5;
    let worst = 0;
    for (let i = delay; i < input[0].length; i++) {
        worst = Math.max(worst, Math.abs(output[0][i] - input[0][i - delay]));
    }
    expect(worst).toBeLessThan(1e-6);
});

test('reads a NaN or infinite sample as silence, and recovers', async () => {
    const { output } = await limit((data) => {
        for (let i = 0; i < data.length; i++) {
            data[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE);
        }
        data[1000] = Number.NaN;
        data[2000] = Number.POSITIVE_INFINITY;
    });
    for (const channel of output) {
        expect(channel.every(Number.isFinite)).toBe(true);
    }
    // A second later the tone is back at its level, not ducked or silenced.
    let late = 0;
    for (let i = SAMPLE_RATE; i < SAMPLE_RATE * 2; i++) {
        late = Math.max(late, Math.abs(output[0][i]));
    }
    expect(late).toBeGreaterThan(0.49);
});
