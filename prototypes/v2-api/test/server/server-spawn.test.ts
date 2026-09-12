import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Process-level smoke tests for `src/server.ts` (#1189 P2-8 review finding, later tightened by
 * P2-1/P2-2). The reviewer found `node src/server.ts` cannot even start: `ERR_MODULE_NOT_FOUND`
 * on the `.js` import specifiers (this repo's `moduleResolution: "Bundler"` convention, which
 * needs a resolver that understands it), then `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` on #1188's
 * `constructor(readonly reason...)` parameter property. `tsx` (added as an exact-pinned
 * devDependency, `"start": "tsx src/server.ts"`) is the fix — it strips types and understands the
 * repo's module resolution without a build step. These tests run ONE process —
 * `node --import <tsx loader> src/server.ts` — not `npm run start` and not tsx's CLI. The CLI
 * runs the script in a child `node` and relays signals to it, so a SIGKILL from `afterEach` would
 * kill only the wrapper and orphan the listening server (observed during mutation runs). With
 * the loader, the spawned PID is the server itself: SIGTERM and SIGKILL both land on it.
 *
 * P2-1 found `server.ts` used to open and migrate the database BEFORE validating `PORT`/`HOST`,
 * so a bad `PORT` still left a migrated `db.sqlite` (+ `-wal`/`-shm`) behind before crashing. The
 * bad-env table below asserts the spawn directory is completely EMPTY after every validation
 * failure, not just "no db.sqlite" — that would miss a stray sidecar file.
 */

// A file URL, not a bare `tsx` specifier: children run with `cwd: tmpDir`, where `--import`
// could not resolve the package.
const TSX_LOADER = new URL('../../node_modules/tsx/dist/loader.mjs', import.meta.url).href;
const SERVER_ENTRY = fileURLToPath(new URL('../../src/server.ts', import.meta.url));

function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.listen(0, '127.0.0.1', () => {
            const address = srv.address();
            if (address === null || typeof address === 'string') {
                reject(new Error('expected a real address'));
                return;
            }
            const { port } = address;
            srv.close(() => resolve(port));
        });
        srv.on('error', reject);
    });
}

interface SpawnedServer {
    child: ChildProcess;
    exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
    stdout: string[];
    stderr: string[];
}

/**
 * Waits for the server's "listening" startup line, resolving as soon as it appears. Rejects
 * immediately if the child exits first (an EADDRINUSE or a validation throw both fail fast this
 * way, rather than waiting out the full timeout), or after `timeoutMs` with nothing.
 */
function waitForListening(spawned: SpawnedServer, timeoutMs = 15_000): Promise<void> {
    if (spawned.stdout.some((line) => line.includes('listening'))) {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
            settle(() =>
                reject(new Error(`timed out after ${timeoutMs}ms waiting for "listening"`)),
            );
        }, timeoutMs);

        function settle(action: () => void): void {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            spawned.child.off('exit', onExit);
            spawned.child.stdout?.off('data', onData);
            action();
        }

        function onExit(code: number | null, signal: NodeJS.Signals | null): void {
            settle(() =>
                reject(new Error(`child exited before listening (code=${code}, signal=${signal})`)),
            );
        }

        function onData(): void {
            if (spawned.stdout.some((line) => line.includes('listening'))) {
                settle(resolve);
            }
        }

        spawned.child.on('exit', onExit);
        spawned.child.stdout?.on('data', onData);
    });
}

