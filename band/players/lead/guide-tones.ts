/**
 * The head of a known standard, played honestly (#2027, DECISION 2026-11-04): not an invented
 * melody passed off as the tune, but its guide-tone line — the 3rd and 7th of each chord, held
 * long, each moving to the nearest guide tone of the next chord. It is what a teacher has a
 * student play over the changes before the melody: it spells the harmony, voice-led (Dm7's C
 * falls a half step to G7's B, which stays as Cmaj7's 7th), and claims no tune it doesn't
 * know. Only the standards shelf asks for it (`BandSettings.head`); solos are unchanged.
 *
 * The line is one chain over a whole chorus, so it is voice-led across section seams too (Blue
 * Bossa's G7b9 F falls to the top's Cm7 Eb). It is pure — a function of the timeline and the
 * lead's register — so a head resumed at any barline plays the same line.
 */
import { type Bar, chorusBars, type Timeline } from '../../form/timeline.js';
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
 * A triad's 7th, which the chart doesn't write, read from what the chord does: a diminished
 * triad is heard as a diminished 7th (its bb7); a major triad on the key's V, or one off the
 * tonic that falls a fifth to the next chord (a secondary dominant), is a dominant and takes the
 * b7; any other
 * triad takes the 7th of its chord scale (`parseChord` reads it in the bar's key: the I's
 * major 7th, a minor chord's b7). Null for a chord with no 3rd to pair it with.
 */
function triadSeventh(chord: ChordFacts, key: KeyContext, next: ChordFacts | null): number | null {
    if (chord.family === 'diminished') {
        return 9;
    }
    // The tonic's own triad falling a fifth is I going to IV, not V of IV: it stays the tonic.
    const degree = mod12(chord.root - key.tonic);
    const dominant =
        chord.third === 4 &&
        (degree === 7 || (degree !== 0 && next !== null && mod12(next.root - chord.root) === 5));
    if (dominant) {
        return 10;
    }
    return [11, 10].find((i) => chord.scale.includes(i)) ?? null;
}

/**
 * A chord's two guide tones, absolute pitch classes: its 3rd (a sus chord's 4th or 2nd) and its
 * 7th (a 6 chord's 6th; a triad's, `triadSeventh`). `next` is the chord after it, which tells a
 * major triad that resolves down a fifth from one that doesn't.
 */
export function guidePitchClasses(
    chord: ChordFacts,
    key: KeyContext,
    next: ChordFacts | null = null,
): number[] {
    const guides = [...chord.guides];
    if (guides.length < 2) {
        const seventh = triadSeventh(chord, key, next);
        if (seventh !== null && !guides.includes(seventh)) {
            guides.push(seventh);
        }
    }
    const pcs = guides.length ? guides : [chord.third ?? 0];
    return [...new Set(pcs.map((i) => mod12(chord.root + i)))];
}

/**
 * Where a phrase may start, in semitones from the lead's home: a little under it to well over
 * it. Inside a phrase the line takes the nearest guide tone wherever it is (in the instrument's
 * range): voice-leading wins, and a ii-V chain falls a half step a chord. At a phrase's first
 * note, where the line breathes and is struck fresh, a line that has left this band starts
 * again from the guide tone nearest home, as a player moves a guide-tone line up an octave at a
 * phrase break and never mid-phrase. why: the band's floor is three under home because below it
 * the line sinks into the comp's own 3rd-and-7th shells (a jazz piano's sit around Eb4) and on
 * down towards the bass's slot; over the comp, the line is heard.
 */
const BAND = { below: 3, above: 7 } as const;

/** A chord held longer than this many bars is struck again, so a long chord still breathes. */
const LONGEST = 2;

/**
 * Where a note that ends a phrase releases, short of the phrase's end: an eighth, so the line
 * breathes at the four-bar marks as a singer does, and the next phrase is struck fresh.
 */
const BREATH = STEP * 2;

/** The 3rd starts a chorus when it lies this close to home (from two under to four over). */
const THIRD_FIRST = { below: 2, above: 4 } as const;

const LINES = new WeakMap<Timeline, Map<string, GuideNote[]>>();

/**
 * The guide-tone line over the chorus bar `bar` is in: one long note per chord, voice-led from
 * the first chord's 3rd (or the guide tone nearest `home`). A common tone held into the next
 * chord is held through; a note never crosses a phrase's first barline (each phrase is struck
 * fresh, and a phrase is the lead's planning slot), and a chord held past `LONGEST` bars is
 * struck again on the same tone.
 */
export function guideToneLine(
    timeline: Timeline,
    bar: Bar,
    home: number,
    range: readonly [number, number],
): GuideNote[] {
    const { first, end } = chorusBars(timeline, bar.index);
    const memo = `${first}:${home}:${range[0]}:${range[1]}`;
    let byChorus = LINES.get(timeline);
    if (!byChorus) {
        byChorus = new Map();
        LINES.set(timeline, byChorus);
    }
    const cached = byChorus.get(memo);
    if (cached) {
        return cached;
    }
    const line = chorusLine(timeline, first, end, home, range);
    byChorus.set(memo, line);
    return line;
}

function chorusLine(
    timeline: Timeline,
    firstBar: number,
    endBar: number,
    home: number,
    range: readonly [number, number],
): GuideNote[] {
    const { bars } = timeline;
    const from = bars[firstBar].start;
    const last = bars[endBar - 1];
    const to = last.start + last.meter.barTicks;
    // Where a note must be struck fresh: each phrase's first barline, and every `LONGEST` bars
    // into a held chord (counted in bars, whatever their meter).
    const tops = new Set<number>();
    for (let b = firstBar; b < endBar; b++) {
        if (bars[b].phrase.bar === 0) {
            tops.add(bars[b].start);
        }
    }
    const barIndexAt = (tick: number) => {
        let lo = firstBar;
        let hi = endBar - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (bars[mid].start <= tick) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        return lo;
    };
    // The chorus's chords (a chord held over a barline is one), each cut at the phrase tops and
    // every `LONGEST` bars after its own start.
    const chords: { start: number; end: number; chord: ChordFacts }[] = [];
    for (const span of timeline.spans) {
        if (span.start >= to) {
            break;
        }
        if (span.end <= from || !span.chord) {
            continue;
        }
        const start = Math.max(span.start, from);
        const end = Math.min(span.end, to);
        const prev = chords.at(-1);
        if (prev && prev.end === start && prev.chord.symbol === span.chord.symbol) {
            prev.end = end;
        } else {
            chords.push({ start, end, chord: span.chord });
        }
    }
    const pieces: {
        start: number;
        end: number;
        chord: ChordFacts;
        next: ChordFacts | null;
        fresh: boolean;
    }[] = [];
    chords.forEach(({ start, end, chord }, c) => {
        const next = chords[c + 1]?.chord ?? null;
        let at = start;
        while (at < end) {
            const b = barIndexAt(at);
            let cut = end;
            for (let k = b + 1; k < endBar && bars[k].start < end; k++) {
                if (tops.has(bars[k].start) || k - b === LONGEST) {
                    cut = bars[k].start;
                    break;
                }
            }
            pieces.push({ start: at, end: cut, chord, next, fresh: at !== start || tops.has(at) });
            at = cut;
        }
    });
    const [lo, hi] = range;
    const notes: GuideNote[] = [];
    let prev: number | null = null;
    for (const { start, end, chord, next, fresh } of pieces) {
        const key = bars[barIndexAt(start)].key;
        const pcs = guidePitchClasses(chord, key, next);
        // The guide tone nearest home inside the band a phrase may start in.
        const fromHome = () =>
            nearest(
                pcs,
                home,
                home,
                Math.max(lo, home - BAND.below),
                Math.min(hi, home + BAND.above),
            );
        let midi: number;
        if (prev === null) {
            // The chorus opens on the chord's 3rd when it is near home: it states the key.
            const third = nearestMidi(pcs[0], home, lo, hi);
            midi =
                third >= home - THIRD_FIRST.below && third <= home + THIRD_FIRST.above
                    ? third
                    : fromHome();
        } else if (tops.has(start) && (prev < home - BAND.below || prev > home + BAND.above)) {
            // A phrase starting outside the band starts again near home.
            midi = fromHome();
        } else if (notes.at(-1)?.chord === chord) {
            // The same chord struck again (held past `LONGEST` bars, or over a phrase top): the
            // same tone. Its other guide tone is a 4th, 5th or tritone away — a leap, not a breath.
            midi = prev;
        } else {
            midi = nearest(pcs, prev, home, lo, hi);
        }
        const previous = notes.at(-1);
        if (
            previous &&
            !fresh &&
            previous.midi === midi &&
            previous.tick + previous.dur === start
        ) {
            // A common tone into the next chord: held through.
            previous.dur = end - previous.tick;
        } else {
            notes.push({ tick: start, dur: end - start, midi, chord, key });
        }
        prev = midi;
    }
    // Breathe at each phrase's end: the note sounding up to the next phrase's first barline (or
    // the chorus's end) releases an eighth early, when it is long enough to spare it.
    for (const note of notes) {
        const stop = note.tick + note.dur;
        if ((stop === to || tops.has(stop)) && note.dur >= STEP * 8) {
            note.dur -= BREATH;
        }
    }
    return notes;
}

/**
 * The guide tone nearest `anchor`, placed in [lo, hi]. On a tie, the one nearer `home`, so a
 * line falling chord by chord (a ii-V chain's half steps) leans back up instead of sinking.
 */
function nearest(pcs: number[], anchor: number, home: number, lo: number, hi: number): number {
    return pcs
        .map((pc) => nearestMidi(pc, anchor, lo, hi))
        .sort(
            (a, b) =>
                Math.abs(a - anchor) - Math.abs(b - anchor) ||
                Math.abs(a - home) - Math.abs(b - home) ||
                a - b,
        )[0];
}
