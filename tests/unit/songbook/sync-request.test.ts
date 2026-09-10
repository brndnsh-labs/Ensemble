import { describe, expect, it, vi } from 'vitest';
import { type ChartDocument, snapshot } from '../../../prototypes/v2/lib/sync/protocol.js';
import {
    decodeSaveRequest,
    MAX_SAVE_REQUEST_BYTES,
    SaveRequestError,
} from '../../../prototypes/v2/lib/sync/request.js';
import type { ChartDocumentV2 } from '../../../public/songbook/score-types.js';
import { SONGBOOK_MAX_INPUT_BYTES } from '../../../public/songbook/structural-limits.js';
import { accountChart } from '../../utils/account-songbook-fixture.js';

/**
 * The decoder is the future revision service's front door, so these tests care as much about
 * what it refuses as what it accepts. Every request below is built the way `prepare()` builds
 * one — same envelope keys in the same order — because accepting only that exact
 * serialization is the contract, not an implementation detail.
 */

const OWNER = 'owner-a';

/**
 * Mirrors `AccountSongbook.prepare`'s serialization exactly — including the `snapshot()` call
 * around the document. That call is not incidental: for a v1 chart the portable validator
 * REBUILDS the document in its own field order (…updatedAt, revision, chart), so the bytes on
 * the wire are the normalised form, not whatever order the caller happened to author. A test
 * that embedded a raw fixture here would be testing a request no client can produce.
 */
function wire(
    document: ChartDocument,
    patch: Partial<{
        protocolVersion: unknown;
        ownerId: unknown;
        documentId: unknown;
        operationId: unknown;
        expectedRevision: unknown;
        document: unknown;
    }> = {},
): string {
    return JSON.stringify({
        protocolVersion: 1,
        ownerId: OWNER,
        documentId: document.id,
        operationId: 'op-1',
        expectedRevision: null,
        document: snapshot(document),
        ...patch,
    });
}

function semanticChart(id = 'study', title = 'A'): ChartDocumentV2 {
    const legacy = accountChart(title, id);
    return {
        schemaVersion: 2,
        id,
        title,
        revision: 0,
        createdAt: legacy.createdAt,
        updatedAt: legacy.updatedAt,
        metadata: { composer: 'Synthetic Author', style: 'Medium swing' },
        importSource: {
            format: 'irealb',
            text: 'irealb://Synthetic%20Study=Author==Swing==C==1r34',
        },
        chart: {
            performance: legacy.chart.performance,
            band: legacy.chart.band,
            score: {
                notation: 'name',
                key: 'C',
                isMinor: false,
                meter: '4/4',
                grouping: null,
                sections: [
                    {
                        id: 'head',
                        label: 'A',
                        repeat: 1,
                        measures: [
                            {
                                id: 'head-1',
                                content: {
                                    kind: 'events',
                                    events: [
                                        // Reduced thirds that must fill exactly one 4/4 bar:
                                        // 1/3 + 1/3 + 10/3 = 4 quarter notes.
                                        { kind: 'chord', symbol: 'C7', duration: [1, 3] },
                                        { kind: 'chord', symbol: 'F7', duration: [1, 3] },
                                        { kind: 'chord', symbol: 'G7', duration: [10, 3] },
                                    ],
                                },
                            },
                        ],
                    },
                ],
            },
        },
    };
}

