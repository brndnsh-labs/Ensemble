import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import type { ChartDocument } from '../lib/documents';
import { validateDocument } from '../lib/documents';
import { bandForGenre } from '../lib/standards';
import { basePathFromEnv } from '../scripts/base-path.mjs';

export { expect } from '@playwright/test';

/**
 * Where the app under test lives, read from the same `ENSEMBLE_V2_BASE` the build read
 * (#1354) — `/v2` today, `''` for a root build. Every spec spells its URLs through `appUrl`
 * rather than a literal, so the cutover is a build flag here too and not a hundred edits.
 */
export const BASE = basePathFromEnv();

/**
 * One app URL. `appUrl()` is the songbook itself; the argument is everything that followed
 * the base in the old literal — `appUrl('sw.js')`, `appUrl('?accounts=on')`, `appUrl('#chart=')`.
 */
export function appUrl(suffix = ''): string {
    return `${BASE}/${suffix}`;
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
    // The base is in the pattern, not just the origin: a server serving somewhere else than
    // the suite drives is a misconfiguration worth hanging on, not a `baseURL` to adopt.
    const startupLine = new RegExp(
        `V2 preview: (http://127\\.0\\.0\\.1:\\d+)${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`,
    );
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
    // device that opened the Feel sheet once would read. Only when UNSET — an explicit write
    // (the Feel sheet checkbox, `count-in.spec.ts`'s own subject) must survive a reload within
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

const API_DIR = path.resolve(__dirname, '../../v2-api');
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
                `${API_ENTRY} is missing. Run \`npm ci --prefix prototypes/v2-api\` — the suite's global setup builds it when those dependencies are installed.`,
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

/**
 * Wait for the editor's reveal-focus to land before typing into any OTHER field (#1235).
 *
 * `revealEditor` in app/ensemble.tsx bumps `editorRequest`, and an effect gated on `!busy`
 * then focuses the edit panel's first textarea. That effect can fire in the middle of a
 * `fill()` on a different control: Playwright focuses its target and inserts the text as a
 * separate step, so a focus steal in between sends the keystrokes to the textarea instead —
 * observed on `webkit-phone` under three workers as `Chords in this bar` holding
 * "Guided offlineC" while `Song title` stayed "Untitled song". Asserting the steal has already
 * happened is both the barrier and a real assertion about the reveal contract.
 */
export async function editorRevealed(page: Page): Promise<void> {
    await expect(page.locator('.edit-panel textarea').first()).toBeFocused();
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
const STARTER_SAMPLES = [
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

function starterDocuments(): ChartDocument[] {
    const base = Date.now();
    // Distinct, DESCENDING timestamps in listed order (blues newest) — `repository.list()` sorts
    // by `updatedAt` descending, and a spec that opens "the" featured/continue-card song expects
    // it to be `starter-blues` (the old fallback `songs.find(s => s.id === 'starter-blues')`
    // named explicitly), the same way three sequential `lib/starters.ts` saves used to land.
    return STARTER_SAMPLES.map(([id, title, genre, key, value, bpm], index) => {
        const stamp = new Date(base - index * 1000).toISOString();
        return validateDocument({
            schemaVersion: 1,
            id,
            title,
            createdAt: stamp,
            updatedAt: stamp,
            revision: 0,
            chart: {
                arrangement: {
                    key,
                    isMinor: key === 'A',
                    timeSignature: '4/4',
                    grouping: null,
                    notation: 'name',
                    sections: [{ id: 'a', label: 'A', value, repeat: 1 }],
                },
                performance: { bpm, seed: '', randomizeSeed: false },
                band: bandForGenre(genre),
            },
        });
    });
}

/**
 * Writes the three starter documents (above) directly into this page's guest IndexedDB, then
 * navigates to the songbook so they're what it reads on boot. Not `page.addInitScript`: the
 * write is genuinely async (`indexedDB`, unlike `asHeldDevice`'s synchronous `localStorage`
 * write), and an init script's returned promise does not block the page's OWN scripts — so the
 * app's first boot can race the write and read an empty store. A real navigation first, then an
 * awaited `page.evaluate`, then a reload has no such race.
 */
export async function seedStarters(page: Page): Promise<void> {
    await page.goto(appUrl());
    await page.evaluate(async (docs: ChartDocument[]) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('ensemble-v2-preview', 1);
            request.onupgradeneeded = () =>
                request.result.createObjectStore('documents', { keyPath: 'id' });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('documents', 'readwrite');
            for (const doc of docs) {
                tx.objectStore('documents').put(doc);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }, starterDocuments());
    await page.reload();
}
