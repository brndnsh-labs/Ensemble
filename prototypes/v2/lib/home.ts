// Type-only imports: the account store (`lib/sync/repository.ts`) reads this module too, and it
// must stay loadable without the engine — its real-IndexedDB suite runs with no `@engine` alias.
import type { ChartDocument } from './documents';

/**
 * What the songbook home reads, and nothing more (#1441).
 *
 * The home page shows at most `HOME_ROWS` songs, one Continue card and a count. Reading and
 * validating a whole library costs ~1.7 s at 2,000 songs on a phone (#1442, #1445), so the home
 * never does: it asks its store for the Continue document and the most recently opened ones BY ID,
 * plus an IndexedDB `count()`, in one read-only transaction (`lib/repository.ts`'s `home`,
 * `lib/sync/repository.ts`'s `AccountSongbook.home`). The full library is a separate, lazy read
 * that only the surfaces which need every song make (All songs, search, the whole-library passes
 * in `app/ensemble.tsx`).
 */
export const HOME_ROWS = 8;

/**
 * How many opened-at ids a home read will look up beyond `HOME_ROWS`. An id in the opened-at map
 * whose song has since gone (deleted on another device, cleared by a sign-out) costs one `get`
 * that finds nothing; this bound keeps a long tail of those from turning the home read into a
 * scan, and a miss past it only means the row is filled from elsewhere (see `HomeRead.fill`).
 */
export const HOME_SPARE_IDS = 8;

/** One home read's question, identical for the guest and account stores. */
export interface HomeRequest {
    /** The Continue card's song (the store's own "last opened" pointer), or null. */
    continueId: string | null;
    /** Opened-at ids, newest first, already bounded to `rows + HOME_SPARE_IDS`. */
    recentIds: readonly string[];
    /** How many rows the list shows. */
    rows: number;
}

/**
 * What a store's raw read found, before validation. Store-shaped values (`R`): a guest document,
 * or an account `SavedSong` row — each store validates its own.
 */
export interface HomeRead<R> {
    /** Every song in the store, from IndexedDB `count()` — never a partial read. */
    count: number;
    continued: R | undefined;
    /** The `recentIds` that exist, in request order. */
    recent: R[];
    /**
     * Songs read to fill the list when fewer than `rows` of the opened ones exist: a device that
     * has saved or imported songs it never opened (a v1 import, a library downloaded onto a second
     * device, #1442's seeded library). Read by a bounded cursor in key order — never more than the
     * rows still empty — so for a small songbook this is simply the rest of it, and for a large
     * one it is a stable, arbitrary handful rather than a scan for the newest.
     */
    fill: R[];
}

/** The validated home page. `unreadable` counts documents a by-id or fill read could not open. */
export interface HomeSlice {
    count: number;
    continued: ChartDocument | null;
    rows: ChartDocument[];
    unreadable: number;
}

/** The opened-at map, newest first, bounded to what one home read will look up. */
export function homeRequest(
    openedAt: ReadonlyMap<string, string>,
    continueId: string | null,
    rows = HOME_ROWS,
): HomeRequest {
    const recentIds = [...openedAt.entries()]
        .sort((a, b) => b[1].localeCompare(a[1]) || a[0].localeCompare(b[0]))
        .slice(0, rows + HOME_SPARE_IDS)
        .map(([id]) => id);
    return { continueId, recentIds, rows };
}

/**
 * A validator that remembers its verdict per raw value, so a store can ask "is this one readable?"
 * while sizing its fill (inside the transaction) and `settleHome` can then reuse the same answer
 * rather than validate each document twice. One per home read.
 */
export function rememberingValidator<R>(
    validate: (raw: R) => ChartDocument,
): (raw: R) => ChartDocument {
    const verdicts = new Map<R, { document: ChartDocument } | { failure: unknown }>();
    return (raw) => {
        let verdict = verdicts.get(raw);
        if (!verdict) {
            try {
                verdict = { document: validate(raw) };
            } catch (failure) {
                verdict = { failure };
            }
            verdicts.set(raw, verdict);
        }
        if ('failure' in verdict) {
            throw verdict.failure;
        }
        return verdict.document;
    };
}

/** Does `validate` accept this raw value? For sizing a fill; never throws. */
export function readable<R>(validate: (raw: R) => ChartDocument, raw: R): boolean {
    try {
        validate(raw);
        return true;
    } catch {
        return false;
    }
}

/**
 * How many cursor steps a fill may take beyond the rows it still needs: an unreadable document it
 * meets is read and counted, and the fill keeps going to top the list up — but never into a scan
 * of a songbook whose every document is corrupt.
 */
export const HOME_FILL_SPARE = 8;

/**
 * Validate a raw home read into the page it shows.
 *
 * **A document that does not validate is left out, counted, and never fatal** (#1441). The home
 * page must render even when one stored chart is corrupt — that song is still in storage, and the
 * All songs page (a full read, which refuses a library it cannot wholly read) is where the failure
 * is reported in full. So a bad Continue document means no Continue card, a bad row is one fewer
 * row, and `unreadable` lets the page say that something could not be read rather than pretend the
 * list is complete. The count is the store's own and is never reduced: an unreadable song is still
 * one of the musician's songs.
 *
 * Fill rows come after every opened row, newest save first, since they were never opened.
 */
export function settleHome<R>(
    read: HomeRead<R>,
    validate: (raw: R) => ChartDocument,
    rows: number,
): HomeSlice {
    let unreadable = 0;
    const attempt = (raw: R): ChartDocument | null => {
        try {
            return validate(raw);
        } catch {
            unreadable += 1;
            return null;
        }
    };
    const continued = read.continued === undefined ? null : attempt(read.continued);
    const opened = read.recent.map(attempt).filter((document) => document !== null);
    const filled = read.fill
        .map(attempt)
        .filter((document) => document !== null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const seen = new Set<string>();
    const listed: ChartDocument[] = [];
    for (const document of [...opened, ...filled]) {
        if (listed.length >= rows) {
            break;
        }
        if (!seen.has(document.id)) {
            seen.add(document.id);
            listed.push(document);
        }
    }
    return { count: read.count, continued, rows: listed, unreadable };
}

/**
 * "opened 2 h ago" style wording for a device-local opened-at stamp. `now` is a parameter so the
 * wording is testable; an unreadable stamp answers null and the caller shows nothing.
 */
export function openedAgo(iso: string, now: number): string | null {
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) {
        return null;
    }
    const minutes = Math.max(0, Math.round((now - then) / 60_000));
    if (minutes < 1) {
        return 'just now';
    }
    if (minutes < 60) {
        return `${minutes} min ago`;
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
        return `${hours} h ago`;
    }
    const days = Math.round(hours / 24);
    if (days === 1) {
        return 'yesterday';
    }
    if (days < 7) {
        return `${days} days ago`;
    }
    return new Date(then).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        ...(days > 300 ? { year: 'numeric' } : {}),
    });
}
