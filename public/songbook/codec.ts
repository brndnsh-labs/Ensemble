import { KEY_ORDER, TIME_SIGNATURES } from '../config.js';
import {
    isKnownBassStyle,
    isKnownChordStyle,
    isKnownHarmonyStyle,
    isKnownSoloistStyle,
} from '../data/instrument-styles.js';
import { GENRE_FEELS, GENRE_NAMES, resolveGenre, SMART_GENRES } from '../data/smart-genres.js';
import { isValidTimeSignatureGrouping } from '../meter.js';
import { normalizeSongSeed, SONG_SEED_MAX_LENGTH, stripDangerousChars } from '../sanitize.js';
import { type ChordDensity, isChordDensity, isSwingSub } from '../types.js';
import {
    exceedsUtf8ByteLimit,
    inspectSongbookStructure,
    SONGBOOK_MAX_INPUT_BYTES,
    SONGBOOK_MAX_SECTIONS,
} from './structural-limits.js';
import {
    CHART_DOCUMENT_SCHEMA_VERSION,
    CHART_GROOVE_PATTERN_LANE_NAMES,
    type ChartArrangement,
    type ChartBand,
    type ChartBass,
    type ChartChords,
    type ChartContent,
    type ChartDocument,
    type ChartEnergy,
    type ChartGroove,
    type ChartGroovePatternLane,
    type ChartHarmony,
    type ChartLaneMix,
    type ChartPerformance,
    type ChartSection,
    type ChartSoloist,
    type CodecDecodeResult,
    type CodecEncodeResult,
    type CodecIssue,
    DEFAULT_SOLOIST_TRADE_CHORUSES,
    SOLOIST_TRADE_BARS,
    type SoloistTradeMode,
    WORKSPACE_PREFERENCES_SCHEMA_VERSION,
    type WorkspaceAppearancePreferences,
    type WorkspaceMidiPreferences,
    type WorkspacePracticePreferences,
    type WorkspacePreferences,
} from './types.js';

type JsonRecord = Record<string, unknown>;

const PALETTES = new Set([
    'after-hours',
    'midnight',
    'high-contrast',
    'forest',
    'sunset',
    'synthwave',
]);
const THEME_MODES = new Set(['auto', 'light', 'dark']);
const NOTATIONS = new Set(['roman', 'name', 'nns']);
const SOLOIST_MODES = new Set(['monophonic', 'guitar']);
const SOLOIST_TRADE_MODES = new Set(['manual', 'sections', 'loops']);
const SOLOIST_TRADE_WITH = new Set(['off', 'soloist', 'drums']);
const SECTION_INSTRUMENTS = ['groove', 'bass', 'chords', 'harmony', 'soloist'] as const;
const PROTOTYPE_MEMBER_NAMES = new Set(Object.getOwnPropertyNames(Object.prototype));
const GROOVE_PATTERN_LANE_NAMES = new Set<string>(CHART_GROOVE_PATTERN_LANE_NAMES);
const PACK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

function isPlainRecord(value: unknown): value is JsonRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function pathFor(path: string, key: string): string {
    return `${path}.${key}`;
}

function hasField(record: JsonRecord, key: string): boolean {
    return Object.hasOwn(record, key);
}

/**
 * A legacy field (see `public/songbook/types.ts`): validated exactly as it always was when a
 * chart carries it, and reproduced in its old position, so a stored chart decodes to the same
 * bytes it was saved as. That identity is load-bearing: the account API refuses a Save whose
 * bytes are not the codec's canonical serialization (`decodeSaveRequest`), and a Save an older
 * build queued still carries these fields. Absent, it stays absent — capture never writes one.
 */
