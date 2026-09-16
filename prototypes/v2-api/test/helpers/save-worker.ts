/**
 * One Save, in its own OS process, against a shared database file (#1203).
 *
 * `node:sqlite` is synchronous, so two connections inside ONE process can never interleave
 * mid-transaction — a same-process "concurrency" test proves nothing about locking. Each racer
 * has to be a real process with its own `DatabaseSync` handle on the same file.
 *
 * Synchronization is an explicit two-file barrier, never a sleep: the worker opens the database,
 * warms the connection, writes its READY file, and only then spins on the GATE file the parent
 * creates once every worker is ready. So the racers are all loaded, connected and parked at the
 * same instruction before any of them starts, which is what makes the race tight enough to be
 * worth running — and deterministic in what it asserts, because the invariants hold whoever wins.
 *
 * Spawned as `node --import tsx` rather than the `tsx` CLI: the CLI is a wrapper process, so a
 * signal lands on the wrapper and can orphan the real child.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { openDatabase } from '../../src/db/connection.js';
import { commitSave, type SaveCommand } from '../../src/db/save.js';

const [dbPath, readyPath, gatePath, payload] = process.argv.slice(2);
const command = JSON.parse(payload) as SaveCommand;
const db = openDatabase(dbPath);

// Touch the schema before signalling ready so first-statement setup is not part of the race.
db.prepare('SELECT COUNT(*) AS n FROM documents').get();
writeFileSync(readyPath, 'ready');

// Bounded spin. A deadline rather than `while (true)` so a parent that dies never leaves a
// process burning a core; the parent's own timeout would otherwise be the only backstop.
const deadline = Date.now() + 30_000;
while (!existsSync(gatePath)) {
    if (Date.now() > deadline) {
        process.stdout.write(JSON.stringify({ ok: false, error: 'gate never opened' }));
        process.exit(1);
    }
}

try {
    process.stdout.write(JSON.stringify({ ok: true, outcome: commitSave(db, command) }));
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
