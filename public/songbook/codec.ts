import { KEY_ORDER, TIME_SIGNATURES } from '../config.js';
import {
    isKnownBassStyle,
    isKnownChordStyle,
    isKnownHarmonyStyle,
    isKnownSoloistStyle,
} from '../data/instrument-styles.js';
import { GENRE_FEELS, resolveGenre, SMART_GENRES } from '../data/smart-genres.js';
import { isValidTimeSignatureGrouping } from '../meter.js';
import { normalizeSongSeed, SONG_SEED_MAX_LENGTH, stripDangerousChars } from '../sanitize.js';
import { isChordDensity, isSwingSub } from '../types.js';
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
    type ChartGroove,
    type ChartGroovePatternLane,
    type ChartHarmony,
    type ChartPerformance,
    type ChartSection,
    type ChartSoloist,
    type CodecDecodeResult,
    type CodecEncodeResult,
    type CodecIssue,
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
    const record = ctx.object(candidate, path, ['bpm', 'complexity', 'seed', 'randomizeSeed']);
    const seed = stringField(ctx, record, 'seed', path, {
        max: SONG_SEED_MAX_LENGTH,
        predicate: (value) => normalizeSongSeed(value) === value,
        message: 'Song seed is not canonical',
    });
    return {
        bpm: numberField(ctx, record, 'bpm', path, 40, 240, true),
        complexity: numberField(ctx, record, 'complexity', path, 0, 1),
        seed,
        randomizeSeed: booleanField(ctx, record, 'randomizeSeed', path),
    };
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

function validateChords(ctx: ValidationContext, candidate: unknown, path: string): ChartChords {
    const record = ctx.object(
        candidate,
        path,
        ['enabled', 'voice', 'autoSound', 'style', 'octave', 'density', 'volume', 'reverb'],
        ['instrument'],
    );
    const instrument = optionalStringField(ctx, record, 'instrument', path, {
        min: 1,
        max: 100,
        predicate: validateSafeDisplayString,
        message: 'Instrument name contains unsafe characters',
    });
    return {
        ...validateLaneMix(ctx, record, path),
        style: stringField(ctx, record, 'style', path, {
            min: 1,
            max: 64,
            predicate: isKnownChordStyle,
            message: 'Unknown chord style',
        }),
        ...(instrument === undefined ? {} : { instrument }),
        octave: numberField(ctx, record, 'octave', path, 0, 127, true),
        density: stringField(ctx, record, 'density', path, {
            min: 1,
            max: 16,
            predicate: isChordDensity,
            message: 'Unknown chord density',
        }) as ChartChords['density'],
    };
}

function validateBass(ctx: ValidationContext, candidate: unknown, path: string): ChartBass {
    const record = ctx.object(candidate, path, [
        'enabled',
        'voice',
        'autoSound',
        'style',
        'octave',
        'volume',
        'reverb',
    ]);
    return {
        ...validateLaneMix(ctx, record, path),
        style: stringField(ctx, record, 'style', path, {
            min: 1,
            max: 64,
            predicate: isKnownBassStyle,
            message: 'Unknown bass style',
        }),
        octave: numberField(ctx, record, 'octave', path, 0, 127, true),
    };
}

