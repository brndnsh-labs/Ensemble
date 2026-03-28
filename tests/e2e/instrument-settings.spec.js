import pkg from '@playwright/test';
import {
    expectNoHorizontalOverflow,
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

    test('Mixer surface keeps bass mixer controls visible @desktop', async ({ page }) => {
        const bassPanel = page.locator('#panel-bass');
        const mixerButton = page.getByRole('button', { name: 'Open mixer' });

        await expect(bassPanel.getByRole('button', { name: 'Bass settings' })).toHaveCount(0);
        await expect(mixerButton).toBeVisible();
        await mixerButton.click();

        const settingsSurface = page.locator('.workspace-studio-surface--mixer.is-open');
        const surfaceBody = settingsSurface.locator('.workspace-studio-surface-body');
        await expect(settingsSurface).toBeVisible();
        await expectSurfaceFitsViewport(page, settingsSurface);

        await expect(settingsSurface).toContainText('Mixer');
        await expect(settingsSurface).toContainText('Bass');
        const mixerStrips = settingsSurface.locator('.workspace-studio-mixer-strip');
        await expect(mixerStrips).toHaveCount(5);

        const volume = settingsSurface.locator('input#bassVolume');
        const reverb = settingsSurface.locator('input#bassReverb');
        const soloistVolume = settingsSurface.locator('input#soloistVolume');
        await expect(volume).toBeVisible();
        await expect(reverb).toBeVisible();
        await expect(soloistVolume).toBeVisible();
        await expectWithinSurface(settingsSurface, volume);
        await expectWithinSurface(settingsSurface, reverb);
        await expectWithinSurface(settingsSurface, soloistVolume);
        for (const strip of await mixerStrips.all()) {
            await expectNoHorizontalOverflow(strip);
        }
        const mixerMetrics = await surfaceBody.evaluate((el) => ({
            clientHeight: el.clientHeight,
            scrollHeight: el.scrollHeight,
        }));
        expect(mixerMetrics.scrollHeight).toBeLessThanOrEqual(mixerMetrics.clientHeight + 24);
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
        await expect(settingsSurface.locator('input#drumVolume')).toHaveCount(0);
        await expect(settingsSurface.locator('input#drumReverb')).toHaveCount(0);
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

        const densitySelect = settingsSurface.locator('select#densitySelect');
        const pianoRootsToggle = settingsSurface.locator(
            'label.toggle-switch[for="pianoRootsCheck"]',
        );
        await expect(densitySelect).toBeVisible();
        await expect(pianoRootsToggle).toBeVisible();
        await expectWithinSurface(settingsSurface, densitySelect);
        await expectWithinSurface(settingsSurface, pianoRootsToggle);
        await expect(settingsSurface.locator('input#chordVolume')).toHaveCount(0);
        await expect(settingsSurface.locator('input#chordReverb')).toHaveCount(0);
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

        const complexity = settingsSurface.locator('input#harmonyComplexity');
        await expect(complexity).toBeVisible();
        await expectWithinSurface(settingsSurface, complexity);
        await expect(settingsSurface.locator('input#harmonyVolume')).toHaveCount(0);
        await expect(settingsSurface.locator('input#harmonyReverb')).toHaveCount(0);
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
        await expect(settingsSurface).toContainText('Trading');

        const presetSelect = settingsSurface.locator('select#soloistPresetSelect');
        const phrasingSelect = settingsSurface.locator('select#soloistModeSelect');
        const tradingGroup = settingsSurface.locator('.button-group').last();
        await expect(presetSelect).toBeVisible();
        await expect(phrasingSelect).toBeVisible();
        await expect(tradingGroup).toBeVisible();
        await expectWithinSurface(settingsSurface, presetSelect);
        await expectWithinSurface(settingsSurface, phrasingSelect);
        await expectWithinSurface(settingsSurface, tradingGroup);
        await expect(settingsSurface.locator('input#soloistVolume')).toHaveCount(0);
        await expect(settingsSurface.locator('input#soloistReverb')).toHaveCount(0);
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

    test('Mixer surface keeps all instrument controls visible on short mobile', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 360, height: 640 });
        await page.reload();
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
        await page.click('[data-workspace-nav="studio"]');
        await expect(page.locator('section[data-workspace="studio"]')).toBeVisible();

        const mixerButton = page.getByRole('button', { name: 'Open mixer' });
        await expect(mixerButton).toBeVisible();
        await mixerButton.click();

        const settingsSurface = page.locator('.workspace-studio-surface--mixer.is-open');
        const surfaceBody = settingsSurface.locator('.workspace-studio-surface-body');
        const soloistVolume = settingsSurface.locator('input#soloistVolume');
        const soloistReverb = settingsSurface.locator('input#soloistReverb');

        await expect(settingsSurface).toBeVisible();
        await expectSurfaceFitsViewport(page, settingsSurface);
        await expect(surfaceBody).toBeVisible();

        const mixerStrips = settingsSurface.locator('.workspace-studio-mixer-strip');
        await expect(soloistVolume).toBeVisible();
        await expectWithinSurface(settingsSurface, soloistVolume);
        await expectWithinSurface(settingsSurface, soloistReverb);
        for (const strip of await mixerStrips.all()) {
            await expectNoHorizontalOverflow(strip);
        }
        const mixerMetrics = await surfaceBody.evaluate((el) => ({
            clientHeight: el.clientHeight,
            scrollHeight: el.scrollHeight,
        }));
        expect(mixerMetrics.scrollHeight).toBeLessThanOrEqual(mixerMetrics.clientHeight + 24);
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

    test('Mixer and soloist sheets use full-height mobile insets and keep controls reachable', async ({
        page,
    }) => {
        const openSurface = async (triggerName, surfaceSelector) => {
            await page.getByRole('button', { name: triggerName }).click();
            const surface = page.locator(surfaceSelector);
            const surfaceBox = await surface.boundingBox();
            const viewport = page.viewportSize();

            expect(viewport).not.toBeNull();
            expect(surfaceBox).not.toBeNull();
            expect(surfaceBox.y).toBeLessThan(40);
            expect(viewport.height - (surfaceBox.y + surfaceBox.height)).toBeLessThan(40);
            await expectSurfaceFitsViewport(page, surface);
            return surface;
        };

        const mixerSurface = await openSurface(
            'Open mixer',
            '.workspace-studio-surface--mixer.is-open',
        );
        const mixerBody = mixerSurface.locator('.workspace-studio-surface-body');
        const soloistVolume = mixerSurface.locator('input#soloistVolume');
        const soloistReverb = mixerSurface.locator('input#soloistReverb');
        const mixerStrips = mixerSurface.locator('.workspace-studio-mixer-strip');

        await expect(soloistVolume).toBeVisible();
        await expectWithinSurface(mixerSurface, soloistVolume);
        await expectWithinSurface(mixerSurface, soloistReverb);
        for (const strip of await mixerStrips.all()) {
            await expectNoHorizontalOverflow(strip);
        }
        const mixerMetrics = await mixerBody.evaluate((el) => ({
            clientHeight: el.clientHeight,
            scrollHeight: el.scrollHeight,
        }));
        expect(mixerMetrics.scrollHeight).toBeLessThanOrEqual(mixerMetrics.clientHeight + 24);
        await page.locator('button[aria-label="Close mixer"]').last().click();

        const soloistSurface = await openSurface(
            'Soloist settings',
            '.workspace-studio-surface--settings.is-open',
        );
        const soloistBody = soloistSurface.locator('.workspace-studio-surface-body');
        const loopsButton = soloistSurface
            .locator('.workspace-studio-surface-card--soloist .button-group')
            .getByRole('button', { name: 'Loops' });

        await expectScrollsToRevealTarget(page, soloistBody, loopsButton);
        await loopsButton.click();
        await expect(loopsButton).toHaveAttribute('aria-pressed', 'true');
    });
});
