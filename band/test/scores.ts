/**
 * Compact score builders and the fixture charts every table-driven band test runs over.
 * Bars use the chart editor's own bar syntax (`parseChordBar`): `C F:2 G:2 | N.C. | / |`.
 */
import { parseChordBar } from '../../public/songbook/score-text.js';
import type {
    ScoreDirection,
    ScoreMeasure,
    ScoreSection,
    SemanticScore,
} from '../../public/songbook/score-types.js';

export interface SectionSpec {
    label: string;
    bars: string;
    repeat?: number;
    meter?: string;
    grouping?: number[];
    key?: string;
    isMinor?: boolean;
    targetIntensity?: number;
    /** Written bar index → navigation/repeat markers. */
    start?: Record<number, ScoreDirection[]>;
    end?: Record<number, ScoreDirection[]>;
    fermataBars?: number[];
}

let ids = 0;

export function score(
    sections: SectionSpec[],
    { key = 'C', meter = '4/4', isMinor = false } = {},
): SemanticScore {
    return {
        notation: 'name',
        key,
        isMinor,
        meter,
        grouping: null,
        sections: sections.map((spec, s): ScoreSection => {
            const barMeter = spec.meter ?? meter;
            const measures = spec.bars
                .split('|')
                .map((bar) => bar.trim())
                .filter(Boolean)
                .map((bar, m): ScoreMeasure => {
                    const parsed = parseChordBar(bar, barMeter);
                    if (parsed.kind !== 'ok') {
                        throw new Error(`fixture ${spec.label} bar ${m + 1}: ${bar}`);
                    }
                    const events = spec.fermataBars?.includes(m)
                        ? parsed.value.map((e, i, all) =>
                              i === all.length - 1 ? { ...e, fermata: true } : e,
                          )
                        : parsed.value;
                    return {
                        id: `m${ids++}`,
                        content: { kind: 'events', events },
                        ...(spec.start?.[m] ? { start: spec.start[m] } : {}),
                        ...(spec.end?.[m] ? { end: spec.end[m] } : {}),
                    };
                });
            return {
                id: `s${s}`,
                label: spec.label,
                repeat: spec.repeat ?? 1,
                measures,
                ...(spec.meter ? { meter: spec.meter } : {}),
                ...(spec.grouping ? { grouping: spec.grouping } : {}),
                ...(spec.key ? { key: spec.key } : {}),
                ...(spec.isMinor !== undefined ? { isMinor: spec.isMinor } : {}),
                ...(spec.targetIntensity !== undefined
                    ? { targetIntensity: spec.targetIntensity }
                    : {}),
            };
        }),
    };
}

/** The charts every style is exercised against: common forms plus the awkward cases. */
export const FIXTURES: Record<string, SemanticScore> = {
    blues: score([
        {
            label: 'A',
            bars: 'C7 | F7 | C7 | C7 | F7 | F7 | C7 | A7 | Dm7 | G7 | C7 A7 | Dm7 G7',
        },
    ]),
    rhythmChanges: score(
        [
            {
                label: 'A',
                bars: 'Bb^7 G7 | Cm7 F7 | Dm7 G7 | Cm7 F7 | Bb^7 Bb7 | Eb^7 Eo7 | Dm7 G7 | Cm7 F7',
                repeat: 2,
            },
            { label: 'B', bars: 'D7 | D7 | G7 | G7 | C7 | C7 | F7 | F7' },
            {
                label: 'A',
                bars: 'Bb^7 G7 | Cm7 F7 | Dm7 G7 | Cm7 F7 | Bb^7 Bb7 | Eb^7 Eo7 | Cm7 F7 | Bb6',
            },
        ],
        { key: 'Bb' },
    ),
    popSong: score([
        { label: 'Intro', bars: 'C | G | Am | F', targetIntensity: 0.3 },
        { label: 'Verse', bars: 'C | G | Am | F | C | G | F | F' },
        { label: 'Chorus', bars: 'F | G | Am | C/E | F | G | C | C', targetIntensity: 0.85 },
        { label: 'Outro', bars: 'F | G | C | C' },
    ]),
    minorFunk: score(
        [
            { label: 'Groove', bars: 'Em9 | Em9 | Em9 | A13 | Em9 | Em9 | Cmaj7 B7#9 | Em9' },
            { label: 'Bridge', bars: 'Am9 | Am9 | Cmaj7 | B7alt' },
        ],
        { key: 'E', isMinor: true },
    ),
    bossa: score([
        { label: 'A', bars: 'Dm7 | G7 | Cmaj7 | A7b9 | Dm7 | G7 | Em7b5 A7 | Dm6' },
        { label: 'B', bars: 'Gm7 | C7 | Fmaj7 | Bb7#11 | Em7 | A7 | Dm7 G7 | Cmaj7' },
    ]),
    romanNumerals: score([{ label: 'A', bars: 'I | vi7 | ii7 | V7 | iii7 VI7 | ii7 V7 | I | I' }], {
        key: 'G',
    }),
    awkward: score([
        { label: 'Waltz', bars: 'Am | Dm | E7 | Am', meter: '3/4' },
        { label: 'Seven', bars: 'Dm7 | G7 | Cmaj7 | C6', meter: '7/8', grouping: [2, 2, 3] },
        { label: 'Six', bars: 'F | C/E | Dm | Dm', meter: '6/8' },
        { label: 'Holds', bars: 'C | / | N.C. | G7:3 N.C.:1 | C', fermataBars: [4] },
    ]),
};

