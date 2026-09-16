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
 * With `--pause-at-mint`, the worker additionally stops INSIDE the transaction: `mintRevision` is
 * called after the receipt/document/tombstone reads and before the first write, which is exactly
 * the instant a transaction holds nothing but a read snapshot. Pausing there lets the parent
 * sequence the interleaving by hand instead of hoping the wall clock provides it — see the
 * "sequenced" proof in save-concurrency.test.ts for why that matters on a loaded machine.
 *
 * Spawned as `node --import tsx` rather than the `tsx` CLI: the CLI is a wrapper process, so a
 * signal lands on the wrapper and can orphan the real child.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { openDatabase } from '../../src/db/connection.js';
import { commitSave, type SaveCommand } from '../../src/db/save.js';

const [dbPath, readyPath, gatePath, payload, pausedPath, releasePath] = process.argv.slice(2);
const command = JSON.parse(payload) as SaveCommand;
const db = openDatabase(dbPath);

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
writeFileSync(readyPath, 'ready');
waitFor(gatePath, 'gate');

const dependencies =
    pausedPath === undefined
        ? undefined
        : {
              mintRevision: () => {
                  writeFileSync(pausedPath, 'paused');
                  waitFor(releasePath, 'release');
                  return randomUUID();
              },
          };

try {
    process.stdout.write(
        JSON.stringify({ ok: true, outcome: commitSave(db, command, dependencies) }),
    );
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
