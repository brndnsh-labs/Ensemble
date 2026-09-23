import { appUrl, editorRevealed, expect, test } from './fixtures';

declare global {
    interface Window {
        __band: { oldEngineNotes: number; audibleSamples: number; armed: boolean };
    }
}

/**
 * `?engine=next` plays the new band engine (docs/design/band-engine.md) instead of the
 * worker generator. This proves the switch end to end on the real stand: sound reaches the
 * speakers, the chart pointer follows the form round the loop, the old worker generates
 * nothing, and Stop stops — with no page errors along the way.
 */
test('the band engine plays the chart round the loop and stops', async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
        window.__band = { oldEngineNotes: 0, audibleSamples: 0, armed: false };
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
            constructor(url: string | URL, options?: WorkerOptions) {
                super(url, options);
                this.addEventListener('message', (event: MessageEvent<{ type: string }>) => {
                    if (window.__band.armed && event.data?.type === 'notes') {
                        window.__band.oldEngineNotes++;
                    }
                });
            }
        };
        // Branch an analyser off the final output, as the semantic-playback check does.
        const connect = AudioNode.prototype.connect;
        const seen = new WeakSet<BaseAudioContext>();
        AudioNode.prototype.connect = function (
            this: AudioNode,
            destination: AudioNode | AudioParam,
            ...rest: number[]
        ) {
            const result = Reflect.apply(connect, this, [destination, ...rest]);
            if (destination === this.context.destination && !seen.has(this.context)) {
                seen.add(this.context);
                const analyser = this.context.createAnalyser();
                analyser.fftSize = 256;
                Reflect.apply(connect, this, [analyser]);
                const samples = new Float32Array(analyser.fftSize);
                window.setInterval(() => {
                    analyser.getFloatTimeDomainData(samples);
                    if (samples.some((sample) => Math.abs(sample) > 0.00001)) {
                        window.__band.audibleSamples++;
                    }
                }, 20);
            }
            return result;
        } as AudioNode['connect'];
    });
    await page.goto(appUrl('?engine=next'));
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Band engine study');
    for (const [i, bar] of ['C', 'F', 'G7', 'C'].entries()) {
        await page.getByLabel('Chords in this bar').fill(bar);
        if (i < 3) {
            await page.getByRole('button', { name: 'Next bar', exact: true }).click();
        }
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await page.getByLabel('Feel', { exact: true }).selectOption('Jazz');
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    await expect(page.locator('.chord')).toHaveText(['C', 'F', 'G7', 'C']);

    await page.evaluate(() => {
        window.__band.armed = true;
    });
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    // Follow the chart pointer until it has come back round to the top twice.
    const visits: number[] = [];
    await expect
        .poll(
            async () => {
                const start = await page
                    .locator('.chord[aria-current="true"]')
                    .first()
                    .getAttribute('data-start-step')
                    .catch(() => null);
                if (start !== null && visits.at(-1) !== Number(start)) {
                    visits.push(Number(start));
                }
                return visits.filter((s, i) => s === 0 && i > 0).length;
            },
            { timeout: 25_000, intervals: [50], message: `pointer visits: ${visits.join(' ')}` },
        )
        .toBeGreaterThanOrEqual(2);
    // Every bar of the form was reached, in order, before it wrapped.
    const firstLap = visits.slice(0, visits.indexOf(0, 1));
    expect(firstLap).toEqual([...firstLap].sort((a, b) => a - b));
    expect(new Set(visits).size).toBe(4);

    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();
    await expect(page.locator('.chord[aria-current="true"]')).toHaveCount(0);

    const evidence = await page.evaluate(() => window.__band);
    expect(evidence.audibleSamples, 'the band should reach the speakers').toBeGreaterThan(0);
    expect(evidence.oldEngineNotes, 'the old generator should stay idle').toBe(0);
    expect(errors).toEqual([]);
});
