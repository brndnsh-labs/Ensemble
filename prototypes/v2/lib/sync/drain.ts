import type { AccountScope } from './protocol';
import { copyScope } from './records';
import type { AccountSongbook } from './repository';
import { type SaveTransport, sendNext } from './send';

/**
 * One caller-driven pass over a bounded slice of an account's outbox — not a background
 * service. Walks at most one page of documents — songs and, since #1474, collections, in one
 * id order (`outboxPage`) — sending at most one queued Save per visited document, sequentially. The caller decides whether and when to call again; nothing here
 * retains a hidden cursor, schedules a retry, or starts from app bootstrap on its own.
 */

/** One page, never a full-library sweep. A future page-size need is a caller-driven choice. */
export const OUTBOX_PAGE_LIMIT = 25;

export interface OutboxPassOptions {
    /** Exclusive resume cursor: the last document ID a previous pass safely visited. */
    afterDocumentId?: string;
    signal?: AbortSignal;
}

export interface OutboxPassResult {
    kind: 'complete' | 'more' | 'retry' | 'aborted';
    /**
     * Null at a confirmed end of the library ('complete'), and also whenever the pass ends
     * before safely visiting any document in THIS call — 'aborted' or 'retry' on the very
     * first song of a fresh sweep. Never treat null as itself meaning "the sweep is done";
     * only `kind === 'complete'` means that.
     */
    resumeAfterDocumentId: string | null;
    counts: { idle: number; committed: number; conflict: number; retry: number; refused: number };
}

/**
 * The next page of DOCUMENTS after the cursor, of either kind (#1474): this owner's songs and
 * collections merged in document-id order, which is one key space because ids are unique per owner
 * across kinds. So the cursor stays one document id, and a caller resuming a sweep — `drain` in
 * `lib/account/sync-loop.ts` — needs to know nothing about collections.
 *
 * Each store is paged to the same limit after the same cursor; the first `limit` ids of the union
 * are necessarily among those two pages, so the merge is exact. The songs page is still the full
 * validated `list` read it always was, so a song record that does not validate still fails the
 * pass rather than being stepped over. Two transactions rather than one: pages were never a
 * snapshot of the library (`list`), and the cursor is an id, not an offset.
 */
async function outboxPage(
    songbook: AccountSongbook,
    scope: AccountScope,
    afterDocumentId: string | undefined,
): Promise<{ documents: Array<{ documentId: string }>; nextAfterDocumentId: string | null }> {
    const options = {
        limit: OUTBOX_PAGE_LIMIT,
        ...(afterDocumentId === undefined ? {} : { afterDocumentId }),
    };
    const songs = await songbook.list(scope, options);
    const collections = await songbook.collectionPage(scope, options);
    const merged = [...songs.songs, ...collections.collections]
        .map((record) => ({ documentId: record.documentId }))
        .sort((a, b) => (a.documentId < b.documentId ? -1 : a.documentId > b.documentId ? 1 : 0));
    const documents = merged.slice(0, OUTBOX_PAGE_LIMIT);
    const more =
        merged.length > OUTBOX_PAGE_LIMIT ||
        songs.nextAfterDocumentId !== null ||
        collections.nextAfterDocumentId !== null;
    return {
        documents,
        nextAfterDocumentId: more && documents.length > 0 ? documents.at(-1)!.documentId : null,
    };
}

/**
 * A song whose head is in conflict, permanently refused (#1298), or idle with nothing queued,
 * still counts as visited and lets the pass continue to the next song — only a transport
 * failure ends the pass early, so one stuck song can never starve every other song behind it.
 * A refused head costs no network request at all: `prepare()` answers `'refused'` without
 * sending anything, which is what stops a step-over from re-POSTing the same rejected bytes
 * on every later pass.
 *
 * Invalid identifiers and storage/validation failures always reject rather than resolving with
 * fabricated progress; only a genuine transport failure resolves as `'retry'`. Abort is checked
 * before listing, after listing, and after each settled send, and once observed it outranks
 * continuing the loop or reporting `'more'` / `'complete'` / `'retry'` — but it can never erase
 * a count or an acknowledgement that already happened, and it can never hide a storage failure
 * from a call already in flight, since nothing here ever catches one.
 *
 * One deliberate exception to "storage failures always reject": a signal already aborted
 * BEFORE this call touches storage at all returns `'aborted'` without even checking whether
 * the scope is still current — an already-cancelled pass has no reason to open a transaction
 * merely to learn that it is cancelled. A scope that went stale while the pass was genuinely
 * working (i.e. inside `list`/`prepare`/`acknowledge`) still surfaces as a rejection.
 */
export async function runOutboxPass(
    songbook: AccountSongbook,
    scope: AccountScope,
    transport: SaveTransport,
    options: OutboxPassOptions = {},
): Promise<OutboxPassResult> {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new Error('Invalid outbox pass options.');
    }
    // Captured synchronously, before any await: a caller mutating its scope/options object
    // while this pass is in flight cannot retarget the account or the resume position.
    scope = copyScope(scope);
    const { afterDocumentId, signal } = options;
    const incomingCursor = afterDocumentId ?? null;
    const counts = { idle: 0, committed: 0, conflict: 0, retry: 0, refused: 0 };

    if (signal?.aborted) {
        return { kind: 'aborted', resumeAfterDocumentId: incomingCursor, counts };
    }

    const page = await outboxPage(songbook, scope, afterDocumentId);

    // Cancellation during page loading: the page already loaded, but nothing has been sent,
    // so the whole page is discarded and the pass reports exactly the progress it started
    // with — never a page's worth of songs the caller never asked to visit.
    if (signal?.aborted) {
        return { kind: 'aborted', resumeAfterDocumentId: incomingCursor, counts };
    }

    let cursor = incomingCursor;
    for (const song of page.documents) {
        // No abort check here at the top of the loop: there is no `await` between this point
        // and the last abort check either above (before the first song) or below (at the end
        // of the previous iteration), so `signal.aborted` cannot have changed since one of
        // those already ran. A check here would be provably unreachable, not defensive —
        // confirmed by deleting it and finding no test result changes in either direction.
        //
        // Not caught here: a storage/stale-owner failure inside prepare/acknowledge is not a
        // transport retry, and must reject this call rather than resolve as lost progress.
        const outcome = await sendNext(songbook, scope, song.documentId, transport);
        counts[outcome] += 1;
        if (outcome === 'retry') {
            // The cursor stays before this document, whether or not abort also fired: the
            // frozen operation is unresolved either way, and resumption must retry it, not
            // skip past it.
            return {
                kind: signal?.aborted ? 'aborted' : 'retry',
                resumeAfterDocumentId: cursor,
                counts,
            };
        }
        // idle / committed / conflict / refused: this document is safely visited.
        cursor = song.documentId;
        if (signal?.aborted) {
            return { kind: 'aborted', resumeAfterDocumentId: cursor, counts };
        }
    }

    return page.nextAfterDocumentId === null
        ? { kind: 'complete', resumeAfterDocumentId: null, counts }
        : { kind: 'more', resumeAfterDocumentId: page.nextAfterDocumentId, counts };
}
