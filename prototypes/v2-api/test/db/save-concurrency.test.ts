import { spawn } from 'node:child_process';
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

/**
 * Run every command at once, each in its own process, all released from one barrier.
 * Results come back in the order the commands were given.
 */
async function race(dbPath: string, commands: SaveCommand[]): Promise<WorkerResult[]> {
    const dir = mkdtempSync(join(tmpdir(), 'ensemble-save-race-'));
    const gate = join(dir, 'GO');
    try {
        const running = commands.map((command, index) => {
            const ready = join(dir, `ready-${index}`);
            const child = spawn(
                process.execPath,
                ['--import', 'tsx', WORKER, dbPath, ready, gate, JSON.stringify(command)],
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
                        reject(
                            new Error(`worker ${index} produced no result.\n${stdout}\n${stderr}`),
                        );
                    }
                });
            });
            return { ready, finished };
        });

        // Barrier: hold every racer until all of them are connected and parked on the gate.
        const deadline = Date.now() + 30_000;
        while (!running.every((worker) => existsSync(worker.ready))) {
            if (Date.now() > deadline) {
                throw new Error('workers never became ready');
            }
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
        writeFileSync(gate, 'go');

        return await Promise.all(running.map((worker) => worker.finished));
    } finally {
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

    it('four writers from the same base revision: one commits, the rest see the winner', async () => {
        const { db, path } = setUp();
        const [seed] = await race(path, [baseCommand()]);
        const base = (seed.outcome as Committed).revision;

        // Four rather than two on purpose. With a pair, a deferred `BEGIN` sometimes gets away
        // with it — the window where both transactions hold a read snapshot is narrow enough to
        // miss. Four racers widen it enough that the mutation is caught every run, which is the
        // difference between a test that guards `BEGIN IMMEDIATE` and one that mostly does.
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

    it('a writer on a stale base loses to a current one whichever order they land in', async () => {
        const { db, path } = setUp();
        const [seed] = await race(path, [baseCommand()]);
        const first = (seed.outcome as Committed).revision;
        const [second] = await race(path, [
            baseCommand({ operationId: 'op-2', expectedRevision: first, body: '{"title":"two"}' }),
        ]);
        const current = (second.outcome as Committed).revision;

        // `first` is now two revisions behind. Racing it against a legitimate update must lose
        // however the write lock happens to be handed out.
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
    }, 60_000);
});
