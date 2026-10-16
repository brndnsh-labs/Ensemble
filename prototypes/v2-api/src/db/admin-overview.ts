import type { DatabaseSync } from 'node:sqlite';

/**
 * The operator's read of the whole service (#1717): how many accounts exist against the sign-up
 * cap, how much they store, and a list of them. Read-only by construction — this module runs
 * SELECTs and nothing else — and scoped to nothing, which is why the route in front of it
 * (`http/admin.ts`) is gated by a deploy-config allowlist rather than by anything in the database.
 *
 * It never returns a full account id, a credential id or a document body. An account appears as
 * the first `SHORT_ID_LENGTH` characters of its id (enough to tell a handful apart, not enough to
 * address one), and the caller's own row is marked `you` here, so the page never needs the id.
 */

const SHORT_ID_LENGTH = 8;
/** The list is newest first and stops here; `listTruncated` says when it did. */
export const MAX_ADMIN_ACCOUNT_ROWS = 200;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AdminAccountRow {
    shortId: string;
    joinedAt: number;
    /**
     * The newest standard session's start: `readSession` writes nothing, so a sign-in is the last
     * trace. Expired sessions are swept on every sign-in (`issueSession`), so `null` means "not in
     * the last 30 days" (`SESSION_TTL_MS`), not "never" — registering always mints one.
     */
    lastSignInAt: number | null;
    documents: number;
    bytes: number;
    passkeys: number;
    you: boolean;
}

/**
 * What the stored charts still carry from older formats (#1731) — the evidence for deleting the
 * old-format readers. Chart documents only: a collection (a body with a string `kind`, as
 * `listManifest` reads it) is not a chart, and a deleted document has no `documents` row (it
 * leaves a tombstone), so each live document's current body is counted exactly once.
 */
export interface AdminChartCounts {
    total: number;
    /** Chart count per `schemaVersion`, keyed by the version as text; `unknown` = none/non-integer. */
    bySchemaVersion: Record<string, number>;
    /** Charts carrying at least one of `LEGACY_CHART_PATHS`, or no groove `genre`. */
    withLegacyFields: number;
}

/**
 * Every field the songbook codec (`public/songbook/codec.ts`, `legacy()`) still accepts but no
 * build writes — the "Legacy ... read, never written" fields of `public/songbook/types.ts`.
 * Paths are JSON paths into the stored `ChartDocument`.
 */
export const LEGACY_CHART_PATHS: readonly string[] = [
    '$.chart.arrangement.lastChordPreset',
    '$.chart.performance.complexity',
    '$.chart.band.harmony',
    '$.chart.band.chords.style',
    '$.chart.band.chords.instrument',
    '$.chart.band.chords.octave',
    '$.chart.band.chords.density',
    '$.chart.band.bass.style',
    '$.chart.band.bass.octave',
    '$.chart.band.soloist.style',
    '$.chart.band.soloist.preset',
    '$.chart.band.soloist.octave',
    '$.chart.band.soloist.phrasingIntensity',
    '$.chart.band.soloist.tradeMode',
    '$.chart.band.groove.measures',
    '$.chart.band.groove.lastDrumPreset',
    '$.chart.band.groove.genreFeel',
    '$.chart.band.groove.lastSmartGenre',
    '$.chart.band.groove.pattern',
];
/** The new format stores the genre once, as `genre`; a groove without it is an old chart. */
export const GENRE_PATH = '$.chart.band.groove.genre';

// A row whose body is not JSON, or has a string `kind`, is not a chart. Path literals are
// constants above, never input.
const IS_CHART = `json_valid(body) AND COALESCE(json_type(body, '$.kind'), '') <> 'text'`;
const HAS_LEGACY = `(${[
    ...LEGACY_CHART_PATHS.map((path) => `json_type(body, '${path}') IS NOT NULL`),
    `json_type(body, '${GENRE_PATH}') IS NULL`,
].join(' OR ')})`;

