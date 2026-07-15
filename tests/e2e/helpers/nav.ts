import type { Page } from '@playwright/test';

/**
 * Wait budget for the app to set `html[data-hydrated="true"]`.
 *
 * Generous on purpose: `waitForSelector` resolves the instant the attribute
 * appears, so a large ceiling costs nothing on the happy path and only guards
 * the pathological slow-cold-start case (e.g. a loaded CI box). The historical
 * cold-compile flake — the Vite dev server transforming modules on demand under
 * `fullyParallel` workers — is gone at the root now that the suite runs against
 * a prebuilt `vite preview` bundle (no on-demand compile); see
 * `playwright.config.ts` `webServer` (#1096).
 */
const HYDRATION_TIMEOUT = 30_000;

/**
 * Navigate to `path` and block until the Preact tree has hydrated.
 *
 * Centralizes the `goto` + `html[data-hydrated="true"]` wait that every e2e
 * spec needs, so the hydration strategy and timeout live in exactly one place.
 * `main.ts` sets the `data-hydrated` flag after the tree mounts.
 */
export async function gotoHydrated(page: Page, path = '/'): Promise<void> {
    await page.goto(path);
    await page.waitForSelector('html[data-hydrated="true"]', {
        state: 'attached',
        timeout: HYDRATION_TIMEOUT,
    });
}

/**
 * Open the Settings modal via the chart topbar's "More options" (kebab) menu.
 *
 * The standalone gear button next to the transport controls was retired — it
 * duplicated the kebab entry — so Settings now lives only in the overflow menu.
 * Specs route through here instead of clicking `#settingsBtn`.
 */
export async function openSettings(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForSelector('#settingsOverlay.active');
}
