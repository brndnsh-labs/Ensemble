/**
 * @vitest-environment happy-dom
 */
/**
 * `legacyBandChart` (#1587): a measure-less (schemaVersion 1) chart, loaded into the runtime the
 * way the stand loads it, becomes the same `BandChart` shape the neck follows for a score —
 * written chords in written order, one slot per step-map entry performing chord `i`.
 */

import { type ChordFacts, notePc, PPQ, parseChord } from '@band/index';
import { TIME_SIGNATURES } from '@engine/config';
import { buildLeadSheetSections } from '@engine/song/lead-sheet-model';
import { LEGACY_CHORD_QUALITIES } from '@engine/songbook/legacy-score';
import type { ChartDocument } from '@engine/songbook/types';
import { describe, expect, it } from 'vitest';
import { firstVoicedSlot, neckModel, nextVoicedSlot } from '../app/use-neck-view';
import { auditionMidis } from './band-chart';
import { legacyBandChart, legacyChordFacts } from './legacy-band-chart';
import { load, state } from './runtime';
import { bandForGenre } from './standards';
import { GUITAR, voiceBandChart } from './voicings';

function v1Chart(value: string, key = 'C', isMinor = false): ChartDocument {
    return {
        schemaVersion: 1,
        id: 'legacy-neck',
        title: 'Legacy neck',
        createdAt: '2026-10-01T12:00:00.000Z',
        updatedAt: '2026-10-01T12:00:00.000Z',
        revision: 0,
        chart: {
            arrangement: {
                sections: [{ id: 'a', label: 'A', value, repeat: 1 }],
                key,
                timeSignature: '4/4',
                grouping: null,
                isMinor,
                notation: 'name',
            },
            performance: { bpm: 120, seed: '', randomizeSeed: false },
            band: bandForGenre('Jazz'),
        },
    };
}

/** Loads a v1 chart and reads the two maps the stand reads for it. */
function loaded(value: string) {
    load(v1Chart(value));
    const a = state().arranger;
    const blocks = buildLeadSheetSections(
        a.progression,
        a.sections,
        TIME_SIGNATURES[a.timeSignature],
    );
    return { blocks, stepMap: a.stepMap };
}

describe('legacyBandChart', () => {
    it('lays a v1 chart out as written chords and 1:1 performed slots', () => {
        const { blocks, stepMap } = loaded('Dm7 | G7 | Cmaj7 C6 | Cmaj7');
        const chart = legacyBandChart(blocks, stepMap);
        expect(chart.chords.map((c) => c.absName)).toEqual(['Dm7', 'G7', 'Cmaj7', 'C6', 'Cmaj7']);
        expect(chart.chords.map((c) => c.globalIndex)).toEqual([0, 1, 2, 3, 4]);
        expect(chart.chords.every((c) => c.kind === 'chord' && c.chord !== null)).toBe(true);
        expect(chart.chords[0].chord?.root).toBe(2);
        expect(chart.slots).toHaveLength(stepMap.length);
        expect(chart.slots.map((s) => s.display)).toEqual([0, 1, 2, 3, 4]);
        // Two chords in bar 3 share its bar; ticks are the step map's sixteenths.
        expect(chart.slots.map((s) => s.bar)).toEqual([0, 1, 2, 2, 3]);
        expect(chart.slots[1]).toMatchObject({ start: 16, end: 32, from: 4 * PPQ, to: 8 * PPQ });
        expect(chart.slots[3]).toMatchObject({ start: 40, end: 48 });
        expect(chart.sections).toEqual([]);
    });

    it('the neck follows it: Dm7 previews G7, and a voiced grip sounds', () => {
        const { blocks, stepMap } = loaded('Dm7 | G7 | Cmaj7 | Cmaj7');
        const chart = legacyBandChart(blocks, stepMap);
        expect(firstVoicedSlot(chart)).toBe(0);
        expect(nextVoicedSlot(chart, 0)).toBe(1);
        // Cmaj7 again is the same grip, so the next change from Cmaj7 wraps to the top.
        expect(nextVoicedSlot(chart, 2)).toBe(0);
        const voiced = new Map(
            voiceBandChart(chart, { instrument: 'guitar', home: [2, 7], rootStrings: 'all' }).map(
                (v) => [v.globalIndex, v] as const,
            ),
        );
        expect(voiced.size).toBe(4);
        const stopped = neckModel(chart, voiced, null, GUITAR);
        expect(stopped).toMatchObject({ name: 'Dm7', nextName: 'G7', held: null });
        expect(stopped?.grip?.symbol).toBe('Dm7');
        expect(neckModel(chart, voiced, 1, GUITAR)).toMatchObject({
            name: 'G7',
            nextName: 'Cmaj7',
        });
    });

    it('keeps only the slots both maps describe if they ever disagree', () => {
        const { blocks, stepMap } = loaded('Dm7 | G7 | Cmaj7');
        const chart = legacyBandChart(blocks, stepMap.slice(0, 2));
        expect(chart.chords).toHaveLength(3);
        expect(chart.slots).toHaveLength(2);
    });
});

