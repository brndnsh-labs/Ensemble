import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { DeleteCommand, DeleteOutcome } from '../../src/db/document-delete.js';
import { readDocument, readReceipt, readTombstone, writeDocument } from '../../src/db/documents.js';
import type { DeleteWorkerOptions } from '../helpers/delete-worker.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

/**
 * #1260's concurrency proof, run against a real WAL database by real concurrent PROCESSES — the
 * pattern `save-concurrency.test.ts` establishes, for the same reason: `node:sqlite` is
 * synchronous, so two connections inside one process serialize on the interpreter and a
 * same-process "concurrency" test would pass with or without `BEGIN IMMEDIATE`.
 *
 * Why the assertions are not coin flips: each one is an INVARIANT that holds whichever racer wins
 * — "exactly one racer performed the delete", "there is exactly one tombstone", "nobody threw" —
 * never "process A won". The race decides who; the protocol decides what.
 *
 * Unlike the Save file there is no sequenced variant, and that is a deliberate call rather than an
 * omission: the sequenced proofs there exist because Save's quota claim ("a concurrent writer
 * cannot slip past a cap this read just saw") is FALSE under a hoisted read and invisible without
 * overlap, so the overlap has to be guaranteed. Delete's claims survive non-overlap — a sequence
 * of deletes must reach the same single-tombstone state — and the seam that would make a pause
 * possible (`mintRevision`) does not exist here, so manufacturing one would mean adding a
 * test-only hook to production code for a proof that does not need it. What overlap DOES buy is
 * catching a deferred `BEGIN`: two racers both holding a read snapshot make the second one's write
 * fail with a snapshot-upgrade error, which surfaces below as a worker `error`, not a wrong answer.
 */

const WORKER = fileURLToPath(new URL('../helpers/delete-worker.ts', import.meta.url));

interface WorkerResult {
    ok: boolean;
    outcome?: DeleteOutcome;
    error?: string;
}

type Deleted = Extract<DeleteOutcome, { kind: 'deleted' }>;

interface Worker {
    child: ChildProcess;
    ready: string;
    finished: Promise<WorkerResult>;
}

function baseCommand(overrides: Partial<DeleteCommand> = {}): DeleteCommand {
    return {
        ownerId: 'owner-a',
        documentId: 'doc-1',
        operationId: 'op-1',
        digest: 'sha256:aaa',
        expectedRevision: 'rev-1',
        now: 1000,
        ...overrides,
    };
}

