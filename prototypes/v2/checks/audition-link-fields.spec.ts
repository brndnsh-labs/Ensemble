import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { appUrl, expect, keyButton, openBand, openKeyPopover, test } from './fixtures';

/**
 * `npm run audition-link` writes a schema-2 `#chart=` link (#1732), the envelope the stand's
 * own "Copy link" writes, so the stand opens it as an unsaved draft through its ordinary
 * shared-link path. This spec builds links by running the real CLI and asserts, per
 * field, that the opened chart is the one asked for: genre, key, meter, tempo, energy, the
 * lane switches and `autoplay`.
 */
interface LinkOptions {
    prog?: string;
    genre?: string;
    key?: string;
    ts?: string;
    bpm?: number;
    intensity?: number;
    on?: ('soloist' | 'bass' | 'chords')[];
    off?: ('soloist' | 'bass' | 'chords')[];
    autoplay?: boolean;
}

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(__dirname, '../../..');

/** Runs the real CLI (`tsx scripts/audition-link.ts`) and returns the one link it prints. */
async function auditionLink(options: LinkOptions = {}): Promise<string> {
    const flags: Array<[string, string | number | undefined]> = [
        ['prog', options.prog ?? 'C7 | F7 | C7 | C7'],
        ['genre', options.genre ?? 'Blues'],
        ['base-url', appUrl('')],
        ['key', options.key],
        ['ts', options.ts],
        ['bpm', options.bpm],
        ['int', options.intensity],
        ['on', options.on?.join(',')],
        ['off', options.off?.join(',')],
    ];
    const argv = flags.flatMap(([name, value]) =>
        value === undefined ? [] : [`--${name}=${value}`],
    );
    argv.push(...(options.autoplay ? [] : ['--no-autoplay']));
    const { stdout } = await execFileAsync(
        path.join(REPO_ROOT, 'node_modules/.bin/tsx'),
        ['scripts/audition-link.ts', ...argv],
        { cwd: REPO_ROOT },
    );
    return stdout.trim();
}

const lane = (page: import('@playwright/test').Page, name: string) =>
    page.getByRole('button', { name, exact: true });

test('an audition link opens as an unsaved draft with its genre, key, meter and tempo', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
        await auditionLink({
            prog: 'Cm7 | Fm7 | G7 | Cm7',
            genre: 'Jazz',
            key: 'Eb',
            ts: '3/4',
            bpm: 92,
        }),
    );
    await expect(page.getByRole('heading', { name: 'Audition' })).toBeVisible();
    await expect(page.locator('.song-subtitle')).toContainText('Opened from a shared link');
    await expect(page.locator('.bar').first().locator('.chord')).toHaveText(['Cm7']);
    await expect(page.getByLabel('Style', { exact: true })).toHaveValue('Jazz');
    await expect(keyButton(page)).toHaveAccessibleName('Key: E♭');
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('92');
    const menu = await openKeyPopover(page);
    await expect(menu.getByLabel('Meter', { exact: true })).toHaveValue('3/4');
    // Consumed on load: a reload lands on the songbook, not the draft again.
    expect(new URL(page.url()).hash).toBe('');
    expect(errors).toEqual([]);
});

test('an audition link opens at its fixed intensity with the named parts switched', async ({
    page,
}) => {
    await page.goto(await auditionLink({ intensity: 0.82, on: ['soloist'], off: ['chords'] }));
    await expect(page.getByRole('heading', { name: 'Audition' })).toBeVisible();

    // Chords muted, soloist switched on — the two lanes the link named.
    await expect(lane(page, 'Chords')).toHaveAttribute('aria-pressed', 'false');
    await expect(lane(page, 'Soloist')).toHaveAttribute('aria-pressed', 'true');
    // Bass wasn't named: left on the genre's own default (on).
    await expect(lane(page, 'Bass')).toHaveAttribute('aria-pressed', 'true');

    await openBand(page, 'Groove');
    await expect(page.getByLabel('Auto intensity', { exact: true })).not.toBeChecked();
    await expect(page.getByLabel('Band intensity', { exact: true })).toHaveValue('82');
});

