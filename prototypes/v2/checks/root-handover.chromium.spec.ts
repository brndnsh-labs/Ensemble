import type { Page } from '@playwright/test';
import { BASE, expect, test } from './fixtures';

/**
 * What happens to a browser that has been here before, when the stand takes the site root
 * (#1355, rollout phase 5).
 *
 * These specs need an export built with `ENSEMBLE_V2_BASE=/`, which is the `v2-root-base`
 * workflow's build and not the one the ordinary suite runs, so at `/v2` they skip with a reason
 * rather than pretending to cover the cutover. Chromium only, deliberately: every assertion here
 * turns on service-worker lifecycle — a conditional `skipWaiting`, `clients.claim`,
 * `WindowClient.navigate`, `registration.unregister` — plus a real offline transition, and
 * WebKit's emulation of the last of those is already known-broken in `foundation.spec.ts`.
 *
 * The browser's prior state is staged by `scripts/serve.mjs`'s `/__test/legacy` stand-ins: a
 * minimal v1 at `/` and a minimal preview at `/v2/`, each faithful in its cache NAMES and its
 * waiting policy, which are the two things the handover reads. `?reload=0` drops the v1 page's
 * own `controllerchange` reload, which is the only shape that can observe the worker's belt.
 */
test.skip(
    () => BASE !== '',
    'Root-build only: rebuild with ENSEMBLE_V2_BASE=/ (the v2-root-base workflow does).',
);

/** A key exactly as `lib/sounds.ts` writes one, under the base the cutover moves away from. */
const OLD_SOUND_KEY = `/v2/packs/grand/manifest.json?asset=${'b'.repeat(64)}`;
/** And the same entry's key after the move. */
const NEW_SOUND_KEY = `/packs/grand/manifest.json?asset=${'b'.repeat(64)}`;
/** One this build already owns, used where the point is survival rather than the move. */
const ROOT_SOUND_KEY = `/packs/rhodes/manifest.json?asset=${'c'.repeat(64)}`;

/**
 * Every probe below runs in a page the worker under test is entitled to navigate out from
 * under it, and `expect.poll` fails the test outright when its callback throws rather than
 * polling again. So a probe that loses its execution context answers `null` and is asked again.
 */
function cacheState(page: Page) {
    return page
        .evaluate(async () => {
            const names = await caches.keys();
            return {
                // The worker's own rules, restated here so a change to either has to be
                // deliberate in two places: v1 owns `ensemble-*`/`workbox-*`, this app owns
                // `ensemble-v2-*`, and within that the beta's shells and the site's shells are
                // separate namespaces so the tombstone can clear one without touching the other.
                legacy: names
                    .filter(
                        (name) =>
                            !name.startsWith('ensemble-v2-') &&
                            (name.startsWith('ensemble-') || name.startsWith('workbox-')),
                    )
                    .sort(),
                root: names.filter((name) => name.startsWith('ensemble-v2-root-')).sort(),
                preview: names.filter((name) => name.startsWith('ensemble-v2-preview-')).sort(),
                sounds: names.includes('ensemble-v2-sounds-v1'),
            };
        })
        .catch(() => null);
}

function controller(page: Page) {
    return page
        .evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '')
        .catch(() => null);
}

function scopes(page: Page) {
    return page
        .evaluate(async () =>
            (await navigator.serviceWorker.getRegistrations())
                .map((registration) => new URL(registration.scope).pathname)
                .sort(),
        )
        .catch(() => null);
}

function soundKeys(page: Page) {
    return page
        .evaluate(async () => {
            const cache = await caches.open('ensemble-v2-sounds-v1');
            return (await cache.keys())
                .map((request) => {
                    const url = new URL(request.url);
                    return url.pathname + url.search;
                })
                .sort();
        })
        .catch(() => null);
}

/** An in-page GET that always settles, so a worker wedged in `activating` reads as `false`. */
function fetchWorks(page: Page) {
    return page
        .evaluate(() =>
            fetch('/build.json', { signal: AbortSignal.timeout(3000) }).then(
                (reply) => reply.ok,
                () => false,
            ),
        )
        .catch(() => null);
}

test.afterEach(async ({ request }) => {
    await request.post('/__test/legacy?on=0');
    await request.post('/__test/sw-revision?reset=1');
});

