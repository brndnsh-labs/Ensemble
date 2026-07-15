import { expect, test } from 'vitest';
import { createAlgorithmicReverb, REVERB_PRESETS } from '../../public/engine/reverb.js';

/**
 * Stability guard for the algorithmic reverb (`public/engine/reverb.ts`).
 *
 * Builds the real reverb in an `OfflineAudioContext`, fires a single-sample
 * impulse, renders 8 s, and checks the windowed peak envelope. A reverb MUST
 * decay — if a late window is louder than the impulse, the feedback path has
 * gain ≥ 1 and is self-oscillating. An earlier FDN topology failed exactly this
 * (cross-coupled `DelayNode` cycles run away under Web Audio); the Schroeder
 * topology must not regress into it.
 *
 * Runs in Vitest browser mode (headless Chromium) for a real `OfflineAudioContext`
 * — a fast offline render, not a UI smoke test. Relocated from Playwright in #1096
 * so the e2e suite could move to a static `vite preview` build.
 */
async function envelopeFor(presetName: keyof typeof REVERB_PRESETS): Promise<number[]> {
    const sampleRate = 48000;
    const ctx = new OfflineAudioContext(1, sampleRate * 8, sampleRate);
    const reverb = createAlgorithmicReverb(ctx, REVERB_PRESETS[presetName]);

    const impulse = ctx.createBuffer(1, 1, sampleRate);
    impulse.getChannelData(0)[0] = 1;
    const src = ctx.createBufferSource();
    src.buffer = impulse;
    src.connect(reverb.input);
    reverb.output.connect(ctx.destination);
    src.start(0);

    const data = (await ctx.startRendering()).getChannelData(0);
    const win = Math.floor(sampleRate * 0.5);
    const env: number[] = [];
    for (let s = 0; s < data.length; s += win) {
        let peak = 0;
        for (let i = s; i < Math.min(s + win, data.length); i++) {
            const a = Math.abs(data[i]);
            if (a > peak) {
                peak = a;
            }
        }
        env.push(peak);
    }
    return env;
}

test('reverb tail decays for every preset', async () => {
    const results = {
        room: await envelopeFor('room'),
        hall: await envelopeFor('hall'),
    };

    for (const [name, env] of Object.entries(results)) {
        const peak = Math.max(...env);
        // The tail must end quieter than it began, and never swell past the
        // impulse that drove it.
        expect(env[env.length - 1], `${name} tail must decay`).toBeLessThan(env[0]);
        expect(peak, `${name} must not self-oscillate`).toBeLessThanOrEqual(env[0] * 1.01);
    }
});
