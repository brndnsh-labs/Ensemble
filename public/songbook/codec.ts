import {
    exceedsUtf8ByteLimit,
    inspectSongbookStructure,
    SONGBOOK_MAX_INPUT_BYTES,
} from './structural-limits.js';
import {
    type ChartLaneMix,
    type ChartSettings,
    type CodecDecodeResult,
    type CodecEncodeResult,
    type CodecIssue,
    DEFAULT_SOLOIST_TRADE_CHORUSES,
} from './types.js';

/**
 * The songbook codecs' shared plumbing: the bounded structural walk and JSON detachment every
 * untrusted candidate goes through first, the version gate, and JSON decode/encode around a
 * validator. The chart schema itself is `document-v2.ts`; the semantic score is `score-codec.ts`.
 */

export type JsonRecord = Record<string, unknown>;

export function isPlainRecord(value: unknown): value is JsonRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function writtenMix(lane: ChartLaneMix): ChartLaneMix {
    const { enabled, voice, autoSound, volume, reverb } = lane;
    return { enabled, voice, autoSound, volume, reverb };
}

/**
 * A chart's performance and band exactly as the app's `captureContent` writes them: energy
 * always stored, and the trade settings only while trading, with the defaults an absent one
 * reads as. Built field by field, so nothing the writer does not write rides along. For building
 * a NEW chart from an existing one's setup (a blank song, an import), and, through
 * {@link writtenChart}, for comparing what two charts hold.
 */
export function writtenSettings(content: ChartSettings): ChartSettings {
    const { performance, band } = content;
    const { soloist, groove } = band;
    const trading = soloist.tradeWith !== undefined && soloist.tradeWith !== 'off';
    return {
        performance: {
            bpm: performance.bpm,
            seed: performance.seed,
            randomizeSeed: performance.randomizeSeed,
            energy: performance.energy ?? 'auto',
        },
        band: {
            chords: writtenMix(band.chords),
            bass: writtenMix(band.bass),
            soloist: {
                ...writtenMix(soloist),
                mode: soloist.mode,
                autoMode: soloist.autoMode,
                // Written only while trading, as `captureContent` does — with the same defaults
                // `apply` reads an absent turn length or head-return count as.
                ...(trading
                    ? {
                          tradeWith: soloist.tradeWith,
                          tradeBars: soloist.tradeBars ?? 4,
                          tradeChoruses: soloist.tradeChoruses ?? DEFAULT_SOLOIST_TRADE_CHORUSES,
                      }
                    : {}),
            },
            groove: {
                ...writtenMix(groove),
                swing: groove.swing,
                swingSub: groove.swingSub,
                humanize: groove.humanize,
                genre: groove.genre,
            },
        },
    };
}

/**
 * A whole chart with its settings as {@link writtenSettings} writes them, for asking whether two
 * charts hold the same music: a chart stored before energy was saved with it, or with trade
 * settings left over from a trade since switched off, reads the same as the one the app would
 * write today.
 */
export function writtenChart<C extends ChartSettings>(chart: C): C {
    return { ...chart, ...writtenSettings(chart) };
}

declare const preparedCandidateBrand: unique symbol;

/**
 * A candidate that has been through {@link prepareCandidate}'s bounded structural walk and JSON
 * detachment. Opaque on purpose: the `validatePrepared*` entry points skip that walk, so the type
 * system — not a doc comment — is what stops raw, untrusted input reaching them. Only
 * `prepareCandidate` and {@link preparedSubtree} produce one.
 */
export type PreparedCandidate = { readonly [preparedCandidateBrand]: true };

/**
 * Marks a value derived from an already-prepared candidate — one of its subtrees, or a small
 * literal this codec assembles from its subtrees plus fixed values — as prepared. A subtree of a
 * bounded, acyclic, accessor-free detached tree is itself all of those, so re-walking it is pure
 * cost (#1445). NEVER pass anything that did not come out of a `PreparedCandidate`.
 */
export function preparedSubtree(value: unknown): PreparedCandidate {
    return value as PreparedCandidate;
}

type CandidatePreparationResult =
    | { kind: 'ok'; candidate: PreparedCandidate }
    | { kind: 'invalid'; issues: CodecIssue[] };