test('a v1 worker hands the site root over, keeping downloaded sounds and v1 local data', async ({
    context,
    page,
    request,
}) => {
    // Two 30s polls in sequence can outrun the default budget on a slow runner.
    test.setTimeout(90_000);
    await request.post('/__test/legacy?on=1');
    await page.goto('/');
    await expect.poll(() => controller(page)).toContain('/sw.js');
    // Reload once the stand-in controls, so what follows is the page as a returning musician
    // gets it: served out of v1's precache, not off the network.
    await page.reload();
    await expect(page.locator('body[data-standin="v1"]')).toBeVisible();

    // The two things the cut must not take with it. `ensemble_*` is v1's own namespace and the
    // #1274 import reads it; the sound cache holds packs somebody downloaded for a gig. Keyed
    // under `/packs/` here because this spec is about surviving the sweep — the re-key across
    // the base change has its own spec below.
    await page.evaluate(async (key) => {
        localStorage.setItem('ensemble_userPresets', '[{"name":"Brandon"}]');
        localStorage.setItem('ensemble_currentState', '{"bpm":123}');
        const sounds = await caches.open('ensemble-v2-sounds-v1');
        await sounds.put(key, new Response('pack bytes'));
    }, ROOT_SOUND_KEY);
    const before = await cacheState(page);
    expect(before?.legacy).toEqual(['ensemble-packs', expect.stringContaining('-precache-')]);
    expect(before?.sounds).toBe(true);

    // Cache-first, and it does not need the network to prove it.
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('body[data-standin="v1"]')).toBeVisible();
    await context.setOffline(false);

    // The cutover. ONE reload is the whole budget: that navigation is answered from v1's cache,
    // but the browser soft-updates the `/sw.js` registration behind it either way, and the new
    // worker then skips waiting, activates and brings the window across by itself.
    await request.post('/__test/legacy?on=0');
    await page.reload();
    await expect(page).toHaveTitle('Ensemble music stand', { timeout: 30_000 });
    await expect(page.locator('body[data-standin]')).toHaveCount(0);

    await expect
        .poll(() => cacheState(page), { timeout: 30_000 })
        .toEqual({
            legacy: [],
            root: [expect.stringContaining('ensemble-v2-root-')],
            preview: [],
            sounds: true,
        });
    await expect(
        page.evaluate(async (key) => {
            const cache = await caches.open('ensemble-v2-sounds-v1');
            return (await cache.match(key))?.text() ?? null;
        }, ROOT_SOUND_KEY),
    ).resolves.toBe('pack bytes');
    await expect(
        page.evaluate(() => [
            localStorage.getItem('ensemble_userPresets'),
            localStorage.getItem('ensemble_currentState'),
        ]),
    ).resolves.toEqual(['[{"name":"Brandon"}]', '{"bpm":123}']);

    // And the new shell is genuinely installed, not merely rendered off the network.
    await context.setOffline(true);
    await page.reload();
    await expect(page).toHaveTitle('Ensemble music stand');
    await context.setOffline(false);
});

test('the belt alone moves a window that never reloads itself', async ({ page, request }) => {
    // The case the belt exists for, and the one that catches an AWAITED `client.navigate`:
    // `navigate()` resolves when the navigation completes, that navigation is inside the
    // worker's own scope, and its fetch cannot be dispatched until the worker leaves
    // `activating` — so awaiting it inside `waitUntil` deadlocks. Measured against the awaited
    // build: this window sat blank for 58 seconds and the origin saw no request at all.
    test.setTimeout(60_000);
    await request.post('/__test/legacy?on=1&reload=0');
    await page.goto('/');
    await expect.poll(() => controller(page)).toContain('/sw.js');
    await page.reload();
    await expect(page.locator('body[data-standin="v1"]')).toBeVisible();

    await request.post('/__test/legacy?on=0');
    await page.reload();
    await expect(page).toHaveTitle('Ensemble music stand', { timeout: 25_000 });
    // And the worker really did finish activating, rather than leaving every in-scope fetch
    // from every controlled client queued behind an unfinished `waitUntil`.
    await expect.poll(() => fetchWorks(page), { timeout: 20_000 }).toBe(true);
});

test('an evicted v1 precache does not wedge the handover', async ({ page, request }) => {
    // The second non-reloading window, and a real one: storage pressure evicts v1's precache but
    // leaves its registration, so `/` comes off the NETWORK as the v2 shell while v1's worker is
    // still the controller. That document has no `controlling` listener of its own — the belt is
    // all there is — and `ensemble-packs` survives, so the handover still fires.
    test.setTimeout(60_000);
    await request.post('/__test/legacy?on=1&reload=0');
    await page.goto('/');
    await expect.poll(() => controller(page)).toContain('/sw.js');
    await page.evaluate(async () => {
        for (const name of await caches.keys()) {
            if (name.includes('-precache-')) {
                await caches.delete(name);
            }
        }
    });
    expect((await cacheState(page))?.legacy).toEqual(['ensemble-packs']);

    await request.post('/__test/legacy?on=0');
    await page.reload();
    await expect(page).toHaveTitle('Ensemble music stand', { timeout: 25_000 });
    await expect.poll(() => fetchWorks(page), { timeout: 20_000 }).toBe(true);
    await expect
        .poll(() => cacheState(page), { timeout: 20_000 })
        .toMatchObject({ legacy: [], root: [expect.stringContaining('ensemble-v2-root-')] });
});