function legacy<K extends string, V>(
    record: JsonRecord,
    key: K,
    read: () => V,
): Partial<Record<K, V>> {
    return hasField(record, key) ? ({ [key]: read() } as Record<K, V>) : {};
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
    if (!hasField(record, key)) {
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

function optionalStringField(
    ctx: ValidationContext,
    record: JsonRecord,
    key: string,
    path: string,
    options: {
        min?: number;
        max: number;
        predicate?: (value: string) => boolean;
        message?: string;
    },
): string | undefined {
    if (!hasField(record, key)) {
        return undefined;
    }
    return stringField(ctx, record, key, path, options);
}

function nullableStringField(
    ctx: ValidationContext,
    record: JsonRecord,
    key: string,
    path: string,
    max: number,
): string | null {
    if (!hasField(record, key)) {
        return null;
    }
    if (record[key] === null) {
        return null;
    }
    return stringField(ctx, record, key, path, { max });
}

function booleanField(
    ctx: ValidationContext,
    record: JsonRecord,
    key: string,
    path: string,
): boolean {
    if (!hasField(record, key)) {
        return false;
    }
    const value = record[key];
    if (typeof value !== 'boolean') {
        ctx.issue(pathFor(path, key), 'invalid-type', 'Expected a boolean');
        return false;
    }
    return value;
}

function optionalBooleanField(
    ctx: ValidationContext,
    record: JsonRecord,
    key: string,
    path: string,
): boolean | undefined {
    return hasField(record, key) ? booleanField(ctx, record, key, path) : undefined;
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
    if (!hasField(record, key)) {
        return min;
    }
    const value = record[key];
    const validType = typeof value === 'number' && Number.isFinite(value);
    if (!validType) {
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

function optionalNumberField(
    ctx: ValidationContext,
    record: JsonRecord,
    key: string,
    path: string,
    min: number,
    max: number,
    integer = false,
): number | undefined {
    return hasField(record, key)
        ? numberField(ctx, record, key, path, min, max, integer)
        : undefined;
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

function validateSection(ctx: ValidationContext, candidate: unknown, path: string): ChartSection {
    const record = ctx.object(
        candidate,
        path,
        ['id', 'label', 'value'],
        ['repeat', 'key', 'isMinor', 'timeSignature', 'seamless', 'targetIntensity', 'instruments'],
    );
    const id = stringField(ctx, record, 'id', path, {
        min: 1,
        max: 100,
        predicate: (value) => !PROTOTYPE_MEMBER_NAMES.has(value),
        message: 'Section id is unsafe',
    });
    const label = stringField(ctx, record, 'label', path, {
        min: 1,
        max: 100,
        predicate: validateSafeDisplayString,
        message: 'Section label contains unsafe characters',
    });
    const value = stringField(ctx, record, 'value', path, {
        max: 1000,
        predicate: validateSafeDisplayString,
        message: 'Section progression contains unsafe characters',
    });
    const repeat = optionalNumberField(ctx, record, 'repeat', path, 1, 64, true);
    const key = optionalStringField(ctx, record, 'key', path, {
        max: 3,
        predicate: (entry) => entry === '' || KEY_ORDER.includes(entry),
        message: 'Unknown section key',
    });
    const isMinor = optionalBooleanField(ctx, record, 'isMinor', path);
    const timeSignature = optionalStringField(ctx, record, 'timeSignature', path, {
        max: 8,
        predicate: (entry) => entry === '' || Object.hasOwn(TIME_SIGNATURES, entry),
        message: 'Unknown section time signature',
    });
    const seamless = optionalBooleanField(ctx, record, 'seamless', path);
    const targetIntensity = optionalNumberField(ctx, record, 'targetIntensity', path, 0, 1);

    let instruments: ChartSection['instruments'];
    if (hasField(record, 'instruments')) {
        const instrumentRecord = ctx.object(
            record.instruments,
            `${path}.instruments`,
            [],
            SECTION_INSTRUMENTS,
        );
        instruments = {};
        for (const instrument of SECTION_INSTRUMENTS) {
            const enabled = optionalBooleanField(
                ctx,
                instrumentRecord,
                instrument,
                `${path}.instruments`,
            );
            if (enabled !== undefined) {
                instruments[instrument] = enabled;
            }
        }
    }

    return {
        id,
        label,
        value,
        ...(repeat === undefined ? {} : { repeat }),
        ...(key === undefined ? {} : { key }),
        ...(isMinor === undefined ? {} : { isMinor }),
        ...(timeSignature === undefined ? {} : { timeSignature }),
        ...(seamless === undefined ? {} : { seamless }),
        ...(targetIntensity === undefined ? {} : { targetIntensity }),
        ...(instruments === undefined ? {} : { instruments }),
    };
}

function validateArrangement(
    ctx: ValidationContext,
    candidate: unknown,
    path: string,
): ChartArrangement {
    const record = ctx.object(candidate, path, [
        'sections',
        'key',
        'timeSignature',
        'grouping',
        'isMinor',
        'notation',
        'lastChordPreset',
    ]);
    const rawSections = record.sections;
    let sections: ChartSection[] = [];
    if (!Array.isArray(rawSections)) {
        ctx.issue(`${path}.sections`, 'invalid-type', 'Expected an array of sections');
    } else if (rawSections.length > SONGBOOK_MAX_SECTIONS) {
        ctx.issue(
            `${path}.sections`,
            'too-many-sections',
            `Expected at most ${SONGBOOK_MAX_SECTIONS} sections`,
        );
    } else {
        sections = rawSections.map((section, index) =>
            validateSection(ctx, section, `${path}.sections.${index}`),
        );
        const ids = new Set<string>();
        for (let index = 0; index < sections.length; index++) {
            const id = sections[index].id;
            if (ids.has(id)) {
                ctx.issue(
                    `${path}.sections.${index}.id`,
                    'invalid-value',
                    'Section ids must be unique within a chart',
                );
            }
            ids.add(id);
        }
    }

    const key = stringField(ctx, record, 'key', path, {
        max: 3,
        predicate: (entry) => KEY_ORDER.includes(entry),
        message: 'Unknown chart key',
    });
    const timeSignature = stringField(ctx, record, 'timeSignature', path, {
        max: 8,
        predicate: (entry) => Object.hasOwn(TIME_SIGNATURES, entry),
        message: 'Unknown chart time signature',
    });

    let grouping: number[] | null = null;
    if (record.grouping !== null) {
        if (!isValidTimeSignatureGrouping(record.grouping, timeSignature)) {
            ctx.issue(
                `${path}.grouping`,
                'invalid-value',
                'Grouping must be a positive-integer partition of the selected meter',
            );
        } else {
            grouping = [...record.grouping];
        }
    }

    return {
        sections,
        key,
        timeSignature,
        grouping,
        isMinor: booleanField(ctx, record, 'isMinor', path),
        notation: stringField(ctx, record, 'notation', path, {
            max: 5,
            allowed: NOTATIONS,
            message: 'Unknown notation',
        }) as ChartArrangement['notation'],
        lastChordPreset: stringField(ctx, record, 'lastChordPreset', path, {
            min: 1,
            max: 100,
            predicate: validateSafeDisplayString,
            message: 'Preset name contains unsafe characters',
        }),
    };
}

function validatePerformance(
    ctx: ValidationContext,
    candidate: unknown,
    path: string,
): ChartPerformance {
    const record = ctx.object(
        candidate,
        path,
        ['bpm', 'seed', 'randomizeSeed'],
        ['energy', 'complexity'],
    );
    const seed = stringField(ctx, record, 'seed', path, {
        max: SONG_SEED_MAX_LENGTH,
        predicate: (value) => normalizeSongSeed(value) === value,
        message: 'Song seed is not canonical',
    });
    return {
        bpm: numberField(ctx, record, 'bpm', path, 40, 240, true),
        ...legacy(record, 'complexity', () => numberField(ctx, record, 'complexity', path, 0, 1)),
        seed,
        randomizeSeed: booleanField(ctx, record, 'randomizeSeed', path),
        ...(hasField(record, 'energy') ? { energy: energyField(ctx, record, path) } : {}),
    };
}

/** `'auto'`, or a fixed band energy from 0 to 1. */
function energyField(ctx: ValidationContext, record: JsonRecord, path: string): ChartEnergy {
    const value = record.energy;
    if (value === 'auto') {
        return value;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        ctx.issue(pathFor(path, 'energy'), 'invalid-value', "Expected 'auto' or 0 to 1");
        return 'auto';
    }
    return value;
}

function validateLaneMix(
    ctx: ValidationContext,
    record: JsonRecord,
    path: string,
): Pick<ChartChords, 'enabled' | 'voice' | 'autoSound' | 'volume' | 'reverb'> {
    return {
        enabled: booleanField(ctx, record, 'enabled', path),
        voice: stringField(ctx, record, 'voice', path, {
            min: 1,
            max: 128,
            predicate: validateVoice,
            message: 'Unknown instrument voice',
        }) as ChartChords['voice'],
        autoSound: booleanField(ctx, record, 'autoSound', path),
        volume: numberField(ctx, record, 'volume', path, 0, 1),
        reverb: numberField(ctx, record, 'reverb', path, 0, 1),
    };
}

const LANE_MIX_FIELDS = ['enabled', 'voice', 'autoSound', 'volume', 'reverb'] as const;

function validateChords(ctx: ValidationContext, candidate: unknown, path: string): ChartChords {
    const record = ctx.object(candidate, path, LANE_MIX_FIELDS, [
        'style',
        'instrument',
        'octave',
        'density',
    ]);
    return {
        ...validateLaneMix(ctx, record, path),
        ...legacy(record, 'style', () =>
            stringField(ctx, record, 'style', path, {
                min: 1,
                max: 64,
                predicate: isKnownChordStyle,
                message: 'Unknown chord style',
            }),
        ),
        ...legacy(record, 'instrument', () =>
            stringField(ctx, record, 'instrument', path, {
                min: 1,
                max: 100,
                predicate: validateSafeDisplayString,
                message: 'Instrument name contains unsafe characters',
            }),
        ),
        ...legacy(record, 'octave', () => numberField(ctx, record, 'octave', path, 0, 127, true)),
        ...legacy(
            record,
            'density',
            () =>
                stringField(ctx, record, 'density', path, {
                    min: 1,
                    max: 16,
                    predicate: isChordDensity,
                    message: 'Unknown chord density',
                }) as ChordDensity,
        ),
    };
}

function validateBass(ctx: ValidationContext, candidate: unknown, path: string): ChartBass {
    const record = ctx.object(candidate, path, LANE_MIX_FIELDS, ['style', 'octave']);
    return {
        ...validateLaneMix(ctx, record, path),
        ...legacy(record, 'style', () =>
            stringField(ctx, record, 'style', path, {
                min: 1,
                max: 64,
                predicate: isKnownBassStyle,
                message: 'Unknown bass style',
            }),
        ),
        ...legacy(record, 'octave', () => numberField(ctx, record, 'octave', path, 0, 127, true)),
    };
}

function validateSoloist(ctx: ValidationContext, candidate: unknown, path: string): ChartSoloist {
    const record = ctx.object(
        candidate,
        path,
        [...LANE_MIX_FIELDS, 'mode', 'autoMode'],
        [
            'tradeWith',
            'tradeBars',
            'tradeChoruses',
            'style',
            'preset',
            'octave',
            'phrasingIntensity',
            'tradeMode',
        ],
    );
    const tradeWith = optionalStringField(ctx, record, 'tradeWith', path, {
        min: 1,
        max: 16,
        predicate: (value) => SOLOIST_TRADE_WITH.has(value),
        message: 'Unknown soloist trade partner',
    }) as ChartSoloist['tradeWith'];
    const tradeBars = optionalNumberField(ctx, record, 'tradeBars', path, 2, 8, true);
    if (tradeBars !== undefined && !SOLOIST_TRADE_BARS.includes(tradeBars as 2 | 4 | 8)) {
        ctx.issue(pathFor(path, 'tradeBars'), 'invalid-value', 'A trade lasts 2, 4 or 8 bars');
    }
    // 0-4: 0 keeps trading forever, 1-4 is how many traded choruses before the head returns.
    const tradeChoruses = optionalNumberField(ctx, record, 'tradeChoruses', path, 0, 4, true);
    // Legacy fields sit where they always did, between the kept ones, so an old chart's
    // fields come back in their stored order (see `legacy`).
    return {
        ...validateLaneMix(ctx, record, path),
        ...legacy(record, 'style', () =>
            stringField(ctx, record, 'style', path, {
                min: 1,
                max: 64,
                predicate: isKnownSoloistStyle,
                message: 'Unknown soloist style',
            }),
        ),
        ...legacy(
            record,
            'preset',
            () =>
                stringField(ctx, record, 'preset', path, {
                    min: 1,
                    max: 16,
                    allowed: new Set(['trumpet']),
                    message: 'Unknown soloist preset',
                }) as 'trumpet',
        ),
        ...legacy(record, 'octave', () => numberField(ctx, record, 'octave', path, 0, 127, true)),
        mode: stringField(ctx, record, 'mode', path, {
            min: 1,
            max: 16,
            allowed: SOLOIST_MODES,
            message: 'Unknown soloist mode',
        }) as ChartSoloist['mode'],
        autoMode: booleanField(ctx, record, 'autoMode', path),
        ...legacy(record, 'phrasingIntensity', () =>
            numberField(ctx, record, 'phrasingIntensity', path, 0, 1),
        ),
        ...legacy(
            record,
            'tradeMode',
            () =>
                stringField(ctx, record, 'tradeMode', path, {
                    min: 1,
                    max: 16,
                    allowed: SOLOIST_TRADE_MODES,
                    message: 'Unknown soloist trade mode',
                }) as SoloistTradeMode,
        ),
        ...(tradeWith === undefined ? {} : { tradeWith }),
        ...(tradeBars === undefined ? {} : { tradeBars: tradeBars as ChartSoloist['tradeBars'] }),
        ...(tradeChoruses === undefined
            ? {}
            : { tradeChoruses: tradeChoruses as ChartSoloist['tradeChoruses'] }),
    };
}

function validateHarmony(ctx: ValidationContext, candidate: unknown, path: string): ChartHarmony {
    const record = ctx.object(candidate, path, [
        'enabled',
        'voice',
        'autoSound',
        'style',
        'octave',
        'volume',
        'reverb',
        'complexity',
    ]);
    return {
        ...validateLaneMix(ctx, record, path),
        style: stringField(ctx, record, 'style', path, {
            min: 1,
            max: 64,
            predicate: isKnownHarmonyStyle,
            message: 'Unknown harmony style',
        }),
        octave: numberField(ctx, record, 'octave', path, 0, 127, true),
        complexity: numberField(ctx, record, 'complexity', path, 0, 1),
    };
}

function validatePatternLane(
    ctx: ValidationContext,
    candidate: unknown,
    path: string,
): ChartGroovePatternLane {
    const record = ctx.object(candidate, path, ['name', 'steps']);
    const name = stringField(ctx, record, 'name', path, {
        min: 1,
        max: 100,
        allowed: GROOVE_PATTERN_LANE_NAMES,
        message: 'Unknown groove pattern lane',
    }) as ChartGroovePatternLane['name'];
    let steps: number[] = [];
    if (!Array.isArray(record.steps)) {
        ctx.issue(`${path}.steps`, 'invalid-type', 'Expected an array of pattern steps');
    } else if (record.steps.length > 128) {
        ctx.issue(`${path}.steps`, 'invalid-value', 'Pattern lane exceeds 128 steps');
    } else {
        steps = record.steps.map((step, index) => {
            if (typeof step !== 'number' || !Number.isInteger(step) || step < 0 || step > 2) {
                ctx.issue(
                    `${path}.steps.${index}`,
                    'invalid-value',
                    'Pattern steps must be 0, 1, or 2',
                );
                return 0;
            }
            return step;
        });
    }
    return { name, steps };
}

function validatePattern(
    ctx: ValidationContext,
    record: JsonRecord,
    path: string,
): ChartGroovePatternLane[] {
    let pattern: ChartGroovePatternLane[] = [];
    if (!Array.isArray(record.pattern)) {
        ctx.issue(`${path}.pattern`, 'invalid-type', 'Expected an array of groove lanes');
    } else if (record.pattern.length > 64) {
        ctx.issue(`${path}.pattern`, 'invalid-value', 'Groove pattern exceeds 64 lanes');
    } else {
        pattern = record.pattern.map((lane, index) =>
            validatePatternLane(ctx, lane, `${path}.pattern.${index}`),
        );
        const names = new Set<string>();
        for (let index = 0; index < pattern.length; index++) {
            const name = pattern[index].name;
            if (names.has(name)) {
                ctx.issue(
                    `${path}.pattern.${index}.name`,
                    'invalid-value',
                    'Duplicate pattern lane',
                );
            }
            names.add(name);
        }
    }
    return pattern;
}

function validateGroove(ctx: ValidationContext, candidate: unknown, path: string): ChartGroove {
    const record = ctx.object(
        candidate,
        path,
        [...LANE_MIX_FIELDS, 'swing', 'swingSub', 'humanize'],
        ['genre', 'measures', 'lastDrumPreset', 'genreFeel', 'lastSmartGenre', 'pattern'],
    );

    const genre = optionalStringField(ctx, record, 'genre', path, {
        min: 1,
        max: 64,
        predicate: (value) => GENRE_NAMES.includes(value),
        message: 'Unknown genre',
    });
    // The legacy pair, stored by every chart saved before `genre` existed. Checked exactly as
    // before when present, including that the two agree.
    const genreFeel = optionalStringField(ctx, record, 'genreFeel', path, {
        min: 1,
        max: 64,
        predicate: (value) => GENRE_FEELS.includes(value),
        message: 'Unknown genre feel',
    });
    const lastSmartGenre = optionalStringField(ctx, record, 'lastSmartGenre', path, {
        min: 1,
        max: 64,
        predicate: (value) => Object.hasOwn(SMART_GENRES, value),
        message: 'Unknown smart genre',
    });
    if (
        genreFeel !== undefined &&
        lastSmartGenre !== undefined &&
        resolveGenre(lastSmartGenre)?.feel !== genreFeel
    ) {
        ctx.issue(
            `${path}.lastSmartGenre`,
            'invalid-value',
            'Smart genre name and engine feel must describe the same genre',
        );
    }
    if (genre === undefined && genreFeel === undefined && lastSmartGenre === undefined) {
        ctx.issue(`${path}.genre`, 'missing-field', 'Missing required field genre');
    }

    return {
        ...validateLaneMix(ctx, record, path),
        ...legacy(record, 'measures', () => numberField(ctx, record, 'measures', path, 1, 8, true)),
        swing: numberField(ctx, record, 'swing', path, 0, 100),
        swingSub: stringField(ctx, record, 'swingSub', path, {
            min: 1,
            max: 4,
            predicate: isSwingSub,
            message: 'Unknown swing subdivision',
        }) as ChartGroove['swingSub'],
        humanize: numberField(ctx, record, 'humanize', path, 0, 100),
        ...legacy(record, 'lastDrumPreset', () =>
            stringField(ctx, record, 'lastDrumPreset', path, {
                min: 1,
                max: 100,
                predicate: validateSafeDisplayString,
                message: 'Drum preset name contains unsafe characters',
            }),
        ),
        ...(genreFeel === undefined ? {} : { genreFeel }),
        ...(lastSmartGenre === undefined ? {} : { lastSmartGenre }),
        ...legacy(record, 'pattern', () => validatePattern(ctx, record, path)),
        ...(genre === undefined ? {} : { genre }),
    };
}

function validateBand(ctx: ValidationContext, candidate: unknown, path: string): ChartBand {
    const record = ctx.object(
        candidate,
        path,
        ['chords', 'bass', 'soloist', 'groove'],
        ['harmony'],
    );
    return {
        chords: validateChords(ctx, record.chords, `${path}.chords`),
        bass: validateBass(ctx, record.bass, `${path}.bass`),
        soloist: validateSoloist(ctx, record.soloist, `${path}.soloist`),
        ...legacy(record, 'harmony', () => validateHarmony(ctx, record.harmony, `${path}.harmony`)),
        groove: validateGroove(ctx, record.groove, `${path}.groove`),
    };
}

/**
 * The chart's genre as a canonical name: `genre`, or — for a chart saved before it was stored
 * once — the legacy name/feel pair, which either spelling resolves (`resolveGenre`). Falls back
 * to Rock, the default band, only for a groove no validated chart can hold.
 */
export function chartGenre(groove: ChartGroove): string {
    return (
        resolveGenre(groove.genre)?.name ??
        resolveGenre(groove.lastSmartGenre)?.name ??
        resolveGenre(groove.genreFeel)?.name ??
        'Rock'
    );
}

function writtenMix(lane: ChartLaneMix): ChartLaneMix {
    const { enabled, voice, autoSound, volume, reverb } = lane;
    return { enabled, voice, autoSound, volume, reverb };
}

/**
 * A chart's performance and band as a chart is written today: the same fields the app's
 * `captureContent` writes, with an old chart's legacy fields left out and its genre stored once.
 * For building a NEW chart from an existing one's setup (a blank song, an import, a v1
 * conversion), so a new chart never starts life carrying the old engine's fields.
 */
export function writtenSettings(content: Pick<ChartContent, 'performance' | 'band'>): {
    performance: ChartPerformance;
    band: ChartBand;
} {
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
                genre: chartGenre(groove),
            },
        },
    };
}

function validateChartContent(
    ctx: ValidationContext,
    candidate: unknown,
    path: string,
): ChartContent {
    const record = ctx.object(candidate, path, ['arrangement', 'performance', 'band']);
    return {
        arrangement: validateArrangement(ctx, record.arrangement, `${path}.arrangement`),
        performance: validatePerformance(ctx, record.performance, `${path}.performance`),
        band: validateBand(ctx, record.band, `${path}.band`),
    };
}

function validateAppearance(
    ctx: ValidationContext,
    candidate: unknown,
    path: string,
): WorkspaceAppearancePreferences {
    const record = ctx.object(candidate, path, [
        'palette',
        'mode',
        'visualFlash',
        'qualityColors',
        'visualizerEnabled',
    ]);
    return {
        palette: stringField(ctx, record, 'palette', path, {
            min: 1,
            max: 32,
            allowed: PALETTES,
            message: 'Unknown palette',
        }) as WorkspaceAppearancePreferences['palette'],
        mode: stringField(ctx, record, 'mode', path, {
            min: 1,
            max: 8,
            allowed: THEME_MODES,
            message: 'Unknown theme mode',
        }) as WorkspaceAppearancePreferences['mode'],
        visualFlash: booleanField(ctx, record, 'visualFlash', path),
        qualityColors: booleanField(ctx, record, 'qualityColors', path),
        visualizerEnabled: booleanField(ctx, record, 'visualizerEnabled', path),
    };
}

function validatePractice(
    ctx: ValidationContext,
    candidate: unknown,
    path: string,
): WorkspacePracticePreferences {
    const record = ctx.object(
        candidate,
        path,
        [
            'countIn',
            'applyPresetSettings',
            'sessionTimer',
            'songMode',
            'rampBpmPerLoop',
            'rampStartPct',
        ],
        // RETIRED LEGACY KEY (#1314). `practiceMode` was a default-on preference with no
        // behavioural reader left after #1313 moved "leave room for the bass" onto the bass
        // LANE, so it is gone from the slice, the types and every writer. It stays listed here
        // — as OPTIONAL, and deliberately not read below — for one reason: every workspace
        // document saved before this release carries it, and `ctx.object` rejects any key it
        // does not know. Listing it keeps those documents loading; omitting it from the
        // returned object means the key is dropped on read and never written again (the
        // encoder stringifies what the validator BUILDS, so a round-trip strips it). No schema
        // version bump: nothing about the meaning of any surviving field changed.
        //
        // Do not "tidy" this into a `booleanField` read — required or not, reading it would
        // put the key back into the encoder's output and resurrect the field.
        ['practiceMode'],
    );
    return {
        countIn: booleanField(ctx, record, 'countIn', path),
        applyPresetSettings: booleanField(ctx, record, 'applyPresetSettings', path),
        sessionTimer: numberField(ctx, record, 'sessionTimer', path, 0, 60, true),
        songMode: booleanField(ctx, record, 'songMode', path),
        rampBpmPerLoop: numberField(ctx, record, 'rampBpmPerLoop', path, 1, 20, true),
        rampStartPct: numberField(ctx, record, 'rampStartPct', path, 0.4, 0.95),
    };
}

function validateMidi(
    ctx: ValidationContext,
    candidate: unknown,
    path: string,
): WorkspaceMidiPreferences {
    const record = ctx.object(candidate, path, [
        'enabled',
        'selectedOutputId',
        'inputEnabled',
        'selectedInputId',
        'chordsChannel',
        'bassChannel',
        'soloistChannel',
        'harmonyChannel',
        'drumsChannel',
        'chordsOctave',
        'bassOctave',
        'soloistOctave',
        'harmonyOctave',
        'drumsOctave',
        'latency',
        'muteLocal',
        'velocitySensitivity',
    ]);
    return {
        enabled: booleanField(ctx, record, 'enabled', path),
        selectedOutputId: nullableStringField(ctx, record, 'selectedOutputId', path, 512),
        inputEnabled: booleanField(ctx, record, 'inputEnabled', path),
        selectedInputId: nullableStringField(ctx, record, 'selectedInputId', path, 512),
        chordsChannel: numberField(ctx, record, 'chordsChannel', path, 1, 16, true),
        bassChannel: numberField(ctx, record, 'bassChannel', path, 1, 16, true),
        soloistChannel: numberField(ctx, record, 'soloistChannel', path, 1, 16, true),
        harmonyChannel: numberField(ctx, record, 'harmonyChannel', path, 1, 16, true),
        drumsChannel: numberField(ctx, record, 'drumsChannel', path, 1, 16, true),
        chordsOctave: numberField(ctx, record, 'chordsOctave', path, -2, 2, true),
        bassOctave: numberField(ctx, record, 'bassOctave', path, -2, 2, true),
        soloistOctave: numberField(ctx, record, 'soloistOctave', path, -2, 2, true),
        harmonyOctave: numberField(ctx, record, 'harmonyOctave', path, -2, 2, true),
        drumsOctave: numberField(ctx, record, 'drumsOctave', path, -2, 2, true),
        latency: numberField(ctx, record, 'latency', path, -100, 100, true),
        muteLocal: booleanField(ctx, record, 'muteLocal', path),
        velocitySensitivity: numberField(ctx, record, 'velocitySensitivity', path, 0.5, 2),
    };
}

type CandidatePreparationResult =
    | { kind: 'ok'; candidate: unknown }
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
        return { kind: 'ok', candidate: detachedCandidate };
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

export function validateChartDocument(candidate: unknown): CodecDecodeResult<ChartDocument> {
    const prepared = prepareCandidate(candidate);
    if (prepared.kind === 'invalid') {
        return prepared;
    }
    const version = readVersion(
        prepared.candidate,
        CHART_DOCUMENT_SCHEMA_VERSION,
        prepared.candidate,
    );
    if (version.kind !== 'current') {
        return version;
    }

    const ctx = new ValidationContext();
    const record = ctx.object(version.record, '$', [
        'schemaVersion',
        'id',
        'title',
        'createdAt',
        'updatedAt',
        'revision',
        'chart',
    ]);
    const value: ChartDocument = {
        schemaVersion: CHART_DOCUMENT_SCHEMA_VERSION,
        id: stringField(ctx, record, 'id', '$', {
            min: 1,
            max: 128,
            predicate: validateSafeDisplayString,
            message: 'Document id contains unsafe characters',
        }),
        title: stringField(ctx, record, 'title', '$', {
            min: 1,
            max: 200,
            predicate: validateSafeDisplayString,
            message: 'Document title contains unsafe characters',
        }),
        createdAt: stringField(ctx, record, 'createdAt', '$', {
            min: 1,
            max: 64,
            predicate: validateTimestamp,
            message: 'createdAt must be a valid timestamp',
        }),
        updatedAt: stringField(ctx, record, 'updatedAt', '$', {
            min: 1,
            max: 64,
            predicate: validateTimestamp,
            message: 'updatedAt must be a valid timestamp',
        }),
        revision: numberField(ctx, record, 'revision', '$', 0, Number.MAX_SAFE_INTEGER, true),
        chart: validateChartContent(ctx, record.chart, '$.chart'),
    };
    return ctx.issues.length > 0 ? { kind: 'invalid', issues: ctx.issues } : { kind: 'ok', value };
}

export function validateWorkspacePreferences(
    candidate: unknown,
): CodecDecodeResult<WorkspacePreferences> {
    const prepared = prepareCandidate(candidate);
    if (prepared.kind === 'invalid') {
        return prepared;
    }
    const version = readVersion(
        prepared.candidate,
        WORKSPACE_PREFERENCES_SCHEMA_VERSION,
        prepared.candidate,
    );
    if (version.kind !== 'current') {
        return version;
    }

    const ctx = new ValidationContext();
    const record = ctx.object(version.record, '$', [
        'schemaVersion',
        'appearance',
        'practice',
        'masterVolume',
        'midi',
    ]);
    const value: WorkspacePreferences = {
        schemaVersion: WORKSPACE_PREFERENCES_SCHEMA_VERSION,
        appearance: validateAppearance(ctx, record.appearance, '$.appearance'),
        practice: validatePractice(ctx, record.practice, '$.practice'),
        masterVolume: numberField(ctx, record, 'masterVolume', '$', 0, 1),
        midi: validateMidi(ctx, record.midi, '$.midi'),
    };
    return ctx.issues.length > 0 ? { kind: 'invalid', issues: ctx.issues } : { kind: 'ok', value };
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

export function decodeChartDocument(json: string): CodecDecodeResult<ChartDocument> {
    return decodeJson(json, validateChartDocument);
}

export function decodeWorkspacePreferences(json: string): CodecDecodeResult<WorkspacePreferences> {
    return decodeJson(json, validateWorkspacePreferences);
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

export function encodeChartDocument(document: ChartDocument): CodecEncodeResult {
    return encodeValidated(document, validateChartDocument);
}

export function encodeWorkspacePreferences(preferences: WorkspacePreferences): CodecEncodeResult {
    return encodeValidated(preferences, validateWorkspacePreferences);
}