describe('legacyChordFacts', () => {
    // A tap on a measure-less chart sounds `auditionMidis` of these facts, the same preview a
    // measured chart gets. Read the chord back through the real load (`absName` is the parser's
    // rewrite of the written symbol), then compare with the band's parse of the symbol as written.
    const key = { tonic: notePc('C'), minor: false };

    it.each([
        ['major', 'C'],
        ['minor seventh', 'Dm7'],
        ['altered dominant', 'G7alt'],
        ['sharp nine', 'G7#9'],
        ['dominant flat nine', 'G7b9'],
        ['slash chord', 'C/E'],
        ['slash seventh', 'G7/B'],
        ['suspended', 'Gsus4'],
        ['dominant sus', 'G7sus4'],
        ['half-diminished', 'Bm7b5'],
    ])('a %s (%s) taps as it would on a measured chart', (_name, symbol) => {
        load(v1Chart(symbol));
        const facts = legacyChordFacts(state().arranger.progression[0]);
        const heard = facts && auditionMidis(facts);
        expect(heard).toEqual(auditionMidis(parseChord(symbol, key)!));
        expect(heard?.length).toBeGreaterThan(2);
    });

    it('is null for a chord the band does not read', () => {
        expect(legacyChordFacts({ absName: '???', key: 'C', keyIsMinor: false })).toBeNull();
    });

    it('reads a roman numeral as the chord it names', () => {
        load(v1Chart('V7'));
        expect(legacyChordFacts(state().arranger.progression[0])).toEqual(parseChord('G7', key));
    });
});

/**
 * #1662: the chart shows what the band plays. The band reads the token as written
 * (`parseChord`); the chart sheet, a tap and the neck read the name the old parser gives it
 * (`absName`, through `legacyChordFacts`). They are held to each other here over everything a
 * measure-less chart can hold and still play: every root spelling, every quality in
 * `LEGACY_CHORD_QUALITIES`, with and without a slash bass. The lowercase numerals are where
 * they once disagreed (`vii` showed Bm7b5 over a B minor triad, `i7b9` a C7b9 over a minor
 * third) and where a tap was silent (`imaj7`, `iadd9`).
 */
