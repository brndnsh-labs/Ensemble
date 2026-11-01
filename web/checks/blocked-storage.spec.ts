import type { Page } from '@playwright/test';
import { appUrl, expect, test } from './fixtures';

/**
 * A browser that refuses storage or Web Audio still opens the stand (#1982): blocked storage
 * boots an empty songbook that says saving is off (the standards catalog needs no storage), and
 * a missing AudioContext says so on Play instead of doing nothing.
 */

async function openBlues(page: Page) {
    await page.goto(appUrl());
    const search = page.getByRole('searchbox', { name: 'Search your songs and the standards' });
    await search.fill('12-Bar');
    await page
        .getByTestId('search-standards')
        .getByRole('button', { name: 'Open 12-Bar Blues' })
        .click();
    await expect(page.getByRole('heading', { name: '12-Bar Blues', exact: true })).toBeVisible();
}

test.describe('storage blocked', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            const refuse = () => {
                throw new DOMException('The operation is insecure.', 'SecurityError');
            };
            Object.defineProperty(window, 'indexedDB', { get: refuse, configurable: true });
            Object.defineProperty(window, 'localStorage', { get: refuse, configurable: true });
        });
    });

    test('reaches the home with saving off, and a standard still plays', async ({ page }) => {
        await openBlues(page);
        await expect(page.getByTestId('saving-off-banner')).toContainText(
            'Saving is off in this browser',
        );
        await page.getByRole('button', { name: 'Start playback' }).click();
        await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
        await page.getByRole('button', { name: 'Stop playback' }).click();
    });

    test('Keep a copy refuses in plain words instead of throwing', async ({ page }) => {
        await openBlues(page);
        await page.getByRole('button', { name: 'Keep a copy', exact: true }).click();
        const alert = page.locator('.error-banner[role=alert]');
        await expect(alert).toBeVisible();
        await expect(alert).not.toContainText('SecurityError');
        await expect(alert).not.toContainText('insecure');
    });
});

test('without Web Audio, Play says so', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true });
        Object.defineProperty(window, 'webkitAudioContext', {
            value: undefined,
            configurable: true,
        });
    });
    await openBlues(page);
    await page.getByRole('button', { name: 'Start playback' }).click();
    await expect(page.locator('.error-banner[role=alert]')).toContainText(
        "This browser can't play audio.",
    );
    await expect(page.getByRole('button', { name: 'Start playback' })).toBeVisible();
});
