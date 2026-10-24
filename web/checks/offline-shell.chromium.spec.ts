import type { Page } from '@playwright/test';
import { encodeChartLink } from '../../core/songbook/chart-link';
import { appUrl, expect, starterDocuments, test } from './fixtures';

/**
 * The installed app: its web manifest, its service worker's cache names, the offline fallback,
 * and the update policy: a newer build waits until the musician presses Reload (#1889), then
 * every idle tab reloads onto it.
 *
 * Chromium only, deliberately: every assertion here turns on service-worker lifecycle plus a
 * real offline transition, and WebKit's emulation of the last of those is already known-broken
 * in `foundation-helpers.ts`.
 *
 * Three names are FROZEN, because installed browsers already hold them: the manifest `id: '/'`
 * (a different `id` is a second app on the home screen), the shell cache prefix
 * `ensemble-v2-root-` (a worker only retires old shells under its own prefix) and the sound cache
 * `ensemble-v2-sounds-v1` (a rename orphans every downloaded pack). This spec pins the first two;
 * the sound cache's name is pinned by `foundation-sounds.spec.ts`, which evicts a file the app
 * downloaded from that cache by name and expects the app to notice. Here it is only the cache the
 * activate sweep must leave alone.
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

/** Stage a byte-different copy of the shipped worker and wait until it is installed, waiting. */
async function stageUpdate(page: Page, request: import('@playwright/test').APIRequestContext) {
    await request.post('/__test/sw-revision');
    await page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration('/'))?.update();
    });
    await expect
        .poll(
            () =>
                page
                    .evaluate(
                        async () =>
                            (await navigator.serviceWorker.getRegistration('/'))?.waiting?.state ??
                            'none',
                    )
                    .catch(() => null),
            { timeout: 30_000 },
        )
        .toBe('installed');
}

/** Mark this page's `window`: a reload loses the mark, so its absence is the reload. */
function mark(page: Page) {
    return page.evaluate(() => {
        (window as unknown as { __mark: boolean }).__mark = true;
    });
}
function marked(page: Page) {
    return page
        .evaluate(() => (window as unknown as { __mark?: boolean }).__mark === true)
        .catch(() => null);
}
function shellCache(page: Page) {
    return page
        .evaluate(async () =>
            (await caches.keys()).filter((name) => name.startsWith('ensemble-v2-root-')),
        )
        .catch(() => null);
}

test('Reload installs the update: idle tabs reload onto it, a tab with unsaved work waits', async ({
    context,
    page,
    request,
}) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await expect.poll(() => controller(page)).toContain('/sw.js');
    const before = await shellCache(page);
    expect(before).toHaveLength(1);

    // A second idle tab on the songbook, and a third with an unsaved shared draft on the stand.
    const idle = await context.newPage();
    await idle.goto('/');
    const busy = await context.newPage();
    await busy.goto(
        appUrl(await encodeChartLink({ ...starterDocuments()[0], title: 'Shared song' })),
    );
    await expect(busy.getByRole('heading', { name: 'Shared song' })).toBeVisible();
    for (const tab of [page, idle, busy]) {
        await expect.poll(() => controller(tab)).toContain('/sw.js');
        await mark(tab);
    }

    await stageUpdate(page, request);
    const footer = page.locator('.home-offline');
    await expect(footer).toContainText('Update ready');
    await footer.getByRole('button', { name: 'Reload' }).click();

    // The pressing tab and the idle one reload onto the new worker, which retired the old shell.
    await expect.poll(() => marked(page), { timeout: 30_000 }).toBe(false);
    await expect.poll(() => marked(idle), { timeout: 30_000 }).toBe(false);
    await expect.poll(() => shellCache(page), { timeout: 30_000 }).toEqual([`${before![0]}-r1`]);
    await expect(footer).toHaveText('App available offline');

    // The tab with unsaved work is now controlled by the new worker but kept its page. A fixed
    // settle is the instrument: what is asserted is that nothing further happens.
    await busy.waitForTimeout(1500);
    expect(await marked(busy)).toBe(true);
    await expect(busy.getByRole('heading', { name: 'Shared song' })).toBeVisible();
    // It says why it has not reloaded.
    await expect(busy.getByTestId('stand-toast')).toContainText('Updated in another tab');
});

test('the update, once it activates, retires the old shell and keeps the downloaded sounds', async ({
    context,
    page,
    request,
}) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await expect.poll(() => controller(page)).toContain('/sw.js');
    const before = await page.evaluate(async () => {
        const sounds = await caches.open('ensemble-v2-sounds-v1');
        await sounds.put('/packs/rhodes/manifest.json?asset=x', new Response('pack bytes'));
        return (await caches.keys()).filter((name) => name.startsWith('ensemble-v2-root-'));
    });
    expect(before).toHaveLength(1);

    // Stage a newer build and let it install; it waits while this tab holds the old one.
    await request.post('/__test/sw-revision');
    await page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration('/'))?.update();
    });
    await expect
        .poll(
            () =>
                page
                    .evaluate(
                        async () =>
                            (await navigator.serviceWorker.getRegistration('/'))?.waiting?.state ??
                            'none',
                    )
                    .catch(() => null),
            { timeout: 30_000 },
        )
        .toBe('installed');

    // Close every tab: the waiting worker activates on the next visit.
    await page.close();
    const next = await context.newPage();
    await next.goto('/');
    await expect
        .poll(
            () =>
                next
                    .evaluate(async () => {
                        const names = await caches.keys();
                        const sounds = await caches.open('ensemble-v2-sounds-v1');
                        return {
                            root: names.filter((name) => name.startsWith('ensemble-v2-root-')),
                            sound: await (
                                await sounds.match('/packs/rhodes/manifest.json?asset=x')
                            )?.text(),
                        };
                    })
                    .catch(() => null),
            { timeout: 30_000 },
        )
        .toEqual({ root: [`${before[0]}-r1`], sound: 'pack bytes' });
});
