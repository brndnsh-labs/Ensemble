import fixtures from '../../../docs/design/fixtures/ensemble-v2-charts.json';
import {
    decodeIRealInput,
    decodeIRealMusic,
    MAX_IREAL_SONGS,
    songSourceLink,
} from '../../../public/songbook/ireal-decode.js';
import {
    MAX_IMPORT_MEASURES,
    parseIRealImport,
    parseIRealImportInSteps,
} from '../../../public/songbook/ireal-import.js';
import { prepareScorePlayback } from '../../../public/songbook/score-playback.js';

function open(body: string, title = 'Original fixture', key = 'C'): string {
    return `irealbook://${encodeURIComponent([title, 'Ensemble', 'Swing', key, 'n', body].join('='))}`;
}

function score(body: string) {
    const parsed = parseIRealImport(open(body));
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.songs[0]?.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
    expect(parsed.songs[0]?.score).toBeDefined();
    return parsed.songs[0].score!;
}

function blocked(body: string) {
    const source = open(body);
    const parsed = parseIRealImport(source);
    expect(parsed.source).toBe(source);
    expect(parsed.songs[0]?.score).toBeUndefined();
    expect(parsed.songs[0]?.diagnostics.some((entry) => entry.severity === 'error')).toBe(true);
}

/** A body under ~41 characters stays byte-identical through the reversible permutation
 * (decodeIRealMusic's "final 50/51-character tail is unchanged" case never triggers the
 * reflection, since the whole encoded value is shorter than that), so it can be written
 * literally here without hand-reversing the scramble — only for tokens gated on the modern
 * (irealb) format, which `open()` above cannot exercise. */
function modernOpen(body: string, title = 'Original modern study', key = 'C'): string {
    const fields = [title, 'Ensemble', '', 'Swing', key, '', `1r34LbKcu7${body}`, '', '0', '0'];
    return `irealb://${fields.map(encodeURIComponent).join('=')}`;
}