/** Independent oracle: SHA-256 of exactly the bytes handed to the decoder. */
async function sha256(value: string): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('accepts exactly what prepare() produces', () => {
    it('round-trips a v1 request, returning the envelope and a detached document', async () => {
        const document = accountChart('A', 'study');
        const body = wire(document);
        const decoded = await decodeSaveRequest(body, OWNER);

        expect(decoded.ownerId).toBe(OWNER);
        expect(decoded.documentId).toBe('study');
        expect(decoded.operationId).toBe('op-1');
        expect(decoded.expectedRevision).toBeNull();
        expect(decoded.document).toEqual(document);
        expect(decoded.digest).toBe(await sha256(body));
    });

    it('round-trips a v2 request including score, metadata and inert import source', async () => {
        const document = semanticChart();
        const decoded = await decodeSaveRequest(wire(document), OWNER);
        const returned = decoded.document as ChartDocumentV2;
        expect(returned.chart.score).toEqual(document.chart.score);
        expect(returned.importSource).toEqual(document.importSource);
        expect(returned.metadata).toEqual(document.metadata);
        // The rational duration survives as authored rather than being coerced.
        const measure = returned.chart.score.sections[0].measures[0];
        expect(measure.content.kind === 'events' && measure.content.events[0].duration).toEqual([
            1, 3,
        ]);
    });

    it('accepts a non-null expected revision in the existing opaque format', async () => {
        const document = accountChart('A', 'study');
        const decoded = await decodeSaveRequest(
            wire(document, { expectedRevision: 'cloud-12' }),
            OWNER,
        );
        expect(decoded.expectedRevision).toBe('cloud-12');
    });

    it('preserves Unicode exactly, and hashes the received bytes', async () => {
        const document = accountChart('\u0153 \u2014 \u65e5\u672c\u8a9e \ud83c\udfba', 'study');
        const body = wire(document);
        const decoded = await decodeSaveRequest(body, OWNER);
        expect(decoded.document.title).toBe('\u0153 \u2014 \u65e5\u672c\u8a9e \ud83c\udfba');
        expect(decoded.digest).toBe(await sha256(body));
    });

    it('pins the canonical byte sequence, so a producer change cannot drift silently', async () => {
        // A whole document is too large to pin inline, but the envelope around it is the
        // contract: keys in this order, no whitespace, document last.
        const document = accountChart('A', 'study');
        const body = wire(document);
        expect(
            body.startsWith(
                '{"protocolVersion":1,"ownerId":"owner-a","documentId":"study","operationId":"op-1","expectedRevision":null,"document":{',
            ),
        ).toBe(true);
        expect(body.endsWith('}}')).toBe(true);
        await expect(decodeSaveRequest(body, OWNER)).resolves.toBeDefined();
    });

    it('pins v1 document field order, which the portable validator rebuilds', async () => {
        const document = accountChart('A', 'study');
        // Author the same chart with its top-level keys reversed. `validateChartDocument`
        // REBUILDS a v1 document in its own field order, so the canonical reconstruction
        // normalises this — and a body carrying the author's order is refused.
        const reversed = Object.fromEntries(
            Object.entries(document).reverse(),
        ) as unknown as ChartDocument;
        const shuffled = JSON.stringify({
            protocolVersion: 1,
            ownerId: OWNER,
            documentId: 'study',
            operationId: 'op-1',
            expectedRevision: null,
            document: reversed,
        });
        expect(shuffled).not.toBe(wire(document));
        await expect(decodeSaveRequest(shuffled, OWNER)).rejects.toThrow('canonical serialization');
    });

    it('does NOT pin v2 document field order — a deliberate, documented asymmetry', async () => {
        const document = semanticChart();
        // `validateChartDocumentV2` returns the detached parsed candidate with the caller's
        // key order intact, so the reconstruction echoes whatever order arrived and a
        // key-shuffled v2 body is accepted — with a DIFFERENT digest for the same logical
        // chart. This is not an integrity hole (every schema object is allowlisted, so no
        // extra content rides along) and the outbox only ever sends bytes it froze once. It
        // is pinned here so the difference from v1 above is a decision on record rather than
        // something a future reader discovers while debugging a receipt mismatch.
        const reversed = Object.fromEntries(
            Object.entries(document).reverse(),
        ) as unknown as ChartDocument;
        const shuffled = JSON.stringify({
            protocolVersion: 1,
            ownerId: OWNER,
            documentId: 'study',
            operationId: 'op-1',
            expectedRevision: null,
            document: reversed,
        });
        const canonical = wire(document);
        expect(shuffled).not.toBe(canonical);
        const [a, b] = await Promise.all([
            decodeSaveRequest(shuffled, OWNER),
            decodeSaveRequest(canonical, OWNER),
        ]);
        expect(a.document).toEqual(b.document);
        // Same logical chart, same operation id, two digests. A receipt service must treat
        // the digest as "the bytes this attempt sent", never as the document's identity.
        expect(a.digest).not.toBe(b.digest);
    });

    it('returns only envelope fields, so caller properties cannot ride along', async () => {
        const decoded = await decodeSaveRequest(wire(accountChart('A', 'study')), OWNER);
        expect(Object.keys(decoded).sort()).toEqual([
            'digest',
            'document',
            'documentId',
            'expectedRevision',
            'operationId',
            'ownerId',
        ]);
    });

    it('detaches the document from the parsed body', async () => {
        const document = accountChart('A', 'study');
        const body = wire(document);
        const first = await decodeSaveRequest(body, OWNER);
        first.document.title = 'tampered';
        first.document.chart.performance.bpm = 999;
        const second = await decodeSaveRequest(body, OWNER);
        expect(second.document.title).toBe('A');
        expect(second.document.chart.performance.bpm).toBe(120);
    });

    it('persists nothing and sends nothing', async () => {
        const fetching = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
            throw new Error('The decoder must not perform I/O.');
        });
        await decodeSaveRequest(wire(accountChart('A', 'study')), OWNER);
        expect(fetching).not.toHaveBeenCalled();
        fetching.mockRestore();
        // There is no storage binding in this environment at all; a decoder that tried to
        // persist would have to reach for one, and would fail loudly rather than silently.
        expect(typeof (globalThis as { indexedDB?: unknown }).indexedDB).toBe('undefined');
    });
});

