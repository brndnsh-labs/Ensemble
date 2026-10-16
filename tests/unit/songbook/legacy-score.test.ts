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
// cspell:ignore mmaj Majadd MAJadd Maadd MAadd Calt Cnope Cmin madd Cmadd iiadd iimaj iimin iialt iimadd iima

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
import { SCORE_CHORD_QUALITIES } from '../../../public/songbook/score-text.js';
import type { ScoreEvent } from '../../../public/songbook/score-types.js';
import type { ChartDocument } from '../../../public/songbook/types.js';
import presetsCorpus from '../../fixtures/v1/chord-presets.json';
import sessionsFixture from '../../fixtures/v1/sessions.json';
import { referenceQuality } from '../../oracle/chord-reference.js';
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
 *   `C6/9/E` lost its bass), and the converted chord is the written chord with no tone changed
 *   (`none` or `notation`): everything the old parser played, plus what it dropped.
 * - `some-written-tones`: the same, but no chart spelling holds the whole written chord, so
 *   the conversion keeps part of what the old parser dropped (`tones-dropped`).
 * - `two-alterations`: `C7#9b5` and its kin played the old parser's `7alt` (b9, #9 and b13 all
 *   at once, a #5 against a written b5); the band plays the alterations written.
 * - `literal-minor`: a lowercase numeral on `maj7#11`, `maj7#5`, `maj7b5` or `7alt`, which the
 *   old parser had no minor reading for and played with a major third. The band reads a
 *   lowercase numeral literally as minor (DECISION 2026-10-12, #1662).
 * - `misread-alteration`: the old parser read only the start of the suffix and sounded a tone
 *   the rest of it alters (`Cmin9b5` played Cm9, a natural 5 against the written b5; `Cm7-5`
 *   played Cm7). The converted chord must sound what the chord dictionary reads in the written
 *   spelling (`dictionaryTones`), not merely what the converter claims. Where no spelling holds
 *   all of it (`tones-dropped`), the part kept must start the written spelling and sound as the
 *   dictionary reads that part.
 * - `added-tone`: a 9 in parentheses straight after the root (`C(9)`, `Cm(9)`) is an added
 *   tone, by its intent; the old parser read it as a 9th chord and added a b7 never written.
 */
type Verdict =
    | 'same'
    | 'written-tones'
    | 'some-written-tones'
    | 'two-alterations'
    | 'literal-minor'
    | 'misread-alteration'
    | 'added-tone';

/**
 * The written suffix as the chord dictionary spells it, folded here by hand and independently
 * of the converter: parentheses, commas and slashes dropped, the minor prefixes, a fake book's
 * `-`/`+` alterations after a digit, the Brazilian `7M` and capitalised `Maj`.
 */
function dictionarySpelling(written: string): string {
    return (
        written
            // A tone in parentheses straight after the root is an added one.
            .replace(/^(m|-|min|mi)?\((?:9|2)\)$/, (_, minor) => (minor ? 'madd9' : 'add9'))
            .replace(/[()\s,/]/g, '')
            .replace(/^(?:MIN|Min|min|MI|Mi|mi|-)/, 'm')
            .replace(/^(m?)7M/, (_, minor) => (minor ? 'mMaj7' : 'maj7'))
            .replace(/(?<=\d)-(?=5|9|13)/g, 'b')
            .replace(/(?<=\d)\+(?=5|9|11|13)/g, '#')
            .replace(/^(?:MAJ|Maj|MA|Ma)/, 'maj')
            // Natural tensions over a 7th chord, in the dictionary's names: 7(9) is a 9th.
            .replace(/^(m|maj)?7913(?!\d)/, '$113')
            .replace(/^(m)?7911(?!\d)/, '$111')
            .replace(/^(m|maj|mMaj)?79(?!\d)/, '$19')
            .replace(/^713(?!\d)/, '7add13')
            // A bare `+` is a raised 5th: `9+` is 9#5, `m+` a minor triad with a ♯5.
            .replace(/(?<=\d)\+(?!\d)/g, '#5')
            .replace(/^m\+(?!\d)/, 'm#5')
    );
}

/** The written chord's tones above its root (0–11), from the dictionary; null if unknown. */
function dictionaryTones(written: string): number[] | null {
    const reference = referenceQuality(dictionarySpelling(written));
    return reference ? [...reference.tones].sort((a, b) => a - b) : null;
}

const toneSet = (facts: ChordFacts) =>
    [...new Set(facts.intervals.map((n) => n % 12))].sort((a, b) => a - b);

function verdict(
    token: string,
    v1Name: string,
    { symbol, change }: { symbol: string; change: string },
    keyName: string,
    minor: boolean,
) {
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
    if (LOWERCASE_NUMERAL.test(read.root) && /^(?:maj7#11|maj7#5|maj7b5|7alt)$/.test(read.suffix)) {
        return 'literal-minor' as Verdict;
    }
    const tail = symbol.slice(read.root.length).replace(/\/.*$/, '');
    if (read.suffix === '7alt' && TWO_ALTERATIONS.has(tail)) {
        return 'two-alterations' as Verdict;
    }
    if (v1.pcs.every((pc) => v2.pcs.includes(pc)) && (v1.bass === v2.bass || v1.bass === v1.root)) {
        return (change === 'tones-dropped' ? 'some-written-tones' : 'written-tones') as Verdict;
    }
    const readAll = read.details.recognised && read.details.suffix === read.normalised;
    // A lowercase numeral names a minor third over whatever the suffix spells (#1662).
    const written = dictionaryTones(read.written)?.map((n) =>
        LOWERCASE_NUMERAL.test(read.root) && n === 4 ? 3 : n,
    );
    // The band keeps a 5th the dictionary sometimes leaves out (its 7b13), so a 5th alone
    // is no difference.
    const differs = (a: number[], b: number[]) =>
        [...a.filter((n) => !b.includes(n)), ...b.filter((n) => !a.includes(n))].some(
            (n) => n !== 7,
        );
    const asWritten = written && change !== 'tones-dropped' && !differs(written, toneSet(v2Facts));
    if (asWritten && /^(?:m|-|min|mi)?\((?:9|2)\)$/.test(read.written)) {
        return 'added-tone' as Verdict;
    }
    if (asWritten && !readAll) {
        return 'misread-alteration' as Verdict;
    }
    // Or no spelling holds all of it: what it keeps must start the written spelling, and sound
    // as the dictionary reads that start.
    const kept = dictionaryTones(tail)?.map((n) =>
        LOWERCASE_NUMERAL.test(read.root) && n === 4 ? 3 : n,
    );
    if (
        !readAll &&
        change === 'tones-dropped' &&
        kept &&
        dictionarySpelling(read.written).startsWith(dictionarySpelling(tail)) &&
        !differs(kept, toneSet(v2Facts))
    ) {
        return 'misread-alteration' as Verdict;
    }
    return `${token}: old ${v1Name} [${v1.pcs}/${v1.bass}], new ${symbol} [${v2.pcs}/${v2.bass}], written [${written}]`;
}

const NAMED: readonly string[] = [
    'same',
    'written-tones',
    'some-written-tones',
    'two-alterations',
    'literal-minor',
    'misread-alteration',
    'added-tone',
];

/**
 * Every token through the old parser and the converter, one bar each, in one key. A refusal
 * passes only where the old parser guessed — it read no root, or no quality at all — or where
 * its chord would sound a 3rd the written sus rules out; any other refusal is reported.
 */
function differential(tokens: string[], keyName: string, minor: boolean) {
    const { progression } = v1Parse(tokens.join(' | '), keyName, '4/4', minor);
    expect(progression).toHaveLength(tokens.length);
    return tokens.map((token, i) => {
        const converted = convertLegacyChordToken(token);
        if (converted.kind === 'chord') {
            return verdict(token, progression[i].absName, converted, keyName, minor);
        }
        const read = readLegacyChordToken(token);
        const guessed =
            !read.root ||
            (!read.details.suffix && !read.details.recognised) ||
            // The old parser itself dropped a written sus (or no3) and sounded the 3rd.
            (/sus|no|omit/.test(read.normalised) && !/sus/.test(read.suffix));
        return converted.kind === 'refused' && guessed
            ? 'refused'
            : `${token}: ${converted.kind === 'refused' ? converted.why : converted.kind}`;
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
    // Spellings outside the table that a chart writes: the old parser read a prefix of each (or,
    // for `M`, nothing, and played the major triad it means).
    const OFF_TABLE = [
        'M',
        'M7#11',
        'Maj9#11',
        'maj9#11',
        'm6/9',
        'mMaj9',
        'm(maj9)',
        '+maj7',
        '7sus4b9',
        'm7b6',
        'm9b6',
        '7(b9,#11)',
        '7#11b9',
        '7b5#9',
        '7#5b9',
        '7#9b13',
        '9b13',
        '13b9#11',
        '13#11b9',
        '7b9#11b13',
        '7#9#11b13',
        'maj7#11b13',
        'm11b5',
        'm7add11',
        '7add13',
        'add4',
        // A fake book's `-`/`+` alterations, the Brazilian 7M and natural tensions in
        // parentheses.
        'm7-5',
        'm7(-5)',
        '7-9',
        '7-5',
        '7b9+5',
        '7(+11)',
        '7+5',
        '7M',
        '7M(9)',
        'm7M',
        '7(9)',
        '7(9,13)',
        '7(9,#11)',
        'm7(9)',
        'm7(11)',
        '7(13)',
        'maj7(9)',
        '6(9)',
        '(9)',
        'm(9)',
    ];
    const tokens = ROOTS.flatMap((root) =>
        [...LEGACY_QUALITY_SPELLINGS.flatMap(variants), ...OFF_TABLE].flatMap((quality) =>
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
            const unexplained = verdicts.filter((v) => !NAMED.includes(v));
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
                '+9: written-tones',
                '-69: written-tones',
                '13#11b9: written-tones',
                '13#9: written-tones',
                '13b9: written-tones',
                '7#5#9: two-alterations',
                '7#9#5: two-alterations',
                '7#9b5: two-alterations',
                '7b13sus: written-tones',
                '7b5b9: two-alterations',
                '7b9#5: two-alterations',
                '7b9b5: two-alterations',
                '7b9sus: written-tones',
                '9#11: written-tones',
                '9#5: written-tones',
                '9b5: written-tones',
                'add4: written-tones',
                'aug9: written-tones',
                'h9: written-tones',
                'm69: written-tones',
                'm9b5: written-tones',
                'majadd4: written-tones',
                'min69: written-tones',
                'mmaj11: written-tones',
                'mmaj13: written-tones',
                'mmaj9: written-tones',
            ].sort(),
        );
        expect(differences('ii')).toEqual(
            [
                '+9: written-tones',
                '13#11b9: written-tones',
                'add4: written-tones',
                'aug9: written-tones',
                'm69: written-tones',
                'm9b5: written-tones',
                'maj69: written-tones',
                'majadd4: written-tones',
                'min69: written-tones',
                'mmaj11: written-tones',
                'mmaj13: written-tones',
                'mmaj9: written-tones',
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

    it('every difference beyond the table rows, and what each becomes', () => {
        // The case and notation variants and the off-table spellings, so every verdict that is
        // not `same` is visible here, with the symbol it converts to.
        const differences = (root: string) =>
            [
                ...new Set(
                    [
                        ...LEGACY_QUALITY_SPELLINGS.flatMap((q) => variants(q).slice(1)),
                        ...OFF_TABLE,
                    ].flatMap((quality) => {
                        const v = differential([root + quality], 'C', false)[0];
                        const c = convertLegacyChordToken(root + quality);
                        const to = c.kind === 'chord' ? c.symbol : c.kind;
                        return v === 'same' ? [] : [`${quality} → ${to}: ${v}`];
                    }),
                ),
            ].sort();
        expect(differences('C')).toEqual([
            '(9) → Cadd9: added-tone',
            '+maj7 → Cmaj7#5: written-tones',
            '-69 → C-69: written-tones',
            '-9b5 → Ch9: misread-alteration',
            '-^11 → Cmin^11: written-tones',
            '-^13 → Cmin^13: written-tones',
            '-^9 → C-^9: written-tones',
            '-maj11 → Cmin^11: written-tones',
            '-maj13 → Cmin^13: written-tones',
            '-maj9 → C-^9: written-tones',
            '13#11b9 → C13b9#11: written-tones',
            '13(#11b9) → C13b9#11: written-tones',
            '13(#9) → C13#9: written-tones',
            '13(b9) → C13b9: written-tones',
            '13b9#11 → C13b9#11: written-tones',
            '7#11b9 → C7b9#11: written-tones',
            '7#5b9 → C7b9#5: written-tones',
            '7#9#11b13 → C7#9#11: some-written-tones',
            '7#9b13 → C7#9b13: written-tones',
            '7(#5#9) → C7#9#5: two-alterations',
            '7(#9#5) → C7#9#5: two-alterations',
            '7(#9b5) → C7#9b5: two-alterations',
            '7(+11) → C7#11: misread-alteration',
            '7(13) → C7(add13): written-tones',
            '7(9) → C9: written-tones',
            '7(9,#11) → C9#11: written-tones',
            '7(9,13) → C13: written-tones',
            '7(b13sus) → C7b13sus: written-tones',
            '7(b5b9) → C7b9b5: two-alterations',
            '7(b9#5) → C7b9#5: two-alterations',
            '7(b9,#11) → C7b9#11: written-tones',
            '7(b9b5) → C7b9b5: two-alterations',
            '7(b9sus) → C7b9sus: written-tones',
            '7-5 → C7b5: misread-alteration',
            '7-9 → C7b9: written-tones',
            '7M → Cmaj7: misread-alteration',
            '7M(9) → Cmaj9: misread-alteration',
            '7add13 → C7(add13): written-tones',
            '7b5#9 → C7#9b5: written-tones',
            '7b9#11b13 → C7b9#11: some-written-tones',
            '7b9+5 → C7b9#5: misread-alteration',
            '7sus4b9 → C7b9sus: written-tones',
            '9(#11) → C9#11: written-tones',
            '9(#5) → C9#5: written-tones',
            '9(b5) → C9b5: written-tones',
            '9b13 → C9b13: written-tones',
            'ADD4 → Cmaj(add4): written-tones',
            'AUG9 → C9#5: written-tones',
            'Add4 → Cmaj(add4): written-tones',
            'Aug9 → C9#5: written-tones',
            'MI69 → C-69: written-tones',
            'MIN69 → C-69: written-tones',
            'Maj9#11 → C^9#11: written-tones',
            'Mi69 → C-69: written-tones',
            'Mi9b5 → Ch9: written-tones',
            'Min69 → C-69: written-tones',
            'add4 → Cmaj(add4): written-tones',
            'm(9) → Cmadd9: added-tone',
            'm(maj11) → Cmin^11: written-tones',
            'm(maj13) → Cmin^13: written-tones',
            'm(maj9) → C-^9: written-tones',
            'm/maj11 → Cmin^11: written-tones',
            'm/maj13 → Cmin^13: written-tones',
            'm/maj9 → C-^9: written-tones',
            'm6/9 → C-69: written-tones',
            'm7(-5) → Cm7b5: misread-alteration',
            'm7(9) → Cm9: written-tones',
            'm7-5 → Cm7b5: misread-alteration',
            'm7M → CmMaj7: misread-alteration',
            'm7b6 → Cmin7b6: written-tones',
            'm9(b5) → Ch9: written-tones',
            'm9b6 → Cmin9b6: written-tones',
            'mM11 → Cmin^11: written-tones',
            'mM13 → Cmin^13: written-tones',
            'mM9 → C-^9: written-tones',
            'mMaj11 → Cmin^11: written-tones',
            'mMaj13 → Cmin^13: written-tones',
            'mMaj9 → C-^9: written-tones',
            'm^11 → Cmin^11: written-tones',
            'm^13 → Cmin^13: written-tones',
            'm^9 → C-^9: written-tones',
            'maj7(9) → Cmaj9: written-tones',
            'maj9#11 → C^9#11: written-tones',
            'mi69 → C-69: written-tones',
            'mi9b5 → Ch9: written-tones',
            'min69 → C-69: written-tones',
            'min9b5 → Ch9: misread-alteration',
            'minMaj11 → Cmin^11: written-tones',
            'minMaj13 → Cmin^13: written-tones',
            'minMaj9 → C-^9: written-tones',
        ]);
        expect(differences('ii')).toEqual([
            '(9) → iiadd9: added-tone',
            '+maj7 → iimaj7#5: written-tones',
            '-69 → ii-69: written-tones',
            '-9b5 → iih9: misread-alteration',
            '-^11 → iimin^11: written-tones',
            '-^13 → iimin^13: written-tones',
            '-^9 → ii-^9: written-tones',
            '-maj11 → iimin^11: written-tones',
            '-maj13 → iimin^13: written-tones',
            '-maj9 → ii-^9: written-tones',
            '13#11b9 → ii13b9#11: written-tones',
            '13(#11b9) → ii13b9#11: written-tones',
            '13(#9) → ii13#9: written-tones',
            '13(b9) → ii13b9: written-tones',
            '13b9#11 → ii13b9#11: written-tones',
            '6(9) → ii69: written-tones',
            '7#11b9 → ii7b9#11: written-tones',
            '7#5b9 → ii7b9#5: written-tones',
            '7#9#11b13 → ii7#9#11: some-written-tones',
            '7#9b13 → ii7#9b13: written-tones',
            '7(#5#9) → ii7#9#5: literal-minor',
            '7(#9#5) → ii7#9#5: literal-minor',
            '7(#9b5) → ii7#9b5: literal-minor',
            '7(+11) → ii7#11: misread-alteration',
            '7(13) → ii7(add13): written-tones',
            '7(9) → ii9: written-tones',
            '7(9,#11) → ii9#11: written-tones',
            '7(9,13) → ii13: written-tones',
            '7(b13sus) → ii7b13sus: written-tones',
            '7(b5b9) → ii7b9b5: literal-minor',
            '7(b9#5) → ii7b9#5: literal-minor',
            '7(b9,#11) → ii7b9#11: written-tones',
            '7(b9b5) → ii7b9b5: literal-minor',
            '7(b9sus) → ii7b9sus: written-tones',
            '7-5 → ii7b5: misread-alteration',
            '7-9 → ii7b9: written-tones',
            '7M → iimaj7: misread-alteration',
            '7M(9) → iimaj9: misread-alteration',
            '7add13 → ii7(add13): written-tones',
            '7b9#11b13 → ii7b9#11: some-written-tones',
            '7b9+5 → ii7b9#5: misread-alteration',
            '7sus4b9 → ii7b9sus: written-tones',
            '9(#11) → ii9#11: written-tones',
            '9(#5) → ii9#5: written-tones',
            '9(b5) → ii9b5: written-tones',
            '9b13 → ii9b13: written-tones',
            'ADD4 → iimaj(add4): written-tones',
            'ALT → iialt: literal-minor',
            'AUG9 → ii9#5: written-tones',
            'Add4 → iimaj(add4): written-tones',
            'Alt → iialt: literal-minor',
            'Aug9 → ii9#5: written-tones',
            'M11 → iimaj11: written-tones',
            'M13 → iimaj13: written-tones',
            'M69 → ii69: written-tones',
            'M7#11 → iimaj7#11: literal-minor',
            'M7#5 → iiM7#5: literal-minor',
            'M7+ → iiM7+: literal-minor',
            'M7b5 → iimaj7b5: literal-minor',
            'M9 → iimaj9: written-tones',
            'M9b5 → iimaj7b5: literal-minor',
            'MA11 → iimaj11: written-tones',
            'MA13 → iimaj13: written-tones',
            'MA69 → ii69: written-tones',
            'MA7#11 → iimaj7#11: literal-minor',
            'MA7#5 → iimaj7#5: literal-minor',
            'MA7+ → iimaj7+: literal-minor',
            'MA7b5 → iimaj7b5: literal-minor',
            'MA9 → iimaj9: written-tones',
            'MA9b5 → iimaj7b5: literal-minor',
            'MAJ11 → iimaj11: written-tones',
            'MAJ13 → iimaj13: written-tones',
            'MAJ69 → ii69: written-tones',
            'MAJ7#11 → iimaj7#11: literal-minor',
            'MAJ7#5 → iimaj7#5: literal-minor',
            'MAJ7+ → iimaj7+: literal-minor',
            'MAJ7b5 → iimaj7b5: literal-minor',
            'MAJ9 → iimaj9: written-tones',
            'MAJ9b5 → iimaj7b5: literal-minor',
            'MI69 → ii-69: written-tones',
            'MIN69 → ii-69: written-tones',
            'Ma11 → iimaj11: written-tones',
            'Ma13 → iimaj13: written-tones',
            'Ma69 → ii69: written-tones',
            'Ma7#11 → iimaj7#11: literal-minor',
            'Ma7#5 → iimaj7#5: literal-minor',
            'Ma7+ → iimaj7+: literal-minor',
            'Ma7b5 → iimaj7b5: literal-minor',
            'Ma9 → iimaj9: written-tones',
            'Ma9b5 → iimaj7b5: literal-minor',
            'Maj11 → iimaj11: written-tones',
            'Maj13 → iimaj13: written-tones',
            'Maj69 → ii69: written-tones',
            'Maj7#11 → iimaj7#11: literal-minor',
            'Maj7#5 → iimaj7#5: literal-minor',
            'Maj7+ → iimaj7+: literal-minor',
            'Maj7b5 → iimaj7b5: literal-minor',
            'Maj9 → iimaj9: written-tones',
            'Maj9#11 → ii^9#11: written-tones',
            'Maj9b5 → iimaj7b5: literal-minor',
            'Mi69 → ii-69: written-tones',
            'Mi9b5 → iih9: written-tones',
            'Min69 → ii-69: written-tones',
            '^7(#11) → ii^7#11: literal-minor',
            '^7(#5) → ii^7#5: literal-minor',
            'add4 → iimaj(add4): written-tones',
            'm(9) → iimadd9: added-tone',
            'm(maj11) → iimin^11: written-tones',
            'm(maj13) → iimin^13: written-tones',
            'm(maj9) → ii-^9: written-tones',
            'm/maj11 → iimin^11: written-tones',
            'm/maj13 → iimin^13: written-tones',
            'm/maj9 → ii-^9: written-tones',
            'm6/9 → ii-69: written-tones',
            'm7(-5) → iim7b5: misread-alteration',
            'm7(9) → iim9: written-tones',
            'm7-5 → iim7b5: misread-alteration',
            'm7M → iimMaj7: misread-alteration',
            'm7b6 → iimin7b6: written-tones',
            'm9(b5) → iih9: written-tones',
            'm9b6 → iimin9b6: written-tones',
            'mM11 → iimin^11: written-tones',
            'mM13 → iimin^13: written-tones',
            'mM9 → ii-^9: written-tones',
            'mMaj11 → iimin^11: written-tones',
            'mMaj13 → iimin^13: written-tones',
            'mMaj9 → ii-^9: written-tones',
            'm^11 → iimin^11: written-tones',
            'm^13 → iimin^13: written-tones',
            'm^9 → ii-^9: written-tones',
            'ma11 → iima11: written-tones',
            'ma13 → iima13: written-tones',
            'ma69 → ii69: written-tones',
            'ma7#11 → iimaj7#11: literal-minor',
            'ma7#5 → iimaj7#5: literal-minor',
            'ma7+ → iimaj7+: literal-minor',
            'ma7b5 → iimaj7b5: literal-minor',
            'ma9 → iima9: written-tones',
            'ma9b5 → iimaj7b5: literal-minor',
            'maj7#11b13 → iimaj7#11: literal-minor',
            'maj7(#11) → iimaj7#11: literal-minor',
            'maj7(#5) → iimaj7#5: literal-minor',
            'maj7(9) → iimaj9: written-tones',
            'maj7(b5) → iimaj7b5: literal-minor',
            'maj9#11 → ii^9#11: written-tones',
            'maj9(b5) → iimaj7b5: literal-minor',
            'mi69 → ii-69: written-tones',
            'mi9b5 → iih9: written-tones',
            'min69 → ii-69: written-tones',
            'min9b5 → iih9: misread-alteration',
            'minMaj11 → iimin^11: written-tones',
            'minMaj13 → iimin^13: written-tones',
            'minMaj9 → ii-^9: written-tones',
            'Δ9 → ii△9: written-tones',
            '∆9 → ii△9: written-tones',
        ]);
    });

    it('never drops a tone when a spelling holds the whole written chord', () => {
        // For every `tones-dropped` result, the written chord as the dictionary reads it (where
        // it can) has no exact spelling in the vocabulary.
        const fuzzed = fuzzTokens();
        const problems = [...tokens, ...fuzzed].flatMap((token) => {
            const c = convertLegacyChordToken(token);
            const read = readLegacyChordToken(token);
            if (
                c.kind !== 'chord' ||
                c.change !== 'tones-dropped' ||
                LOWERCASE_NUMERAL.test(read.root) ||
                read.bass !== read.bassText
            ) {
                return [];
            }
            const written = dictionaryTones(read.written);
            const exact =
                written &&
                [...SCORE_CHORD_QUALITIES].find((q) => {
                    const facts = parseChord(`C${q}`, { tonic: 0, minor: false });
                    return facts && toneSet(facts).join() === written.join();
                });
            return exact ? [`${token} → ${c.symbol}, but C${exact} holds it`] : [];
        });
        expect([...new Set(problems)]).toEqual([]);
    });

    it('converts the issue’s own examples', () => {
        const symbols = ['Cmaj9', 'C6/9', 'CΔ', 'Cm(maj7)', 'Calt', 'C7b9#11', 'C-7(b5)'].map(
            (token) => convertLegacyChordToken(token),
        );
        expect(symbols).toEqual([
            { kind: 'chord', symbol: 'Cmaj9', change: 'none' },
            { kind: 'chord', symbol: 'C6/9', change: 'none' },
            { kind: 'chord', symbol: 'CΔ', change: 'none' },
            { kind: 'chord', symbol: 'CmMaj7', change: 'notation' },
            { kind: 'chord', symbol: 'Calt', change: 'none' },
            { kind: 'chord', symbol: 'C7b9#11', change: 'none' },
            { kind: 'chord', symbol: 'C-7b5', change: 'notation' },
        ]);
    });

    it.each([
        // Notation only: commas, case, the order of alterations, an equivalent spelling.
        ['C7(b9,#11)', 'C7b9#11', 'notation'],
        ['C7#11b9', 'C7b9#11', 'notation'],
        ['C7b5#9', 'C7#9b5', 'notation'],
        ['C7#5b9', 'C7b9#5', 'notation'],
        ['C13#11b9', 'C13b9#11', 'notation'],
        ['Cm69', 'C-69', 'notation'],
        ['Cm6/9', 'C-69', 'notation'],
        ['Cm(maj9)', 'C-^9', 'notation'],
        ['CmMaj9', 'C-^9', 'notation'],
        ['C+maj7', 'Cmaj7#5', 'notation'],
        ['C7sus4b9', 'C7b9sus', 'notation'],
        ['Cm7b6', 'Cmin7b6', 'notation'],
        ['Cmaj9#11', 'C^9#11', 'notation'],
        ['CMaj9(#11)', 'C^9#11', 'notation'],
        ['CM', 'C', 'notation'],
        ['CMAJ7', 'Cmaj7', 'notation'],
        // A fake book's -/+ after a digit (a leading - is still minor), the Brazilian 7M.
        ['Cm7-5', 'Cm7b5', 'notation'],
        ['Cm7(-5)', 'Cm7b5', 'notation'],
        ['C-7-5', 'C-7b5', 'notation'],
        ['C7-9', 'C7b9', 'notation'],
        ['C7-5', 'C7b5', 'notation'],
        ['C7b9+5', 'C7b9#5', 'notation'],
        ['C7(+11)', 'C7#11', 'notation'],
        ['C7+5', 'C7#5', 'notation'],
        ['C+5', 'C+', 'notation'],
        ['Cm+', 'Cm#5', 'notation'],
        ['C7M', 'Cmaj7', 'notation'],
        ['C7M(9)', 'Cmaj9', 'notation'],
        ['C7M+5', 'Cmaj7#5', 'notation'],
        ['Cm7M', 'CmMaj7', 'notation'],
        // Natural tensions in parentheses over a 7th chord, and their siblings.
        ['C7(9)', 'C9', 'notation'],
        ['C7(9,13)', 'C13', 'notation'],
        ['C7(9,#11)', 'C9#11', 'notation'],
        ['C7(b9,13)', 'C13b9', 'notation'],
        ['C7(13)', 'C7(add13)', 'notation'],
        ['Cm7(9)', 'Cm9', 'notation'],
        ['Cm7(9,11)', 'Cm11', 'notation'],
        ['Cmaj7(9)', 'Cmaj9', 'notation'],
        ['C6(9)', 'C69', 'notation'],
        ['C11b9', 'C7b9sus', 'notation'],
        // A 9 in parentheses straight after the root is an added tone (by intent; the old
        // parser played C9 and Cm9).
        ['C(9)', 'Cadd9', 'notation'],
        ['Cm(9)', 'Cmadd9', 'notation'],
        // m7(11) has no spelling without its 9th: the old parser's Cm7, the 11 dropped.
        ['Cm7(11)', 'Cm7', 'tones-dropped'],
        // Unicode accidentals, read as written.
        ['D♭7', 'D♭7', 'none'],
        ['C♯m', 'C♯m', 'none'],
        // The jazz dominants the vocabulary now holds (#1737).
        ['C7#9b13', 'C7#9b13', 'none'],
        ['C9b13', 'C9b13', 'none'],
        ['C13b9#11', 'C13b9#11', 'none'],
        // No spelling holds the whole chord: the longest written part that is one.
        ['C7b9#11b13', 'C7b9#11', 'tones-dropped'],
        ['C7#9#11b13', 'C7#9#11', 'tones-dropped'],
        ['Cmaj7#11b13', 'Cmaj7#11', 'tones-dropped'],
        ['Cm11b5', 'Cm7b5', 'tones-dropped'],
        ['C/G7', 'C/G', 'tones-dropped'],
    ])('%s becomes %s (%s)', (token, symbol, change) => {
        expect(convertLegacyChordToken(token)).toEqual({ kind: 'chord', symbol, change });
    });

    it('reads N.C. as no chord', () => {
        expect(convertLegacyChordToken('N.C.')).toEqual({ kind: 'no-chord' });
        expect(convertLegacyChordToken('NC')).toEqual({ kind: 'no-chord' });
    });

    it('refuses what the old parser guessed at, saying why', () => {
        for (const token of ['%', 'Xm7', 'Cnope', 'C:2']) {
            expect(convertLegacyChordToken(token)).toMatchObject({ kind: 'refused' });
        }
        expect(convertLegacyChordToken('Cnope')).toEqual({
            kind: 'refused',
            why: 'The old parser read no chord quality in “nope” of “Cnope” (it played a plain major chord).',
        });
    });

    it('refuses a sus with a major 7th rather than write the 3rd it leaves out', () => {
        // The old parser played Cmaj7sus4 as Cmaj7; no chart spelling keeps both the 4th and
        // the major 7th, and Cmaj7 sounds the E the sus excludes.
        for (const token of ['Cmaj7sus4', 'CMaj7sus', 'C^7sus4']) {
            expect(convertLegacyChordToken(token)).toMatchObject({ kind: 'refused' });
        }
    });
});

/** 6,000 seeded random tokens, a root and one to four fragments. */
function fuzzTokens(): string[] {
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
        '7M',
        '-5',
        '+5',
        '+11',
        '(9)',
        ',',
    ];
    const random = makeMulberry32(1737);
    const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)];
    return Array.from({ length: 6000 }, () => {
        const parts = Array.from({ length: 1 + Math.floor(random() * 4) }, () => pick(FRAGMENTS));
        return pick(ROOTS) + parts.join('');
    }).filter((token) => !token.includes('|'));
}

describe('fuzzed tokens', () => {
    const tokens = fuzzTokens();

    it.each(KEYS)(
        'convert to the old chord or a named difference, or refuse, in %s',
        (key, minor) => {
            const verdicts = differential(tokens, key, minor);
            const unexplained = verdicts.filter((v) => !NAMED.includes(v) && v !== 'refused');
            expect(unexplained).toEqual([]);
            // The fuzz reaches every outcome, so it is not vacuous.
            for (const outcome of ['same', 'written-tones', 'refused']) {
                expect(verdicts).toContain(outcome);
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
                const converted = convertLegacyChordToken(token);
                const v = verdict(
                    token,
                    v1.progression[chord].absName,
                    {
                        symbol: event.kind === 'chord' ? event.symbol : '',
                        change: converted.kind === 'chord' ? converted.change : 'none',
                    },
                    key,
                    minor,
                );
                if (!NAMED.includes(v)) {
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
        // Six in 4/4: 3 each, a bar two sixteenths LONG. Keeping the onsets would leave the
        // last chord one sixteenth, so the six spread evenly, onsets rounded up.
        ['C D E F G A', '4/4', [3, 3, 3, 3, 3, 3], [3, 3, 2, 3, 3, 2]],
        // Ten in 4/4: 2 each, the old onsets running past the bar's end; spread evenly.
        ['C D E F G A B C D E', '4/4', Array(10).fill(2), [2, 2, 1, 2, 1, 2, 2, 1, 2, 1]],
        // Seven in 4/4: 2 each, the last takes the 4 left: every old onset kept.
        ['C D E F G A B', '4/4', Array(7).fill(2), [2, 2, 2, 2, 2, 2, 4]],
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

    it('refuses a bar with more chords than sixteenths, naming it', () => {
        expect(legacyBarSteps(16, '4/4')).toEqual(Array(16).fill(1));
        expect(legacyBarSteps(17, '4/4')).toBeNull();
        const result = proposeLegacyScoreConversion(
            v1Document({
                title: 'Busy',
                sections: [{ label: 'Verse', value: `| C | | ${'C '.repeat(17)}` }],
            }),
        );
        expect(result).toMatchObject({
            kind: 'blocked',
            issues: [
                {
                    code: 'off-grid',
                    song: 'Busy',
                    section: 'Verse',
                    // The second bar the sheet shows: the leading `|` and the empty bar are not bars.
                    bar: 2,
                    path: '$.chart.arrangement.sections[0].value.bars[3]',
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
        // Only the empty bar between two chords is said; the text after the trailing `|` is
        // not a bar.
        expect(result.notes.filter((n) => n.code === 'empty-bar')).toEqual([
            expect.objectContaining({
                path: '$.chart.arrangement.sections[0].value.bars[1]',
                message: expect.stringContaining('after bar 1'),
            }),
        ]);
    });

    it('says nothing about a leading or trailing `|`', () => {
        const result = proposeLegacyScoreConversion(
            v1Document({ sections: [{ label: 'A', value: ' | C | G7 | ' }] }),
        );
        expect(result).toMatchObject({ kind: 'candidate', notes: [] });
    });

    it('drops an empty section: it played no time, and a score section needs a bar', () => {
        const result = proposeLegacyScoreConversion(
            v1Document({
                sections: [
                    { label: 'A', value: 'C | G7' },
                    { label: 'Fill', value: ' | | | ' },
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
        // Its one note: no "empty bar after bar 0" for each of its pieces.
        expect(result.notes.filter((n) => n.section === 'Fill')).toEqual([
            expect.objectContaining({ code: 'empty-section' }),
        ]);
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
                    { label: 'B', value: '| | F | | N.C. Xm7 Cnope' },
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
                    text: 'N.C. Xm7 Cnope',
                    message: expect.stringMatching(/“Xm7”.*“Cnope”/),
                },
            ],
        });
    });
});

describe('N.C. and %', () => {
    function measures(value: string) {
        const result = proposeLegacyScoreConversion(
            v1Document({ sections: [{ label: 'A', value }] }),
        );
        if (result.kind !== 'candidate') {
            throw new Error(JSON.stringify(result.issues));
        }
        return result.value.chart.score.sections[0].measures;
    }

    it('converts N.C. to no chord, the way it reads', () => {
        // The old parser read no root in `N.C.` and played the key's own chord there.
        expect(v1Parse('N.C.').progression[0].absName).toBe('C');
        expect(measures('C | N.C. | G7 N.C.').map((m) => m.content)).toEqual([
            { kind: 'events', events: [{ kind: 'chord', symbol: 'C', duration: [4, 1] }] },
            { kind: 'events', events: [{ kind: 'no-chord', duration: [4, 1] }] },
            {
                kind: 'events',
                events: [
                    { kind: 'chord', symbol: 'G7', duration: [2, 1] },
                    { kind: 'no-chord', duration: [2, 1] },
                ],
            },
        ]);
    });

    it('converts a bar of % to a repeat of the bar before it', () => {
        const converted = measures('C F | % | G7 | %');
        expect(converted.map((m) => m.content)).toEqual([
            expect.objectContaining({ kind: 'events' }),
            { kind: 'repeat', measureId: converted[0].id, display: 'one-bar' },
            expect.objectContaining({ kind: 'events' }),
            { kind: 'repeat', measureId: converted[2].id, display: 'one-bar' },
        ]);
    });

    it('refuses a % with nothing before it, or among chords', () => {
        for (const value of ['% | C', 'C | C %']) {
            expect(
                proposeLegacyScoreConversion(v1Document({ sections: [{ label: 'A', value }] })),
            ).toMatchObject({ kind: 'blocked', issues: [{ code: 'legacy-syntax' }] });
        }
    });
});
