import type { Page } from '@playwright/test';
import { appUrl, editorRevealed, expect, seedStarters, songLink, test } from './fixtures';

/**
 * The most of each preview element on the board in any frame over `ms` of playback: the preview
 * lives on the last beat only, so a fixed-interval poll could keep missing it.
 */
function previewSeen(page: Page, ms: number) {
    return page.evaluate(
        (ms) =>
            new Promise<{ ghosts: number; arrows: number; targets: number }>((resolve) => {
                const seen = { ghosts: 0, arrows: 0, targets: 0 };
                const end = performance.now() + ms;
                const count = (selector: string) =>
                    document.querySelectorAll(`.neck-view ${selector}`).length;
                const frame = () => {
                    seen.ghosts = Math.max(seen.ghosts, count('.neck-ghost-dot'));
                    seen.arrows = Math.max(seen.arrows, count('.neck-arrow'));
                    seen.targets = Math.max(seen.targets, count('.neck-target'));
                    if (performance.now() < end) {
                        requestAnimationFrame(frame);
                    } else {
                        resolve(seen);
                    }
                };
                frame();
            }),
        ms,
    );
}

/**
 * The stand's Neck mode (#1587): a third view beside Chart and Edit chart that shows the grip for
 * the chord sounding now, previews the next one, follows the band, and is remembered per device.
 */