function modernScore(body: string) {
    const parsed = parseIRealImport(modernOpen(body));
    expect(parsed.songs[0]?.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
    expect(parsed.songs[0]?.score).toBeDefined();
    return parsed.songs[0]!;
}

describe('bounded source-preserving iReal import', () => {
    it('decodes the supplied sanitized modern Blues without losing empty header fields or refs', () => {
        const fixture = fixtures.realExport;
        const parsed = parseIRealImport(fixture.sanitizedUrl);
        expect(parsed.source).toBe(fixture.sanitizedUrl);
        expect(parsed.format).toBe('irealb');
        expect(parsed.diagnostics).toEqual([]);
        expect(parsed.songs).toHaveLength(1);
        const song = parsed.songs[0];
        expect(song.metadata.fields).toEqual(fixture.expectedPositionalFields);
        expect(song.metadata).toMatchObject({
            key: 'C',
            transpose: '10',
            tempo: '0',
            repeats: '6',
        });
        expect(song.score?.key).toBe('C');
        expect(song.score?.sections[0].repeat).toBe(1);
        expect(song.score?.sections[0].measures).toHaveLength(12);
        expect(song.score?.sections[0].measures[3].content).toEqual({
            kind: 'repeat',
            measureId: 'ireal-1-bar-3',
            display: 'one-bar',
        });
        expect(decodeIRealMusic(fixture.expectedPositionalFields[6])).toBe(
            fixture.expectedUnscrambledBody,
        );
    });

    it('accepts the independent documented open-protocol fixture', () => {
        const parsed = parseIRealImport(fixtures.syntheticOpenProtocol.url);
        expect(parsed.format).toBe('irealbook');
        expect(parsed.songs[0].score?.sections[0].measures).toHaveLength(2);
        expect(parsed.songs[0].metadata.fields).toEqual(
            fixtures.syntheticOpenProtocol.expectedFields,
        );
    });

    it('keeps unpermuted 50- and 51-character final tails intact', () => {
        for (const length of [1, 49, 50, 51]) {
            const body = '0123456789'.repeat(6).slice(0, length);
            expect(decodeIRealMusic(`1r34LbKcu7${body}`)).toBe(body);
        }
    });

    it.each([
        ['D-', 'Dm'],
        ['D-7/F', 'Dm7/F'],
        ['A-6', 'Am6'],
        ['E-9', 'Em9'],
        ['C^', 'Cmaj7'],
        ['C^7/E', 'Cmaj7/E'],
        ['Bh', 'Bm7b5'],
        ['Bh7', 'Bm7b5'],
        ['B-7b5', 'Bm7b5'],
        ['Co', 'Cdim'],
        ['Co7', 'Cdim7'],
        ['Csus', 'Csus4'],
        ['C2', 'Csus2'],
    ])(
        'maps equivalent iReal shorthand %s into playable %s without dropping extensions',
        (written, canonical) => {
            const source = open(`T44[${written}   Z`);
            const parsed = parseIRealImport(source);
            expect(parsed.source).toBe(source);
            expect(parsed.songs[0].score).toBeDefined();
            const plan = prepareScorePlayback(parsed.songs[0].score);
            expect(plan.sections[0].measures[0].symbols).toEqual([canonical]);
        },
    );

    it.each([
        ['C   ', [[4, 1]]],
        [' C  ', [[4, 1]]],
        [
            'C G7 ',
            [
                [2, 1],
                [2, 1],
            ],
        ],
        [
            'C Dm,G7',
            [
                [2, 1],
                [1, 1],
                [1, 1],
            ],
        ],
        [
            'C,Dm,G7 ',
            [
                [1, 1],
                [1, 1],
                [2, 1],
            ],
        ],
        [
            'C  G7',
            [
                [3, 1],
                [1, 1],
            ],
        ],
        [
            'C,Dm,Em,F',
            [
                [1, 1],
                [1, 1],
                [1, 1],
                [1, 1],
            ],
        ],
    ])('retains verified exact cell spacing %s', (body, durations) => {
        const content = score(`T44[${body}Z`).sections[0].measures[0].content;
        expect(content.kind).toBe('events');
        if (content.kind === 'events') {
            expect(content.events.map((event) => event.duration)).toEqual(durations);
        }
    });

    it("rounds a 4/4 bar's under-filled cells to the meter's own beat count (#1453)", () => {
        // "C,Dm,G7" writes 3 chords with no spacing at all (3 raw cells in a 4-cell bar).
        // Established: infojunkie/ireal-musicxml converter.js's `adjustChordsDuration()` pads
        // (round-robin from the first chord) until the total hits `this.time.beats` (4 for 4/4),
        // NOT the bar's raw cell count — unlike the old proportional-width formula this replaces,
        // which refused this exact shape ("iReal rounding") because 4*1/3 isn't a whole number of
        // quarter notes. This is the SAME algorithm the multi-meter cases below use; 4/4 (beatUnit
        // 1) is not special-cased.
        const content = score('T44[C,Dm,G7Z').sections[0].measures[0].content;
        expect(content.kind).toBe('events');
        if (content.kind === 'events') {
            expect(content.events.map((event) => event.duration)).toEqual([
                [2, 1],
                [1, 1],
                [1, 1],
            ]);
        }
    });

    it.each([
        // 5/4: 1 chord over 4 raw cells plus 1 chord over 1 raw cell already total exactly 5 —
        // the meter's own beat count — so CELL_BEATS's default weight of 1 needs no round-robin
        // adjustment at all, unlike the other three cases here.
        [
            '5/4',
            'T54[C   DZ',
            [
                [4, 1],
                [1, 1],
            ],
        ],
        // 12/8: 4 chords, one raw cell each (already summing to the meter's 12-beat count via
        // CELL_BEATS['12/8'] = 3 — Converter.mapTime['12'] — with no round-robin adjustment
        // needed either), the classic "4 iReal cells = 4 dotted-quarter beats" reading.
        [
            '12/8',
            'T12[C,D,E,FZ',
            [
                [3, 2],
                [3, 2],
                [3, 2],
                [3, 2],
            ],
        ],
        // 6/4: 2 chords, 2 raw cells each (4 total, the usual grid), already summing to the
        // meter's own 6-beat count via the default weight of 1 — no adjustment needed.
        [
            '6/4',
            'T64[C  D  Z',
            [
                [3, 1],
                [3, 1],
            ],
        ],
    ])(
        'maps multi-chord cells in %s per the 4-cells-per-bar grid (#1453)',
        (_meter, body, durations) => {
            const content = score(body).sections[0].measures[0].content;
            expect(content.kind).toBe('events');
            if (content.kind === 'events') {
                expect(content.events.map((event) => event.duration)).toEqual(durations);
            }
        },
    );

    it.each(['3/4', '3/2', '6/8'])(
        'still refuses a multi-chord bar in %s — a scope decision, not a technical gap (#1453)',
        (meter) => {
            // `multiChordDurations` implements the cited algorithm generally, but
            // `SHIPPED_MULTI_CHORD_METERS` deliberately excludes these three: 3/4 and 3/2's 0.5
            // beat-per-cell weight makes a plain two-chord bar split 1.5+1.5, landing on the "and"
            // of beat 2 in most waltzes (measured at 168 of 181 such bars, 43 songs, across the
            // whole Jazz 1460 playlist) — the reference converter's own comment calls this
            // specific algorithm "unknown", so it isn't an established rule under #1171 without an
            // explicit by-ear check against iReal Pro's own playback. 6/8 has no real-playlist
            // multi-chord evidence at all. A single-chord bar in any of these three is unaffected
            // (see the "does not mistake..." and other single-event tests elsewhere in this file).
            const token = { '3/4': '34', '3/2': '32', '6/8': '68' }[meter];
            blocked(`T${token}[C F Z`);
        },
    );

    it('refuses more chords than a meter has beats for, rather than guessing a split', () => {
        // 5 chords cannot fit a 4/4 bar's 4 beats — established from converter.js's own guard,
        // `if (measure.chords.length > this.time.beats) { error(...); }`.
        blocked('T44[C,Dm,Em,F,G7Z');
    });

    it('refuses a multi-chord bar whose round-robin trim cannot converge', () => {
        // 5 chords in 12/8 (cellCounts.length = 5, within the 12-beat "too many chords" limit)
        // each start at the 1-cell floor, worth 3 beats apiece (CELL_BEATS['12/8'] = 3) — 15
        // total against a 12-beat target. Trimming needs to remove exactly 1 cell's worth (3
        // beats), but every cell is already at the floor — `multiChordDurations`'s trim loop only
        // decrements above (`adjusted[i] > 1`), so it can never converge; the bounded guard
        // refuses instead of looping forever.
        blocked('T12[C,D,E,F,GZ');
    });

    it('maps repeat barlines and alternate ending markers without unfolding the authored chart', () => {
        const result = score('T44*A{C   |N1F   }|N2G7  Z');
        const bars = result.sections[0].measures;
        expect(bars).toHaveLength(3);
        expect(bars[0].start).toEqual([{ kind: 'repeat-start' }]);
        expect(bars[0].annotations).toEqual([{ text: 'A', at: [0, 1], placement: 'above' }]);
        expect(bars[1].start).toEqual([{ kind: 'ending-start', passes: [1] }]);
        expect(bars[1].end).toEqual([{ kind: 'repeat-end', times: 2 }]);
        expect(bars[2].start).toEqual([{ kind: 'ending-start', passes: [2] }]);
    });

    it('retains a legitimate closing/opening double-bar boundary without fabricating a measure', () => {
        expect(score('T44[C   ][G7  Z').sections[0].measures).toHaveLength(2);
    });

    it('implicitly reopens a bar after a close with no reopening bracket (#1452)', () => {
        // Established: infojunkie/ireal-musicxml converter.js's `convertMeasures()` starts a new
        // measure whenever `!this.measure && (cell.chord || cell.annots.length ||
        // cell.comments.length)` — real content with no open measure opens one regardless of
        // `cell.bars` — and parser.js's tokenizer never assigns an opening mark to the cell right
        // after `]`/`}`/`Z` (only the PRECEDING cell's `.bars` gets the closing character).
        expect(score('T44[C   ]D   Z').sections[0].measures.map((bar) => bar.content)).toEqual([
            { kind: 'events', events: [{ kind: 'chord', symbol: 'C', duration: [4, 1] }] },
            { kind: 'events', events: [{ kind: 'chord', symbol: 'D', duration: [4, 1] }] },
        ]);
        expect(score('T44{C   }D   Z').sections[0].measures.map((bar) => bar.content)).toEqual([
            { kind: 'events', events: [{ kind: 'chord', symbol: 'C', duration: [4, 1] }] },
            { kind: 'events', events: [{ kind: 'chord', symbol: 'D', duration: [4, 1] }] },
        ]);
        // An implicit reopen gets a plain barline, same as the reference's empty `cell.bars`: no
        // repeat-start, unlike an explicit '{'.
        expect(score('T44{C   }D   Z').sections[0].measures[1].start).toBeUndefined();
    });

    it('does not disturb an explicitly reopened bar with a numbered ending (#1452 regression guard)', () => {
        // #1447 found that a naive implicit-reopen implementation broke this exact shape: an
        // ending-start marker on a bar that IS explicitly reopened by '|' right after the
        // preceding repeat-end '}'. The fix is scoped to real content arriving with no open bar
        // (checked lazily in `addCell`), so an explicit '|' here must leave this untouched.
        const bars = score('T44*A{C   |N1F   }|N2G7  Z').sections[0].measures;
        expect(bars).toHaveLength(3);
        expect(bars[1].end).toEqual([{ kind: 'repeat-end', times: 2 }]);
        expect(bars[2].start).toEqual([{ kind: 'ending-start', passes: [2] }]);
    });

    it('maps one- and two-bar repeats to their earlier authored sources', () => {
        const bars = score('T44[C   |F   | r |   |x   Z').sections[0].measures;
        expect(bars.slice(2).map((bar) => bar.content)).toEqual([
            { kind: 'repeat', measureId: bars[0].id, display: 'two-bar-start' },
            { kind: 'repeat', measureId: bars[1].id, display: 'two-bar-end' },
            { kind: 'repeat', measureId: bars[3].id, display: 'one-bar' },
        ]);
    });

    it('maps explicit repeat counts without confusing them with player chorus metadata', () => {
        const bars = score('T44{C   |F   <3x>}').sections[0].measures;
        expect(bars[1].end).toEqual([{ kind: 'repeat-end', times: 3 }]);
    });

    describe('repeat-count spellings (#1486)', () => {
        function imported(text: string) {
            const parsed = parseIRealImport(open(`T44{C   |F   <${text}>}`));
            const song = parsed.songs[0];
            expect(song.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
            return { song, closing: song.score!.sections[0].measures[1] };
        }
        const note = (text: string) =>
            `A staff-text instruction ("${text}") is preserved as text only; it is not applied to the performed order.`;

        // iReal's editor writes "Nx" (ireal-musicxml's converter maps "3x".."8x"); the Jazz 1460
        // playlist also writes "x3" (Harlequin), "3X" (Up With The Lark) and "Repeat 3x" (Speak
        // Like A Child); #1486 names "3 x", "Play 3x" and "3 times".
        it.each([
            ['3x', 3],
            ['3X', 3],
            ['x3', 3],
            ['X4', 4],
            ['3 x', 3],
            ['Repeat 3x', 3],
            ['repeat 5X', 5],
            ['Play 3x', 3],
            ['PLAY 4 x', 4],
            ['3 times', 3],
            ['4 Times', 4],
            ['64x', 64],
        ])(
            'reads "%s" as a repeat played %i times, with no leftover text or note',
            (text, times) => {
                const { song, closing } = imported(text);
                expect(closing.end).toEqual([{ kind: 'repeat-end', times }]);
                expect(closing.annotations).toBeUndefined();
                expect(song.diagnostics.map(({ message }) => message)).not.toContain(note(text));
            },
        );

        it.each([
            '3X (for solos only)', // Joshua, Jazz 1460
            'Solos x4', // Horace-Scope, Jazz 1460
            'x 3',
            'Repeat x3',
            '3 times then fade',
        ])('keeps the near-count "%s" as text, plays the repeat twice, and says so', (text) => {
            const { song, closing } = imported(text);
            expect(closing.end).toEqual([{ kind: 'repeat-end', times: 2 }]);
            expect(closing.annotations).toEqual([expect.objectContaining({ text })]);
            expect(song.diagnostics.map(({ message }) => message)).toContain(note(text));
        });

        it.each([
            '1st x slow', // ordinal prose, not a count (cf. Brilliant Corners, Jazz 1460)
            '(4xs)', // Butterfly, Jazz 1460
            'half x feel throughout', // Butterfly, Jazz 1460
            'Bb7x',
        ])('leaves "%s", which is not a count, as plain text with no note', (text) => {
            const { song, closing } = imported(text);
            expect(closing.end).toEqual([{ kind: 'repeat-end', times: 2 }]);
            expect(closing.annotations).toEqual([expect.objectContaining({ text })]);
            expect(song.diagnostics.map(({ message }) => message)).not.toContain(note(text));
        });

        it('refuses a newly read count outside 2-64 or away from a closing repeat, as for "3x"', () => {
            blocked('T44{C   |F   <Repeat 1x>}');
            blocked('T44{C   |F   <x65>}');
            blocked('T44{C   |F   <3 times>|G   }');
        });
    });

    it('preserves slash bass, alternate chords, fermata, N.C. and held events as distinct notation', () => {
        // Written as a PREFIX ("fC/E…"), per the Jazz 1460 playlist's own usage — see
        // ireal-score.ts's 'f' branch for the infojunkie/ireal-musicxml + pianosnake/ireal-reader
        // citation (#1451). A suffix immediately touching the same chord ("C/E(Dm7)f", this
        // fixture's original form) resolves to the SAME chord too — there's only one chord in the
        // bar for the backward fallback to land on — so it wasn't actually testing the prefix
        // rule; a real playlist chart never writes it that way, which is what this fixture now
        // pins.
        const bars = score('T44[fC/E(Dm7)   |n   |p   Z').sections[0].measures;
        expect(bars.map((bar) => bar.content)).toEqual([
            {
                kind: 'events',
                events: [
                    {
                        kind: 'chord',
                        symbol: 'C/E',
                        duration: [4, 1],
                        alternates: ['Dm7'],
                        fermata: true,
                    },
                ],
            },
            { kind: 'events', events: [{ kind: 'no-chord', duration: [4, 1] }] },
            { kind: 'events', events: [{ kind: 'hold', duration: [4, 1] }] },
        ]);
    });

    it('resolves the "W" invisible-root placeholder against the nearest preceding chord (#1452)', () => {
        // Established: infojunkie/ireal-musicxml converter.js's `case 'W':` copies the previous
        // chord's root+quality, then overwrites the copy's slash bass with W's own (dropping any
        // slash the copied chord had, when W specifies none) and its own alternate. parser.js's
        // `chordRegex2` gives W's grammar: an optional `/[A-G][#b]?` slash, then an optional
        // `(...)` alternate — the alternate needs no special handling, since a following "(...)"
        // is already picked up by this importer's own '(' branch.
        expect(score('T44[C  W  Z').sections[0].measures[0].content).toEqual({
            kind: 'events',
            events: [
                { kind: 'chord', symbol: 'C', duration: [2, 1] },
                { kind: 'chord', symbol: 'C', duration: [2, 1] },
            ],
        });
        expect(score('T44[C   ]W/EZ').sections[0].measures[1].content).toEqual({
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'C/E', duration: [4, 1] }],
        });
        expect(score('T44[C   ]W(D7)Z').sections[0].measures[1].content).toEqual({
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'C', duration: [4, 1], alternates: ['D7'] }],
        });
    });

    it('refuses "W" with no preceding chord to copy', () => {
        blocked('T44[W   Z');
    });

    it('refuses "W" right after N.C., rather than reaching past it to an older chord', () => {
        // Independent review finding: converter.js's `case 'n':` pushes N.C. into
        // `this.measure.chords` like any other chord (its `.note` is 'n', which isn't one of the
        // switch's special x/r/p/W/' ' cases), so W's own reverse search for "the nearest measure
        // with a chord" would try to copy the N.C. entry, not skip past it to the C before it.
        blocked('T44[C |n |W Z');
    });

    it('falls back to the preceding chord when a fermata is not immediately followed by one', () => {
        // A comma then only blank cells before the bar closes never gives the 'f' a chord to
        // group forward with. Per the same converter.js citation, `cell.annots.forEach` then
        // resolves it against `this.measure.chords[length-1]` — the chord already pushed earlier
        // in THIS bar — so it falls back onto the preceding chord instead (#1451; this exact
        // shape occurs in the Jazz 1460 playlist, e.g. "Chan's Song (Never Said)" and
        // "Locomotion", each as "<chord>,fXyQ").
        expect(score('T44[C   ,f   Z').sections[0].measures[0].content).toEqual({
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'C', duration: [4, 1], fermata: true }],
        });
        // The immediately-adjacent suffix form (the pre-#1451 assumption) still resolves the same
        // way, for the same reason: nothing follows 'f' to group forward with.
        expect(score('T44[Cf Z').sections[0].measures[0].content).toEqual({
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'C', duration: [4, 1], fermata: true }],
        });
    });

    it('refuses a fermata with no chord before or after it in the same bar', () => {
        // converter.js's fallback reads `this.measure.chords[this.measure.chords.length-1]` —
        // an array that is fresh per measure — so with nothing pushed yet in this bar, the
        // reference itself would index a nonexistent element. Refuse rather than reach into an
        // earlier bar the reference can't reach either (#1451).
        blocked('T44[f   Z');
    });

    it('resolves a blank cell between a fermata and the next chord backward, never skipping forward to it', () => {
        // Independent review finding: an earlier version of this fix let a pending fermata skip
        // over a blank cell and land on the chord AFTER it. Per the same citation, a blank cell
        // (a space — parser.js's `chordRegex2` matches it as its own chord-array token) is decided
        // the instant it arrives, exactly like the comma-then-blanks case above: it becomes the
        // "Chords." step for whatever cell the pending 'f' is sharing, and a blank chord pushes
        // nothing, so "Other attributes." resolves the fermata against what was ALREADY there —
        // the preceding chord — not whatever comes next.
        expect(score('T44[Cf D |G Z').sections[0].measures[0].content).toEqual({
            kind: 'events',
            events: [
                { kind: 'chord', symbol: 'C', duration: [2, 1], fermata: true },
                { kind: 'chord', symbol: 'D', duration: [2, 1] },
            ],
        });
    });

    it("carries a fermata across a bar line to the next bar's first chord, never resolving early", () => {
        // Established: a bar-boundary character is TRANSPARENT to a pending fermata (see
        // `pendingFermata`'s declaration) — parser.js's '|'/'['/'{' cases leave the currently-open
        // cell untouched, and ']'/'}' /'Z' only touch the PREVIOUS cell, so none of them force
        // resolution. A lone chord before the bar line (no trailing blank) keeps this bar's own
        // duration split untouched by the fermata, isolating the cross-bar-carry behavior from
        // this importer's cell-count-to-duration mapping.
        const bars = score('T44[Cf|G Z').sections[0].measures;
        expect(bars[0].content).toEqual({
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'C', duration: [4, 1] }],
        });
        expect(bars[1].content).toEqual({
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'G', duration: [4, 1], fermata: true }],
        });
    });

    it('refuses a fermata with nothing left to attach to at the very end of the chart', () => {
        // The reference converter would index `this.measure.chords[-1]` on nothing (an "OPEN"
        // measure that never closes) — a crash, not a silently-dropped fermata. Refuse with a
        // dedicated reason instead of falling through to the generic incomplete-chart message.
        blocked('T44[C D fZ');
    });

    it('does not mistake official parenthesized chord qualities for alternate chords', () => {
        const content = score('T44[Cmaj(add4)   Z').sections[0].measures[0].content;
        expect(content).toEqual({
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'Cmaj(add4)', duration: [4, 1] }],
        });
    });

    it('treats the documented "U" player marker as an annotation, not a synthesized jump', () => {
        // "U" marks END on the final chorus (infojunkie/ireal-musicxml converter.js treats it as
        // Fine; pianosnake calls it "Ending measure for player"). The loop form is unaffected —
        // it is kept as text, not built into a jump — with exactly one note for the song.
        const source = open('T44[C UZ');
        const parsed = parseIRealImport(source);
        const song = parsed.songs[0];
        expect(song.score?.sections[0].measures[0].content).toEqual({
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'C', duration: [4, 1] }],
        });
        expect(song.score?.sections[0].measures[0].annotations).toEqual([
            { text: 'U', at: [4, 1], placement: 'below' },
        ]);
        expect(
            song.diagnostics.filter((entry) => entry.message.includes('end-of-performance')),
        ).toHaveLength(1);
    });

    it('drops an alternate chord with nowhere to attach and notes it, instead of blocking the song', () => {
        const source = open('T44[C (Dm) Z');
        const parsed = parseIRealImport(source);
        const song = parsed.songs[0];
        expect(song.score?.sections[0].measures[0].content).toEqual({
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'C', duration: [4, 1] }],
        });
        expect(song.diagnostics).toContainEqual(
            expect.objectContaining({
                severity: 'warning',
                message: expect.stringContaining('dropped'),
            }),
        );
    });

    it('retains sticky written meter changes at the next measure boundary', () => {
        const result = score('T44[C   T34|F   |G7  Z');
        expect(result.meter).toBe('4/4');
        expect(result.sections[0].measures[1].meter).toBe('3/4');
        expect(result.sections[0].measures[2].content).toEqual({
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'G7', duration: [3, 1] }],
        });
    });

    it.each(['C', 'S'])('maps unambiguous D.%s. al Fine at the final barline', (from) => {
        const bars = score(`T44[${from === 'S' ? 'S' : ''}C   <Fine>|F   <D.${from}. al Fine>Z`)
            .sections[0].measures;
        expect(bars[1].end).toContainEqual({
            kind: 'jump',
            from: from === 'C' ? 'start' : 'segno',
            repeats: 'skip',
            ...(from === 'S' ? { segno: 'segno-1' } : {}),
            destination: { kind: 'fine', label: 'fine-1' },
        });
    });

    it.each(['D.C. al coda', 'D.C. al CODA', ' D.S. al Coda ', '  D.S. al coda'])(
        'maps a "%s" al Coda variant that differs only in case or whitespace, not just the exact spelling',
        (phrase) => {
            // 6 Jazz 1460 songs write this with different casing/whitespace than the exact
            // "D.C./D.S. al Fine/Coda" spelling; trim + match case-insensitively so they map onto
            // real navigation instead of falling to the unmapped-text annotation (#1447 review).
            const from = phrase.trim().startsWith('D.S.') ? 'S' : 'C';
            const source = open(
                `T44[C   |${from === 'S' ? 'S' : ''}F   Q|G7   <${phrase}>Z[QD7   Z`,
            );
            const parsed = parseIRealImport(source);
            const song = parsed.songs[0];
            // Exactly the one standard warning every import gets — no "preserved as text" note,
            // proving this mapped onto real navigation rather than merely avoiding a hard block.
            expect(song.diagnostics).toHaveLength(1);
            expect(song.score?.sections[0].measures[2].end).toContainEqual(
                expect.objectContaining({
                    kind: 'jump',
                    destination: expect.objectContaining({ kind: 'coda' }),
                }),
            );
        },
    );

    it.each([
        ['XyQ Fine', '<XyQ Fine>'],
        ['XyQFine (no space, The Chicken)', '<XyQFine>'],
    ])(
        'expands the compressed empty-cell token inside staff text before reading it: %s',
        (_label, tag) => {
            // Moon Rays writes "XyQ Fine" and The Chicken writes "XyQFine" — the established
            // substitution (infojunkie/ireal-musicxml's unscramble()) is a blind string replace over
            // the whole body, not cell-scoped, so it applies inside staff text too (#1447 review).
            // Modern-only (the substitution is a modern-export compression), so this needs the
            // irealb encoding, not the open-protocol `open()` helper above.
            const song = modernScore(`T44[C   ${tag}|F   <D.C. al Fine>Z`);
            expect(song.score?.sections[0].measures[0].end).toEqual([
                { kind: 'fine', label: 'fine-1' },
            ]);
            expect(song.score?.sections[0].measures[1].end).toContainEqual({
                kind: 'jump',
                from: 'start',
                repeats: 'skip',
                destination: { kind: 'fine', label: 'fine-1' },
            });
        },
    );

    it('drops a raised editorial tag that normalizes to nothing, instead of failing the chart', () => {
        // A raised tag with only whitespace inside it (e.g. iReal's "<*66  >") trims to an empty
        // string, which the score's display-text validator rejects outright — unlike the
        // original untrimmed whitespace, which passed harmlessly. Confirmed against real Jazz
        // 1460 songs (Cabin in the Sky, I'll Never Smile Again, Lonely Woman) that regressed when
        // trimming staff text was added for #1447's case/whitespace fix.
        const content = score('T44[C<*66  >   Z').sections[0].measures[0];
        expect(content.content).toEqual({
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'C', duration: [4, 1] }],
        });
        expect(content.annotations).toBeUndefined();
    });

    it('refuses a chart where unrelated playback text ("Break") would otherwise silence a real orphaned sign', () => {
        // P1 regression (#1447 review): a broad playback-keyword match must never relax the
        // unpaired-marker check — only text that genuinely REFERENCES a Fine/Coda/Segno marker
        // or a numbered ending may do that. Real charts hitting this: Horace-Scope and Mc Jolt
        // (their departure is inside a repeat). A lone segno is never mapped, so it is still
        // refused beside the text.
        blocked('T44[SC   |F   |G7 <Break>  |C   Z');
    });

    it('does not let unrelated playback text ("Break") turn a coda pair into inert text (#1476)', () => {
        // The #1447 regression above, with the coda pair #1476 maps (Aisha, Liberia): "Break"
        // must not relax the pair into ignored signs, so it is still read as a last-chorus coda.
        const measures = score('T44[C   |F   Q|G7 <Break>  |C   Z[QD7   |G7   Z').sections[0]
            .measures;
        expect(measures[1].end).toContainEqual(expect.objectContaining({ kind: 'last-chorus' }));
    });

    describe('coda signs with no jump text (#1476)', () => {
        const UNPAIRED = 'Bar 1: Unpaired navigation symbols need an explicit supported jump.';
        // Head C F G7 C, the departure at the end of bar 2; a two-bar coda D7 G7 from bar 5.
        const tag = 'T44[C   |F   Q|G7   |C   Z[QD7   |G7   Z';

        it('maps a departure at the end of a bar and a later coda at the start of one to a last-chorus coda', () => {
            const parsed = parseIRealImport(open(tag));
            const song = parsed.songs[0];
            const result = song.score!;
            // No chorus count on import: the musician sets one in the Edit panel.
            expect(result.choruses).toBeUndefined();
            const measures = result.sections[0].measures;
            expect(measures[1].end).toEqual([
                { kind: 'coda', label: 'coda-1' },
                {
                    kind: 'last-chorus',
                    destination: { kind: 'coda', via: 'coda-1', target: 'coda-2' },
                },
            ]);
            expect(measures[4].start).toEqual([{ kind: 'coda', label: 'coda-2' }]);
            expect(song.diagnostics.map(({ message }) => message)).toEqual([
                'The coda at bar 5 is played once, at the end: with a chorus count set, the last chorus jumps to it from the end of bar 2. Until then the form loops without it.',
                'The stored key is used. iReal style is preserved as text, not applied as an Ensemble genre.',
            ]);
            const order = (choruses?: number) =>
                prepareScorePlayback({ ...result, ...(choruses ? { choruses } : {}) }).visits.map(
                    ({ chorus, measureIndex }) => `${chorus}:${measureIndex + 1}`,
                );
            // Uncounted, the coda is never reached; counted, only the last chorus takes it.
            expect(order()).toEqual(['0:1', '0:2', '0:3', '0:4']);
            expect(order(2)).toEqual(['0:1', '0:2', '0:3', '0:4', '1:1', '1:2', '1:5', '1:6']);
        });

        it.each([
            // iReal's other form: only the coda section is marked. A last-chorus coda departs
            // from a written sign, and this chart has none to depart from.
            ['a lone coda sign at the start of a bar', 'T44[C   |F   Z[QD7   |G7   Z'],
            ['a lone departure sign', 'T44[C   |F   Q|G7   Z'],
            ['both signs at the start of a bar', 'T44[QC   |F   Z[QD7   |G7   Z'],
            ['both signs at the end of a bar', 'T44[C   Q|F   Z[D7   Q|G7   Z'],
            ['a coda target before its departure', 'T44[QC   |F   Q|G7   Z'],
            ['three coda signs', 'T44[C   Q|F   Q|G7   Z[QD7   |G7   Z'],
            ['a Fine beside the pair', 'T44[C   <Fine>|F   Q|G7   Z[QD7   |G7   Z'],
            ['a segno beside the pair', 'T44[SC   |F   Q|G7   Z[QD7   |G7   Z'],
            ['a Fine for a departure', 'T44[C   |F   <Fine>|G7   Z[QD7   |G7   Z'],
            // The score form refuses a last-chorus departure inside a repeat (which pass is the
            // last time?), so the import is read again as before and refused as before.
            ['a departure inside a repeat', 'T44{C   |F   Q}[G7   Z[QD7   |G7   Z'],
            // Passed once, but the last chorus would leave the repeat on pass 1 (#1476 review).
            [
                'a departure inside a first ending',
                'T44{C   |F   |N1G7   Q}|N2G7   |C   Z[QD7   |G7   Z',
            ],
            [
                'a departure inside a one-bar first ending',
                'T44{C   |N1F   Q}|N2G7   ][QD7   |G7   Z',
            ],
        ])('still refuses %s, as before #1476', (_, body) => {
            const song = parseIRealImport(open(body)).songs[0];
            expect(song.score).toBeUndefined();
            expect(song.diagnostics).toEqual([
                expect.objectContaining({ severity: 'error', message: UNPAIRED }),
            ]);
        });

        it('names the blocker a mapped pair leaves, not the signs it no longer has to refuse', () => {
            // Eight Jazz 1460 charts ("Very Early") carry the pair and multi-chord bars in a meter
            // the importer doesn't time yet (#1453): the refusal is now that bar, which is what's
            // in the way.
            const song = parseIRealImport(open('T34[C   |F   Q|D G7 |C   Z[QD7   Z')).songs[0];
            expect(song.score).toBeUndefined();
            expect(song.diagnostics).toEqual([
                expect.objectContaining({
                    severity: 'error',
                    message:
                        'Bar 3: Multi-chord cell timing in this meter needs a verified import mapping.',
                }),
            ]);
        });

        it('leaves a coda pair beside coda prose as the ignored signs it was (I Got Rhythm)', () => {
            // "Original takes Coda every time" says when the coda is taken, and not on the last
            // chorus only: the signs stay inert, each named, never a guessed last-chorus coda.
            const parsed = parseIRealImport(
                open('T44[C   |F   Q|G7 <Original takes Coda every time>|C   Z[QD7   |G7   Z'),
            );
            const song = parsed.songs[0];
            const measures = song.score!.sections[0].measures;
            expect(measures.flatMap((measure) => measure.end ?? [])).not.toContainEqual(
                expect.objectContaining({ kind: 'last-chorus' }),
            );
            const messages = song.diagnostics.map(({ message }) => message);
            expect(messages).toContain(
                'The coda sign in bar 2 has no supported jump and is ignored.',
            );
            expect(messages).toContain(
                'The coda sign in bar 5 has no supported jump and is ignored.',
            );
        });
    });

    it('caps the notes list so a pathological chart cannot produce an unbounded number of warnings', () => {
        // 25 distinct staff-text warnings, plus the importer's own standard warning: bounded to
        // 20 notes (19 kept + one "…and N more" summary) plus that standard warning, not 26.
        const source = open(`T44[${'C <Break>   |'.repeat(25)}C   Z`);
        const parsed = parseIRealImport(source);
        const song = parsed.songs[0];
        expect(song.score).toBeDefined();
        expect(song.diagnostics).toHaveLength(21);
        expect(
            song.diagnostics.filter((entry) => /…and \d+ more\.$/.test(entry.message)),
        ).toHaveLength(1);
    });

    it('aggregates many ownerless alternate chords into a single bounded note, not one per occurrence', () => {
        // The reviewed attack: repeating "(D)" thousands of times must not produce thousands of
        // diagnostics.
        const source = open(`T44[${'C (D)   |'.repeat(15)}C   Z`);
        const parsed = parseIRealImport(source);
        const song = parsed.songs[0];
        expect(song.score).toBeDefined();
        expect(song.diagnostics).toContainEqual(
            expect.objectContaining({
                severity: 'warning',
                message:
                    '15 alternate chords with nothing to attach to were dropped from the import.',
            }),
        );
    });

    // A head bar, a repeat with two endings, then a bridge whose text sits a bar before the
    // closing barline. The Fine is in the ending the jump takes.
    const second = (text: string) => `T44[D   |{C   |N1F   }|N2G   <Fine>]|E7 <${text}>|A7   Z`;
    it.each([
        ['D.C. al 2nd End.', 'start', 2, second('D.C. al 2nd End.')],
        ['D.C. al 2nd ending', 'start', 2, second('D.C. al 2nd ending')],
        ['d.c. al 2nd end.', 'start', 2, second('d.c. al 2nd end.')],
        ['D.S. al 2nd End.', 'segno', 2, second('D.S. al 2nd End.').replace('[D', '[SD')],
        [
            'D.C. al 1st Ending',
            'start',
            1,
            'T44[D   |{C   |N1F   <Fine>}|N2G   ]|E7 <D.C. al 1st Ending>|A7   Z',
        ],
    ])('maps "%s" to an al-ending jump (#1473)', (_, from, pass, body) => {
        const measures = score(body).sections[0].measures;
        // The jump takes effect at the closing barline, a bar after its text.
        expect(measures.at(-1)?.end).toEqual([
            {
                kind: 'jump',
                from,
                ...(from === 'segno' ? { segno: 'segno-1' } : {}),
                destination: { kind: 'ending', pass },
                repeats: 'skip',
            },
        ]);
        expect(measures.at(-2)?.annotations).toBeUndefined();
    });

    it('performs a mapped D.C. al 2nd End. through the shared score form', () => {
        const body = 'T44{C   |N1F   }|N2G   <Fine>]|E7   <D.C. al 2nd End.>|A7   Z';
        const parsed = parseIRealImport(open(body));
        const song = parsed.songs[0];
        expect(song.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
        const plan = prepareScorePlayback(song.score);
        // C F | C G | E7 A7 | D.C.: C G, Fine.
        expect(plan.visits.map(({ measureIndex }) => measureIndex)).toEqual([
            0, 1, 0, 2, 3, 4, 0, 2,
        ]);
    });

    it.each([
        // No Fine to stop at.
        ['T44{C   |N1F   }|N2G   ]|E7 <D.C. al 2nd End.>|A7   Z', []],
        // A coda sign beside it (Round Midnight's written outro): which ends the form is unsourced.
        [
            'T44{C   |N1F   }|N2G   <Fine>]|E7 <D.C. al 2nd End.>|A7   ][QD7   Z',
            ['The coda sign in bar 6'],
        ],
        // A sign between the text and the closing barline it would take effect at.
        ['T44{C   |N1F   }|N2G   ]|E7 <D.C. al 2nd End.>|A7   <Fine>Z', []],
    ])(
        'keeps an al-ending it cannot apply as inert text with its note, as before #1473: %s',
        (body, orphans) => {
            const parsed = parseIRealImport(open(body));
            const song = parsed.songs[0];
            expect(song.score).toBeDefined();
            const measures = song.score!.sections[0].measures;
            expect(measures.flatMap((measure) => measure.end ?? [])).not.toContainEqual(
                expect.objectContaining({ kind: 'jump' }),
            );
            expect(measures[3].annotations).toEqual([
                expect.objectContaining({ text: 'D.C. al 2nd End.', placement: 'below' }),
            ]);
            const messages = song.diagnostics.map(({ message }) => message);
            expect(messages).toContain(
                'A staff-text instruction ("D.C. al 2nd End.") is preserved as text only; it is not applied to the performed order.',
            );
            for (const orphan of orphans) {
                expect(messages).toContainEqual(expect.stringContaining(orphan));
            }
        },
    );

    it('imports a chart with a "D.C. al Nth ending" it cannot apply as text, with a warning, rather than blocking it', () => {
        // No repeat and no Fine: the instruction cannot be applied (#1473), so it stays the
        // inert text it always was, never a guessed jump or a refused chart.
        const source = open('T44[C   |F   <D.C. al 2nd ending>Z');
        const parsed = parseIRealImport(source);
        const song = parsed.songs[0];
        expect(song.score?.sections[0].measures).toHaveLength(2);
        expect(song.score?.sections[0].measures[1].end).toBeUndefined();
        expect(song.score?.sections[0].measures[1].annotations).toEqual([
            { text: 'D.C. al 2nd ending', at: [4, 1], placement: 'below' },
        ]);
        expect(song.diagnostics).toContainEqual(
            expect.objectContaining({
                severity: 'warning',
                message: expect.stringContaining('D.C. al 2nd ending'),
            }),
        );
    });

    // #1473 review: an al-ending the importer does not apply must import exactly as it did before
    // #1473. "D.C. al 4th ending" names no iReal ending, so it takes the unchanged inert-text path
    // on both sides; with the ordinals normalized, the two imports must match byte for byte.
    function expectImportedAsBefore(body: string) {
        const now = parseIRealImport(open(body));
        const before = parseIRealImport(open(body.replace(/ al (1st|2nd|3rd) /g, ' al 4th ')));
        expect(now.songs[0].score).toBeDefined();
        expect(now.songs[0].diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
        expect(
            now.songs[0].score!.sections[0].measures.flatMap((measure) => measure.end ?? []),
        ).not.toContainEqual(
            expect.objectContaining({
                kind: 'jump',
                destination: expect.objectContaining({ kind: 'ending' }),
            }),
        );
        const normalized = (value: unknown) =>
            JSON.stringify(value).replace(/ al (1st|2nd|3rd|4th) /g, ' al Nth ');
        expect(normalized(now)).toBe(normalized({ ...before, source: now.source }));
        return now.songs[0];
    }

    it.each([
        [
            'another repeat before the return reaches the taken one (an intro vamp)',
            'T44{D   |D   }[C   |{C   |N1F   }|N2G   <Fine>]|E7 <D.C. al 2nd ending>|A7   Z',
        ],
        [
            'a vamp between the return point and the taken repeat',
            'T44[C   |{D   |D   }|{C   |N1F   }|N2G   <Fine>]|E7 <D.C. al 2nd ending>|A7   Z',
        ],
        [
            'a later repeat with the same ending (ambiguous)',
            'T44{C   |N1F   }|N2G   <Fine>]{D   |N1E   }|N2A   ]|E7 <D.C. al 2nd ending>|A7   Z',
        ],
        [
            'its Fine in the repeat body, before ending 2',
            'T44{C   <Fine>|N1F   }|N2G   ]|E7 <D.C. al 2nd ending>|A7   Z',
        ],
        [
            'no numbered ending at all (invalid authored data)',
            'T44{C   |F   }|G   <Fine>]|E7 <D.C. al 2nd ending>|A7   Z',
        ],
    ])('imports as before when the score form refuses the al-ending: %s', (_, body) => {
        // The importer's own checks pass; the shared score form refuses the route, so the import
        // is read again with the al-ending as text instead of being refused.
        expectImportedAsBefore(body);
    });

    it.each([
        // The text sits on the closing bar itself, or one bare bar before it (Cherokee).
        ['on the closing bar', 'T44{C   |N1F   }|N2G   <Fine>]|E7   |A7 <D.C. al 2nd ending>Z', 4],
        ['one bar before it', 'T44{C   |N1F   }|N2G   <Fine>]|E7 <D.C. al 2nd ending>|A7   Z', 4],
    ])('applies an al-ending whose text is %s', (_, body, jumpBar) => {
        const measures = score(body).sections[0].measures;
        expect(measures[jumpBar].end).toEqual([
            expect.objectContaining({ kind: 'jump', destination: { kind: 'ending', pass: 2 } }),
        ]);
    });

    it.each([
        [
            'two bars before the closing barline',
            'T44{C   |N1F   }|N2G   <Fine>]|E7 <D.C. al 2nd ending>|A7   |D7   Z',
        ],
        [
            'a rehearsal mark on the next bar',
            'T44{C   |N1F   }|N2G   <Fine>][*BE7   |A7 <D.C. al 2nd ending>|*CD7   Z',
        ],
        [
            'a meter change on the next bar',
            'T44{C   |N1F   }|N2G   <Fine>]|E7 <D.C. al 2nd ending>|T34A7   Z',
        ],
        [
            'staff text on the next bar',
            'T44{C   |N1F   }|N2G   <Fine>]|E7 <D.C. al 2nd ending>|A7 <rit.>Z',
        ],
        [
            'a sign on the next bar',
            'T44{C   |N1F   }|N2G   <Fine>]|E7 <D.C. al 2nd ending>|QA7   Z',
        ],
    ])('keeps the al-ending as text when its closing barline lies past %s', (_, body) => {
        expectImportedAsBefore(body);
    });

    it('keeps two al-endings in one bar as text: which one holds would be a guess', () => {
        // Either alone would apply to this chart (a segno, a repeat with two endings, a Fine).
        const song = expectImportedAsBefore(
            'T44[SD   |{C   |N1F   }|N2G   <Fine>]|E7   |A7 <D.C. al 2nd ending><D.S. al 2nd ending>Z',
        );
        expect(song.score!.sections[0].measures[5].annotations).toHaveLength(2);
    });

    it.each([
        ['after', '<D.C. al Fine><D.C. al 2nd ending>'],
        ['before', '<D.C. al 2nd ending><D.C. al Fine>'],
    ])('keeps an al-ending %s an al Fine in its bar as text, applying the al Fine', (_, texts) => {
        const song = expectImportedAsBefore(`T44[SC   <Fine>|E7   |A7 ${texts}Z`);
        expect(song.score!.sections[0].measures[2].end).toEqual([
            expect.objectContaining({
                kind: 'jump',
                destination: { kind: 'fine', label: 'fine-1' },
            }),
        ]);
    });

    it('keeps the import notes in their written order when two al-endings stay text', () => {
        const song = expectImportedAsBefore(
            'T44{C   |N1F   }|N2G   <Fine>]|E7 <D.C. al 2nd ending>|A7 <rit.>|D7 <D.S. al 1st ending>Z',
        );
        expect(song.diagnostics.map(({ message }) => message).slice(0, 3)).toEqual([
            'A staff-text instruction ("D.C. al 2nd ending") is preserved as text only; it is not applied to the performed order.',
            'A staff-text instruction ("rit.") is preserved as text only; it is not applied to the performed order.',
            'A staff-text instruction ("D.S. al 1st ending") is preserved as text only; it is not applied to the performed order.',
        ]);
    });

    it.each([
        [
            'beside another jump in the chart',
            'T44[C   <Fine>|D <D.C. al 2nd ending>|E7 <D.C. al Fine>Z',
        ],
        [
            'as a D.S. with no segno',
            'T44{C   |N1F   }|N2G   <Fine>]|E7 <D.S. al 2nd ending>|A7   Z',
        ],
        [
            'as a D.S. with two segnos',
            'T44[SD   |{C   |N1F   }|N2G   <Fine>]|SE7 <D.S. al 2nd ending>|A7   Z',
        ],
    ])('keeps an al-ending as text %s', (_, body) => {
        expectImportedAsBefore(body);
    });

    it('imports a chart with a free-text playback-flavored comment as a note, rather than blocking it', () => {
        const source = open('T44[C <Bass break>Z');
        const parsed = parseIRealImport(source);
        const song = parsed.songs[0];
        expect(song.score?.sections[0].measures[0].annotations).toEqual([
            { text: 'Bass break', at: [4, 1], placement: 'below' },
        ]);
        expect(song.diagnostics).toContainEqual(
            expect.objectContaining({
                severity: 'warning',
                message: expect.stringContaining('Bass break'),
            }),
        );
    });

    it('maps coda departure after music separately from coda arrival before music', () => {
        const bars = score('T44[C   Q|F   <D.C. al Coda>Z[QG7  Z').sections[0].measures;
        expect(bars[0].end).toEqual([{ kind: 'coda', label: 'coda-1' }]);
        expect(bars[2].start).toEqual([{ kind: 'coda', label: 'coda-2' }]);
        expect(bars[1].end).toContainEqual({
            kind: 'jump',
            from: 'start',
            repeats: 'skip',
            destination: { kind: 'coda', via: 'coda-1', target: 'coda-2' },
        });
    });

    it.each([
        'T44[C,Dm,Em,F,G7Z',
        'T44[C | |G7 Z',
        'T44[CunknownZ',
        'T44[C Kcl Z',
        'T44[C LZ',
        'T44[C7',
        'T44[x Z',
        'T44[C |r Z',
        'T44[C |F |r Z',
        'T44[C |F |r |G7 Z',
        'T44[W/C Z',
        'T44[C (Dm Z',
        'T44{C <Fine>|F <D.C. al Fine>}Z',
        'T44[C <D.C. al Fine>Z',
        'T44[C <Fine>|F <D.C. al Fine>|G7Z',
        'T44[QC|F <D.C. al Coda>Z[QG7Z',
        '[C Z',
        'T44[N0C Z',
        'T44[C<unclosed Z',
    ])('blocks unsupported, ambiguous or incomplete music without a partial score: %s', blocked);

    it('treats a double barline as the manuscript line-break convention, not a lost measure', () => {
        // Established: pianosnake/ireal-reader's Parser.js `createNewMeasure()` only inserts a
        // new blank measure "unless the last measure is a blank" — a second consecutive barline
        // (bare, or one expanded from a compressed "LZ") is always a no-op (#1447). This is what
        // let All Blues import at all: its written body compresses to "...LZ x LZ x LZ|G7...".
        expect(score('T44[C   ||G7  Z').sections[0].measures).toHaveLength(2);
    });

    it.each([
        'T44[C   |Z',
        'T44[C   |]',
        'T44[C   ][Z',
        'T44[C   ][]',
        'T44[C   |  Z',
        'T44[C   Z<D.C. al Fine>',
        'T44[C   Z<4x>',
        'T44[C   ZT34',
        'T44[C   T34Z',
        'T44{C   Z',
        'T44{{C   }',
        'T44{C   |N1F   }',
    ])(
        'does not erase terminal empty measures, dangling context/commands or invalid form: %s',
        blocked,
    );

    it('handles HTML as inert data and only extracts actual quoted anchor links', () => {
        const url = open('T44[C Z', 'A & B');
        const source = `<html><script>"<a href="${open('T44[F Z')}">trap</a>"</script><!-- <a href="${open('T44[G Z')}"> --> <img src="https://invalid.test/image"><a HREF='${url}'>Chart</a></html>`;
        const parsed = parseIRealImport(source);
        expect(parsed.source).toBe(source);
        expect(parsed.songs).toHaveLength(1);
        expect(parsed.songs[0].title).toBe('A & B');
        expect(parsed.songs[0].score).toBeDefined();
    });

    it('decodes HTML references once and never decodes plus as form-url-encoded space', () => {
        const source = `<a href="${open('T44[C+ Z', 'A&B').replace('%26', '&#38;')}">Chart</a>`;
        const song = parseIRealImport(source).songs[0];
        expect(song.title).toBe('A&B');
        expect(song.score?.sections[0].measures[0].content).toEqual({
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'C+', duration: [4, 1] }],
        });
    });

    it('does not mistake a script closing-tag prefix for the actual raw-text end', () => {
        const source = `<script></scripture><a href="${open('T44[F Z')}">fake</a></script><a href="${open('T44[C Z', 'Real')}">real</a>`;
        const parsed = parseIRealImport(source);
        expect(parsed.songs.map((song) => song.title)).toEqual(['Real']);
    });

    it('returns every song and preserves modern empty fields in a playlist', () => {
        const one = fixtures.realExport.sanitizedUrl.slice('irealb://'.length);
        const source = `irealb://${one}===${one.replace('Blues%20fixture', 'Another%20fixture')}===Practice`;
        const parsed = parseIRealImport(source);
        expect(parsed.songs).toHaveLength(2);
        expect(parsed.songs.map((song) => song.title)).toEqual([
            'Blues fixture',
            'Another fixture',
        ]);
        expect(parsed.songs.every((song) => song.score)).toBe(true);
        expect(parsed.songs[1].metadata.fields[2]).toBe('');
        expect(parsed.songs[0].score?.sections[0].measures[0].id).not.toBe(
            parsed.songs[1].score?.sections[0].measures[0].id,
        );
    });

    it('returns an open-protocol playlist with per-song diagnostics, never silently choosing the first', () => {
        const first = ['One', '', '', 'C', 'n', 'T44[C Z'];
        const second = ['Two', '', '', 'C', 'n', 'T44[C unknown Z'];
        const parsed = parseIRealImport(
            `irealbook://${encodeURIComponent([...first, ...second, 'Practice'].join('='))}`,
        );
        expect(parsed.songs).toHaveLength(2);
        expect(parsed.songs[0].score).toBeDefined();
        expect(parsed.songs[1].score).toBeUndefined();
    });

    it.each([
        'irealb://search?Blues',
        'irealbook://Bad%ZZ',
        'irealbook://Bad%FF',
        'https://invalid.test/chart',
        '<script>irealb://ignored</script>',
        '<a href=irealb://unquoted>link</a>',
        '<a href="irealb://one" href="irealb://two">',
        '<a href="irealb://&constructor;">',
        '<!-- unclosed',
        '<a href="irealb://unterminated',
    ])('returns a source-preserving diagnostic for malformed envelopes: %s', (source) => {
        const parsed = parseIRealImport(source);
        expect(parsed.source).toBe(source);
        expect(parsed.songs).toEqual([]);
        expect(parsed.diagnostics[0]?.severity).toBe('error');
    });

    it.each(['<script>unsafe</script>', 'unsafe\u0000title', 'x'.repeat(161)])(
        'rejects unsafe display metadata: %s',
        (title) => {
            const parsed = parseIRealImport(open('T44[C Z', title));
            expect(parsed.songs[0].score).toBeUndefined();
            expect(parsed.songs[0].title).toBe('Imported song 1');
            expect(parsed.songs[0].metadata.fields[0]).toBe(title);
        },
    );

    it('never treats prototype names as musical keys or special metadata fields', () => {
        const parsed = parseIRealImport(open('T44[C Z', 'constructor', '__proto__'));
        expect(parsed.songs[0].title).toBe('constructor');
        expect(parsed.songs[0].score).toBeUndefined();
        expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('enforces source-byte, song, bar and cell bounds', () => {
        for (const source of ['x'.repeat(1_048_577), '🎵'.repeat(262_145)]) {
            expect(parseIRealImport(source).diagnostics[0]?.message).toContain('1 MiB');
        }
        // #1478: a playlist imports whole, so the song cap is the account's (2,000), not 64.
        const links = (length: number) =>
            Array.from({ length }, () => `<a href="${open('T44[C Z')}">song</a>`).join('');
        expect(parseIRealImport(links(2_001)).diagnostics[0]?.message).toContain(
            'at most 2,000 songs',
        );
        const atCap = parseIRealImport(links(2_000));
        expect(atCap.diagnostics).toEqual([]);
        expect(atCap.songs).toHaveLength(2_000);
        blocked(`T44[${'C|'.repeat(4096)}C Z`);
        blocked(`T44[C${' '.repeat(64)}Z`);
    });

    it('bounds the performed repeat route before returning a score', () => {
        blocked(`T44{${'C|'.repeat(300)}C<64x>}`);
    });

    it('bounds total written measures across multiple valid songs', () => {
        // 4,096 bars a song (the per-song bound): sixteen is exactly the import-wide cap of
        // 65,536 and lands; one more one-bar song passes it, and the whole import is refused —
        // never truncated to the songs that fit (#1478 review R7: the boundary itself, pinned).
        expect(MAX_IMPORT_MEASURES).toBe(65_536);
        const full = open(`T44[${'C|'.repeat(4095)}CZ`);
        const one = open('T44[C Z');
        const songs = (extra: boolean) =>
            [...Array.from({ length: 16 }, () => full), ...(extra ? [one] : [])]
                .map((link, index) => `<a href="${link}">${index}</a>`)
                .join('');
        const fits = parseIRealImport(songs(false));
        expect(fits.diagnostics).toEqual([]);
        expect(fits.songs).toHaveLength(16);
        expect(
            fits.songs.reduce(
                (n, song) =>
                    n + (song.score?.sections.reduce((m, s) => m + s.measures.length, 0) ?? 0),
                0,
            ),
        ).toBe(65_536);
        const source = songs(true);
        const parsed = parseIRealImport(source);
        expect(parsed.source).toBe(source);
        expect(parsed.songs).toEqual([]);
        expect(parsed.diagnostics[0]?.message).toContain('65,536 written measures');
    });

    it('returns detached objects and deterministic identities on repeated reads', () => {
        const source = fixtures.realExport.sanitizedUrl;
        const first = parseIRealImport(source);
        const second = parseIRealImport(source);
        expect(first).toEqual(second);
        first.songs[0].metadata.fields[0] = 'Changed';
        first.songs[0].score!.sections[0].measures[0].id = 'Changed';
        expect(second.songs[0].metadata.fields[0]).toBe('Blues fixture');
        expect(second.songs[0].score!.sections[0].measures[0].id).toBe('ireal-1-bar-1');
    });
});

