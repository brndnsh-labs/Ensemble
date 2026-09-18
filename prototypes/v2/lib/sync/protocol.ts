import { validateChartDocument } from '../../../../public/songbook/codec.js';
import { validateChartDocumentV2 } from '../../../../public/songbook/document-v2.js';
import type { ChartDocumentV2 } from '../../../../public/songbook/score-types.js';
import type { ChartDocument as LegacyDocument } from '../../../../public/songbook/types.js';

export type ChartDocument = LegacyDocument | ChartDocumentV2;

export const ACCOUNT_DATABASE = 'ensemble-v2-account-songbook';
export const MAX_PENDING_SAVES = 64;

/** Local routing context, NOT authentication. The eventual server must check the owner. */
export interface AccountScope {
    ownerId: string;
    generation: number;
}

export interface SavedSong {
    ownerId: string;
    documentId: string;
    document: ChartDocument;
    remoteRevision: string | null;
}

export interface Draft {
    ownerId: string;
    documentId: string;
    writerId: string;
    document: ChartDocument;
    baseRevision: number | null;
    capturedAt: string;
}

export interface RemoteVersion {
    revision: string;
    document: ChartDocument;
}

export type UnsupportedReason = 'needs-app-update' | 'invalid';

/**
 * What a library download learned about one document and was NOT allowed to apply to the saved
 * record. Exactly one record per (owner, document), because the three kinds are mutually
 * exclusive outcomes of the same question — "the cloud moved, can this device adopt it?":
 *
 * - `version`: the remote body is valid but local work would be lost by adopting it (a draft, a
 *   queued Save, or the chart currently on the stand). Kept beside the untouched saved record
 *   so a later Keep-both/adopt decision has both sides to show.
 * - `deleted`: the cloud tombstoned a document this device still has divergent local work for.
 *   The local work stays; this is the flag that explains why the cloud copy is gone.
 * - `unsupported`: the body could not be validated — a newer `schemaVersion` this build has no
 *   decoder for, or a corrupt record. `body` is the observed value, preserved and NEVER passed
 *   through `snapshot()`, migrated or coerced; it is untrusted data for display and export only.
 */
export type RemoteOutcome = {
    documentId: string;
    revision: string;
} & (
    | ({ kind: 'version' } & Pick<RemoteVersion, 'document'>)
    | { kind: 'deleted' }
    | { kind: 'unsupported'; body: unknown; reason: UnsupportedReason }
);

/** The stored form: the same observation, bound to an owner and its `meta` key. */
export type RemoteCandidate = RemoteOutcome & { key: string; ownerId: string };

/**
 * Remote candidates live in the `meta` store rather than a store of their own: adding one would
 * need an IndexedDB version bump on a database that already exists wherever this app has run,
 * and a schema upgrade is a destructive-data decision that a download feature does not get to
 * make on its own. `meta` is a generic keyed store (keyPath `'key'`), is already inside every
 * transaction's scope in `AccountDatabase.run` — so a candidate and a saved record still commit
 * together — and its only other key is `'active'`.
 *
 * The identifier grammar excludes `':'`, so this composition is unambiguous: no owner or
 * document ID can be spelled to collide with another's key or with `'active'`.
 */
export function candidatePrefix(ownerId: string): string {
    identifier(ownerId);
    return `remote:${ownerId}:`;
}

export function candidateKey(ownerId: string, documentId: string): string {
    identifier(documentId);
    return `${candidatePrefix(ownerId)}${documentId}`;
}

/**
 * The frozen half of an explicit cloud deletion (#1270), keyed into the SAME generic `meta` store
 * the remote candidates live in — and for the same reason: a store of its own would need an
 * IndexedDB version bump on a database that already exists wherever this app has run, and a schema
 * upgrade is a destructive-data decision a delete feature does not get to make on its own.
 *
 * `'delete:'` sorts strictly below `'remote:'`, so `remoteCandidates`' prefix range cannot see one,
 * and the `'active'` pointer sorts below both. The identifier grammar excludes `':'`, so no owner
 * or document ID can be spelled to collide across the two namespaces.
 *
 * It is persisted BEFORE the request leaves, and that is the whole point: a lost response (the tab
 * closed, the network died mid-flight) leaves the server's receipt written and this device unsure.
 * Retrying with the SAME operation id is what makes the second attempt a replay the server answers
 * from its receipt rather than a second delete — so the id has to outlive a reload, which a
 * module-level variable would not.
 */
export function deletionKey(ownerId: string, documentId: string): string {
    identifier(ownerId);
    identifier(documentId);
    return `delete:${ownerId}:${documentId}`;
}

/** The stored frozen delete. Four scalars: everything the canonical request bytes are made of. */
export interface PendingDeletion {
    key: string;
    ownerId: string;
    documentId: string;
    operationId: string;
    /** The confirmed remote revision this delete was aimed at. Never null: see `DeleteCommand`. */
    expectedRevision: string;
}

export interface PreparedDelete {
    ownerId: string;
    documentId: string;
    operationId: string;
    expectedRevision: string;
    body: string;
    digest: string;
}

/**
 * The canonical delete envelope, in the exact key set and ORDER the server's decoder pins
 * (`prototypes/v2-api/src/http/document-delete-request.ts`, which rebuilds this string and refuses
 * a body that differs by so much as a space).
 *
 * Unlike a Save, this is DERIVED at send time rather than frozen as bytes. A Save freezes its
 * `wireBody` because the document inside it is a whole chart that keeps being edited; a delete is
 * four scalars that `PendingDeletion` already holds immutably, so re-deriving them is byte-identical
 * by construction and there is no second copy to keep in agreement with the first.
 */
