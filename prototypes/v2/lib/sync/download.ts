import { validateChartDocument } from '../../../../public/songbook/codec.js';
import {
    type AccountScope,
    type ChartDocument,
    identifier,
    type RemoteOutcome,
    remoteRevision,
    snapshot,
    type UnsupportedReason,
} from './protocol';
import { copyScope } from './records';
import { type AccountSongbook, MAX_LIST_LIMIT, type ReconcileOutcome } from './repository';
import type { Progress } from './status';

/**
 * Download and reconcile this account's library (#1265) — the client half of the #1259 read
 * routes, and the whole of S1 in the rollout's decision 9: the client pages an
 * `(id, revision, deleted)` MANIFEST and diffs it against local records. There is deliberately
 * no change feed, no server watermark and no cursor to expire or reset, so nothing here persists
 * a position: resumption falls out of the revision diff, because a document already at the
 * manifest's revision is simply not planned again.
 *
 * Three passes, in this order and for these reasons:
 *
 * 1. Page the whole manifest into memory (bounded by the server's 2,000-document per-owner cap).
 *    A malformed row rejects the ENTIRE pass: a diff is a plan to remove and overwrite records,
 *    and it may only be computed from rows that were all validated.
 * 2. Diff it against local records — pure, in `planLibraryDownload`, so the rule that decides
 *    what to fetch and what to remove is testable without a browser or a transport.
 * 3. Fetch the changed bodies with bounded concurrency and a paced request rate, validating each
 *    one through the same `snapshot()` the Save path uses before it can reach the store.
 *
 * Nothing here is a background service: one call, one pass, and the caller decides whether to
 * call again. The run REPORTS rather than throws for every outcome a server or a network can
 * produce, because those are facts a musician needs shown (`status.ts`); it rejects only on a
 * programmer error (bad options, bad scope) or a storage/fence failure, exactly as `drain.ts`
 * does, so a failure can never be mistaken for progress and progress can never be lost silently.
 */

/** The server's `MAX_LIST_LIMIT`: a 2,000-document library is four manifest pages. */
export const MANIFEST_PAGE_LIMIT = 500;
/** The per-owner document cap. A manifest longer than this is a broken server, not a library. */
export const MANIFEST_ROW_LIMIT = 2_000;
export const DOWNLOAD_CONCURRENCY = 4;
/**
 * 400ms between requests is 150/min: under the download route's own 180/min budget and inside
 * the 300/min transport budget it SHARES with `/api/auth/*` and Save, which is keyed by network
 * identity rather than by account. Bursting here would refuse the session check that keeps the
 * user signed in, so a full cold-start library is ~11 paced minutes by design.
 */
export const DOWNLOAD_INTERVAL_MS = 400;
/** Used only when a 429 arrives with no parseable `Retry-After`. */
export const BACKOFF_FALLBACK_MS = 60_000;
/** Loop fuse for local paging: 400 pages of `MAX_LIST_LIMIT` is 40,000 local documents. */
const LOCAL_PAGE_CEILING = 400;

export interface ManifestRow {
    documentId: string;
    revision: string;
    deleted: boolean;
    bytes: number;
}

export interface ManifestPage {
    documents: ManifestRow[];
    nextAfterDocumentId: string | null;
}

/**
 * A 401 and a 429 are outcomes, not exceptions: the adapter marks the session expired and hands
 * back the server's back-off, and the run stops issuing requests in either case. The adapter
 * over the real API lives in `lib/account/library-transport.ts`; tests inject fakes here.
 *
 * `page` and `body` are `unknown` on purpose — a transport moves bytes, and every shape
 * assertion about them belongs in this module, where an invalid one has a defined consequence.
 */
export type ManifestOutcome =
    | { kind: 'page'; page: unknown }
    | { kind: 'expired' }
    | { kind: 'backoff'; retryAfterSeconds: number | null }
    | { kind: 'failed'; reason: 'network' | 'server'; detail: string };

export type DownloadOutcome =
    | { kind: 'body'; body: unknown }
    /** An id the manifest listed as live answered 404 — absent, tombstoned and foreign alike. */
    | { kind: 'missing' }
    | { kind: 'expired' }
    | { kind: 'backoff'; retryAfterSeconds: number | null }
    | { kind: 'failed'; reason: 'network' | 'server'; detail: string };

