import { GENRE_NAMES } from '../data/smart-genres.js';
import { normalizeSongSeed, SONG_SEED_MAX_LENGTH, stripDangerousChars } from '../sanitize.js';
import { isSwingSub } from '../types.js';
import {
    decodeJson,
    encodeValidated,
    isPlainRecord,
    type JsonRecord,
    type PreparedCandidate,
    prepareCandidate,
    preparedSubtree,
    readVersion,
} from './codec.js';
import { validatePreparedSemanticScore } from './score-codec.js';
import type { ChartDocumentV2 } from './score-types.js';
import {
    type ChartBand,
    type ChartEnergy,
    type ChartGroove,
    type ChartLaneMix,
    type ChartPerformance,
    type ChartSoloist,
    type CodecDecodeResult,
    type CodecEncodeResult,
    type CodecIssue,
    SOLOIST_TRADE_BARS,
} from './types.js';

/**
 * The chart document's schema (2, the only one since #1740): its envelope, performance and band,
 * with the score checked by `score-codec.ts`. A schema-1 document (the retired text chart) is
 * refused as an unsupported historical version; a newer one is preserved as `future-version`.
 *
 * Bump it for any change here that an older build would reject (#1782, the chart contract's
 * Compatibility section): it is all an older tab sharing the account database can tell a newer
 * chart by, and without it that tab reads the chart as invalid and retires its queued Save.
 */
const CHART_DOCUMENT_SCHEMA_VERSION = 2;

const SOLOIST_MODES = new Set(['monophonic', 'guitar']);
const SOLOIST_TRADE_WITH = new Set(['off', 'soloist', 'drums']);
const PACK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: imported metadata must not contain controls or markup.
const UNSAFE_METADATA = /[<>\u0000-\u001f\u007f]/;
const IMPORT_SOURCE_MAX_BYTES = 1_048_576;

class ValidationContext {
    readonly issues: CodecIssue[] = [];

    issue(path: string, code: CodecIssue['code'], message: string): void {
        this.issues.push({ path, code, message });
    }

    object(
        value: unknown,
        path: string,
        required: readonly string[],
        optional: readonly string[] = [],
    ): JsonRecord {
        if (!isPlainRecord(value)) {
            this.issue(path, 'invalid-type', 'Expected a plain object');
            return {};
        }
        const allowed = new Set([...required, ...optional]);
        for (const key of required) {
            if (!Object.hasOwn(value, key)) {
                this.issue(`${path}.${key}`, 'missing-field', `Missing required field ${key}`);
            }
        }
        for (const key of Object.keys(value)) {
            if (!allowed.has(key)) {
                this.issue(`${path}.${key}`, 'unknown-field', `Unknown field ${key}`);
            }
        }
        return value;
    }
}

function pathFor(path: string, key: string): string {
    return `${path}.${key}`;
}

function stringField(
    ctx: ValidationContext,
    record: JsonRecord,
    key: string,
    path: string,
    options: {
        min?: number;
        max: number;
        allowed?: ReadonlySet<string>;
        predicate?: (value: string) => boolean;
        message?: string;
    },
): string {
    if (!Object.hasOwn(record, key)) {
        return '';
    }
    const value = record[key];
    const fieldPath = pathFor(path, key);
    if (typeof value !== 'string') {
        ctx.issue(fieldPath, 'invalid-type', 'Expected a string');
        return '';
    }
    const min = options.min ?? 0;
    if (value.length < min || value.length > options.max) {
        ctx.issue(fieldPath, 'invalid-value', `Expected ${min}-${options.max} characters`);
    }
    if (options.allowed && !options.allowed.has(value)) {
        ctx.issue(fieldPath, 'invalid-value', options.message ?? 'Unknown string value');
    }
    if (options.predicate && !options.predicate(value)) {
        ctx.issue(fieldPath, 'invalid-value', options.message ?? 'Invalid string value');
    }
    return value;
}

function booleanField(
    ctx: ValidationContext,
    record: JsonRecord,
    key: string,
    path: string,
): boolean {
    if (!Object.hasOwn(record, key)) {
        return false;
    }
    const value = record[key];
    if (typeof value !== 'boolean') {
        ctx.issue(pathFor(path, key), 'invalid-type', 'Expected a boolean');
        return false;
    }
    return value;
}

function numberField(
    ctx: ValidationContext,
    record: JsonRecord,
    key: string,
    path: string,
    min: number,
    max: number,
    integer = false,
): number {
    if (!Object.hasOwn(record, key)) {
        return min;
    }
    const value = record[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        ctx.issue(pathFor(path, key), 'invalid-type', 'Expected a finite number');
        return min;
    }
    if (value < min || value > max || (integer && !Number.isInteger(value))) {
        ctx.issue(
            pathFor(path, key),
            'invalid-value',
            `Expected ${integer ? 'an integer ' : ''}between ${min} and ${max}`,
        );
    }
    return value;
}

function validateSafeDisplayString(value: string): boolean {
    return value === stripDangerousChars(value);
}

