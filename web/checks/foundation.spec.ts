import {
    appUrl,
    closeBarDock,
    editorRevealed,
    expect,
    exportAs,
    keyButton,
    leaveBar,
    measureSong,
    openBar,
    pickSongKey,
    seedGuestDocuments,
    seedStarters,
    songLink,
    songMenuAction,
    starterDocuments,
    typeBar,
} from './fixtures';
import { closeSounds, openSounds, test } from './foundation-helpers';

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
    await seedStarters(page);
    await expect(page.getByTestId('library-heading')).toBeVisible();
    await songLink(page, 'Blue pocket', 'Blues').click();
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
    await songLink(page, 'Blue pocket', 'Blues').click();
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('120');
    await songMenuAction(page, 'Revert to saved');
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('115');
    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL || ''))
        .toContain(appUrl('sw.js'));
    await disconnect();
    await page.reload();
    await songLink(page, 'Blue pocket', 'Blues').click();
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('115');
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect.poll(() => page.locator('[data-active="true"]').count()).toBeGreaterThan(0);
    expect(await page.evaluate(() => localStorage.getItem('ensemble_currentState'))).toBe(
        'legacy-sentinel',
    );
    expect(errors).toEqual([]);
});

// One test per screen (#1496). The four screens in one test ran 45-47s on a loaded WebKit runner
// against the suite's 45s budget: each opens and closes the Band dialog, plays and stops three
// times and takes two screenshots, and headless WebKit renders the first frames after a dialog
// opens at up to a second each, which Playwright's stable-element wait has to sit through.
for (const [width, height] of [
    [1300, 940],
    [402, 874],
    [874, 402],
    [820, 1180],
]) {
    test(`responsive chart and editor fit ${width}x${height}`, async ({ page }) => {
        await seedStarters(page);
        await songLink(page, 'Blue pocket', 'Blues').click();
        await page.setViewportSize({ width, height });
        await expect(
            page.getByRole('button', { name: 'Start playback', exact: true }),
        ).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true,
        );
        const firstBar = await page.locator('.bar').first().boundingBox();
        expect(firstBar!.y).toBeLessThan(width > 1100 ? 220 : height < 500 ? 210 : 310);
        const chartBefore = await page.locator('.chart-scroll').boundingBox();
        await openSounds(page);
        await expect(page.getByRole('dialog', { name: 'Band' })).toBeVisible();
        expect(await page.locator('.chart-scroll').boundingBox()).toEqual(chartBefore);
        await closeSounds(page);
        await expect(page.getByRole('button', { name: 'Band…' })).toBeFocused();
        await page.getByRole('button', { name: 'Start playback', exact: true }).click();
        // Playing hides nothing: the header's controls stay where they were (#1969).
        for (const name of ['Edit chart', 'Save', 'Band…']) {
            await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
        }
        for (const label of ['Tempo', 'Style']) {
            await expect(page.getByLabel(label, { exact: true })).toBeVisible();
        }
        await expect(keyButton(page)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Bass', exact: true })).toBeVisible();
        const playingChart = await page.locator('.chart-scroll').boundingBox();
        expect(playingChart!.height).toBeGreaterThan(height * 0.5);
        await page.screenshot({ path: `test-results/playing-${width}.png` });
        await page.getByRole('button', { name: 'Stop playback' }).click();
        await page.screenshot({ path: `test-results/chart-${width}.png` });
        await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
        // A bar typed and not left: playback takes it, and it is still there after.
        const typed = 'Dm7 G7';
        await typeBar(page, 1, typed);
        // On a phone the transport is hidden while the bar dock is up (#1724).
        await closeBarDock(page);
        await page.getByRole('button', { name: 'Start playback', exact: true }).click();
        await expect(page.locator('.bar-input, .bar-dock')).toHaveCount(0);
        await page.getByRole('button', { name: 'Stop playback' }).click();
        await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
        await expect(await openBar(page, 1)).toHaveValue(typed);
        await leaveBar(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true,
        );
    });
}

