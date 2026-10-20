/**
 * The shell adapter (#1585, #1588): Ensemble's chord authority (`parseChord`) and key-aware
 * speller (`spellPitchClass`) read as the engine's eight shells, six triads, the ukulele's add9
 * (#1820) and power chord. Pinned
 * here: the codec's whole quality
 * vocabulary adapts, the faithful/approximated split, key spelling, and every bundled standard
 * voicing inside a hand window.
 */
import { compileTimeline, notePc, parseChord } from '@band/index';
import { SCORE_CHORD_QUALITIES } from '@core/songbook/score-text';
import { describe, expect, it } from 'vitest';
import { bandChart } from '../band-chart';
import { buildStandardDocument, STANDARDS } from '../standards';
import { voicingChord } from './adapter';
import { GUITAR, UKULELE, UKULELE_LOW_G } from './instruments';
import type { InstrumentDef } from './types';
import { voiceBandChart } from './voice-chart';
import { inHome } from './voicing';

const shell = (symbol: string, key = 'C', minor = false) => {
    const facts = parseChord(symbol, { tonic: notePc(key), minor });
    if (!facts) {
        throw new Error(`parseChord refused ${symbol}`);
    }
    return voicingChord(facts, key, minor);
};

describe('every codec quality adapts', () => {
    it('on C in C and on bVII in B♭, with nothing parseChord refuses', () => {
        const refused: string[] = [];
        for (const quality of SCORE_CHORD_QUALITIES) {
            for (const [symbol, key] of [
                [`C${quality}`, 'C'],
                [`bVII${quality}`, 'Bb'],
            ]) {
                const facts = parseChord(symbol, { tonic: notePc(key), minor: false });
                if (!facts) {
                    refused.push(symbol);
                    continue;
                }
                expect(() => voicingChord(facts, key, false), symbol).not.toThrow();
            }
        }
        expect(refused).toEqual([]);
    });
});

describe('faithful and approximated shells', () => {
    it.each([
        ['Cmaj7', 'maj7'],
        ['C7', 'dom7'],
        ['Cm7', 'm7'],
        ['Cm7b5', 'm7b5'],
        ['Cdim7', 'dim7'],
        ['C6', 'six'],
        ['C69', 'six'],
        ['C9', 'dom7'],
        ['C13', 'dom7'],
        ['C7alt', 'dom7'],
        ['C7b9', 'dom7'],
        ['Cmaj9', 'maj7'],
        ['Cm11', 'm7'],
        ['C', 'maj'],
        ['Cmaj', 'maj'],
        ['Cm', 'min'],
        ['C-', 'min'],
        ['Cdim', 'dim'],
        ['Co', 'dim'],
        ['Caug', 'aug'],
        ['C+', 'aug'],
        ['Csus4', 'sus4'],
        ['Csus', 'sus4'],
        ['Csus2', 'sus2'],
        ['C2', 'sus2'],
        ['C5', 'five'],
        // A shell's seats hold a 7sus4's 4th and a m6's 6th (#1817); the 9ths and 13ths above
        // them are dropped as they are from any shell, and an 11 chord is a 9sus4.
        ['C7sus4', '7sus4'],
        ['C7sus', '7sus4'],
        ['C9sus4', '7sus4'],
        ['C13sus4', '7sus4'],
        ['C11', '7sus4'],
        ['C7b9sus', '7sus4'],
        ['A7sus4', '7sus4'],
        ['Cm6', 'm6'],
        ['Am6', 'm6'],
        ['C-6', 'm6'],
        ['C-69', 'm6'],
    ])('%s is a faithful %s', (symbol, quality) => {
        expect(shell(symbol)).toMatchObject({ quality, approximation: null });
    });

    it.each([
        ['C-^7', 'm7', /minor-major/],
        ['C7#5', 'dom7', /augmented/],
        ['Cmaj7#5', 'maj7', /augmented/],
        ['Cm#5', 'm7', /♯5/],
        ['Cadd9', 'maj', /plain major triad \(the added 9 is not played\)/],
        ['Cadd2', 'maj', /plain major triad/],
        ['Cmaj(add4)', 'maj', /plain major triad \(the added 4 is not played\)/],
        ['Cmin(add4)', 'min', /plain minor triad/],
        ['Cmb6', 'min', /plain minor triad \(the added ♭6 is not played\)/],
    ])('%s is approximated as %s', (symbol, quality, reason) => {
        const chord = shell(symbol);
        expect(chord.quality).toBe(quality);
        expect(chord.approximation).toMatch(reason);
    });

    it('an add9 is its own chord on an instrument with grips for it, the ukulele (#1820)', () => {
        const on = (symbol: string, instrument: InstrumentDef | null) =>
            voicingChord(
                parseChord(symbol, { tonic: 0, minor: false })!,
                'C',
                false,
                '',
                instrument,
            );
        for (const uke of [UKULELE, UKULELE_LOW_G]) {
            expect(on('Cadd9', uke)).toMatchObject({ quality: 'add9', approximation: null });
            expect(on('Cadd9/E', uke)).toMatchObject({
                quality: 'add9',
                approximation: 'bass note E not played',
            });
            // The band reads an add2 as the same chord.
            expect(on('Cadd2', uke)).toMatchObject({ quality: 'add9', approximation: null });
            // A minor add9 keeps its reduction: no add9 shape is taught as one.
            expect(on('Cmadd9', uke)).toMatchObject({ quality: 'min' });
            expect(on('Cmadd9', uke).approximation).toMatch(/plain minor triad/);
        }
        // The guitar's three-string triads have no string to spare, nor has a chord read for no
        // instrument at all.
        for (const instrument of [GUITAR, null]) {
            expect(on('Cadd9', instrument).quality).toBe('maj');
            expect(on('Cadd9', instrument).approximation).toMatch(/the added 9 is not played/);
        }
    });

    it('a slash bass is named and not played', () => {
        const chord = shell('C7/E');
        expect(chord.quality).toBe('dom7');
        expect(chord.approximation).toMatch(/bass note E not played/);
        expect(shell('Cmaj7/B').approximation).toMatch(/bass note B not played/);
        expect(shell('C/E')).toMatchObject({
            quality: 'maj',
            approximation: 'bass note E not played',
        });
    });
});

