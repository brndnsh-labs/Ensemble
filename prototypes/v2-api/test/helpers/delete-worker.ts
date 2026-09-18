/**
 * One explicit delete, in its own OS process, against a shared database file (#1260).
 *
 * The sibling of `save-worker.ts`, and for the same reason: `node:sqlite` is synchronous, so two
 * connections inside ONE process serialize on the interpreter and can never interleave
 * mid-transaction — a same-process "concurrency" test would pass whether or not
 * `BEGIN IMMEDIATE` were there at all.
 *
 * Synchronization is the same explicit two-file barrier, never a sleep: the worker opens the
 * database, warms the connection, writes its READY file, and only then spins on the GATE file the
 * parent creates once every worker is ready.
 *
 * There is no `pause` seam here, unlike the Save worker. That one hooks `mintRevision`, which is
 * an injectable production dependency that happens to be called between the reads and the first
 * write; `commitDelete` mints nothing (a tombstone carries the revision the document died at), so
 * the equivalent seam would be a pause hook existing in production code purely for a test. It is
 * not needed: every assertion the delete race makes is an invariant that holds whether or not the
 * racers overlap — if they do not, the race degrades to a sequence, and a sequence of deletes must
 * produce exactly the same one-tombstone/one-performer outcome.
 *
 * Spawned as `node --import tsx` rather than the `tsx` CLI: the CLI is a wrapper process, so a
 * signal lands on the wrapper and can orphan the real child.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { openDatabase } from '../../src/db/connection.js';
import { commitDelete, type DeleteCommand } from '../../src/db/document-delete.js';

export interface DeleteWorkerOptions {
    dbPath: string;
    /** Written once this worker is connected and parked, read by the parent's barrier. */
    readyPath: string;
    /** Created by the parent to release every worker at once. */
    gatePath: string;
    command: DeleteCommand;
}

const options = JSON.parse(process.argv[2]) as DeleteWorkerOptions;
const db = openDatabase(options.dbPath);

/** Spin until `path` appears. Bounded so a dead parent never leaves a core burning. */
function waitFor(path: string, label: string): void {
    const deadline = Date.now() + 30_000;
    while (!existsSync(path)) {
        if (Date.now() > deadline) {
            process.stdout.write(JSON.stringify({ ok: false, error: `${label} never opened` }));
            process.exit(1);
        }
    }
}

// Touch the schema before signalling ready so first-statement setup is not part of the race.
db.prepare('SELECT COUNT(*) AS n FROM documents').get();
writeFileSync(options.readyPath, 'ready');
waitFor(options.gatePath, 'gate');

try {
    process.stdout.write(JSON.stringify({ ok: true, outcome: commitDelete(db, options.command) }));
} catch (error) {
    process.stdout.write(
        JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        }),
    );
} finally {
    db.close();
}
