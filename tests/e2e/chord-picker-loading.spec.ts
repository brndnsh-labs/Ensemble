// @ts-nocheck
import { readdirSync, readFileSync } from 'node:fs';
import pkg from '@playwright/test';
import { gotoHydrated } from './helpers/nav.js';

const { expect, test } = pkg;

function pickerAsset() {
    const map = readdirSync('dist').find((name) => {
        if (!name.endsWith('.js.map')) {
            return false;
        }
        const { sources } = JSON.parse(readFileSync(`dist/${name}`, 'utf8'));
        return sources.some((source) => source.endsWith('/components/editor/ChordPicker.tsx'));
    });
    expect(map, 'the production build contains the picker').toBeTruthy();
    return map!.slice(0, -4);
}

test.describe('On-demand chord picker @ui', () => {
    for (const dismissal of ['Escape', 'Tab', 'outside click', 'playback']) {
        test(`a slow first open stays dismissed after ${dismissal}`, async ({ page }) => {
            const asset = pickerAsset();
            let requested = false;
            let release!: () => void;
            const gate = new Promise<void>((resolve) => {
                release = resolve;
            });
            await page.route(`**/${asset}`, async (route) => {
                const response = await route.fetch();
                requested = true;
                await gate;
                await route.fulfill({ response });
            });
            await gotoHydrated(page);
            expect(requested, 'the picker is not a startup request').toBe(false);
            expect(readFileSync('dist/sw.js', 'utf8')).toContain(asset);
            const card = page.locator('.chord-card').first();
            await card.click();
            await expect.poll(() => requested).toBe(true);
            await expect(
                page.getByRole('status').filter({ hasText: 'Loading chord picker' }),
            ).toBeVisible();
            if (dismissal === 'Escape' || dismissal === 'Tab') {
                await page.keyboard.press(dismissal);
            } else if (dismissal === 'playback') {
                await page.getByRole('button', { name: 'START', exact: true }).click();
            } else {
                await page.locator('.chart-surface__topbar').click({ position: { x: 2, y: 2 } });
            }
            await expect(page.getByText('Loading chord picker…')).toHaveCount(0);
            const loaded = page.waitForResponse(`**/${asset}`);
            release();
            await loaded;
            // Re-import awaits evaluation of the exact module whose delayed response
            // just arrived; no sleep can stand in for completing that pending open.
            await page.evaluate((url) => import(url), `/${asset}`);
            await expect(page.locator('.chord-picker')).toHaveCount(0);
            if (dismissal === 'playback') {
                await expect(page.locator('#playBtn')).toContainText('STOP');
                await page.locator('#playBtn').click();
            }
            await card.click();
            const picker = page.getByRole('dialog', { name: 'Replace chord' });
            await expect(picker).toBeVisible();
            await expect(picker).toHaveAttribute('data-dismiss-ready', 'true');
            await page.keyboard.press('Escape');
            await expect(picker).toHaveCount(0);
            await expect(card).toBeFocused();
        });
    }

    test('a failed download leaves the chart and authored chords intact', async ({ page }) => {
        await page.route(`**/${pickerAsset()}`, (route) => route.abort('failed'));
        await gotoHydrated(page);
        const before = await page.locator('.chord-card').allTextContents();
        await page.locator('.chord-card').first().click();
        await expect(
            page.getByText('Chord picker could not load. Reconnect, then reload to try again.'),
        ).toBeVisible();
        await expect(page.locator('.chord-picker')).toHaveCount(0);
        expect(await page.locator('.chord-card').allTextContents()).toEqual(before);
        await expect(page.getByRole('button', { name: 'START', exact: true })).toBeVisible();
        await page.unroute(`**/${pickerAsset()}`);
        await page.reload();
        await expect(page.locator('.chord-card').first()).toBeVisible();
        expect(await page.locator('.chord-card').allTextContents()).toEqual(before);
        await page.locator('.chord-card').first().click();
        await expect(page.getByRole('dialog', { name: 'Replace chord' })).toBeVisible();
    });

    test('first-open selection still replaces the tapped chord', async ({ page }) => {
        await page.addInitScript(() => {
            const observer = new MutationObserver(() => {
                const button = document.querySelector('.chord-picker button');
                if (button) {
                    observer.disconnect();
                    // Exercise the handoff before passive-effect cleanup; a blanket
                    // pending-dismiss listener must no longer own this mounted UI.
                    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    window.__pickerFirstInput = true;
                }
            });
            observer.observe(document, { childList: true, subtree: true });
        });
        await gotoHydrated(page);
        await page.locator('.chord-card').first().click();
        const picker = page.getByRole('dialog', { name: 'Replace chord' });
        await expect(picker).toBeVisible();
        expect(await page.evaluate(() => window.__pickerFirstInput)).toBe(true);
        await picker.getByRole('button', { name: '♭II', exact: true }).click();
        await picker.getByRole('button', { name: 'maj7', exact: true }).click();
        await page.keyboard.press('Escape');
        await expect(picker).toHaveCount(0);
        await expect(page.locator('.chord-card').first()).toContainText('♭II');
        await expect(page.locator('.chord-card').first()).toContainText('maj7');
    });

    test('an installed app can open the picker for the first time offline', async ({
        page,
        context,
    }) => {
        await gotoHydrated(page);
        // The normal bootstrap deliberately skips worker registration under
        // automation. Install the real built worker explicitly for this contract.
        await page.evaluate(async () => {
            await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) {
                await new Promise<void>((resolve) => {
                    navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
                        once: true,
                    });
                });
            }
        });
        await context.setOffline(true);
        await page.reload();
        await page.locator('.chord-card').first().click();
        const picker = page.getByRole('dialog', { name: 'Replace chord' });
        await expect(picker).toBeVisible();
        await expect(picker).toHaveAttribute('data-dismiss-ready', 'true');
        await page.keyboard.press('Escape');
        await expect(picker).toHaveCount(0);
    });
});
