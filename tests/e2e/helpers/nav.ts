import type { Page } from '@playwright/test';

/**
 * Wait budget for the app to set `html[data-hydrated="true"]`.
 *
 * Generous on purpose: `waitForSelector` resolves the instant the attribute
 * appears, so a large ceiling costs nothing on the happy path and only guards
 * the pathological slow-cold-start case (e.g. a loaded CI box). The historical
 * flake — the Vite dev server compiling modules on demand under `fullyParallel`
 * workers — is removed separately by pre-warming the dev server's transform
 * cache once in `tests/e2e/global-setup.ts` before the workers start (see
 * `playwright.config.ts` `globalSetup` / `webServer`).
 */
export const HYDRATION_TIMEOUT = 30_000;

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