describe('spelling by key', () => {
    it('B♭ major has E♭, B major has D♯, and bVII7 in B♭ is A♭7', () => {
        expect(shell('Ebmaj7', 'Bb').root).toEqual({ name: 'E♭', pc: 3, letter: 2 });
        expect(shell('D#m7', 'B').root).toEqual({ name: 'D♯', pc: 3, letter: 1 });
        const flatSeven = shell('bVII7', 'Bb');
        expect(flatSeven.root.name + flatSeven.quality).toBe('A♭dom7');
    });

    it('a written accidental wins over the key, as it does on the chart', () => {
        const facts = parseChord('D#7', { tonic: notePc('Bb'), minor: false });
        expect(facts).not.toBeNull();
        if (facts) {
            expect(voicingChord(facts, 'Bb', false).root.name).toBe('E♭');
            expect(voicingChord(facts, 'Bb', false, 'D#').root.name).toBe('D♯');
        }
    });
});

describe('every bundled standard voices', () => {
    it('on guitar in frets 2–7 and on uke in frets 1–6', () => {
        const table: { title: string; chords: number; approximated: number }[] = [];
        for (const entry of STANDARDS) {
            const { score } = buildStandardDocument(entry).chart;
            const chart = bandChart(score, compileTimeline(score));
            const written = chart.chords.filter((c) => c.kind === 'chord' && c.chord !== null);
            const guitar = voiceBandChart(chart, {
                instrument: 'guitar',
                home: [2, 7],
                rootStrings: 'all',
            });
            const uke = voiceBandChart(chart, {
                instrument: 'uke',
                home: [1, 6],
                rootStrings: 'all',
            });
            expect(guitar, entry.title).toHaveLength(written.length);
            expect(uke, entry.title).toHaveLength(written.length);
            for (const v of guitar) {
                expect(inHome(v, [2, 7]), `${entry.title} ${v.symbol} on guitar`).toBe(true);
            }
            for (const v of uke) {
                expect(inHome(v, [1, 6]), `${entry.title} ${v.symbol} on uke`).toBe(true);
            }
            table.push({
                title: entry.title,
                chords: guitar.length,
                approximated: guitar.filter((v) => v.approximation !== null).length,
            });
        }
        // A report: how much of each standard the grips approximate.
        console.table(table);
        // The pop, rock and country grooves are triads and power chords (#1588): every chord in
        // them has a real grip, so none is approximated.
        const triadCharts = table.filter((row) =>
            /Pop|Country|Rock|Canon|Andalusian|Alternative|Metal/.test(row.title),
        );
        expect(triadCharts.length).toBeGreaterThan(0);
        for (const row of triadCharts) {
            expect(row.approximated, row.title).toBe(0);
        }
    });
});
