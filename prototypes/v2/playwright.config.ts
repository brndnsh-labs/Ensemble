import { defineConfig, devices } from '@playwright/test';

const liveTest = process.env.V2_LIVE_TEST === '1';
export default defineConfig({
    testDir: './checks',
    timeout: 45_000,
    expect: { timeout: 15_000 },
    workers: 1,
    use: {
        baseURL: liveTest ? 'https://ensembletest.brndn.zip' : 'http://127.0.0.1:3100',
        trace: 'retain-on-failure',
    },
    projects: [
        {
            name: 'laptop',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1300, height: 940 } },
        },
        {
            name: 'webkit-phone',
            use: { ...devices['iPhone 13'], viewport: { width: 402, height: 874 } },
        },
    ],
    webServer: liveTest
        ? undefined
        : {
              command: 'node scripts/serve.mjs',
              url: 'http://127.0.0.1:3100/v2/',
              reuseExistingServer: !process.env.CI,
          },
});
