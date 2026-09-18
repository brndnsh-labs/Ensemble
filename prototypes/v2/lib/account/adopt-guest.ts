/**
 * Copy this device's guest songs into the signed-in account (#1268).
 *
 * Everyone plays as a guest before they have an account, and this is the one-time, opt-in bridge:
 * every guest song becomes its own explicit Save in the account songbook. It never touches the
 * guest store — `lib/repository.ts` is read here through `list()` only, never `save()` — and the
 * guest songbook is untouched no matter how a copy attempt ends, including mid-copy.
 *
 * **Retry-safe by construction.** Both the account document id and the Save operation id are
 * derived deterministically from `(ownerId, guestId)` alone — never from the guest song's content,
 * revision or timestamps, via the same SHA-256 `digest()` the Save wire protocol already uses
 * (`lib/sync/protocol.ts`). The document id is what does the real work: `computeAdoptCandidates`
 * filters out any guest song whose deterministic account document id is already present, so a
 * rerun after an interruption only offers what is genuinely still missing — that is what makes
 * "interrupt mid-copy, rerun" land on exactly N account songs, not more.
 *
 * The operation id is the same story's belt to that document id's suspenders: if the filter above
 * were ever bypassed (a stale candidate list read a moment before an interruption, say),
 * `AccountSongbook.save` still refuses to recreate a document id it already holds locally
 * (`LocalRevisionError`, treated here as success — the interrupted copy already got that song in).
 * It is deliberately NOT relied on for a server-side replay across a genuinely lost local record:
 * `save()` stamps `updatedAt` with `Date.now()` on every call regardless of the candidate's own
 * timestamps, so two calls for the same id on two different days would not send byte-identical
 * wire bodies even under the same operation id, and the server's idempotent receipt only replays
 * an EXACT byte match. The one guarantee this file makes is the one the acceptance test asks for:
 * the local document-id check, not a server-side replay across data loss.
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
import { accountSync } from './sync-loop';

export interface AdoptCandidate {
    guestId: string;
    accountDocumentId: string;
    operationId: string;
    document: ChartDocument;
}

export interface AdoptFailure {
    guestId: string;
    message: string;
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
 * Every guest song this owner does not already hold in their account, paired with the
 * deterministic account document id and Save operation id it will use if adopted.
 *
 * Reads the guest songbook (`repository.list()`) and the account library (`accountSync.listLibrary()`)
 * fresh on every call rather than trusting a caller's cached lists — this is what makes "rerun
 * after an interruption" mean something: a candidate here is one this device can currently prove
 * is missing, not one that was missing the last time somebody asked.
 */
export async function computeAdoptCandidates(ownerId: string): Promise<AdoptCandidate[]> {
    const [guestSongs, accountSongs] = await Promise.all([
        repository.list(),
        accountSync.listLibrary(),
    ]);
    const known = new Set(accountSongs.map((song) => song.documentId));
    const candidates: AdoptCandidate[] = [];
    for (const guest of guestSongs) {
        const accountDocumentId = `guest-${await stableId('adopt-doc', ownerId, guest.id)}`;
        if (known.has(accountDocumentId)) {
            continue;
        }
        const operationId = await stableId('adopt-op', ownerId, guest.id);
        candidates.push({
            guestId: guest.id,
            accountDocumentId,
            operationId,
            document: { ...guest, id: accountDocumentId },
        });
    }
    return candidates;
}

/**
 * Commit every candidate as its own explicit Save, then trigger exactly ONE outbox pass — never
 * one per song. `accountSync.save` only commits locally and queues the operation; nothing here
 * sends a request over the network until the single `accountSync.run()` at the end, and that pass
 * is fire-and-forget: offline or mid-flight, the outbox already owns retrying it safely, and the
 * per-song sync status the songbook already renders (`SyncStatus`) is what reports the outcome
 * from here on — this function's job ends at "committed locally and queued".
 */
export async function adoptGuestSongs(
    candidates: AdoptCandidate[],
    onProgress?: (current: number, total: number) => void,
): Promise<AdoptResult> {
    let adopted = 0;
    const failures: AdoptFailure[] = [];
    for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        onProgress?.(index + 1, candidates.length);
        try {
            await accountSync.save(candidate.document, null, candidate.operationId);
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
