import type { Page } from '@playwright/test';
import { expect, openBand, seedStarters, songLink, test } from './fixtures';

// #1994 — the band's intensity on the transport, tablet width and up, Auto at its left stop. It is
// the chart's own energy (the Groove tab's field, `band-sheet.spec.ts`), so this spec checks the
// slider drives the same state: one gesture, the chart staying on screen.

/** The same gesture-commit helper as `band-sheet.spec.ts`'s `setRange`. */
async function slide(page: Page, value: number) {
    const input = page.getByLabel('Intensity', { exact: true });
    await input.evaluate((el: HTMLInputElement, v: number) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!
            .set!;
        setter.call(el, String(v));
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    await input.dispatchEvent('pointerup');
}

test('the transport slider is the chart’s energy: Auto at the left, a level anywhere right', async ({
    page,
}, info) => {
    test.skip(info.project.name !== 'laptop', 'the slider is tablet and up');
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();

    const slider = page.getByLabel('Intensity', { exact: true });
    const save = page.getByRole('button', { name: 'Save', exact: true });
    // A starter is on auto: the left stop.
    await expect(slider).toHaveValue('0');
    await expect(slider).toHaveAttribute('aria-valuetext', 'Auto');
    await expect(save).toBeDisabled();

    await slide(page, 70);
    await expect(slider).toHaveValue('70');
    await expect(page.locator('.intensity-value')).toHaveText('70');
    // One gesture, the chart still showing, and the chart is edited (energy is its own).
    await expect(save).toBeEnabled();
    await expect(page.locator('.transport-bar')).toBeVisible();

    // The Groove tab reads the same state.
    await openBand(page, 'Groove');
    await expect(page.getByLabel('Auto intensity', { exact: true })).not.toBeChecked();
    await expect(page.getByLabel('Band intensity', { exact: true })).toHaveValue('70');
    await page.getByRole('button', { name: 'Close band' }).click();

    // Back to the left stop is Auto again, and the chart reads unedited.
    await slide(page, 0);
    await expect(page.locator('.intensity-value')).toHaveText('Auto');
    await expect(save).toBeDisabled();
    await openBand(page, 'Groove');
    await expect(page.getByLabel('Auto intensity', { exact: true })).toBeChecked();
});

test('a tablet’s transport holds the slider on one row, and Play does not move it', async ({
    page,
}, info) => {
    test.skip(info.project.name !== 'laptop', 'sized by hand');
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    for (const width of [820, 768]) {
        await page.setViewportSize({ width, height: 1000 });
        const fit = await page.locator('.transport-bar').evaluate((bar) => {
            const kids = [...bar.children].filter(
                (el) => (el as HTMLElement).offsetParent !== null,
            );
            // Centres, not tops: the row aligns its items on the middle.
            const tops = kids.map((el) => {
                const box = el.getBoundingClientRect();
                return Math.round(box.top + box.height / 2);
            });
            const right = Math.max(...kids.map((el) => el.getBoundingClientRect().right));
            const rows = Math.max(...tops) - Math.min(...tops);
            return { rows, slack: bar.clientWidth - right, tops, right };
        });
        expect(fit.rows).toBeLessThanOrEqual(12);
        // CI's WebKit sets text ~10px wider than local: keep margin.
        expect(fit.slack).toBeGreaterThanOrEqual(12);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true,
        );
    }
    const before = await page.getByLabel('Intensity', { exact: true }).boundingBox();
    await page.getByRole('button', { name: 'Start playback' }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
    const during = await page.getByLabel('Intensity', { exact: true }).boundingBox();
    expect(during).toEqual(before);
    // Still reachable while playing.
    await slide(page, 40);
    await expect(page.locator('.intensity-value')).toHaveText('40');
});

test('a phone has no slider on the transport: the Groove tab keeps intensity', async ({
    page,
}, info) => {
    test.skip(info.project.name !== 'webkit-phone', 'phone only');
    await seedStarters(page);
    await songLink(page, 'Blue pocket').first().click();
    await expect(page.getByLabel('Intensity', { exact: true })).toBeHidden();
});