export interface LibraryTransport {
    manifest(after: string | null, limit: number): Promise<ManifestOutcome>;
    download(documentId: string): Promise<DownloadOutcome>;
}

export interface LocalMirror {
    documentId: string;
    /** False for a document this device holds only a remote candidate for. */
    saved: boolean;
    /** Null when the cloud has never confirmed this record. Never a clean mirror of anything. */
    remoteRevision: string | null;
    /**
     * The revision of a body already preserved as needing an app update, if any. Only an
     * unsupported candidate suppresses a re-fetch, and it does so permanently: this build will
     * never decode that revision, so asking for it again every pass is pure waste. A `version`
     * or `deleted` candidate deliberately suppresses nothing — it exists because local work was
     * in the way, and the moment that work is resolved the same row has to be free to advance.
     */
    quarantinedRevision: string | null;
}

export interface PlannedDocument {
    documentId: string;
    revision: string;
}

export interface LibraryPlan {
    /** Live rows whose body must be fetched: new, moved, or divergent and still unobserved. */
    fetch: PlannedDocument[];
    /** Deleted rows this device still has a saved record for. */
    tombstone: PlannedDocument[];
    /** Rows needing no request and no write at all. */
    unchanged: string[];
    /**
     * Saved records no manifest row mentions. NEVER deleted: absence from the manifest is not
     * deletion — tombstones are explicit rows (#1259), so a missing id can only mean a server
     * restore, a document created below the cursor mid-pass, or a bug.
     */
    absent: string[];
    /** Live rows, and how many of them a saved record already mirrors at that same revision. */
    documents: { required: number; mirrored: number };
}

export type LibraryFailureReason =
    | 'network'
    | 'server'
    | 'expired'
    | 'rate-limited'
    | 'malformed-manifest'
    | 'malformed-body';

export interface LibraryDownloadFailure {
    /** Null when the manifest pass itself failed rather than one document. */
    documentId: string | null;
    reason: LibraryFailureReason;
    detail: string;
}

/**
 * Every array reports what THIS run did or saw, never a census of the library — an empty array
 * is "nothing of this kind happened", which is why `complete` and `documents` carry the only
 * claims about coverage.
 */
export interface LibraryDownloadResult {
    /**
     * True only when the manifest was fully paged AND every planned document resolved. An
     * adopted, preserved-as-candidate or app-update-flagged document IS resolved: its state is
     * known and no retry would improve it. A network failure, a malformed frame, an invalid
     * body or a body that never arrived is not — so a partial run, and an empty result produced
     * by a failed first page, can never read as a complete (or an empty) library.
     */
    complete: boolean;
    advanced: string[];
    candidates: string[];
    unchanged: string[];
    removed: string[];
    retainedDeleted: string[];
    /** Bodies from a newer format, preserved and flagged `'needs-app-update'`, never adopted. */
    unsupported: string[];
    absent: string[];
    /** Listed live by the manifest, 404 on the download. Nothing local was touched. */
    missing: string[];
    /** Only what a retry could still fix. A quarantined body is in `unsupported`, not here. */
    failures: LibraryDownloadFailure[];
    /** Present after a 429: epoch ms, on this run's clock, before which nothing should retry. */
    backoffUntil?: number;
    /**
     * `offline.documents` for `status.ts`. Null when the manifest was not fully paged — an
     * unobserved requirement must stay unknown rather than become a count. Counted as verified
     * only where a saved record matches the manifest revision: a preserved candidate or a
     * quarantined body is genuinely not offline-ready, and over-claiming readiness is the exact
     * failure this fact exists to prevent.
     */
    documents: Progress;
}

export interface LibraryDownloadOptions {
    /** The document(s) on the stand right now. The caller owns this; storage never guesses it. */
    activeDocumentIds?: readonly string[];
    concurrency?: number;
    manifestLimit?: number;
    minimumIntervalMs?: number;
    /** Injected clock. Tests drive pacing deterministically; production uses the real one. */
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
}

