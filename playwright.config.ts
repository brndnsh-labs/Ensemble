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
        baseURL: 'http://localhost:5173',

        /* Collect trace when retrying a failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',

        /* Force dark mode to prevent theme mismatches between local and CI */
        colorScheme: 'dark',

        /* Signal to CSS that we are in E2E mode for stabilization */
        addInitScript: () => {
            document.documentElement.dataset.e2eMode = 'true';
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

    /* Warm the dev server's module graph ONCE before the parallel workers start.
     * The dev server compiles modules on demand; under fullyParallel workers the
     * first cold transforms can exceed a test's hydration wait and flake (a stale
     * lingering server on the port is another local flake vector). `globalSetup`
     * navigates to `/` and waits for hydration, so Vite's transform cache is hot
     * before any spec runs and the cold-compile cost is paid once, off the clock.
     * (Dev server is kept, not `vite preview`, because diagnostics like
     * reverb-stability.spec.ts import raw `.ts` source at runtime — only the dev
     * server serves that.) */
    globalSetup: './tests/e2e/global-setup.ts',
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