test('the neck shows the grip, follows the band and is remembered', async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Neck study');
    for (const [i, bar] of ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'].entries()) {
        await page.getByLabel('Chords in this bar').fill(bar);
        if (i < 3) {
            await page.getByRole('button', { name: 'Next bar', exact: true }).click();
        }
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(page.locator('.chord')).toHaveText(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']);

    // Neck replaces the chart sheet; stopped, it shows the first grip and points at the second.
    await page.getByRole('button', { name: 'Neck', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Neck', exact: true })).toHaveClass(/active/);
    await expect(page.getByRole('button', { name: 'Chart', exact: true })).not.toHaveClass(
        /active/,
    );
    const view = page.getByRole('region', { name: 'Neck' });
    await expect(view).toBeVisible();
    await expect(page.getByRole('region', { name: 'Chord chart' })).toHaveCount(0);
    await expect(view.locator('svg.neck')).toBeVisible();
    await expect(view.locator('.neck-dot')).toHaveCount(3);
    await expect(view.getByTestId('neck-current')).toHaveText('Dm7');
    await expect(view.getByTestId('neck-next')).toContainText('G7');
    const headline = view.locator('.neck-headline');
    await expect(headline).toContainText('then G7');
    await expect(headline).toContainText('root up a 4th');
    // The finger-by-finger detail is off until asked for, and remembered once it is.
    await expect(view.locator('.neck-fingers')).toHaveCount(0);
    const sayFingers = view.getByRole('checkbox', { name: 'Say the fingers' });
    await expect(sayFingers).not.toBeChecked();
    await sayFingers.check();
    await expect(view.locator('.neck-fingers')).toBeVisible();
    await expect(view.locator('.neck-fingers')).toContainText('Finger 2 stays down');
    await expect(view.locator('.neck-fingers')).toContainText('goes down');
    await page.reload();
    await songLink(page, 'Neck study').first().click();
    await expect(view.getByRole('checkbox', { name: 'Say the fingers' })).toBeChecked();
    await expect(view.locator('.neck-fingers')).toBeVisible();

    // The phone keeps the page inside the screen in Neck mode.
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    // The hand position is the neck's own slider.
    const hand = view.getByRole('slider', { name: 'Hand position' });
    await expect(hand).toHaveAttribute('aria-valuenow', '2');
    await hand.focus();
    await hand.press('ArrowRight');
    await expect(hand).toHaveAttribute('aria-valuenow', '3');

    // A ukulele has four strings, a guitar six.
    const instrument = view.getByLabel('Instrument', { exact: true });
    await instrument.selectOption('uke');
    await expect(view.locator('.neck-string')).toHaveCount(4);
    await expect(view.getByLabel('Root strings')).toHaveCount(0);
    await instrument.selectOption('guitar');
    await expect(view.locator('.neck-string')).toHaveCount(6);

    // Playing, the neck follows the band to the second chord. "Say the fingers" is on, so the
    // last beat before each change draws the finger arrows (#1592) — a frame-polled wait, since
    // that beat is a quarter of each bar.
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    await expect(view.getByTestId('neck-current')).toHaveText('G7', { timeout: 20_000 });
    await page.waitForFunction(() => document.querySelector('.neck-view .neck-arrow') !== null);
    await expect(headline).toContainText('Next: Cmaj7');
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();

    // Neck mode is remembered on this device.
    await page.reload();
    await songLink(page, 'Neck study').first().click();
    await expect(page.getByRole('button', { name: 'Neck', exact: true })).toHaveClass(/active/);
    await expect(page.getByRole('region', { name: 'Neck' }).locator('.neck-dot')).toHaveCount(3);
    // The editor overlays the neck without forgetting it: leaving the editor by Play (no mode
    // button pressed) lands back on Neck, the mode a reload would bring back too.
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await editorRevealed(page);
    await expect(page.getByRole('button', { name: 'Neck', exact: true })).not.toHaveClass(/active/);
    await expect(page.getByRole('region', { name: 'Neck' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    await expect(page.getByRole('region', { name: 'Neck' }).locator('svg.neck')).toBeVisible();
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();
    // The mode buttons hide while the band plays; stopped, Neck is the active one.
    await expect(page.getByRole('button', { name: 'Neck', exact: true })).toHaveClass(/active/);
    // Chart brings the sheet back.
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(page.locator('.chord')).toHaveText(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']);
    expect(errors).toEqual([]);
});

test('the neck follows an older chord list without bars', async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // 'Blue pocket' is a schemaVersion-1 chart: a chord list in sections, no measures.
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Neck', exact: true }).click();
    const view = page.getByRole('region', { name: 'Neck' });
    await expect(view.locator('svg.neck')).toBeVisible();
    expect(await view.locator('.neck-dot').count()).toBeGreaterThanOrEqual(3);
    const current = view.getByTestId('neck-current');
    await expect(current).toHaveText('C7');
    await expect(view.getByTestId('neck-next')).toContainText('F7');

    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    await expect(current).toHaveText('F7', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();
    expect(errors).toEqual([]);
});

test('the preview shows where the next grip is; the fingers on request (#1592)', async ({
    page,
}) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Neck', exact: true }).click();
    const view = page.getByRole('region', { name: 'Neck' });
    await expect(view.locator('svg.neck')).toBeVisible();
    // Stopped: the grip only, the strip names what's next.
    await expect(view.locator('.neck-ghost-dot, .neck-rootpath, .neck-arrow')).toHaveCount(0);

    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    const play = async () => {
        await page.getByRole('button', { name: 'Start playback', exact: true }).click();
        await expect(
            page.getByRole('button', { name: 'Stop playback', exact: true }),
        ).toBeEnabled();
    };
    const stop = async () => {
        await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
        await expect(
            page.getByRole('button', { name: 'Start playback', exact: true }),
        ).toBeEnabled();
    };

    // Default: ghost dots on the last beat (a bar is a second at 240), never the finger detail.
    await play();
    const where = await previewSeen(page, 3_000);
    expect(where.ghosts).toBeGreaterThan(0);
    expect(where.arrows).toBe(0);
    expect(where.targets).toBe(0);
    await stop();

    // "Say the fingers" turns on the arrows and numbered targets with the text.
    await view.getByRole('checkbox', { name: 'Say the fingers' }).check();
    await play();
    const how = await previewSeen(page, 3_000);
    expect(how.ghosts).toBeGreaterThan(0);
    expect(how.targets).toBeGreaterThan(0);
    await stop();
    expect(errors).toEqual([]);
});

test('a phone board follows the hand; a laptop shows the whole neck (#1593)', async ({ page }) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Neck', exact: true }).click();
    const view = page.getByRole('region', { name: 'Neck' });
    await expect(view.locator('svg.neck')).toBeVisible();
    const scale = () =>
        view.locator('.neck-zoom').evaluate((el) => {
            const m = /scale\(([\d.]+)\)/.exec((el as SVGGElement).style.transform);
            return m ? Number(m[1]) : 1;
        });
    const phone = (page.viewportSize()?.width ?? 1280) <= 760;
    if (!phone) {
        await expect.poll(scale).toBe(1);
        return;
    }
    await expect.poll(scale).toBeGreaterThan(1.4);
    const before = await scale();
    // The board follows a home-window move.
    const hand = view.getByRole('slider', { name: 'Hand position' });
    await hand.focus();
    for (let i = 0; i < 4; i++) {
        await hand.press('ArrowRight');
    }
    await expect(hand).toHaveAttribute('aria-valuenow', '6');
    await expect.poll(scale).not.toBe(before);
    // The zoomed board stays inside the screen.
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
});
