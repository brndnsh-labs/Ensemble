import pkg from '@playwright/test';
import {
    expectScrollsToRevealTarget,
    expectSurfaceFitsViewport,
    expectWithinSurface,
} from './helpers/visibility.js';

const { expect, test } = pkg;

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
        const creativityToggle = settingsSurface.locator(
            'label.toggle-switch[for="creativityCheck"]',
        );
        const larsIntensity = settingsSurface.locator('input#larsIntensitySlider');
        await expect(swingSlider).toBeVisible();
        await expect(swingBase).toBeVisible();
        await expect(creativityToggle).toBeVisible();
        await expect(larsIntensity).toBeVisible();
        await expectWithinSurface(settingsSurface, swingSlider);
        await expectWithinSurface(settingsSurface, swingBase);
        await expectWithinSurface(settingsSurface, creativityToggle);
        await expectWithinSurface(settingsSurface, larsIntensity);

        const surfaceBody = settingsSurface.locator('.workspace-studio-surface-body');
        await surfaceBody.evaluate((el) => {
            el.scrollTop = el.scrollHeight;
        });

        const drumVolume = settingsSurface.locator('input#drumVolume');
        const drumReverb = settingsSurface.locator('input#drumReverb');
        await expect(drumVolume).toBeVisible();
        await expect(drumReverb).toBeVisible();
        await expectWithinSurface(settingsSurface, drumVolume);
        await expectWithinSurface(settingsSurface, drumReverb);
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
        await expectScrollsToRevealTarget(page, surfaceBody, loopsButton);
        await loopsButton.click();
        await expect(loopsButton).toHaveAttribute('aria-pressed', 'true');
    });

    test('Drum settings sheet scrolls to mixer controls on short mobile', async ({ page }) => {
        await page.setViewportSize({ width: 360, height: 640 });
        await page.reload();
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
        await page.click('[data-workspace-nav="studio"]');
        await expect(page.locator('section[data-workspace="studio"]')).toBeVisible();

        const groovePanel = page.locator('#panel-grooves');
        const settingsBtn = groovePanel.getByRole('button', { name: 'Drums settings' });

        await expect(settingsBtn).toBeVisible();
        await settingsBtn.click();

        const settingsSurface = page.locator('.workspace-studio-surface--settings.is-open');
        const surfaceBody = settingsSurface.locator('.workspace-studio-surface-body');
        const drumVolume = settingsSurface.locator('input#drumVolume');
        const drumReverb = settingsSurface.locator('input#drumReverb');

        await expect(settingsSurface).toBeVisible();
        await expectSurfaceFitsViewport(page, settingsSurface);
        await expect(surfaceBody).toBeVisible();

        await expectScrollsToRevealTarget(page, surfaceBody, drumVolume);
        await expectWithinSurface(settingsSurface, drumVolume);
        await expectWithinSurface(settingsSurface, drumReverb);
    });
});

test.describe('Studio settings surfaces - iPhone reachability @mobile', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 393, height: 852 });
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
        await page.click('[data-workspace-nav="studio"]');
        await expect(page.locator('section[data-workspace="studio"]')).toBeVisible();
    });

    test('Drum and soloist sheets use full-height mobile insets and keep lower controls reachable', async ({
        page,
    }) => {
        const openSurface = async (buttonName) => {
            await page.getByRole('button', { name: buttonName }).click();
            const surface = page.locator('.workspace-studio-surface--settings.is-open');
            const surfaceBox = await surface.boundingBox();
            const viewport = page.viewportSize();

            expect(viewport).not.toBeNull();
            expect(surfaceBox).not.toBeNull();
            expect(surfaceBox.y).toBeLessThan(40);
            expect(viewport.height - (surfaceBox.y + surfaceBox.height)).toBeLessThan(40);
            await expectSurfaceFitsViewport(page, surface);
            return surface;
        };

        const drumsSurface = await openSurface('Drums settings');
        const drumsBody = drumsSurface.locator('.workspace-studio-surface-body');
        const drumVolume = drumsSurface.locator('input#drumVolume');
        const drumReverb = drumsSurface.locator('input#drumReverb');

        await expectScrollsToRevealTarget(page, drumsBody, drumVolume);
        await expectWithinSurface(drumsSurface, drumVolume);
        await expectWithinSurface(drumsSurface, drumReverb);
        await page.locator('button[aria-label="Close Drums settings"]').last().click();

        const soloistSurface = await openSurface('Soloist settings');
        const soloistBody = soloistSurface.locator('.workspace-studio-surface-body');
        const loopsButton = soloistSurface
            .locator('.workspace-studio-surface-card--soloist .button-group')
            .getByRole('button', { name: 'Loops' });

        await expectScrollsToRevealTarget(page, soloistBody, loopsButton);
        await loopsButton.click();
        await expect(loopsButton).toHaveAttribute('aria-pressed', 'true');
    });
});
