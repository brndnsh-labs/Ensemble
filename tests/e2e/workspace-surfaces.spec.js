import pkg from '@playwright/test';
import {
    expectNoVerticalOverflow,
    expectOwnsInteriorProbe,
    expectScrollsToRevealTarget,
    expectSurfaceFitsViewport,
} from './helpers/visibility.js';

const { expect, test } = pkg;

async function openWorkspace(page, name) {
    await page.locator(`button[data-workspace-nav="${name.toLowerCase()}"]`).click();
    await expect(page.locator(`section[data-workspace="${name.toLowerCase()}"]`)).toBeVisible();
}

test.describe('Workspace surfaces @ui', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', {
            state: 'attached',
            timeout: 15000,
        });
    });

    test('studio keeps a single live mix surface without menu clipping', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await openWorkspace(page, 'Studio');

        const studio = page.locator('[data-workspace="studio"]');
        await expect(studio.locator('.workspace-panel-copy')).toHaveCount(0);
        await expect(studio.locator('#panel-grooves')).toBeVisible();
        await expect(studio.locator('#panel-chords')).toBeVisible();
        await expect(studio.locator('#panel-bass')).toBeVisible();
        await expect(studio.locator('#panel-soloist')).toBeVisible();
        await expect(studio.locator('#panel-harmonies')).toBeVisible();
        await expect(studio.locator('.workspace-studio-live-mix')).toBeVisible();
        await expect(studio.locator('.workspace-studio-mix-row')).toHaveCount(5);
        await expect(studio.getByRole('button', { name: 'Open mixer' })).toBeVisible();
        await expect(studio.locator('.workspace-studio-genre-button')).toBeVisible();
        await expect(studio.locator('.workspace-studio-genre-option')).toHaveCount(0);
        await expect(studio.locator('.workspace-instrument-state')).toHaveCount(5);
        await expect(studio.locator('.workspace-columns')).toHaveCount(0);
        await expect(studio.locator('.workspace-group-header')).toHaveCount(0);
        const desktopRowBoxes = await Promise.all(
            [
                '#panel-grooves',
                '#panel-bass',
                '#panel-chords',
                '#panel-harmonies',
                '#panel-soloist',
            ].map((selector) => studio.locator(selector).boundingBox()),
        );
        const desktopRowXPositions = Array.from(
            new Set(desktopRowBoxes.filter((box) => box !== null).map((box) => Math.round(box.x))),
        );
        for (const box of desktopRowBoxes) {
            expect(box).not.toBeNull();
            expect(box.width).toBeGreaterThan(300);
            expect(box.width).toBeLessThan(360);
        }
        expect(desktopRowXPositions.length).toBe(2);

        const genreButton = studio.locator('.workspace-studio-genre-button');
        const initialGenreValue = (
            await studio.locator('.workspace-studio-genre-button-value').textContent()
        )?.trim();
        const initialGenre = initialGenreValue?.split('·')[0].trim();
        await genreButton.click();
        const desktopGenreSurface = page.locator('.workspace-studio-surface--genre.is-open');
        await expect(desktopGenreSurface).toBeVisible();
        await expect(desktopGenreSurface.locator('.workspace-studio-genre-option')).toHaveCount(13);
        const autoIntensityToggle = desktopGenreSurface.locator('#bandFeelAutoIntensityToggle');
        const autoIntensitySwitch = desktopGenreSurface.locator('label.toggle-switch').first();
        const bandIntensitySlider = desktopGenreSurface.locator('#bandFeelIntensitySlider');
        await expect(autoIntensityToggle).toBeChecked();
        await expect(bandIntensitySlider).toBeDisabled();
        const desktopGenreBox = await desktopGenreSurface.boundingBox();
        expect(desktopGenreBox).not.toBeNull();
        expect(desktopGenreBox.x).toBeGreaterThanOrEqual(0);
        expect(desktopGenreBox.x + desktopGenreBox.width).toBeLessThanOrEqual(1440);
        await desktopGenreSurface.getByRole('button', { name: 'Jazz' }).click();
        await expect(studio.locator('.workspace-studio-genre-button-value')).toContainText('Jazz');
        await genreButton.click();
        await autoIntensitySwitch.click();
        await expect(autoIntensityToggle).not.toBeChecked();
        await expect(bandIntensitySlider).toBeEnabled();
        await bandIntensitySlider.evaluate((element) => {
            element.value = '60';
            element.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await expect(studio.locator('.workspace-studio-genre-button-value')).toContainText('60%');
        await expect
            .poll(() =>
                page.evaluate(() => {
                    const { playback } = window.ensemble.getState();
                    return {
                        bandIntensity: playback.bandIntensity,
                        autoIntensity: playback.autoIntensity,
                    };
                }),
            )
            .toEqual({
                bandIntensity: 0.6,
                autoIntensity: false,
            });
        await autoIntensitySwitch.click();
        await expect(autoIntensityToggle).toBeChecked();
        await expect(bandIntensitySlider).toBeDisabled();
        await expect(studio.locator('.workspace-studio-genre-button-value')).toContainText('Auto');
        await desktopGenreSurface.getByRole('button', { name: initialGenre || 'Rock' }).click();

        const bassRow = studio.locator('#panel-bass');
        await expect(bassRow.getByRole('button', { name: 'Bass settings' })).toHaveCount(0);

        const mixerButton = studio.getByRole('button', { name: 'Open mixer' });
        await mixerButton.click();
        const desktopSettingsSurface = page.locator('.workspace-studio-surface--mixer.is-open');
        await expect(desktopSettingsSurface).toBeVisible();
        const [desktopSettingsBox, mixerButtonBox] = await Promise.all([
            desktopSettingsSurface.boundingBox(),
            mixerButton.boundingBox(),
        ]);
        expect(desktopSettingsBox).not.toBeNull();
        expect(mixerButtonBox).not.toBeNull();
        expect(desktopSettingsBox.x).toBeGreaterThanOrEqual(0);
        expect(desktopSettingsBox.x + desktopSettingsBox.width).toBeLessThanOrEqual(1440);
        expect(Math.abs(desktopSettingsBox.y - mixerButtonBox.y)).toBeLessThan(160);
        await expect(desktopSettingsSurface).toContainText('Mixer');
        await expect(desktopSettingsSurface.locator('input#bassVolume')).toBeVisible();
        await expect(desktopSettingsSurface.locator('.workspace-studio-mixer-strip')).toHaveCount(
            5,
        );
        await desktopSettingsSurface.getByRole('button', { name: 'Close mixer' }).click();

        await page.setViewportSize({ width: 768, height: 1024 });
        await page.reload();
        await page.waitForSelector('html[data-hydrated="true"]', {
            state: 'attached',
            timeout: 15000,
        });
        await openWorkspace(page, 'Studio');

        const tabletGroove = await page.locator('#panel-grooves').boundingBox();
        const tabletSoloist = await page.locator('#panel-soloist').boundingBox();

        expect(tabletGroove).not.toBeNull();
        expect(tabletSoloist).not.toBeNull();
        expect(Math.abs(tabletGroove.x - tabletSoloist.x)).toBeLessThan(20);

        await page.setViewportSize({ width: 640, height: 960 });
        await page.reload();
        await page.waitForSelector('html[data-hydrated="true"]', {
            state: 'attached',
            timeout: 15000,
        });
        await openWorkspace(page, 'Studio');

        const header = page.locator('header');
        const mobileMixerButton = page.getByRole('button', { name: 'Open mixer' });
        const mobileGenreButton = page.locator('.workspace-studio-genre-button');
        await expect(mobileMixerButton).toBeVisible();
        await expect(mobileGenreButton).toBeVisible();
        const headerBox = await header.boundingBox();
        const mobileMixerButtonBox = await mobileMixerButton.boundingBox();
        const mobileGenreButtonBox = await mobileGenreButton.boundingBox();

        expect(headerBox).not.toBeNull();
        expect(mobileMixerButtonBox).not.toBeNull();
        expect(mobileGenreButtonBox).not.toBeNull();
        expect(mobileMixerButtonBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);
        expect(mobileGenreButtonBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);

        await mobileGenreButton.click();
        const mobileGenreSurface = page.locator('.workspace-studio-surface--genre.is-open');
        await expect(mobileGenreSurface).toBeVisible();
        const mobileGenreBox = await mobileGenreSurface.boundingBox();
        expect(mobileGenreBox).not.toBeNull();
        expect(mobileGenreBox.x).toBeGreaterThanOrEqual(0);
        expect(mobileGenreBox.x + mobileGenreBox.width).toBeLessThanOrEqual(640);
        expect(mobileGenreBox.y).toBeGreaterThanOrEqual(0);
        expect(mobileGenreBox.y + mobileGenreBox.height).toBeLessThanOrEqual(960);
        await mobileGenreSurface.getByRole('button', { name: 'Close band feel menu' }).click();

        const mobileGroove = await page.locator('#panel-grooves').boundingBox();
        const mobileSoloist = await page.locator('#panel-soloist').boundingBox();
        expect(mobileGroove).not.toBeNull();
        expect(mobileSoloist).not.toBeNull();
        expect(Math.abs(mobileGroove.x - mobileSoloist.x)).toBeLessThan(40);

        await page.locator('#panel-soloist .workspace-studio-mix-menu-trigger').click();
        const mobileSettingsSurface = page.locator('.workspace-studio-surface--settings.is-open');
        await expect(mobileSettingsSurface).toBeVisible();
        const mobileSettingsBox = await mobileSettingsSurface.boundingBox();
        expect(mobileSettingsBox).not.toBeNull();
        expect(mobileSettingsBox.x).toBeGreaterThanOrEqual(0);
        expect(mobileSettingsBox.x + mobileSettingsBox.width).toBeLessThanOrEqual(640);
        expect(mobileSettingsBox.y).toBeGreaterThanOrEqual(0);
        expect(mobileSettingsBox.y + mobileSettingsBox.height).toBeLessThanOrEqual(960);
    });

    test('studio band feel and drum controls stay reachable across audit viewports', async ({
        page,
    }) => {
        const viewports = [
            { name: 'desktop', width: 1440, height: 900, expectScroll: false },
            { name: 'tablet', width: 768, height: 1024, expectScroll: false },
            { name: 'tablet-landscape', width: 1024, height: 768, expectScroll: false },
            { name: 'mobile-short', width: 360, height: 640, expectScroll: true },
        ];

        for (const viewport of viewports) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.goto('/');
            await page.waitForSelector('html[data-hydrated="true"]', {
                state: 'attached',
                timeout: 15000,
            });
            await openWorkspace(page, 'Studio');

            await page.locator('.workspace-studio-genre-button').click();
            const bandFeelSurface = page.locator('.workspace-studio-surface--genre.is-open');
            const bandFeelBody = bandFeelSurface.locator('.workspace-studio-surface-body');
            const intensitySlider = bandFeelSurface.locator('#bandFeelIntensitySlider');

            await expect(bandFeelSurface, `${viewport.name}: band feel should open`).toBeVisible();
            await expectSurfaceFitsViewport(page, bandFeelSurface);
            await expectOwnsInteriorProbe(bandFeelSurface);

            if (viewport.expectScroll) {
                await expectScrollsToRevealTarget(page, bandFeelBody, intensitySlider);
            } else {
                await expect(intensitySlider).toBeVisible();
            }

            await page.locator('button[aria-label="Close band feel menu"]').last().click();

            await page.getByRole('button', { name: 'Open mixer' }).click();
            const mixerSurface = page.locator('.workspace-studio-surface--mixer.is-open');
            const mixerBody = mixerSurface.locator('.workspace-studio-surface-body');
            const soloistVolume = mixerSurface.locator('input#soloistVolume');

            await expect(mixerSurface, `${viewport.name}: mixer should open`).toBeVisible();
            await expectSurfaceFitsViewport(page, mixerSurface);
            await expectOwnsInteriorProbe(mixerSurface);
            await expect(mixerBody).toBeVisible();
            await expect(soloistVolume).toBeVisible();
            await expectNoVerticalOverflow(mixerBody);

            await page.locator('button[aria-label="Close mixer"]').last().click();

            await page.getByRole('button', { name: 'Drums settings' }).click();
            const drumSurface = page.locator('.workspace-studio-surface--settings.is-open');
            const larsIntensity = drumSurface.locator('input#larsIntensitySlider');

            await expect(drumSurface, `${viewport.name}: drum settings should open`).toBeVisible();
            await expectSurfaceFitsViewport(page, drumSurface);
            await expectOwnsInteriorProbe(drumSurface);
            await expect(larsIntensity).toBeVisible();

            await page.locator('button[aria-label="Close Drums settings"]').last().click();
        }
    });

    test('studio surfaces mount in a body-level overlay layer on mobile @mobile @ipad', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 393, height: 852 });
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', {
            state: 'attached',
            timeout: 15000,
        });
        await openWorkspace(page, 'Studio');

        const bodyOverlayLayer = page.locator('body > .workspace-studio-surface-layer');

        await page.getByRole('button', { name: 'Open mixer' }).click();
        const mixerSurface = bodyOverlayLayer.locator('.workspace-studio-surface--mixer.is-open');
        await expect(bodyOverlayLayer).toHaveCount(1);
        await expect(mixerSurface).toBeVisible();
        await expectSurfaceFitsViewport(page, mixerSurface);
        await expectOwnsInteriorProbe(mixerSurface);
        await page.locator('button[aria-label="Close mixer"]').last().click();

        await page.getByRole('button', { name: 'Drums settings' }).click();
        const drumSurface = bodyOverlayLayer.locator('.workspace-studio-surface--settings.is-open');
        await expect(bodyOverlayLayer).toHaveCount(1);
        await expect(drumSurface).toBeVisible();
        await expectSurfaceFitsViewport(page, drumSurface);
        await expectOwnsInteriorProbe(drumSurface);
    });

    test('perform launches and dismisses the live modals', async ({ page }) => {
        await openWorkspace(page, 'Perform');

        const perform = page.locator('[data-workspace="perform"]');
        await expect(perform.locator('.workspace-panel-copy')).toHaveCount(0);
        await expect(perform.getByRole('button', { name: 'Open Performance Mode' })).toBeVisible();
        await expect(perform.getByRole('button', { name: 'Open Drum Pad' })).toBeVisible();

        await perform.getByRole('button', { name: 'Open Performance Mode' }).click();
        const performanceModal = page.locator('.PerformanceSurfaceModal');
        await expect(performanceModal).toBeVisible();
        await expect(performanceModal.locator('h2')).toContainText('Soloist Performance Mode');

        await performanceModal.locator('button[aria-label="Close"]').first().click();
        await expect(performanceModal).toBeHidden();

        await perform.getByRole('button', { name: 'Open Drum Pad' }).click();
        const drumPadModal = page.locator('.PerformanceSurfaceModal').filter({
            hasText: 'Drum Performance Mode',
        });
        await expect(drumPadModal).toBeVisible();
        await expect(drumPadModal.locator('h2')).toContainText('Drum Performance Mode');

        await drumPadModal.locator('button[aria-label="Close"]').first().click();
        await expect(drumPadModal).toBeHidden();
    });

    test('switching to visuals after extended playback stays responsive', async ({ page }) => {
        await openWorkspace(page, 'Arranger');
        await page.locator('#bpmInput').fill('240');
        await expect(page.locator('#bpmInput')).toHaveValue('240');
        await page.locator('#playBtn').click();
        await expect(page.locator('#playBtnText')).toContainText('STOP');

        // 15s at 240 BPM stresses the same queue-growth path as ~36s at the default tempo.
        await page.waitForTimeout(15000);

        const switchStart = Date.now();
        await page.locator('[data-workspace-nav="visuals"]').click();
        await expect(page.locator('#panel-visualizer canvas').first()).toBeVisible({
            timeout: 5000,
        });

        expect(Date.now() - switchStart).toBeLessThan(3000);
        await expect(page.locator('#playBtnText')).toContainText('STOP');
    });

    test('visuals keeps the visualizer visible and roomy', async ({ page }) => {
        await page.setViewportSize({ width: 1366, height: 900 });
        await openWorkspace(page, 'Visuals');

        const visuals = page.locator('section[data-workspace="visuals"]');
        await expect(visuals.locator('.workspace-panel-copy')).toHaveCount(0);
        await expect(visuals.locator('.workspace-kicker')).toHaveCount(0);
        await expect(visuals.locator('.workspace-status-grid')).toHaveCount(0);
        await expect(page.locator('.app-subtitle')).toHaveCount(0);

        const panel = visuals.locator('#panel-visualizer');
        await expect(panel.locator('#vizPowerBtn')).toHaveCount(0);
        await expect(panel).not.toHaveClass(/collapsed/);

        const canvas = panel.locator('canvas').first();
        await expect(canvas).toBeVisible();

        const legend = panel.locator('[data-testid="visualizer-legend"]');
        await expect(legend).toBeVisible();
        await expect(legend).toContainText('Drums');
        await expect(legend).toContainText('Bass');
        await expect(legend).toContainText('Chords');
        await expect(legend).toContainText('Harmony');
        await expect(legend).toContainText('Soloist');
        await expect(legend).toContainText('Chord tones');

        const visualsBox = await visuals.boundingBox();
        const panelBox = await panel.boundingBox();
        const canvasBox = await canvas.boundingBox();

        expect(visualsBox).not.toBeNull();
        expect(panelBox).not.toBeNull();
        expect(canvasBox).not.toBeNull();
        expect(panelBox.y - visualsBox.y).toBeLessThanOrEqual(4);
        expect(panelBox.height).toBeGreaterThan(220);
        expect(canvasBox.height).toBeGreaterThanOrEqual(148);
    });

    test('visuals stays compact on mobile without vertical clipping @mobile', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 640 });
        await openWorkspace(page, 'Visuals');

        const visuals = page.locator('section[data-workspace="visuals"]');
        const panel = visuals.locator('#panel-visualizer');
        const legend = panel.locator('[data-testid="visualizer-legend"]');
        const canvas = panel.locator('canvas').first();

        await expect(panel).toBeVisible();
        await expect(legend).toBeVisible();
        await expect(canvas).toBeVisible();

        const viewport = page.viewportSize();
        const panelBox = await panel.boundingBox();
        const canvasBox = await canvas.boundingBox();

        expect(viewport).not.toBeNull();
        expect(panelBox).not.toBeNull();
        expect(canvasBox).not.toBeNull();
        expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(viewport.height);
        expect(canvasBox.height).toBeGreaterThanOrEqual(160);
        await expectNoVerticalOverflow(visuals, 16);
    });
});
