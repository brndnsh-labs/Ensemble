/**
 * Acoustic's claims. The genre-specific metrics (fingerpicking, the Travis thumb, passing tones
 * that resolve by step, the pendulum strum, the soft backbeat) live here, not in the shared
 * library: no other style asks for them.
 */
import type { BandEvent, DrumHit, PitchedNote } from '../../core/types.js';
import { type Bar, chordAt, type Timeline } from '../../form/timeline.js';
import { STEP } from '../../players/grid.js';
import { type ChordFacts, chordPcs, fifthOf } from '../../theory/chord.js';
import { mod12 } from '../../theory/pitch.js';
import { defineClaims, type Take } from '../critique/harness.js';

const stepOf = (t: Timeline, e: BandEvent) => Math.round((e.tick - t.bars[e.bar].start) / STEP);
const ratio = (hits: number, total: number) => (total ? hits / total : 0);

/** Sounding comp notes grouped by onset. */
function onsets(events: BandEvent[]): Map<number, PitchedNote[]> {
    const out = new Map<number, PitchedNote[]>();
    for (const e of events) {
        if (e.lane === 'comp' && !e.muted) {
            out.set(e.tick, [...(out.get(e.tick) ?? []), e]);
        }
    }
    return out;
}

/** 4/4 bars with drums, no fill (no toms, not a phrase's last bar), not a section's first. */
function grooveBars(t: Timeline, events: BandEvent[]) {
    return t.bars.filter((b) => {
        const drums = events.filter((e) => e.bar === b.index && e.lane === 'drums') as DrumHit[];
        return (
            b.meter.name === '4/4' &&
            drums.length > 0 &&
            !drums.some((d) => d.piece.startsWith('tom')) &&
            b.phrase.bar !== b.phrase.length - 1 &&
            b.barInVisit > 0
        );
    });
}

/** A plain major or minor triad whose own chord scale owns a natural 9th: add9 territory. */
const ownsAdd9 = (chord: ChordFacts) =>
    (chord.family === 'major' || chord.family === 'minor') &&
    chord.seventh === null &&
    !chord.sixth &&
    chord.tensions.length === 0 &&
    chord.scale.includes(2);

/**
 * Of the 4/4 bars holding one add9-territory triad whose function in the bar's key passes
 * `judged`, the share whose sounding comp notes include its 9th — struck or picked, so a
 * fingerpicked bar counts as much as a strummed one.
 */
function add9Bars(takes: Take[], judged: (degree: number, bar: Bar) => boolean): number {
    let n = 0;
    let hit = 0;
    for (const { timeline: t, events } of takes) {
        const notes = new Map<number, PitchedNote[]>();
        for (const e of events) {
            if (e.lane === 'comp' && !e.muted) {
                notes.set(e.bar, [...(notes.get(e.bar) ?? []), e]);
            }
        }
        for (const b of t.bars) {
            const chord = b.spans[0]?.chord;
            const heard = notes.get(b.index);
            if (
                b.meter.name !== '4/4' ||
                b.spans.length !== 1 ||
                !chord ||
                !heard ||
                !ownsAdd9(chord) ||
                !judged(mod12(chord.root - b.key.tonic), b)
            ) {
                continue;
            }
            n++;
            hit += heard.some((x) => mod12(x.midi - chord.root) === 2) ? 1 : 0;
        }
    }
    return ratio(hit, n);
}

/** Lowest MIDI note for the lower voice of each interval (semitones): the arranger's table. */
const LOW_INTERVAL_LIMIT: Record<number, number> = {
    1: 52, // m2: E3
    2: 51, // M2: Eb3
    3: 48, // m3: C3
    4: 46, // M3: Bb2
    5: 46, // P4: Bb2
    6: 47, // tritone: B2
    7: 34, // P5: Bb1
    8: 43, // m6: G2
    9: 41, // M6: F2
    10: 41, // m7: F2
    11: 41, // M7: F2
};

/** Standard tuning, low E to high E. */
const STRINGS = [40, 45, 50, 55, 59, 64];

/**
 * How many open strings a chord rings, fretted the most open way a hand can: one note per
 * string, in pitch order, with the fretted notes inside a four-fret reach. A note on an open
 * string's pitch fretted up the neck (the E4 of x55553's B string) doesn't count: only a
 * shape that sits where the open strings are rings them.
 */
