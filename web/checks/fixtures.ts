import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writtenSettings } from '@core/songbook/codec';
import { parseChordBar } from '@core/songbook/score-text';
import type { ChartDocumentV2 } from '@core/songbook/score-types';
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { validateDocument } from '../lib/documents';
import { bandForGenre } from '../lib/standards';

export { expect } from '@playwright/test';

/**
 * One app URL, from the site root (#1734). `appUrl()` is the songbook itself; the argument is
 * everything after the slash — `appUrl('sw.js')`, `appUrl('?autoplay=1')`, `appUrl('#chart=')`.
 */
export function appUrl(suffix = ''): string {
    return `/${suffix}`;
}

/**
 * One preview server PER WORKER, not one for the whole run (#1223).
 *
 * `scripts/serve.mjs` carries process-global state: its `/__test/network` toggle drops every
 * socket while "offline", which is how the WebKit projects prove cache-only navigation. With a
 * single shared server, a second worker's tests would see their requests destroyed whenever a
 * sibling worker went offline. So each worker spawns its own server on an ephemeral port and
 * the `baseURL` option is overridden to point at it; `page`, `context` and `request` all
 * follow `baseURL`, so the specs are unchanged. Against the live test host there is nothing to
 * start and the suite runs on one worker (see playwright.config.ts).
 */
const liveTest = process.env.V2_LIVE_TEST === '1';
const LIVE_URL = 'https://ensembletest.brndn.zip';

// Playwright transpiles these specs to CommonJS (no "type": "module" here), so `__dirname`
// is the module-relative anchor, not `import.meta.dirname`.
async function startPreviewServer(): Promise<{ child: ChildProcess; url: string }> {
    const child = spawn(process.execPath, [path.resolve(__dirname, '../scripts/serve.mjs')], {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, V2_PREVIEW_PORT: '0' },
        stdio: ['ignore', 'pipe', 'inherit'],
    });
    let buffered = '';
    const startupLine = /V2 preview: (http:\/\/127\.0\.0\.1:\d+)\//;
    const url = await new Promise<string>((resolvePort, reject) => {
        child.stdout?.setEncoding('utf8');
        child.stdout?.on('data', (chunk: string) => {
            buffered += chunk;
            const match = buffered.match(startupLine);
            if (match) {
                resolvePort(match[1]);
            }
        });
        child.once('exit', (code) =>
            reject(new Error(`preview server exited with ${code} before listening`)),
        );
    });
    return { child, url };
}

