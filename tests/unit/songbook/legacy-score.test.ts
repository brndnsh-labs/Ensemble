/**
 * The text-chart converter against the old parser it replaces (#1737). A measure-less (schema
 * 1) chart converts to a score that plays what `validateProgression` played: each chord's
 * pitch content (read by the band, from the old parser's own name for it) and each chord's
 * onset in its bar (the old parser's rounded step map). The old parser runs for real here,
 * never a model of it: a parser rework once passed shipped-data parity and a matrix and still
 * missed four regressions.
 *
 * Where the converter deliberately plays something else, the difference is one of a few named
 * kinds (`Verdict`), each with its reason; anything else is a failure.
 */
// cspell:ignore mmaj Majadd MAJadd Maadd MAadd Calt Cnope

import { type ChordFacts, parseChord } from '../../../band/theory/chord.js';
import { notePc } from '../../../band/theory/pitch.js';
import { bandForGenre, STANDARDS } from '../../../prototypes/v2/lib/standards.js';
import {
    LEGACY_QUALITY_SPELLINGS,
    readLegacyChordToken,
    validateProgression,
} from '../../../public/engine/chords-engine.js';
import {
    convertLegacyChordToken,
    legacyBarSteps,
    proposeLegacyScoreConversion,
} from '../../../public/songbook/legacy-score.js';
import { durationToSteps } from '../../../public/songbook/score-duration.js';
import type { ScoreEvent } from '../../../public/songbook/score-types.js';
import type { ChartDocument } from '../../../public/songbook/types.js';
import presetsCorpus from '../../fixtures/v1/chord-presets.json';
import sessionsFixture from '../../fixtures/v1/sessions.json';
import { makeMulberry32 } from '../../utils/seeded-random.js';

interface LegacySection {
    id?: string;
    label: string;
    value: string;
    key?: string;
    timeSignature?: string;
    isMinor?: boolean;
    repeat?: number;
}

interface LegacyChart {
    title?: string;
    key?: string;
    timeSignature?: string;
    isMinor?: boolean;
    sections: LegacySection[];
}

/** The old parser, run for real over one section's text: its chords and their step map. */
function v1Parse(value: string, key = 'C', timeSignature = '4/4', isMinor = false) {
    const state = {
        arranger: { sections: [{ id: 's', label: 'S', value }], key, timeSignature, isMinor },
    } as unknown as {
        arranger: {
            progression: { absName: string }[];
            stepMap: { start: number; end: number }[];
        };
    };
    validateProgression(state);
    return state.arranger;
}

function v1Document(chart: LegacyChart): string {
    const document: ChartDocument = {
        schemaVersion: 1,
        id: 'legacy',
        title: chart.title ?? 'Legacy',
        createdAt: '2026-10-01T12:00:00.000Z',
        updatedAt: '2026-10-01T12:00:00.000Z',
        revision: 0,
        chart: {
            arrangement: {
                key: chart.key ?? 'C',
                isMinor: chart.isMinor ?? false,
                timeSignature: chart.timeSignature ?? '4/4',
                grouping: null,
                notation: 'name',
                sections: chart.sections.map((section, i) => ({
                    ...section,
                    id: section.id ?? `s${i}`,
                })),
            },
            performance: { bpm: 120, seed: '', randomizeSeed: false },
            band: bandForGenre('Jazz'),
        },
    };
    return JSON.stringify(document);
}

/** What is heard: the chord's pitch classes and its bass. */
const sounding = (facts: ChordFacts) => ({
    pcs: [...new Set(facts.intervals.map((n) => (facts.root + n) % 12))].sort((a, b) => a - b),
    bass: facts.bass,
    root: facts.root,
});

