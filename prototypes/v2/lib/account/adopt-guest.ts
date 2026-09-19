/**
 * Copy this device's guest songs into the signed-in account (#1268).
 *
 * Everyone plays as a guest before they have an account, and this is the one-time, opt-in bridge:
 * every guest song becomes its own explicit Save in the account songbook. It never touches the
 * guest store — `lib/repository.ts` is read here through `list()` only, never `save()` — and the
 * guest songbook is untouched no matter how a copy attempt ends, including mid-copy.
 *
 * **The account DOCUMENT id is deterministic; the Save OPERATION id is not.** The document id is
 * derived from `(ownerId, guestId)` alone — never from the guest song's content, revision or
 * timestamps — via the same SHA-256 `digest()` the Save wire protocol already uses
 * (`lib/sync/protocol.ts`). That is the dedup key, and it does all the real work:
 * `computeAdoptCandidates` filters out any guest song whose deterministic account document id is
 * already present, so a rerun after an interruption only offers what is genuinely still missing —
 * that is what makes "interrupt mid-copy, rerun" land on exactly N account songs, not more. The
 * local store refuses the rest: `AccountSongbook.save` will not recreate a document id it already
 * holds (`LocalRevisionError`, treated here as success — the interrupted copy already got that
 * song in).
 *
 * The operation id is deliberately a FRESH one per attempt (`AccountSongbook.save`'s own
 * `crypto.randomUUID()`), which is the #1268 patch-review P0 fix. A deterministic operation id
 * beside a deterministic document id poisoned the outbox: the server's receipts never expire and
 * only replay an EXACT byte match, while `save()` restamps `updatedAt` with `Date.now()` on every
 * call, so a second device adopting the same guest starter (`starter-blues` is a literal id on
 * every device) sent the same operation id with different bytes and earned a permanent
 * `operation_mismatch` — a `'retry'` to the outbox, which ended every pass at that document
 * forever. With a fresh id, a create for a document the account already holds answers `conflict`
 * (the handled path: the operation is marked `conflict`, the chip says so, and Keep-both #1267
 * owns resolving it) and a tombstoned one answers `'gone'`. Neither wedges the queue.
 *
 * A guest starter (`id.startsWith('starter-')`, the same test `songbook.tsx`'s Quick Jam section
 * uses) is not filtered out. A starter a musician has actually been playing from is a real song to
 * them, and there is no reliable way to tell "played but never edited" apart from "brand new,
 * revision 0" without extra state this store does not keep. Simplicity wins here: every guest song
 * is offered, starter or not.
 */

import * as repository from '../repository';
import type { ChartDocument } from '../runtime';
import { digest, LocalRevisionError } from '../sync/protocol';
import { MAX_REMOTE_CANDIDATES } from '../sync/repository';
import type { Progress } from '../sync/status';
import { accountSync } from './sync-loop';

export interface AdoptCandidate {
    guestId: string;
    accountDocumentId: string;
    document: ChartDocument;
}

export interface AdoptFailure {
    guestId: string;
    message: string;
}

export interface AdoptOffer {
    /** What this account has room for, in guest-songbook order. */
    candidates: AdoptCandidate[];
    /**
     * Guest songs this account has no room left for, so the offer leaves them out rather than
     * queueing Saves the server is bound to refuse with `quota_exceeded`.
     */
    omitted: number;
    /** How many more songs this account could hold when the offer was computed. */
    room: number;
}

export interface AdoptResult {
    adopted: number;
    failures: AdoptFailure[];
}

/**
 * A stable id from the given parts, joined so no part can be re-sliced by another's content.
 * Reuses `digest()` (`lib/sync/protocol.ts`) — the same hex SHA-256 the Save wire protocol hashes
 * request bodies with — rather than a second hashing implementation.
 */
function stableId(...parts: string[]): Promise<string> {
    return digest(parts.join(':'));
}

/**
 * Has this device finished downloading the signed-in account's library at least once?
 *
 * The offer is computed by diffing the guest songbook against the ACCOUNT library, so it is only
 * meaningful once that library has actually been fetched — `attach()` publishes `UNOBSERVED`
 * (`{ required: null, verified: null }`) and only a download that paged the whole manifest replaces
 * it, which also makes this inherently per-owner. Offering before then computes the diff against an
 * empty local library and re-offers every song the account already has, which on a second device
 * (or after a cloud delete) is how #1268's P0 reproduced. Both halves of the pair have to be
 * observed: a partially paged manifest is not a library this can be trusted against.
 */
