import { encodeBase64Unicode } from '../../../public/state/share-codec';
import { appUrl, expect, test } from './fixtures';

/**
 * The audition-link fields #1382 taught the v2 stand to read: `int` (a fixed band energy),
 * `bnd`'s part switches (soloist/bass/chords mute) and `autoplay` (play after the first
 * gesture). These ride the same `?prog=`/`bnd=` envelope `npm run audition-link` writes and
 * `prototypes/v2/lib/v1-link.ts` already opens for the older fields
 * (`v1-share-link.spec.ts` covers `s`/`prog`/`key`/`ts`/`bpm`/`genre`/`notation`); this spec
 * is the "each field" acceptance criterion for the three #1382 adds.
 */
function auditionLink(params: Record<string, string>): string {
    const search = new URLSearchParams({
        prog: 'C7 | F7 | C7 | C7',
        genre: 'Blues',
        key: 'C',
        ...params,
    });
    return appUrl(`?${search.toString()}`);
}

/**
 * A `bnd` payload switching only the lanes named — the same envelope
 * `scripts/audition-link.ts`'s `buildBandParam` writes, minified to just the `e` (enabled)
 * flag each lane's block needs; the reader ignores everything else a real payload would carry
 * (style/octave/volume/reverb), so a minimal object round-trips identically.
 */
function bnd(switches: Partial<Record<'s' | 'b' | 'c', 0 | 1>>): string {
    const payload: Record<string, { e: 0 | 1 }> = {};
    for (const [lane, e] of Object.entries(switches)) {
        payload[lane] = { e: e as 0 | 1 };
    }
    return encodeBase64Unicode(JSON.stringify(payload));
}

test('an audition link opens at its fixed intensity with the named parts switched', async ({
    page,
}) => {
    await page.goto(auditionLink({ int: '0.82', bnd: bnd({ c: 0, s: 1 }) }));
    await expect(page.getByRole('heading', { name: 'Shared song' })).toBeVisible();

    // Chords muted, soloist switched on — the two lanes the payload named.
    await expect(page.getByRole('button', { name: 'Chords', exact: true })).toHaveAttribute(
        'aria-pressed',
        'false',
    );
    await expect(page.getByRole('button', { name: 'Soloist', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
    // Bass wasn't named in `bnd`: left on the genre's own default (on).
    await expect(page.getByRole('button', { name: 'Bass', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
    );

    await page.getByRole('button', { name: 'Feel and mix', exact: true }).click();
    await expect(page.getByLabel('Auto intensity', { exact: true })).not.toBeChecked();
    await expect(page.getByLabel('Band intensity', { exact: true })).toHaveValue('82');
});

test('a link with no int/bnd opens on auto energy with the genre defaults untouched', async ({
    page,
}) => {
    await page.goto(auditionLink({}));
    await expect(page.getByRole('heading', { name: 'Shared song' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bass', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
    await expect(page.getByRole('button', { name: 'Soloist', exact: true })).toHaveAttribute(
        'aria-pressed',
        'false',
    );

    await page.getByRole('button', { name: 'Feel and mix', exact: true }).click();
    await expect(page.getByLabel('Auto intensity', { exact: true })).toBeChecked();
});

test('a malformed int/bnd is ignored rather than pinning a level or lane nobody asked for', async ({
    page,
}) => {
    await page.goto(auditionLink({ int: 'not-a-number', bnd: 'not-base64!!!' }));
    await expect(page.getByRole('heading', { name: 'Shared song' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bass', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
    );

    await page.getByRole('button', { name: 'Feel and mix', exact: true }).click();
    await expect(page.getByLabel('Auto intensity', { exact: true })).toBeChecked();
});

test('autoplay=1 hints and starts the band on the first gesture, not before', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(auditionLink({ autoplay: '1' }));
    await expect(page.getByRole('heading', { name: 'Shared song' })).toBeVisible();
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
    await page.goto(auditionLink({}));
    await expect(page.getByRole('heading', { name: 'Shared song' })).toBeVisible();
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
    await page.goto(auditionLink({ autoplay: '1' }));
    await expect(page.getByRole('heading', { name: 'Shared song' })).toBeVisible();
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
    await page.goto(auditionLink({ autoplay: '1' }));
    await expect(page.getByRole('heading', { name: 'Shared song' })).toBeVisible();
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
