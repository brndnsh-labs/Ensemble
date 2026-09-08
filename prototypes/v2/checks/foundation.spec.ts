import { test as base, expect } from '@playwright/test';

async function observeSamples(page: import('@playwright/test').Page) {
    await page.addInitScript(() => {
        const decoded = new Set<AudioBuffer>();
        const evidence = { starts: 0, nonzero: 0 };
        Object.assign(window, { __sampleEvidence: evidence });
        const decode = BaseAudioContext.prototype.decodeAudioData;
        BaseAudioContext.prototype.decodeAudioData = function (bytes: ArrayBuffer) {
            return decode.call(this, bytes).then((buffer) => {
                decoded.add(buffer);
                return buffer;
            });
        };
        const start = AudioBufferSourceNode.prototype.start;
        AudioBufferSourceNode.prototype.start = function (
            ...args: Parameters<AudioBufferSourceNode['start']>
        ) {
            if (this.buffer && decoded.has(this.buffer)) {
                evidence.starts++;
                if (this.buffer.getChannelData(0).some((value) => Math.abs(value) > 0.0001)) {
                    evidence.nonzero++;
                }
            }
            return Reflect.apply(start, this, args);
        };
    });
}

async function sampleStarts(page: import('@playwright/test').Page) {
    return page.evaluate(
        () =>
            (window as unknown as { __sampleEvidence: { nonzero: number } }).__sampleEvidence
                .nonzero,
    );
}

const test = base.extend<{ disconnect: () => Promise<void> }>({
    disconnect: async ({ browserName, context, request }, use) => {
        await use(async () => {
            if (browserName === 'webkit') {
                // Minimal independent reproduction: setOffline causes an internal
                // WebKit error even for a single cached HTML page; refusing real
                // network connections reloads correctly. No application responses
                // can succeed through this local-only server until teardown.
                const response = await request.post('/__test/network?offline=1');
                expect(response.ok()).toBe(true);
                await expect(
                    request.get('/v2/uncached-network-proof', { timeout: 3000 }),
                ).rejects.toThrow();
            } else {
                await context.setOffline(true);
            }
        });
        if (browserName === 'webkit') {
            await request.post('/__test/network?offline=0');
        }
    },
});