describe('refuses anything that is not that request', () => {
    const document = accountChart('A', 'study');

    it('requires an authenticated owner from the caller, not from the body', async () => {
        for (const owner of [undefined, null, '', 42, {}, 'not a valid id']) {
            await expect(decodeSaveRequest(wire(document), owner)).rejects.toBeInstanceOf(
                SaveRequestError,
            );
        }
    });

    it('refuses a request belonging to a different account', async () => {
        // Body says owner-a, caller authenticated owner-b.
        await expect(decodeSaveRequest(wire(document), 'owner-b')).rejects.toThrow(
            'does not match the authenticated account',
        );
        // And the reverse: a body claiming owner-b cannot be committed by owner-a. The
        // envelope's own claim is never the authority in either direction.
        await expect(
            decodeSaveRequest(wire(document, { ownerId: 'owner-b' }), OWNER),
        ).rejects.toThrow('does not match the authenticated account');
        // A genuine owner-b request, authenticated as owner-b, is of course fine — the check
        // is agreement with the authenticated identity, not a denylist of other accounts.
        await expect(
            decodeSaveRequest(wire(document, { ownerId: 'owner-b' }), 'owner-b'),
        ).resolves.toMatchObject({ ownerId: 'owner-b' });
    });

    it('refuses a document whose identity disagrees with its envelope', async () => {
        await expect(
            decodeSaveRequest(wire(document, { documentId: 'elsewhere' }), OWNER),
        ).rejects.toThrow('does not match its envelope');
    });

    it('refuses unsupported protocol and document versions', async () => {
        await expect(
            decodeSaveRequest(wire(document, { protocolVersion: 2 }), OWNER),
        ).rejects.toThrow('Unsupported Save protocol version');
        await expect(
            decodeSaveRequest(wire(document, { protocolVersion: '1' }), OWNER),
        ).rejects.toThrow('Unsupported Save protocol version');
        // Injected via the patch: an unsupported version cannot survive `snapshot()`, so it
        // has to be placed into the body directly, exactly as a hostile client would.
        await expect(
            decodeSaveRequest(
                wire(document, { document: { ...document, schemaVersion: 99 } }),
                OWNER,
            ),
        ).rejects.toThrow('not a supported chart');
        await expect(decodeSaveRequest(wire(document, { document: null }), OWNER)).rejects.toThrow(
            'not a supported chart',
        );
    });

    it('refuses invalid identifiers and expected revisions', async () => {
        for (const patch of [
            { documentId: '' },
            { documentId: 'has spaces' },
            { operationId: 'x'.repeat(129) },
            { operationId: 42 },
        ]) {
            await expect(decodeSaveRequest(wire(document, patch), OWNER)).rejects.toThrow(
                'invalid identifier',
            );
        }
        for (const expectedRevision of ['', 'has spaces', 42, {}]) {
            await expect(
                decodeSaveRequest(wire(document, { expectedRevision }), OWNER),
            ).rejects.toThrow('not a valid revision');
        }
    });

    it('refuses unknown, missing, reordered and duplicated envelope keys', async () => {
        const canonical = wire(document);
        // An extra key.
        await expect(
            decodeSaveRequest(
                canonical.replace('{"protocolVersion":1', '{"extra":1,"protocolVersion":1'),
                OWNER,
            ),
        ).rejects.toThrow('not in the canonical form');
        // A missing key.
        await expect(
            decodeSaveRequest(canonical.replace('"expectedRevision":null,', ''), OWNER),
        ).rejects.toThrow('not in the canonical form');
        // Correct keys, wrong order.
        const reordered = JSON.stringify({
            ownerId: OWNER,
            protocolVersion: 1,
            documentId: 'study',
            operationId: 'op-1',
            expectedRevision: null,
            document,
        });
        await expect(decodeSaveRequest(reordered, OWNER)).rejects.toThrow(
            'not in the canonical form',
        );
        // A duplicated key: JSON.parse keeps the last, so only the byte comparison catches it.
        await expect(
            decodeSaveRequest(
                canonical.replace(
                    '"operationId":"op-1"',
                    '"operationId":"op-2","operationId":"op-1"',
                ),
                OWNER,
            ),
        ).rejects.toThrow(SaveRequestError);
    });

    it('refuses alternate serializations of an otherwise valid request', async () => {
        const canonical = wire(document);
        for (const variant of [
            ` ${canonical}`,
            `${canonical} `,
            canonical.replace('{"protocolVersion":1', '{ "protocolVersion":1'),
            canonical.replace('"protocolVersion":1', '"protocolVersion":1.0'),
            canonical.replace('"expectedRevision":null', '"expectedRevision":  null'),
        ]) {
            if (variant === canonical) {
                throw new Error('Variant did not differ from the canonical body.');
            }
            await expect(decodeSaveRequest(variant, OWNER)).rejects.toBeInstanceOf(
                SaveRequestError,
            );
        }
    });

    it('refuses malformed JSON and non-object roots without echoing the input', async () => {
        for (const body of ['', 'null', 'true', '42', '"a string"', '[]', '{', '{"a":]']) {
            await expect(decodeSaveRequest(body, OWNER)).rejects.toBeInstanceOf(SaveRequestError);
        }
    });

    it('refuses a non-string body', async () => {
        for (const body of [undefined, null, 42, {}, new Uint8Array(4)]) {
            await expect(decodeSaveRequest(body, OWNER)).rejects.toThrow('must be a string');
        }
    });
});

