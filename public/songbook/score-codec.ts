import { prepareCandidate } from './codec.js';
import { resolveScoreContext } from './score-context.js';
import { addScoreDurations, scoreDuration, scoreMeter } from './score-duration.js';
import { isScoreChord } from './score-text.js';
import type { ScoreContext, ScoreDuration, SemanticScore } from './score-types.js';
import type { CodecDecodeResult, CodecIssue } from './types.js';

type RecordValue = Record<string, unknown>;
const CONTEXT = ['key', 'isMinor', 'meter', 'grouping'];
const LANES = ['groove', 'bass', 'chords', 'harmony', 'soloist'];
const START_DIRECTIONS = ['repeat-start', 'ending-start', 'ending-end', 'segno', 'coda', 'fine'];
const END_DIRECTIONS = ['repeat-end', 'ending-end', 'segno', 'coda', 'fine', 'jump'];
// biome-ignore lint/suspicious/noControlCharactersInRegex: reject controls at the untrusted display-text boundary.
const UNSAFE_TEXT = /[<>\u0000-\u001f\u007f]/;

class InvalidScore extends Error {
    readonly issue: CodecIssue;

    constructor(issue: CodecIssue) {
        super(issue.message);
        this.issue = issue;
    }
}

function requireValue(condition: unknown, path: string, message: string): asserts condition {
    if (!condition) {
        throw new InvalidScore({ path, code: 'invalid-value', message });
    }
}

function object(
    value: unknown,
    path: string,
    required: readonly string[],
    optional: readonly string[] = [],
): RecordValue {
    requireValue(
        value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            Object.getPrototypeOf(value) === Object.prototype,
        path,
        'Expected a plain JSON object.',
    );
    const record = value as RecordValue;
    for (const key of required) {
        requireValue(Object.hasOwn(record, key), `${path}.${key}`, 'Missing required field.');
    }
    for (const key of Object.keys(record)) {
        requireValue(
            required.includes(key) || optional.includes(key),
            `${path}.${key}`,
            'Unknown field.',
        );
    }
    return record;
}

function list(value: unknown, path: string, max: number, min = 0): unknown[] {
    requireValue(
        Array.isArray(value) && value.length >= min && value.length <= max,
        path,
        `Expected ${min}–${max} entries.`,
    );
    return value;
}

function text(value: unknown, path: string, max = 200): string {
    requireValue(
        typeof value === 'string' &&
            value.length > 0 &&
            value.length <= max &&
            !UNSAFE_TEXT.test(value),
        path,
        'Expected bounded, plain display text.',
    );
    return value;
}

function identity(value: unknown, path: string): string {
    const id = text(value, path, 128);
    requireValue(!Object.hasOwn(Object.prototype, id), path, 'Reserved identity.');
    return id;
}

function integer(value: unknown, path: string, min: number, max: number): number {
    requireValue(
        typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max,
        path,
        `Expected an integer from ${min} to ${max}.`,
    );
    return value;
}

function boolean(value: unknown, path: string): void {
    requireValue(typeof value === 'boolean', path, 'Expected a boolean.');
}

function fraction(value: unknown, path: string, allowZero = false): ScoreDuration {
    const parts = list(value, path, 2, 2);
    const n = integer(parts[0], `${path}[0]`, allowZero ? 0 : 1, 1_000_000);
    const d = integer(parts[1], `${path}[1]`, 1, 1_000_000);
    const reduced = scoreDuration(n, d);
    requireValue(reduced[0] === n && reduced[1] === d, path, 'Use a reduced rational duration.');
    return reduced;
}

