// The style's sounds, fetched behind the band on Play (#1997): a fresh device gets the style's
// packs with no other tap and the band moves onto them without stopping; a lane pinned to a
// sound keeps it; Save-Data offers instead; offline, the built-in sounds play.
import type { Page } from '@playwright/test';
import { appUrl, expect, openBand, seedStarters, songLink } from './fixtures';
import { closeSounds, observeSamples, sampleStarts, test } from './foundation-helpers';

/** The fixture turns the fetch off for every other spec; this one is about it. */
async function autoSoundsOn(page: Page) {
    await page.addInitScript(() => {
        try {
            localStorage.setItem('ensemble-v2-preview:auto-sounds', '1');
        } catch {
            // A spec that blocks storage reads the default, which is on.
        }
    });
}

/** Every pack file the page asks the network for, by pack id. */
function packRequests(page: Page): Set<string> {
    const packs = new Set<string>();
    const prefix = appUrl('packs/');
    page.on('request', (request) => {
        const url = request.url();
        const at = url.indexOf(prefix);
        if (at >= 0) {
            packs.add(url.slice(at + prefix.length).split('/')[0]);
        }
    });
    return packs;
}

/**
 * From here on, record whether the transport, once playing, ever read Start again (the band
 * stopped, even for a frame) and every state the stand's sounds line passed through. Read with
 * `watched`.
 */
async function watch(page: Page) {
    await page.evaluate(() => {
        const seen = { started: false, stopped: false, line: [] as string[] };
        Object.assign(window, { __watched: seen });
        const look = () => {
            if (document.querySelector('[aria-label="Stop playback"]')) {
                seen.started = true;
            } else if (seen.started) {
                seen.stopped = true;
            }
            const line = document.querySelector('[data-testid="stand-sounds"]');
            const text =
                line?.getAttribute('data-empty') === 'true' ? '' : (line?.textContent ?? '');
            if (seen.line.at(-1) !== text) {
                seen.line.push(text);
            }
        };
        look();
        new MutationObserver(look).observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
        });
    });
}
function watched(page: Page) {
    return page.evaluate(
        () => (window as unknown as { __watched: { stopped: boolean; line: string[] } }).__watched,
    );
}

function resolvedSound(page: Page, lane: string) {
    return page
        .locator('.player-row')
        .filter({ has: page.getByRole('heading', { name: lane, exact: true }) })
        .locator('.resolved-sound');
}

test('a fresh device gets the style’s sounds on Play and the band moves onto them without stopping', async ({
    page,
}) => {
    test.setTimeout(90_000);
    await autoSoundsOn(page);
    await observeSamples(page);
    const requested = packRequests(page);
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    // A device with nothing installed: every lane starts on the built-in sounds.
    await openBand(page, 'Players');
    await expect(resolvedSound(page, 'Drums')).toHaveText('Using Built-in');
    await expect(resolvedSound(page, 'Chords')).toHaveText('Using Built-in');
    await closeSounds(page);
    await watch(page);
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    const stop = page.getByRole('button', { name: 'Stop playback' });
    await expect(stop).toBeVisible();
    // Built-in first, the real instruments behind it: once they land the band is heard on
    // samples while it plays on — never stopped and started again.
    await expect.poll(() => sampleStarts(page), { timeout: 60_000 }).toBeGreaterThan(0);
    const after = await sampleStarts(page);
    await expect.poll(() => sampleStarts(page)).toBeGreaterThan(after);
    await expect(page.getByTestId('stand-sounds')).toHaveAttribute('data-empty', 'true');
    const seen = await watched(page);
    expect(seen.stopped).toBe(false);
    expect(seen.line).toContain("Getting the band's real instruments…");
    expect(seen.line.at(-1)).toBe('');
    // Blues on Follow feel: its piano, upright and kit. The soloist is off, so its sax is not
    // fetched (a lane that is off is skipped).
    expect([...requested].sort()).toEqual(['acoustic-kit', 'grand', 'upright-bass']);
    await openBand(page, 'Players');
    await expect(resolvedSound(page, 'Drums')).toHaveText('Using Acoustic Drum Kit');
    await expect(resolvedSound(page, 'Bass')).toHaveText('Using Upright Bass');
    await expect(resolvedSound(page, 'Chords')).toHaveText('Using Acoustic Grand Piano');
    await closeSounds(page);
    // A sound that arrived is not an edit.
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await stop.click();
});

