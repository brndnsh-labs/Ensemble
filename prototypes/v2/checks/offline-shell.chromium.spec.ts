import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * The installed app: its web manifest, its service worker's cache names, the offline fallback,
 * and the "close all tabs to update" policy.
 *
 * Chromium only, deliberately: every assertion here turns on service-worker lifecycle plus a
 * real offline transition, and WebKit's emulation of the last of those is already known-broken
 * in `foundation-helpers.ts`.
 *
 * Some names here are FROZEN, and these tests pin them so a change has to be deliberate: the
 * manifest `id: '/'` (a different `id` is a second app on the home screen), the shell cache
 * prefix `ensemble-v2-root-` (a worker only retires old shells under its own prefix) and the
 * sound cache `ensemble-v2-sounds-v1` (a rename orphans every downloaded pack). Installed
 * browsers already hold all three.
 */
function controller(page: Page) {
    return page
        .evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '')
        .catch(() => null);
}

test.afterEach(async ({ request }) => {
    await request.post('/__test/sw-revision?reset=1');
});

test('the web manifest is linked, valid, and installed with the shell', async ({
    page,
    request,
}) => {
    const reply = await request.get('/manifest.json');
    expect(reply.status()).toBe(200);
    const manifest = JSON.parse(await reply.text());
    // `id: '/'` must never change: it is the installed app's identity, and a manifest with a
    // different one installs as a second Ensemble beside the first. See scripts/offline.mjs.
    expect(manifest).toMatchObject({
        name: 'Ensemble',
        short_name: 'Ensemble',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#14110d',
        background_color: '#14110d',
    });

    const worker = await (await request.get('/sw.js')).text();
    const assets: string[] = JSON.parse(worker.match(/^const ASSETS = (\[.*\]);$/m)![1]);
    expect(assets).toContain('/manifest.json');
    for (const icon of manifest.icons) {
        expect((await request.get(icon.src)).status()).toBe(200);
        // In ASSETS or an installed app has no icon on a plane.
        expect(assets).toContain(icon.src);
    }

    await page.goto('/');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.json');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#14110d');
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/icon.svg');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
        'href',
        '/icon-maskable-512.png',
    );
});

test('the shell installs under the frozen cache prefix, beside the sound cache', async ({
    page,
}) => {
    await page.goto('/');
    await expect.poll(() => controller(page)).toContain('/sw.js');
    // Stand in for a downloaded pack, so the assertion below is about the worker leaving the
    // sound cache alone, not about whether a pack happened to be fetched.
    await page.evaluate(async () => {
        const sounds = await caches.open('ensemble-v2-sounds-v1');
        await sounds.put('/packs/rhodes/manifest.json?asset=x', new Response('pack bytes'));
    });
    await page.reload();
    await expect
        .poll(() => page.evaluate(() => caches.keys()).catch(() => null))
        .toEqual(
            expect.arrayContaining([
                expect.stringMatching(/^ensemble-v2-root-[a-f0-9]{64}$/),
                'ensemble-v2-sounds-v1',
            ]),
        );
});

test('the old /v2 path is a plain 404, online and offline alike', async ({
    context,
    page,
    request,
}) => {
    // Retired with the beta (#1742): no redirect, no tombstone worker.
    for (const path of ['/v2', '/v2/', '/v2/sw.js', '/v2/x?y=1']) {
        const reply = await request.get(path, { maxRedirects: 0 });
        expect(reply.status(), path).toBe(404);
    }
    await page.goto('/');
    await expect.poll(() => controller(page)).toContain('/sw.js');
    expect((await page.goto('/v2/'))?.status()).toBe(404);

    // Offline it is one more path with no entry, and gets the shell like any other.
    await context.setOffline(true);
    await page.goto('/v2/');
    await expect(page).toHaveTitle('Ensemble music stand');
    await context.setOffline(false);
});

test('at root scope an offline navigation still opens the stand, and a 404 is still a 404', async ({
    context,
    page,
    request,
}) => {
    await page.goto('/');
    await expect.poll(() => controller(page)).toContain('/sw.js');

    // Online, a path this artifact does not contain is missing, and the worker says so.
    expect((await request.get('/practice-room')).status()).toBe(404);
    expect((await page.goto('/practice-room'))?.status()).toBe(404);

    await context.setOffline(true);
    // `key` is the pathname, so a query never has to be in ASSETS for `/` to be a hit.
    await page.goto('/?x=1');
    await expect(page).toHaveTitle('Ensemble music stand');
    // And a path with no entry at all falls back to the shell rather than a browser error page.
    await page.goto('/practice-room');
    await expect(page).toHaveTitle('Ensemble music stand');
    await context.setOffline(false);
});

test('a newer build of the stand waits behind the running one', async ({ page, request }) => {
    // A 15s controller poll, a 30s `waiting` poll and the settle can outrun the default budget on
    // a slow runner.
    test.setTimeout(90_000);
    await page.goto('/');
    await expect.poll(() => controller(page)).toContain('/sw.js');
    // Both workers are served from `/sw.js`, so a script URL cannot tell them apart. Hold the
    // controlling ServiceWorker OBJECT instead: `skipWaiting` replaces it, and a page that
    // reloaded would lose this `window` along with it, so identity answers both questions.
    await page.evaluate(() => {
        (window as unknown as { __running: ServiceWorker | null }).__running =
            navigator.serviceWorker.controller;
    });

    // A byte-different copy of the SHIPPED worker under a newer CACHE name: same ASSETS, same
    // handlers, so what is under test is the update policy.
    await request.post('/__test/sw-revision');
    await page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration('/'))?.update();
    });
    await expect
        .poll(
            () =>
                page
                    .evaluate(async () => {
                        const registration = await navigator.serviceWorker.getRegistration('/');
                        return registration?.waiting?.state ?? 'none';
                    })
                    .catch(() => null),
            { timeout: 30_000 },
        )
        .toBe('installed');
    // `installed` is also the state a skipWaiting worker passes through on its way to taking
    // over, so the assertion is made AFTER a settle rather than on first sight of it. A fixed
    // wait is the honest instrument here: what is being asserted is that nothing further
    // happens, and there is no event for that.
    await page.waitForTimeout(1500);
    await expect(
        page.evaluate(async () => {
            const registration = await navigator.serviceWorker.getRegistration('/');
            const running = (window as unknown as { __running: ServiceWorker | null }).__running;
            return {
                waiting: registration?.waiting?.state ?? 'none',
                controllerUnchanged: navigator.serviceWorker.controller === running,
                activeUnchanged: registration?.active === running,
            };
        }),
    ).resolves.toEqual({ waiting: 'installed', controllerUnchanged: true, activeUnchanged: true });
});
