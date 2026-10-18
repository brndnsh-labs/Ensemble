import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/db/connection.js';

describe('openDatabase', () => {
    let dir: string;

    afterEach(() => {
        if (dir) {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('reports journal_mode=wal, a nonzero busy_timeout, and foreign_keys=1 on a fresh on-disk database', () => {
        dir = mkdtempSync(join(tmpdir(), 'ensemble-v2-api-connection-'));
        const path = join(dir, 'fresh.db');
        const db = openDatabase(path);

        try {
            const journalMode = db.prepare('PRAGMA journal_mode').get() as unknown as {
                journal_mode: string;
            };
            const busyTimeout = db.prepare('PRAGMA busy_timeout').get() as unknown as {
                timeout: number;
            };
            const foreignKeys = db.prepare('PRAGMA foreign_keys').get() as unknown as {
                foreign_keys: number;
            };

            expect(journalMode.journal_mode).toBe('wal');
            expect(busyTimeout.timeout).toBeGreaterThan(0);
            expect(foreignKeys.foreign_keys).toBe(1);
        } finally {
            db.close();
        }
    });

    it('respects an explicit busyTimeoutMs override', () => {
        dir = mkdtempSync(join(tmpdir(), 'ensemble-v2-api-connection-'));
        const path = join(dir, 'custom-timeout.db');
        const db = openDatabase(path, { busyTimeoutMs: 1234 });

        try {
            const busyTimeout = db.prepare('PRAGMA busy_timeout').get() as unknown as {
                timeout: number;
            };
            expect(busyTimeout.timeout).toBe(1234);
        } finally {
            db.close();
        }
    });

    it('rejects a negative or non-integer busyTimeoutMs rather than silently truncating it', () => {
        dir = mkdtempSync(join(tmpdir(), 'ensemble-v2-api-connection-'));
        const path = join(dir, 'invalid-timeout.db');

        expect(() => openDatabase(path, { busyTimeoutMs: -1 })).toThrow();
        expect(() => openDatabase(path, { busyTimeoutMs: 1.5 })).toThrow();
    });

    it('WAL mode produces the -wal sidecar file once a write has happened, proving WAL is real, not just reported', () => {
        dir = mkdtempSync(join(tmpdir(), 'ensemble-v2-api-connection-'));
        const path = join(dir, 'wal-sidecar.db');
        const db = openDatabase(path);

        try {
            db.exec('CREATE TABLE t (id TEXT)');
            db.exec("INSERT INTO t (id) VALUES ('x')");
            expect(existsSync(`${path}-wal`)).toBe(true);
        } finally {
            db.close();
        }
    });
});