function validateVoice(value: string): boolean {
    if (value === 'synth') {
        return true;
    }
    if (!value.startsWith('pack:') || value.length > 128) {
        return false;
    }
    return PACK_ID_PATTERN.test(value.slice('pack:'.length));
}

function validateTimestamp(value: string): boolean {
    return Number.isFinite(Date.parse(value));
}

function validatePerformance(ctx: ValidationContext, candidate: unknown, path: string): void {
    const record = ctx.object(
        candidate,
        path,
        ['bpm', 'seed', 'randomizeSeed'] satisfies (keyof ChartPerformance)[],
        ['energy'] satisfies (keyof ChartPerformance)[],
    );
    stringField(ctx, record, 'seed', path, {
        max: SONG_SEED_MAX_LENGTH,
        predicate: (value) => normalizeSongSeed(value) === value,
        message: 'Song seed is not canonical',
    });
    numberField(ctx, record, 'bpm', path, 40, 240, true);
    booleanField(ctx, record, 'randomizeSeed', path);
    if (Object.hasOwn(record, 'energy')) {
        validateEnergy(ctx, record.energy, path);
    }
}

/** `'auto'`, or a fixed band energy from 0 to 1 (`ChartEnergy`). */
function validateEnergy(ctx: ValidationContext, value: unknown, path: string): void {
    if (value === ('auto' satisfies ChartEnergy)) {
        return;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        ctx.issue(pathFor(path, 'energy'), 'invalid-value', "Expected 'auto' or 0 to 1");
    }
}

const LANE_MIX_FIELDS = [
    'enabled',
    'voice',
    'autoSound',
    'volume',
    'reverb',
] as const satisfies readonly (keyof ChartLaneMix)[];

function validateLaneMix(ctx: ValidationContext, record: JsonRecord, path: string): void {
    booleanField(ctx, record, 'enabled', path);
    stringField(ctx, record, 'voice', path, {
        min: 1,
        max: 128,
        predicate: validateVoice,
        message: 'Unknown instrument voice',
    });
    booleanField(ctx, record, 'autoSound', path);
    numberField(ctx, record, 'volume', path, 0, 1);
    numberField(ctx, record, 'reverb', path, 0, 1);
}

function validateBand(ctx: ValidationContext, candidate: unknown, path: string): void {
    const record = ctx.object(candidate, path, [
        'chords',
        'bass',
        'soloist',
        'groove',
    ] satisfies (keyof ChartBand)[]);
    // The chords and the bass hold only their mix.
    for (const lane of ['chords', 'bass'] as const) {
        const lanePath = `${path}.${lane}`;
        validateLaneMix(ctx, ctx.object(record[lane], lanePath, LANE_MIX_FIELDS), lanePath);
    }
    validateSoloist(ctx, record.soloist, `${path}.soloist`);
    validateGroove(ctx, record.groove, `${path}.groove`);
}

function validateSoloist(ctx: ValidationContext, candidate: unknown, path: string): void {
    const record = ctx.object(
        candidate,
        path,
        [...LANE_MIX_FIELDS, 'mode', 'autoMode'] satisfies (keyof ChartSoloist)[],
        ['tradeWith', 'tradeBars', 'tradeChoruses'] satisfies (keyof ChartSoloist)[],
    );
    validateLaneMix(ctx, record, path);
    stringField(ctx, record, 'mode', path, {
        min: 1,
        max: 16,
        allowed: SOLOIST_MODES,
        message: 'Unknown soloist mode',
    });
    booleanField(ctx, record, 'autoMode', path);
    if (Object.hasOwn(record, 'tradeWith')) {
        stringField(ctx, record, 'tradeWith', path, {
            min: 1,
            max: 16,
            predicate: (value) => SOLOIST_TRADE_WITH.has(value),
            message: 'Unknown soloist trade partner',
        });
    }
    if (Object.hasOwn(record, 'tradeBars')) {
        const tradeBars = numberField(ctx, record, 'tradeBars', path, 2, 8, true);
        if (!SOLOIST_TRADE_BARS.includes(tradeBars as 2 | 4 | 8)) {
            ctx.issue(pathFor(path, 'tradeBars'), 'invalid-value', 'A trade lasts 2, 4 or 8 bars');
        }
    }
    // 0-4: 0 keeps trading forever, 1-4 is how many traded choruses before the head returns.
    if (Object.hasOwn(record, 'tradeChoruses')) {
        numberField(ctx, record, 'tradeChoruses', path, 0, 4, true);
    }
}

function validateGroove(ctx: ValidationContext, candidate: unknown, path: string): void {
    const record = ctx.object(candidate, path, [
        ...LANE_MIX_FIELDS,
        'swing',
        'swingSub',
        'humanize',
        'genre',
    ] satisfies (keyof ChartGroove)[]);
    validateLaneMix(ctx, record, path);
    numberField(ctx, record, 'swing', path, 0, 100);
    stringField(ctx, record, 'swingSub', path, {
        min: 1,
        max: 4,
        predicate: isSwingSub,
        message: 'Unknown swing subdivision',
    });
    numberField(ctx, record, 'humanize', path, 0, 100);
    stringField(ctx, record, 'genre', path, {
        min: 1,
        max: 64,
        predicate: (value) => GENRE_NAMES.includes(value),
        message: 'Unknown genre',
    });
}