export const test = base.extend<Record<never, never>, { previewServer: string }>({
    previewServer: [
        // Playwright requires the destructuring pattern here even with no dependencies.
        // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture signature
        async ({}, use) => {
            if (liveTest) {
                await use(LIVE_URL);
                return;
            }
            const { child, url } = await startPreviewServer();
            await use(url);
            child.kill();
            await once(child, 'exit');
        },
        { scope: 'worker' },
    ],
    baseURL: async ({ previewServer }, use) => {
        await use(previewServer);
    },
    // Count-in (#1422) is device-local and defaults ON, so a fresh guest device would get one
    // bar of clicks before every Play — real product behavior, but it would push back the
    // first note/highlight/audio sample in every OTHER spec in this suite that presses Play
    // without being about count-in at all. Seed the preference OFF here, the same way a real
    // device that opened the Band sheet once would read. Only when UNSET — an explicit write
    // (the Band sheet's Practice checkbox, `count-in.spec.ts`'s own subject) must survive a reload within
    // the same test, not get silently put back on the next navigation.
    //
    // A cheap, suite-wide CSP net (#1395): `window.__cspViolations` collects every
    // `securitypolicyviolation` event this page fires, on every navigation (`addInitScript`
    // reruns per document). Nothing reads it mid-test — `checks/csp.spec.ts` is the one spec that
    // asserts on it deliberately — but the fixture checks it after EVERY test, so a policy that
    // is one source too narrow fails whichever spec first exercises that path, not just the
    // dedicated CSP spec. Best-effort: a page already closed or navigated away by the test's own
    // teardown is not a CSP failure, so a lost evaluation is swallowed rather than asserted on.
    //
    // The one deliberate exemption: on WebKit, Playwright's own `page.screenshot()` trips
    // `style-src-elem` (an inline style the capture driver applies — a `MutationObserver` sees no
    // `<style>` node the app adds), and it can fire after the screenshot call has returned, so no
    // time window around the call holds. That exact violation is dropped on WebKit only. Chromium
    // runs the same export through the same specs and still fails on any inline style the app
    // ships, so the style policy stays guarded.
    page: async ({ page, browserName }, use) => {
        await page.addInitScript(() => {
            const w = window as unknown as { __cspViolations: string[] };
            w.__cspViolations = [];
            window.addEventListener('securitypolicyviolation', (event) => {
                w.__cspViolations.push(`${event.violatedDirective} blocked ${event.blockedURI}`);
            });
            try {
                if (localStorage.getItem('ensemble-v2-preview:count-in') === null) {
                    localStorage.setItem('ensemble-v2-preview:count-in', '0');
                }
                // The same for the style's sounds fetched behind the band (#1997, default on):
                // left on, every spec that presses Play would download packs and have its lanes
                // move over mid-test. `style-sounds.spec.ts` turns it back on.
                if (localStorage.getItem('ensemble-v2-preview:auto-sounds') === null) {
                    localStorage.setItem('ensemble-v2-preview:auto-sounds', '0');
                }
                // "What do you play?" (#1992) is asked once on a fresh device; every spec but the
                // one about it reads as a device that answered "Just listening", which changes
                // nothing on the stand. Only when unset, for the same reason as the count-in.
                if (localStorage.getItem('ensemble-v2-preview:player-instrument') === null) {
                    localStorage.setItem('ensemble-v2-preview:player-instrument', 'listening');
                }
            } catch {
                // Best effort, like the app's own preference reads/writes.
            }
        });
        await use(page);
        const violations = await page
            .evaluate(
                () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
            )
            .catch(() => []);
        const counted =
            browserName === 'webkit'
                ? violations.filter((v) => v !== 'style-src-elem blocked inline')
                : violations;
        expect(counted, 'no CSP violation should fire during this test').toEqual([]);
    },
});

const API_DIR = path.resolve(__dirname, '../../api');
const API_ENTRY = path.join(API_DIR, 'dist/server.js');

/** The API refuses `PORT=0`, so probe for a free port instead of asking it to pick one. */
async function freePort(): Promise<number> {
    const probe = createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const { port } = probe.address() as { port: number };
    probe.close();
    await once(probe, 'close');
    return port;
}

export interface AccountApi {
    /** `http://localhost:<port>` — the ONE origin serving both the app and `/api/*`. */
    origin: string;
}

/**
 * The real account API, one process PER TEST, behind the worker's shared preview proxy, on one
 * origin (#1258; made test-scoped in the #1263 patch review, item 5).
 *
 * Opt-in: only a spec that uses `accountTest` starts it, so guest specs never need the API built
 * or running. Each test runs the SHIPPED bundle (`dist/server.js`, built once by
 * `checks/global-setup.ts`) on its OWN throwaway `node:sqlite` file with registration open, torn
 * down and deleted in `finally` when that test ends.
 *
 * Test-scoped rather than worker-scoped on purpose: `POST /api/auth/recovery/enroll` is rate
 * limited to 5 per 10 minutes, keyed by source IP, and the harness runs the API in `socket-only`
 * identity mode — so a worker-scoped process made every test on that worker share ONE bucket,
 * and the account specs' budget arithmetic had to track how many enrolments the whole suite spent
 * per worker (see the account spec files' history for the old accounting). A fresh process per
 * test means a fresh rate limiter per test instead: tests on one worker already run serially
 * (Playwright never overlaps two tests on the same worker), so spawning + health-checking one API
 * process per test costs a little more wall time than the old one-per-worker but removes the
 * shared-bucket hazard entirely, along with the two-plus-worker minimum it used to require.
 *
 * The origin is `localhost`, not the `127.0.0.1` the preview server prints: WebAuthn only
 * accepts an IP-less RP ID, and the API's config only accepts `https:` or `http://localhost`.
 * Spawned as plain `node`, never through the `tsx` CLI — a SIGKILLed `tsx` orphans its child.
 */