function readChartCounts(db: DatabaseSync): AdminChartCounts {
    const versions = db
        .prepare(
            `SELECT CASE WHEN json_type(body, '$.schemaVersion') = 'integer'
                         THEN CAST(json_extract(body, '$.schemaVersion') AS TEXT)
                         ELSE 'unknown' END AS version,
                    COUNT(*) AS n
               FROM documents WHERE ${IS_CHART} GROUP BY version`,
        )
        .all() as unknown as Array<{ version: string; n: number }>;
    const bySchemaVersion: Record<string, number> = {};
    let total = 0;
    for (const { version, n } of versions) {
        bySchemaVersion[version] = n;
        total += n;
    }
    const withLegacyFields = count(
        db,
        `SELECT COUNT(*) AS n FROM documents WHERE ${IS_CHART} AND ${HAS_LEGACY}`,
    );
    return { total, bySchemaVersion, withLegacyFields };
}

export interface AdminOverview {
    accounts: {
        total: number;
        cap: number;
        remaining: number;
        newLast7Days: number;
        newLast30Days: number;
        signedInLast7Days: number;
    };
    documents: { total: number; bytes: number };
    charts: AdminChartCounts;
    authFailuresLast24Hours: number;
    list: AdminAccountRow[];
    listTruncated: boolean;
}

function count(db: DatabaseSync, sql: string, ...params: number[]): number {
    const row = db.prepare(sql).get(...params) as unknown as { n: number };
    return row.n;
}

export function readAdminOverview(
    db: DatabaseSync,
    { cap, callerId, now }: { cap: number; callerId: string; now: number },
): AdminOverview {
    const total = count(db, 'SELECT COUNT(*) AS n FROM accounts');
    const documents = db
        .prepare(
            'SELECT COUNT(*) AS total, COALESCE(SUM(length(CAST(body AS BLOB))), 0) AS bytes FROM documents',
        )
        .get() as unknown as { total: number; bytes: number };
    // One row more than the page shows, so a full page can tell "exactly 200" from "more".
    const rows = db
        .prepare(
            `SELECT a.id AS id,
                    a.created_at AS joinedAt,
                    (SELECT MAX(s.created_at) FROM sessions s
                        WHERE s.account_id = a.id AND s.purpose = 'standard') AS lastSignInAt,
                    (SELECT COUNT(*) FROM documents d WHERE d.owner_id = a.id) AS documents,
                    (SELECT COALESCE(SUM(length(CAST(d.body AS BLOB))), 0) FROM documents d
                        WHERE d.owner_id = a.id) AS bytes,
                    (SELECT COUNT(*) FROM credentials c WHERE c.account_id = a.id) AS passkeys
             FROM accounts a
             ORDER BY a.created_at DESC, a.id
             LIMIT ?`,
        )
        .all(MAX_ADMIN_ACCOUNT_ROWS + 1) as unknown as Array<
        Omit<AdminAccountRow, 'shortId' | 'you'> & { id: string }
    >;

    return {
        accounts: {
            total,
            cap,
            remaining: Math.max(0, cap - total),
            newLast7Days: count(
                db,
                'SELECT COUNT(*) AS n FROM accounts WHERE created_at >= ?',
                now - 7 * DAY_MS,
            ),
            newLast30Days: count(
                db,
                'SELECT COUNT(*) AS n FROM accounts WHERE created_at >= ?',
                now - 30 * DAY_MS,
            ),
            signedInLast7Days: count(
                db,
                "SELECT COUNT(DISTINCT account_id) AS n FROM sessions WHERE purpose = 'standard' AND created_at >= ?",
                now - 7 * DAY_MS,
            ),
        },
        documents: { total: documents.total, bytes: documents.bytes },
        charts: readChartCounts(db),
        authFailuresLast24Hours: count(
            db,
            "SELECT COUNT(*) AS n FROM auth_security_events WHERE event = 'auth_failure' AND created_at >= ?",
            now - DAY_MS,
        ),
        list: rows.slice(0, MAX_ADMIN_ACCOUNT_ROWS).map(({ id, ...row }) => ({
            shortId: id.slice(0, SHORT_ID_LENGTH),
            ...row,
            you: id === callerId,
        })),
        listTruncated: rows.length > MAX_ADMIN_ACCOUNT_ROWS,
    };
}
