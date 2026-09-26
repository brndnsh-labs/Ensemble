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
    const status = page.locator('.playback-footer [role="status"]');
    await expect(status).toContainText('tap anywhere to play');
    // Not playing yet: no gesture has happened, so autoplay must not have started itself.
    await expect(status).not.toContainText('Band is playing');

    // Any key press is the "first gesture" the hint asks for — the same one Play needs.
    await page.keyboard.press('Shift');
    await expect(status).toContainText('Band is playing');
    expect(errors).toEqual([]);
});

test('a link without autoplay never shows the tap-to-play hint', async ({ page }) => {
    await page.goto(auditionLink({}));
    await expect(page.getByRole('heading', { name: 'Shared song' })).toBeVisible();
    await expect(page.locator('.playback-footer [role="status"]')).not.toContainText(
        'tap anywhere to play',
    );
});
