/**
 * chart-link.ts — v2 shareable-link codec.
 *
 * Encodes/decodes a chart document (schema 2, the only one since #1740) as a URL hash
 * fragment: `#chart=<base64url(deflate(JSON))>`. A link that carries a schema-1 text chart
 * decodes to `RETIRED_CHART_LINK`, so the app can say plainly why it does not open.
 * Old v1 `?s=` links are not opened at all (#1735; see
 * `docs/design/ensemble-v2-rollout.md`'s 2026-09-15 decision: v2-only links, no
 * v1 dual-open).
 *
 * Trust boundary: a link carries portable musical intent only — no account,
 * session or retry metadata. That isn't a promise kept by this file's code; it's
 * enforced structurally by `validateChartDocumentV2`, which rejects any envelope key outside
 * its fixed schema (`schemaVersion`/`id`/`title`/`createdAt`/`updatedAt`/`revision`/`chart`,
 * `metadata`/`importSource`) before a decoded payload is trusted. Decoding
 * never throws into the UI: any malformed, oversized or schema-invalid payload
 * resolves to `undefined` — fail closed.
 *
 * Compression uses the native Compression Streams API (`CompressionStream`/
 * `DecompressionStream`, 'deflate' — supported in Node 18+, Chromium, Firefox and
 * Safari 16.4+) rather than adding a dependency; both functions are therefore
 * async.
 */

import { isRetiredSchema, validateChartDocumentV2 } from './document-v2.js';
import type { ChartDocumentV2 } from './score-types.js';
import { SONGBOOK_MAX_INPUT_BYTES } from './structural-limits.js';

/** What {@link decodeChartLink} answers for a link to a schema-1 text chart (#1740). */
export const RETIRED_CHART_LINK = 'retired-schema';

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

/**
 * Inflate with a hard ceiling on the OUTPUT. `MAX_ENCODED_LENGTH` bounds the input, but
 * deflate expands up to ~1000:1, so a 200 KB fragment could otherwise materialise ~200 MB
 * before the codec's own 1 MiB document limit ever sees it. Anything past
 * `SONGBOOK_MAX_INPUT_BYTES` cannot be a valid document, so stop reading there and fail.
 */
async function inflate(bytes: Uint8Array): Promise<Uint8Array | undefined> {
    const reader = toStream(bytes).pipeThrough(new DecompressionStream('deflate')).getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        total += value.byteLength;
        if (total > SONGBOOK_MAX_INPUT_BYTES) {
            await reader.cancel();
            return undefined;
        }
        chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out;
}

/** Fails closed rather than trusting the fragment. */
function validateChartLinkDocument(
    candidate: unknown,
): ChartDocumentV2 | typeof RETIRED_CHART_LINK | undefined {
    if (isRetiredSchema(candidate)) {
        return RETIRED_CHART_LINK;
    }
    const result = validateChartDocumentV2(candidate);
    return result.kind === 'ok' ? result.value : undefined;
}

/** Encodes a chart as a shareable `#chart=` URL hash fragment. */
export async function encodeChartLink(document: ChartDocumentV2): Promise<string> {
    const json = JSON.stringify(document);
    const compressed = await deflate(new TextEncoder().encode(json));
    return `#${CHART_LINK_KEY}=${toBase64Url(compressed)}`;
}

/**
 * Decodes a `#chart=` URL hash fragment (with or without the leading `#`) back
 * into a validated chart document, or `RETIRED_CHART_LINK` for a schema-1 text chart.
 * Never throws; any other malformed, oversized or schema-invalid payload resolves to
 * `undefined` so a corrupt link degrades to "nothing loaded," not a crash.
 */
export async function decodeChartLink(
    fragment: string,
): Promise<ChartDocumentV2 | typeof RETIRED_CHART_LINK | undefined> {
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
        if (bytes === undefined) {
            return undefined;
        }
        const json = new TextDecoder().decode(bytes);
        const candidate = JSON.parse(json);
        return validateChartLinkDocument(candidate);
    } catch {
        return undefined;
    }
}