export const accountTest = test.extend<{ accountApi: AccountApi }>({
    accountApi: async ({ previewServer }, use) => {
        if (liveTest) {
            throw new Error('Account specs need the local harness; unset V2_LIVE_TEST.');
        }
        if (!existsSync(API_ENTRY)) {
            throw new Error(
                `${API_ENTRY} is missing. Run \`npm ci --prefix api\` — the suite's global setup builds it when those dependencies are installed.`,
            );
        }
        const origin = previewServer.replace('127.0.0.1', 'localhost');
        const port = await freePort();
        const data = mkdtempSync(path.join(tmpdir(), 'ensemble-v2-api-'));
        const child = spawn(process.execPath, [API_ENTRY], {
            cwd: API_DIR,
            env: {
                ...process.env,
                PORT: String(port),
                HOST: '127.0.0.1',
                ENSEMBLE_ORIGIN: origin,
                ENSEMBLE_RP_ID: 'localhost',
                ENSEMBLE_RP_NAME: 'Ensemble (test harness)',
                ENSEMBLE_DB_PATH: path.join(data, 'db.sqlite'),
                ENSEMBLE_REGISTRATION: 'open',
                ENSEMBLE_AUTH_IP_MODE: 'socket-only',
                // At least 32 bytes or the API refuses to start; it keys nothing that outlives the run.
                ENSEMBLE_AUTH_IP_SECRET: 'harness-only-'.padEnd(48, 'x'),
            },
            // Its startup line is noise across three workers; a crash still reaches stderr.
            stdio: ['ignore', 'ignore', 'inherit'],
        });
        try {
            const target = `http://127.0.0.1:${port}`;
            await expect
                .poll(
                    async () => {
                        if (child.exitCode !== null) {
                            throw new Error(`account API exited with ${child.exitCode}`);
                        }
                        return fetch(`${target}/healthz`).then(
                            (reply) => reply.status,
                            () => 0,
                        );
                    },
                    { timeout: 15_000 },
                )
                .toBe(200);
            await fetch(`${previewServer}/__test/api?target=${encodeURIComponent(target)}`, {
                method: 'POST',
            });
            await use({ origin });
        } finally {
            await fetch(`${previewServer}/__test/api`, { method: 'POST' }).catch(() => {});
            if (child.exitCode === null) {
                child.kill();
                await once(child, 'exit');
            }
            rmSync(data, { recursive: true, force: true });
        }
    },
    baseURL: async ({ accountApi }, use) => {
        await use(accountApi.origin);
    },
});

/** Opens the Band sheet (#1703) on `tab` and returns the dialog. */
export async function openBand(page: Page, tab: 'Players' | 'Groove' | 'Trade' | 'Practice') {
    const sheet = page.getByRole('dialog', { name: 'Band' });
    // `open`, not visibility: a sheet sliding shut after a close is still visible for a moment.
    if ((await page.locator('dialog.band-panel[open]').count()) === 0) {
        await page.getByRole('button', { name: 'Band…' }).click();
    }
    const button = sheet.getByRole('tab', { name: tab });
    // Already on it (the sheet reopens on its last tab): no click, and no wait. Another tab is
    // clicked once the sheet has finished sliding in — WebKit can stall a click mid-slide.
    if ((await button.getAttribute('aria-selected')) !== 'true') {
        await settled(sheet);
        await button.click();
    }
    await expect(button).toHaveAttribute('aria-selected', 'true');
    return sheet;
}

/**
 * A song's row link — on the songbook home, the All songs page or in search results — by its
 * EXACT title and, when given, the one muted fact under it (#1441). The rows used to be selected
 * by their accessible name, "<title> <genre> · Saved locally"; #1441 says where songs live once,
 * under the list, so the name no longer carries it. This keeps both halves of what that name
 * asserted: the title matches exactly (a "— copy" or "copy" row never does), and `detail` is the
 * row's genre (or composer, for a song that has one) matched exactly too.
 */