function context(
    record: RecordValue,
    path: string,
    inherited: ReturnType<typeof resolveScoreContext>,
): ReturnType<typeof resolveScoreContext> {
    if (Object.hasOwn(record, 'key')) {
        requireValue(
            /^[A-G][#b]?$/.test(text(record.key, `${path}.key`, 2)),
            `${path}.key`,
            'Unknown tonic spelling.',
        );
    }
    if (Object.hasOwn(record, 'isMinor')) {
        boolean(record.isMinor, `${path}.isMinor`);
    }
    const meter = Object.hasOwn(record, 'meter')
        ? text(record.meter, `${path}.meter`, 5)
        : inherited.meter;
    let counts: number;
    try {
        counts = scoreMeter(meter).counts;
    } catch {
        throw new InvalidScore({
            path: `${path}.meter`,
            code: 'invalid-value',
            message: 'Unsupported meter spelling.',
        });
    }
    if (Object.hasOwn(record, 'grouping') && record.grouping !== null) {
        const grouping = list(record.grouping, `${path}.grouping`, counts, 1).map((value, i) =>
            integer(value, `${path}.grouping[${i}]`, 1, counts),
        );
        requireValue(
            grouping.reduce((sum, n) => sum + n, 0) === counts,
            `${path}.grouping`,
            'Grouping must fill the meter.',
        );
    }
    return resolveScoreContext(inherited, record as ScoreContext);
}

interface Navigation {
    markers: Map<string, string>;
    references: { kind: string; label: string; path: string }[];
    endingPasses: Set<number>;
    endingReferences: { pass: number; path: string }[];
}

function directions(value: unknown, path: string, allowed: string[], navigation: Navigation): void {
    for (const [index, item] of list(value, path, 16).entries()) {
        const at = `${path}[${index}]`;
        requireValue(item !== null && typeof item === 'object', at, 'Expected a direction.');
        const kind = (item as RecordValue).kind;
        requireValue(
            typeof kind === 'string' && allowed.includes(kind),
            `${at}.kind`,
            'Unknown direction or wrong bar boundary.',
        );
        if (kind === 'repeat-start' || kind === 'ending-end') {
            object(item, at, ['kind']);
        } else if (kind === 'repeat-end') {
            const record = object(item, at, ['kind', 'times']);
            integer(record.times, `${at}.times`, 1, 64);
        } else if (kind === 'ending-start') {
            const record = object(item, at, ['kind', 'passes']);
            const passes = list(record.passes, `${at}.passes`, 64, 1).map((pass, i) =>
                integer(pass, `${at}.passes[${i}]`, 1, 64),
            );
            requireValue(
                new Set(passes).size === passes.length,
                `${at}.passes`,
                'Ending passes must be distinct.',
            );
            for (const pass of passes) {
                navigation.endingPasses.add(pass);
            }
        } else if (kind === 'jump') {
            const record = object(item, at, ['kind', 'from', 'destination', 'repeats'], ['segno']);
            requireValue(
                record.from === 'start' || record.from === 'segno',
                `${at}.from`,
                'Expected start or segno.',
            );
            requireValue(
                record.repeats === 'play' || record.repeats === 'skip',
                `${at}.repeats`,
                'Specify repeat policy after the jump.',
            );
            if (record.from === 'segno') {
                navigation.references.push({
                    kind: 'segno',
                    label: identity(record.segno, `${at}.segno`),
                    path: at,
                });
            } else {
                requireValue(
                    !Object.hasOwn(record, 'segno'),
                    `${at}.segno`,
                    'A D.C. jump has no segno target.',
                );
            }
            const destination = record.destination as RecordValue | null;
            requireValue(
                destination && typeof destination === 'object',
                `${at}.destination`,
                'Expected a jump destination.',
            );
            const targetPath = `${at}.destination`;
            if (destination.kind === 'end') {
                object(destination, targetPath, ['kind']);
            } else if (destination.kind === 'fine') {
                object(destination, targetPath, ['kind', 'label']);
                navigation.references.push({
                    kind: 'fine',
                    label: identity(destination.label, `${targetPath}.label`),
                    path: at,
                });
            } else if (destination.kind === 'coda') {
                object(destination, targetPath, ['kind', 'via', 'target']);
                for (const field of ['via', 'target']) {
                    navigation.references.push({
                        kind: 'coda',
                        label: identity(destination[field], `${targetPath}.${field}`),
                        path: at,
                    });
                }
                requireValue(
                    destination.via !== destination.target,
                    targetPath,
                    'Coda departure and arrival must differ.',
                );
            } else if (destination.kind === 'ending') {
                object(destination, targetPath, ['kind', 'pass']);
                const pass = integer(destination.pass, `${targetPath}.pass`, 1, 64);
                navigation.endingReferences.push({ pass, path: targetPath });
            } else {
                requireValue(false, targetPath, 'Unknown jump destination.');
            }
        } else {
            const record = object(item, at, ['kind', 'label']);
            const label = identity(record.label, `${at}.label`);
            requireValue(
                !navigation.markers.has(label),
                `${at}.label`,
                'Marker identities must be unique.',
            );
            navigation.markers.set(label, kind);
        }
    }
}

function events(value: unknown, path: string, length: ScoreDuration): void {
    let total: ScoreDuration = [0, 1];
    for (const [index, item] of list(value, path, 64, 1).entries()) {
        const at = `${path}[${index}]`;
        requireValue(item !== null && typeof item === 'object', at, 'Expected an event.');
        const kind = (item as RecordValue).kind;
        requireValue(
            kind === 'chord' || kind === 'no-chord' || kind === 'hold',
            `${at}.kind`,
            'Unknown event kind.',
        );
        const event = object(
            item,
            at,
            kind === 'chord' ? ['kind', 'symbol', 'duration'] : ['kind', 'duration'],
            kind === 'chord' ? ['alternates', 'fermata'] : ['fermata'],
        );
        if (Object.hasOwn(event, 'fermata')) {
            boolean(event.fermata, `${at}.fermata`);
        }
        if (kind === 'chord') {
            requireValue(
                isScoreChord(text(event.symbol, `${at}.symbol`, 80)),
                `${at}.symbol`,
                'Unsupported full chord spelling.',
            );
            if (Object.hasOwn(event, 'alternates')) {
                for (const [i, symbol] of list(
                    event.alternates,
                    `${at}.alternates`,
                    8,
                    1,
                ).entries()) {
                    requireValue(
                        isScoreChord(text(symbol, `${at}.alternates[${i}]`, 80)),
                        `${at}.alternates[${i}]`,
                        'Unsupported alternate chord.',
                    );
                }
            }
        }
        total = addScoreDurations(total, fraction(event.duration, `${at}.duration`));
    }
    requireValue(
        total[0] === length[0] && total[1] === length[1],
        path,
        'Events must fill exactly one measure.',
    );
}

/** Structural/authored validity only; a performance adapter must separately prove playable form. */
export function validateSemanticScore(candidate: unknown): CodecDecodeResult<SemanticScore> {
    const prepared = prepareCandidate(candidate);
    if (prepared.kind !== 'ok') {
        return prepared;
    }
    try {
        const root = object(prepared.candidate, '$', [
            'notation',
            'key',
            'isMinor',
            'meter',
            'grouping',
            'sections',
        ]);
        requireValue(
            typeof root.notation === 'string' && ['name', 'roman', 'nns'].includes(root.notation),
            '$.notation',
            'Unknown notation.',
        );
        const globalContext = context(root, '$', {
            key: 'C',
            isMinor: false,
            meter: '4/4',
            grouping: null,
        });
        const sectionIds = new Set<string>();
        const measures = new Map<
            string,
            { length: ScoreDuration; source?: string; display?: string }
        >();
        const navigation: Navigation = {
            markers: new Map(),
            references: [],
            endingPasses: new Set(),
            endingReferences: [],
        };
        let previousMeasure:
            | { length: ScoreDuration; source?: string; display?: string }
            | undefined;
        for (const [i, item] of list(root.sections, '$.sections', 500, 1).entries()) {
            const at = `$.sections[${i}]`;
            const section = object(
                item,
                at,
                ['id', 'label', 'repeat', 'measures'],
                [...CONTEXT, 'seamless', 'targetIntensity', 'instruments'],
            );
            const id = identity(section.id, `${at}.id`);
            requireValue(!sectionIds.has(id), `${at}.id`, 'Duplicate section identity.');
            sectionIds.add(id);
            text(section.label, `${at}.label`, 100);
            integer(section.repeat, `${at}.repeat`, 1, 64);
            if (Object.hasOwn(section, 'seamless')) {
                boolean(section.seamless, `${at}.seamless`);
            }
            if (Object.hasOwn(section, 'targetIntensity')) {
                requireValue(
                    typeof section.targetIntensity === 'number' &&
                        Number.isFinite(section.targetIntensity) &&
                        section.targetIntensity >= 0 &&
                        section.targetIntensity <= 1,
                    `${at}.targetIntensity`,
                    'Intensity must be between zero and one.',
                );
            }
            if (Object.hasOwn(section, 'instruments')) {
                const lanes = object(section.instruments, `${at}.instruments`, [], LANES);
                for (const lane of Object.keys(lanes)) {
                    boolean(lanes[lane], `${at}.instruments.${lane}`);
                }
            }
            let effective = context(section, at, globalContext);
            for (const [j, entry] of list(section.measures, `${at}.measures`, 4096, 1).entries()) {
                const location = `${at}.measures[${j}]`;
                const measure = object(
                    entry,
                    location,
                    ['id', 'content'],
                    [...CONTEXT, 'start', 'end', 'annotations'],
                );
                const measureId = identity(measure.id, `${location}.id`);
                requireValue(
                    !measures.has(measureId),
                    `${location}.id`,
                    'Duplicate measure identity.',
                );
                requireValue(
                    measures.size < 4096,
                    location,
                    'Score exceeds 4,096 authored measures.',
                );
                effective = context(measure, location, effective);
                const length = scoreMeter(effective.meter).length;
                const content = measure.content as RecordValue | null;
                requireValue(
                    content && typeof content === 'object',
                    `${location}.content`,
                    'Expected measure content.',
                );
                let source: string | undefined;
                let display: string | undefined;
                if (content.kind === 'events') {
                    object(content, `${location}.content`, ['kind', 'events']);
                    events(content.events, `${location}.content.events`, length);
                } else {
                    object(content, `${location}.content`, ['kind', 'measureId', 'display']);
                    requireValue(
                        content.kind === 'repeat',
                        `${location}.content.kind`,
                        'Unknown measure content.',
                    );
                    source = identity(content.measureId, `${location}.content.measureId`);
                    const earlier = measures.get(source);
                    requireValue(
                        earlier &&
                            earlier.length[0] === length[0] &&
                            earlier.length[1] === length[1],
                        `${location}.content.measureId`,
                        'A measure repeat needs an earlier source of the same duration.',
                    );
                    display = text(content.display, `${location}.content.display`, 16);
                    requireValue(
                        ['one-bar', 'two-bar-start', 'two-bar-end'].includes(display),
                        `${location}.content.display`,
                        'Unknown measure-repeat display.',
                    );
                    if (display === 'two-bar-end') {
                        requireValue(
                            previousMeasure?.display === 'two-bar-start',
                            location,
                            'Missing first bar of a two-bar repeat.',
                        );
                    }
                }
                if (previousMeasure?.display === 'two-bar-start') {
                    requireValue(
                        display === 'two-bar-end',
                        location,
                        'Missing second bar of a two-bar repeat.',
                    );
                }
                previousMeasure = { length, source, display };
                measures.set(measureId, previousMeasure);
                if (Object.hasOwn(measure, 'start')) {
                    directions(measure.start, `${location}.start`, START_DIRECTIONS, navigation);
                }
                if (Object.hasOwn(measure, 'end')) {
                    directions(measure.end, `${location}.end`, END_DIRECTIONS, navigation);
                }
                if (Object.hasOwn(measure, 'annotations')) {
                    for (const [k, note] of list(
                        measure.annotations,
                        `${location}.annotations`,
                        32,
                    ).entries()) {
                        const where = `${location}.annotations[${k}]`;
                        const annotation = object(note, where, ['text', 'at', 'placement']);
                        text(annotation.text, `${where}.text`, 500);
                        requireValue(
                            annotation.placement === 'above' || annotation.placement === 'below',
                            `${where}.placement`,
                            'Unknown annotation placement.',
                        );
                        const offset = fraction(annotation.at, `${where}.at`, true);
                        requireValue(
                            offset[0] * length[1] <= length[0] * offset[1],
                            `${where}.at`,
                            'Annotation lies outside its measure.',
                        );
                    }
                }
            }
        }
        requireValue(
            previousMeasure?.display !== 'two-bar-start',
            '$.sections',
            'Missing second bar of a two-bar repeat.',
        );
        for (const ref of navigation.endingReferences) {
            requireValue(
                navigation.endingPasses.has(ref.pass),
                ref.path,
                'Missing ending pass destination.',
            );
        }
        for (const ref of navigation.references) {
            requireValue(
                navigation.markers.get(ref.label) === ref.kind,
                ref.path,
                `Missing ${ref.kind} destination.`,
            );
        }
        return { kind: 'ok', value: prepared.candidate as SemanticScore };
    } catch (error) {
        return {
            kind: 'invalid',
            issues: [
                error instanceof InvalidScore
                    ? error.issue
                    : {
                          path: '$',
                          code: 'invalid-value',
                          message: 'Score contains invalid or excessive exact timing.',
                      },
            ],
        };
    }
}
