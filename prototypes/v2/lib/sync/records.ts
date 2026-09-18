import {
    type AccountScope,
    candidateKey,
    type Draft,
    deletionKey,
    identifier,
    localRevision,
    type PendingDeletion,
    type RemoteCandidate,
    type RemoteOutcome,
    remoteRevision,
    type SavedSong,
    type SaveOperation,
    snapshot,
    type UnsupportedReason,
} from './protocol';

export function copyScope(scope: AccountScope): AccountScope {
    identifier(scope?.ownerId);
    localRevision(scope.generation);
    if (scope.generation === null || scope.generation < 1) {
        throw new Error('Invalid account generation.');
    }
    // A caller changing its session object while IDB/crypto awaits cannot retarget this call.
    return { ownerId: scope.ownerId, generation: scope.generation };
}

function owned(value: { ownerId: string; documentId: string }, scope: AccountScope, id: string) {
    if (!value || value.ownerId !== scope.ownerId || value.documentId !== id) {
        throw new Error('Invalid account record ownership. Stored source is unchanged.');
    }
}

export function savedSong(value: SavedSong, scope: AccountScope, id: string): SavedSong {
    owned(value, scope, id);
    const document = snapshot(value.document);
    if (document.id !== id) {
        throw new Error('Stored chart identity does not match its record.');
    }
    if (value.remoteRevision !== null) {
        remoteRevision(value.remoteRevision);
    }
    return {
        ownerId: scope.ownerId,
        documentId: id,
        document,
        remoteRevision: value.remoteRevision,
    };
}

export function savedDraft(value: Draft, scope: AccountScope, id: string): Draft {
    owned(value, scope, id);
    identifier(value.writerId);
    localRevision(value.baseRevision);
    const document = snapshot(value.document);
    if (
        document.id !== id ||
        typeof value.capturedAt !== 'string' ||
        !Number.isFinite(Date.parse(value.capturedAt))
    ) {
        throw new Error('Invalid stored draft. Source is unchanged.');
    }
    return { ...value, document };
}

const UNSUPPORTED_REASONS: readonly UnsupportedReason[] = ['needs-app-update', 'invalid'];

/**
 * Validate one remote observation BEFORE a transaction opens, and rebuild it from the validated
 * fields only — a transport object never reaches storage with stray members, the same posture
 * `reply()` takes for a Save response.
 *
 * `body` on an unsupported observation is the one thing deliberately left unvalidated: it is
 * preserved exactly as observed, because refusing it here would discard the only copy this
 * device has of a document it cannot yet read. Nothing downstream may treat it as a chart.
 */
export function remoteOutcome(value: RemoteOutcome): RemoteOutcome {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid remote observation.');
    }
    identifier(value.documentId);
    remoteRevision(value.revision);
    const documentId = value.documentId;
    const revision = value.revision;
    if (value.kind === 'version') {
        const document = snapshot(value.document);
        if (document.id !== documentId) {
            throw new Error('Remote version identity does not match its document.');
        }
        return { kind: 'version', documentId, revision, document };
    }
    if (value.kind === 'deleted') {
        return { kind: 'deleted', documentId, revision };
    }
    if (value.kind === 'unsupported') {
        if (!UNSUPPORTED_REASONS.includes(value.reason)) {
            throw new Error('Invalid unsupported-body reason.');
        }
        return {
            kind: 'unsupported',
            documentId,
            revision,
            body: value.body,
            reason: value.reason,
        };
    }
    throw new Error('Unknown remote observation kind.');
}

/** Reading a candidate re-proves its ownership and its key, never only the record it sits at. */
export function savedCandidate(
    value: RemoteCandidate,
    scope: AccountScope,
    id: string,
): RemoteCandidate {
    owned(value, scope, id);
    if (value.key !== candidateKey(scope.ownerId, id)) {
        throw new Error('Stored remote candidate does not match its key.');
    }
    return Object.assign({ key: value.key, ownerId: scope.ownerId }, remoteOutcome(value));
}

/**
 * Re-prove a stored frozen delete (#1270) against the scope AND its own key, never only the record
 * it was found at — the same posture `savedCandidate` takes, and for the same reason: `meta` is one
 * generic keyed store shared by three namespaces, so the key is part of the record's identity.
 */
export function savedDeletion(
    value: PendingDeletion,
    scope: AccountScope,
    id: string,
): PendingDeletion {
    owned(value, scope, id);
    if (value.key !== deletionKey(scope.ownerId, id)) {
        throw new Error('Stored pending deletion does not match its key.');
    }
    identifier(value.operationId);
    remoteRevision(value.expectedRevision);
    return {
        key: value.key,
        ownerId: scope.ownerId,
        documentId: id,
        operationId: value.operationId,
        expectedRevision: value.expectedRevision,
    };
}

export function savedOperation(
    value: SaveOperation,
    scope: AccountScope,
    id: string,
): SaveOperation {
    owned(value, scope, id);
    identifier(value.operationId);
    localRevision(value.localRevision);
    const document = snapshot(value.snapshot);
    if (
        document.id !== id ||
        document.revision !== value.localRevision ||
        !['queued', 'conflict'].includes(value.status)
    ) {
        throw new Error('Invalid queued Save. Source is unchanged.');
    }
    if (!value.base || typeof value.base !== 'object' || Object.keys(value.base).length !== 1) {
        throw new Error('Invalid Save predecessor.');
    }
    if ('revision' in value.base) {
        if (value.base.revision !== null) {
            remoteRevision(value.base.revision);
        }
    } else {
        identifier(value.base.operationId);
    }
    if (value.wireBody !== null) {
        if (typeof value.wireBody !== 'string' || value.wireBody.length > 2_100_000) {
            throw new Error('Invalid frozen Save request.');
        }
        const body = JSON.parse(value.wireBody);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            throw new Error('Invalid frozen Save request.');
        }
        if (body.expectedRevision !== null) {
            remoteRevision(body.expectedRevision);
        }
        // Our wire format is canonical and fixed before sending. Never trust replacement
        // bytes from a corrupt/future record, even when a snapshot beside them looks valid.
        const expected = JSON.stringify({
            protocolVersion: 1,
            ownerId: scope.ownerId,
            documentId: id,
            operationId: value.operationId,
            expectedRevision: body.expectedRevision,
            document,
        });
        if (
            expected !== value.wireBody ||
            ('revision' in value.base && value.base.revision !== body.expectedRevision)
        ) {
            throw new Error('Frozen request does not match its queued Save.');
        }
    }
    if (value.status === 'conflict') {
        if (value.remote === undefined) {
            throw new Error('Conflict has no preserved remote version.');
        }
        if (value.remote !== null) {
            remoteRevision(value.remote.revision);
            const remote = snapshot(value.remote.document);
            if (remote.id !== id) {
                throw new Error('Invalid remote conflict identity.');
            }
        }
    }
    return { ...value, snapshot: document };
}
