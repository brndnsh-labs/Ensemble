import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { readDocument, readReceipt } from '../../src/db/documents.js';
import type { SaveCommand, SaveOutcome } from '../../src/db/save.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

/**
 * Stage 3 story 3 (#1203): the Explicit Save protocol's required failure proofs, run against a
 * real WAL database by real concurrent PROCESSES.
 *
 * Why processes: `node:sqlite` is synchronous, so two connections inside one process serialize
 * on the interpreter and can never interleave mid-transaction. A same-process "concurrency"
 * test would pass whether or not `BEGIN IMMEDIATE` were there at all, which makes it worse than
 * no test — see `test/helpers/save-worker.ts` for the barrier that makes the race tight.
 *
 * Why these assertions are not coin flips: every proof asserts an INVARIANT that holds whichever
 * racer wins — "exactly one write happened", "the loser is handed the winner's version", "no
 * receipt exists for the loser" — never "process A won". The race decides who; the protocol
 * decides what, and it is the what that is asserted.
 *
 * The wall-clock proofs and the SEQUENCED proof cover each other's weaknesses. The wall-clock
 * ones race for real but need the machine to have cores to spare: measured on two loaded cores,
 * the racers enter ~3-8ms apart while each transaction takes ~0.3ms, so they stop overlapping
 * and their power to catch a locking bug drops. The sequenced proof pauses a racer inside the
 * transaction and is therefore independent of how busy the box is.
 */

const WORKER = fileURLToPath(new URL('../helpers/save-worker.ts', import.meta.url));

interface WorkerResult {
    ok: boolean;
    outcome?: SaveOutcome;
    error?: string;
}

type Committed = Extract<SaveOutcome, { kind: 'committed' }>;
type Conflict = Extract<SaveOutcome, { kind: 'conflict' }>;

function baseCommand(overrides: Partial<SaveCommand> = {}): SaveCommand {
    return {
        ownerId: 'owner-a',
        documentId: 'doc-1',
        operationId: 'op-1',
        digest: 'sha256:aaa',
        expectedRevision: null,
        body: '{"title":"one"}',
        now: 1000,
        ...overrides,
    };
}

interface Worker {
    child: ChildProcess;
    ready: string;
    paused?: string;
    release?: string;
    finished: Promise<WorkerResult>;
}

function spawnWorker(
    dbPath: string,
    command: SaveCommand,
    dir: string,
    index: number,
    { pauseAtMint = false } = {},
): Worker {
    const ready = join(dir, `ready-${index}`);
    const paused = join(dir, `paused-${index}`);
    const release = join(dir, `release-${index}`);
    const child = spawn(
        process.execPath,
        [
            '--import',
            'tsx',
            WORKER,
            dbPath,
            ready,
            join(dir, 'GO'),
            JSON.stringify(command),
            ...(pauseAtMint ? [paused, release] : []),
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
    });
    const finished = new Promise<WorkerResult>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', () => {
            try {
                resolve(JSON.parse(stdout) as WorkerResult);
            } catch {
                reject(new Error(`worker ${index} produced no result.\n${stdout}\n${stderr}`));
            }
        });
    });
    // A worker that never boots rejects while the parent is still polling for READY, which
    // would otherwise surface as an unhandled rejection and bury the real cause behind
    // "workers never became ready". Keep the reason, and keep the promise from going unhandled.
    let failure: Error | undefined;
    const observed = finished.catch((error: Error) => {
        failure = error;
        throw error;
    });
    observed.catch(() => {});
    return {
        child,
        ready,
        paused,
        release,
        finished: observed,
        get boot() {
            return failure;
        },
    } as Worker & { boot?: Error };
}

