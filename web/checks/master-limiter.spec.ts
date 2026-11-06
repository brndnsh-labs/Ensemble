import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { appUrl, expect, test } from './fixtures';

/**
 * The master limiter (#2002) is an `AudioWorklet` whose module the bundler emits as a separate
 * same-origin file. Unit and browser-mode tests load it from source; this loads the file the
 * EXPORT ships, on the built page under its CSP, in Chromium and WebKit, and runs a signal 12 dB
 * over the ceiling through it. A worklet that failed here would leave the stand on its no-limiter
 * fallback (or, if the fallback broke, silent) with no test anywhere else noticing.
 */
async function shippedWorklet(): Promise<string> {
    const media = path.join(__dirname, '..', 'out', '_next', 'static', 'media');
    const file = (await readdir(media)).find((name) =>
        /^master-limiter\.worklet\.[\w-]+\.js$/.test(name),
    );
    if (!file) {
        throw new Error(`no master-limiter worklet in ${media}: build the export first`);
    }
    return `/_next/static/media/${file}`;
}

test('the exported master limiter loads under the CSP and holds a hot signal under −1 dBTP', async ({
    page,
}) => {
    const asset = await shippedWorklet();
    await page.goto(appUrl());
    const peakDb = await page.evaluate(async (moduleUrl) => {
        const sampleRate = 44100;
        const ctx = new OfflineAudioContext(2, sampleRate, sampleRate);
        await ctx.audioWorklet.addModule(moduleUrl);
        const limiter = new AudioWorkletNode(ctx, 'ensemble-master-limiter', {
            outputChannelCount: [2],
            channelCount: 2,
            channelCountMode: 'explicit',
            processorOptions: { ceilingDb: -1, lookaheadMs: 5, releaseMs: 100 },
        });
        const tone = ctx.createOscillator();
        const drive = ctx.createGain();
        drive.gain.value = 4; // +12 dB: a full-scale sine driven well past the ceiling
        tone.connect(drive).connect(limiter).connect(ctx.destination);
        tone.start();
        const rendered = await ctx.startRendering();
        let peak = 0;
        for (const value of rendered.getChannelData(0)) {
            peak = Math.max(peak, Math.abs(value));
        }
        return 20 * Math.log10(peak);
    }, asset);
    expect(peakDb).toBeLessThanOrEqual(-1);
    // Limiting, not silencing: the tone is still there, at the ceiling.
    expect(peakDb).toBeGreaterThan(-2);
});
