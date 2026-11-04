/**
 * The head of a known standard, played honestly (#2027, DECISION 2026-11-04): not an invented
 * melody passed off as the tune, but its guide-tone line — the 3rd and 7th of each chord, held
 * long, each moving to the nearest guide tone of the next chord. It is what a teacher has a
 * student play over the changes before the melody: it spells the harmony, voice-led (Dm7's C
 * falls a half step to G7's B, which stays as Cmaj7's 7th), and claims no tune it doesn't
 * know. Only the standards shelf asks for it (`BandSettings.head`); solos are unchanged.
 *
 * Pure: a section visit's line is a function of its chords and the lead's home, so a head
 * resumed at any barline, or an A section's next visit, plays the same line.
 */
import type { Bar, Timeline } from '../../form/timeline.js';
import type { ChordFacts } from '../../theory/chord.js';
import { type KeyContext, mod12, nearestMidi } from '../../theory/pitch.js';
import { STEP } from '../grid.js';

export interface GuideNote {
    tick: number;
    dur: number;
    midi: number;
    chord: ChordFacts;
    key: KeyContext;
}

/**
 * A chord's two guide tones, absolute pitch classes: its 3rd (a sus chord's 4th or 2nd) and its
 * 7th (a 6 chord's 6th). A triad writes no 7th, so it takes the one its chord scale gives — the
 * key's own 7th over that root (`parseChord` reads the scale in the bar's key: the I's major
 * 7th, the V's minor 7th) — which fits the chord and the key alike.
 */
export function guidePitchClasses(chord: ChordFacts): number[] {
    const guides = [...chord.guides];
    if (guides.length < 2) {
        const seventh = [11, 10, 9].find((i) => chord.scale.includes(i) && !guides.includes(i));
        if (seventh !== undefined) {
            guides.push(seventh);
        }
    }
    const pcs = guides.length ? guides : [chord.third ?? 0];
    return [...new Set(pcs.map((i) => mod12(chord.root + i)))];
}

/**
 * How far the line may wander from the lead's home, in semitones either way. A guide-tone line
 * lives in a fifth or so: a voice-led choice that would leave the window is placed in the
 * other octave instead, so the line never drifts off over a long tune.
 */
const WINDOW = 7;

/** A chord held longer than this many bars moves to its other guide tone, so it still breathes. */
const LONGEST = 2;

/**
 * Where a note that ends a phrase releases, short of the phrase's end: an eighth, so the line
 * breathes at the four-bar marks as a singer does, and the next phrase is struck fresh.
 */
const BREATH = STEP * 2;

/**
 * The guide-tone line over the section visit `bar` is in: one long note per chord, voice-led
 * from the guide tone nearest `home`. A note that would sound the same pitch as the one before
 * it (a common tone) is held through instead, unless a new phrase starts there.
 */
export function guideToneLine(
    timeline: Timeline,
    bar: Bar,
    home: number,
    range: readonly [number, number],
): GuideNote[] {
    const { bars } = timeline;
    const first = bars[bar.visit.firstBar];
    const lastBar = bars[bar.visit.firstBar + bar.visit.barCount - 1];
    const from = first.start;
    const to = lastBar.start + lastBar.meter.barTicks;
    const lo = Math.max(range[0], home - WINDOW);
    const hi = Math.min(range[1], home + WINDOW);
    const barAt = (tick: number) => {
        let b = bar.visit.firstBar;
        while (b + 1 < bars.length && bars[b + 1].start <= tick) {
            b++;
        }
        return bars[b];
    };
    // The chord segments of the visit (a chord held over a barline is one), each then split
    // every `LONGEST` bars.
    const segments: { start: number; end: number; chord: ChordFacts }[] = [];
    for (const span of timeline.spans) {
        if (span.end <= from || span.start >= to || !span.chord) {
            continue;
        }
        const start = Math.max(span.start, from);
        const end = Math.min(span.end, to);
        const prev = segments.at(-1);
        if (prev && prev.end === start && prev.chord.symbol === span.chord.symbol) {
            prev.end = end;
            continue;
        }
        segments.push({ start, end, chord: span.chord });
    }
    const split: (typeof segments)[number][] = [];
    for (const segment of segments) {
        let start = segment.start;
        while (start < segment.end) {
            const at = barAt(start);
            const end = Math.min(segment.end, at.start + LONGEST * at.meter.barTicks);
            split.push({ ...segment, start, end });
            start = end;
        }
    }
    const notes: GuideNote[] = [];
    let prev: number | null = null;
    for (const { start, end, chord } of split) {
        const pcs = guidePitchClasses(chord);
        // Nearest first; on a tie, the one that falls (a 7th resolving to the next chord's 3rd
        // moves down).
        const choose = (anchor: number) =>
            pcs
                .map((pc) => nearestMidi(pc, anchor, lo, hi))
                .sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor) || a - b)[0];
        // The same chord, split because it is held long: move to its other guide tone.
        const held = notes.at(-1)?.chord === chord;
        const other =
            held && prev !== null ? pcs.find((pc) => pc !== mod12(prev as number)) : undefined;
        const midi: number =
            prev !== null && other !== undefined
                ? nearestMidi(other, prev, lo, hi)
                : choose(prev ?? home);
        const at = barAt(start);
        const phraseTop = start === at.start && at.phrase.bar === 0;
        const last = notes.at(-1);
        if (last && last.midi === midi && last.tick + last.dur === start && !phraseTop) {
            last.dur = end - last.tick;
        } else {
            notes.push({ tick: start, dur: end - start, midi, chord, key: at.key });
        }
        prev = midi;
    }
    // Breathe at each phrase's end: the note sounding up to the next phrase's first bar (or the
    // visit's end) releases an eighth early, when it is long enough to spare it.
    for (const note of notes) {
        const end = note.tick + note.dur;
        const next = end < to ? barAt(end) : null;
        const ends = end === to || (next !== null && next.start === end && next.phrase.bar === 0);
        if (ends && note.dur >= STEP * 8) {
            note.dur -= BREATH;
        }
    }
    return notes;
}
