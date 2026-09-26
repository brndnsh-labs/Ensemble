import { appUrl, expect, test } from './fixtures';

/**
 * The v2 Umami gate (#1389), end to end against a real page load.
 *
 * `lib/telemetry.ts` only installs the tracker in a production BUILD (`NEXT_PUBLIC_TELEMETRY=1`,
 * baked into the one `ensemble-web` image CI releases) on the canonical HOST
 * (`ensemble.brndn.zip`). Neither is true of this suite's own build (`ENSEMBLE_V2_BASE=/`, no
 * telemetry flag, served from `127.0.0.1`) — which is deliberate: it's what keeps the normal v2
 * export silent (the second test below). To still exercise the real script-injection and
 * tracking-call path in CI, the first test sets `window.__ENSEMBLE_TELEMETRY_TEST_OVERRIDE__`
 * via `page.addInitScript` — which runs before ANY page script, including `lib/telemetry.ts`'s
 * own gate check. That is the whole safety argument for this hook: a real visitor has no way to
 * set an arbitrary `window` property before a page's own scripts run — not from a URL, a hash, or
 * a query string, unlike a `?debug=1`-style switch, which is exactly the kind of thing this
 * story's Acceptance forbids. Only Playwright (or a devtools console, or a browser extension —
 * none of which a link can drive) can reach it.
 */
test.describe('telemetry (#1389)', () => {
    test('on the prod path (build flag + host both satisfied via the test override), sends a pathname-only pageview and the allow-listed events', async ({
        page,
    }) => {
        await page.route('https://umami.brndn.zip/telemetry.js', (route) =>
            route.fulfill({
                contentType: 'application/javascript',
                // A minimal stand-in for the real umami client: same `track(buildPayload)`
                // shape `lib/telemetry.ts` calls, recording every payload it's handed.
                body: `
                    window.__telemetryCalls = [];
                    window.umami = {
                        track: (build) => {
                            window.__telemetryCalls.push(
                                build({ url: location.pathname, referrer: document.referrer }),
                            );
                            return Promise.resolve();
                        },
                    };
                `,
            }),
        );
        await page.addInitScript(() => {
            (
                window as Window & { __ENSEMBLE_TELEMETRY_TEST_OVERRIDE__?: boolean }
            ).__ENSEMBLE_TELEMETRY_TEST_OVERRIDE__ = true;
        });

        await page.goto(appUrl());
        await expect(page.locator('#umami-telemetry')).toHaveCount(1);

        // A real interaction on the songbook home: opening a starter chart.
        await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
        await expect(
            page.getByRole('button', { name: 'Start playback', exact: true }),
        ).toBeVisible();

        // Changing feel and starting playback are each a real, distinct event too.
        await page.getByLabel('Feel', { exact: true }).selectOption('Jazz');
        await page.getByRole('button', { name: 'Start playback', exact: true }).click();
        await expect(
            page.getByRole('button', { name: 'Stop playback', exact: true }),
        ).toBeEnabled();

        await expect
            .poll(() =>
                page.evaluate(
                    () =>
                        (window as Window & { __telemetryCalls?: unknown[] }).__telemetryCalls
                            ?.length ?? 0,
                ),
            )
            .toBeGreaterThanOrEqual(4);

        const calls = (await page.evaluate(
            () => (window as Window & { __telemetryCalls?: unknown[] }).__telemetryCalls,
        )) as Array<Record<string, unknown>>;

        const names = calls.map((c) => c.name);
        expect(names).toContain(undefined); // the manual pageview carries no `name`
        expect(names).toContain('session_class');
        expect(names).toContain('chart_opened');
        expect(names).toContain('genre_changed');
        expect(names).toContain('play_started');

        // Never the hash (a shared chart lives there), never a query string, never a real
        // referrer — every single payload, not just the pageview's.
        for (const payload of calls) {
            expect(payload.url).not.toContain('#');
            expect(payload.url).not.toContain('?');
            expect(payload.referrer).toBe('');
        }
        const chartOpened = calls.find((c) => c.name === 'chart_opened') as
            | { data?: { source?: string } }
            | undefined;
        expect(chartOpened?.data?.source).toBe('songbook');
        const genreChanged = calls.find((c) => c.name === 'genre_changed') as
            | { data?: { genre?: string } }
            | undefined;
        expect(genreChanged?.data?.genre).toBe('Jazz');
    });

    test('installs no tracker at all in this suite’s own build (no NEXT_PUBLIC_TELEMETRY, non-canonical host, no override)', async ({
        page,
    }) => {
        let requested = false;
        await page.route('https://umami.brndn.zip/telemetry.js', (route) => {
            requested = true;
            return route.abort();
        });

        await page.goto(appUrl());
        await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
        await expect(
            page.getByRole('button', { name: 'Start playback', exact: true }),
        ).toBeVisible();

        await expect(page.locator('#umami-telemetry')).toHaveCount(0);
        expect(requested).toBe(false);
    });
});