export function deleteBody(request: Omit<PendingDeletion, 'key'>): string {
    identifier(request.ownerId);
    identifier(request.documentId);
    identifier(request.operationId);
    remoteRevision(request.expectedRevision);
    return JSON.stringify({
        ownerId: request.ownerId,
        documentId: request.documentId,
        operationId: request.operationId,
        expectedRevision: request.expectedRevision,
    });
}

export type DeleteReply = {
    ownerId: string;
    documentId: string;
    operationId: string;
    digest: string;
    revision: string;
} & ({ kind: 'deleted' } | { kind: 'conflict' });

/**
 * Validate a delete reply before starting an IDB write, exactly as `reply()` does for a Save.
 *
 * The 409 conflict body carries a `remote` version too, and it is deliberately NOT read here: a
 * delete conflict is reported, never resolved — the id is still live at a revision this request did
 * not expect, and the next library download is what brings that version in under the ordinary
 * preservation rules. Decoding it here would put a second adoption path beside `reconcile`'s.
 */
export function deleteReply(candidate: unknown, request: PreparedDelete): DeleteReply {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new Error('Invalid delete response. Nothing was removed from this device.');
    }
    const value = candidate as Record<string, unknown>;
    if (
        value.ownerId !== request.ownerId ||
        value.documentId !== request.documentId ||
        value.operationId !== request.operationId ||
        value.digest !== request.digest ||
        (value.kind !== 'deleted' && value.kind !== 'conflict')
    ) {
        throw new Error('Delete response does not match the request.');
    }
    remoteRevision(value.revision);
    return {
        ownerId: request.ownerId,
        documentId: request.documentId,
        operationId: request.operationId,
        digest: request.digest,
        revision: value.revision,
        kind: value.kind,
    };
}

export interface SaveOperation {
    ownerId: string;
    documentId: string;
    operationId: string;
    localRevision: number;
    snapshot: ChartDocument;
    base: { revision: string | null } | { operationId: string };
    wireBody: string | null;
    status: 'queued' | 'conflict';
    // null is an explicit missing/deleted remote song; undefined means no conflict.
    remote?: RemoteVersion | null;
}

export interface PreparedSave {
    ownerId: string;
    documentId: string;
    operationId: string;
    body: string;
    digest: string;
}

export interface SaveReceipt {
    ownerId: string;
    documentId: string;
    operationId: string;
    digest: string;
    revision: string;
}

export type SaveReply = SaveReceipt &
    ({ kind: 'committed' } | { kind: 'conflict'; remote: RemoteVersion | null });

export class AccountChangedError extends Error {
    constructor() {
        super('The active account changed. This work remains with its original account.');
    }
}

export class LocalRevisionError extends Error {
    constructor() {
        super('This song was saved elsewhere. Your draft is preserved; reopen or save a copy.');
    }
}

export function identifier(value: unknown): asserts value is string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
        throw new Error('Invalid sync identifier.');
    }
}

export function localRevision(value: unknown): asserts value is number | null {
    if (value !== null && (!Number.isSafeInteger(value) || (value as number) < 0)) {
        throw new Error('Invalid local revision.');
    }
}

export function remoteRevision(value: unknown): asserts value is string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(value)) {
        throw new Error('Invalid remote revision.');
    }
}

export function snapshot(candidate: unknown): ChartDocument {
    const legacy = validateChartDocument(candidate);
    const decoded =
        legacy.kind === 'future-version' && legacy.schemaVersion === 2
            ? validateChartDocumentV2(candidate)
            : legacy;
    if (decoded.kind !== 'ok') {
        throw new Error('Cannot sync this chart version or content. The source is unchanged.');
    }
    identifier(decoded.value.id);
    return decoded.value;
}

export async function digest(body: string): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Validate the reply before starting an IDB write; never store arbitrary transport objects. */
export function reply(candidate: unknown, request: PreparedSave): SaveReply {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new Error('Invalid Save response. The queued snapshot is unchanged.');
    }
    const value = candidate as Record<string, unknown>;
    if (
        value.ownerId !== request.ownerId ||
        value.documentId !== request.documentId ||
        value.operationId !== request.operationId ||
        value.digest !== request.digest ||
        (value.kind !== 'committed' && value.kind !== 'conflict')
    ) {
        throw new Error('Save response does not match the queued request.');
    }
    remoteRevision(value.revision);
    const receipt: SaveReceipt = {
        ownerId: request.ownerId,
        documentId: request.documentId,
        operationId: request.operationId,
        digest: request.digest,
        revision: value.revision,
    };
    if (value.kind === 'committed') {
        return { ...receipt, kind: 'committed' };
    }
    if (value.remote === null) {
        return { ...receipt, kind: 'conflict', remote: null };
    }
    if (!value.remote || typeof value.remote !== 'object' || Array.isArray(value.remote)) {
        throw new Error('Invalid remote conflict version.');
    }
    const remote = value.remote as Record<string, unknown>;
    remoteRevision(remote.revision);
    const document = snapshot(remote.document);
    if (document.id !== request.documentId || remote.revision !== value.revision) {
        throw new Error('Remote conflict version does not match this song.');
    }
    return { ...receipt, kind: 'conflict', remote: { revision: remote.revision, document } };
}
