import {
    decodeJson,
    encodeValidated,
    prepareCandidate,
    readVersion,
    validatePreparedChartDocument,
} from './codec.js';
import { validatePreparedSemanticScore } from './score-codec.js';
import type { ChartDocumentV2 } from './score-types.js';
import type {
    CodecDecodeResult,
    CodecEncodeResult,
    CodecIssue,
    ChartDocument as LegacyChartDocument,
} from './types.js';

/** Whichever version the stand can open today, however `readVersion` classified it. */
export type AnyChartDocument = LegacyChartDocument | ChartDocumentV2;

// biome-ignore lint/suspicious/noControlCharactersInRegex: imported metadata must not contain controls or markup.
const UNSAFE_METADATA = /[<>\u0000-\u001f\u007f]/;

/**
 * Validates an already-prepared candidate — one that has already been through
 * {@link prepareCandidate}'s structural walk and JSON round trip (the v1-then-v2 dispatch
 * reuses the same detached top-level candidate for both attempts). Does NOT re-run the
 * structural walk — callers that hold raw, untrusted input must call
 * {@link validateChartDocumentV2} instead.
 */
function validatePreparedChartDocumentV2(prepared: unknown): CodecDecodeResult<ChartDocumentV2> {
    const version = readVersion(prepared, 2, prepared);
    if (version.kind !== 'current') {
        return version;
    }
    const root = version.record;
    const issues: CodecIssue[] = [];
    const checkObject = (
        value: unknown,
        path: string,
        required: string[],
        optional: string[] = [],
    ) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            issues.push({ path, code: 'invalid-type', message: 'Expected a JSON object.' });
            return {} as Record<string, unknown>;
        }
        const record = value as Record<string, unknown>;
        for (const key of required) {
            if (!Object.hasOwn(record, key)) {
                issues.push({
                    path: `${path}.${key}`,
                    code: 'missing-field',
                    message: 'Missing required field.',
                });
            }
        }
        for (const key of Object.keys(record)) {
            if (!required.includes(key) && !optional.includes(key)) {
                issues.push({
                    path: `${path}.${key}`,
                    code: 'unknown-field',
                    message: 'Unknown field.',
                });
            }
        }
        return record;
    };
    checkObject(
        root,
        '$',
        ['schemaVersion', 'id', 'title', 'createdAt', 'updatedAt', 'revision', 'chart'],
        ['metadata', 'importSource'],
    );
    const chart = checkObject(root.chart, '$.chart', ['score', 'performance', 'band']);
    if (Object.hasOwn(root, 'importSource')) {
        const source = checkObject(root.importSource, '$.importSource', ['format', 'text']);
        if (source.format !== 'irealbook' && source.format !== 'irealb') {
            issues.push({
                path: '$.importSource.format',
                code: 'invalid-value',
                message: 'Unknown import format.',
            });
        }
        if (
            typeof source.text !== 'string' ||
            !source.text.length ||
            new TextEncoder().encode(source.text).byteLength > 1_048_576
        ) {
            issues.push({
                path: '$.importSource.text',
                code: 'invalid-value',
                message: 'Expected bounded original import text.',
            });
        }
    }
    if (Object.hasOwn(root, 'metadata')) {
        const metadata = checkObject(root.metadata, '$.metadata', [], ['composer', 'style']);
        for (const [key, value] of Object.entries(metadata)) {
            if (typeof value !== 'string' || value.length > 200 || UNSAFE_METADATA.test(value)) {
                issues.push({
                    path: `$.metadata.${key}`,
                    code: 'invalid-value',
                    message: 'Expected bounded, plain display text.',
                });
            }
        }
    }
    if (issues.length) {
        return { kind: 'invalid', issues };
    }

    // Validation-only projection reuses the unchanged envelope/band/performance contracts. This
    // synthetic wrapper is NEVER returned, persisted, or passed to playback, and needs no
    // structural walk of its own: `chart.performance`/`chart.band` are subtrees of `prepared`,
    // which already went through the full walk and JSON round trip as a whole — so they're
    // already guaranteed acyclic, accessor- and toJSON-free, and within the document's
    // depth/size bounds — and the rest is a small fixed literal this function authors itself.
    const envelope = validatePreparedChartDocument({
        schemaVersion: 1,
        id: root.id,
        title: root.title,
        createdAt: root.createdAt,
        updatedAt: root.updatedAt,
        revision: root.revision,
        chart: {
            performance: chart.performance,
            band: chart.band,
            arrangement: {
                key: 'C',
                isMinor: false,
                timeSignature: '4/4',
                grouping: null,
                notation: 'name',
                sections: [{ id: 'validation-only', label: 'Validation', value: 'C' }],
            },
        },
    });
    if (envelope.kind !== 'ok') {
        return envelope;
    }
    // `chart.score` is a subtree of `prepared` (the whole document already went through
    // `prepareCandidate`), so it is revalidated without a second structural walk/round trip.
    const score = validatePreparedSemanticScore(chart.score);
    if (score.kind === 'invalid') {
        return {
            kind: 'invalid',
            issues: score.issues.map((issue) => ({
                ...issue,
                path: `$.chart.score${issue.path.slice(1)}`,
            })),
        };
    }
    if (score.kind !== 'ok') {
        return score;
    }
    return { kind: 'ok', value: prepared as ChartDocumentV2 };
}

/** Additive reader: this does not change the version used by existing storage or shares. */
export function validateChartDocumentV2(candidate: unknown): CodecDecodeResult<ChartDocumentV2> {
    const prepared = prepareCandidate(candidate);
    if (prepared.kind !== 'ok') {
        return prepared;
    }
    return validatePreparedChartDocumentV2(prepared.candidate);
}

/**
 * Prepares `candidate` exactly once and dispatches to the matching codec. Every caller that
 * used to try `validateChartDocument` first and fall through to `validateChartDocumentV2` on a
 * schemaVersion-2 `future-version` result — reading and JSON-round-tripping the candidate a
 * second time to do it — reads the one detached copy instead.
 */
export function validateAnyChartDocument(candidate: unknown): CodecDecodeResult<AnyChartDocument> {
    const prepared = prepareCandidate(candidate);
    if (prepared.kind === 'invalid') {
        return prepared;
    }
    const legacy = validatePreparedChartDocument(prepared.candidate);
    return legacy.kind === 'future-version' && legacy.schemaVersion === 2
        ? validatePreparedChartDocumentV2(prepared.candidate)
        : legacy;
}

export function decodeChartDocumentV2(json: string): CodecDecodeResult<ChartDocumentV2> {
    return decodeJson(json, validateChartDocumentV2);
}

export function encodeChartDocumentV2(document: ChartDocumentV2): CodecEncodeResult {
    return encodeValidated(document, validateChartDocumentV2);
}
