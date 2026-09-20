import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
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
