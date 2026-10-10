/**
 * The shell adapter (#1585): Ensemble's chord authority (`parseChord`) and key-aware speller
 * (`spellPitchClass`) read as the engine's six shells. Pinned here: the codec's whole quality
 * vocabulary adapts, the faithful/approximated split, key spelling, and every bundled standard
 * voicing inside a hand window.
 */
import { compileTimeline, notePc, parseChord } from '@band/index';
import { SCORE_CHORD_QUALITIES } from '@engine/songbook/score-text';
import { describe, expect, it } from 'vitest';
import { bandChart } from '../band-chart';
import { buildStandardDocument, STANDARDS } from '../standards';
import { shellChord } from './adapter';
import { voiceBandChart } from './voice-chart';
import { inHome } from './voicing';

const shell = (symbol: string, key = 'C', minor = false) => {
    const facts = parseChord(symbol, { tonic: notePc(key), minor });
    if (!facts) {
        throw new Error(`parseChord refused ${symbol}`);
    }
    return shellChord(facts, key, minor);
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
                expect(() => shellChord(facts, key, false), symbol).not.toThrow();
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
    ])('%s is a faithful %s', (symbol, quality) => {
        expect(shell(symbol)).toMatchObject({ quality, approximation: null });
    });

    it.each([
        ['C', 'maj7', /major triad/],
        ['Cm', 'm7', /minor triad/],
        ['Csus4', 'dom7', /sus/],
        ['C7sus4', 'dom7', /sus/],
        ['Cm6', 'm7', /m6/],
        ['C-^7', 'm7', /minor-major/],
        ['Cdim', 'dim7', /diminished triad/],
        ['Caug', 'dom7', /augmented/],
        ['C7#5', 'dom7', /augmented/],
        ['Cmaj7#5', 'maj7', /augmented/],
        ['C5', 'maj7', /power chord/],
        ['Cm#5', 'm7', /♯5/],
        ['Cmb6', 'm7', /♭6/],
    ])('%s is approximated as %s', (symbol, quality, reason) => {
        const chord = shell(symbol);
        expect(chord.quality).toBe(quality);
        expect(chord.approximation).toMatch(reason);
    });

    it('a slash bass is named and not played', () => {
        const chord = shell('C7/E');
        expect(chord.quality).toBe('dom7');
        expect(chord.approximation).toMatch(/bass note E not played/);
        expect(shell('Cmaj7/B').approximation).toMatch(/bass note B not played/);
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
            expect(shellChord(facts, 'Bb', false).root.name).toBe('E♭');
            expect(shellChord(facts, 'Bb', false, 'D#').root.name).toBe('D♯');
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
        // A report, not an assertion: how much of each standard the shells approximate.
        console.table(table);
    });
});