describe('server entrypoint spawn tests', () => {
    let tmpDir: string | undefined;
    const activeChildren: ChildProcess[] = [];

    function spawnServer(env: NodeJS.ProcessEnv): SpawnedServer {
        if (tmpDir === undefined) {
            throw new Error('spawnServer called before tmpDir was set up');
        }
        const child = spawn(process.execPath, ['--import', TSX_LOADER, SERVER_ENTRY], {
            cwd: tmpDir, // any stray relative-path file a bug might create lands in tmpDir
            env: {
                ...process.env,
                ENSEMBLE_AUTH_IP_SECRET: 'test-only-secret-at-least-32-bytes-long',
                ...env,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        activeChildren.push(child);
        const stdout: string[] = [];
        const stderr: string[] = [];
        child.stdout?.on('data', (d) => stdout.push(d.toString('utf8')));
        child.stderr?.on('data', (d) => stderr.push(d.toString('utf8')));
        const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
            (resolve) => {
                child.on('exit', (code, signal) => resolve({ code, signal }));
            },
        );
        return { child, exit, stdout, stderr };
    }

    afterEach(async () => {
        // Kill anything still running (e.g. an assertion threw before this test cleaned up its
        // own child) before removing the temp dir — never leak a smoke-test server.
        await Promise.all(
            activeChildren.map((child) => {
                if (child.exitCode !== null || child.signalCode !== null) {
                    return Promise.resolve();
                }
                return new Promise<void>((resolve) => {
                    child.once('exit', () => resolve());
                    child.kill('SIGKILL');
                });
            }),
        );
        activeChildren.length = 0;

        if (tmpDir !== undefined) {
            rmSync(tmpDir, { recursive: true, force: true });
            tmpDir = undefined;
        }
    });

    interface BadEnvCase {
        name: string;
        envOverride: Record<string, string>;
        expectedStderrContains: string;
    }

    const BAD_ENV_CASES: BadEnvCase[] = [
        {
            name: 'short IP secret',
            envOverride: { ENSEMBLE_AUTH_IP_SECRET: 'short' },
            expectedStderrContains: 'secret',
        },
        {
            name: 'unbound trusted header',
            envOverride: { ENSEMBLE_AUTH_IP_HEADER: 'cf-connecting-ip' },
            expectedStderrContains: 'configured together',
        },
        {
            name: 'non-canonical ENSEMBLE_ORIGIN (trailing slash)',
            envOverride: { ENSEMBLE_ORIGIN: 'http://localhost:5173/' },
            expectedStderrContains: 'canonical',
        },
        { name: "PORT=''", envOverride: { PORT: '' }, expectedStderrContains: 'PORT' },
        { name: "PORT='0'", envOverride: { PORT: '0' }, expectedStderrContains: 'PORT' },
        { name: "PORT='0x50'", envOverride: { PORT: '0x50' }, expectedStderrContains: 'PORT' },
        { name: "PORT='70000'", envOverride: { PORT: '70000' }, expectedStderrContains: 'PORT' },
        { name: "HOST=''", envOverride: { HOST: '' }, expectedStderrContains: 'HOST' },
        {
            name: "ENSEMBLE_DB_PATH=':memory:'",
            envOverride: { ENSEMBLE_DB_PATH: ':memory:' },
            expectedStderrContains: 'ENSEMBLE_DB_PATH',
        },
        {
            name: "ENSEMBLE_DB_PATH='file::memory:'",
            envOverride: { ENSEMBLE_DB_PATH: 'file::memory:' },
            expectedStderrContains: 'ENSEMBLE_DB_PATH',
        },
        {
            name: "ENSEMBLE_DB_PATH='file:x.db?mode=memory'",
            envOverride: { ENSEMBLE_DB_PATH: 'file:x.db?mode=memory' },
            expectedStderrContains: 'ENSEMBLE_DB_PATH',
        },
    ];

    it.each(BAD_ENV_CASES)(
        'fails loudly and creates nothing in the spawn dir: $name',
        async ({ envOverride, expectedStderrContains }) => {
            tmpDir = mkdtempSync(join(tmpdir(), 'ensemble-v2-api-spawn-'));
            // A valid baseline, overridden by exactly the one bad field under test. Non-DB-path
            // cases get a real file dbPath INSIDE tmpDir, so a validation-order regression (the
            // DB opening before PORT/HOST is checked) would leave a file here to catch.
            const baseline: Record<string, string> = {
                ENSEMBLE_RP_ID: 'localhost',
                ENSEMBLE_RP_NAME: 'Test',
                ENSEMBLE_ORIGIN: 'http://localhost:5173',
                ENSEMBLE_DB_PATH: join(tmpDir, 'db.sqlite'),
                PORT: String(await getFreePort()),
                HOST: '127.0.0.1',
            };

            const { exit, stderr } = spawnServer({ ...baseline, ...envOverride });

            const result = await exit;
            expect(result.code).not.toBe(0);
            expect(stderr.join('')).toContain(expectedStderrContains);
            // Empty, not just "no db.sqlite" — this also catches a stray -wal/-shm sidecar, or
            // any other file a validation-order regression might have created first.
            expect(readdirSync(tmpDir)).toEqual([]);
        },
        20_000,
    );

    it('starts with valid config, and exits 0 on SIGTERM after cleanly closing the DB (WAL file gone)', async () => {
        tmpDir = mkdtempSync(join(tmpdir(), 'ensemble-v2-api-spawn-'));
        const dbPath = join(tmpDir, 'db.sqlite');
        const port = await getFreePort();

        const spawned = spawnServer({
            ENSEMBLE_RP_ID: 'localhost',
            ENSEMBLE_RP_NAME: 'Test',
            ENSEMBLE_ORIGIN: 'http://localhost:5173',
            ENSEMBLE_DB_PATH: dbPath,
            PORT: String(port),
            HOST: '127.0.0.1',
        });

        await waitForListening(spawned);
        expect(existsSync(dbPath)).toBe(true);
        // WAL mode leaves a `-wal` sidecar while the connection is open (verified: writing
        // through migrations produces one at this point) — its presence here is what makes
        // "gone after SIGTERM" below a real assertion, not a vacuous one.
        expect(existsSync(`${dbPath}-wal`)).toBe(true);

        spawned.child.kill('SIGTERM');
        const result = await spawned.exit;
        expect(result.code).toBe(0);
        // A clean `db.close()` checkpoints and removes the last connection's `-wal` file —
        // verified against the installed node:sqlite directly. If shutdown() skipped
        // `db.close()` (mutant N1), this file would still be here.
        expect(existsSync(`${dbPath}-wal`)).toBe(false);
    }, 20_000);
});