describe('byte ceilings are measured in UTF-8', () => {
    it('refuses a body over the ceiling before attempting to parse it', async () => {
        const oversized = 'x'.repeat(MAX_SAVE_REQUEST_BYTES + 1);
        // Not valid JSON either; the size error proves the order of the checks.
        await expect(decodeSaveRequest(oversized, OWNER)).rejects.toThrow(
            `exceeds ${MAX_SAVE_REQUEST_BYTES} UTF-8 bytes`,
        );
    });

    it('counts UTF-8 bytes, not UTF-16 code units', async () => {
        // Three bytes each: far fewer characters than the ceiling, far more bytes.
        const multibyte = '한'.repeat(MAX_SAVE_REQUEST_BYTES - 1);
        expect(multibyte.length).toBeLessThan(MAX_SAVE_REQUEST_BYTES);
        await expect(decodeSaveRequest(multibyte, OWNER)).rejects.toThrow('UTF-8 bytes');
    });

    it('accepts a chart that is legal near the document limit once wrapped', async () => {
        const base = semanticChart();
        const overhead = new TextEncoder().encode(JSON.stringify(base)).byteLength;
        // Fill the document to just under its own limit, leaving the envelope its allowance.
        const padding = SONGBOOK_MAX_INPUT_BYTES - overhead - 64;
        const document: ChartDocumentV2 = {
            ...base,
            importSource: { format: 'irealb', text: `irealb://${'A'.repeat(padding)}` },
        };
        const body = wire(document);
        const bytes = new TextEncoder().encode(body).byteLength;
        expect(bytes).toBeGreaterThan(SONGBOOK_MAX_INPUT_BYTES - 1024);
        expect(bytes).toBeLessThanOrEqual(MAX_SAVE_REQUEST_BYTES);
        const decoded = await decodeSaveRequest(body, OWNER);
        expect((decoded.document as ChartDocumentV2).importSource?.text).toHaveLength(
            padding + 'irealb://'.length,
        );
    });

    it('refuses a document over the document limit even when the envelope would allow it', async () => {
        const base = semanticChart();
        const overhead = new TextEncoder().encode(JSON.stringify(base)).byteLength;
        // Between the document ceiling and the request ceiling: the envelope allowance must
        // not become extra room for chart content.
        const padding = SONGBOOK_MAX_INPUT_BYTES - overhead + 1024;
        const document: ChartDocumentV2 = {
            ...base,
            importSource: { format: 'irealb', text: `irealb://${'A'.repeat(padding)}` },
        };
        // Injected directly: an oversized document cannot survive `snapshot()`, so no honest
        // client could build this body — which is precisely why the decoder must refuse it.
        const body = wire(base, { document });
        const bytes = new TextEncoder().encode(body).byteLength;
        // The body is under the REQUEST ceiling, so only the document limit can reject it.
        expect(bytes).toBeGreaterThan(SONGBOOK_MAX_INPUT_BYTES);
        expect(bytes).toBeLessThanOrEqual(MAX_SAVE_REQUEST_BYTES);
        const error = await decodeSaveRequest(body, OWNER).catch((thrown) => thrown);
        // Rejected as a SaveRequestError, not as a leaked codec exception: the decoder owns
        // its own failure surface so a route can map it without matching on foreign messages.
        expect(error).toBeInstanceOf(SaveRequestError);
        // Names the path it actually takes. The document limit is enforced by the portable
        // codec inside snapshot(), NOT by a second check in the decoder — asserting only
        // "some SaveRequestError" here previously let a dead duplicate check look load-bearing.
        expect((error as Error).message).toContain('not a supported chart');
    });
});