function validateImportSource(ctx: ValidationContext, candidate: unknown): void {
    const source = ctx.object(candidate, '$.importSource', ['format', 'text']);
    if (source.format !== 'irealbook' && source.format !== 'irealb') {
        ctx.issue('$.importSource.format', 'invalid-value', 'Unknown import format.');
    }
    if (
        typeof source.text !== 'string' ||
        !source.text.length ||
        new TextEncoder().encode(source.text).byteLength > IMPORT_SOURCE_MAX_BYTES
    ) {
        ctx.issue('$.importSource.text', 'invalid-value', 'Expected bounded original import text.');
    }
}

function validateMetadata(ctx: ValidationContext, candidate: unknown): void {
    const metadata = ctx.object(candidate, '$.metadata', [], ['composer', 'style']);
    for (const [key, value] of Object.entries(metadata)) {
        if (typeof value !== 'string' || value.length > 200 || UNSAFE_METADATA.test(value)) {
            ctx.issue(
                `$.metadata.${key}`,
                'invalid-value',
                'Expected bounded, plain display text.',
            );
        }
    }
}

/** The envelope, performance and band; `chart.score` is left to {@link validatePreparedSemanticScore}. */
function validateEnvelope(ctx: ValidationContext, root: JsonRecord): JsonRecord {
    const record = ctx.object(
        root,
        '$',
        ['schemaVersion', 'id', 'title', 'createdAt', 'updatedAt', 'revision', 'chart'],
        ['metadata', 'importSource'],
    );
    stringField(ctx, record, 'id', '$', {
        min: 1,
        max: 128,
        predicate: validateSafeDisplayString,
        message: 'Document id contains unsafe characters',
    });
    stringField(ctx, record, 'title', '$', {
        min: 1,
        max: 200,
        predicate: validateSafeDisplayString,
        message: 'Document title contains unsafe characters',
    });
    for (const key of ['createdAt', 'updatedAt']) {
        stringField(ctx, record, key, '$', {
            min: 1,
            max: 64,
            predicate: validateTimestamp,
            message: `${key} must be a valid timestamp`,
        });
    }
    numberField(ctx, record, 'revision', '$', 0, Number.MAX_SAFE_INTEGER, true);
    if (Object.hasOwn(record, 'importSource')) {
        validateImportSource(ctx, record.importSource);
    }
    if (Object.hasOwn(record, 'metadata')) {
        validateMetadata(ctx, record.metadata);
    }
    const chart = ctx.object(record.chart, '$.chart', ['score', 'performance', 'band']);
    validatePerformance(ctx, chart.performance, '$.chart.performance');
    validateBand(ctx, chart.band, '$.chart.band');
    return chart;
}

/**
 * Validates an already-prepared candidate — one that has already been through
 * {@link prepareCandidate}'s structural walk and JSON round trip. Does NOT re-run the structural
 * walk; callers that hold raw, untrusted input call {@link validateChartDocumentV2}.
 */
function validatePreparedChartDocumentV2(
    prepared: PreparedCandidate,
): CodecDecodeResult<ChartDocumentV2> {
    const version = readVersion(prepared, CHART_DOCUMENT_SCHEMA_VERSION, prepared);
    if (version.kind !== 'current') {
        return version;
    }
    const ctx = new ValidationContext();
    const chart = validateEnvelope(ctx, version.record);
    if (ctx.issues.length) {
        return { kind: 'invalid', issues: ctx.issues };
    }
    // `chart.score` is a subtree of `prepared` (the whole document already went through
    // `prepareCandidate`), so it is revalidated without a second structural walk/round trip.
    const score = validatePreparedSemanticScore(preparedSubtree(chart.score));
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
    // The detached candidate itself: nothing above rebuilt or defaulted a field, so what was
    // validated is exactly what is returned.
    return { kind: 'ok', value: prepared as unknown as ChartDocumentV2 };
}

/** A chart document (schema 2), or why not. */
export function validateChartDocumentV2(candidate: unknown): CodecDecodeResult<ChartDocumentV2> {
    const prepared = prepareCandidate(candidate);
    if (prepared.kind !== 'ok') {
        return prepared;
    }
    return validatePreparedChartDocumentV2(prepared.candidate);
}

/**
 * Is `candidate` a schema-1 document (the retired text chart, #1740)? Only the shape of its
 * version stamp is read: what to tell the musician about an old file or link, never a reader.
 */
export function isRetiredSchema(candidate: unknown): boolean {
    // The own data property alone: an accessor is never invoked on untrusted input.
    return (
        isPlainRecord(candidate) &&
        Object.getOwnPropertyDescriptor(candidate, 'schemaVersion')?.value === 1
    );
}

export function decodeChartDocumentV2(json: string): CodecDecodeResult<ChartDocumentV2> {
    return decodeJson(json, validateChartDocumentV2);
}

export function encodeChartDocumentV2(document: ChartDocumentV2): CodecEncodeResult {
    return encodeValidated(document, validateChartDocumentV2);
}
