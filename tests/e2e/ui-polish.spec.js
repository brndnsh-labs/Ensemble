import pkg from '@playwright/test';

const { expect, test } = pkg;

test.describe('UI polish consistency @ui', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1366, height: 900 });
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
    });

    test('shared shell controls use consistent theme radii and spacing', async ({ page }) => {
        const arrangerStyles = await page.evaluate(() => {
            const read = (selector) => {
                const element = document.querySelector(selector);
                if (!element) {
                    return null;
                }

                const computed = getComputedStyle(element);
                return {
                    borderRadius: computed.borderTopLeftRadius,
                    paddingTop: computed.paddingTop,
                    paddingRight: computed.paddingRight,
                    fontSize: computed.fontSize,
                };
            };

            return {
                playButton: read('#playBtn'),
                timeSignature: read('#timeSigSelect'),
                workspaceNav: read('.workspace-nav-btn'),
            };
        });

        expect(arrangerStyles.playButton).toMatchObject({
            borderRadius: '8px',
            paddingTop: '8px',
            paddingRight: '24px',
            fontSize: '16px',
        });
        expect(arrangerStyles.timeSignature).toMatchObject({
            borderRadius: '8px',
            fontSize: '13.6px',
        });
        expect(arrangerStyles.workspaceNav).toMatchObject({
            borderRadius: '12px',
        });
        await page.click('[data-workspace-nav="studio"]');
        await expect(page.locator('section[data-workspace="studio"]')).toBeVisible();

        const studioGenreButton = await page.evaluate(() => {
            const element = document.querySelector('.workspace-studio-genre-button');
            if (!element) {
                return null;
            }

            const computed = getComputedStyle(element);
            return {
                borderRadius: computed.borderTopLeftRadius,
                paddingTop: computed.paddingTop,
                paddingRight: computed.paddingRight,
            };
        });

        expect(studioGenreButton).toMatchObject({
            borderRadius: '999px',
            paddingTop: '7.2px',
            paddingRight: '12.8px',
        });
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
    });
});