/** Shared bounded, accessor-safe detachment for versioned songbook codecs. */
export function prepareCandidate(candidate: unknown): CandidatePreparationResult {
    const structural = inspectSongbookStructure(candidate);
    if (structural.kind === 'invalid') {
        return { kind: 'invalid', issues: [structural.issue] };
    }
    let json: string;
    try {
        json = JSON.stringify(candidate);
    } catch {
        return {
            kind: 'invalid',
            issues: [
                {
                    path: '$',
                    code: 'invalid-type',
                    message: 'Songbook input cannot be serialized as stable JSON data',
                },
            ],
        };
    }
    if (typeof json !== 'string') {
        return {
            kind: 'invalid',
            issues: [
                {
                    path: '$',
                    code: 'invalid-type',
                    message: 'Songbook input must have a JSON object root',
                },
            ],
        };
    }
    if (exceedsUtf8ByteLimit(json)) {
        return {
            kind: 'invalid',
            issues: [
                {
                    path: '$',
                    code: 'input-too-large',
                    message: `Songbook input exceeds ${SONGBOOK_MAX_INPUT_BYTES} UTF-8 bytes`,
                },
            ],
        };
    }
    try {
        const detachedCandidate: unknown = JSON.parse(json);
        const detachedStructure = inspectSongbookStructure(detachedCandidate);
        if (detachedStructure.kind === 'invalid') {
            return { kind: 'invalid', issues: [detachedStructure.issue] };
        }
        return { kind: 'ok', candidate: detachedCandidate as PreparedCandidate };
    } catch {
        return {
            kind: 'invalid',
            issues: [
                {
                    path: '$',
                    code: 'invalid-type',
                    message: 'Songbook input could not be detached as stable JSON data',
                },
            ],
        };
    }
}

export function readVersion(
    candidate: unknown,
    currentVersion: number,
    source: unknown,
): CodecDecodeResult<never> | { kind: 'current'; record: JsonRecord } {
    if (!isPlainRecord(candidate)) {
        return {
            kind: 'invalid',
            issues: [{ path: '$', code: 'invalid-type', message: 'Expected an object root' }],
        };
    }
    const version = candidate.schemaVersion;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
        return {
            kind: 'invalid',
            issues: [
                {
                    path: '$.schemaVersion',
                    code: 'invalid-value',
                    message: 'schemaVersion must be a positive integer',
                },
            ],
        };
    }
    if (version > currentVersion) {
        return { kind: 'future-version', schemaVersion: version, source };
    }
    if (version !== currentVersion) {
        return {
            kind: 'invalid',
            issues: [
                {
                    path: '$.schemaVersion',
                    code: 'invalid-value',
                    message: `Unsupported historical schema version ${version}`,
                },
            ],
        };
    }
    return { kind: 'current', record: candidate };
}

export function decodeJson<T>(
    json: string,
    validator: (candidate: unknown) => CodecDecodeResult<T>,
): CodecDecodeResult<T> {
    if (exceedsUtf8ByteLimit(json)) {
        return {
            kind: 'invalid',
            issues: [
                {
                    path: '$',
                    code: 'input-too-large',
                    message: `Songbook input exceeds ${SONGBOOK_MAX_INPUT_BYTES} UTF-8 bytes`,
                },
            ],
        };
    }
    let candidate: unknown;
    try {
        candidate = JSON.parse(json);
    } catch {
        return {
            kind: 'invalid',
            issues: [{ path: '$', code: 'invalid-json', message: 'Input is not valid JSON' }],
        };
    }
    const result = validator(candidate);
    return result.kind === 'future-version' ? { ...result, source: json } : result;
}

export function encodeValidated<T>(
    value: T,
    validator: (candidate: unknown) => CodecDecodeResult<T>,
): CodecEncodeResult {
    const result = validator(value);
    if (result.kind === 'invalid') {
        return result;
    }
    if (result.kind === 'future-version') {
        return {
            kind: 'invalid',
            issues: [
                {
                    path: '$.schemaVersion',
                    code: 'invalid-value',
                    message: 'Cannot encode a future schema version with the current codec',
                },
            ],
        };
    }
    const json = JSON.stringify(result.value);
    if (exceedsUtf8ByteLimit(json)) {
        return {
            kind: 'invalid',
            issues: [
                {
                    path: '$',
                    code: 'input-too-large',
                    message: `Songbook input exceeds ${SONGBOOK_MAX_INPUT_BYTES} UTF-8 bytes`,
                },
            ],
        };
    }
    return { kind: 'ok', json };
}
