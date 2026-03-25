import pkg from '@playwright/test';

const { expect, test } = pkg;

async function expectWithinSurface(surface, control) {
    const [surfaceBox, controlBox] = await Promise.all([
        surface.boundingBox(),
        control.boundingBox(),
    ]);

    expect(surfaceBox).not.toBeNull();
    expect(controlBox).not.toBeNull();
    expect(controlBox.x).toBeGreaterThanOrEqual(surfaceBox.x - 1);
    expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(
        surfaceBox.x + surfaceBox.width + 1,
    );
    expect(controlBox.y).toBeGreaterThanOrEqual(surfaceBox.y - 1);
    expect(controlBox.y + controlBox.height).toBeLessThanOrEqual(
        surfaceBox.y + surfaceBox.height + 1,
    );
}

test.describe('Studio settings surfaces - Visual & Interaction', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
        await page.click('[data-workspace-nav="studio"]');
        await expect(page.locator('section[data-workspace="studio"]')).toBeVisible();
    });

    test('Bass settings sheet keeps mixer controls visible @desktop', async ({ page }) => {
        const bassPanel = page.locator('#panel-bass');
        const settingsBtn = bassPanel.getByRole('button', { name: 'Bass settings' });

        await expect(settingsBtn).toBeVisible();
        await settingsBtn.click();

        const settingsSurface = page.locator('.workspace-studio-surface--settings.is-open');
        await expect(settingsSurface).toBeVisible();

        await expect(settingsSurface).toContainText('Bass settings');
        await expect(settingsSurface).toContainText('Instrument');
        await expect(settingsSurface).toContainText('Mixer');

        const volume = settingsSurface.locator('input#bassVolume');
        const reverb = settingsSurface.locator('input#bassReverb');
        await expect(volume).toBeVisible();
        await expect(reverb).toBeVisible();
        await expectWithinSurface(settingsSurface, volume);
        await expectWithinSurface(settingsSurface, reverb);
    });

    test('Drum settings sheet keeps swing and Lars controls within bounds @desktop', async ({
        page,
    }) => {
        const groovePanel = page.locator('#panel-grooves');
        const settingsBtn = groovePanel.getByRole('button', { name: 'Drums settings' });

        await expect(settingsBtn).toBeVisible();
        await settingsBtn.click();

        const settingsSurface = page.locator('.workspace-studio-surface--settings.is-open');
        await expect(settingsSurface).toBeVisible();

        await expect(settingsSurface).toContainText('Drums settings');
        await expect(settingsSurface).toContainText('Feel & Actions');
        await expect(settingsSurface).toContainText('Mixer');

        const swingSlider = settingsSurface.locator('input#swingSlider');
        const swingBase = settingsSurface.locator('select#swingBaseSelect');
        const larsIntensity = settingsSurface.locator('input#larsIntensitySlider');
        await expect(swingSlider).toBeVisible();
        await expect(swingBase).toBeVisible();
        await expect(larsIntensity).toBeVisible();
        await expectWithinSurface(settingsSurface, swingSlider);
        await expectWithinSurface(settingsSurface, swingBase);
        await expectWithinSurface(settingsSurface, larsIntensity);
    });

    test('Soloist settings sheet keeps sound and phrasing controls visible @desktop', async ({
        page,
    }) => {
        const soloistPanel = page.locator('#panel-soloist');
        const settingsBtn = soloistPanel.getByRole('button', { name: 'Soloist settings' });

        await expect(settingsBtn).toBeVisible();
        await settingsBtn.click();

        const settingsSurface = page.locator('.workspace-studio-surface--settings.is-open');
        await expect(settingsSurface).toBeVisible();

        await expect(settingsSurface).toContainText('Soloist settings');
        await expect(settingsSurface).toContainText('Instrument');
        await expect(settingsSurface).toContainText('Mixer');
        await expect(settingsSurface).toContainText('Trading');

        const presetSelect = settingsSurface.locator('select#soloistPresetSelect');
        const phrasingSelect = settingsSurface.locator('select#soloistModeSelect');
        const tradingGroup = settingsSurface.locator('.button-group').last();
        await expect(presetSelect).toBeVisible();
        await expect(phrasingSelect).toBeVisible();
        await expect(tradingGroup).toBeVisible();
        await expect(settingsSurface.locator('input#soloistVolume')).toBeVisible();
        await expectWithinSurface(settingsSurface, presetSelect);
        await expectWithinSurface(settingsSurface, phrasingSelect);
        await expectWithinSurface(settingsSurface, tradingGroup);
    });
});