export function libraryDownloaded(documents: Progress): boolean {
    return documents.required !== null && documents.verified !== null;
}

/**
 * Every guest song this owner does not already hold in their account, paired with the
 * deterministic account document id it will use if adopted — bounded by what the account can
 * still hold.
 *
 * Reads the guest songbook (`repository.list()`) and the account library (`accountSync.listLibrary()`)
 * fresh on every call rather than trusting a caller's cached lists — this is what makes "rerun
 * after an interruption" mean something: a candidate here is one this device can currently prove
 * is missing, not one that was missing the last time somebody asked. Call it only once
 * `libraryDownloaded` is true, or "missing" means "not downloaded yet".
 */
export async function computeAdoptCandidates(ownerId: string): Promise<AdoptOffer> {
    const [guestSongs, accountSongs] = await Promise.all([
        repository.list(),
        accountSync.listLibrary(),
    ]);
    const known = new Set(accountSongs.map((song) => song.documentId));
    // The server refuses a CREATE past `MAX_DOCUMENTS_PER_OWNER` (2,000 — the same number
    // `MAX_REMOTE_CANDIDATES` bounds local paging by) with `quota_exceeded`, which is an
    // ACCOUNT-WIDE refusal: it ends the whole outbox pass, so every song queued behind the
    // overflow waits on it too. Offering only what fits keeps a generous guest songbook from
    // turning one opt-in gesture into a stalled queue.
    const room = Math.max(0, MAX_REMOTE_CANDIDATES - known.size);
    const candidates: AdoptCandidate[] = [];
    let omitted = 0;
    for (const guest of guestSongs) {
        const accountDocumentId = `guest-${await stableId('adopt-doc', ownerId, guest.id)}`;
        if (known.has(accountDocumentId)) {
            continue;
        }
        if (candidates.length >= room) {
            omitted += 1;
            continue;
        }
        candidates.push({
            guestId: guest.id,
            accountDocumentId,
            document: { ...guest, id: accountDocumentId },
        });
    }
    return { candidates, omitted, room };
}

/**
 * Commit every candidate as its own explicit Save, then trigger exactly ONE outbox pass — never
 * one per song. `accountSync.save` only commits locally and queues the operation; nothing here
 * sends a request over the network until the single `accountSync.run()` at the end, and that pass
 * is fire-and-forget: offline or mid-flight, the outbox already owns retrying it safely, and the
 * per-song sync status the songbook already renders (`SyncStatus`) is what reports the outcome
 * from here on — this function's job ends at "committed locally and queued".
 *
 * `onProgress` reports songs actually COPIED so far, after each write rather than before it: a
 * count published in front of the `await` claims a Save that has not happened yet, and a write
 * that then fails would have been counted.
 */
export async function adoptGuestSongs(
    candidates: AdoptCandidate[],
    onProgress?: (copied: number, total: number) => void,
): Promise<AdoptResult> {
    let adopted = 0;
    const failures: AdoptFailure[] = [];
    for (const candidate of candidates) {
        try {
            await accountSync.save(candidate.document, null);
            adopted += 1;
        } catch (error) {
            if (error instanceof LocalRevisionError) {
                // This device already holds this deterministic id — an earlier, interrupted copy
                // got this far. That is retry-safety working, not a failure.
                adopted += 1;
            } else {
                failures.push({
                    guestId: candidate.guestId,
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        }
        onProgress?.(adopted, candidates.length);
    }
    if (adopted > 0) {
        void accountSync.run();
    }
    return { adopted, failures };
}

const DECIDED_PREFIX = 'ensemble-v2-account-adopt-decided:';

/**
 * Per-device, per-owner (rollout decision 9 S3: one account per profile, but a device can still
 * sign into a different account later): has this device already been asked, and answered, once?
 * A per-device convenience, never a document field — same posture as `lib/session.ts`'s
 * preferences, keyed by owner so a different account on the same device is asked its own once.
 */
export function hasDecidedAdoption(ownerId: string): boolean {
    try {
        return localStorage.getItem(DECIDED_PREFIX + ownerId) !== null;
    } catch {
        // Unreadable storage: default to not nagging rather than prompting on every render.
        return true;
    }
}

export function rememberAdoptionDecision(ownerId: string): void {
    try {
        localStorage.setItem(DECIDED_PREFIX + ownerId, new Date().toISOString());
    } catch {
        // Best-effort preference; a future session asking again is safe either way.
    }
}
