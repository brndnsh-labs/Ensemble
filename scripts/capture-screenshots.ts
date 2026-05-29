/**
 * Regenerates the README marketing screenshots from the live chart-first app.
 *
 * This is NOT a Playwright spec — the e2e suite is functional smoke tests only
 * (no pixel snapshots), and this is a content-production tool, so it lives under
 * `scripts/` and runs on demand via `npm run screenshots`. It drives a real
 * browser the same way the e2e suite does, reusing the deep-link builder from
 * `audition-link.ts` and the hydration-wait pattern from `tests/e2e/helpers/nav`.
 *
 * Prerequisite: the dev server must already be running on :5173
 * (`npm run dev` in another shell). This matches the local e2e convention
 * (`reuseExistingServer` in playwright.config.ts) and keeps the script simple —
 * it captures against the same server the tests use.
 *
 * Usage:
 *   npm run dev            # in one shell
 *   npm run screenshots    # in another
 *
 * Output lands in docs/assets/readme/ and is referenced by README.md.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import type { Browser } from '@playwright/test';
import pkg from '@playwright/test';
import { buildAuditionLink } from './audition-link.js';
import { DEFAULT_MIX_REPORT_SCENES } from './mix-report-utils.js';

// `@playwright/test` is CommonJS; under this repo's `"type": "module"` setup only
// the default import survives Playwright's loader (a named import throws at load
// time, a namespace import leaves the members undefined at runtime). Same shim
// `tests/e2e/global-setup.ts` uses.
const { chromium, devices } = pkg as unknown as typeof import('@playwright/test');

const BASE_URL = 'http://localhost:5173/';
const HYDRATION_TIMEOUT = 30_000;
const ACTIVE_CHORD_TIMEOUT = 6_000;

// Mirror the desktop launch args from playwright.config.ts so font rendering is
// crisp and deterministic (no GPU, swiftshader GL, hinting off).
const DESKTOP_LAUNCH_ARGS = [
    '--font-render-hinting=none',
    '--disable-font-subpixel-positioning',
    '--disable-lcd-text',
    '--disable-gpu',
    '--use-gl=swiftshader',
];

const OUT_DIR = fileURLToPath(new URL('../docs/assets/readme/', import.meta.url));

type SceneArgs = Parameters<typeof buildAuditionLink>[1];

interface Shot {
    /** Output filename (written into docs/assets/readme/). */
    name: string;
    /** A scene id from DEFAULT_MIX_REPORT_SCENES that has a `sections` array. */
    sceneId: string;
    /** Desktop 1440×900 by default; pass a device profile for mobile shots. */
    device?: (typeof devices)[string];
    viewport?: { width: number; height: number };
}

// Single hero shot for now. The list is intentionally an array so future shots
// (edit mode, the 🌈 visualizer overlay, a mobile view) are a one-line addition.
const SHOTS: Shot[] = [
    {
        name: 'hero.png',
        // Jazz head — a clean, recognizable lead sheet that reads well as the
        // chart-first hero (topbar + locked chart + Live-mix rail).
        sceneId: 'jazz-ride',
        viewport: { width: 1440, height: 900 },
    },
];

async function captureShot(browser: Browser, shot: Shot): Promise<void> {
    const scene = DEFAULT_MIX_REPORT_SCENES.find((s) => s.id === shot.sceneId);
    if (!scene || !('sections' in scene)) {
        throw new Error(`Scene "${shot.sceneId}" not found or has no sections to deep-link.`);
    }

    const args: SceneArgs = {
        scene: shot.sceneId,
        seed: null,
        baseUrl: BASE_URL,
        autoplay: true,
    };
    const url = buildAuditionLink(scene as Parameters<typeof buildAuditionLink>[0], args);

    // Fresh context per shot → empty localStorage, so the URL scene fully
    // determines state (hydrateState() loads persisted state before applying
    // URL params, so a reused profile could otherwise override the scene).
    const context = await browser.newContext({
        ...(shot.device ?? {}),
        ...(shot.viewport ? { viewport: shot.viewport } : {}),
        colorScheme: 'dark',
        deviceScaleFactor: 2,
    });
    // Disable CSS transitions/animations for a clean still (does not blank the
    // chart — only `transition`/`animation` are stripped).
    await context.addInitScript(() => {
        document.documentElement.dataset.e2eMode = 'true';
    });

    const page = await context.newPage();
    try {
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForSelector('html[data-hydrated="true"]', {
            state: 'attached',
            timeout: HYDRATION_TIMEOUT,
        });

        // `autoplay=1` opens the audition overlay with a "▶ Play" button. Clicking
        // it is a trusted gesture that resumes the AudioContext, so the scheduler
        // starts advancing the active-chord highlight. If the highlight never
        // engages (e.g. a headless box where the swiftshader AudioContext stalls),
        // fall back to a static loaded chart rather than failing the run.
        const playButton = page.locator('[data-testid="audition-play"]');
        if (await playButton.count()) {
            await playButton.click();
            try {
                await page.waitForSelector('.chord-card.active', {
                    timeout: ACTIVE_CHORD_TIMEOUT,
                });
            } catch {
                console.warn(
                    `[screenshots] ${shot.name}: no active-chord highlight appeared; ` +
                        'capturing the static loaded chart instead.',
                );
            }
        }

        // Deep-linking via `prog` makes the app show a dismissible "Shared with
        // you" notice (ChartSurface treats `s`/`prog` params as a shared link).
        // That's an artifact of how we load the scene, not something to ship in
        // the hero — dismiss it the way a user would.
        const dismissShared = page.locator('[aria-label="Dismiss shared notice"]');
        if (await dismissShared.count()) {
            await dismissShared.click();
        }

        // Web fonts must be settled — chord cards auto-size by glyph count, so a
        // pre-font capture shows shifted sizing.
        await page.evaluate(() => document.fonts.ready);

        const outPath = path.join(OUT_DIR, shot.name);
        await page.screenshot({ path: outPath });
        console.log(`[screenshots] wrote ${path.relative(process.cwd(), outPath)}`);
    } finally {
        await context.close();
    }
}

async function main(): Promise<void> {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ args: DESKTOP_LAUNCH_ARGS });
    try {
        for (const shot of SHOTS) {
            await captureShot(browser, shot);
        }
    } finally {
        await browser.close();
    }
}

main().catch((err) => {
    console.error('[screenshots] failed:', err);
    process.exitCode = 1;
});