describe('rejections never disclose content', () => {
    const secret = 'CONFIDENTIAL-CHART-TEXT';
    const sourceSecret = 'CONFIDENTIAL-IMPORT-SOURCE';
    const composerSecret = 'CONFIDENTIAL-COMPOSER';
    const loaded = (): ChartDocumentV2 => ({
        ...semanticChart('study', secret),
        metadata: { composer: composerSecret, style: 'Medium swing' },
        importSource: { format: 'irealb', text: `irealb://${sourceSecret}` },
    });

    /**
     * Every rejection path, each reached with an owner that AGREES with the body. Reaching
     * them matters: an earlier draft of this test used a mismatched owner throughout, and the
     * owner check short-circuits, so three of its cases silently tested one message instead of
     * the three they were named for. Each entry below asserts which message it actually got,
     * so a future reordering of the checks fails here instead of quietly collapsing again.
     */
    const paths: [string, () => string, unknown, string][] = [
        ['non-string body', () => wire(loaded()), OWNER, 'must be a string'],
        ['oversized body', () => 'x'.repeat(MAX_SAVE_REQUEST_BYTES + 1), OWNER, 'UTF-8 bytes'],
        [
            'malformed JSON',
            () => `{"protocolVersion":1,"junk":"${secret}"`,
            OWNER,
            'not valid JSON',
        ],
        ['non-object root', () => `"${secret}"`, OWNER, 'must be a JSON object'],
        [
            'unknown envelope key',
            () =>
                wire(loaded()).replace(
                    '{"protocolVersion":1',
                    `{"${secret}":1,"protocolVersion":1`,
                ),
            OWNER,
            'not in the canonical form',
        ],
        [
            'bad protocol version',
            () => wire(loaded(), { protocolVersion: 9 }),
            OWNER,
            'protocol version',
        ],
        [
            'invalid identifier',
            () => wire(loaded(), { operationId: '' }),
            OWNER,
            'invalid identifier',
        ],
        ['foreign owner', () => wire(loaded()), 'owner-b', 'authenticated account'],
        [
            'invalid caller owner',
            () => wire(loaded()),
            'not a valid id',
            'not a valid account identifier',
        ],
        [
            'missing caller owner',
            () => wire(loaded()),
            undefined,
            'authenticated owner is required',
        ],
        [
            'bad expected revision',
            () => wire(loaded(), { expectedRevision: 'bad revision' }),
            OWNER,
            'not a valid revision',
        ],
        [
            'unsupported document',
            () => wire(loaded(), { document: { ...loaded(), schemaVersion: 99 } }),
            OWNER,
            'not a supported chart',
        ],
        [
            'document identity mismatch',
            () => wire(loaded(), { documentId: 'elsewhere' }),
            OWNER,
            'does not match its envelope',
        ],
        ['non-canonical bytes', () => ` ${wire(loaded())}`, OWNER, 'canonical serialization'],
    ];

    for (const [name, build, owner, expected] of paths) {
        it(`keeps content out of the message for: ${name}`, async () => {
            const body = name === 'non-string body' ? (undefined as unknown as string) : build();
            const error = await decodeSaveRequest(body, owner).catch((thrown) => thrown);
            expect(error).toBeInstanceOf(SaveRequestError);
            const message = (error as Error).message;
            // Proves this case reached the path it is named for, rather than short-circuiting.
            expect(message).toContain(expected);
            for (const disclosure of [
                secret,
                sourceSecret,
                composerSecret,
                'irealb://',
                'study',
                'owner-a',
                'owner-b',
            ]) {
                expect(message).not.toContain(disclosure);
            }
        });
    }
});