test('manual sounds save, revert, export/import and play sampled audio after offline reload', async ({
    page,
    disconnect,
}) => {
    await observeSamples(page);
    await page.goto('/v2/');
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await page.locator('.sound-panel summary').click();
    await page.getByLabel('Chords sound', { exact: true }).selectOption('pack:grand');
    await expect(page.getByLabel('Chords sound', { exact: true })).toBeEnabled();
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:grand');
    await expect(page.getByText('Song sounds available offline', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByLabel('Chords sound', { exact: true }).selectOption('synth');
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByRole('button', { name: 'Revert to saved' }).click();
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:grand');
    await page.getByRole('button', { name: 'Song actions' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export file' }).click();
    const file = await (await download).path();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByLabel('Import Ensemble document').setInputFiles(file!);
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:grand');
    // Observe decoded, nonzero sample buffers reaching actual playback sources.
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect.poll(() => sampleStarts(page)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Stop playback' }).click();
    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL || ''))
        .toContain('/v2/sw.js');
    await disconnect();
    await page.reload();
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).first().click();
    await page.locator('.sound-panel summary').click();
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:grand');
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect.poll(() => sampleStarts(page)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Stop playback' }).click();
    // Partial cache eviction must be detected even when decoded samples remain in RAM.
    await page.evaluate(async () => {
        const cache = await caches.open('ensemble-v2-sounds-v1');
        const sample = (await cache.keys()).find((request) => request.url.includes('.m4a'))!;
        await cache.delete(sample);
    });
    await page.reload();
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).first().click();
    await expect(page.getByText('Some sounds need downloading', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.locator('.error-banner')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();
    expect(await sampleStarts(page)).toBe(0);
    await page.locator('.sound-panel summary').click();
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:grand');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

test('all five lanes route real samples and every catalog choice downloads', async ({ page }) => {
    test.setTimeout(120_000);
    await observeSamples(page);
    await page.goto('/v2/');
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await page.locator('.sound-panel summary').click();
    for (const label of ['Drums', 'Bass', 'Chords', 'Harmony', 'Soloist']) {
        for (const other of ['Drums', 'Bass', 'Chords', 'Harmony', 'Soloist']) {
            const mute = page.getByRole('button', { name: other, exact: true });
            if (((await mute.getAttribute('aria-pressed')) === 'true') !== (other === label)) {
                await mute.click();
            }
        }
        const select = page.getByLabel(`${label} sound`, { exact: true });
        const choices = await select
            .locator('option')
            .evaluateAll((options) =>
                options
                    .map((option) => (option as HTMLOptionElement).value)
                    .filter((value) => value !== 'synth'),
            );
        expect(choices.length).toBeGreaterThan(0);
        for (const choice of choices) {
            await select.selectOption(choice);
            await expect(select).toBeEnabled({ timeout: 30_000 });
            await expect(select).toHaveValue(choice);
            await expect(page.locator('.error-banner')).toHaveCount(0);
        }
        const before = await sampleStarts(page);
        await page.getByRole('button', { name: 'Start playback', exact: true }).click();
        await expect.poll(() => sampleStarts(page), { timeout: 15_000 }).toBeGreaterThan(before);
        await page.getByRole('button', { name: 'Stop playback' }).click();
    }
});

test('corrupt downloads and storage failures preserve the previous sound', async ({ page }) => {
    await page.addInitScript(() => {
        const original = window.fetch;
        Object.assign(window, { __breakSound: 'corrupt' });
        window.fetch = async (input, init) => {
            const mode = (window as unknown as { __breakSound: string }).__breakSound;
            if (
                mode === 'corrupt' &&
                String(input).includes('/v2/packs/grand/') &&
                String(input).includes('.m4a')
            ) {
                return new Response('bad sample', { status: 200 });
            }
            return original(input, init);
        };
        const put = Cache.prototype.put;
        Cache.prototype.put = function (request, response) {
            if (
                (window as unknown as { __breakSound: string }).__breakSound === 'quota' &&
                String(request).includes('/v2/packs/')
            ) {
                return Promise.reject(new DOMException('Storage full', 'QuotaExceededError'));
            }
            return put.call(this, request, response);
        };
    });
    await page.goto('/v2/');
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await page.locator('.sound-panel summary').click();
    await page.getByLabel('Chords sound', { exact: true }).selectOption('pack:grand');
    await expect(page.locator('.error-banner')).toContainText('could not be verified');
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('synth');
    await page.evaluate(() => Object.assign(window, { __breakSound: 'quota' }));
    await page.getByLabel('Chords sound', { exact: true }).selectOption('pack:grand');
    await expect(page.locator('.error-banner')).toContainText('Storage full');
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('synth');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.evaluate(() => Object.assign(window, { __breakSound: '' }));
    await page.getByLabel('Chords sound', { exact: true }).selectOption('pack:grand');
    await expect(page.getByLabel('Chords sound', { exact: true })).toBeEnabled();
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:grand');
});

test('real runtime, local saves, reload recovery and offline playback', async ({
    page,
    disconnect,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
        if (!localStorage.getItem('ensemble_currentState')) {
            localStorage.setItem('ensemble_currentState', 'legacy-sentinel');
        }
        const NativeAudioContext = window.AudioContext;
        const audio: AudioContext[] = [];
        const analyzers: AnalyserNode[] = [];
        Object.assign(window, { __audioEvidence: { audio, analyzers } });
        window.AudioContext = class extends NativeAudioContext {
            constructor(options?: AudioContextOptions) {
                super(options);
                audio.push(this);
                const analyzer = this.createAnalyser();
                analyzers.push(analyzer);
                const nativeConnect = AudioNode.prototype.connect;
                AudioNode.prototype.connect = function (
                    this: AudioNode,
                    ...args: Parameters<AudioNode['connect']>
                ) {
                    if ((args[0] as unknown) === this.context.destination) {
                        Reflect.apply(nativeConnect, this, [analyzer]);
                    }
                    return Reflect.apply(nativeConnect, this, args);
                } as AudioNode['connect'];
            }
        };
    });
    await page.goto('/v2/');
    await expect(page.getByRole('heading', { name: 'Let’s play something.' })).toBeVisible();
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await expect(page.getByRole('heading', { name: 'Blue pocket', exact: true })).toBeVisible();
    expect(
        await page
            .locator('.chord')
            .first()
            .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(28);
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
    await expect
        .poll(() =>
            page.evaluate(() => {
                const evidence = (
                    window as unknown as {
                        __audioEvidence: { audio: AudioContext[]; analyzers: AnalyserNode[] };
                    }
                ).__audioEvidence;
                const data = new Float32Array(2048);
                evidence.analyzers[0]?.getFloatTimeDomainData(data);
                return Math.max(...data.map(Math.abs));
            }),
        )
        .toBeGreaterThan(0.0001);
    await page.getByRole('button', { name: 'Stop playback' }).click();
    await page.getByRole('button', { name: 'Faster', exact: true }).click();
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('115');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Faster', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('120');
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByRole('button', { name: 'Revert to saved' }).click();
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('115');
    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL || ''))
        .toContain('/v2/sw.js');
    await disconnect();
    await page.reload();
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('115');
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect.poll(() => page.locator('[data-active="true"]').count()).toBeGreaterThan(0);
    expect(await page.evaluate(() => localStorage.getItem('ensemble_currentState'))).toBe(
        'legacy-sentinel',
    );
    expect(errors).toEqual([]);
});

test('responsive chart and editor fit laptop, phone and tablet', async ({ page }) => {
    await page.goto('/v2/');
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    for (const [width, height] of [
        [1300, 940],
        [402, 874],
        [874, 402],
        [820, 1180],
    ]) {
        await page.setViewportSize({ width, height });
        await expect(
            page.getByRole('button', { name: 'Start playback', exact: true }),
        ).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true,
        );
        await page.screenshot({ path: `test-results/chart-${width}.png` });
        await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
        await expect(page.getByLabel('Chord text')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true,
        );
        await page.getByRole('button', { name: 'Play', exact: true }).click();
    }
});

test('two tabs cannot overwrite a newer save; a conflicting take can become a copy', async ({
    page,
    context,
}) => {
    await page.goto('/v2/');
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    const second = await context.newPage();
    await second.goto('/v2/');
    await second.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await page.getByRole('button', { name: 'Faster', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await second.getByRole('button', { name: 'Slower', exact: true }).click();
    await second.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
        second.getByRole('alert').filter({ hasText: 'saved in another tab' }),
    ).toBeVisible();
    await expect(second.getByLabel('Tempo', { exact: true })).toHaveValue('105');
    await second.getByRole('button', { name: 'Song actions' }).click();
    await second.getByRole('button', { name: 'Save a copy', exact: true }).click();
    await expect(
        second.getByRole('heading', { name: 'Blue pocket — copy', exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('115');
});

test('file export/import is detached; invalid input never changes the active song', async ({
    page,
}) => {
    // Model slow device file I/O. Assertions must wait for import completion,
    // not confuse the disabled-during-import Save button with a finished save.
    await page.addInitScript(() => {
        const read = File.prototype.text;
        File.prototype.text = async function () {
            await new Promise((resolve) => setTimeout(resolve, 200));
            return read.call(this);
        };
    });
    await page.goto('/v2/');
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await page.getByLabel('Song title').fill('My writing sketch');
    await page.getByLabel('Chord text').fill('Am7 | D7 | Gmaj7 | Cmaj7');
    await page.getByRole('button', { name: 'Apply chords' }).click();
    await expect(page.locator('.bar')).toHaveCount(4);
    await page.getByRole('button', { name: 'Song actions' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export file' }).click();
    const exported = await download;
    const path = await exported.path();
    expect(path).toBeTruthy();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByLabel('Import Ensemble document').setInputFiles(path!);
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect(
        page.getByRole('heading', { name: 'My writing sketch', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Import Ensemble document').setInputFiles({
        name: 'invalid.ensemble',
        mimeType: 'application/json',
        buffer: Buffer.from('{"schemaVersion":999}'),
    });
    await expect(
        page.getByRole('alert').filter({ hasText: 'Cannot open this chart' }),
    ).toBeVisible();
    await expect(
        page.getByRole('heading', { name: 'My writing sketch', exact: true }),
    ).toBeVisible();
});

test('failed recovery stays in memory through navigation and is never labelled recovered', async ({
    page,
}) => {
    await page.goto('/v2/');
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await page.evaluate(() => {
        Storage.prototype.setItem = () => {
            throw new DOMException('Full', 'QuotaExceededError');
        };
    });
    await page.getByRole('button', { name: 'Faster', exact: true }).click();
    await expect(page.getByText('Unsaved setup · this tab only', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await page.getByRole('button', { name: 'After hours Bossa · Saved locally' }).click();
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('115');
    await expect(page.getByText('Unsaved setup · this tab only', { exact: true })).toBeVisible();
});

test('an older competing draft remains explicitly recoverable after another tab saves', async ({
    page,
    context,
}) => {
    await page.goto('/v2/');
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    const second = await context.newPage();
    await second.goto('/v2/');
    await second.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await page.getByRole('button', { name: 'Slower', exact: true }).click();
    await second.getByRole('button', { name: 'Faster', exact: true }).click();
    await second.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(second.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.reload();
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('115');
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByText(/Preserved drafts \(/).click();
    await page.getByRole('button', { name: /Blue pocket · 105 BPM/ }).click();
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('105');
    await expect(
        page.getByRole('heading', { name: 'Blue pocket — recovered', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

test('all existing feels and key/mutes survive a save; long charts scroll legibly', async ({
    page,
    disconnect,
}) => {
    await page.goto('/v2/');
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL || ''))
        .toContain('/v2/sw.js');
    await disconnect();
    const genres = await page
        .getByLabel('Feel', { exact: true })
        .locator('option')
        .allTextContents();
    expect(genres).toHaveLength(13);
    for (const genre of genres) {
        await page.getByLabel('Feel', { exact: true }).selectOption(genre);
        await expect(page.getByLabel('Feel', { exact: true })).toBeEnabled();
        await expect(page.locator('.error-banner[role="alert"]')).toHaveCount(0);
    }
    await page.getByLabel('Key', { exact: true }).selectOption('Eb');
    await page.getByRole('button', { name: 'Bass', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.reload();
    await page.getByRole('button', { name: /Blue pocket .* · Saved locally/ }).click();
    await expect(page.getByLabel('Key', { exact: true })).toHaveValue('Eb');
    await expect(page.getByRole('button', { name: 'Bass', exact: true })).toHaveAttribute(
        'aria-pressed',
        'false',
    );
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await page
        .getByLabel('Chord text')
        .fill(
            Array.from({ length: 64 }, (_, i) => ['Cmaj7', 'Am7', 'Dm7', 'G7'][i % 4]).join(' | '),
        );
    await page.getByRole('button', { name: 'Apply chords' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.setViewportSize({ width: 402, height: 874 });
    await expect(page.locator('.bar')).toHaveCount(64);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    expect(
        await page
            .locator('.chord')
            .first()
            .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(28);
    await page.locator('.chart-scroll').press('PageDown');
    await expect(page.getByRole('button', { name: 'Resume follow' }).first()).toBeVisible();
});
