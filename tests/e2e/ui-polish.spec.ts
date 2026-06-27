// @ts-nocheck
import pkg from '@playwright/test';
import { gotoHydrated } from './helpers/nav.js';

const { expect, test } = pkg;

test.describe('UI polish consistency @ui', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1366, height: 900 });
        await gotoHydrated(page);
    });

    test('shared shell controls use consistent theme radii and spacing', async ({ page }) => {
        const playButton = page.locator('#playBtn');
        const timeSignature = page.locator('#timeSigBtn');

        await expect(playButton).toBeVisible();
        await expect(timeSignature).toBeVisible();

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
                space2: Number.parseFloat(root.getPropertyValue('--space-2')) * rootFontSize,
                space5: Number.parseFloat(root.getPropertyValue('--space-5')) * rootFontSize,
                fontBase: Number.parseFloat(root.getPropertyValue('--font-base')) * rootFontSize,
                playButton: read('#playBtn'),
                timeSignature: read('#timeSigBtn'),
            };
        });

        expect(arrangerStyles.playButton.borderRadius).toBe(arrangerStyles.radiusMd);
        expect(arrangerStyles.playButton.paddingTop).toBe(arrangerStyles.space2);
        expect(arrangerStyles.playButton.paddingRight).toBe(arrangerStyles.space5);
        expect(arrangerStyles.playButton.fontSize).toBe(arrangerStyles.fontBase);
        expect(arrangerStyles.timeSignature.borderRadius).toBe(arrangerStyles.radiusMd);
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
        expect(selectors).toContain('.workspace-studio-genre-button:focus-visible');
        expect(
            selectors.some((selector) =>
                selector.includes('.workspace-studio-genre-option:focus-visible'),
            ),
        ).toBe(true);
        expect(
            selectors.some((selector) =>
                selector.includes('.preset-library-chip-name:focus-visible'),
            ),
        ).toBe(true);
        expect(
            selectors.some((selector) =>
                selector.includes('.preset-library-chip-pin:focus-visible'),
            ),
        ).toBe(true);
        expect(selectors).toContain('.seed-input:focus-visible');
    });

    test('genre picker is a labeled toggle group, not an invalid list (#812)', async ({ page }) => {
        await page.getByRole('button', { name: 'Choose genre' }).click();

        // The grid is a single-select toggle group (aria-pressed buttons), so it
        // must be role="group" with a label — never role="list" (whose required
        // owned element is listitem, which the genre buttons aren't).
        const grid = page.locator('.workspace-studio-genre-grid');
        await expect(grid).toBeVisible();
        await expect(grid).toHaveAttribute('role', 'group');
        await expect(grid).toHaveAttribute('aria-label', 'Genre');
        await expect(page.locator('.workspace-studio-genre-grid[role="list"]')).toHaveCount(0);

        // The options still announce as pressed/unpressed toggle buttons.
        await expect(
            grid.locator('.workspace-studio-genre-option[aria-pressed]').first(),
        ).toBeVisible();
    });
});
