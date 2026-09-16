/**
 * chart-link.ts — v2 shareable-link codec.
 *
 * Encodes/decodes a v2 ChartDocument (schema version 1 or 2 — whatever the stand
 * currently has open) as a URL hash fragment: `#chart=<base64url(deflate(JSON))>`.
 * This is deliberately separate from `state/share-codec.ts`, which encodes v1's
 * *sections array only* (not a whole document) for the `?s=` query-param link —
 * different envelope, different host, different trust boundary (see
 * `docs/design/ensemble-v2-rollout.md`'s 2026-09-15 decision: v2-only links, no
 * v1 dual-open).
 *
 * Trust boundary: a link carries portable musical intent only — no account,
 * session or retry metadata. That isn't a promise kept by this file's code; it's
 * enforced structurally by `validateChartDocument`/`validateChartDocumentV2`,
 * which reject any envelope key outside their fixed schema
 * (`schemaVersion`/`id`/`title`/`createdAt`/`updatedAt`/`revision`/`chart`, plus
 * `metadata`/`importSource` on v2) before a decoded payload is trusted. Decoding
 * never throws into the UI: any malformed, oversized or schema-invalid payload
 * resolves to `undefined` — the same fail-closed contract as
 * `tryDecompressSections` in `state/share-codec.ts`.
 *
 * Compression uses the native Compression Streams API (`CompressionStream`/
 * `DecompressionStream`, 'deflate' — supported in Node 18+, Chromium, Firefox and
 * Safari 16.4+) rather than adding a dependency; both functions are therefore
 * async.
 */

import { validateChartDocument } from './codec.js';
import { validateChartDocumentV2 } from './document-v2.js';
import type { ChartDocumentV2 } from './score-types.js';
import type { ChartDocument } from './types.js';

export type ChartLinkDocument = ChartDocument | ChartDocumentV2;

/** The URL hash key: `#chart=<payload>`. */
const CHART_LINK_KEY = 'chart';

/**
 * Defends against a pathological payload before attempting decompression — well
 * above the ~2KB budget for a 32-bar chart with sections, but bounded so a
 * malicious/corrupt fragment can't drive an unbounded inflate.
 */
const MAX_ENCODED_LENGTH = 200_000;

function toBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array | undefined {
    // Reject anything outside the base64url alphabet before handing it to atob —
    // atob tolerates some invalid input in ways that vary by engine.
    if (!/^[A-Za-z0-9_-]+$/.test(value)) {
        return undefined;
    }
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - (padded.length % 4)) % 4;
    try {
        const binary = atob(padded + '='.repeat(padding));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    } catch {
        return undefined;
    }
}

function toStream(bytes: Uint8Array): ReadableStream<Uint8Array<ArrayBuffer>> {
    // Re-wrap in a fresh, plain-ArrayBuffer-backed Uint8Array: TextEncoder#encode
    // and friends type as Uint8Array<ArrayBufferLike>, which CompressionStream's
    // typed-array-generic overloads don't accept directly.
    const owned = new Uint8Array(bytes);
    return new ReadableStream({
        start(controller) {
            controller.enqueue(owned);
            controller.close();
        },
    });
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
    const stream = toStream(bytes).pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
    const stream = toStream(bytes).pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Routes to the matching validator; fails closed rather than trusting the fragment. */
function validateChartLinkDocument(candidate: unknown): ChartLinkDocument | undefined {
    const legacy = validateChartDocument(candidate);
    if (legacy.kind === 'ok') {
        return legacy.value;
    }
    if (legacy.kind === 'future-version' && legacy.schemaVersion === 2) {
        const v2 = validateChartDocumentV2(candidate);
        return v2.kind === 'ok' ? v2.value : undefined;
    }
    return undefined;
}

/** Encodes a chart as a shareable `#chart=` URL hash fragment. */
export async function encodeChartLink(document: ChartLinkDocument): Promise<string> {
    const json = JSON.stringify(document);
    const compressed = await deflate(new TextEncoder().encode(json));
    return `#${CHART_LINK_KEY}=${toBase64Url(compressed)}`;
}

/**
 * Decodes a `#chart=` URL hash fragment (with or without the leading `#`) back
 * into a validated ChartDocument. Never throws; any malformed, oversized or
 * schema-invalid payload resolves to `undefined` so a corrupt link degrades to
 * "nothing loaded," not a crash.
 */
export async function decodeChartLink(fragment: string): Promise<ChartLinkDocument | undefined> {
    if (!fragment) {
        return undefined;
    }
    const hash = fragment.startsWith('#') ? fragment.slice(1) : fragment;
    const params = new URLSearchParams(hash);
    const payload = params.get(CHART_LINK_KEY);
    if (!payload || payload.length > MAX_ENCODED_LENGTH) {
        return undefined;
    }
    const compressed = fromBase64Url(payload);
    if (!compressed) {
        return undefined;
    }
    try {
        const bytes = await inflate(compressed);
        const json = new TextDecoder().decode(bytes);
        const candidate = JSON.parse(json);
        return validateChartLinkDocument(candidate);
    } catch {
        return undefined;
    }
}
