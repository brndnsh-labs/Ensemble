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