function openStrings(notes: number[]): number {
    const sorted = [...notes].sort((a, b) => a - b);
    let best = 0;
    const place = (i: number, string: number, frets: number[]) => {
        if (i === sorted.length) {
            const fretted = frets.filter((f) => f > 0);
            if (!fretted.length || Math.max(...fretted) - Math.min(...fretted) <= 3) {
                best = Math.max(best, frets.length - fretted.length);
            }
            return;
        }
        for (let s = string + 1; s < STRINGS.length; s++) {
            const fret = sorted[i] - STRINGS[s];
            if (fret >= 0 && fret <= 18) {
                place(i + 1, s, [...frets, fret]);
            }
        }
    };
    place(0, -1, []);
    return best;
}

export const acoustic = defineClaims({
    metrics: {
        /**
         * Of the groove bars' backbeat strokes (snare or cross-stick on 2 and 4), the share that
         * are a full snare at a band's volume (velocity ≥ 80) — neither a cross-stick nor a
         * brush's laid-in tap.
         */
        fullSnareBackbeat: (takes: Take[]) => {
            let n = 0;
            let hit = 0;
            for (const { timeline: t, events } of takes) {
                for (const b of grooveBars(t, events)) {
                    for (const e of events) {
                        if (
                            e.lane === 'drums' &&
                            e.bar === b.index &&
                            (e.piece === 'snare' || e.piece === 'rim') &&
                            [4, 12].includes(stepOf(t, e))
                        ) {
                            n++;
                            hit += e.piece === 'snare' && e.velocity >= 80 ? 1 : 0;
                        }
                    }
                }
            }
            return ratio(hit, n);
        },
        /** Drum strokes (every piece but the crash) per groove bar. */
        drumStrokesPerBar: (takes: Take[]) => {
            let n = 0;
            let strokes = 0;
            for (const { timeline: t, events } of takes) {
                for (const b of grooveBars(t, events)) {
                    n++;
                    strokes += events.filter(
                        (e) => e.lane === 'drums' && e.bar === b.index && e.piece !== 'crash',
                    ).length;
                }
            }
            return ratio(strokes, n);
        },
        /** Share of bass notes that are not tones of the chord sounding (passing tones). */
        bassPassingShare: (takes: Take[]) => {
            let n = 0;
            let hit = 0;
            for (const { timeline: t, events } of takes) {
                for (const e of events) {
                    const chord = e.lane === 'bass' ? chordAt(t, e.tick) : null;
                    if (e.lane === 'bass' && chord) {
                        n++;
                        hit += chordPcs(chord).includes(mod12(e.midi)) ? 0 : 1;
                    }
                }
            }
            return ratio(hit, n);
        },
        /**
         * Of the bass's passing tones (a note outside the chord sounding), the share whose next
         * note is a half or whole step away in pitch: a passing tone resolves by step.
         */
        bassPassingResolves: (takes: Take[]) => {
            let n = 0;
            let hit = 0;
            for (const { timeline: t, events } of takes) {
                const bass = events
                    .filter((e): e is PitchedNote => e.lane === 'bass' && !e.muted)
                    .sort((a, b) => a.tick - b.tick);
                bass.forEach((e, i) => {
                    const chord = chordAt(t, e.tick);
                    const next = bass[i + 1];
                    if (!chord || !next || chordPcs(chord).includes(mod12(e.midi))) {
                        return;
                    }
                    n++;
                    const leap = Math.abs(next.midi - e.midi);
                    hit += leap === 1 || leap === 2 ? 1 : 0;
                });
            }
            return ratio(hit, n);
        },
        /**
         * Of the bass notes on beats 1 and 3 of 4/4 bars, the share that are the chord's bass
         * note or its fifth: the harmony's floor on the strong beats.
         */
        bassRootFifthOnStrongBeats: (takes: Take[]) => {
            let n = 0;
            let hit = 0;
            for (const { timeline: t, events } of takes) {
                for (const e of events) {
                    const bar = t.bars[e.bar];
                    const chord = chordAt(t, e.tick);
                    if (e.lane !== 'bass' || !chord || bar.meter.name !== '4/4') {
                        continue;
                    }
                    const step = stepOf(t, e);
                    if (step !== 0 && step !== 8) {
                        continue;
                    }
                    n++;
                    const pc = mod12(e.midi);
                    const fifth = mod12(chord.root + fifthOf(chord));
                    hit += pc === chord.bass || pc === chord.root || pc === fifth ? 1 : 0;
                }
            }
            return ratio(hit, n);
        },
        /** Share of sounding comp onsets that are one note: a chord picked, not struck. */
        compSingleNoteShare: (takes: Take[]) => {
            let n = 0;
            let hit = 0;
            for (const { events } of takes) {
                for (const notes of onsets(events).values()) {
                    n++;
                    hit += notes.length === 1 ? 1 : 0;
                }
            }
            return ratio(hit, n);
        },
        /**
         * Share of sounding comp notes below C3 (MIDI 48): the low strings. With a bassist the
         * invariant suite holds every one of them to doubling the bass (root, fifth or bass in a
         * grip standing on it); this measures how much the guitar uses that room.
         */
        compBelowC3Share: (takes: Take[]) => {
            let n = 0;
            let hit = 0;
            for (const { events } of takes) {
                for (const e of events) {
                    if (e.lane === 'comp' && !e.muted) {
                        n++;
                        hit += e.midi < 48 ? 1 : 0;
                    }
                }
            }
            return ratio(hit, n);
        },
        /**
         * The Travis thumb: in 4/4 bars holding one chord and picked in single notes, the share
         * where the thumb (the notes on the beats) alternates bass strings the way a Travis
         * picker does — the chord's bass on 1, the upper string on 2 and 4, and on 3 the
         * alternate bass (the chord's fifth; its root over a slash chord on the fifth): a
         * different note from beat 1, on a lower string than the upper note (so the thumb
         * never rolls up the chord), with every thumb note under the fingers' notes on the
         * "and"s. C: C3 E3 G2 E3; Am: A2 E3 E2 E3; E: E2 E3 B2 E3.
         */
        travisAlternatingBass: (takes: Take[]) => {
            let n = 0;
            let hit = 0;
            for (const { timeline: t, events } of takes) {
                const byBar = new Map<number, Map<number, PitchedNote[]>>();
                for (const notes of onsets(events).values()) {
                    const bar = byBar.get(notes[0].bar) ?? new Map<number, PitchedNote[]>();
                    bar.set(stepOf(t, notes[0]), notes);
                    byBar.set(notes[0].bar, bar);
                }
                for (const b of t.bars) {
                    const chord = b.spans[0]?.chord;
                    const plucks = byBar.get(b.index);
                    if (
                        b.meter.name !== '4/4' ||
                        b.spans.length !== 1 ||
                        !chord ||
                        !plucks ||
                        [...plucks.values()].some((notes) => notes.length > 1)
                    ) {
                        continue;
                    }
                    n++;
                    const [one, two, three, four] = [0, 4, 8, 12].map(
                        (s) => plucks.get(s)?.[0].midi,
                    );
                    const fingers = [...plucks]
                        .filter(([s]) => s % 4 !== 0)
                        .map(([, notes]) => notes[0].midi);
                    const fifth = mod12(chord.root + fifthOf(chord));
                    const alternate = fifth === chord.bass ? chord.root : fifth;
                    hit +=
                        one !== undefined &&
                        two !== undefined &&
                        three !== undefined &&
                        four === two &&
                        mod12(one) === chord.bass &&
                        three !== one &&
                        mod12(three) === alternate &&
                        three < two &&
                        Math.max(one, two, three) < Math.min(...fingers)
                            ? 1
                            : 0;
                }
            }
            return ratio(hit, n);
        },
        /** Of the bars holding one add9-territory triad (`add9Bars`), the share sounding its 9th. */
        add9OnOwnedTriads: (takes: Take[]) => add9Bars(takes, () => true),
        /**
         * The same share on the chords that rest — I and IV in a major key, i, bIII and bVI in
         * a minor one: where a songwriter's add9 lives.
         */
        add9OnRestChords: (takes: Take[]) =>
            add9Bars(takes, (degree, bar) =>
                bar.key.minor ? [0, 3, 8].includes(degree) : [0, 5].includes(degree),
            ),
        /** The same share on the dominant (V), where a 9th blunts the pull home. */
        add9OnDominant: (takes: Take[]) => add9Bars(takes, (degree) => degree === 7),
        /** Of the strummed strikes (a stroke direction set), the share that are upstrokes. */
        strumUpShare: (takes: Take[]) => {
            let n = 0;
            let hit = 0;
            for (const { events } of takes) {
                for (const notes of onsets(events).values()) {
                    if (notes[0].stroke) {
                        n++;
                        hit += notes[0].stroke === 'up' ? 1 : 0;
                    }
                }
            }
            return ratio(hit, n);
        },
        /**
         * Open strings per downstroked chord (`openStrings`): x32010 rings two, x02020 three,
         * a barre up the neck none.
         */
        openStringsPerDownstroke: (takes: Take[]) => {
            let n = 0;
            let open = 0;
            for (const { events } of takes) {
                for (const notes of onsets(events).values()) {
                    if (notes[0].stroke === 'down' && notes.length > 2) {
                        n++;
                        open += openStrings(notes.map((x) => x.midi));
                    }
                }
            }
            return ratio(open, n);
        },
        /**
         * Of the downstroked chords, the share whose two lowest notes keep the low-interval
         * limit for their interval (a major 3rd no lower than Bb2, a minor 3rd no lower than
         * C3, …): the arranger's table, stated here independently of the engine's copy.
         */
        bottomPairInLimit: (takes: Take[]) => {
            let n = 0;
            let hit = 0;
            for (const { events } of takes) {
                for (const notes of onsets(events).values()) {
                    if (notes[0].stroke === 'down' && notes.length > 2) {
                        const [a, b] = notes.map((x) => x.midi).sort((x, y) => x - y);
                        n++;
                        hit += a >= (LOW_INTERVAL_LIMIT[b - a] ?? 0) ? 1 : 0;
                    }
                }
            }
            return ratio(hit, n);
        },
        /** Mean lowest note (MIDI) of the downstroked chords: where the grips sit. */
        strumMeanLowest: (takes: Take[]) => {
            let n = 0;
            let sum = 0;
            for (const { events } of takes) {
                for (const notes of onsets(events).values()) {
                    if (notes[0].stroke === 'down' && notes.length > 2) {
                        n++;
                        sum += Math.min(...notes.map((x) => x.midi));
                    }
                }
            }
            return ratio(sum, n);
        },
    },
    takes: [
        {
            take: {},
            claims: [
                ['kickOnOne', 0.95, 1, 'a soft kick states the One'],
                ['bassArrivesOnBass', 0.95, 1, 'every change arrives on its bass note'],
                [
                    'bassRootFifthOnStrongBeats',
                    0.97,
                    1,
                    'roots and fifths on 1 and 3: the passing tones fall between',
                ],
                ['bassPassingShare', 0.02, 0.12, 'an occasional passing tone into a change'],
                [
                    'bassPassingResolves',
                    0.97,
                    1,
                    'every passing tone resolves by a half or whole step in pitch',
                ],
                [
                    'compNotesInScale',
                    0.998,
                    1,
                    'every colour tone is in the chord scale (one authority)',
                ],
                ['compTopVoiceMotion', 0, 2, 'close voicings led smoothly'],
            ],
        },
        {
            take: { intensity: 0.2 },
            claims: [
                [
                    'drumStrokesPerBar',
                    3,
                    8,
                    'quiet: a shaker, or a cross-stick on 2 and 4, over a soft kick',
                ],
                ['fullSnareBackbeat', 0, 0.02, 'no full snare when quiet: cross-stick or nothing'],
                ['bassPassingShare', 0, 0.01, 'a ballad bass holds its roots and fifths'],
                ['bassMeanSteps', 7, 16, 'long notes: half notes and whole notes'],
                [
                    'compSingleNoteShare',
                    0.6,
                    0.95,
                    'the piano breaks the chord into eighths in most quiet sections',
                ],
                ['add9OnOwnedTriads', 0, 0.05, 'a quiet triad stays bare (the old engine, by ear)'],
            ],
        },
        {
            take: { intensity: 0.6 },
            claims: [
                [
                    'add9OnOwnedTriads',
                    0.4,
                    0.75,
                    'past quiet, about half the plain triads the scale lets take a 9th ring it',
                ],
                [
                    'add9OnRestChords',
                    0.6,
                    0.95,
                    'the add9 lives on the resting chords: I and IV (i, bIII, bVI in minor)',
                ],
                ['add9OnDominant', 0, 0.3, 'rarely on V: a 9th there blunts its pull home'],
                ['compNotesInScale', 0.998, 1, 'every add9 is in the chord scale (one authority)'],
            ],
        },
        {
            take: { intensity: 0.9 },
            claims: [
                ['fullSnareBackbeat', 0.95, 1, 'a full snare backbeat once the band opens up'],
                ['snareBackbeat', 0.95, 1, 'on 2 and 4, every groove bar'],
                ['drumStrokesPerBar', 16, 24, 'hat eighths and a shaker shimmer fill it out'],
            ],
        },
        {
            take: { comp: 'guitar', intensity: 0.6 },
            claims: [
                [
                    'strumUpShare',
                    0.3,
                    0.55,
                    'D-DU-UDU and friends: the "and"s come up, the beats go down',
                ],
                [
                    'openStringsPerDownstroke',
                    1.2,
                    2.2,
                    'open-position shapes: x32010, x02210, xx0212 ring their open strings',
                ],
                [
                    'strumMeanLowest',
                    43,
                    47,
                    'an open chord stands on its root, down on the low strings (A2 of x02210)',
                ],
                [
                    'compBelowC3Share',
                    0.05,
                    0.2,
                    'below C3 only the root or its fifth, doubling the bassist (the invariants hold it)',
                ],
                [
                    'add9OnOwnedTriads',
                    0.35,
                    0.7,
                    'the Cadd9 shape family on about half the triads that can take it',
                ],
                ['add9OnRestChords', 0.55, 0.9, 'Cadd9 and Fadd9: on the resting chords'],
                ['add9OnDominant', 0, 0.3, 'rarely on V'],
                // Not 1: an anticipating upstroke catches only the top three strings of the next chord,
                // which may miss its guide tones, so the harness judges it against the old chord.
                ['compNotesInScale', 0.997, 1, 'every add9 grip is in the chord scale'],
            ],
        },
        {
            take: { comp: 'nylon', intensity: 0.2 },
            claims: [
                ['compSingleNoteShare', 0.9, 1, 'fingerpicked: each arpeggio note its own event'],
                [
                    'compBelowC3Share',
                    0.05,
                    0.25,
                    'the picking thumb takes the root of the open grip, doubling the bassist',
                ],
                ['add9OnOwnedTriads', 0, 0.02, 'a quiet guitar picks its triads bare'],
                [
                    'travisAlternatingBass',
                    0,
                    0.1,
                    'with a bassist, broken chords: the thumb leaves the alternating bass to the bass',
                ],
            ],
        },
        {
            take: { comp: 'nylon', intensity: 0.2, bass: false },
            claims: [
                [
                    'travisAlternatingBass',
                    0.95,
                    1,
                    'Travis: the thumb alternates bass strings (C3 E3 G2 E3), under the fingers',
                ],
                ['compBelowC3Share', 0.08, 0.3, 'alone, the thumb owns the low strings'],
                ['compSingleNoteShare', 0.9, 1, 'fingerpicked, one note at a time'],
            ],
        },
        {
            take: { comp: 'guitar', intensity: 0.6, bass: false },
            claims: [
                [
                    'openStringsPerDownstroke',
                    1.2,
                    2.2,
                    'alone, the same open shapes, standing on the bass of the chord',
                ],
                [
                    'bottomPairInLimit',
                    1,
                    1,
                    'the bottom of the band keeps its low-interval limit: no F2-A2, no G2-B2',
                ],
            ],
        },
        {
            take: { lead: 'head' },
            claims: [
                ['leadLongBreath', 0, 0.02, 'the tune never drops out for two bars'],
                ['leadRestShare', 0, 0.15, 'the tune fills the form, like a verse'],
                ['leadNotesPerBar', 2, 4.5, 'a singable line, not a run'],
                ['leadShortShare', 0.15, 0.5, 'quarters and held notes: the rhythm of a sung line'],
                ['leadChordToneOnBeats', 0.8, 1, 'the melody sits on the chords'],
                ['leadChromaticApproach', 0, 0.05, 'diatonic: a tune steps into its chords'],
                ['leadLeapShare', 0, 0.06, 'no wide leaps inside a phrase'],
                ['leadRepeatedNotes', 0, 0.07, 'the line moves'],
                ['leadPhraseEndsOnChordTone', 0.95, 1, 'phrases resolve'],
                ['leadOscillation', 0, 0.04, 'no trilling back and forth'],
            ],
        },
        {
            take: { lead: 'solo' },
            claims: [
                ['leadLongBreath', 0, 0.12, 'breaths, not gaps: two empty bars are rare'],
                ['leadRestShare', 0.15, 0.45, 'room to breathe, as a singer takes'],
                ['leadShortShare', 0.4, 0.7, 'an eighth-note melody, never sixteenth flurries'],
                ['leadChordToneOnBeats', 0.8, 1, 'the beats sit on the chord'],
                ['leadChangeGuideTones', 0.6, 1, 'the 3rd a singer lands on marks each change'],
                ['leadChromaticApproach', 0, 0.05, 'a folk player walks the scale'],
                ['leadStepShare', 0.35, 0.75, "pentatonic: steps and the scale's minor thirds"],
                ['leadLeapShare', 0, 0.05, 'no wide leaps'],
                ['leadOscillation', 0, 0.04, 'no mechanical trills'],
                ['leadPhraseEndsOnChordTone', 0.95, 1, 'phrases resolve to a chord tone'],
                ['leadBendShare', 0, 0.08, 'a slur into the 3rd now and then, never a blues bend'],
                ['leadArcRise', 1.5, 4, 'the solo builds'],
                ['leadPeakIsTop', 0.9, 1, 'the peak chorus holds the top note'],
            ],
        },
    ],
});