test('a link that switches nothing leaves the genre defaults untouched', async ({ page }) => {
    await page.goto(await auditionLink());
    await expect(page.getByRole('heading', { name: 'Audition' })).toBeVisible();
    await expect(lane(page, 'Bass')).toHaveAttribute('aria-pressed', 'true');
    await expect(lane(page, 'Chords')).toHaveAttribute('aria-pressed', 'true');
    await expect(lane(page, 'Soloist')).toHaveAttribute('aria-pressed', 'false');
});

test('autoplay=1 hints and starts the band on the first gesture, not before', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(await auditionLink({ autoplay: true }));
    await expect(page.getByRole('heading', { name: 'Audition' })).toBeVisible();
    const status = page.getByTestId('stand-toast');
    await expect(status).toContainText('tap anywhere to play');
    // Not playing yet: no gesture has happened, so autoplay must not have started itself.
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeVisible();

    // Any key press is the "first gesture" the hint asks for — the same one Play needs.
    await page.keyboard.press('Shift');
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
    // #1460 — "Band is playing" is gone from the stand entirely; `startPlayback` clears the
    // stale hint the instant the band actually starts, so the toast no longer echoes it either.
    await expect(status).not.toContainText('tap anywhere to play');
    expect(errors).toEqual([]);
});

test('a link without autoplay never shows the tap-to-play hint', async ({ page }) => {
    await page.goto(await auditionLink());
    await expect(page.getByRole('heading', { name: 'Audition' })).toBeVisible();
    await expect(page.getByTestId('stand-toast')).not.toContainText('tap anywhere to play');
});

/**
 * The gesture that arms autoplay can itself land ON the Play button — review finding on
 * b2748d51: the window-level listener started the band, and the SAME tap's `click` then
 * reached `onPlayToggle`, which read `isPlaying` (already true, since `runtime.toggle()` can
 * resolve inside the tap's own pointerdown-to-click gap) and called `runtime.stop()` —
 * starting and immediately stopping the band on the very gesture meant to start it. Both
 * specs below hold `expect(stopButton).toBeVisible()` for a beat afterward (Playwright's own
 * polling, not a fixed sleep) so a start-then-stop blip would show up as a later failure even if
 * the very first check happened to catch the band mid-blip.
 */
test('clicking Play on an armed autoplay link plays — it does not start and immediately stop', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(await auditionLink({ autoplay: true }));
    await expect(page.getByRole('heading', { name: 'Audition' })).toBeVisible();
    const status = page.getByTestId('stand-toast');
    await expect(status).toContainText('tap anywhere to play');

    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    const stopButton = page.getByRole('button', { name: 'Stop playback' });
    await expect(stopButton).toBeVisible();
    await expect(status).not.toContainText('tap anywhere to play');
    // Holds past the point a start-then-stop race would have undone it.
    await page.waitForTimeout(500);
    await expect(stopButton).toBeVisible();
    expect(errors).toEqual([]);
});

test('pressing Enter on the focused Play button plays an armed autoplay link the same way', async ({
    page,
}, testInfo) => {
    // Keyboard-focus interaction; webkit-phone's iPhone emulation doesn't drive Tab/Enter
    // focus the way a laptop keyboard does, so this one is laptop-only per the review note.
    test.skip(testInfo.project.name !== 'laptop', 'keyboard-focus interaction, laptop only');
    await page.goto(await auditionLink({ autoplay: true }));
    await expect(page.getByRole('heading', { name: 'Audition' })).toBeVisible();
    const status = page.getByTestId('stand-toast');
    await expect(status).toContainText('tap anywhere to play');

    await page.getByRole('button', { name: 'Start playback', exact: true }).focus();
    await page.keyboard.press('Enter');
    const stopButton = page.getByRole('button', { name: 'Stop playback' });
    await expect(stopButton).toBeVisible();
    await expect(status).not.toContainText('tap anywhere to play');
    await page.waitForTimeout(500);
    await expect(stopButton).toBeVisible();
});
