/**
 * Coverage for #1447: the iReal importer reads the iReal Pro "Jazz 1460" playlist
 * (https://raw.githubusercontent.com/infojunkie/ireal-musicxml/main/test/data/jazz1460.txt).
 * Each fixture under `tests/fixtures/ireal/` is one tune's raw `irealb://` entry, extracted
 * verbatim from that playlist (chord data only — the playlist carries no melody/lyric data to
 * strip). The whole playlist is not checked in; see #1447's PR/issue for the full-playlist
 * measurement script and its numbers.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importedDocument } from '../../../prototypes/v2/lib/import-document.js';
import {
    decodeChartDocumentV2,
    encodeChartDocumentV2,
} from '../../../public/songbook/document-v2.js';
import { parseIRealImport } from '../../../public/songbook/ireal-import.js';
import { compileScoreForm } from '../../../public/songbook/score-form.js';
import type { ChartDocumentV2 } from '../../../public/songbook/score-types.js';
import type { ChartDocument } from '../../../public/songbook/types.js';

/**
 * A donor chart for the band/performance settings `importedDocument` carries forward — its own
 * music is discarded. Shape copied from `codec.test.ts`'s `makeChartDocument` fixture, which is
 * already a known-valid schemaVersion 1 document.
 */
function baseChart(): ChartDocument {
    return {
        schemaVersion: 1,
        id: 'chart-base-001',
        title: 'Base study',
        createdAt: '2026-08-28T12:00:00.000Z',
        updatedAt: '2026-08-28T12:30:00.000Z',
        revision: 1,
        chart: {
            arrangement: {
                sections: [{ id: 'section-a', label: 'A', value: 'Imaj7', repeat: 1 }],
                key: 'C',
                timeSignature: '4/4',
                grouping: null,
                isMinor: false,
                notation: 'name',
                lastChordPreset: 'Songbook',
            },
            performance: { bpm: 120, complexity: 0.5, seed: 'A1B2C3', randomizeSeed: false },
            band: {
                chords: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: true,
                    style: 'smart',
                    instrument: 'Piano',
                    octave: 48,
                    density: 'rich',
                    volume: 0.8,
                    reverb: 0.2,
                },
                bass: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: true,
                    style: 'smart',
                    octave: 38,
                    volume: 0.9,
                    reverb: 0.1,
                },
                soloist: {
                    enabled: false,
                    voice: 'synth',
                    autoSound: true,
                    style: 'smart',
                    preset: 'trumpet',
                    octave: 72,
                    volume: 0.8,
                    reverb: 0.3,
                    mode: 'monophonic',
                    autoMode: false,
                    phrasingIntensity: 0.5,
                    tradeMode: 'sections',
                },
                harmony: {
                    enabled: false,
                    voice: 'synth',
                    autoSound: true,
                    style: 'smart',
                    octave: 60,
                    volume: 0.7,
                    reverb: 0.4,
                    complexity: 0.5,
                },
                groove: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: true,
                    volume: 0.9,
                    reverb: 0.2,
                    measures: 2,
                    swing: 0,
                    swingSub: '8th',
                    humanize: 10,
                    lastDrumPreset: 'Basic Rock',
                    genreFeel: 'Jazz',
                    lastSmartGenre: 'Jazz',
                    pattern: [{ name: 'Kick', steps: [1, 0, 0, 0, 1, 0, 0, 0] }],
                },
            },
        },
    };
}

function fixture(slug: string): string {
    return readFileSync(
        new URL(`../../fixtures/ireal/${slug}.txt`, import.meta.url),
        'utf8',
    ).trim();
}

/** Imports the fixture's sole song through the app's own path and returns the new document. */
function importFixture(slug: string) {
    const source = fixture(slug);
    const result = parseIRealImport(source);
    expect(result.songs).toHaveLength(1);
    const song = result.songs[0];
    expect(
        [...result.diagnostics, ...song.diagnostics].filter((entry) => entry.severity === 'error'),
    ).toEqual([]);
    const document = importedDocument(result, 0, baseChart(), 120);
    return { document, song };
}

/**
 * "Total bar count" is the PERFORMED order (repeats/endings unfolded via `compileScoreForm`),
 * not the raw written-measure count — confirmed against this story's own written-vs-performed
 * gap on Autumn Leaves (24 written / 32 performed) and Night And Day (34 written / 48 performed),
 * both of which match the acceptance's pinned numbers only once repeats are unfolded.
 */
function performedBarCount(document: ChartDocumentV2): number {
    return compileScoreForm(document.chart.score).length;
}

function expectCanonicalRoundTrip(document: ChartDocumentV2) {
    const encoded = encodeChartDocumentV2(document);
    expect(encoded.kind).toBe('ok');
    if (encoded.kind !== 'ok') {
        return;
    }
    const decoded = decodeChartDocumentV2(encoded.json);
    expect(decoded).toEqual({ kind: 'ok', value: document });
}

