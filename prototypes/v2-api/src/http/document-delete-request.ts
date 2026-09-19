import { digest, identifier, remoteRevision } from '../../../v2/lib/sync/protocol.js';

/**
 * Canonical decoder for a received explicit-delete request (#1260).
 *
 * The Save path decodes with `prototypes/v2/lib/sync/request.ts`, which is SHARED with the client
 * because the client's `prepare()` is the producer of those bytes. There is no client producer for
 * a delete yet — `prototypes/v2/lib/sync/protocol.ts` has no delete operation type and no tombstone
 * receipt shape (checked, not assumed) — and wiring one is #1270. So this is the smallest server
 * contract that the client can later mirror, and it lives here rather than in the shared module:
 * putting a request shape in the shared bundle before the client produces it would be inventing
 * the client's half of the protocol from the server side.
 *
 * It borrows the shared VALIDATORS rather than re-expressing them (`identifier`, `remoteRevision`,
 * `digest`), so the ids and revisions this route accepts are exactly the language the Save path
 * writes and the database holds — a delete route with its own regex would be validating a
 * different language from the one it deletes out of.
 *
 * **It is not authentication.** `trustedOwnerId` is a caller contract: the route must already have
 * established that identity from a verified session. Passing anything the request supplied would
 * defeat the owner check below rather than satisfy it.
 */

/**
 * The exact envelope, in the exact order a producer must write it. Mirrors the Save envelope's
 * field NAMES (`ownerId`/`documentId`/`operationId`/`expectedRevision`) so one client-side
 * vocabulary covers both operations.
 *
 * Deliberately no `protocolVersion`, which the Save envelope does carry: this is the smallest
 * contract that the acceptance asks for, and the exact-key-set-and-order check below already makes
 * adding ANY field a breaking change that an old server refuses rather than misreads — which is
 * the property a version field buys. #1270 owns the client half and may add one; if it does, it is
 * a new shape here, not a relaxation of this check.
 */
const ENVELOPE_KEYS = ['ownerId', 'documentId', 'operationId', 'expectedRevision'] as const;

/**
 * 1 KiB. The whole request is four values whose grammars cap them: three identifiers at 128
 * characters (`identifier`) and one revision at 200 (`remoteRevision`), all from character sets
 * that need no JSON escaping — so the largest legal body is 653 bytes, and this leaves room for a
 * producer's whitespace-free envelope without leaving room for anything else.
 *
 * It exists because the `/api/documents/` prefix is EXEMPT from the parent app's 64 KB limit
 * (`http/app.ts`), so without a route-level limit this endpoint would inherit the Save sub-app's
 * ~1 MiB ceiling — a megabyte of buffering for a request that can never exceed 653 bytes.
 */
export const MAX_DELETE_REQUEST_BYTES = 1024;

export interface DecodedDeleteRequest {
    ownerId: string;
    documentId: string;
    operationId: string;
    expectedRevision: string;
    /** SHA-256 of the received bytes, never of a re-serialized substitute. */
    digest: string;
}

/**
 * Every rejection of a request is this type, and no message ever contains an identifier or any
 * fragment of the body — a rejected request is frequently the one worth logging, and a decoder
 * that echoes content turns its own error path into a disclosure. Same contract, and same reason,
 * as `SaveRequestError`: an ENVIRONMENT failure (a missing `crypto.subtle`) deliberately is NOT
 * this type, so the route can answer 400 for a bad request and 500 for a broken server.
 */
export class DeleteRequestError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DeleteRequestError';
    }
}

/**
 * Returns a narrowed `string` rather than asserting one: `identifier()` is an assertion function,
 * and an assertion made inside a `try` does not narrow outside it, so a caller would be left
 * casting. Same helper, same reason, as `requireIdentifier` in the shared Save decoder.
 */
function requireIdentifier(value: unknown): string {
    if (typeof value !== 'string') {
        throw new DeleteRequestError('Delete request contains an invalid identifier.');
    }
    try {
        identifier(value);
    } catch {
        throw new DeleteRequestError('Delete request contains an invalid identifier.');
    }
    return value;
}

