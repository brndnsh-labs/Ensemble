import { appUrl, expect, test } from './fixtures';

/**
 * #1261 asked for a Chromium E2E spec that registers a passkey via the harness's CDP virtual
 * authenticator, then drives the REAL `createSaveTransport` against the REAL API for one
 * explicit Save from inside the page. That is not reachable from this suite: `web`
 * is a Next static export (`output: 'export'`), so a spec's `page.evaluate` has no way to
 * `import` a `lib/account/*` module — there is no dev server, no bundler entry point, nothing
 * but the shipped, tree-shaken HTML/JS this build produced. Exposing `createSaveTransport` (or
 * any other internal) on `window` purely for this test would be new production-shipped test
 * surface for a story whose acceptance explicitly says not to add one, and hand-building a POST
 * body in a page script that merely LOOKS like `songbook.prepare()`'s output would prove the
 * fake, not this repo's frozen-request code path — also explicitly ruled out.
 *
 * So this spec proves the one property #1261’s acceptance falls back to instead (the worker never caches /api), with unit tests
 * covering the transport/session/error-mapping logic itself (`tests/unit/songbook/account-*`).
 * It needs no passkey and no real account API, so it uses the plain guest `test` fixture, not
 * `accountTest` — nothing here is wired into the app, so there is no signed-in state to reach.
 */

test('a service worker never caches an /api/ response', async ({ page }, testInfo) => {
    test.skip(
        testInfo.project.name !== 'laptop',
        'sw.js is one generated file whose /api early-return is JavaScript, not browser behaviour; account-entry’s ‘a default profile still plays as a guest when the server is unreachable’ still runs on WebKit and sees its session request leave the page',
    );
    await page.goto(appUrl());
    // The generated `sw.js` (`scripts/offline.mjs`) returns early for `/api` and everything
    // under it — an explicit exclusion, because at the cutover's root scope the prefix test
    // that covers it today matches the whole origin (#1354) — so an `/api/*` request never
    // reaches its `event.respondWith` at all. Waiting for the worker to actually control this
    // page is what makes the proof meaningful: an uncontrolled page would pass this assertion
    // for a reason that says nothing about the worker's own fetch handler.
    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL || ''))
        .toContain(appUrl('sw.js'));

    await page.evaluate(() => fetch('/api/auth/session', { cache: 'no-store' }));
    // Give any (hypothetical) `event.respondWith` a moment to have run and written a cache
    // entry before checking every cache this origin owns for one.
    await page.waitForTimeout(100);
    const cachedApiKeys = await page.evaluate(async () => {
        const names = await caches.keys();
        const hits: string[] = [];
        for (const name of names) {
            const cache = await caches.open(name);
            for (const request of await cache.keys()) {
                if (new URL(request.url).pathname.startsWith('/api/')) {
                    hits.push(`${name}:${request.url}`);
                }
            }
        }
        return hits;
    });
    expect(cachedApiKeys).toEqual([]);
});
