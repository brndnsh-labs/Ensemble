import pkg from '@playwright/test';
import { HYDRATION_TIMEOUT } from './helpers/nav.js';

// `@playwright/test` is CommonJS, and under this repo's `"type": "module"` setup
// only the default import survives Playwright's loader: a named import
// (`import { chromium }`) throws `SyntaxError: Named export 'chromium' not found`
// at load time (aborting the whole run before any test), and a namespace import
// (`import * as pkg`) leaves `pkg.chromium` undefined at runtime. The default
// import binds the full CJS `module.exports`, which does carry `chromium` — the
// same pattern every spec and `playwright.config.ts` use (the specs are
// `@ts-nocheck`; this file isn't, so we cast to the module's namespace type).
const { chromium } = pkg as unknown as typeof import('@playwright/test');

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
