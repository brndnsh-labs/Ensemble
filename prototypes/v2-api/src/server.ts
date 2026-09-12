import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createWebAuthnConfig } from './auth/config.js';
import { openDatabase } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { createApp } from './http/app.js';
import { type ClientIdentityOptions, createClientIdentity } from './http/client-identity.js';

/**
 * The one file in this service that reads `process.env` (#1189 decision 7). Every other module
 * takes its configuration and database handle as arguments — see `src/http/app.ts`'s
 * `createApp({ db, config })` and `src/auth/config.ts`'s `createWebAuthnConfig`.
 *
 * `createWebAuthnConfig` fails loudly (throws synchronously) on a non-canonical origin, a
 * mismatched `rpId`, or a non-`https:`/non-`http://localhost` origin — this file does not catch
 * that throw, so a misconfigured deployment refuses to start rather than serving broken
 * ceremonies with no hint at the cause. Every other env var this file reads gets the same
 * fail-loud treatment below — an empty or malformed value must throw before `openDatabase` or
 * `serve` ever run, not silently fall back to a value nobody chose (an empty `PORT` binding a
 * random port, an empty `HOST` binding nothing, an empty or `:memory:` `ENSEMBLE_DB_PATH`
 * silently discarding every session on restart).
 *
 * **Every env value is read and validated as a plain value FIRST** — `config`, `dbPath`, `port`,
 * `host`, all before `openDatabase` is ever called (P2-1 review finding: the earlier version
 * opened and migrated the database, THEN validated `PORT`/`HOST`, so a bad `PORT` still left a
 * migrated `db.sqlite` — plus its `-wal`/`-shm` siblings — on disk before the process crashed).
 * Reordering so every read-and-throw happens before the first filesystem write is what makes a
 * failed startup leave nothing behind.
 *
 * Migrate-on-start is acceptable only because no persistent database exists yet for this service
 * (decision 7) — a later stage adds a backup-before-migrate step ahead of a real deployment.
 */

function readRequiredEnv(name: string): string {
    const value = process.env[name];
    if (value === undefined || value.trim().length === 0) {
        throw new Error(`${name} must be set`);
    }
    return value;
}

function readPort(): number {
    const raw = process.env.PORT;
    if (raw === undefined) {
        return 8080;
    }
    // Exactly one or more ASCII digits, nothing else — no leading/trailing whitespace, sign,
    // decimal point, exponent or hex/octal prefix. `Number()` alone would accept all of those
    // (`Number('0x50')` is 80, `Number('1e3')` is 1000, `Number(' 18312 ')` is 18312), silently
    // reinterpreting a typo'd PORT as some other valid-looking number instead of rejecting it.
    if (!/^\d+$/.test(raw)) {
        throw new Error(
            `PORT must consist only of decimal digits (no sign, decimal point, exponent, hex ` +
                `prefix, or surrounding whitespace), got ${JSON.stringify(raw)}`,
        );
    }
    const port = Number(raw);
    if (port < 1 || port > 65535) {
        throw new Error(`PORT must be an integer in [1, 65535], got ${JSON.stringify(raw)}`);
    }
    return port;
}

function readHost(): string {
    const raw = process.env.HOST;
    if (raw === undefined) {
        return '0.0.0.0';
    }
    if (raw.trim().length === 0) {
        throw new Error('HOST must not be empty when set');
    }
    return raw;
}

function readDbPath(): string {
    const path = readRequiredEnv('ENSEMBLE_DB_PATH');
    // `node:sqlite` honors SQLite's URI-filename syntax, so `:memory:` is not the only way to
    // get an in-memory (never-persisted, WAL-mode-has-no-effect-on) database: `file::memory:`
    // and `file:x.db?mode=memory` (any `file:`-prefixed URI, really — the `mode=memory` query
    // param is just one of several ways a `file:` URI can end up in-memory or otherwise not a
    // plain path) both open one too. Rejecting the whole `file:` prefix, not just those two
    // specific spellings, is what actually closes this off rather than playing whack-a-mole with
    // SQLite's URI syntax.
    if (path === ':memory:' || /^file:/i.test(path)) {
        throw new Error(
            `ENSEMBLE_DB_PATH must be a plain filesystem path, not ":memory:" or a "file:" URI ` +
                `(node:sqlite honors SQLite's URI filenames, and several of those spellings are ` +
                `in-memory databases too) — got ${JSON.stringify(path)}. WAL mode has no effect ` +
                'on an in-memory database, and every session/credential would vanish on restart.',
        );
    }
    return path;
}

const config = createWebAuthnConfig({
    rpId: readRequiredEnv('ENSEMBLE_RP_ID'),
    rpName: readRequiredEnv('ENSEMBLE_RP_NAME'),
    origin: readRequiredEnv('ENSEMBLE_ORIGIN'),
});
const dbPath = readDbPath();
const port = readPort();
const host = readHost();
const clientIdentity: ClientIdentityOptions = {
    secret: readRequiredEnv('ENSEMBLE_AUTH_IP_SECRET'),
    header: process.env.ENSEMBLE_AUTH_IP_HEADER,
    trustedProxyAddresses: process.env.ENSEMBLE_AUTH_TRUSTED_PROXY_ADDRESSES?.split(','),
};
// Fail before database creation. No default Cloudflare/XFF choice: the current static route
// does NOT sanitize direct-origin spoofing; see the #1192 threat-model evidence.
createClientIdentity(clientIdentity);

// Nothing above this line touches the filesystem or the network — every env value is validated
// first. Only past this point does the process open (and, on failure, potentially leave behind)
// a database file.
const db = openDatabase(dbPath);
// fileURLToPath, not `.pathname`: a raw URL pathname percent-encodes characters like spaces
// (`%20`), which readdirSync/readFileSync would then try to open literally rather than decoding.
runMigrations(db, fileURLToPath(new URL('../migrations', import.meta.url)));

const app = createApp({ db, config, clientIdentity });

// This service's one intended startup log line. `noConsole` (biome.json) is scoped to
// `public/**` only, so it does not apply here.
const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
    console.log(
        `ensemble-v2-api listening on http://${host}:${info.port} (origin: ${config.origin})`,
    );
});

function shutdown(): void {
    server.close(() => {
        db.close();
        process.exit(0);
    });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
