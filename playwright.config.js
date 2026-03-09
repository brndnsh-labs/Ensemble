import { defineConfig, devices } from '@playwright/test';

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
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: process.env.CI ? [['github'], ['dot']] : [['list']],

    /* Robust global thresholds for cross-environment consistency */
    expect: {
        toHaveScreenshot: {
            maxDiffPixelRatio: 0.05, // 5% allowance for font/rendering shifts across OS
            threshold: 0.2,
        },
    },

    /* Shared settings for all the projects below. See https://playwright.dev/docs/test-use */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: 'http://localhost:5173',

        /* Collect trace when retrying a failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',

        /* Force dark mode to prevent theme mismatches between local and CI */
        colorScheme: 'dark',

        /* Standardize rendering across different environments (CI vs local) */
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

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'Desktop Chrome',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1440, height: 900 },
            },
            // Don't run mobile-specific tests on desktop
            grepInvert: /@mobile/,
        },
        {
            name: 'Mobile Chrome',
            use: {
                ...devices['Pixel 5'],
            },
            // Only run mobile-tagged tests
            grep: /@mobile/,
        },
    ],

    /* Run your local dev server before starting the tests */
    webServer: {
        command: 'npm run preview',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
