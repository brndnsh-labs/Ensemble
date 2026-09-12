import {
    exceedsUtf8ByteLimit,
    SONGBOOK_MAX_INPUT_BYTES,
} from '../../../../public/songbook/structural-limits.js';
import { type ChartDocument, digest, identifier, remoteRevision, snapshot } from './protocol';

/**
 * Canonical decoder for a received explicit-Save request.
 *
 * This is the server-side counterpart to `AccountSongbook.prepare`, which freezes exactly one
 * byte sequence per operation. It is a pure function: it validates and returns, and it
 * persists, sends and logs nothing.
 *
 * **It is not authentication.** `trustedOwnerId` is a caller contract — the route must have
 * already established that identity from a verified session, and must still enforce
 * same-origin policy, bound its streaming input before handing a string here, and use
 * server-side ownership predicates on every query. Passing an attacker-supplied owner here
 * would defeat the check below rather than satisfy it.
 */

/** The envelope `prepare()` writes, in the exact order it writes it. */
const ENVELOPE_KEYS = [
    'protocolVersion',
    'ownerId',
    'documentId',
    'operationId',
    'expectedRevision',
    'document',
] as const;

export const SAVE_REQUEST_PROTOCOL_VERSION = 1;

/**
 * The document limit plus a 4 KiB envelope allowance, so a chart that is itself legal near the
 * document ceiling still fits once wrapped. The document limit is enforced independently by
 * the portable codec, so this ceiling can never be the only thing standing between a hostile
 * body and the validators.
 */
export const SAVE_REQUEST_ENVELOPE_ALLOWANCE = 4096;
export const MAX_SAVE_REQUEST_BYTES = SONGBOOK_MAX_INPUT_BYTES + SAVE_REQUEST_ENVELOPE_ALLOWANCE;

export interface DecodedSaveRequest {
    ownerId: string;
    documentId: string;
    operationId: string;
    expectedRevision: string | null;
    /** SHA-256 of the received bytes, never of a re-serialized substitute. */
    digest: string;
    document: ChartDocument;
}

/**
 * Every *rejection of a request* is this type, and no message ever contains chart text,
 * import source, identifiers or any fragment of the body — a rejected request is frequently
 * the one worth logging, and a decoder that echoes content turns its own error path into a
 * disclosure.
 *
 * An environment failure is deliberately NOT this type: if `crypto.subtle` is unavailable the
 * underlying TypeError propagates unwrapped, because that is a broken server rather than a bad
 * request and must not be mapped to a 400. Route code should therefore branch on
 * `instanceof SaveRequestError` rather than assuming every rejection is one.
 */
export class SaveRequestError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SaveRequestError';
    }
}

/**
 * Returns a narrowed `string` rather than asserting one. `identifier()` is an assertion
 * function, and an assertion made inside a `try` does not narrow outside it — so a caller
 * would be left casting, and a future relaxation of `identifier()` would let a non-string
 * through a cast silently. Narrowing here keeps the type honest at the return site.
 */
function requireIdentifier(value: unknown): string {
    if (typeof value !== 'string') {
        throw new SaveRequestError('Save request contains an invalid identifier.');
    }
    try {
        identifier(value);
    } catch {
        throw new SaveRequestError('Save request contains an invalid identifier.');
    }
    return value;
}

function requireExpectedRevision(value: unknown): string | null {
    // Null is a real value here: it means "this Save creates the document".
    if (value === null) {
        return null;
    }
    if (typeof value !== 'string') {
        throw new SaveRequestError('Save request expected revision is not a valid revision.');
    }
    try {
        remoteRevision(value);
    } catch {
        throw new SaveRequestError('Save request expected revision is not a valid revision.');
    }
    return value;
}

function envelope(candidate: unknown): Record<string, unknown> {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new SaveRequestError('Save request must be a JSON object.');
    }
    const record = candidate as Record<string, unknown>;
    const keys = Object.keys(record);
    // Exact key set AND order. `prepare()` emits one serialization; anything else is either a
    // different producer or a tampered body, and neither may be normalised into acceptance.
    if (
        keys.length !== ENVELOPE_KEYS.length ||
        keys.some((key, index) => key !== ENVELOPE_KEYS[index])
    ) {
        throw new SaveRequestError('Save request envelope is not in the canonical form.');
    }
    return record;
}

/**
 * Decode and validate a received Save request against an independently authenticated owner.
 *
 * Rejects on: a non-string or oversized body, malformed JSON, a non-canonical envelope
 * (unknown, missing, reordered or duplicated keys, or any alternate serialization such as
 * added whitespace), an unsupported protocol version, invalid identifiers or expected
 * revision, an owner that is not the authenticated one, a document whose identity disagrees
 * with the envelope, and any document the portable codec will not accept.
 */
