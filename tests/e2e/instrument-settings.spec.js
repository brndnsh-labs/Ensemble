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

async function expectSurfaceFitsViewport(page, surface) {
    const viewport = page.viewportSize();
    const surfaceBox = await surface.boundingBox();

    expect(viewport).not.toBeNull();
    expect(surfaceBox).not.toBeNull();
    expect(surfaceBox.x).toBeGreaterThanOrEqual(0);
    expect(surfaceBox.y).toBeGreaterThanOrEqual(0);
    expect(surfaceBox.x + surfaceBox.width).toBeLessThanOrEqual(viewport.width);
    expect(surfaceBox.y + surfaceBox.height).toBeLessThanOrEqual(viewport.height);

    const bodyMetrics = await surface.locator('.workspace-studio-surface-body').evaluate((el) => ({
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
    }));

    expect(bodyMetrics.scrollWidth).toBeLessThanOrEqual(bodyMetrics.clientWidth + 1);
}

test.describe('Studio settings surfaces - Visual & Interaction', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1024, height: 768 });
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
        await expectSurfaceFitsViewport(page, settingsSurface);

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
        await expectSurfaceFitsViewport(page, settingsSurface);

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
        await expectWithinSurface(settingsSurface, settingsSurface.locator('input#drumVolume'));
        await expectWithinSurface(settingsSurface, settingsSurface.locator('input#drumReverb'));
    });

    test('Chords settings sheet keeps voicing and mixer controls visible @desktop', async ({
        page,
    }) => {
        const chordsPanel = page.locator('#panel-chords');
        const settingsBtn = chordsPanel.getByRole('button', { name: 'Chords settings' });

        await expect(settingsBtn).toBeVisible();
        await settingsBtn.click();

        const settingsSurface = page.locator('.workspace-studio-surface--settings.is-open');
        await expect(settingsSurface).toBeVisible();
        await expectSurfaceFitsViewport(page, settingsSurface);

        await expect(settingsSurface).toContainText('Chords settings');
        await expect(settingsSurface).toContainText('Voicing');
        await expect(settingsSurface).toContainText('Mixer');

        const densitySelect = settingsSurface.locator('select#densitySelect');
        const pianoRootsToggle = settingsSurface.locator(
            'label.toggle-switch[for="pianoRootsCheck"]',
        );
        const volume = settingsSurface.locator('input#chordVolume');
        const reverb = settingsSurface.locator('input#chordReverb');
        await expect(densitySelect).toBeVisible();
        await expect(pianoRootsToggle).toBeVisible();
        await expect(volume).toBeVisible();
        await expect(reverb).toBeVisible();
        await expectWithinSurface(settingsSurface, densitySelect);
        await expectWithinSurface(settingsSurface, pianoRootsToggle);
        await expectWithinSurface(settingsSurface, volume);
        await expectWithinSurface(settingsSurface, reverb);
    });

    test('Harmony settings sheet keeps color and mixer controls visible @desktop', async ({
        page,
    }) => {
        const harmonyPanel = page.locator('#panel-harmonies');
        const settingsBtn = harmonyPanel.getByRole('button', { name: 'Harmony settings' });

        await expect(settingsBtn).toBeVisible();
        await settingsBtn.click();

        const settingsSurface = page.locator('.workspace-studio-surface--settings.is-open');
        await expect(settingsSurface).toBeVisible();
        await expectSurfaceFitsViewport(page, settingsSurface);

        await expect(settingsSurface).toContainText('Harmony settings');
        await expect(settingsSurface).toContainText('Voicing');
        await expect(settingsSurface).toContainText('Mixer');

        const complexity = settingsSurface.locator('input#harmonyComplexity');
        const volume = settingsSurface.locator('input#harmonyVolume');
        const reverb = settingsSurface.locator('input#harmonyReverb');
        await expect(complexity).toBeVisible();
        await expect(volume).toBeVisible();
        await expect(reverb).toBeVisible();
        await expectWithinSurface(settingsSurface, complexity);
        await expectWithinSurface(settingsSurface, volume);
        await expectWithinSurface(settingsSurface, reverb);
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
        await expectSurfaceFitsViewport(page, settingsSurface);

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
        await expectWithinSurface(settingsSurface, settingsSurface.locator('input#soloistVolume'));
        await expectWithinSurface(settingsSurface, settingsSurface.locator('input#soloistReverb'));
    });
});

test.describe('Studio settings surfaces - Mobile Scrolling @mobile', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
        await page.click('[data-workspace-nav="studio"]');
        await expect(page.locator('section[data-workspace="studio"]')).toBeVisible();
    });

    test('Soloist settings sheet scrolls to trading controls on mobile', async ({ page }) => {
        const soloistPanel = page.locator('#panel-soloist');
        const settingsBtn = soloistPanel.getByRole('button', { name: 'Soloist settings' });

        await expect(settingsBtn).toBeVisible();
        await settingsBtn.click();

        const settingsSurface = page.locator('.workspace-studio-surface--settings.is-open');
        const surfaceBody = settingsSurface.locator('.workspace-studio-surface-body');
        const tradingGroup = settingsSurface.locator(
            '.workspace-studio-surface-card--soloist .button-group',
        );
        const loopsButton = tradingGroup.getByRole('button', { name: 'Loops' });

        await expect(settingsSurface).toBeVisible();
        await expect(surfaceBody).toBeVisible();
        await expect(tradingGroup).toHaveCount(1);

        const metrics = await surfaceBody.evaluate((el) => ({
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            scrollTop: el.scrollTop,
        }));

        expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight + 24);

        const bodyBox = await surfaceBody.boundingBox();
        expect(bodyBox).not.toBeNull();

        await page.mouse.move(bodyBox.x + bodyBox.width / 2, bodyBox.y + bodyBox.height / 2);
        await page.mouse.wheel(0, bodyBox.height);

        await expect
            .poll(async () => surfaceBody.evaluate((el) => el.scrollTop))
            .toBeGreaterThan(0);
        await loopsButton.scrollIntoViewIfNeeded();
        await expect(loopsButton).toBeVisible();
        await loopsButton.click();
        await expect(loopsButton).toHaveAttribute('aria-pressed', 'true');
    });
});
