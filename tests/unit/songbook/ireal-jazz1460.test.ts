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

    it('imports Cherokee at 64 performed bars, taking its "D.C. al 2nd ending" to the Fine (#1473)', () => {
        // The rule (iReal Pro, https://www.irealpro.com/learn/repeats-endings-and-jumps/): "D.C.
        // al 2nd ending returns to the top, skips the first ending, and takes the second", and
        // "needs a Fine to mark where to stop"; the jump "only takes effect at that closing
        // barline". The written chart, 36 bars in one section:
        //   bars  1-12  A, inside {: Bb6 | % | Fm7 | Bb7 | Ebmaj7 | % | Ab7 | % | Bb6 | % | C7 | %
        //   bars 13-16  1st ending: Cm7 | G7b9 | Cm7 | F7#5 }       (repeat x2)
        //   bars 17-20  2nd ending: Cm7 | F7 | Bb6 | % <Fine> ]
        //   bars 21-36  B: C#m7 | F#7 | Bmaj7 | % | Bm7 | E7 | Amaj7 | % | Am7 | D7 | Gmaj7 | % |
        //               Gm7 | C7 | Cm7 <D.C. al 2nd ending> | F7#5 ]   (the closing barline)
        // Performed:
        //   A1 = bars 1-12 + 1st ending 13-16                 = 16
        //   A2 = bars 1-12 + 2nd ending 17-20                 = 16
        //   B  = bars 21-36, D.C. at bar 36's closing barline  = 16
        //   A3 = bars 1-12 once, straight to 17-20, Fine       = 16
        // Total 64: the published AABA form, 16+16+16+16. The text sits in bar 35, a bar before
        // the closing barline where iReal's jump takes effect, so the importer places the jump at
        // the end of bar 36; jumping at bar 35 instead would drop the bridge's last bar (63).
        const { document, song } = importFixture('cherokee');
        expect(performedBarCount(document)).toBe(64);
        const visits = compileScoreForm(document.chart.score).map(
            ({ measureIndex }) => measureIndex + 1,
        );
        const range = (from: number, to: number) =>
            Array.from({ length: to - from + 1 }, (_, i) => from + i);
        expect(visits).toEqual([
            ...range(1, 16),
            ...range(1, 12),
            ...range(17, 36),
            ...range(1, 12),
            ...range(17, 20),
        ]);
        expectCanonicalRoundTrip(document);
        const measures = document.chart.score.sections[0].measures;
        expect(measures[35].end).toEqual([
            {
                kind: 'jump',
                from: 'start',
                destination: { kind: 'ending', pass: 2 },
                repeats: 'skip',
            },
        ]);
        // The instruction is applied, so it is neither inert text nor a note, and its Fine is
        // no longer an orphaned sign.
        expect(measures[34].annotations).toBeUndefined();
        expect(song.diagnostics.map(({ message }) => message)).toEqual([
            expect.stringContaining('Stored key is used without transposition'),
        ]);
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
        // form (#1171); importing the full written form with an honest warning does not. #1476
        // maps coda signs with no jump text to a last-chorus coda, but not these: the prose says
        // the original takes the coda EVERY time, which a last-chorus coda would contradict.
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

    // #1476: coda signs with no D.C./D.S. text, as iReal Pro reads them
    // (https://irealpro.com/how-the-coda-symbol-works-in-ireal-pro/), whose worked example is
    // 500 Miles High: "Set the player to repeat 5 times and the main form repeats 5 times, then
    // jumps to the Coda on the final pass"; "The player jumps to the Coda only on the last
    // repeat". Imported as a last-chorus coda (#1472) with no chorus count, so the form loops
    // without the coda until the musician sets one.
    describe('coda signs with no jump text, as a last-chorus coda (#1476)', () => {
        /** [chorus, written bar number] for each performed bar. */
        function performed(document: ChartDocumentV2, choruses?: number) {
            const score = { ...document.chart.score, ...(choruses ? { choruses } : {}) };
            return compileScoreForm(score).map(({ chorus, measureIndex }) => [
                chorus,
                measureIndex + 1,
            ]);
        }
        const bars = (chorus: number, from: number, to: number) =>
            Array.from({ length: to - from + 1 }, (_, i) => [chorus, from + i]);
        const codaNote = (target: number, via: number) =>
            `The coda at bar ${target} is played once, at the end: with a chorus count set, the last chorus jumps to it from the end of bar ${via}. Until then the form loops without it.`;

        it("imports 500 Miles High, iReal's own worked example, as that page plays it", () => {
            // The page: "the Coda symbol sits in the form right before the C-7 chord, with the
            // Coda section marked at the bottom". The written chart, 22 bars in one section:
            //   bars  1-14  Em7 | % | Gm7 | % | Bbmaj7 | % | Bm7b5 | E7#9 | Am7 | % | F#m7b5 | % |
            //               Fm7 | %, the departure sign at the end of bar 14
            //   bars 15-18  Cm7 | % | B7#9 | %, the rest of the form
            //   bars 19-22  the Coda section, a repeat: {Cm7 | % | Abmaj7 | %}
            // Every pass but the last plays the 18-bar form; "the main form repeats 5 times, then
            // jumps to the Coda on the final pass", so the last plays 1-14, then the coda with
            // its repeat. Two choruses: 18 + 14 + 8 = 40 bars.
            const { document, song } = importFixture('500-miles-high');
            expect(document.chart.score.choruses).toBeUndefined();
            expect(performedBarCount(document)).toBe(18);
            expect(performed(document)).toEqual(bars(0, 1, 18));
            expect(performed(document, 2)).toEqual([
                ...bars(0, 1, 18),
                ...bars(1, 1, 14),
                ...bars(1, 19, 22),
                ...bars(1, 19, 22),
            ]);
            expectCanonicalRoundTrip(document);
            expect(song.diagnostics.map(({ message }) => message)).toEqual([
                codaNote(19, 14),
                expect.stringContaining('Stored key is used without transposition'),
            ]);
        });

        it('imports Blue In Green as its published 10-bar form, its 4-bar coda on the last chorus only', () => {
            // The written chart, 14 bars in one section, no intro:
            //   bars  1-10  Gm6 | A7#9 | Dm7 Db7 | Cm7 F7 | Bbmaj7#11 | A7#9 | Dm6 | E7b13 |
            //               Am7 | Dm7, its departure coda sign at the end of bar 10
            //   bars 11-14  the coda, its target sign at the start of bar 11:
            //               Gm6 | A7#9 | Dm6 | Dm6 (fermata)
            // Performed, uncounted: bars 1-10 looped, the coda never taken = 10 bars a chorus.
            // That is the tune's published form: Bill Evans's liner notes to Kind of Blue call it
            // "a 10-measure circular form", and Ted Gioia, "The composition is ten bars long"
            // (both quoted at https://en.wikipedia.org/wiki/Blue_in_Green). Two choruses: 1-10,
            // then 1-10 and on into the coda's 11-14 = 24 bars.
            const { document, song } = importFixture('blue-in-green');
            expect(document.chart.score.choruses).toBeUndefined();
            expect(performedBarCount(document)).toBe(10);
            expect(performed(document)).toEqual(bars(0, 1, 10));
            expect(performed(document, 2)).toEqual([...bars(0, 1, 10), ...bars(1, 1, 14)]);
            const measures = document.chart.score.sections[0].measures;
            expect(measures[9].end).toEqual([
                { kind: 'coda', label: 'coda-1' },
                {
                    kind: 'last-chorus',
                    destination: { kind: 'coda', via: 'coda-1', target: 'coda-2' },
                },
            ]);
            expect(measures[10].start).toEqual([{ kind: 'coda', label: 'coda-2' }]);
            expectCanonicalRoundTrip(document);
            expect(song.diagnostics.map(({ message }) => message)).toEqual([
                codaNote(11, 10),
                expect.stringContaining('Stored key is used without transposition'),
            ]);
        });

        it('imports Hello Dolly at 32 bars, the last chorus trading its turnaround for the coda tag', () => {
            // Two 16-bar halves; the departure sign is at the end of bar 30, so the last chorus
            // leaves out the bar 31-32 turnaround (C6 Ebdim7 | Dm7 G7) and plays the 6-bar tag
            // (D7 | G7 | D7 | G7 | ...) at 33-38 in its place.
            const { document, song } = importFixture('hello-dolly');
            expect(performedBarCount(document)).toBe(32);
            expect(performed(document)).toEqual(bars(0, 1, 32));
            expect(performed(document, 2)).toEqual([
                ...bars(0, 1, 32),
                ...bars(1, 1, 30),
                ...bars(1, 33, 38),
            ]);
            expectCanonicalRoundTrip(document);
            expect(song.diagnostics.map(({ message }) => message)).toContain(codaNote(33, 30));
        });

        it("imports Driftin' at 32 bars: its repeat plays in full every chorus, its vamp coda on the last", () => {
            // AABA with a first/second-ending repeat (bars 1-10), the bridge (11-18) and the last
            // A (19-26), the departure at the end of bar 25. The coda (27-29) ends on a repeated
            // vamp, "Vamp and fade" (28-29, twice).
            const { document, song } = importFixture('driftin');
            expect(performedBarCount(document)).toBe(32);
            const head = (chorus: number) => [
                ...bars(chorus, 1, 8),
                ...bars(chorus, 1, 6),
                ...bars(chorus, 9, 10),
            ];
            expect(performed(document)).toEqual([...head(0), ...bars(0, 11, 26)]);
            expect(performed(document, 2)).toEqual([
                ...head(0),
                ...bars(0, 11, 26),
                ...head(1),
                ...bars(1, 11, 25),
                ...bars(1, 27, 29),
                ...bars(1, 28, 29),
            ]);
            expectCanonicalRoundTrip(document);
            expect(song.diagnostics.map(({ message }) => message)).toContain(codaNote(27, 25));
        });

        it('imports Ladies In Mercedes at 32 bars, its lone coda a vamp tagged on after the last chorus (#1487)', () => {
            // The page's other form, "mark only the Coda section at the end, as in Alley Cat":
            // "with no jump symbol in the form, the repeats play in full and the Coda is added
            // once as a tag at the end". The written chart, 36 bars in one section:
            //   bars  1-32  the form, sixteen chords of two bars each (Gmaj7 | % | C7#11 | % ...
            //               Am7b5 | % | D7b9 | %), with no coda sign anywhere in it
            //   bars 33-36  the Coda section, a repeat with the chart's one coda sign on it:
            //               {Gmaj7 | % | C7#11 | %}
            // So no chorus leaves anything out: the last plays all 32 bars, then the vamp twice.
            const { document, song } = importFixture('ladies-in-mercedes');
            expect(document.chart.score.choruses).toBeUndefined();
            expect(performedBarCount(document)).toBe(32);
            expect(performed(document)).toEqual(bars(0, 1, 32));
            expect(performed(document, 2)).toEqual([
                ...bars(0, 1, 32),
                ...bars(1, 1, 32),
                ...bars(1, 33, 36),
                ...bars(1, 33, 36),
            ]);
            const measures = document.chart.score.sections[0].measures;
            expect(measures[31].end).toBeUndefined();
            expect(measures[32].start).toEqual([
                { kind: 'repeat-start' },
                { kind: 'coda', label: 'coda-1' },
                { kind: 'last-chorus', destination: { kind: 'coda', target: 'coda-1' } },
            ]);
            expectCanonicalRoundTrip(document);
            expect(song.diagnostics.map(({ message }) => message)).toEqual([
                'The coda at bar 33 is played once, at the end: with a chorus count set, the last chorus plays on into it. Until then the form loops without it.',
                expect.stringContaining('Stored key is used without transposition'),
            ]);
        });
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

    it('imports Round Midnight at 41 performed bars, resolving its "W" invisible-root placeholder (#1452)', () => {
        // Bar 9 of the chart is "Ebm | Ebm/D | Ebm7/Db" written as "Ebm,Ebm/D,W" is not quite
        // it — the actual token is "7,W/D,-bE" (Ebm, then "W/D", i.e. Ebm's root+quality with
        // W's own slash bass D) — the chromatic descending-bass walk-down the tune is known for.
        // ireal-score.ts's 'W' branch cites infojunkie/ireal-musicxml converter.js for why W
        // copies the nearest preceding chord's root+quality and applies its own slash bass.
        const { document, song } = importFixture('round-midnight');
        expect(performedBarCount(document)).toBe(41);
        expectCanonicalRoundTrip(document);
        const measures = document.chart.score.sections[0].measures;
        expect(measures[8].content).toEqual({
            kind: 'events',
            events: [
                { kind: 'chord', symbol: 'Ebm', duration: [1, 1] },
                { kind: 'chord', symbol: 'Ebm/D', duration: [1, 1] },
                { kind: 'chord', symbol: 'Ebm7/Db', duration: [2, 1] },
            ],
        });
        expect(song.diagnostics).toContainEqual(
            expect.objectContaining({
                severity: 'warning',
                message: expect.stringContaining('dropped'),
            }),
        );
    });

    // #1453: multi-chord cells in meters other than 4/4, per infojunkie/ireal-musicxml
    // converter.js's `adjustChordsDuration()` — see `CELL_BEATS` and `multiChordDurations` in
    // ireal-score.ts for the full citation. One real Jazz 1460 chart per shipped meter; 6/8 has
    // none in this playlist (its one 6/8 chart, Litha, has no multi-chord bar) and is not shipped
    // (see `SHIPPED_MULTI_CHORD_METERS`'s own comment).
    it('imports 502 Blues, giving each chord of a two-chord 3/4 bar a beat and a half (#1546)', () => {
        // Brandon's ear against iReal Pro's own playback (#1454): the change lands on the "and"
        // of 2, as the reference converter's half-beat cell says.
        const { document } = importFixture('502-blues');
        expect(document.chart.score.meter).toBe('3/4');
        const measures = document.chart.score.sections[0].measures;
        expect(measures[11].content).toEqual({
            kind: 'events',
            events: [
                { kind: 'chord', symbol: 'Abm7', duration: [3, 2] },
                { kind: 'chord', symbol: 'Db7', duration: [3, 2] },
            ],
        });
        expect(measures[15].content).toMatchObject({
            events: [{ duration: [3, 2] }, { duration: [3, 2] }],
        });
        expectCanonicalRoundTrip(document);
    });

    it('imports Take Five at 24 performed bars, splitting its 5/4 vamp bar 3 beats + 2', () => {
        const { document } = importFixture('take-five');
        expect(document.chart.score.meter).toBe('5/4');
        expect(performedBarCount(document)).toBe(24);
        expectCanonicalRoundTrip(document);
        expect(document.chart.score.sections[0].measures[0].content).toEqual({
            kind: 'events',
            events: [
                { kind: 'chord', symbol: 'Ebm', duration: [3, 1] },
                { kind: 'chord', symbol: 'Bbm7', duration: [2, 1] },
            ],
        });
    });

    it('imports West Coast Blues at 36 performed bars, splitting a 6/4 bar into two equal halves', () => {
        const { document } = importFixture('west-coast-blues');
        expect(document.chart.score.meter).toBe('6/4');
        expect(performedBarCount(document)).toBe(36);
        expectCanonicalRoundTrip(document);
        expect(document.chart.score.sections[0].measures[3].content).toEqual({
            kind: 'events',
            events: [
                { kind: 'chord', symbol: 'Bm7', duration: [3, 1] },
                { kind: 'chord', symbol: 'E7', duration: [3, 1] },
            ],
        });
    });

    describe('repeat counts written other than "3x" (#1486)', () => {
        // Before #1486 each of these imported with its count left as inert text (one with a
        // note, two silently), so the repeat played twice. A main-vs-branch run over the whole
        // Jazz 1460 playlist changed exactly these three charts; the other 1457 were
        // byte-identical (diagnostics included).
        it.each([
            // Bars 37-38, "{C-7/F | F13 <x3> }": the two-bar vamp before the solos, three times.
            ['harlequin', 'x3', 38, [37, 38], 44],
            // Bars 23-24, "{A-9 | E9sus <Repeat 3x> }": the A section's closing vamp.
            ['speak-like-a-child', 'Repeat 3x', 24, [23, 24], 54],
            // Bars 1-4, the intro "{C^7/G | C6/G | G9sus | G7 <3X> }".
            ['up-with-the-lark', '3X', 4, [1, 2, 3, 4], 72],
        ])(
            'imports %s, reading its "%s" as three passes',
            (slug, text, closingBar, bars, performed) => {
                const { document, song } = importFixture(slug);
                const measures = document.chart.score.sections[0].measures;
                expect(measures[closingBar - 1].end).toEqual([{ kind: 'repeat-end', times: 3 }]);
                expect(measures[closingBar - 1].annotations).toBeUndefined();
                expect(song.diagnostics.map(({ message }) => message).join('\n')).not.toContain(
                    text,
                );
                const visits = compileScoreForm(document.chart.score).map(
                    ({ measureIndex }) => measureIndex + 1,
                );
                for (const bar of bars) {
                    expect(visits.filter((visit) => visit === bar)).toHaveLength(3);
                }
                expect(visits).toHaveLength(performed);
                expectCanonicalRoundTrip(document);
            },
        );
    });
});