describe('a measure-less chart shows the chord the band plays', () => {
    const accidentals = (names: string[]) => ['', '#', 'b'].flatMap((a) => names.map((n) => a + n));
    const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
    const LOWERCASE = accidentals(NUMERALS.map((n) => n.toLowerCase()));
    const OTHER_ROOTS = [
        ...accidentals(NUMERALS),
        ...accidentals(['1', '2', '3', '4', '5', '6', '7']),
        ...['A', 'B', 'C', 'D', 'E', 'F', 'G'].flatMap((n) => [n, `${n}#`, `${n}b`]),
    ];
    const QUALITIES = ['', ...LEGACY_CHORD_QUALITIES];
    /** The chord as pitch classes over its bass: what is heard, whatever it is called. */
    const sounding = (facts: ChordFacts) => {
        const pitchClasses = new Set(facts.intervals.map((n) => (facts.root + n) % 12));
        return `${[...pitchClasses].sort((a, b) => a - b).join(' ')} over ${facts.bass}`;
    };

    /** One section's text holds 1,000 characters, so a long list is loaded a chart at a time. */
    function charts(tokens: string[]): string[][] {
        const out: string[][] = [[]];
        let length = 0;
        for (const token of tokens) {
            if (length + token.length + 3 > 1000) {
                out.push([]);
                length = 0;
            }
            out[out.length - 1].push(token);
            length += token.length + 3;
        }
        return out;
    }

    /** Every way the chart and the band differ on these tokens, in one key. */
    function disagreements(all: string[], keyName: string, isMinor: boolean): string[] {
        const key = { tonic: notePc(keyName), minor: isMinor };
        return charts(all).flatMap((tokens) => {
            load(v1Chart(tokens.join(' | '), keyName, isMinor));
            const { progression } = state().arranger;
            expect(progression).toHaveLength(tokens.length);
            return tokens.flatMap((token, i) => {
                const played = parseChord(token, key);
                const shown = legacyChordFacts(progression[i]);
                const name = progression[i].absName;
                if (!played) {
                    return [`${token}: the band does not read it`];
                }
                if (!shown) {
                    return [`${token}: shown as ${name}, which nothing can sound`];
                }
                return sounding(shown) === sounding(played)
                    ? []
                    : [
                          `${token}: shown as ${name} (${sounding(shown)}), played ${sounding(played)}`,
                      ];
            });
        });
    }

    it.each([
        ['C', false],
        ['A', true],
        ['Gb', false],
        ['E', true],
    ])('for every lowercase numeral and quality, bass or none, in %s (minor: %s)', (key, minor) => {
        const tokens = LOWERCASE.flatMap((root) =>
            QUALITIES.flatMap((quality) =>
                ['', '/V', '/biii', '/3', '/F#'].map((bass) => root + quality + bass),
            ),
        );
        expect(tokens).toHaveLength(21 * 26 * 5);
        expect(disagreements(tokens, key, minor)).toEqual([]);
    });

    it('and for every other root spelling', () => {
        const tokens = OTHER_ROOTS.flatMap((root) =>
            QUALITIES.flatMap((quality) => ['', '/bvii'].map((bass) => root + quality + bass)),
        );
        expect(disagreements(tokens, 'Bb', false)).toEqual([]);
    });

    it('reads a lowercase numeral literally as minor, whatever its degree', () => {
        load(v1Chart('vii | vii7 | i7b9 | i7#5 | i7b5 | i11'));
        expect(state().arranger.progression.map((c) => c.absName)).toEqual([
            'Bm',
            'Bm7',
            'Cm7b9',
            'Cm7#5',
            'Cm7b5',
            // A dominant 11th has no third for the numeral's case to lower.
            'C11',
        ]);
    });

    // Pitch classes from the chords' names, not from the band: a minor triad with a major
    // 7th; a minor triad with a 9th and no 7th; a dominant 9th (or 13th) whose 4th replaces
    // its 3rd.
    it.each([
        ['imaj7', 'CmMaj7', [0, 3, 7, 11]],
        ['iadd9', 'Cmadd9', [0, 2, 3, 7]],
        ['G9sus4', 'G9sus4', [0, 2, 5, 7, 9]],
        ['G9sus', 'G9sus4', [0, 2, 5, 7, 9]],
        ['G13sus', 'G13sus4', [0, 2, 4, 5, 7, 9]],
    ])('a tap on %s (shown as %s) sounds', (written, name, pitchClasses) => {
        load(v1Chart(written));
        const chord = state().arranger.progression[0];
        expect(chord.absName).toBe(name);
        const heard = auditionMidis(legacyChordFacts(chord)!);
        expect([...new Set(heard.map((midi) => midi % 12))].sort((a, b) => a - b)).toEqual(
            pitchClasses,
        );
        expect(heard.length).toBeGreaterThanOrEqual(pitchClasses.length);
    });
});