export function songLink(scope: Page, title: string, detail?: string): Locator {
    const exact = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    let link = scope
        .locator('.song-link')
        .filter({ has: scope.locator('.song-name', { hasText: exact(title) }) });
    if (detail !== undefined) {
        link = link.filter({ has: scope.locator('.song-detail', { hasText: exact(detail) }) });
    }
    return link;
}

/**
 * Waits for every running animation and transition on this element to finish (#1700). Controls
 * ease their colour and border on a state change now, so a spec that reads a computed style right
 * after a click must read the SETTLED value, not a frame of the fade.
 */
export async function settled(locator: Locator): Promise<void> {
    await locator.evaluate((element) =>
        Promise.all(
            element.getAnimations({ subtree: true }).map((animation) => animation.finished),
        ),
    );
}

/**
 * Wait for the editor to be up before typing into it (#1235). Nothing takes focus on the way in
 * (#1726: a bar opens when pressed), so the barrier is the header's title field, enabled once the
 * editor is no longer busy.
 */
export async function editorRevealed(page: Page): Promise<void> {
    await expect(page.locator('#title')).toBeEnabled();
}

/** Whether the page is at the app's phone width (`bar-dock.tsx`'s 760px), where a bar is typed
 * in the dock on the keyboard (#1724) rather than in the bar. */
export function phoneWidth(page: Page): boolean {
    return (page.viewportSize()?.width ?? 1280) <= 760;
}

/**
 * Bar `bar`'s chord field (#1723): in the bar on a laptop, the dock on a phone (#1724) — both
 * named "Chords in bar N", counted from 1 across the whole chart.
 */
export function barField(page: Page, bar: number): Locator {
    return page.getByLabel(`Chords in bar ${bar}`, { exact: true });
}

/**
 * Opens bar `bar` for typing, as a musician does — a press on it (a tap at phone width) — unless
 * its field is already up, and waits for the field to take focus.
 */
export async function openBar(page: Page, bar: number): Promise<Locator> {
    const field = barField(page, bar);
    if (!(await field.isVisible())) {
        const target = page.locator('.sheet .bar').nth(bar - 1);
        // A tap where the page takes touch; a laptop project narrowed to phone width has none.
        if (phoneWidth(page) && (await page.evaluate(() => navigator.maxTouchPoints > 0))) {
            await target.tap();
        } else {
            await target.click();
        }
    }
    await expect(field).toBeFocused();
    return field;
}

/** Types `text` over bar `bar`'s chords (#1723): the bar opened, then its field filled. Unapplied
 * until the bar is left (`leaveBar`, Tab/Enter, another bar) or Save commits it. */
export async function typeBar(page: Page, bar: number, text: string): Promise<void> {
    await (await openBar(page, bar)).fill(text);
}

/**
 * Leaves the open bar, which applies it (#1723) — what "Update chart" did for one bar. On a phone
 * the dock's Done; on a laptop a press on the chart beside the bars, so focus leaves the field
 * the way a musician's click elsewhere takes it. A no-op with no bar open.
 */
export async function leaveBar(page: Page): Promise<void> {
    if (await page.locator('.bar-dock').isVisible()) {
        await closeBarDock(page);
        return;
    }
    const field = page.locator('.bar-input');
    if ((await field.count()) > 0) {
        await page.locator('.chart-bottom > span').click();
        await expect(field).toHaveCount(0);
    }
}

/**
 * Opens the section letter's menu (#1726) for section `label` while editing a measure chart —
 * its settings, Add section after and Delete section — and returns it.
 */
export async function openSectionMenu(page: Page, label: string): Promise<Locator> {
    const menu = page.getByRole('dialog', { name: `Section ${label} menu`, exact: true });
    if (!(await menu.isVisible())) {
        await page.getByRole('button', { name: `Section ${label}`, exact: true }).click();
    }
    await expect(menu).toBeVisible();
    return menu;
}

/** The section menu's "Key, mode or meter" group, unfolded (folded as the menu opens, #1758). */
export async function openSectionContext(menu: Locator): Promise<void> {
    await unfold(menu.locator('details.section-menu-context'));
}