function integer(value: unknown, name: string, min: number, max: number): number {
    if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}.`);
    }
    return value as number;
}

/**
 * Deny by default on the frame, tolerant of unknown members: a field a future server adds must
 * not fail a client that does not need it, but nothing unvalidated is ever kept or stored.
 */
function readManifestPage(value: unknown): ManifestPage {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid manifest page.');
    }
    const record = value as Record<string, unknown>;
    if (!Array.isArray(record.documents)) {
        throw new Error('Invalid manifest page rows.');
    }
    const documents = record.documents.map((entry: unknown) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error('Invalid manifest row.');
        }
        const row = entry as Record<string, unknown>;
        identifier(row.documentId);
        remoteRevision(row.revision);
        if (typeof row.deleted !== 'boolean') {
            throw new Error('Invalid manifest row deletion flag.');
        }
        return {
            documentId: row.documentId,
            revision: row.revision,
            deleted: row.deleted,
            bytes: integer(row.bytes, 'Manifest row bytes', 0, Number.MAX_SAFE_INTEGER),
        } satisfies ManifestRow;
    });
    const next = record.nextAfterDocumentId;
    if (next !== null) {
        identifier(next);
    }
    return { documents, nextAfterDocumentId: next as string | null };
}

/**
 * The body's frame only. Whether the document inside it is usable is a separate question with a
 * separate answer (quarantine); conflating the two would discard a preservable body.
 */
function readBodyFrame(
    value: unknown,
    documentId: string,
): { revision: string; document: unknown } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid document body.');
    }
    const record = value as Record<string, unknown>;
    if (record.documentId !== documentId) {
        throw new Error('Document body does not answer the requested id.');
    }
    // The revision is read from the BODY, not from the manifest row that planned the fetch: a
    // concurrent Save on another device can move it in between, and the saved record must be
    // labelled with the revision of the bytes it actually holds.
    remoteRevision(record.revision);
    if (!Object.hasOwn(record, 'document')) {
        throw new Error('Document body carries no document.');
    }
    return { revision: record.revision, document: record.document };
}

/** Null for anything this build cannot use, WITHOUT deciding what to do about it. */
function decodeBody(value: unknown, documentId: string): ChartDocument | null {
    try {
        const document = snapshot(value);
        // A body that decodes but disagrees about its own identity is unusable too: storing it
        // under the id we asked for would silently relabel someone's chart.
        return document.id === documentId ? document : null;
    } catch {
        return null;
    }
}

/**
 * Classify a body this build could not use, without re-implementing any validation: the
 * canonical decoder's own verdict decides. A `schemaVersion` with no decoder here is a
 * "needs app update"; anything else is corrupt. Version 2 is excluded because
 * `validateChartDocument` reports every v2 document as a future version and `snapshot()` then
 * decodes it — so a v2 body that failed is invalid content, not a newer format.
 *
 * The two verdicts get opposite treatments, and that difference is the point. A newer format is
 * a fact about THIS BUILD, not about the data: the bytes are presumed good, so they are
 * preserved and flagged, and nothing would be improved by refetching them. Corrupt content is a
 * fact about the data or the server, so it is reported as a failure, nothing is written, and the
 * run cannot claim a complete library over a document it refused.
 */
function unsupportedReason(document: unknown): UnsupportedReason {
    const verdict = validateChartDocument(document);
    return verdict.kind === 'future-version' && verdict.schemaVersion !== 2
        ? 'needs-app-update'
        : 'invalid';
}

/**
 * The whole diff rule, pure: validated manifest rows in ascending id order, against this owner's
 * local records.
 *
 * A row is fetched when the cloud holds a revision this device has not observed — including when
 * the local record is divergent and the body will end up as a candidate rather than an
 * adoption, because a candidate with no remote body is worth nothing to a later keep-both
 * decision. It is NOT fetched when a saved record already sits at that revision, nor when this
 * build has already quarantined that exact revision; that is what makes rerunning an
 * interrupted pass cost only what is still missing.
 *
 * A deleted row is planned only when a saved record exists, because that is the only local thing
 * a tombstone can act on. A draft or a candidate with no saved record is left exactly as it is:
 * losing nothing outranks flagging everything.
 */
export function planLibraryDownload(
    rows: readonly ManifestRow[],
    local: readonly LocalMirror[],
): LibraryPlan {
    const mirrors = new Map(local.map((mirror) => [mirror.documentId, mirror]));
    const listed = new Set<string>();
    const plan: LibraryPlan = {
        fetch: [],
        tombstone: [],
        unchanged: [],
        absent: [],
        documents: { required: 0, mirrored: 0 },
    };
    for (const row of rows) {
        listed.add(row.documentId);
        const mirror = mirrors.get(row.documentId);
        if (row.deleted) {
            if (mirror?.saved) {
                plan.tombstone.push({ documentId: row.documentId, revision: row.revision });
            } else {
                plan.unchanged.push(row.documentId);
            }
            continue;
        }
        plan.documents.required += 1;
        if (mirror?.saved && mirror.remoteRevision === row.revision) {
            plan.documents.mirrored += 1;
            plan.unchanged.push(row.documentId);
            continue;
        }
        if (mirror?.quarantinedRevision === row.revision) {
            plan.unchanged.push(row.documentId);
            continue;
        }
        plan.fetch.push({ documentId: row.documentId, revision: row.revision });
    }
    for (const mirror of local) {
        if (mirror.saved && !listed.has(mirror.documentId)) {
            plan.absent.push(mirror.documentId);
        }
    }
    return plan;
}

function detailOf(error: unknown): string {
    return error instanceof Error ? error.message : 'Unrecognized failure.';
}

export async function runLibraryDownload(
    songbook: AccountSongbook,
    scope: AccountScope,
    transport: LibraryTransport,
    options: LibraryDownloadOptions = {},
): Promise<LibraryDownloadResult> {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new Error('Invalid library download options.');
    }
    if (
        !transport ||
        typeof transport.manifest !== 'function' ||
        typeof transport.download !== 'function'
    ) {
        throw new Error('Invalid library transport.');
    }
    // Captured synchronously, before any await: a caller mutating its scope or options while the
    // pass is in flight cannot retarget the account, the open chart, or the request rate.
    scope = copyScope(scope);
    const {
        activeDocumentIds = [],
        concurrency = DOWNLOAD_CONCURRENCY,
        manifestLimit = MANIFEST_PAGE_LIMIT,
        minimumIntervalMs = DOWNLOAD_INTERVAL_MS,
        now = () => Date.now(),
        sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    } = options;
    integer(concurrency, 'Download concurrency', 1, 16);
    integer(manifestLimit, 'Manifest page limit', 1, MANIFEST_PAGE_LIMIT);
    integer(minimumIntervalMs, 'Minimum request interval', 0, 60_000);
    if (typeof now !== 'function' || typeof sleep !== 'function') {
        throw new Error('Invalid injected clock.');
    }
    if (!Array.isArray(activeDocumentIds)) {
        throw new Error('Invalid active document list.');
    }
    const active = new Set<string>();
    for (const id of activeDocumentIds) {
        identifier(id);
        active.add(id);
    }

    const failures: LibraryDownloadFailure[] = [];
    const missing: string[] = [];
    const buckets: Record<ReconcileOutcome, string[]> = {
        advanced: [],
        candidate: [],
        unchanged: [],
        removed: [],
        'retained-deleted': [],
        unsupported: [],
    };
    let backoffUntil: number | undefined;
    // One flag for both stop reasons. A 429 is a GLOBAL back-off — the 300/min budget is shared
    // across every route and keyed by network identity — and an expired session would refuse
    // every remaining request too, so the right number of further requests is zero either way.
    let stopped = false;

    const fail = (
        documentId: string | null,
        reason: LibraryFailureReason,
        detail: string,
    ): void => {
        failures.push({ documentId, reason, detail });
    };
    // Request pacing, shared by the manifest and the bodies because the server's budget is. The
    // slot is reserved synchronously, so two concurrent workers cannot claim the same one.
    let nextRequestAt = 0;
    const pace = async (): Promise<void> => {
        const at = Math.max(now(), nextRequestAt);
        nextRequestAt = at + minimumIntervalMs;
        const delay = at - now();
        if (delay > 0) {
            await sleep(delay);
        }
    };
    const halt = (retryAfterSeconds: number | null): void => {
        stopped = true;
        const wait = retryAfterSeconds === null ? BACKOFF_FALLBACK_MS : retryAfterSeconds * 1_000;
        backoffUntil = Math.max(backoffUntil ?? 0, now() + wait);
    };
    const report = (
        complete: boolean,
        absent: string[],
        documents: Progress,
    ): LibraryDownloadResult => ({
        complete,
        advanced: buckets.advanced,
        candidates: buckets.candidate,
        unchanged: buckets.unchanged,
        removed: buckets.removed,
        retainedDeleted: buckets['retained-deleted'],
        unsupported: buckets.unsupported,
        absent,
        missing,
        failures,
        ...(backoffUntil === undefined ? {} : { backoffUntil }),
        documents,
    });
    const abandoned = (): LibraryDownloadResult =>
        report(false, [], { required: null, verified: null });

    // Pass 1: the whole manifest, or nothing.
    const rows: ManifestRow[] = [];
    let after: string | null = null;
    let paged = false;
    const maxPages = Math.ceil(MANIFEST_ROW_LIMIT / manifestLimit) + 1;
    for (let page = 0; page < maxPages && !paged; page++) {
        await pace();
        const outcome = await transport.manifest(after, manifestLimit);
        if (outcome.kind === 'expired') {
            stopped = true;
            fail(null, 'expired', 'The account session is no longer valid.');
            return abandoned();
        }
        if (outcome.kind === 'backoff') {
            halt(outcome.retryAfterSeconds);
            fail(null, 'rate-limited', 'The server asked for a back-off.');
            return abandoned();
        }
        if (outcome.kind === 'failed') {
            fail(null, outcome.reason, outcome.detail);
            return abandoned();
        }
        let current: ManifestPage;
        try {
            current = readManifestPage(outcome.page);
        } catch (error) {
            fail(null, 'malformed-manifest', detailOf(error));
            return abandoned();
        }
        // Keyset paging on an immutable id means strictly ascending ids across the whole pass. A
        // repeat or a regression means the server's cursor contract broke, and following it
        // would either loop forever or diff one id twice against two different verdicts.
        for (const row of current.documents) {
            const previous = rows.at(-1);
            if (previous && previous.documentId >= row.documentId) {
                fail(null, 'malformed-manifest', 'Manifest rows are not ordered.');
                return abandoned();
            }
            rows.push(row);
        }
        if (rows.length > MANIFEST_ROW_LIMIT) {
            fail(null, 'malformed-manifest', 'Manifest exceeds the per-owner cap.');
            return abandoned();
        }
        if (current.nextAfterDocumentId === null) {
            paged = true;
            break;
        }
        const tail = rows.at(-1);
        if (!tail || current.nextAfterDocumentId < tail.documentId) {
            fail(null, 'malformed-manifest', 'Manifest cursor did not advance.');
            return abandoned();
        }
        after = current.nextAfterDocumentId;
    }
    if (!paged) {
        fail(null, 'malformed-manifest', 'Manifest did not end within its page budget.');
        return abandoned();
    }

    // Pass 2: the local side of the diff. A storage failure here rejects rather than resolving —
    // a library this device could not read is not one it may remove records from.
    const quarantined = new Map(
        (await songbook.remoteCandidates(scope))
            .filter((candidate) => candidate.kind === 'unsupported')
            .map((candidate) => [candidate.documentId, candidate.revision]),
    );
    const local: LocalMirror[] = [];
    const saved = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; ; page++) {
        if (page >= LOCAL_PAGE_CEILING) {
            throw new Error('Local library paging did not terminate.');
        }
        const listing = await songbook.list(scope, {
            limit: MAX_LIST_LIMIT,
            ...(cursor === undefined ? {} : { afterDocumentId: cursor }),
        });
        for (const song of listing.songs) {
            saved.add(song.documentId);
            local.push({
                documentId: song.documentId,
                saved: true,
                remoteRevision: song.remoteRevision,
                quarantinedRevision: quarantined.get(song.documentId) ?? null,
            });
        }
        if (listing.nextAfterDocumentId === null) {
            break;
        }
        cursor = listing.nextAfterDocumentId;
    }
    // A quarantined body has no saved record by construction — nothing unusable ever becomes
    // one — so it must join the local side on its own, or every pass would re-download the
    // revision this build already preserved and still cannot read.
    for (const [documentId, revision] of quarantined) {
        if (!saved.has(documentId)) {
            local.push({
                documentId,
                saved: false,
                remoteRevision: null,
                quarantinedRevision: revision,
            });
        }
    }

    const plan = planLibraryDownload(rows, local);
    const commit = async (outcome: RemoteOutcome): Promise<void> => {
        const result = await songbook.reconcile(scope, outcome, {
            active: active.has(outcome.documentId),
        });
        buckets[result].push(outcome.documentId);
    };

    // Tombstones first: they need no network, so a run that dies mid-download still applies the
    // removals it had already proved from explicit tombstone rows.
    let tombstoned = 0;
    for (const row of plan.tombstone) {
        await commit({ kind: 'deleted', documentId: row.documentId, revision: row.revision });
        tombstoned += 1;
    }

    // Pass 3: bodies, bounded concurrency over one shared index. `index++` needs no lock —
    // there is no await between reading it and advancing it.
    let index = 0;
    let resolved = 0;
    const fetchBodies = async (): Promise<void> => {
        while (!stopped) {
            const planned = plan.fetch[index++];
            if (!planned) {
                return;
            }
            await pace();
            if (stopped) {
                // Another worker met a 429 or a 401 while this one waited for its slot. The
                // request is never issued: a global back-off means zero further requests.
                return;
            }
            const outcome = await transport.download(planned.documentId);
            if (outcome.kind === 'expired') {
                stopped = true;
                fail(planned.documentId, 'expired', 'The account session is no longer valid.');
                return;
            }
            if (outcome.kind === 'backoff') {
                halt(outcome.retryAfterSeconds);
                fail(planned.documentId, 'rate-limited', 'The server asked for a back-off.');
                return;
            }
            if (outcome.kind === 'failed') {
                fail(planned.documentId, outcome.reason, outcome.detail);
                continue;
            }
            if (outcome.kind === 'missing') {
                // The manifest said live and the download says gone. Absent, tombstoned and
                // foreign are deliberately one reply, so this is not evidence of a deletion and
                // nothing local may be removed for it; if the document really was deleted, the
                // next pass's manifest carries an explicit tombstone row.
                missing.push(planned.documentId);
                resolved += 1;
                continue;
            }
            let frame: { revision: string; document: unknown };
            try {
                frame = readBodyFrame(outcome.body, planned.documentId);
            } catch (error) {
                // A frame this broken says nothing about the document: there is nothing to
                // preserve and nothing resolved, so the run keeps going and stays incomplete.
                fail(planned.documentId, 'malformed-body', detailOf(error));
                continue;
            }
            const document = decodeBody(frame.document, planned.documentId);
            if (!document && unsupportedReason(frame.document) === 'invalid') {
                // Content the canonical decoder rejects outright: a broken server or a corrupt
                // row, not a newer format. Nothing is written and nothing is resolved, so the
                // run stays incomplete and the refusal is visible in `failures` rather than
                // being smuggled into a success as a quarantined "we kept something".
                fail(
                    planned.documentId,
                    'malformed-body',
                    'The downloaded body is not a valid chart document.',
                );
                continue;
            }
            // Committed OUTSIDE any catch: a storage or fence failure must reject the run, not
            // be mistaken for an unusable document and quarantined under a stale owner.
            await commit(
                document
                    ? {
                          kind: 'version',
                          documentId: planned.documentId,
                          revision: frame.revision,
                          document,
                      }
                    : {
                          kind: 'unsupported',
                          documentId: planned.documentId,
                          revision: frame.revision,
                          // The observed value, kept as it arrived: never migrated, coerced or
                          // re-encoded, because it is the only copy this device has of a
                          // document it cannot yet read.
                          body: frame.document,
                          reason: 'needs-app-update',
                      },
            );
            resolved += 1;
        }
    };
    /**
     * A rejection here is a storage or fence failure — an owner switch mid-pass is the one that
     * matters — and it rejects the whole run rather than being reported. Every sibling worker is
     * stopped first: a request issued after the account changed would be made on behalf of a
     * session this pass no longer belongs to, and its commit could only fail the same way.
     */
    const worker = async (): Promise<void> => {
        try {
            await fetchBodies();
        } catch (error) {
            stopped = true;
            throw error;
        }
    };
    await Promise.all(
        Array.from({ length: Math.min(concurrency, plan.fetch.length) }, () => worker()),
    );

    const complete =
        !stopped && resolved === plan.fetch.length && tombstoned === plan.tombstone.length;
    buckets.unchanged.push(...plan.unchanged);
    return report(complete, plan.absent, {
        required: plan.documents.required,
        verified: plan.documents.mirrored + buckets.advanced.length,
    });
}
