// The sound packs: installing, routing and recovering them, and the feels that follow them.
// Split from `foundation.spec.ts` so CI's shard deal can put the two halves on different legs.
import { readFile } from 'node:fs/promises';
import { appUrl, expect, exportAs, seedStarters, songLink, songMenuAction } from './fixtures';
import {
    closeSounds,
    LANES,
    observeSamples,
    openSounds,
    sampleStarts,
    test,
} from './foundation-helpers';

test('manual sounds save, revert, export/import and play sampled audio after offline reload', async ({
    page,
    disconnect,
}) => {
    // Its neighbours' budget: an offline reload, an export/import round trip and five trips into
    // the Band sheet ran within a few seconds of the default on CI's WebKit.
    test.setTimeout(120_000);
    await observeSamples(page);
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openSounds(page);
    await page.getByLabel('Chords sound', { exact: true }).selectOption('pack:grand');
    await expect(page.getByLabel('Chords sound', { exact: true })).toBeEnabled();
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:grand');
    await expect(page.getByText('Song sounds available offline', { exact: true })).toBeVisible();
    await closeSounds(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await openSounds(page);
    await page.getByLabel('Chords sound', { exact: true }).selectOption('synth');
    await expect(page.getByLabel('Chords sound', { exact: true })).toBeEnabled();
    await closeSounds(page);
    await songMenuAction(page, 'Revert to saved');
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:grand');
    // Nothing is retained for a chart that matches its committed version (#1299 patch review P1).
    // A revert used to leave a recovery slot identical to the save — a draft of nothing, which
    // for an ACCOUNT chart then held that record against every remote advance for good and told
    // the sign-out step an experiment was at stake. The guest half is the same write, and this is
    // where it is cheap to prove.
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    Object.keys(localStorage).filter((key) =>
                        key.startsWith('ensemble-v2-preview:recovery:'),
                    ).length,
            ),
        )
        .toBe(0);
    const download = page.waitForEvent('download');
    await exportAs(page, 'Song file');
    const file = await (await download).path();
    await page.getByLabel('Import Ensemble document').setInputFiles(file!);
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:grand');
    // Observe decoded, nonzero sample buffers reaching actual playback sources.
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect.poll(() => sampleStarts(page)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Stop playback' }).click();
    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL || ''))
        .toContain(appUrl('sw.js'));
    await disconnect();
    await page.reload();
    await songLink(page, 'Blue pocket', 'Blues').first().click();
    await openSounds(page);
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:grand');
    await closeSounds(page);
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
    await songLink(page, 'Blue pocket', 'Blues').first().click();
    await openSounds(page);
    await expect(page.getByText('Some sounds need downloading', { exact: true })).toBeVisible();
    await closeSounds(page);
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.locator('.error-banner')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();
    expect(await sampleStarts(page)).toBe(0);
    await openSounds(page);
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:grand');
    await closeSounds(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

test('every lane routes real samples and every catalog choice downloads', async ({ page }) => {
    test.setTimeout(120_000);
    await observeSamples(page);
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    for (const label of LANES) {
        for (const other of LANES) {
            const mute = page.getByRole('button', { name: other, exact: true });
            if (((await mute.getAttribute('aria-pressed')) === 'true') !== (other === label)) {
                await mute.click();
            }
        }
        await openSounds(page);
        const select = page.getByLabel(`${label} sound`, { exact: true });
        const choices = await select
            .locator('option')
            .evaluateAll((options) =>
                options
                    .map((option) => (option as HTMLOptionElement).value)
                    .filter((value) => value.startsWith('pack:')),
            );
        expect(choices.length).toBeGreaterThan(0);
        for (const choice of choices) {
            await select.selectOption(choice);
            await expect(select).toBeEnabled({ timeout: 30_000 });
            await expect(select).toHaveValue(choice);
            await expect(page.locator('.error-banner')).toHaveCount(0);
        }
        await closeSounds(page);
        const before = await sampleStarts(page);
        await page.getByRole('button', { name: 'Start playback', exact: true }).click();
        await expect.poll(() => sampleStarts(page), { timeout: 15_000 }).toBeGreaterThan(before);
        await page.getByRole('button', { name: 'Stop playback' }).click();
    }
});

test('corrupt downloads and storage failures preserve the previous sound', async ({ page }) => {
    // `packs` crosses into the page as an argument: this body runs in the browser, where the
    // suite's `appUrl` does not exist.
    await page.addInitScript((packs: string) => {
        const original = window.fetch;
        Object.assign(window, { __breakSound: 'corrupt' });
        window.fetch = async (input, init) => {
            const mode = (window as unknown as { __breakSound: string }).__breakSound;
            if (
                mode === 'corrupt' &&
                String(input).includes(`${packs}grand/`) &&
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
                String(request).includes(packs)
            ) {
                return Promise.reject(new DOMException('Storage full', 'QuotaExceededError'));
            }
            return put.call(this, request, response);
        };
    }, appUrl('packs/'));
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openSounds(page);
    await page.getByLabel('Chords sound', { exact: true }).selectOption('pack:grand');
    await expect(page.locator('.error-banner')).toContainText('could not be verified');
    // The starter's own setting, Follow style (#1405), is what a failed pick leaves in place.
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('auto');
    await page.evaluate(() => Object.assign(window, { __breakSound: 'quota' }));
    await page.getByLabel('Chords sound', { exact: true }).selectOption('pack:grand');
    await expect(page.locator('.error-banner')).toContainText('Storage full');
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('auto');
    await closeSounds(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await openSounds(page);
    await page.evaluate(() => Object.assign(window, { __breakSound: '' }));
    await page.getByLabel('Chords sound', { exact: true }).selectOption('pack:grand');
    await expect(page.getByLabel('Chords sound', { exact: true })).toBeEnabled();
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:grand');
});

test('one install applies genre sounds, preserves manual overrides and follows feels offline', async ({
    page,
    disconnect,
}) => {
    test.setTimeout(120_000);
    await observeSamples(page);
    const downloads: string[] = [];
    page.on('request', (request) => {
        if (request.url().includes(appUrl('packs/'))) {
            downloads.push(request.url());
        }
    });
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    expect(downloads).toEqual([]);
    await openSounds(page);
    await page.getByRole('button', { name: 'Install all & use style sounds' }).click();
    await expect(page.getByRole('button', { name: 'Install all & use style sounds' })).toBeEnabled({
        timeout: 60_000,
    });
    await expect(
        page.getByText('All sound packs available offline', { exact: true }),
    ).toBeVisible();
    for (const label of LANES) {
        await expect(page.getByLabel(`${label} sound`, { exact: true })).toHaveValue('auto');
    }
    await expect(page.locator('.resolved-sound')).toContainText([
        'Acoustic Drum Kit',
        'Upright Bass',
        // The band's own Blues instruments: a piano comp, a clean-guitar lead.
        'Acoustic Grand Piano',
        'Electric Guitar (Clean)',
    ]);
    await page.getByLabel('Chords sound', { exact: true }).selectOption('pack:rhodes');
    await expect(page.getByLabel('Chords sound', { exact: true })).toBeEnabled();
    await closeSounds(page);
    await page.getByLabel('Style', { exact: true }).selectOption('Funk');
    await expect(page.getByLabel('Style', { exact: true })).toBeEnabled();
    await openSounds(page);
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:rhodes');
    await expect(page.locator('.resolved-sound')).toContainText([
        'Acoustic Drum Kit',
        'Built-in',
        'Alto Sax',
    ]);
    await closeSounds(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const download = page.waitForEvent('download');
    await exportAs(page, 'Song file');
    const path = await (await download).path();
    const exported = JSON.parse(await readFile(path!, 'utf8'));
    expect(exported.chart.band.soloist).toMatchObject({
        voice: 'pack:sax-alto',
        autoSound: true,
    });
    expect(exported.chart.band.chords).toMatchObject({ voice: 'pack:rhodes', autoSound: false });
    await page.getByLabel('Import Ensemble document').setInputFiles(path!);
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
    await expect(page.locator('.error-banner')).toHaveCount(0);
    await openSounds(page);
    await expect(page.getByLabel('Drums sound', { exact: true })).toHaveValue('auto');
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:rhodes');
    await closeSounds(page);
    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL || ''))
        .toContain(appUrl('sw.js'));
    await disconnect();
    await page.reload();
    await songLink(page, 'Blue pocket', 'Funk').first().click();
    await page.getByLabel('Style', { exact: true }).selectOption('Jazz');
    await expect(page.getByLabel('Style', { exact: true })).toBeEnabled();
    await openSounds(page);
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:rhodes');
    await expect(page.locator('.resolved-sound')).toContainText([
        'Acoustic Drum Kit',
        'Upright Bass',
        'Alto Sax',
    ]);
    await expect(
        page.getByText('All sound packs available offline', { exact: true }),
    ).toBeVisible();
    await closeSounds(page);
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect.poll(() => sampleStarts(page)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Stop playback' }).click();
    await songMenuAction(page, 'Revert to saved');
    await expect(page.getByLabel('Style', { exact: true })).toHaveValue('Funk');
    await openSounds(page);
    await expect(page.getByLabel('Drums sound', { exact: true })).toHaveValue('auto');
    // All-ready is derived from bytes, never a durable success flag.
    await page.evaluate(async () => {
        const cache = await caches.open('ensemble-v2-sounds-v1');
        const file = (await cache.keys()).find(
            (request) => request.url.includes('/acoustic-kit/') && request.url.includes('.m4a'),
        )!;
        await cache.delete(file);
    });
    await closeSounds(page);
    await openSounds(page);
    await expect(page.getByText('All sound packs available offline', { exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Install all & use style sounds' }).click();
    await expect(page.locator('.error-banner')).toBeVisible();
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:rhodes');
    await closeSounds(page);
    // A failed feel change must roll back the runtime as well as the displayed draft.
    await page.getByLabel('Style', { exact: true }).selectOption('Jazz');
    await expect(page.locator('.error-banner')).toBeVisible();
    await expect(page.getByLabel('Style', { exact: true })).toHaveValue('Funk');
    await page.getByRole('button', { name: 'Faster', exact: true }).click();
    await expect(page.getByLabel('Style', { exact: true })).toHaveValue('Funk');
    await openSounds(page);
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:rhodes');
});

test('installed sounds follow the feel after a reload without touching the Players tab', async ({
    page,
}) => {
    // #1405: installing is durable, so activating must be too. After a reload the stand reads
    // what is installed from the sound cache, and a song never opened since plays on it.
    test.setTimeout(120_000);
    await observeSamples(page);
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openSounds(page);
    await page.getByRole('button', { name: 'Install all & use style sounds' }).click();
    await expect(page.getByRole('button', { name: 'Install all & use style sounds' })).toBeEnabled({
        timeout: 60_000,
    });
    await closeSounds(page);
    await page.reload();
    const downloads: string[] = [];
    page.on('request', (request) => {
        if (request.url().includes(appUrl('packs/'))) {
            downloads.push(request.url());
        }
    });
    await songLink(page, 'Minor swing sketch', 'Jazz').click();
    await openSounds(page);
    for (const label of LANES) {
        await expect(page.getByLabel(`${label} sound`, { exact: true })).toHaveValue('auto');
    }
    await expect(page.locator('.resolved-sound')).toHaveCount(LANES.length);
    await expect(page.locator('.resolved-sound', { hasText: 'Built-in' })).toHaveCount(0);
    await closeSounds(page);
    // Resolving on open is not an edit.
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect.poll(() => sampleStarts(page)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Stop playback' }).click();
    expect(downloads).toEqual([]);
});

test('failed bulk installation keeps every previous voice and retries completed downloads', async ({
    page,
}) => {
    test.setTimeout(120_000);
    // Browser-side body; the pack URL arrives as an argument (see the corrupt-download test).
    await page.addInitScript((kit: string) => {
        const put = Cache.prototype.put;
        Object.assign(window, { __failBulk: true });
        Cache.prototype.put = function (request, response) {
            if (
                (window as unknown as { __failBulk: boolean }).__failBulk &&
                String(request).includes(kit)
            ) {
                return Promise.reject(new DOMException('Storage full', 'QuotaExceededError'));
            }
            return put.call(this, request, response);
        };
    }, appUrl('packs/acoustic-kit/'));
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openSounds(page);
    await page.getByRole('button', { name: 'Install all & use style sounds' }).click();
    await expect(page.locator('.error-banner')).toContainText('Storage full', { timeout: 60_000 });
    // Starters follow the feel (#1405); a failed install changes none of them.
    for (const label of LANES) {
        await expect(page.getByLabel(`${label} sound`, { exact: true })).toHaveValue('auto');
    }
    await expect(page.locator('.resolved-sound')).toHaveText(
        Array(LANES.length).fill('Using Built-in'),
    );
    await expect(page.getByText('All sound packs available offline', { exact: true })).toBeHidden();
    await closeSounds(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.evaluate(() => Object.assign(window, { __failBulk: false }));
    const repeated: string[] = [];
    page.on('request', (request) => {
        if (request.url().includes(appUrl('packs/grand/'))) {
            repeated.push(request.url());
        }
    });
    await openSounds(page);
    await page.getByRole('button', { name: 'Install all & use style sounds' }).click();
    await expect(page.getByRole('button', { name: 'Install all & use style sounds' })).toBeEnabled({
        timeout: 60_000,
    });
    await expect(
        page.getByText('All sound packs available offline', { exact: true }),
    ).toBeVisible();
    expect(repeated).toEqual([]);
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('auto');
});

test('feel preparation keeps the stand stable, rolls back playback safely, and respects Stop', async ({
    page,
    disconnect,
}) => {
    test.setTimeout(120_000);
    await observeSamples(page);
    // Browser-side body; the pack URL arrives as an argument (see the corrupt-download test).
    // The held pack is one only Jazz needs (its lead's alto sax): the Blues band keeps playing
    // through the hold, and holding a pack it plays too (the grand, its comp) would stall it.
    await page.addInitScript((held: string) => {
        const match = Cache.prototype.match;
        const control = { hold: false, release: null as null | (() => void) };
        Object.assign(window, { __preparation: control });
        Cache.prototype.match = async function (request, options) {
            if (control.hold && String(request).includes(held)) {
                control.hold = false;
                await new Promise<void>((resolve) => {
                    control.release = resolve;
                });
            }
            return match.call(this, request, options);
        };
    }, appUrl('packs/sax-alto/'));
    const hold = () =>
        page.evaluate(() => {
            const control = (
                window as unknown as { __preparation: { hold: boolean; release: unknown } }
            ).__preparation;
            control.hold = true;
            control.release = null;
        });
    const release = () =>
        page.evaluate(() =>
            (
                window as unknown as { __preparation: { release: () => void } }
            ).__preparation.release(),
        );
    const held = () =>
        page.waitForFunction(
            () =>
                typeof (window as unknown as { __preparation: { release: unknown } }).__preparation
                    .release === 'function',
        );
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openSounds(page);
    await page.getByRole('button', { name: 'Install all & use style sounds' }).click();
    await expect(page.getByRole('button', { name: 'Install all & use style sounds' })).toBeEnabled({
        timeout: 60_000,
    });
    await closeSounds(page);
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect.poll(() => sampleStarts(page)).toBeGreaterThan(0);
    const chartTop = (await page.locator('.chart-scroll').boundingBox())!.y;
    await hold();
    await page.getByLabel('Style', { exact: true }).selectOption('Jazz');
    await held();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    expect((await page.locator('.chart-scroll').boundingBox())!.y).toBe(chartTop);
    // #1185 — the band keeps playing *through* preparation rather than being torn
    // down and rebuilt around it, so sampled audio must keep arriving while this
    // held download/verification is still in flight.
    const duringPreparation = await sampleStarts(page);
    await expect.poll(() => sampleStarts(page)).toBeGreaterThan(duringPreparation);
    await release();
    await expect(page.getByLabel('Style', { exact: true })).toBeEnabled();
    await expect(page.getByLabel('Style', { exact: true })).toHaveValue('Jazz');
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    await page.getByLabel('Style', { exact: true }).selectOption('Blues');
    await expect(page.getByLabel('Style', { exact: true })).toBeEnabled();
    await page.evaluate(async () => {
        const cache = await caches.open('ensemble-v2-sounds-v1');
        const file = (await cache.keys()).find(
            (r) => r.url.includes('/sax-alto/') && r.url.includes('.m4a'),
        )!;
        await cache.delete(file);
    });
    await disconnect();
    const beforeFailure = await sampleStarts(page);
    await page.getByLabel('Style', { exact: true }).selectOption('Jazz');
    await expect(page.getByLabel('Style', { exact: true })).toBeEnabled();
    await expect(page.getByLabel('Style', { exact: true })).toHaveValue('Blues');
    await expect(page.locator('.error-banner')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    await expect.poll(() => sampleStarts(page)).toBeGreaterThan(beforeFailure);
    await hold();
    await page.getByLabel('Style', { exact: true }).selectOption('Jazz');
    await held();
    await page.getByRole('button', { name: 'Stop playback' }).click();
    await release();
    await expect(page.getByLabel('Style', { exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();
    await expect(page.getByLabel('Style', { exact: true })).toHaveValue('Blues');
    // If the old setup loses files as well, fail visibly instead of silently synthesizing.
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    await page.evaluate(async () => {
        const cache = await caches.open('ensemble-v2-sounds-v1');
        const file = (await cache.keys()).find(
            (r) => r.url.includes('/acoustic-kit/') && r.url.includes('.m4a'),
        )!;
        await cache.delete(file);
    });
    await page.getByLabel('Style', { exact: true }).selectOption('Jazz');
    await expect(page.getByLabel('Style', { exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();
    await expect(page.locator('.error-banner')).toContainText('Could not change style or resume');
});

test('a feel staged for the next bar settles when the musician stops inside it', async ({
    page,
}) => {
    // Deliberately a built-in-sound band: no pack download can mask the engine
    // half of a live feel change. A feel changed mid-performance is staged and
    // swapped in at the next measure start, so the window between the choice and
    // the swap is real, and a Stop landing inside it must not leave the engine on
    // the old feel while the captured document already reads the new one (#1185).
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    await page.getByLabel('Style', { exact: true }).selectOption('Rock');
    // #1460 — busy/progress is its own toast tone, pinned open (no auto-dismiss timer runs at
    // all while it's showing, unlike a plain `message`).
    await expect(page.getByTestId('stand-toast')).toHaveAttribute('data-tone', 'busy');
    await expect(page.getByTestId('stand-toast')).toContainText('Switching style at the next bar');
    // Re-review P3 — `showBusy = busy && busyToastVisible`, not `busyToastVisible` alone: the
    // debounce flag flips false via an EFFECT, one render after `busy` itself already reads
    // false, so without the extra check that one render would flash "Updating…" the instant the
    // feel genuinely settles. Recorded via a `MutationObserver` from here on, since a polled
    // assertion can't tell "never happened" from "happened and is gone by the time I checked".
    await page.evaluate(() => {
        const node = document.querySelector('[data-testid="stand-toast"] span');
        const seen: string[] = [];
        Object.assign(window, { __settleHistory: seen });
        if (!node) {
            return;
        }
        const record = () => seen.push(node.textContent ?? '');
        new MutationObserver(record).observe(node, {
            childList: true,
            characterData: true,
            subtree: true,
        });
    });
    await page.getByRole('button', { name: 'Stop playback' }).click();
    await expect(page.getByLabel('Style', { exact: true })).toBeEnabled();
    await page.waitForTimeout(300);
    const settleHistory = await page.evaluate(
        () => (window as unknown as { __settleHistory: string[] }).__settleHistory,
    );
    expect(settleHistory.some((text) => text.includes('Updating'))).toBe(false);
    await expect(page.getByLabel('Style', { exact: true })).toHaveValue('Rock');
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();
    const download = page.waitForEvent('download');
    await exportAs(page, 'Song file');
    const exported = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
    // Blues would have left its genre and its swing behind a 'Rock' picker label — one
    // half-changed setup in one document. The genre is stored once, by name.
    expect(exported.chart.band.groove).toMatchObject({ genre: 'Rock', swing: 0 });
    expect(exported.chart.band.groove).not.toHaveProperty('genreFeel');
});