const LOWERCASE_NUMERAL = /^[#b]?(?:iii|ii|iv|i|vii|vi|v)$/;
/** Dominants with two written alterations, which the old parser played as `7alt`. */
const TWO_ALTERATIONS = new Set(['7#9#5', '7#9b5', '7b9#5', '7b9b5']);

/**
 * How the converted chord relates to the one the old parser played.
 *
 * - `same`: the same pitch classes over the same bass.
 * - `written-tones`: the chart wrote tones the old parser dropped (`C13b9` played C7b9,
 *   `C6/9/E` lost its bass), and the converted chord is the written token, which the band plays
 *   in full: everything the old parser played, plus what it dropped.
 * - `two-alterations`: `C7#9b5` and its kin played the old parser's `7alt` (b9, #9 and b13 all
 *   at once, a #5 against a written b5); the band plays the alterations written.
 * - `literal-minor`: a lowercase numeral on `maj7#11`, `maj7#5`, `maj7b5` or `7alt`, which the
 *   old parser had no minor reading for and played with a major third. The band reads a
 *   lowercase numeral literally as minor (DECISION 2026-10-12, #1662).
 */
type Verdict = 'same' | 'written-tones' | 'two-alterations' | 'literal-minor';

function verdict(token: string, v1Name: string, symbol: string, keyName: string, minor: boolean) {
    const key = { tonic: notePc(keyName), minor };
    const v1Facts = parseChord(v1Name, key);
    const v2Facts = parseChord(symbol, key);
    if (!v1Facts || !v2Facts) {
        return `${token}: unreadable (old ${v1Name}, new ${symbol})`;
    }
    const v1 = sounding(v1Facts);
    const v2 = sounding(v2Facts);
    if (v1.pcs.join() === v2.pcs.join() && v1.bass === v2.bass) {
        return 'same' as Verdict;
    }
    const read = readLegacyChordToken(token);
    const asWritten = symbol === token || symbol === token.replace(/[()]/g, '');
    if (LOWERCASE_NUMERAL.test(read.root) && /^(?:maj7#11|maj7#5|maj7b5|7alt)$/.test(read.suffix)) {
        return 'literal-minor' as Verdict;
    }
    const tail = symbol.slice(read.root.length).replace(/\/.*$/, '');
    if (read.suffix === '7alt' && TWO_ALTERATIONS.has(tail)) {
        return 'two-alterations' as Verdict;
    }
    if (
        asWritten &&
        v1.pcs.every((pc) => v2.pcs.includes(pc)) &&
        (v1.bass === v2.bass || v1.bass === v1.root)
    ) {
        return 'written-tones' as Verdict;
    }
    return `${token}: old ${v1Name} [${v1.pcs}/${v1.bass}], new ${symbol} [${v2.pcs}/${v2.bass}]`;
}

/** Every token through the old parser and the converter, one bar each, in one key. */
function differential(tokens: string[], keyName: string, minor: boolean) {
    const { progression } = v1Parse(tokens.join(' | '), keyName, '4/4', minor);
    expect(progression).toHaveLength(tokens.length);
    return tokens.map((token, i) => {
        const converted = convertLegacyChordToken(token);
        return converted.kind === 'ok'
            ? verdict(token, progression[i].absName, converted.symbol, keyName, minor)
            : `${token}: refused — ${converted.why}`;
    });
}

/** Case and notation variants of a spelling that the old parser folds onto it. */
function variants(spelling: string): string[] {
    const out = new Set([spelling]);
    const swaps: [RegExp, string[]][] = [
        // The normaliser folds a capitalised `Maj`/`Ma` only before a digit, `#`, `+` or the end.
        [/^maj(?=\d|#|\+|$)/, ['Maj', 'MAJ', 'Ma', 'MA', 'ma']],
        [/^maj(?=6|7|9|11|13)/, ['M']],
        [/^min/, ['Min', 'MIN', 'mi', 'Mi', 'MI']],
        [/^m(?!aj|in|add|maj)/, ['mi', 'Mi', 'min', '-']],
        [/^mmaj/, ['mMaj', 'm(maj', 'm/maj', '-maj', 'minMaj', 'm^', '-^', 'mM']],
        [/^sus/, ['Sus', 'SUS']],
        [/^dim/, ['Dim', 'DIM']],
        [/^aug/, ['Aug', 'AUG']],
        [/^add/, ['Add', 'ADD']],
        [/^dom/, ['Dom', 'DOM']],
        [/^alt/, ['Alt', 'ALT']],
        [/△/, ['Δ', '∆']],
    ];
    for (const [pattern, replacements] of swaps) {
        if (pattern.test(spelling)) {
            for (const r of replacements) {
                const v = spelling.replace(pattern, r);
                out.add(r.endsWith('(maj') ? `${v})` : v);
            }
        }
    }
    // The Real Book's parentheses around an alteration: 7(b9), m7(b5), 6(9).
    const alteration = /^(.*?\d)([#b+]\d+.*)$/.exec(spelling);
    if (alteration) {
        out.add(`${alteration[1]}(${alteration[2]})`);
    }
    return [...out];
}

const ROOTS = ['C', 'F#', 'Bb', 'e', 'ii', 'bVII', 'iv', 'V', '4', 'b3'];
const BASSES = ['', '/E', '/bIII'];
const KEYS = [
    ['C', false],
    ['A', true],
    ['Gb', false],
] as const;

describe('every quality the old parser read converts to the chord it played (#1737)', () => {
    const tokens = ROOTS.flatMap((root) =>
        LEGACY_QUALITY_SPELLINGS.flatMap(variants).flatMap((quality) =>
            BASSES.map((bass) => root + quality + bass),
        ),
    );

    it('reads its spellings from the old parser’s own table', () => {
        // The table, not a list from memory: `maj9`, `6/9`, `△`, `mmaj7`, `alt` and the stacked
        // alterations are all rows of it.
        for (const spelling of ['maj9', '6/9', '△', 'mmaj7', 'alt', '7b9#5', '13#11b9']) {
            expect(LEGACY_QUALITY_SPELLINGS).toContain(spelling);
        }
        expect(LEGACY_QUALITY_SPELLINGS.length).toBeGreaterThan(130);
        expect(tokens.length).toBeGreaterThan(10_000);
    });

    it.each(KEYS)(
        'none refused, and none sounds other than a named difference, in %s (minor: %s)',
        (key, minor) => {
            const verdicts = differential(tokens, key, minor);
            const unexplained = verdicts.filter(
                (v) => !['same', 'written-tones', 'two-alterations', 'literal-minor'].includes(v),
            );
            expect(unexplained).toEqual([]);
        },
    );

    it('every difference, by written quality', () => {
        // The full list, so a reviewer sees each one: C is a root the parser read as written,
        // ii a lowercase numeral. Everything not listed sounds the same.
        const differences = (root: string) =>
            [
                ...new Set(
                    LEGACY_QUALITY_SPELLINGS.flatMap((quality) => {
                        const v = differential([root + quality], 'C', false)[0];
                        return v === 'same' ? [] : [`${quality}: ${v}`];
                    }),
                ),
            ].sort();
        expect(differences('C')).toEqual(
            [
                '-69: written-tones',

                '13#9: written-tones',
                '13b9: written-tones',
                '7#9#5: two-alterations',
                '7#9b5: two-alterations',
                '7b13sus: written-tones',
                '7b9#5: two-alterations',
                '7b9b5: two-alterations',
                '7b9sus: written-tones',
                '9#11: written-tones',
                '9#5: written-tones',
                '9b5: written-tones',
                'h9: written-tones',
            ].sort(),
        );
        expect(differences('ii')).toEqual(
            [
                '-69: written-tones',

                '13#9: written-tones',
                '13b9: written-tones',
                '6/9: written-tones',
                '69: written-tones',
                '7#5#9: literal-minor',
                '7#9#5: literal-minor',
                '7#9b5: literal-minor',
                '7alt: literal-minor',
                '7b13sus: written-tones',
                '7b5b9: literal-minor',
                '7b9#5: literal-minor',
                '7b9b5: literal-minor',
                '7b9sus: written-tones',
                '9#11: written-tones',
                '9#5: written-tones',
                '9b5: written-tones',
                '^13: written-tones',
                '^7#11: literal-minor',
                '^7#5: literal-minor',
                '^9: written-tones',
                'alt: literal-minor',
                'h9: written-tones',

                'maj11: written-tones',
                'maj13: written-tones',
                'maj7#11: literal-minor',
                'maj7#5: literal-minor',
                'maj7+: literal-minor',
                'maj7b5: literal-minor',
                'maj9: written-tones',
                'maj9b5: literal-minor',
                '△9: written-tones',
            ].sort(),
        );
    });

    it('converts the issue’s own examples', () => {
        const symbols = ['Cmaj9', 'C6/9', 'CΔ', 'Cm(maj7)', 'Calt', 'C7b9#11', 'C-7(b5)'].map(
            (token) => convertLegacyChordToken(token),
        );
        expect(symbols).toEqual([
            { kind: 'ok', symbol: 'Cmaj9', respelled: false },
            { kind: 'ok', symbol: 'C6/9', respelled: false },
            { kind: 'ok', symbol: 'CΔ', respelled: false },
            { kind: 'ok', symbol: 'CmMaj7', respelled: true },
            { kind: 'ok', symbol: 'Calt', respelled: false },
            { kind: 'ok', symbol: 'C7b9#11', respelled: false },
            { kind: 'ok', symbol: 'C-7b5', respelled: true },
        ]);
    });

    it('refuses what the old parser guessed at, saying why', () => {
        for (const token of ['N.C.', '%', 'Xm7', 'C♯m', 'Cnope', 'C:2', 'C/G7']) {
            expect(convertLegacyChordToken(token)).toMatchObject({ kind: 'refused' });
        }
        expect(convertLegacyChordToken('C♯m')).toEqual({
            kind: 'refused',
            why: 'The old parser read no chord quality in “♯m” of “C♯m” (it played a plain major chord).',
        });
    });
});

describe('fuzzed tokens', () => {
    const FRAGMENTS = [
        'm',
        'M',
        'maj',
        'Maj',
        'min',
        'mi',
        '-',
        '+',
        '^',
        'Δ',
        'o',
        'ø',
        'h',
        'dim',
        'aug',
        'sus',
        'add',
        'alt',
        'dom',
        '2',
        '4',
        '5',
        '6',
        '7',
        '9',
        '11',
        '13',
        'b5',
        '#5',
        'b9',
        '#9',
        '#11',
        'b13',
        '(',
        ')',
        '/',
        '/9',
        '/E',
        '/bVII',
    ];
    const random = makeMulberry32(1737);
    const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)];
    const tokens = Array.from({ length: 6000 }, () => {
        const parts = Array.from({ length: 1 + Math.floor(random() * 4) }, () => pick(FRAGMENTS));
        return pick(ROOTS) + parts.join('');
    }).filter((token) => !token.includes('|'));

    it.each(KEYS)(
        'convert to the old chord or a named difference, or refuse, in %s',
        (key, minor) => {
            const verdicts = differential(tokens, key, minor);
            const unexplained = verdicts.filter(
                (v) =>
                    !['same', 'written-tones', 'two-alterations', 'literal-minor'].includes(v) &&
                    !v.includes(': refused — '),
            );
            expect(unexplained).toEqual([]);
            // The fuzz reaches every outcome, so it is not vacuous.
            for (const outcome of ['same', 'written-tones', ': refused — ']) {
                expect(verdicts.some((v) => v.includes(outcome))).toBe(true);
            }
        },
    );
});

/**
 * One chart through both: every converted bar holds the old parser's chords, each starting
 * where the old parser started it. Returns what differs; the chart must convert.
 */
function chartDifferences(chart: LegacyChart): string[] {
    const result = proposeLegacyScoreConversion(v1Document(chart));
    if (result.kind !== 'candidate') {
        return [`${chart.title}: blocked — ${JSON.stringify(result.issues)}`];
    }
    const out: string[] = [];
    const converted = new Map(result.value.chart.score.sections.map((s) => [s.id, s]));
    for (const [i, section] of chart.sections.entries()) {
        const key = section.key || chart.key || 'C';
        const meter = section.timeSignature || chart.timeSignature || '4/4';
        const minor = section.isMinor ?? chart.isMinor ?? false;
        const v1 = v1Parse(section.value, key, meter, minor);
        const bars = section.value
            .split('|')
            .map((bar) => bar.split(/\s+/).filter(Boolean))
            .filter((bar) => bar.length);
        const measures = converted.get(section.id ?? `s${i}`)?.measures ?? [];
        expect(measures).toHaveLength(bars.length);
        let chord = 0;
        for (const [b, bar] of bars.entries()) {
            const content = measures[b].content;
            const events = content.kind === 'events' ? content.events : [];
            const steps = events.map((e: ScoreEvent) => durationToSteps(e.duration) ?? Number.NaN);
            const from = v1.stepMap[chord].start;
            for (const [k, token] of bar.entries()) {
                const event = events[k];
                const v = verdict(
                    token,
                    v1.progression[chord].absName,
                    event.kind === 'chord' ? event.symbol : '',
                    key,
                    minor,
                );
                if (!['same', 'written-tones', 'two-alterations', 'literal-minor'].includes(v)) {
                    out.push(`${chart.title} ${section.label} bar ${b + 1}: ${v}`);
                }
                const onset = steps.slice(0, k).reduce((a, n) => a + n, 0);
                if (onset !== v1.stepMap[chord].start - from) {
                    out.push(`${chart.title} ${section.label} bar ${b + 1}: ${token} moved`);
                }
                chord++;
            }
        }
    }
    return out;
}

describe('the shipped and saved charts convert to what the old parser played', () => {
    const presets = (presetsCorpus as { charts: (LegacyChart & { name: string })[] }).charts;

    it('holds every v1 preset and song template (#1415’s deleted data)', () => {
        expect(presets.length).toBe(38);
        for (const key of ['C', 'Eb', 'A']) {
            expect(
                presets.flatMap((preset) =>
                    chartDifferences({ ...preset, title: preset.name, key }),
                ),
            ).toEqual([]);
        }
    });

    it('holds the frozen v1 sessions', () => {
        const sessions = Object.entries(sessionsFixture as unknown as Record<string, LegacyChart>);
        expect(sessions.length).toBeGreaterThan(3);
        expect(
            sessions.flatMap(([title, session]) => chartDifferences({ ...session, title })),
        ).toEqual([]);
    });

    it('holds every standard written as v1 text', () => {
        const charts = STANDARDS.filter((standard) =>
            standard.sections.every((s) => s.bars.every((bar) => !bar.includes(':'))),
        ).map((standard) => ({
            title: standard.title,
            key: standard.key,
            isMinor: standard.isMinor,
            timeSignature: standard.meter ?? '4/4',
            sections: standard.sections.map((s) => ({
                label: s.label,
                value: s.bars.join(' | '),
                repeat: s.repeat,
            })),
        }));
        expect(charts.length).toBeGreaterThan(20);
        expect(charts.flatMap(chartDifferences)).toEqual([]);
    });
});

describe('timing: a bar splits the way the old parser rounded it, snapped to the bar', () => {
    /** The old parser's chord lengths for one bar, in sixteenths. */
    function v1Steps(bar: string, meter: string) {
        return v1Parse(bar, 'C', meter).stepMap.map(({ start, end }) => end - start);
    }

    it.each([
        // The old parser played three chords in 4/4 as 5 + 5 + 5: a bar a sixteenth short.
        ['C Dm G7', '4/4', [5, 5, 5], [5, 5, 6]],
        // Five in 4/4: 3 + 3 + 3 + 3 + 3, a sixteenth short.
        ['C Dm Em F G', '4/4', [3, 3, 3, 3, 3], [3, 3, 3, 3, 4]],
        // Two in 3/4 divide evenly: unchanged.
        ['C G7', '3/4', [6, 6], [6, 6]],
        // Six in 4/4: 3 each, a bar two sixteenths LONG; every onset kept, the last cut short.
        ['C D E F G A', '4/4', [3, 3, 3, 3, 3, 3], [3, 3, 3, 3, 3, 1]],
        // Two in 6/8: 6 + 6.
        ['Am Dm', '6/8', [6, 6], [6, 6]],
        // Three in 7/8: 14 sixteenths, 4.67 each → 5 + 5 + 4.
        ['C F G', '7/8', [5, 5, 5], [5, 5, 4]],
    ])('%s in %s', (bar, meter, old, converted) => {
        expect(v1Steps(bar, meter)).toEqual(old);
        expect(legacyBarSteps(bar.split(' ').length, meter)).toEqual(converted);
        const result = proposeLegacyScoreConversion(
            v1Document({ timeSignature: meter, sections: [{ label: 'A', value: bar }] }),
        );
        expect(result.kind).toBe('candidate');
        if (result.kind !== 'candidate') {
            return;
        }
        const measure = result.value.chart.score.sections[0].measures[0];
        expect(
            measure.content.kind === 'events' &&
                measure.content.events.map((e) => durationToSteps(e.duration)),
        ).toEqual(converted);
    });

    it('refuses a bar whose old onsets run past its end, naming it', () => {
        // Ten chords in 4/4: 2 sixteenths each, the tenth starting after the bar is over.
        expect(legacyBarSteps(10, '4/4')).toBeNull();
        const result = proposeLegacyScoreConversion(
            v1Document({
                title: 'Busy',
                sections: [{ label: 'Verse', value: `C | ${'C '.repeat(10)}` }],
            }),
        );
        expect(result).toMatchObject({
            kind: 'blocked',
            issues: [
                {
                    code: 'off-grid',
                    song: 'Busy',
                    section: 'Verse',
                    bar: 2,
                    path: '$.chart.arrangement.sections[0].value.bars[1]',
                },
            ],
        });
    });
});

describe('empty bars and sections', () => {
    it('drops an empty bar, as the old parser gave it no time', () => {
        const value = 'C | | G7 |';
        // The old parser: two chords, 16 sixteenths each, nothing between them.
        expect(v1Parse(value).stepMap).toEqual([
            expect.objectContaining({ start: 0, end: 16 }),
            expect.objectContaining({ start: 16, end: 32 }),
        ]);
        const result = proposeLegacyScoreConversion(
            v1Document({ sections: [{ label: 'A', value }] }),
        );
        if (result.kind !== 'candidate') {
            throw new Error(JSON.stringify(result.issues));
        }
        expect(
            result.value.chart.score.sections[0].measures.map((m) =>
                m.content.kind === 'events'
                    ? m.content.events.map((e) => e.kind === 'chord' && e.symbol)
                    : [],
            ),
        ).toEqual([['C'], ['G7']]);
        expect(result.notes.filter((n) => n.code === 'empty-bar').map((n) => n.bar)).toEqual([
            2, 4,
        ]);
    });

    it('drops an empty section: it played no time, and a score section needs a bar', () => {
        const result = proposeLegacyScoreConversion(
            v1Document({
                sections: [
                    { label: 'A', value: 'C | G7' },
                    { label: 'Fill', value: ' | ' },
                    { label: 'B', value: 'F', repeat: 2 },
                ],
            }),
        );
        if (result.kind !== 'candidate') {
            throw new Error(JSON.stringify(result.issues));
        }
        expect(result.value.chart.score.sections.map((s) => [s.label, s.repeat])).toEqual([
            ['A', 1],
            ['B', 2],
        ]);
        expect(result.notes).toContainEqual(
            expect.objectContaining({ code: 'empty-section', section: 'Fill' }),
        );
    });

    it('refuses a chart with no chords at all', () => {
        expect(
            proposeLegacyScoreConversion(v1Document({ sections: [{ label: 'A', value: '' }] })),
        ).toMatchObject({ kind: 'blocked', issues: [{ code: 'empty-song' }] });
    });
});

describe('refusals name the bar', () => {
    it('gives the song, section, bar and why for each bar it cannot convert', () => {
        const result = proposeLegacyScoreConversion(
            v1Document({
                title: 'Mixed',
                sections: [
                    { label: 'A', value: 'C | Cnope | G7' },
                    { label: 'B', value: 'F | N.C. Xm7' },
                ],
            }),
        );
        expect(result).toMatchObject({
            kind: 'blocked',
            issues: [
                {
                    code: 'legacy-syntax',
                    song: 'Mixed',
                    section: 'A',
                    bar: 2,
                    text: 'Cnope',
                    message: expect.stringContaining('“nope”'),
                },
                {
                    code: 'legacy-syntax',
                    song: 'Mixed',
                    section: 'B',
                    bar: 2,
                    text: 'N.C. Xm7',
                    message: expect.stringMatching(/“N\.C\.”.*“Xm7”/),
                },
            ],
        });
    });
});