/**
 * #1478 — a whole playlist: its name kept, up to the account's 2,000 songs, parsed in slices that
 * agree exactly with the one-go parse, and each song's own link rebuildable from its fields.
 */
describe('whole-playlist decoding (#1478)', () => {
    /** One modern (irealb) playlist link of `count` songs, with an optional terminal name. */
    function playlist(count: number, name?: string): string {
        const fields = (index: number) => [
            `Tune ${index + 1}`,
            `Composer ${index % 7}`,
            '',
            'Medium Swing',
            'C',
            '',
            `1r34LbKcu7T44[C   |G7   Z`,
            '',
            '0',
            '0',
        ];
        const songs = Array.from({ length: count }, (_, index) =>
            fields(index).map(encodeURIComponent).join('='),
        );
        return `irealb://${songs.join('===')}${name === undefined ? '' : `===${encodeURIComponent(name)}`}`;
    }

    it('decodes a 1,350-song playlist with its name and every song, in order', () => {
        const source = playlist(1350, 'Jazz 1350');
        const decoded = decodeIRealInput(source);
        expect(decoded.playlistName).toBe('Jazz 1350');
        expect(decoded.entries).toHaveLength(1350);
        const parsed = parseIRealImport(source);
        expect(parsed.diagnostics).toEqual([]);
        expect(parsed.playlistName).toBe('Jazz 1350');
        expect(parsed.songs).toHaveLength(1350);
        expect(parsed.songs[0].title).toBe('Tune 1');
        expect(parsed.songs[1349].title).toBe('Tune 1350');
        expect(parsed.songs.every((song) => song.score)).toBe(true);
    });

    it('has no playlist name when the export carries none', () => {
        expect(decodeIRealInput(playlist(3)).playlistName).toBeUndefined();
        expect(parseIRealImport(playlist(3)).playlistName).toBeUndefined();
    });

    it('drops an unsafe playlist name with a warning, never the songs', () => {
        const parsed = parseIRealImport(playlist(2, '<b>Gig</b>'));
        expect(parsed.playlistName).toBeUndefined();
        expect(parsed.songs).toHaveLength(2);
        expect(parsed.diagnostics).toEqual([
            expect.objectContaining({ severity: 'warning', message: expect.any(String) }),
        ]);
    });

    it('refuses a playlist of more than 2,000 songs, and accepts exactly 2,000', () => {
        // The account's document cap (`MAX_DOCUMENTS_PER_OWNER`), written out: the contract.
        expect(MAX_IREAL_SONGS).toBe(2_000);
        const over = parseIRealImport(playlist(2_001, 'Too many'));
        expect(over.songs).toEqual([]);
        expect(over.diagnostics[0]).toMatchObject({ severity: 'error' });
        expect(over.diagnostics[0].message).toContain('at most 2,000 songs');
        const full = parseIRealImport(playlist(2_000, 'Full'));
        expect(full.diagnostics).toEqual([]);
        expect(full.songs).toHaveLength(2_000);
    });

    it('still refuses an export over the 1 MiB byte cap, however few songs it names', () => {
        const padded = `${playlist(2, 'Gig')}${'x'.repeat(1_048_576)}`;
        expect(parseIRealImport(padded).diagnostics[0]?.message).toContain('1 MiB');
    });

    it('parses in slices with exactly the one-go result, reporting progress as it goes', async () => {
        const source = playlist(120, 'Sliced');
        let yields = 0;
        const progress: number[] = [];
        const sliced = await parseIRealImportInSteps(source, {
            // Every song is a slice here, so each yields: the result must not depend on where.
            shouldYield: () => true,
            yieldNow: async () => {
                yields += 1;
            },
            onProgress: (done) => progress.push(done),
        });
        expect(sliced).toEqual(parseIRealImport(source));
        expect(yields).toBe(120);
        expect(progress.at(-1)).toBe(120);
        expect(progress).toEqual([...progress].sort((a, b) => a - b));
    });

    it('stops when cancelled, and resolves null', async () => {
        let calls = 0;
        const sliced = await parseIRealImportInSteps(playlist(50), {
            shouldYield: () => true,
            yieldNow: async () => {
                calls += 1;
            },
            cancelled: () => calls >= 3,
        });
        expect(sliced).toBeNull();
        expect(calls).toBe(3);
    });

    it("rebuilds each song's own link from its fields, which reads back to the same song", () => {
        const parsed = parseIRealImport(playlist(5, 'Links'));
        for (const song of parsed.songs) {
            const again = parseIRealImport(songSourceLink('irealb', song.metadata.fields));
            expect(again.songs).toHaveLength(1);
            expect(again.songs[0].metadata.fields).toEqual(song.metadata.fields);
            // Ids are positional (`ireal-<index>-…`); the music is what must read back the same.
            const music = (score: typeof song.score) =>
                score?.sections.flatMap((section) => section.measures.map((bar) => bar.content));
            expect(music(again.songs[0].score)).toEqual(music(song.score));
            expect(again.playlistName).toBeUndefined();
        }
    });
});
