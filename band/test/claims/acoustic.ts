/**
 * Acoustic's claims. The genre-specific metrics (fingerpicking, the Travis thumb, passing tones
 * that resolve by step, the pendulum strum, the soft backbeat) live here, not in the shared
 * library: no other style asks for them.
 */
import type { BandEvent, DrumHit, PitchedNote } from '../../core/types.js';
import { chordAt, type Timeline } from '../../form/timeline.js';
import { pendulum } from '../../players/comp/idiom.js';
import { STEP } from '../../players/grid.js';
import { chordPcs, fifthOf } from '../../theory/chord.js';
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
        /** Share of sounding comp notes below C3 (MIDI 48): the low strings. */
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
         * Of the stroked 4/4 comp strikes, the share whose direction is the eighth-note
         * pendulum's: down on the beat side of each eighth pair, up on the "and".
         */
        strokesFollowPendulum: (takes: Take[]) => {
            let n = 0;
            let hit = 0;
            for (const { timeline: t, events } of takes) {
                for (const notes of onsets(events).values()) {
                    const first = notes[0];
                    if (!first.stroke || t.bars[first.bar].meter.name !== '4/4') {
                        continue;
                    }
                    n++;
                    hit += first.stroke === pendulum(stepOf(t, first), 2) ? 1 : 0;
                }
            }
            return ratio(hit, n);
        },
        /**
         * The Travis thumb: in 4/4 bars holding one chord and picked in single notes, the share
         * where the thumb (the notes on the beats) starts on the chord's bass, alternates
         * between at least two bass strings, and stays below every note the fingers pick on
         * the "and"s.
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
                    const thumb = [0, 4, 8, 12].map((s) => plucks.get(s)?.[0].midi);
                    const fingers = [...plucks]
                        .filter(([s]) => s % 4 !== 0)
                        .map(([, notes]) => notes[0].midi);
                    const [one] = thumb;
                    hit +=
                        one !== undefined &&
                        thumb.every((m) => m !== undefined && m < Math.min(...fingers)) &&
                        mod12(one) === chord.bass &&
                        new Set(thumb).size >= 2
                            ? 1
                            : 0;
                }
            }
            return ratio(hit, n);
        },
        /**
         * Of the plain major and minor triads whose chord scale owns a natural 9th, the share of
         * their struck chords (two notes or more) that sound it: the add9.
         */
        add9OnOwnedTriads: (takes: Take[]) => {
            let n = 0;
            let hit = 0;
            for (const { timeline: t, events } of takes) {
                for (const [tick, notes] of onsets(events)) {
                    const chord = chordAt(t, tick);
                    const plain =
                        chord &&
                        (chord.family === 'major' || chord.family === 'minor') &&
                        chord.seventh === null &&
                        !chord.sixth &&
                        chord.tensions.length === 0 &&
                        chord.scale.includes(2);
                    if (!chord || !plain || notes.length < 2) {
                        continue;
                    }
                    n++;
                    hit += notes.some((x) => mod12(x.midi - chord.root) === 2) ? 1 : 0;
                }
            }
            return ratio(hit, n);
        },
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
                    0.9,
                    1,
                    'past quiet, the piano colours a plain triad with its 9th wherever the scale owns it',
                ],
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
                    'strokesFollowPendulum',
                    0.98,
                    1,
                    'strum direction follows the eighth-note pendulum',
                ],
                [
                    'strumUpShare',
                    0.3,
                    0.55,
                    'D-DU-UDU and friends: the "and"s come up, the beats go down',
                ],
                [
                    'strumMeanLowest',
                    48,
                    52,
                    'open-position grips from C3 up: the low strings belong to the bassist',
                ],
                ['compBelowC3Share', 0, 0, 'with a bassist, nothing on the low strings'],
                [
                    'add9OnOwnedTriads',
                    0.4,
                    0.85,
                    'the Cadd9 family is a whole-tune choice: most tunes ring it, some play plain',
                ],
                // Not 1: an anticipating upstroke catches only the top three strings of the next chord,
                // which may miss its guide tones, so the harness judges it against the old chord.
                ['compNotesInScale', 0.997, 1, 'every add9 grip is in the chord scale'],
            ],
        },
        {
            take: { comp: 'nylon', intensity: 0.2 },
            claims: [
                ['compSingleNoteShare', 0.9, 1, 'fingerpicked: each arpeggio note its own event'],
                ['compBelowC3Share', 0, 0, 'broken chords above C3, over the bassist'],
                [
                    'travisAlternatingBass',
                    0,
                    0.1,
                    'with a bassist the thumb keeps off the bass strings: broken chords, no Travis',
                ],
            ],
        },
        {
            take: { comp: 'nylon', intensity: 0.2, bass: false },
            claims: [
                [
                    'travisAlternatingBass',
                    0.9,
                    1,
                    'Travis: the thumb starts on the bass and alternates, under the fingers',
                ],
                ['compBelowC3Share', 0.08, 0.3, 'alone, the thumb owns the low strings'],
                ['compSingleNoteShare', 0.9, 1, 'fingerpicked, one note at a time'],
            ],
        },
    ],
});
