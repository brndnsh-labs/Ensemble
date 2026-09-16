import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { readDocument, readOwnerUsage, readReceipt } from '../../src/db/documents.js';
import type { SaveCommand, SaveDependencies, SaveOutcome } from '../../src/db/save.js';
import type { SaveWorkerOptions } from '../helpers/save-worker.js';
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
type QuotaExceeded = Extract<SaveOutcome, { kind: 'quota_exceeded' }>;

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

interface RaceOptions {
    pauseAtMint?: boolean;
    /** Lowered per-owner caps for every racer, so a cap can be reached at all (#1247). */
    caps?: Pick<SaveDependencies, 'maxDocumentsPerOwner' | 'maxBytesPerOwner'>;
}

function spawnWorker(
    dbPath: string,
    command: SaveCommand,
    dir: string,
    index: number,
    { pauseAtMint = false, caps }: RaceOptions = {},
): Worker {
    const ready = join(dir, `ready-${index}`);
    const paused = join(dir, `paused-${index}`);
    const release = join(dir, `release-${index}`);
    const options: SaveWorkerOptions = {
        dbPath,
        readyPath: ready,
        gatePath: join(dir, 'GO'),
        command,
        caps,
        pause: pauseAtMint ? { pausedPath: paused, releasePath: release } : undefined,
    };
    const child = spawn(process.execPath, ['--import', 'tsx', WORKER, JSON.stringify(options)], {
        stdio: ['ignore', 'pipe', 'pipe'],
    });
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
async function race(
    dbPath: string,
    commands: SaveCommand[],
    options: RaceOptions = {},
): Promise<WorkerResult[]> {
    const dir = mkdtempSync(join(tmpdir(), 'ensemble-save-race-'));
    let workers: Worker[] = [];
    try {
        workers = commands.map((command, index) =>
            spawnWorker(dbPath, command, dir, index, options),
        );
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

/**
 * Two racers, released from the same barrier but SEQUENCED by hand once they are inside.
 *
 * Every worker is started with `pauseAtMint`, which stops it at `mintRevision` — called after
 * the receipt/document/tombstone/usage reads and before the first write, i.e. exactly when a
 * transaction holds nothing but a read snapshot. The parent releases whichever racer got there
 * first, waits for it to COMMIT, and only then releases the other. So the interleaving under
 * test happens whether or not the machine had a spare core at the moment of the race, which the
 * wall-clock proofs above cannot promise (see this file's header).
 *
 * Under `BEGIN IMMEDIATE` only one racer is inside the transaction at all, so the second never
 * reaches the pause: it waits for the write lock, then reads the state the winner committed.
 * Its release file is written anyway — an unread file, not a missed step. Under a deferred
 * `BEGIN` both get a read snapshot, both pause, and the second's write then has to upgrade a
 * stale snapshot, which fails. Which racer wins is still the race's call; the assertions are
 * invariants either way.
 */
async function raceSequenced(
    dbPath: string,
    commands: SaveCommand[],
    options: RaceOptions = {},
): Promise<WorkerResult[]> {
    const dir = mkdtempSync(join(tmpdir(), 'ensemble-save-sequenced-'));
    let workers: Worker[] = [];
    try {
        workers = commands.map((command, index) =>
            spawnWorker(dbPath, command, dir, index, { ...options, pauseAtMint: true }),
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
        // A bounded grace for the other to reach the same point. A TIMEOUT, not a race: if it
        // never pauses that is the correct `BEGIN IMMEDIATE` behaviour, and every caller's
        // assertions hold either way.
        const grace = Date.now() + 500;
        while (!existsSync(workers[1 - firstIndex].paused as string) && Date.now() < grace) {
            await new Promise((resolve) => setTimeout(resolve, 5));
        }

        writeFileSync(workers[firstIndex].release as string, 'go');
        await workers[firstIndex].finished;
        writeFileSync(workers[1 - firstIndex].release as string, 'go');
        return await Promise.all(workers.map((worker) => worker.finished));
    } finally {
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
     * can deny them: measured on two loaded cores the racers enter ~3-8ms apart while each
     * transaction takes ~0.3ms, so they stop overlapping and their power to catch a locking bug
     * drops. `raceSequenced` removes that dependency — see its doc comment for the mechanism.
     * Measured by #1246's review on two loaded cores: this catches a deferred `BEGIN` 6/6 where
     * the wall-clock proofs caught it 8/12. Do not delete either kind as redundant.
     */
    it('sequenced inside the transaction: the second writer cannot commit on a stale snapshot', async () => {
        const { db, path } = setUp();
        const [seed] = await race(path, [baseCommand()]);
        const base = (seed.outcome as Committed).revision;

        const results = await raceSequenced(
            path,
            ['a', 'b'].map((tag) =>
                baseCommand({
                    operationId: `op-${tag}`,
                    expectedRevision: base,
                    body: `{"title":"${tag}"}`,
                }),
            ),
        );
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
    }, 60_000);

    /**
     * `src/db/save.ts` step 3 claims the quota is read "inside the same transaction, so a
     * concurrent writer cannot slip past a cap this read just saw". That is a concurrency
     * claim, and an uncontended test cannot prove it: a quota read hoisted OUT of the
     * transaction passes every sequential quota test in save.test.ts and still lets two racers
     * both see room for the last document and both take it. These two proofs are the only
     * thing standing between that mutation and production (#1247).
     *
     * The caps come in through `SaveDependencies` because the shipped numbers are out of a
     * test's reach — 2,000 documents is merely slow to seed, but reaching the byte cap means
     * pushing 256 MiB through the database, so without injection the byte cap could not be
     * raced at all. The defaults themselves are proven in save.test.ts, at full scale.
     *
     * What is asserted is the invariant, never who won: exactly one racer commits, the rest are
     * refused, and the owner's final usage is AT the cap rather than one past it. "One past it"
     * is precisely the damage a hoisted read does, and no rerun can make it look like a flake.
     */
    describe('the storage quota under concurrency (#1247)', () => {
        it('four racers for the last document slot: one commits, the count stops at the cap', async () => {
            const { db, path } = setUp();
            // One document already stored against a cap of two: exactly one slot is left, so
            // the count landing on 3 means two racers were both told the slot was theirs.
            db.prepare(
                'INSERT INTO documents (owner_id, document_id, revision, body, updated_at)' +
                    " VALUES ('owner-a', 'seed', 'seed-rev', '{}', 1)",
            ).run();

            const results = await race(
                path,
                ['a', 'b', 'c', 'd'].map((tag) =>
                    baseCommand({
                        documentId: `doc-${tag}`,
                        operationId: `op-${tag}`,
                        body: `{"title":"${tag}"}`,
                    }),
                ),
                { caps: { maxDocumentsPerOwner: 2 } },
            );
            for (const result of results) {
                expect(result.error).toBeUndefined();
            }

            const kinds = results.map((result) => result.outcome?.kind);
            expect(kinds.filter((kind) => kind === 'committed')).toHaveLength(1);
            expect(kinds.filter((kind) => kind === 'quota_exceeded')).toHaveLength(3);
            for (const result of results) {
                if (result.outcome?.kind !== 'quota_exceeded') {
                    continue;
                }
                const refused = result.outcome as QuotaExceeded;
                expect(refused.limit).toBe('documents');
                expect(refused.cap).toBe(2);
                // A refusal reports the owner's own usage, and a refusal only happens at or
                // above the cap — never a number that would tell the caller a slot was free.
                expect(refused.usage).toBeGreaterThanOrEqual(2);
            }

            expect(readOwnerUsage(db, 'owner-a').documents).toBe(2);
            expect(countRows(db, 'documents')).toBe(2);
            // Three refusals wrote nothing at all, receipts included: a refused save must stay
            // retryable once the owner makes room.
            expect(countRows(db, 'receipts')).toBe(1);
        }, 60_000);

        it('sequenced at the byte cap: the second racer sees the first one spend the headroom', async () => {
            const { db, path } = setUp();
            // 200 bytes of headroom and two 120-byte bodies: either one fits, both do not.
            // Sequenced rather than wall-clock because the whole question is what the SECOND
            // racer's usage read sees, and that is what sequencing pins down — the first is
            // held inside its transaction, past its own quota read, until the parent lets go.
            const body = `{"t":"${'x'.repeat(112)}"}`;
            expect(Buffer.byteLength(body, 'utf8')).toBe(120);

            const results = await raceSequenced(
                path,
                ['a', 'b'].map((tag) =>
                    baseCommand({ documentId: `doc-${tag}`, operationId: `op-${tag}`, body }),
                ),
                { caps: { maxBytesPerOwner: 200 } },
            );
            for (const result of results) {
                // Two transactions both holding a stale read snapshot surface as "database is
                // locked" on the second one's write, never as a second commit.
                expect(result.error).toBeUndefined();
            }

            const kinds = results.map((result) => result.outcome?.kind);
            expect(kinds.filter((kind) => kind === 'committed')).toHaveLength(1);
            expect(kinds.filter((kind) => kind === 'quota_exceeded')).toHaveLength(1);

            const refused = results[kinds.indexOf('quota_exceeded')].outcome as QuotaExceeded;
            expect(refused).toEqual({
                kind: 'quota_exceeded',
                limit: 'bytes',
                usage: 120,
                cap: 200,
            });
            // The cap held: 120 stored, not 240. This is the assertion a hoisted quota read
            // fails, and it fails by exactly one document every time.
            expect(readOwnerUsage(db, 'owner-a').bytes).toBe(120);
            expect(countRows(db, 'documents')).toBe(1);
            expect(countRows(db, 'receipts')).toBe(1);
        }, 60_000);
    });
});
