import pkg from '@playwright/test';

const { defineConfig, devices } = pkg;

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    testDir: './tests/e2e',
    /* Run tests in files in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    /* Opt out of parallel tests on CI. */
    workers: process.env.CI ? 1 : undefined,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters
     * On CI the `html` reporter writes `playwright-report/` (uploaded as an
     * artifact in ci.yml) so a failed run is debuggable after the fact;
     * `open: 'never'` keeps it from trying to launch a browser in CI. */
    reporter: process.env.CI ? [['github'], ['dot'], ['html', { open: 'never' }]] : [['list']],

    /* Shared settings for all the projects below. See https://playwright.dev/docs/test-use */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: 'http://localhost:4173',

        /* Collect trace when retrying a failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',

        /* Force dark mode to prevent theme mismatches between local and CI */
        colorScheme: 'dark',

        /* Signal to CSS that we are in E2E mode for stabilization, and pre-set the
         * pack-install nudge's "seen" flag (#684) so the one-time onboarding toast
         * never fires across the suite and pollutes interaction tests. The
         * dedicated pack-nudge spec clears this flag to exercise the real trigger. */
        addInitScript: () => {
            document.documentElement.dataset.e2eMode = 'true';
            localStorage.setItem('ensemble.packNudgeSeen', '1');
        },
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'Desktop Chrome',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1440, height: 900 },
                launchOptions: {
                    args: [
                        '--font-render-hinting=none',
                        '--disable-font-subpixel-positioning',
                        '--disable-lcd-text',
                        '--disable-gpu',
                        '--use-gl=swiftshader',
                    ],
                },
            },
            // Don't run mobile-specific tests on desktop
            grepInvert: /@mobile/,
        },
        {
            name: 'Mobile Chrome',
            use: {
                ...devices['Pixel 5'],
                launchOptions: {
                    args: [
                        '--font-render-hinting=none',
                        '--disable-font-subpixel-positioning',
                        '--disable-lcd-text',
                        '--disable-gpu',
                        '--use-gl=swiftshader',
                    ],
                },
            },
            // Only run mobile-tagged tests
            grep: /@mobile/,
        },
        {
            name: 'Mobile Safari',
            use: {
                ...devices['iPad Mini'],
            },
            // Only run iPad-tagged tests
            grep: /@ipad/,
        },
    ],

    /* E2E runs against the built artifact we actually ship, not the dev server.
     * `build:e2e` produces the production bundle with VITE_E2E_BRIDGE=1 (so the
     * `window.ensemble` test bridge survives tree-shaking — see public/main.ts),
     * and `vite preview` serves the static `dist/` on 4173. The suite therefore
     * exercises minified, `import.meta.env.DEV === false` code — the real prod
     * artifact — and there is no on-demand dev-server compile, which retires the
     * cold-compile hydration-timeout flake class at the root (#1096). A static
     * build needs no globalSetup warm-up. The two @diagnostic offline-audio
     * guards that used raw-`.ts` dev-server imports moved to Vitest browser mode
     * (`tests/browser/`), which is what freed the suite to leave the dev server.
     * Local caveat: `reuseExistingServer` (below, off in CI) means a `vite preview`
     * already listening on 4173 from a prior run is reused *without* rebuilding —
     * so kill it (or the port) if a local e2e run seems to ignore your latest edit. */
    webServer: {
        command: 'npm run build:e2e && npx vite preview --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        // Generous: the command builds the production bundle before serving it.
        timeout: 180 * 1000,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