test('two tabs cannot overwrite a newer save; a conflicting take can become a copy', async ({
    page,
    context,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    const second = await context.newPage();
    await second.goto(appUrl());
    await songLink(second, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Faster', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await second.getByRole('button', { name: 'Slower', exact: true }).click();
    await second.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
        second.getByRole('alert').filter({ hasText: 'saved in another tab' }),
    ).toBeVisible();
    await expect(second.getByLabel('Tempo', { exact: true })).toHaveValue('105');
    await songMenuAction(second, 'Duplicate');
    await expect(
        second.getByRole('heading', { name: 'Blue pocket — copy', exact: true }),
    ).toBeVisible();
    await page.reload();
    await songLink(page, 'Blue pocket', 'Blues').click();
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
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('My writing sketch');
    await typeBar(page, 1, 'Am7 D7');
    await leaveBar(page);
    await expect(page.locator('.bar').first().locator('.chord')).toHaveText(['Am7', 'D7']);
    const download = page.waitForEvent('download');
    await exportAs(page, 'Song file');
    const exported = await download;
    const path = await exported.path();
    expect(path).toBeTruthy();
    await page.getByLabel('Import Ensemble document').setInputFiles(path!);
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect(
        page.getByRole('heading', { name: 'My writing sketch', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.bar').first().locator('.chord')).toHaveText(['Am7', 'D7']);
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
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.evaluate(() => {
        Storage.prototype.setItem = () => {
            throw new DOMException('Full', 'QuotaExceededError');
        };
    });
    await page.getByRole('button', { name: 'Faster', exact: true }).click();
    await expect(
        page.getByText('Practice settings changed · this tab only', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await songLink(page, 'After hours', 'Bossa').click();
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await songLink(page, 'Blue pocket', 'Blues').click();
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('115');
    await expect(
        page.getByText('Practice settings changed · this tab only', { exact: true }),
    ).toBeVisible();
});

test('an older competing draft remains explicitly recoverable after another tab saves', async ({
    page,
    context,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    const second = await context.newPage();
    await second.goto(appUrl());
    await songLink(second, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Slower', exact: true }).click();
    await second.getByRole('button', { name: 'Faster', exact: true }).click();
    await second.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(second.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.reload();
    await songLink(page, 'Blue pocket', 'Blues').click();
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('115');
    await songMenuAction(page, /Older drafts \(/);
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
    // A 64-bar measure chart beside the starters, older than all of them (#1733: a text chart
    // grew to 64 bars by typing them into the edit panel, which a measure chart does not have).
    const long = measureSong(
        [
            'long-chart',
            'Long chart',
            'Jazz',
            'C',
            Array.from({ length: 64 }, (_, i) => ['Cmaj7', 'Am7', 'Dm7', 'G7'][i % 4]).join(' | '),
            110,
        ],
        new Date(Date.now() - 60_000).toISOString(),
    );
    await seedGuestDocuments(page, [...starterDocuments(), long]);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL || ''))
        .toContain(appUrl('sw.js'));
    await disconnect();
    const genres = await page
        .getByLabel('Style', { exact: true })
        .locator('option')
        .allTextContents();
    expect(genres).toHaveLength(13);
    for (const genre of genres) {
        await page.getByLabel('Style', { exact: true }).selectOption(genre);
        await expect(page.getByLabel('Style', { exact: true })).toBeEnabled();
        await expect(page.locator('.error-banner[role="alert"]')).toHaveCount(0);
    }
    await pickSongKey(page, 'Eb');
    await page.getByRole('button', { name: 'Bass', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.reload();
    await songLink(page, 'Blue pocket').click();
    await expect(keyButton(page)).toHaveAccessibleName('Key: E♭');
    await expect(page.getByRole('button', { name: 'Bass', exact: true })).toHaveAttribute(
        'aria-pressed',
        'false',
    );
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await songLink(page, 'Long chart').click();
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
    // #1460 — the Resume-follow pill only exists while playing (hidden when stopped, per
    // acceptance), so proving a manual scroll turns Following off now needs the band running.
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    await page.locator('.chart-scroll').press('PageDown');
    await expect(page.getByTestId('resume-follow')).toBeVisible();

    // #1460 review P3 spec gap — tapping the pill re-applies the scroll: on this overflowing
    // 64-bar chart, scrolling several rows further away first proves the playing row was
    // genuinely out of view, not still in view by coincidence.
    const scrollEl = page.locator('.chart-scroll');
    const activeInView = () =>
        scrollEl.evaluate((el) => {
            const active = el.querySelector('.bar[data-active="true"]');
            if (!active) {
                return null;
            }
            const sr = el.getBoundingClientRect();
            const ar = active.getBoundingClientRect();
            return ar.top >= sr.top && ar.bottom <= sr.bottom;
        });
    await page.locator('.chart-scroll').press('PageDown');
    await page.locator('.chart-scroll').press('PageDown');
    await expect.poll(activeInView).toBe(false);

    // #1460 re-review P3 — `.chart-scroll`'s bottom padding must still let the LAST row clear
    // the stack once it shows something (the pill, here) — the whole reason the padding formula
    // reads the stack's own measured height rather than staying a fixed guess. Waited for the
    // message toast to go empty first, so the stack holds exactly the pill and nothing else —
    // otherwise a still-showing "Saved on this device" from this test's earlier reload/re-open
    // would inflate `--stand-stack-height` and make this a race against that message's own ~4s
    // auto-dismiss rather than a check of the padding formula itself.
    await expect(page.getByTestId('stand-toast')).toHaveAttribute('data-empty', 'true');
    // `.chart-scroll` has `scroll-behavior: smooth`, which — per the CSSOM View spec — also
    // governs a direct `scrollTop` assignment, not just `scrollTo()`/`scrollIntoView()`. An
    // explicit `behavior: 'instant'` is what actually jumps immediately instead of leaving this
    // read mid-animation.
    await scrollEl.evaluate((el) => {
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
    });
    const lastBarBox = await page.locator('.bar').last().boundingBox();
    const pillBox = await page.getByTestId('resume-follow').boundingBox();
    expect(lastBarBox).not.toBeNull();
    expect(pillBox).not.toBeNull();
    expect(lastBarBox!.y + lastBarBox!.height).toBeLessThanOrEqual(pillBox!.y);

    await page.getByTestId('resume-follow').click();
    await expect(page.getByTestId('resume-follow')).toHaveCount(0);
    await expect.poll(activeInView).toBe(true);
    await page.getByRole('button', { name: 'Stop playback' }).click();
});