function requireExpectedRevision(value: unknown): string {
    // No `null` form, unlike Save: `null` there means "this operation creates the document", and
    // there is nothing to create here. A caller that has never seen a revision for an id has
    // nothing to delete.
    if (typeof value !== 'string') {
        throw new DeleteRequestError('Delete request expected revision is not a valid revision.');
    }
    try {
        remoteRevision(value);
    } catch {
        throw new DeleteRequestError('Delete request expected revision is not a valid revision.');
    }
    return value;
}

function envelope(candidate: unknown): Record<string, unknown> {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new DeleteRequestError('Delete request must be a JSON object.');
    }
    const record = candidate as Record<string, unknown>;
    const keys = Object.keys(record);
    // Exact key set AND order. One serialization per operation; anything else is either a
    // different producer or a tampered body, and neither may be normalised into acceptance.
    if (
        keys.length !== ENVELOPE_KEYS.length ||
        keys.some((key, index) => key !== ENVELOPE_KEYS[index])
    ) {
        throw new DeleteRequestError('Delete request envelope is not in the canonical form.');
    }
    return record;
}

/**
 * Decode and validate a received delete request against an independently authenticated owner.
 *
 * Rejects on: a non-string or oversized body, malformed JSON, a non-canonical envelope (unknown,
 * missing, reordered or duplicated keys, or any alternate serialization such as added whitespace),
 * invalid identifiers, a missing or malformed expected revision, and an owner that is not the
 * authenticated one.
 *
 * The canonical-bytes check is what makes the receipt's digest mean "the bytes this attempt sent":
 * a rewritten body can never be committed under an operation id that already committed, because
 * the rewrite is refused here before the transaction ever reads a receipt.
 */
export async function decodeDeleteRequest(
    body: unknown,
    trustedOwnerId: unknown,
): Promise<DecodedDeleteRequest> {
    // The authenticated identity is checked first: a malformed caller contract is a server bug,
    // and must never be reported as though the request itself were at fault.
    if (typeof trustedOwnerId !== 'string') {
        throw new DeleteRequestError(
            'An authenticated owner is required to decode a delete request.',
        );
    }
    try {
        identifier(trustedOwnerId);
    } catch {
        throw new DeleteRequestError('The authenticated owner is not a valid account identifier.');
    }

    if (typeof body !== 'string') {
        throw new DeleteRequestError('Delete request body must be a string.');
    }
    // Measured before parsing, so an oversized body is refused without building a tree from it.
    // The route's own `bodyLimit` normally refuses one first; this is the in-process backstop that
    // holds whatever the transport did, the same division of labour the Save decoder has.
    if (Buffer.byteLength(body, 'utf8') > MAX_DELETE_REQUEST_BYTES) {
        throw new DeleteRequestError(
            `Delete request exceeds ${MAX_DELETE_REQUEST_BYTES} UTF-8 bytes.`,
        );
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        // Deliberately not including the parser's message: it quotes the offending input.
        throw new DeleteRequestError('Delete request is not valid JSON.');
    }

    const record = envelope(parsed);
    const ownerId = requireIdentifier(record.ownerId);
    const documentId = requireIdentifier(record.documentId);
    const operationId = requireIdentifier(record.operationId);
    // The envelope's own claim about its owner is never authority; it must agree with the identity
    // the caller authenticated, or this request belongs to somebody else.
    if (ownerId !== trustedOwnerId) {
        throw new DeleteRequestError(
            'Delete request owner does not match the authenticated account.',
        );
    }
    const expectedRevision = requireExpectedRevision(record.expectedRevision);

    // Reconstruct what a producer would have written for exactly these validated values. Any
    // difference — reordered or duplicated keys, added whitespace, an alternate string encoding —
    // means the received bytes are not the canonical request, and the canonical form is NOT
    // substituted for them: the request is refused instead.
    const canonical = JSON.stringify({ ownerId, documentId, operationId, expectedRevision });
    if (canonical !== body) {
        throw new DeleteRequestError('Delete request bytes are not the canonical serialization.');
    }

    return {
        ownerId,
        documentId,
        operationId,
        expectedRevision,
        // Hash the bytes actually received, never a re-serialized substitute.
        digest: await digest(body),
    };
}