/** The section menu's "Name and plays" group, unfolded (folded as the menu opens, #1758). */
export async function openSectionNames(menu: Locator): Promise<void> {
    await unfold(menu.locator('details.section-menu-names'));
}

/** The section menu's "Role and players" group, unfolded (#2021). */
export async function openSectionBand(menu: Locator): Promise<void> {
    await unfold(menu.locator('details.section-menu-band'));
}

async function unfold(details: Locator): Promise<void> {
    if (!(await details.evaluate((node: HTMLDetailsElement) => node.open))) {
        await details.locator('summary').click();
    }
}

/**
 * The three sample songs `lib/starters.ts` used to auto-seed into every fresh guest songbook,
 * before #1439 retired that seeding for the read-only standards catalog. A pre-#1439 spec that
 * opens one of these by name — `'Blue pocket'` (Blues, C), `'Minor swing sketch'` (Jazz, A minor)
 * or `'After hours'` (Bossa, C) — still needs SOME device that already has it; this fixture
 * writes the same three documents straight into the guest store, under the same ids
 * (`starter-<genre>`) two independently-fresh device profiles used to land on by construction —
 * `checks/account-adopt-guest.chromium.spec.ts`'s P0 depends on that.
 */
const STARTER_SAMPLES: readonly SampleSong[] = [
    [
        'starter-blues',
        'Blue pocket',
        'Blues',
        'C',
        'C7 | F7 | C7 | C7 | F7 | F7 | C7 | C7 | G7 | F7 | C7 | G7',
        110,
    ],
    [
        'starter-jazz',
        'Minor swing sketch',
        'Jazz',
        'A',
        'Am6 | Am6 | Dm6 | Dm6 | E7 | E7 | Am6 | E7',
        160,
    ],
    [
        'starter-bossa',
        'After hours',
        'Bossa',
        'C',
        'Dm7 | G7 | Cmaj7 | A7 | Dm7 | G7 | Cmaj7 | Cmaj7',
        125,
    ],
] as const;

/** One song as `STARTER_SAMPLES` lists it: id, title, genre, key, the bars' chord text, bpm. */
export type SampleSong = readonly [string, string, string, string, string, number];

/**
 * One sample song as a measure chart: one section of 4/4 bars, each bar's chord text read by the
 * bar editor's own parser (`parseChordBar`), so a bar holds exactly what its text says, and the
 * codec, not this file, decides what a valid chart is. Written as a chart is today
 * (`writtenSettings`). An A-key sample is A minor, as the starters were.
 */
export function measureSong(
    [id, title, genre, key, value, bpm]: SampleSong,
    stamp = new Date().toISOString(),
): ChartDocumentV2 {
    const measures = value.split('|').map((text, index) => {
        const events = parseChordBar(text, '4/4');
        if (events.kind !== 'ok') {
            throw new Error(`Sample "${title}" bar ${index + 1} did not read: ${text}`);
        }
        return {
            id: `measure-${index + 1}`,
            content: { kind: 'events' as const, events: events.value },
        };
    });
    return validateDocument({
        schemaVersion: 2,
        id,
        title,
        createdAt: stamp,
        updatedAt: stamp,
        revision: 0,
        chart: {
            score: {
                key,
                isMinor: key === 'A',
                notation: 'name',
                meter: '4/4',
                grouping: null,
                sections: [{ id: 'a', label: 'A', repeat: 1, measures }],
            },
            // `randomizeSeed: false` here is a deliberate TEST-fixture divergence from what
            // `lib/starters.ts` used to write (`randomizeSeed: true`, the engine's own
            // default) — this fixture's job is reproducible clickable data across runs, not
            // modelling real seed-randomization behavior, and several specs assert exact
            // durations/output against these songs.
            ...writtenSettings({
                performance: { bpm, seed: '', randomizeSeed: false },
                band: bandForGenre(genre),
            }),
        },
    });
}

