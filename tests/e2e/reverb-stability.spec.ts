// @ts-nocheck
import pkg from '@playwright/test';

const { expect, test } = pkg;

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
 * Runs against the Vite dev server (it serves the `.ts` module directly), so it
 * is `@diagnostic`-tagged — a fast offline render, not a UI smoke test.
 */
test('@diagnostic reverb tail decays for every preset', async ({ page }) => {
    await page.goto('/');

    const results = await page.evaluate(async () => {
        const mod = await import('/engine/reverb.ts');
        const { createAlgorithmicReverb, REVERB_PRESETS } = mod;

        async function envelopeFor(presetName: string): Promise<number[]> {
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

        return {
            room: await envelopeFor('room'),
            hall: await envelopeFor('hall'),
        };
    });

    for (const [name, env] of Object.entries(results)) {
        const e = env as number[];
        // eslint-disable-next-line no-console
        console.log(`${name}:`, e.map((v) => v.toExponential(2)).join('  '));
        const peak = Math.max(...e);
        // The tail must end quieter than it began, and never swell past the
        // impulse that drove it.
        expect(e[e.length - 1], `${name} tail must decay`).toBeLessThan(e[0]);
        expect(peak, `${name} must not self-oscillate`).toBeLessThanOrEqual(e[0] * 1.01);
    }
});
