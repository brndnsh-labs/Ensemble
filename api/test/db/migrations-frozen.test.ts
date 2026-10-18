import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

/**
 * The sha256 of every migration already applied in production. `runMigrations` records each
 * file's hash and refuses to start if a recorded file's bytes change, so editing one (even a
 * comment) makes the deployed API exit on boot and the release roll back. The #1745 folder rename
 * did exactly that through a path in a comment. A new migration is added here when it ships;
 * an existing entry never changes.
 */
const SHIPPED: Record<string, string> = {
    '0001_init.sql': '526feed1fbb2a9da20eb7f2d7bc0dff6d949ab90245f8143d70fc5700540a941',
    '0002_challenge_ceremony_hash.sql':
        '9a96e11cbf786bb7ed6ac2ffcce26c674093c625833d832943c18bf1e4cd73dd',
    '0003_session_token_hash.sql':
        '48fe32372200552331d9765177819aca5a607a359a5badb5c44ce49c96ae8dc8',
    '0004_passkey_management_bindings.sql':
        '86aefbabbf01fb8c232b50733e6f771fd9d0d554437c61239baa91dcea985cbb',
    '0005_recovery_session_and_code_state.sql':
        '2b8099226a570c24435d9c01053a2717bf180e823502ee25e149cce371120dda',
    '0006_auth_security_events.sql':
        '76983eb046b03fbad24aae91f14097f648fee2107ba149333ece24504decbe89',
    '0007_owner_scoped_documents.sql':
        '5d518555a8730d3fa98db42cbd42b4614e1987155852b490b6fcaeefc9d61a87',
};

describe('shipped migrations', () => {
    it('keep the exact bytes production recorded', () => {
        for (const [name, hash] of Object.entries(SHIPPED)) {
            const sql = readFileSync(`${MIGRATIONS_DIR}/${name}`, 'utf8');
            expect(createHash('sha256').update(sql, 'utf8').digest('hex'), name).toBe(hash);
        }
    });

    it('are all listed here, so a new one is pinned when it ships', () => {
        const onDisk = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql'));
        expect(onDisk.sort()).toEqual(Object.keys(SHIPPED).sort());
    });
});
