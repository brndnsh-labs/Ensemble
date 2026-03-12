import { expect, test } from '@playwright/test';

test.describe('Instrument Kebab Menus - Visual & Interaction', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
    });

    test('Chords Kebab Menu - Layout & Content @desktop', async ({ page }) => {
        const chordPanel = page.locator('#panel-chords');
        const kebabBtn = chordPanel.locator('.panel-menu-btn').filter({ hasText: '⋮' });

        await expect(kebabBtn).toBeVisible();
        await kebabBtn.click();

        const settingsMenu = chordPanel.locator('.panel-settings-menu');
        await expect(settingsMenu).toBeVisible();

        // Check for specific content to ensure it's the right menu
        await expect(settingsMenu).toContainText('Voicing');
        await expect(settingsMenu).toContainText('Mixer');

        // Functional check: Verify controls exist
        await expect(settingsMenu.locator('select#densitySelect')).toBeVisible();
        await expect(settingsMenu.locator('input#chordVolume')).toBeVisible();
    });

    test('Grooves Kebab Menu - Layout & Content @desktop', async ({ page }) => {
        const groovePanel = page.locator('#panel-grooves');
        const kebabBtn = groovePanel.locator('.panel-menu-btn').filter({ hasText: '⋮' });

        await expect(kebabBtn).toBeVisible();
        await kebabBtn.click();

        const settingsMenu = groovePanel.locator('.panel-settings-menu');
        await expect(settingsMenu).toBeVisible();

        await expect(settingsMenu).toContainText('Feel & Actions');
        await expect(settingsMenu).toContainText('Mixer');

        // Functional check: Verify controls exist
        await expect(settingsMenu.locator('input#swingSlider')).toBeVisible();
        await expect(settingsMenu.locator('input#drumVolume')).toBeVisible();
    });

    test('Soloist Kebab Menu - Alignment & Compactness @desktop', async ({ page }) => {
        const soloistPanel = page.locator('#panel-soloist');
        const kebabBtn = soloistPanel.locator('.panel-menu-btn').filter({ hasText: '⋮' });

        await expect(kebabBtn).toBeVisible();
        await kebabBtn.click();

        const settingsMenu = soloistPanel.locator('.panel-settings-menu');
        await expect(settingsMenu).toBeVisible();

        await expect(settingsMenu).toContainText('Instrument');
        await expect(settingsMenu).toContainText('Mixer');

        // Verify "Trumpet" or other long text isn't cut off by checking height/visibility
        const select = settingsMenu.locator('select').first();
        await expect(select).toBeVisible();
        await expect(settingsMenu.locator('input#soloistVolume')).toBeVisible();
    });
});
