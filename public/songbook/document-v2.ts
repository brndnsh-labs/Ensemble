import {
    decodeJson,
    encodeValidated,
    prepareCandidate,
    readVersion,
    validateChartDocument,
} from './codec.js';
import { validateSemanticScore } from './score-codec.js';
import type { ChartDocumentV2 } from './score-types.js';
import type { CodecDecodeResult, CodecEncodeResult, CodecIssue } from './types.js';

// biome-ignore lint/suspicious/noControlCharactersInRegex: imported metadata must not contain controls or markup.
const UNSAFE_METADATA = /[<>\u0000-\u001f\u007f]/;

/** Additive reader: this does not change the version used by existing storage or shares. */
export function validateChartDocumentV2(candidate: unknown): CodecDecodeResult<ChartDocumentV2> {
    const prepared = prepareCandidate(candidate);
    if (prepared.kind !== 'ok') {
        return prepared;
    }
    const version = readVersion(prepared.candidate, 2, prepared.candidate);
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

    // Validation-only projection reuses the unchanged envelope/band/performance contracts.
    // This neutral arrangement is NEVER returned, persisted, or passed to playback.
    const envelope = validateChartDocument({
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
                lastChordPreset: 'Validation',
                sections: [{ id: 'validation-only', label: 'Validation', value: 'C' }],
            },
        },
    });
    if (envelope.kind !== 'ok') {
        return envelope;
    }
    const score = validateSemanticScore(chart.score);
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
    return { kind: 'ok', value: prepared.candidate as ChartDocumentV2 };
}

export function decodeChartDocumentV2(json: string): CodecDecodeResult<ChartDocumentV2> {
    return decodeJson(json, validateChartDocumentV2);
}

export function encodeChartDocumentV2(document: ChartDocumentV2): CodecEncodeResult {
    return encodeValidated(document, validateChartDocumentV2);
}