describe('the Jazz 1460 playlist fixtures (#1447)', () => {
    it.each([
        ['autumn-leaves', 32],
        ['blue-bossa', 16],
        ['all-the-things-you-are', 36],
        ['giant-steps', 16],
        ['donna-lee', 32],
        ['ornithology', 32],
    ])('imports %s at %i performed bars, through the canonical codec', (slug, bars) => {
        const { document } = importFixture(slug);
        expect(performedBarCount(document)).toBe(bars);
        expectCanonicalRoundTrip(document);
    });

    it('imports Stella By Starlight at 32 performed bars, dropping an unowned alternate with a note', () => {
        const { document, song } = importFixture('stella-by-starlight');
        expect(performedBarCount(document)).toBe(32);
        expectCanonicalRoundTrip(document);
        expect(song.diagnostics).toContainEqual(
            expect.objectContaining({
                severity: 'warning',
                message: expect.stringContaining('dropped'),
            }),
        );
    });

    it('imports Cherokee, preserving its unmapped "D.C. al 2nd ending" as text with a warning', () => {
        // Cherokee's full performed form is 64 bars if the D.C. is actually taken, but jumping to
        // a specific numbered ending needs ScoreDestination's 'ending' kind implemented in the
        // shared score-form.ts — its own story (a design call on navigation every chart shares,
        // not a parser-token fix), which the #1447 PR/issue files as a follow-up. This importer
        // preserves the instruction as inert text (never silently flattening a wrong form) and
        // imports the written 36 bars / 48 performed-without-the-jump instead of guessing a form.
        // Accepted for this story at 48, not the aspirational 64.
        const { document, song } = importFixture('cherokee');
        expect(performedBarCount(document)).toBe(48);
        expectCanonicalRoundTrip(document);
        expect(song.diagnostics).toContainEqual(
            expect.objectContaining({
                severity: 'warning',
                message: expect.stringContaining('D.C. al 2nd ending'),
            }),
        );
        // The Fine mark on the first ending (bar 20) is now orphaned, since the D.C. that would
        // have referenced it is left unmapped — named explicitly, not just silently tolerated.
        expect(song.diagnostics).toContainEqual(
            expect.objectContaining({
                severity: 'warning',
                message: expect.stringContaining('fine sign in bar 20'),
            }),
        );
    });

    it('imports Night And Day at 48 performed bars (unfolding its 1st/2nd-ending repeat)', () => {
        const { document } = importFixture('night-and-day');
        expect(performedBarCount(document)).toBe(48);
        expectCanonicalRoundTrip(document);
    });

    it('imports All Blues at its own written form (12-bar blues in 3/4, four bars of I per the chart)', () => {
        // No pinned target: the acceptance asks only to report this tune's own form.
        const { document } = importFixture('all-blues');
        expect(performedBarCount(document)).toBe(24);
        expectCanonicalRoundTrip(document);
    });

    it('imports I Got Rhythm at 36 performed bars, leaving a free-text "takes coda every time" note unapplied', () => {
        // The chart's own coda markers ('Q'...'Q') are real, but "Original takes Coda every
        // time" is prose, not one of the fixed D.C./D.S. al Fine/Coda phrases this importer maps
        // to a real jump. Inventing a jump from free text would risk silently producing a wrong
        // form (#1171); importing the full written form with an honest warning does not. Same
        // follow-up as Cherokee above would let this reach its aspirational 32 instead of 36.
        const { document, song } = importFixture('i-got-rhythm');
        expect(performedBarCount(document)).toBe(36);
        expectCanonicalRoundTrip(document);
        expect(song.diagnostics).toContainEqual(
            expect.objectContaining({
                severity: 'warning',
                message: expect.stringContaining('Original takes Coda every time'),
            }),
        );
        // Both of the chart's own coda signs are now orphaned, named explicitly rather than just
        // silently tolerated.
        expect(song.diagnostics).toContainEqual(
            expect.objectContaining({
                severity: 'warning',
                message: expect.stringContaining('coda sign in bar 23'),
            }),
        );
        expect(song.diagnostics).toContainEqual(
            expect.objectContaining({
                severity: 'warning',
                message: expect.stringContaining('coda sign in bar 26'),
            }),
        );
    });

    it('imports One For My Baby at 61 performed bars, landing its closing fermata on the chord it precedes (#1451)', () => {
        // The chart writes its one fermata as a prefix on the final measure ("fG6"), the pattern
        // #1451 fixes: ireal-score.ts's 'f' branch cites infojunkie/ireal-musicxml's tokenizer +
        // converter for why a prefix fermata lands on the chord it precedes, not the one before it.
        const { document } = importFixture('one-for-my-baby');
        expect(performedBarCount(document)).toBe(61);
        expectCanonicalRoundTrip(document);
        const measures = document.chart.score.sections[0].measures;
        const last = measures[measures.length - 1];
        expect(last.content).toEqual({
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'G6', duration: [4, 1], fermata: true }],
        });
    });
});