/**
 * Distinct, DESCENDING timestamps in listed order (blues newest) — `repository.list()` sorts by
 * `updatedAt` descending, and a spec that opens "the" featured/continue-card song expects it to
 * be `starter-blues` (the old fallback `songs.find(s => s.id === 'starter-blues')` named
 * explicitly), the same way three sequential `lib/starters.ts` saves used to land.
 */
function starterStamps(): string[] {
    const base = Date.now();
    return STARTER_SAMPLES.map((_, index) => new Date(base - index * 1000).toISOString());
}

/** The three starter songs as measure charts — what the specs seed. */
export function starterDocuments(): ChartDocumentV2[] {
    const stamps = starterStamps();
    return STARTER_SAMPLES.map((sample, index) => measureSong(sample, stamps[index]));
}

/**
 * Writes the three starter documents (above) directly into this page's guest IndexedDB, then
 * navigates to the songbook so they're what it reads on boot. Not `page.addInitScript`: the
 * write is genuinely async (`indexedDB`, unlike `asHeldDevice`'s synchronous `localStorage`
 * write), and an init script's returned promise does not block the page's OWN scripts — so the
 * app's first boot can race the write and read an empty store.
 *
 * The write happens on `build.json`, a same-origin page that runs none of the app, and only then
 * does the app load, ONCE. An earlier version loaded the app, wrote, and reloaded. That reload
 * landed in the middle of the service worker's first install (which precaches the whole shell),
 * and on CI's slower WebKit the interrupted install never produced a controller, failing
 * `semantic-chart.spec.ts`'s offline reopen twice running. For the same reason, a spec that
 * wants the app at another URL passes it as `path` rather than navigating again straight after:
 * leaving the app mid-boot surfaces WebKit teardown rejections (`[object Event]`,
 * `Context is stopped`) as `pageerror`s in any spec that collects them.
 */
export async function seedStarters(page: Page, path = ''): Promise<void> {
    await seedGuestDocuments(page, starterDocuments(), path);
}

/**
 * `seedStarters`' write, for any raw rows (#1441): the rows go into the guest store exactly as
 * given — no validation, so a spec can plant a corrupt document — on `build.json`, and only then
 * does the app load, once. See `seedStarters` for why it is done in that order.
 */
export async function seedGuestDocuments(page: Page, docs: unknown[], path = ''): Promise<void> {
    await page.goto(appUrl('build.json'));
    await page.evaluate(async (rows: unknown[]) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('ensemble-v2-preview', 1);
            request.onupgradeneeded = () =>
                request.result.createObjectStore('documents', { keyPath: 'id' });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('documents', 'readwrite');
            for (const row of rows) {
                tx.objectStore('documents').put(row);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }, docs);
    await page.goto(appUrl(path));
}

/** The Song menu's top-level rows (#1756); every other row is under More. */
const SONG_MENU_TOP = ['Copy link', 'Duplicate', 'Export…', 'More', 'Delete…'];

/** The Song menu's list (•••, #1756): its five actions, or `more` for the More list. */
export function songMenu(page: Page, list: 'actions' | 'more' = 'actions'): Locator {
    return page.getByRole('menu', {
        name: list === 'more' ? 'More song actions' : 'Song actions',
        exact: true,
    });
}

/** Opens the Song menu (•••, #1756) and returns its list of five actions. */
export async function openSongMenu(page: Page): Promise<Locator> {
    const menu = songMenu(page);
    await page.getByRole('button', { name: 'Song actions', exact: true }).click();
    await expect(menu).toBeVisible();
    return menu;
}

/**
 * Chooses one row of the Song menu (#1756), opening it first: a top-level action (Copy link,
 * Duplicate, Export…, Delete…) or one under More (Revert to saved, Older drafts (N)…). A
 * row that is `aria-disabled` is waited on, as a disabled button is.
 */
export async function songMenuAction(page: Page, name: string | RegExp): Promise<void> {
    const menu = await openSongMenu(page);
    if (typeof name === 'string' && SONG_MENU_TOP.includes(name)) {
        await menu.getByRole('menuitem', { name, exact: true }).click();
        return;
    }
    await menu.getByRole('menuitem', { name: 'More', exact: true }).click();
    const more = songMenu(page, 'more');
    await expect(more).toBeVisible();
    await more
        .getByRole('menuitem', typeof name === 'string' ? { name, exact: true } : { name })
        .click();
}