export async function decodeSaveRequest(
    body: unknown,
    trustedOwnerId: unknown,
): Promise<DecodedSaveRequest> {
    // The authenticated identity is checked first: a malformed caller contract is a server
    // bug, and must never be reported as though the request itself were at fault.
    if (typeof trustedOwnerId !== 'string') {
        throw new SaveRequestError('An authenticated owner is required to decode a Save request.');
    }
    try {
        identifier(trustedOwnerId);
    } catch {
        throw new SaveRequestError('The authenticated owner is not a valid account identifier.');
    }

    if (typeof body !== 'string') {
        throw new SaveRequestError('Save request body must be a string.');
    }
    // Measured before parsing, so an oversized body is refused without building a tree from it.
    if (exceedsUtf8ByteLimit(body, MAX_SAVE_REQUEST_BYTES)) {
        throw new SaveRequestError(`Save request exceeds ${MAX_SAVE_REQUEST_BYTES} UTF-8 bytes.`);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        // Deliberately not including the parser's message: it quotes the offending input.
        throw new SaveRequestError('Save request is not valid JSON.');
    }

    const record = envelope(parsed);
    if (record.protocolVersion !== SAVE_REQUEST_PROTOCOL_VERSION) {
        throw new SaveRequestError('Unsupported Save protocol version.');
    }

    const ownerId = requireIdentifier(record.ownerId);
    const documentId = requireIdentifier(record.documentId);
    const operationId = requireIdentifier(record.operationId);
    // The envelope's own claim about its owner is never authority; it must agree with the
    // identity the caller authenticated, or this request belongs to somebody else.
    if (ownerId !== trustedOwnerId) {
        throw new SaveRequestError('Save request owner does not match the authenticated account.');
    }

    const expectedRevision = requireExpectedRevision(record.expectedRevision);

    // The portable codec owns chart validity, version support, structural limits and the
    // document byte ceiling. It also detaches, so the returned document shares no reference
    // with the parsed body.
    let document: ChartDocument;
    try {
        document = snapshot(record.document);
    } catch {
        throw new SaveRequestError('Save request document is not a supported chart.');
    }
    // The document limit is enforced INDEPENDENTLY of this file's request ceiling, by
    // `prepareCandidate` inside the call above: it measures the document's own UTF-8 bytes
    // against SONGBOOK_MAX_INPUT_BYTES before any schema walk. So the envelope allowance can
    // never become extra room for chart content. A second check here would be dead code —
    // measured, not assumed: an oversized document always fails `snapshot()` first, and a
    // duplicate `JSON.stringify` of a megabyte document is real work for no coverage.
    //
    // Portable charts carry no owner field and none is added or inferred here; identity is
    // proven by the document's own id agreeing with the envelope it arrived in.
    if (document.id !== documentId) {
        throw new SaveRequestError('Save request document identity does not match its envelope.');
    }

    // Reconstruct what `prepare()` would have written for exactly these validated values. Any
    // difference — reordered or duplicated envelope keys, added whitespace, an alternate
    // number or string encoding — means the received bytes are not the canonical request, and
    // the canonical form is NOT substituted for them: the request is refused instead, so a
    // rewritten body can never be committed under an existing operation ID.
    //
    // KNOWN ASYMMETRY, and the reason this comment is longer than the code. How tightly the
    // DOCUMENT is pinned depends on its schema version, because `snapshot()` behaves
    // differently for each:
    //   v1 — `validateChartDocument` REBUILDS the document in its own field order, so this
    //        comparison pins one byte sequence per logical chart. Key-shuffled v1 bodies are
    //        rejected.
    //   v2 — `validateChartDocumentV2` returns the detached parsed candidate with the
    //        caller's key order intact, so the reconstruction echoes whatever order arrived.
    //        A key-shuffled v2 body is ACCEPTED, and hashes to a different digest.
    // That is not an integrity hole: every schema object is allowlisted, so no extra content
    // can ride along in either version, and the outbox only ever sends bytes it froze once.
    // But a receipt service keyed on (operationId, digest) must treat the digest as "the bytes
    // this attempt sent", not "the identity of this document" — which is exactly how the sync
    // contract already specifies it (same bytes replay, different bytes under one ID reject).
    // Normalising v2 ordering would have to happen in the portable codec, not here; changing
    // the chart schema or the wire format is explicitly out of scope for this decoder.
    const canonical = JSON.stringify({
        protocolVersion: SAVE_REQUEST_PROTOCOL_VERSION,
        ownerId,
        documentId,
        operationId,
        expectedRevision,
        document,
    });
    if (canonical !== body) {
        throw new SaveRequestError('Save request bytes are not the canonical serialization.');
    }

    return {
        ownerId,
        documentId,
        operationId,
        expectedRevision,
        // Hash the bytes actually received, never a re-serialized substitute.
        digest: await digest(body),
        document,
    };
}