function validateSoloist(ctx: ValidationContext, candidate: unknown, path: string): ChartSoloist {
    const record = ctx.object(candidate, path, [
        'enabled',
        'voice',
        'autoSound',
        'style',
        'preset',
        'octave',
        'volume',
        'reverb',
        'mode',
        'autoMode',
        'phrasingIntensity',
        'tradeMode',
    ]);
    return {
        ...validateLaneMix(ctx, record, path),
        style: stringField(ctx, record, 'style', path, {
            min: 1,
            max: 64,
            predicate: isKnownSoloistStyle,
            message: 'Unknown soloist style',
        }),
        preset: stringField(ctx, record, 'preset', path, {
            min: 1,
            max: 16,
            allowed: new Set(['trumpet']),
            message: 'Unknown soloist preset',
        }) as 'trumpet',
        octave: numberField(ctx, record, 'octave', path, 0, 127, true),
        mode: stringField(ctx, record, 'mode', path, {
            min: 1,
            max: 16,
            allowed: SOLOIST_MODES,
            message: 'Unknown soloist mode',
        }) as ChartSoloist['mode'],
        autoMode: booleanField(ctx, record, 'autoMode', path),
        phrasingIntensity: numberField(ctx, record, 'phrasingIntensity', path, 0, 1),
        tradeMode: stringField(ctx, record, 'tradeMode', path, {
            min: 1,
            max: 16,
            allowed: SOLOIST_TRADE_MODES,
            message: 'Unknown soloist trade mode',
        }) as ChartSoloist['tradeMode'],
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

function validateGroove(ctx: ValidationContext, candidate: unknown, path: string): ChartGroove {
    const record = ctx.object(candidate, path, [
        'enabled',
        'voice',
        'autoSound',
        'volume',
        'reverb',
        'measures',
        'swing',
        'swingSub',
        'humanize',
        'lastDrumPreset',
        'genreFeel',
        'lastSmartGenre',
        'pattern',
    ]);

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

    const genreFeel = stringField(ctx, record, 'genreFeel', path, {
        min: 1,
        max: 64,
        predicate: (value) => GENRE_FEELS.includes(value),
        message: 'Unknown genre feel',
    });
    const lastSmartGenre = stringField(ctx, record, 'lastSmartGenre', path, {
        min: 1,
        max: 64,
        predicate: (value) => Object.hasOwn(SMART_GENRES, value),
        message: 'Unknown smart genre',
    });
    if (resolveGenre(lastSmartGenre)?.feel !== genreFeel) {
        ctx.issue(
            `${path}.lastSmartGenre`,
            'invalid-value',
            'Smart genre name and engine feel must describe the same genre',
        );
    }

    return {
        ...validateLaneMix(ctx, record, path),
        measures: numberField(ctx, record, 'measures', path, 1, 8, true),
        swing: numberField(ctx, record, 'swing', path, 0, 100),
        swingSub: stringField(ctx, record, 'swingSub', path, {
            min: 1,
            max: 4,
            predicate: isSwingSub,
            message: 'Unknown swing subdivision',
        }) as ChartGroove['swingSub'],
        humanize: numberField(ctx, record, 'humanize', path, 0, 100),
        lastDrumPreset: stringField(ctx, record, 'lastDrumPreset', path, {
            min: 1,
            max: 100,
            predicate: validateSafeDisplayString,
            message: 'Drum preset name contains unsafe characters',
        }),
        genreFeel,
        lastSmartGenre,
        pattern,
    };
}

function validateBand(ctx: ValidationContext, candidate: unknown, path: string): ChartBand {
    const record = ctx.object(candidate, path, ['chords', 'bass', 'soloist', 'harmony', 'groove']);
    return {
        chords: validateChords(ctx, record.chords, `${path}.chords`),
        bass: validateBass(ctx, record.bass, `${path}.bass`),
        soloist: validateSoloist(ctx, record.soloist, `${path}.soloist`),
        harmony: validateHarmony(ctx, record.harmony, `${path}.harmony`),
        groove: validateGroove(ctx, record.groove, `${path}.groove`),
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
    const record = ctx.object(candidate, path, [
        'countIn',
        'applyPresetSettings',
        'sessionTimer',
        'songMode',
        'practiceMode',
        'rampBpmPerLoop',
        'rampStartPct',
    ]);
    return {
        countIn: booleanField(ctx, record, 'countIn', path),
        applyPresetSettings: booleanField(ctx, record, 'applyPresetSettings', path),
        sessionTimer: numberField(ctx, record, 'sessionTimer', path, 0, 60, true),
        songMode: booleanField(ctx, record, 'songMode', path),
        practiceMode: booleanField(ctx, record, 'practiceMode', path),
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

function prepareCandidate(candidate: unknown): CandidatePreparationResult {
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

function readVersion(
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

function decodeJson<T>(
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

function encodeValidated<T>(
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