/** Export… (#1756), the Song menu's dialog of formats. */
export const exportDialog = (page: Page) => page.getByTestId('export-dialog');

/**
 * Song menu → Export… → one format (#1756). The caller waits on the download itself (set up
 * before this call). A song file, MIDI or original source closes the dialog once written; audio
 * holds it open with its progress until the render settles.
 */
export async function exportAs(
    page: Page,
    format: 'Song file' | 'MIDI' | 'Audio (mix)' | 'Audio (separate tracks)' | 'Original source',
): Promise<Locator> {
    await songMenuAction(page, 'Export…');
    const dialog = exportDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: format, exact: true }).click();
    return dialog;
}

/** The transport's Key button (#1757), named for the key it shows: "Key: B♭", "Key: Cm". */
export const keyButton = (page: Page): Locator => page.getByRole('button', { name: /^Key: / });

/** The transport's Key popover (#1757): the song's Key, Mode, Meter and Chord notation. */
export const keyPopover = (page: Page): Locator =>
    page.getByRole('dialog', { name: 'Key and meter' });

/**
 * Opens the Key popover from the transport, if it is not open already, and returns it. On a phone
 * the bar dock hides the transport while a bar is open (#1724), so the bar is left (Done) first.
 */
export async function openKeyPopover(page: Page): Promise<Locator> {
    const popover = keyPopover(page);
    if (!(await popover.isVisible())) {
        if (await page.locator('.bar-dock').isVisible()) {
            await closeBarDock(page);
        }
        await keyButton(page).click();
    }
    await expect(popover.getByLabel('Key', { exact: true })).toBeEnabled();
    return popover;
}

/**
 * Closes the Key popover with an Esc sent to the popover itself, if it is still open. Checked and
 * sent in one step in the page: a refusal can close it first, and an Esc pressed then would land
 * on whatever took focus (a bar field, putting back its text).
 */
export async function closeKeyPopover(page: Page): Promise<void> {
    await page.evaluate(() => {
        document
            .querySelector('[data-testid="key-popover"]')
            ?.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
            );
    });
    await expect(keyPopover(page)).toHaveCount(0);
}

/** Picks the song's key in the Key popover (a value: 'Eb', not 'E♭'), then closes it. */
export async function pickSongKey(page: Page, key: string): Promise<void> {
    const popover = await openKeyPopover(page);
    await popover.getByLabel('Key', { exact: true }).selectOption(key);
    await closeKeyPopover(page);
}

/** Picks how many times the form plays from the chart footer's form-length menu (#1511). */
export async function pickFormLength(page: Page, choice: string): Promise<void> {
    const menu = page.getByRole('menu', { name: 'How many times the form plays' });
    await page.locator('.chart-bottom').getByRole('button').click();
    await menu.getByRole('menuitemradio', { name: choice, exact: true }).click();
    await expect(menu).toHaveCount(0);
}

/**
 * The chart footer's form-length menu's current choice (#1511): "Repeats continuously" or a
 * count, read with the menu open, then closed again. Choruses has had no other home since #1756.
 */
export async function formLength(page: Page): Promise<string> {
    const menu = page.getByRole('menu', { name: 'How many times the form plays' });
    await page.locator('.chart-bottom').getByRole('button').click();
    await expect(menu).toBeVisible();
    const checked = menu.getByRole('menuitemradio', { checked: true });
    const label = (await checked.innerText()).trim();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    return label;
}

/**
 * Closes the phone's bar dock if it is up (#1724): at phone width an open bar is typed in the dock,
 * and the transport is hidden until Done. A no-op on the laptop, where the bar holds its field.
 */
export async function closeBarDock(page: Page): Promise<void> {
    const dock = page.locator('.bar-dock');
    if (await dock.isVisible()) {
        await dock.getByRole('button', { name: 'Done', exact: true }).click();
        await expect(dock).toHaveCount(0);
    }
}