function spawnWorker(
    dbPath: string,
    command: DeleteCommand,
    dir: string,
    index: number,
): Worker & { boot?: Error } {
    const ready = join(dir, `ready-${index}`);
    const options: DeleteWorkerOptions = {
        dbPath,
        readyPath: ready,
        gatePath: join(dir, 'GO'),
        command,
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
    // A worker that never boots rejects while the parent is still polling for READY, which would
    // otherwise surface as an unhandled rejection and bury the real cause behind "workers never
    // became ready". Keep the reason, and keep the promise from going unhandled.
    let failure: Error | undefined;
    const observed = finished.catch((error: Error) => {
        failure = error;
        throw error;
    });
    observed.catch(() => {});
    return {
        child,
        ready,
        finished: observed,
        get boot() {
            return failure;
        },
    };
}

/** Poll until `done()` or the deadline, surfacing a worker's boot failure rather than a timeout. */
async function waitUntil(
    done: () => boolean,
    workers: (Worker & { boot?: Error })[],
): Promise<void> {
    const deadline = Date.now() + 30_000;
    while (!done()) {
        const failed = workers.find((worker) => worker.boot);
        if (failed) {
            throw failed.boot;
        }
        if (Date.now() > deadline) {
            throw new Error('workers never became ready');
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

/** Run every command at once, each in its own process, all released from one barrier. */
async function race(dbPath: string, commands: DeleteCommand[]): Promise<WorkerResult[]> {
    const dir = mkdtempSync(join(tmpdir(), 'ensemble-delete-race-'));
    let workers: (Worker & { boot?: Error })[] = [];
    try {
        workers = commands.map((command, index) => spawnWorker(dbPath, command, dir, index));
        // Barrier: hold every racer until all of them are connected and parked on the gate.
        await waitUntil(() => workers.every((worker) => existsSync(worker.ready)), workers);
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

describe('delete concurrency on a real database (#1260)', () => {
    let testDb: TestDatabase | undefined;
    afterEach(() => {
        testDb?.cleanup();
        testDb = undefined;
    });

    /** One committed document at `rev-1`, plus the receipt a real Save would have left. */
    function setUp() {
        testDb = createTestDatabase();
        testDb.db.exec("INSERT INTO accounts (id, created_at) VALUES ('owner-a', 1)");
        writeDocument(testDb.db, 'owner-a', {
            documentId: 'doc-1',
            revision: 'rev-1',
            body: '{"title":"one"}',
            updatedAt: 1,
        });
        return testDb;
    }

    it('four racers on the same revision under DIFFERENT operation ids: one deletes, the rest resolve idempotently', async () => {
        const { db, path } = setUp();
        const tags = ['a', 'b', 'c', 'd'];
        // A distinct `now` per racer is how "exactly one performed the delete" is checked against
        // the DATABASE and not only against the outcomes: the tombstone's `deletedAt` can only be
        // the clock of the racer that actually wrote it.
        const clocks = new Map(tags.map((tag, index) => [tag, 2000 + index]));
        const results = await race(
            path,
            tags.map((tag) =>
                baseCommand({
                    operationId: `op-${tag}`,
                    digest: `sha256:${tag}`,
                    now: clocks.get(tag) as number,
                }),
            ),
        );

        for (const result of results) {
            // A stale-snapshot upgrade (a deferred `BEGIN`) surfaces as "database is locked" here,
            // never as a second delete.
            expect(result.error).toBeUndefined();
            expect(result.outcome).toMatchObject({ kind: 'deleted', revision: 'rev-1' });
        }
        const outcomes = results.map((result) => result.outcome as Deleted);
        // One deleter, three idempotent answers, all agreeing on the revision the id died at.
        expect(outcomes.filter((outcome) => outcome.performed)).toHaveLength(1);
        expect(outcomes.every((outcome) => !outcome.replayed)).toBe(true);
        expect(new Set(outcomes.map((outcome) => outcome.revision)).size).toBe(1);

        expect(readDocument(db, 'owner-a', 'doc-1')).toBeUndefined();
        expect(countRows(db, 'documents')).toBe(0);
        // Exactly one tombstone — not one per racer, and not a constraint error from a second
        // insert. The upsert makes a double write harmless; this asserts there was not one.
        expect(countRows(db, 'tombstones')).toBe(1);
        const winner = tags[outcomes.findIndex((outcome) => outcome.performed)];
        expect(readTombstone(db, 'owner-a', 'doc-1')).toMatchObject({
            revision: 'rev-1',
            deletedAt: clocks.get(winner as string),
        });
        // Only the DELETER's operation id leaves a receipt. `BEGIN IMMEDIATE` fully serializes
        // these four transactions, so the three racers that lose the race always run AFTER the
        // winner commits and see the id already tombstoned — the idempotent-from-a-tombstone path,
        // which writes no receipt (the tombstone's own immutable revision is enough to answer any
        // retry of any of those three requests identically, forever).
        expect(countRows(db, 'receipts')).toBe(1);
        expect(readReceipt(db, 'owner-a', `op-${winner}`)?.resultRevision).toBe('rev-1');
        for (const tag of tags.filter((candidate) => candidate !== winner)) {
            expect(readReceipt(db, 'owner-a', `op-${tag}`)).toBeUndefined();
        }
    }, 60_000);

    it('four duplicate senders racing ONE operation id produce exactly one delete and one receipt', async () => {
        const { db, path } = setUp();
        const results = await race(
            path,
            Array.from({ length: 4 }, () => baseCommand()),
        );

        for (const result of results) {
            expect(result.error).toBeUndefined();
            expect(result.outcome).toMatchObject({ kind: 'deleted', revision: 'rev-1' });
        }
        const outcomes = results.map((result) => result.outcome as Deleted);
        // The duplicate-sender case: one writer, three replays off the one receipt. A racer that
        // came back with a `not_found`, an `operation_mismatch` or a receipt constraint error
        // would be a real bug in the transaction rather than a flaky test.
        expect(outcomes.filter((outcome) => outcome.performed)).toHaveLength(1);
        expect(outcomes.filter((outcome) => outcome.replayed)).toHaveLength(3);

        expect(countRows(db, 'documents')).toBe(0);
        expect(countRows(db, 'tombstones')).toBe(1);
        expect(countRows(db, 'receipts')).toBe(1);
    }, 60_000);
});