/**
 * One-chord vamps (#1488): the chord written out in every bar (the 8 bars the organ fell silent
 * on), and held with slashes over a 10-bar section (a 6-bar last phrase). Kept apart from
 * `FIXTURES` so every table-driven test over those stays as it was.
 */
export const VAMP_FIXTURES: Record<string, SemanticScore> = {
    written: score([{ label: 'A', bars: Array(8).fill('Dm7').join(' | ') }]),
    slashes: score([{ label: 'A', bars: ['Dm7', ...Array(9).fill('/')].join(' | ') }]),
};

/**
 * A held ending in every meter the suite plays (#1503): each chart closes on its V7, which the
 * band resolves and holds, so the pass ends on the held ending in that meter. (`FIXTURES`'
 * odd meters sit mid-chart; their last bar is 4/4.) Kept apart from `FIXTURES` so every
 * table-driven test over those stays as it was.
 */
export const METER_ENDINGS: Record<string, SemanticScore> = {
    '4/4': score([{ label: 'A', bars: 'C | Am7 | Dm7 | G7' }]),
    '3/4': score([{ label: 'A', bars: 'C | Am7 | Dm7 | G7', meter: '3/4' }]),
    '6/8': score([{ label: 'A', bars: 'C | Am7 | Dm7 | G7', meter: '6/8' }]),
    '7/8': score([{ label: 'A', bars: 'C | Am7 | Dm7 | G7', meter: '7/8', grouping: [2, 2, 3] }]),
};

const LAST_CHORUS: ScoreDirection = {
    kind: 'last-chorus',
    destination: { kind: 'coda', via: 'to-coda', target: 'coda' },
};

/**
 * Charts that count their choruses (#1475): one timeline holding every chorus, played once.
 * Kept apart from `FIXTURES` so every table-driven test over those stays as it was; the suites
 * that cover a counted performance (the invariants, `arrange/choruses.test.ts`) read these.
 */
export const COUNTED_FIXTURES: Record<string, SemanticScore> = {
    /** Four times round a blues: the head, two solo choruses, the out-head. */
    bluesFour: { ...FIXTURES.blues, choruses: 4 },
    /** Three choruses of a blues and a two-bar tag taken on the last ("To Coda, last chorus"). */
    bluesCoda: {
        ...score([
            {
                label: 'A',
                bars: 'C7 | F7 | C7 | C7 | F7 | F7 | C7 | A7 | Dm7 | G7 | C7 A7 | Dm7 G7',
                end: { 11: [{ kind: 'coda', label: 'to-coda' }, LAST_CHORUS] },
            },
            {
                label: 'Coda',
                bars: 'Dm7 G7 | C7',
                start: { 0: [{ kind: 'coda', label: 'coda' }] },
            },
        ]),
        choruses: 3,
    },
};