test('a stale /v2/ worker tombstones itself and forwards the link it was holding', async ({
    page,
    request,
}) => {
    await request.post('/__test/legacy?on=1');
    await page.goto('/v2/');
    await expect.poll(() => controller(page)).toContain('/v2/sw.js');
    await expect
        .poll(() => cacheState(page))
        .toMatchObject({ preview: ['ensemble-v2-preview-standin'] });

    await request.post('/__test/legacy?on=0');
    const navigations: string[] = [];
    page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) {
            navigations.push(frame.url());
        }
    });
    // Cache-first over its whole scope, so this navigation never reaches the origin; the
    // tombstone arrives through the update check the browser runs behind it.
    await page.goto('/v2/?x=1#chart=abc').catch(() => {});
    await expect(page).toHaveTitle('Ensemble music stand', { timeout: 30_000 });

    // Query AND fragment survive the hop — old share links of both shapes are the reason the
    // tombstone forwards rather than simply unregistering. The app consumes the fragment once
    // it loads, so the assertion is on the navigation itself, not on the settled URL.
    expect(navigations).toContain(`${new URL(page.url()).origin}/?x=1#chart=abc`);
    await expect.poll(() => scopes(page)).toEqual(['/']);
    // The beta's whole cache namespace goes; the site's shell, which now has a namespace of its
    // own, is untouched. Sharing one namespace is what forced the tombstone to carry a single
    // baked exception that a later root release would have invalidated.
    await expect
        .poll(() => cacheState(page), { timeout: 30_000 })
        .toMatchObject({
            preview: [],
            root: [expect.stringContaining('ensemble-v2-root-')],
        });
});

test('the tombstone never forwards a window off this origin', async ({
    baseURL,
    page,
    request,
}) => {
    // `/v2//host/x` slices to `//host/x`, a protocol-relative URL that `navigate()` would follow
    // to another origin — an open redirect out of a worker every returning browser runs. The
    // second origin here is real: `localhost` and `127.0.0.1` are different origins on the same
    // harness port, so an unfixed tombstone lands on a page that genuinely answers.
    const elsewhere = `localhost:${new URL(baseURL!).port}`;
    await request.post('/__test/legacy?on=1');
    await page.goto('/v2/');
    await expect.poll(() => controller(page)).toContain('/v2/sw.js');

    await request.post('/__test/legacy?on=0');
    await page.goto(`/v2//${elsewhere}/x`).catch(() => {});
    // The tombstone ran — its cache sweep is the tell, since this window is not forwarded.
    await expect.poll(() => cacheState(page), { timeout: 30_000 }).toMatchObject({ preview: [] });
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
    expect(page.url()).toContain(`/v2//${elsewhere}/x`);
});

test('a /v2/ registration is cleaned up by a musician who only ever visits the site root', async ({
    page,
    request,
}) => {
    await request.post('/__test/legacy?on=1');
    await page.goto('/v2/');
    await expect.poll(() => controller(page)).toContain('/v2/sw.js');
    expect(await scopes(page)).toContain('/v2/');

    await request.post('/__test/legacy?on=0');
    await page.goto('/');
    await expect(page).toHaveTitle('Ensemble music stand');
    await expect.poll(() => scopes(page), { timeout: 30_000 }).toEqual(['/']);
});

test('downloaded packs are re-keyed to the new base instead of being downloaded again', async ({
    page,
}) => {
    await page.goto('/');
    await expect.poll(() => controller(page)).toContain('/sw.js');
    await page.evaluate(async (key) => {
        const cache = await caches.open('ensemble-v2-sounds-v1');
        await cache.put(key, new Response('pack bytes'));
    }, OLD_SOUND_KEY);
    expect(await soundKeys(page)).toEqual([OLD_SOUND_KEY]);

    await page.reload();
    await expect.poll(() => soundKeys(page), { timeout: 30_000 }).toEqual([NEW_SOUND_KEY]);
    await expect(
        page.evaluate(async (key) => {
            const cache = await caches.open('ensemble-v2-sounds-v1');
            return (await cache.match(key))?.text() ?? null;
        }, NEW_SOUND_KEY),
    ).resolves.toBe('pack bytes');
    // Idempotent: a second pass has nothing left to move and must not undo the first.
    await page.reload();
    await expect.poll(() => soundKeys(page)).toEqual([NEW_SOUND_KEY]);
});

