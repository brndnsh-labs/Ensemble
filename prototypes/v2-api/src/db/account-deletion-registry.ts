import type { DatabaseSync } from 'node:sqlite';

/** Future deletion must explicitly walk these in order in ONE transaction; no deletion API yet. */
const ACCOUNT_DELETION_WIPED = [
    'auth_security_events',
    'challenges',
    'sessions',
    'recovery_codes',
    'credentials',
    'accounts',
] as const;
/** Every non-wiped table needs a reason. This classifies global tables too, catching naming drift. */
const ACCOUNT_DELETION_RETAINED = {
    _migrations: 'Global migration checksums; contains no account data.',
} as const;

export function assertAccountDeletionCoverage(db: DatabaseSync): void {
    const actual = db
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[];
    const classified = [...ACCOUNT_DELETION_WIPED, ...Object.keys(ACCOUNT_DELETION_RETAINED)];
    if (
        new Set(classified).size !== classified.length ||
        actual.some(({ name }) => !classified.includes(name)) ||
        classified.some((name) => !actual.some((row) => row.name === name))
    ) {
        throw new Error('Account deletion registry does not classify every table exactly once');
    }
}
