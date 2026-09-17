import { expect, test } from './fixtures';

/**
 * #1261 asked for a Chromium E2E spec that registers a passkey via the harness's CDP virtual
 * authenticator, then drives the REAL `createSaveTransport` against the REAL API for one
 * explicit Save from inside the page. That is not reachable from this suite: `prototypes/v2`
 * is a Next static export (`output: 'export'`), so a spec's `page.evaluate` has no way to
 * `import` a `lib/account/*` module — there is no dev server, no bundler entry point, nothing
 * but the shipped, tree-shaken HTML/JS this build produced. Exposing `createSaveTransport` (or
 * any other internal) on `window` purely for this test would be new production-shipped test
 * surface for a story whose acceptance explicitly says not to add one, and hand-building a POST
 * body in a page script that merely LOOKS like `songbook.prepare()`'s output would prove the
 * fake, not this repo's frozen-request code path — also explicitly ruled out.
 *
 * So this spec proves the two properties #1261's acceptance falls back to instead, unit tests
 * covering the transport/session/error-mapping logic itself (`tests/unit/songbook/account-*`).
 * It needs no passkey and no real account API, so it uses the plain guest `test` fixture, not
 * `accountTest` — nothing here is wired into the app, so there is no signed-in state to reach.
 */

test('the guest app cold-starts with /api/* unreachable', async ({ page }) => {
    // `scripts/serve.mjs` 404s every `/api/*` path until a worker calls `/__test/api?target=`
    // (only `accountTest` does that) — the default state every OTHER spec in this suite runs
    // under. Nothing in `app/ensemble.tsx` calls `/api/*` yet (#1261 wires no UI), so the guest
    // app already proves "cold-starts AND plays with the API unreachable" on every green run of
    // the rest of this suite (which does exercise playback, extensively); this assertion pins
    // the unreachable-API precondition itself, directly, rather than relying on inference.
    await page.goto('/v2/');
    await expect(page.getByRole('heading', { name: 'Let’s play something.' })).toBeVisible();
    const status = await page.evaluate(() =>
        fetch('/api/auth/session', { cache: 'no-store' }).then((response) => response.status),
    );
    expect(status).toBe(404);
});

test('a service worker never caches an /api/ response', async ({ page }) => {
    await page.goto('/v2/');
    // The generated `sw.js` (`scripts/offline.mjs`) only intercepts a fetch event whose path
    // starts with `/v2/`; an `/api/*` request never reaches its `event.respondWith` at all, so
    // waiting for the worker to actually control this page is what makes the proof meaningful
    // — an uncontrolled page would pass this assertion for a reason that says nothing about the
    // worker's own fetch handler.
    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL || ''))
        .toContain('/v2/sw.js');

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
