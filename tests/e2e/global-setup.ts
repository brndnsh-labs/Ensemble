import { chromium } from '@playwright/test';
import { HYDRATION_TIMEOUT } from './helpers/nav.js';

/**
 * Warm the Vite dev server's module-transform cache once, before the parallel
 * workers start.
 *
 * The dev server compiles `.ts`/`.tsx` modules on demand and caches the result.
 * Without warming, the first worker to touch each cold module pays the esbuild
 * transform cost — and under `fullyParallel` load, many workers hitting cold
 * modules at once can push a single page's hydration past its wait budget and
 * flake (historically `instrument-settings.spec.ts` timing out on
 * `html[data-hydrated="true"]`). One navigation here transforms-and-caches the
 * app's module graph so every subsequent spec hits a hot server.
 *
 * Best-effort: a warm-up hiccup must not block the run — the per-test hydration
 * waits still apply, so we log and continue.
 */
async function globalSetup(): Promise<void> {
    // Matches webServer.url / the projects' baseURL in playwright.config.ts.
    const baseURL = 'http://localhost:5173';
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(baseURL, { waitUntil: 'load' });
        await page.waitForSelector('html[data-hydrated="true"]', {
            state: 'attached',
            timeout: HYDRATION_TIMEOUT,
        });
    } catch (err) {
        // biome-ignore lint/suspicious/noConsole: surfacing a warm-up miss to the test log
        console.warn('[e2e global-setup] warm-up navigation did not complete:', err);
    } finally {
        await browser.close();
    }
}

export default globalSetup;
