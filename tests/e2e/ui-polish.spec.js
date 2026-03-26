import pkg from '@playwright/test';

const { expect, test } = pkg;

test.describe('UI polish consistency @ui', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1366, height: 900 });
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
    });

    test('shared shell controls use consistent theme radii and spacing', async ({ page }) => {
        const playButton = page.locator('#playBtn');
        const timeSignature = page.locator('#timeSigSelect');
        const workspaceNav = page.locator('.workspace-nav-btn').first();

        await expect(playButton).toBeVisible();
        await expect(timeSignature).toBeVisible();
        await expect(workspaceNav).toBeVisible();

        const arrangerStyles = await page.evaluate(() => {
            const root = getComputedStyle(document.documentElement);
            const rootFontSize = Number.parseFloat(root.fontSize);
            const read = (selector) => {
                const element = document.querySelector(selector);
                const computed = getComputedStyle(element);
                return {
                    borderRadius: Number.parseFloat(computed.borderTopLeftRadius),
                    paddingTop: Number.parseFloat(computed.paddingTop),
                    paddingRight: Number.parseFloat(computed.paddingRight),
                    fontSize: Number.parseFloat(computed.fontSize),
                };
            };

            return {
                rootFontSize,
                radiusMd: Number.parseFloat(root.getPropertyValue('--radius-md')),
                radiusLg: Number.parseFloat(root.getPropertyValue('--radius-lg')),
                space2: Number.parseFloat(root.getPropertyValue('--space-2')) * rootFontSize,
                space5: Number.parseFloat(root.getPropertyValue('--space-5')) * rootFontSize,
                fontBase: Number.parseFloat(root.getPropertyValue('--font-base')) * rootFontSize,
                playButton: read('#playBtn'),
                timeSignature: read('#timeSigSelect'),
                workspaceNav: read('.workspace-nav-btn'),
            };
        });

        expect(arrangerStyles.playButton.borderRadius).toBe(arrangerStyles.radiusMd);
        expect(arrangerStyles.playButton.paddingTop).toBe(arrangerStyles.space2);
        expect(arrangerStyles.playButton.paddingRight).toBe(arrangerStyles.space5);
        expect(arrangerStyles.playButton.fontSize).toBe(arrangerStyles.fontBase);
        expect(arrangerStyles.timeSignature.borderRadius).toBe(arrangerStyles.radiusMd);
        expect(arrangerStyles.workspaceNav.borderRadius).toBe(arrangerStyles.radiusLg);
        await page.click('[data-workspace-nav="studio"]');
        const studio = page.locator('section[data-workspace="studio"]');
        const studioGenreButton = studio.locator('.workspace-studio-genre-button');

        await expect(studio).toBeVisible();
        await expect(studioGenreButton).toBeVisible();

        const studioGenreMetrics = await page.evaluate(() => {
            const rootFontSize = Number.parseFloat(
                getComputedStyle(document.documentElement).fontSize,
            );
            const element = document.querySelector('.workspace-studio-genre-button');
            const computed = getComputedStyle(element);
            return {
                borderRadius: Number.parseFloat(computed.borderTopLeftRadius),
                paddingTop: Number.parseFloat(computed.paddingTop),
                paddingRight: Number.parseFloat(computed.paddingRight),
                expectedPaddingTop: 0.45 * rootFontSize,
                expectedPaddingRight: 0.8 * rootFontSize,
            };
        });

        expect(studioGenreMetrics.borderRadius).toBeGreaterThan(100);
        expect(
            Math.abs(studioGenreMetrics.paddingTop - studioGenreMetrics.expectedPaddingTop),
        ).toBeLessThan(0.2);
        expect(
            Math.abs(studioGenreMetrics.paddingRight - studioGenreMetrics.expectedPaddingRight),
        ).toBeLessThan(0.2);
    });

    test('interactive controls define shared focus-visible polish rules', async ({ page }) => {
        const selectors = await page.evaluate(() => {
            const flattenRuleSelectors = (rules, selectors = []) => {
                for (const rule of rules) {
                    if ('selectorText' in rule && rule.selectorText) {
                        selectors.push(rule.selectorText);
                    }

                    if ('cssRules' in rule && rule.cssRules) {
                        flattenRuleSelectors(Array.from(rule.cssRules), selectors);
                    }
                }

                return selectors;
            };

            return flattenRuleSelectors(
                Array.from(document.styleSheets).flatMap((sheet) => {
                    try {
                        return Array.from(sheet.cssRules || []);
                    } catch {
                        return [];
                    }
                }),
            );
        });

        expect(selectors).toContain('button:focus-visible');
        expect(selectors).toContain('.workspace-nav-btn:focus-visible');
        expect(selectors).toContain('.workspace-studio-genre-button:focus-visible');
        expect(selectors).toContain('.genre-btn:focus-visible');
        expect(selectors).toContain('.preset-chip:focus-visible');
        expect(selectors).toContain('.seed-input:focus-visible');
    });
});