test('a style change while playing fetches the new style’s sounds and keeps playing', async ({
    page,
}) => {
    test.setTimeout(120_000);
    await autoSoundsOn(page);
    await observeSamples(page);
    const requested = packRequests(page);
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect.poll(() => requested.has('grand'), { timeout: 60_000 }).toBe(true);
    await expect(page.getByTestId('stand-sounds')).toHaveAttribute('data-empty', 'true', {
        timeout: 60_000,
    });
    await watch(page);
    await page.getByLabel('Style', { exact: true }).selectOption('Funk');
    await expect(page.getByLabel('Style', { exact: true })).toBeEnabled({ timeout: 30_000 });
    // Funk's comp is a clav: fetched behind the band, and the chords lane moves onto it.
    await expect.poll(() => requested.has('clavinet'), { timeout: 60_000 }).toBe(true);
    await openBand(page, 'Players');
    await expect(resolvedSound(page, 'Chords')).toHaveText('Using Clavinet', { timeout: 60_000 });
    await closeSounds(page);
    expect((await watched(page)).stopped).toBe(false);
    const before = await sampleStarts(page);
    await expect.poll(() => sampleStarts(page)).toBeGreaterThan(before);
    await page.getByRole('button', { name: 'Stop playback' }).click();
});

test('a lane saved on Built-in keeps it while the others move onto the style’s sounds', async ({
    page,
}) => {
    test.setTimeout(90_000);
    await autoSoundsOn(page);
    const requested = packRequests(page);
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openBand(page, 'Players');
    await page.getByLabel('Chords sound', { exact: true }).selectOption('synth');
    await expect(page.getByLabel('Chords sound', { exact: true })).toBeEnabled();
    await closeSounds(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect.poll(() => requested.has('acoustic-kit'), { timeout: 60_000 }).toBe(true);
    await openBand(page, 'Players');
    await expect(resolvedSound(page, 'Drums')).toHaveText('Using Acoustic Drum Kit', {
        timeout: 60_000,
    });
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('synth');
    await closeSounds(page);
    expect(requested.has('grand')).toBe(false);
    await page.getByRole('button', { name: 'Stop playback' }).click();
});

test('with Save-Data on, the stand offers the sounds instead of downloading them', async ({
    page,
}) => {
    test.setTimeout(90_000);
    await autoSoundsOn(page);
    await page.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'connection', {
            get: () => ({ saveData: true }),
            configurable: true,
        });
    });
    const requested = packRequests(page);
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    const line = page.getByTestId('stand-sounds');
    await expect(line).toContainText("The band's real instruments are about 3 MB.");
    expect(requested.size).toBe(0);
    await line.getByRole('button', { name: 'Get them' }).click();
    await expect(line).toHaveAttribute('data-empty', 'true', { timeout: 60_000 });
    expect([...requested].sort()).toEqual(['acoustic-kit', 'grand', 'upright-bass']);
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop playback' }).click();
});

test('offline, Play still plays on the built-in sounds and says nothing about it', async ({
    page,
    disconnect,
}) => {
    // A failed fetch must stay quiet in the page too: no unhandled rejection (WebKit reports
    // one as a page error).
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`${error.message}\n${error.stack ?? ''}`));
    await autoSoundsOn(page);
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await disconnect();
    await watch(page);
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
    // It did try, and gave up quietly.
    await expect
        .poll(async () => (await watched(page)).line, { timeout: 30_000 })
        .toEqual(['', "Getting the band's real instruments…", '']);
    await expect(page.locator('.error-banner')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
    await openBand(page, 'Players');
    await expect(resolvedSound(page, 'Drums')).toHaveText('Using Built-in');
    await closeSounds(page);
    await page.getByRole('button', { name: 'Stop playback' }).click();
    expect(errors).toEqual([]);
});