test('a pack still under the old base plays offline on the first load after the cut', async ({
    context,
    page,
}) => {
    // The background migration runs unawaited from startup, so a read can beat it — and offline
    // that read is the whole answer, because `asset(cachedOnly)` never touches the network. The
    // isolation here is deliberate: the migration already ran when this page mounted and cannot
    // run again without a reload, so if the pack still resolves, `asset()`'s read-through is the
    // only thing that can have found it.
    test.setTimeout(90_000);
    await page.goto('/');
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await page.getByRole('button', { name: 'Sounds', exact: true }).click();
    await page.getByLabel('Chords sound', { exact: true }).selectOption('pack:grand');
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:grand');
    await expect(page.getByText('Song sounds available offline', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close sounds' }).click();

    // Put every downloaded file back under the base a pre-cutover browser wrote it to.
    const moved = await page.evaluate(async () => {
        const cache = await caches.open('ensemble-v2-sounds-v1');
        let count = 0;
        for (const request of await cache.keys()) {
            const url = new URL(request.url);
            if (!url.pathname.startsWith('/packs/')) {
                continue;
            }
            const stored = await cache.match(request);
            if (!stored) {
                continue;
            }
            await cache.put(`/v2${url.pathname}${url.search}`, stored);
            await cache.delete(request);
            count++;
        }
        return count;
    });
    expect(moved).toBeGreaterThan(0);

    await context.setOffline(true);
    // Re-opening the panel re-runs `soundsAvailableOffline`, which walks the pack through
    // `asset(cachedOnly)` — the read-through path, on this same page load.
    await page.getByRole('button', { name: 'Sounds', exact: true }).click();
    await expect(page.getByText('Song sounds available offline', { exact: true })).toBeVisible();
    await context.setOffline(false);
    // And the entries it adopted are filed under the new base from then on.
    expect(await soundKeys(page)).toEqual(
        expect.arrayContaining([expect.stringContaining('/packs/grand/manifest.json?asset=')]),
    );
});

test('the web manifest is linked, valid, and installed with the shell', async ({
    page,
    request,
}) => {
    const reply = await request.get('/manifest.json');
    expect(reply.status()).toBe(200);
    const manifest = JSON.parse(await reply.text());
    // v1's identity, on purpose: an installed v1 PWA has to update in place rather than become
    // a second Ensemble on someone's home screen. See public/manifest.json.
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
    // Both of v1's icon links, not just the Apple one — a tab losing its favicon at the cutover
    // would be a visible regression.
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/icon.svg');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
        'href',
        '/icon-maskable-512.png',
    );
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

/**
 * The "close all tabs to update" policy, asserted against a running root stand. `stageLegacy`
 * plants a v1-named cache AFTER the stand's own worker has settled — a v1 cache that survived the
 * handover (closure review N1) — which is v1 evidence in every sense but one: a root v2 worker
 * already ran here, so what the update replaces is a running v2 band, never v1.
 */
async function expectUpdateWaits(
    page: import('@playwright/test').Page,
    request: import('@playwright/test').APIRequestContext,
    stageLegacy: boolean,
) {
    await page.goto('/');
    await expect.poll(() => controller(page)).toContain('/sw.js');
    if (stageLegacy) {
        await page.evaluate(async () => {
            await caches.open('ensemble-packs');
        });
    }
    // Both workers are served from `/sw.js`, so a script URL cannot tell them apart. Hold the
    // controlling ServiceWorker OBJECT instead: `skipWaiting` replaces it, and a page that
    // reloaded would lose this `window` along with it, so identity answers both questions.
    await page.evaluate(() => {
        (window as unknown as { __running: ServiceWorker | null }).__running =
            navigator.serviceWorker.controller;
    });

    // A byte-different copy of the SHIPPED worker under a newer CACHE name: same ASSETS, same handlers, so
    // what is under test is the update policy. No v1 evidence is present, so the conditional
    // handover must not fire and "close all tabs to update" must still hold.
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
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.json');
}

test('a newer build of the stand still waits behind the running one at root scope', async ({
    page,
    request,
}) => {
    // A 15s controller poll, a 30s `waiting` poll and the settle can outrun the default budget on
    // a slow runner.
    test.setTimeout(90_000);
    await expectUpdateWaits(page, request, false);
});

test('a v1-named cache that outlived the handover cannot make a later release skip waiting', async ({
    page,
    request,
}) => {
    test.setTimeout(90_000);
    await expectUpdateWaits(page, request, true);
});