/** Poll until `done()` or the deadline, surfacing a worker's boot failure rather than a timeout. */
async function waitUntil(done: () => boolean, workers: Worker[], what: string): Promise<void> {
    const deadline = Date.now() + 30_000;
    while (!done()) {
        const failed = workers.find((worker) => (worker as Worker & { boot?: Error }).boot);
        if (failed) {
            throw (failed as Worker & { boot?: Error }).boot;
        }
        if (Date.now() > deadline) {
            throw new Error(`workers never ${what}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

/**
 * Run every command at once, each in its own process, all released from one barrier.
 * Results come back in the order the commands were given.
 */
async function race(dbPath: string, commands: SaveCommand[]): Promise<WorkerResult[]> {
    const dir = mkdtempSync(join(tmpdir(), 'ensemble-save-race-'));
    let workers: Worker[] = [];
    try {
        workers = commands.map((command, index) => spawnWorker(dbPath, command, dir, index));
        // Barrier: hold every racer until all of them are connected and parked on the gate.
        await waitUntil(
            () => workers.every((worker) => existsSync(worker.ready)),
            workers,
            'ready',
        );
        writeFileSync(join(dir, 'GO'), 'go');
        return await Promise.all(workers.map((worker) => worker.finished));
    } finally {
        // On the failure path the surviving workers are spinning on `existsSync`; without this
        // they peg a core each until their own 30s deadline, alongside the rest of the suite.
        for (const worker of workers) {
            worker.child.kill();
        }
        rmSync(dir, { recursive: true, force: true });
    }
}

function countRows(db: TestDatabase['db'], table: string): number {
    return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

describe('Save concurrency and failure proofs on a real database (#1203)', () => {
    let testDb: TestDatabase | undefined;
    afterEach(() => {
        testDb?.cleanup();
        testDb = undefined;
    });

    function setUp() {
        testDb = createTestDatabase();
        testDb.db.exec("INSERT INTO accounts (id, created_at) VALUES ('owner-a', 1)");
        return testDb;
    }

    it('a lost response followed by an identical retry returns the original result, once', async () => {
        const { db, path } = setUp();
        // Two SEQUENTIAL processes, each with a cold connection: the retry has to read the
        // receipt back off the file, so no in-process cache can be what makes this pass.
        const [first] = await race(path, [baseCommand()]);
        expect(first.outcome).toMatchObject({ kind: 'committed', replayed: false });
        const { revision } = first.outcome as Committed;

        const [retry] = await race(path, [baseCommand()]);
        expect(retry.outcome).toEqual({ kind: 'committed', revision, replayed: true });

        expect(countRows(db, 'documents')).toBe(1);
        expect(countRows(db, 'receipts')).toBe(1);
        expect(readDocument(db, 'owner-a', 'doc-1')?.revision).toBe(revision);
    }, 60_000);

    it('four duplicate senders racing one operation id produce exactly one write', async () => {
        const { db, path } = setUp();
        const results = await race(
            path,
            Array.from({ length: 4 }, () => baseCommand()),
        );

        for (const result of results) {
            expect(result.error).toBeUndefined();
            expect(result.outcome).toMatchObject({ kind: 'committed' });
        }
        const outcomes = results.map((result) => result.outcome as Committed);
        // One writer, three replays, all answering the SAME revision. A racer that came back
        // with a conflict, a second revision, or a receipt constraint error would be a real bug
        // in the transaction rather than a flaky test.
        expect(outcomes.filter((outcome) => !outcome.replayed)).toHaveLength(1);
        expect(new Set(outcomes.map((outcome) => outcome.revision)).size).toBe(1);

        expect(countRows(db, 'documents')).toBe(1);
        expect(countRows(db, 'receipts')).toBe(1);
        expect(readDocument(db, 'owner-a', 'doc-1')?.body).toBe('{"title":"one"}');
    }, 60_000);

    it('racing one operation id with DIFFERENT bytes rejects the impostor cleanly', async () => {
        const { db, path } = setUp();
        const results = await race(path, [
            baseCommand({ digest: 'sha256:aaa', body: '{"title":"first"}' }),
            baseCommand({ digest: 'sha256:bbb', body: '{"title":"second"}' }),
        ]);
        for (const result of results) {
            expect(result.error).toBeUndefined();
        }
        // "Different bytes under one id are rejected" has to hold when the two arrive together,
        // not just in sequence. A receipt read taken OUTSIDE the transaction would surface here
        // as a UNIQUE constraint crash rather than this clean rejection.
        const kinds = results.map((result) => result.outcome?.kind);
        expect(kinds.filter((kind) => kind === 'committed')).toHaveLength(1);
        expect(kinds.filter((kind) => kind === 'operation_mismatch')).toHaveLength(1);

        const winnerIndex = kinds.indexOf('committed');
        expect(countRows(db, 'documents')).toBe(1);
        expect(countRows(db, 'receipts')).toBe(1);
        expect(readDocument(db, 'owner-a', 'doc-1')?.body).toBe(
            winnerIndex === 0 ? '{"title":"first"}' : '{"title":"second"}',
        );
    }, 60_000);

    it('four writers from the same base revision: one commits, the rest see the winner', async () => {
        const { db, path } = setUp();
        const [seed] = await race(path, [baseCommand()]);
        const base = (seed.outcome as Committed).revision;

        // Four rather than two on purpose. With a pair, a deferred `BEGIN` sometimes gets away
        // with it — the window where both transactions hold a read snapshot is narrow enough to
        // miss. Four widens it enough to catch the mutation on any machine with cores to spare;
        // the sequenced proof below covers the case where it does not.
        const writers = ['a', 'b', 'c', 'd'];
        const results = await race(
            path,
            writers.map((tag) =>
                baseCommand({
                    operationId: `op-${tag}`,
                    expectedRevision: base,
                    body: `{"title":"${tag}"}`,
                }),
            ),
        );
        for (const result of results) {
            expect(result.error).toBeUndefined();
        }
        const kinds = results.map((result) => result.outcome?.kind);
        expect(kinds.filter((kind) => kind === 'committed')).toHaveLength(1);
        expect(kinds.filter((kind) => kind === 'conflict')).toHaveLength(3);

        const winnerIndex = kinds.indexOf('committed');
        const committed = results[winnerIndex].outcome as Committed;
        const stored = readDocument(db, 'owner-a', 'doc-1');
        expect(stored?.revision).toBe(committed.revision);
        expect(stored?.body).toBe(`{"title":"${writers[winnerIndex]}"}`);

        for (const [index, result] of results.entries()) {
            if (index === winnerIndex) {
                continue;
            }
            // Every loser is handed the CURRENT server version to resolve against — the
            // winner's, not its own stale base — which is what makes stage 5's Keep-both
            // possible. And none of them left a receipt that could replay their bytes later.
            const conflicted = result.outcome as Conflict;
            expect(conflicted.revision).toBe(committed.revision);
            expect(conflicted.remote).toEqual({ revision: committed.revision, body: stored?.body });
            expect(readReceipt(db, 'owner-a', `op-${writers[index]}`)).toBeUndefined();
        }

        expect(countRows(db, 'documents')).toBe(1);
        expect(countRows(db, 'receipts')).toBe(2); // the seed create, plus the one winner
    }, 60_000);

    it('a writer on a stale base loses to a current one', async () => {
        const { db, path } = setUp();
        const [seed] = await race(path, [baseCommand()]);
        const first = (seed.outcome as Committed).revision;
        const [second] = await race(path, [
            baseCommand({ operationId: 'op-2', expectedRevision: first, body: '{"title":"two"}' }),
        ]);
        const current = (second.outcome as Committed).revision;

        // `first` is now two revisions behind, and a revision is never reused, so a stale base
        // can never come to match however the write lock is handed out — one race is enough to
        // assert an invariant that does not depend on ordering.
        const results = await race(path, [
            baseCommand({
                operationId: 'op-stale',
                expectedRevision: first,
                body: '{"t":"stale"}',
            }),
            baseCommand({
                operationId: 'op-live',
                expectedRevision: current,
                body: '{"t":"live"}',
            }),
        ]);
        expect(results[0].outcome?.kind).toBe('conflict');
        expect(results[1].outcome?.kind).toBe('committed');
        expect(readDocument(db, 'owner-a', 'doc-1')?.body).toBe('{"t":"live"}');
        expect(readReceipt(db, 'owner-a', 'op-stale')).toBeUndefined();
        expect(countRows(db, 'documents')).toBe(1);
        expect(countRows(db, 'receipts')).toBe(3); // seed, op-2, op-live — never op-stale
    }, 60_000);

    /**
     * The wall-clock proofs above need the racers to actually overlap, which a loaded machine
     * can deny them. This one does not: it stops a racer INSIDE the transaction, at
     * `mintRevision` — called after the receipt/document/tombstone reads and before the first
     * write, i.e. exactly when a transaction holds nothing but a read snapshot — and lets the
     * parent sequence the interleaving by hand.
     *
     * Under `BEGIN IMMEDIATE` only one racer can be inside the transaction at all, so the second
     * never reaches the pause; it waits for the write lock, then reads the committed state and
     * conflicts. Under a deferred `BEGIN` both get a read snapshot, both pause, and the second's
     * write then has to upgrade a stale snapshot — which fails. Measured by the review on two
     * loaded cores: this catches the mutation 6/6 where the wall-clock proofs caught 8/12.
     *
     * Still symmetric: the race picks which worker pauses first, the harness only sequences from
     * there, and the assertions are the same invariants as everywhere else in this file.
     */
    it('sequenced inside the transaction: the second writer cannot commit on a stale snapshot', async () => {
        const { db, path } = setUp();
        const [seed] = await race(path, [baseCommand()]);
        const base = (seed.outcome as Committed).revision;

        const dir = mkdtempSync(join(tmpdir(), 'ensemble-save-sequenced-'));
        let workers: Worker[] = [];
        try {
            workers = ['a', 'b'].map((tag, index) =>
                spawnWorker(
                    path,
                    baseCommand({
                        operationId: `op-${tag}`,
                        expectedRevision: base,
                        body: `{"title":"${tag}"}`,
                    }),
                    dir,
                    index,
                    { pauseAtMint: true },
                ),
            );
            await waitUntil(
                () => workers.every((worker) => existsSync(worker.ready)),
                workers,
                'ready',
            );
            writeFileSync(join(dir, 'GO'), 'go');

            // Whichever reaches the pause first is the one we release first.
            await waitUntil(
                () => workers.some((worker) => existsSync(worker.paused as string)),
                workers,
                'reached the mint',
            );
            const firstIndex = workers.findIndex((worker) => existsSync(worker.paused as string));
            // A bounded grace for the other to reach the same point. A TIMEOUT, not a race: if
            // it never pauses that is the correct `BEGIN IMMEDIATE` behaviour, and the
            // assertions below hold either way.
            const grace = Date.now() + 500;
            while (!existsSync(workers[1 - firstIndex].paused as string) && Date.now() < grace) {
                await new Promise((resolve) => setTimeout(resolve, 5));
            }

            writeFileSync(workers[firstIndex].release as string, 'go');
            await workers[firstIndex].finished;
            writeFileSync(workers[1 - firstIndex].release as string, 'go');

            const results = await Promise.all(workers.map((worker) => worker.finished));
            for (const result of results) {
                // A stale-snapshot upgrade surfaces as "database is locked", never as a commit.
                expect(result.error).toBeUndefined();
            }
            const kinds = results.map((result) => result.outcome?.kind);
            expect(kinds.filter((kind) => kind === 'committed')).toHaveLength(1);
            expect(kinds.filter((kind) => kind === 'conflict')).toHaveLength(1);

            const winnerIndex = kinds.indexOf('committed');
            const committed = results[winnerIndex].outcome as Committed;
            const conflicted = results[1 - winnerIndex].outcome as Conflict;
            const stored = readDocument(db, 'owner-a', 'doc-1');
            expect(stored?.revision).toBe(committed.revision);
            expect(conflicted.remote).toEqual({ revision: committed.revision, body: stored?.body });
            expect(countRows(db, 'documents')).toBe(1);
            expect(countRows(db, 'receipts')).toBe(2); // the seed create, plus the one winner
        } finally {
            for (const worker of workers) {
                worker.child.kill();
            }
            rmSync(dir, { recursive: true, force: true });
        }
    }, 60_000);
});
