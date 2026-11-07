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
 *
 * Since #2111 the line is the head's skeleton, not all of it: the lead sings it in a tune's
 * rhythm (`voiceGuideTones` in idiom.ts), striking these pitches at every change, the first note
 * and the last, and stepping through the chord scale between them. The form it is sung in is
 * read here (`headForm`), because the line itself lifts for the contrast.
 */
import { formRole, sectionRoleOf } from '../../arrange/plan.js';
import {
    type Bar,
    chorusBars,
    type SectionVisit,
    sectionKey,
    type Timeline,
} from '../../form/timeline.js';
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

/**
 * How a chorus of the head is sung (#2111). `form`: a 12-bar chorus is a blues, a call, the call
 * again, a different answer (`aab`); any other length a song's period. `contrast`: the visit (by
 * ordinal) that is the tune's contrast — its bridge (`formRole`, the bridge the rhythm section
 * opens up for), or with none the chorus's last visit in a letter other than the first's (an
 * A B tune's B, an A B A C's C). `home`: the visit after the contrast that ends the chorus (the
 * last A of an A A B A), which brings the A's rhythm back to close. A blues has neither: its
 * contrast is the third phrase, not a section.
 */
export interface HeadForm {
    form: 'period' | 'aab';
    contrast: number | null;
    home: number | null;
    /** The chorus's first bar inside the form (after an intro), and its last visit. */
    firstBar: number;
    last: number | null;
}

/** Bars in a chorus that make it a blues: 12, the form of every blues on the shelf. */
const BLUES_BARS = 12;

/** A section that is a vamp (All Blues's "Vamp"): the band's groove between heads. */
const VAMP = /^vamp/i;

const FORMS = new WeakMap<Timeline, Map<number, HeadForm>>();

/** The form of the chorus bar `index` is in (`HeadForm`). An intro and an outro are outside it. */
export function headForm(timeline: Timeline, index: number): HeadForm {
    const chorus = timeline.bars[index].visit.chorus;
    let byChorus = FORMS.get(timeline);
    if (!byChorus) {
        byChorus = new Map();
        FORMS.set(timeline, byChorus);
    }
    const cached = byChorus.get(chorus);
    if (cached) {
        return cached;
    }
    const visits: SectionVisit[] = timeline.visits.filter((v) => {
        const role = sectionRoleOf(v.label);
        return v.chorus === chorus && role !== 'Intro' && role !== 'Outro';
    });
    // A vamp is the band's, not the tune's (All Blues: a 12-bar head and an 8-bar vamp), so it
    // doesn't count towards a blues's twelve.
    const bars = visits.filter((v) => !VAMP.test(v.label)).reduce((n, v) => n + v.barCount, 0);
    const firstBar = visits[0]?.firstBar ?? index;
    const lastVisit = visits.at(-1)?.ordinal ?? null;
    let out: HeadForm;
    const bridge = visits.find(
        (v) => formRole(timeline, v.firstBar, { kind: 'head' }) === 'bridge',
    );
    // A twelve-bar chorus with a bridge of its own (an eight-bar groove and a four-bar bridge)
    // is a song, not a blues.
    const blues = bars === BLUES_BARS && !bridge;
    if (blues || !visits.length) {
        out = {
            form: blues ? 'aab' : 'period',
            contrast: null,
            home: null,
            firstBar,
            last: lastVisit,
        };
    } else {
        const first = sectionKey(visits[0]);
        const other = [...visits].reverse().find((v) => sectionKey(v) !== first);
        const contrast = bridge ?? other ?? null;
        const last = visits[visits.length - 1];
        out = {
            form: 'period',
            contrast: contrast?.ordinal ?? null,
            home: contrast && last.ordinal > contrast.ordinal ? last.ordinal : null,
            firstBar,
            last: lastVisit,
        };
    }
    byChorus.set(chorus, out);
    return out;
}

/**
 * How the line lifts for the contrast, in semitones over the pitch the line entered it from
 * (the A's last guide tone, not a fixed home). why: a bridge is where a tune climbs, a 4th over
 * its A — so each of the contrast's phrases starts from the guide tone nearest a 4th over that
 * entry, and its last phrase from the one nearest a step over it, so the line drifts down
 * toward the last A rather than dropping a 5th into it.
 */
const CONTRAST_LIFT = { phrase: 5, last: 2 } as const;

/**
 * How far under the instrument's top the contrast's guide tones may climb, in semitones: a whole
 * step. why: the A keeps a 5th's margin under the top (`BAND.above`) so that the bridge has
 * somewhere to go, and the bridge spends it — up to an alto's Ab5 (its palm-key top, the range
 * running to Bb5), a nylon string's G5 at the 15th fret, a trumpet's Ab5; the walk between the
 * guide tones already reached the range's top around them. Capped at the A's own margin
 * (`hi - BAND.above`, an alto's Eb5), a line seated high (a sax or nylon book's +4 or +5) had no
 * room to rise and the bridge fell (#2123). A minor 3rd under the top still clipped the nylon's
 * bridge in E minor (an Am9 G5 one over it); a whole step leaves every bridge of the fixtures in
 * all twelve keys its lift.
 */
const BRIDGE_TOP = 2;

/**
 * The widest move inside a phrase, in semitones: a minor 3rd. why: the nearest guide tone of the
 * next chord always lies within one (two guide tones are a 4th, 5th or tritone apart), so a line
 * that keeps to it is voice-led; a choice between the two voices is only made inside it.
 */
const INNER = 3;

/**
 * The widest move the line makes at a phrase top, re-centring or lifting: a 4th. why: a phrase
 * struck fresh may start somewhere new, but a tune doesn't leap a 6th or more between two of
 * its phrases (the head's seams into and out of the bridge most of all): a line that has
 * wandered gets home over two phrases, not one.
 */
const SEAM = 5;

/** The widest move a phrase top makes re-centring anywhere else: a 5th (see `SEAM`). */
const RECENTRE = 7;

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
    // The highest guide tone the contrast aims for (`BRIDGE_TOP`).
    const ceiling = hi - BRIDGE_TOP;
    // The A's last guide tone before the contrast, from `from`: of the guide tones a voice-led
    // move away (`INNER`), the nearest one the contrast's first chord (`into`) can rise from —
    // one of its guide tones at or over it, within a seam (`SEAM`) and under the ceiling. why: a
    // guide-tone line is two voices, the 3rds' and the 7ths', and going into a bridge a player
    // takes the voice that leaves the bridge somewhere to climb. The lift aims a 4th up with a
    // 4th's reach, so the one entry it can't climb from is a half step over one of the bridge
    // chord's guide tones and a tritone under the other: a V7's 7th that would resolve down
    // into the bridge (Night and Day's Bb7 Ab, to Ebmaj7's G, its D a tritone up). Every other
    // entry has a guide tone in reach at or over it. With neither voice able to climb, the
    // nearest, as anywhere.
    const leanIn = (pcs: number[], from: number, into: number[]): number => {
        const voices = pcs
            .flatMap((pc) => [-12, 0, 12].map((o) => nearestMidi(pc, from, lo, hi) + o))
            .filter((m) => m >= lo && m <= hi && Math.abs(m - from) <= INNER)
            .sort(
                (a, b) =>
                    Math.abs(a - from) - Math.abs(b - from) ||
                    Math.abs(a - home) - Math.abs(b - home) ||
                    a - b,
            );
        const climbs = voices.find((m) =>
            into.some((pc) => m + mod12(pc - m) <= Math.min(ceiling, m + SEAM)),
        );
        return climbs ?? nearest(pcs, from, home, lo, hi);
    };
    const notes: GuideNote[] = [];
    let prev: number | null = null;
    const { contrast } = headForm(timeline, firstBar);
    // The pitch the line entered the contrast from: its lift is measured from there.
    let entry: number | null = null;
    // The chorus's first note, and its section: an A that comes back starts there again.
    let opening: { midi: number; section: string } | null = null;
    for (let i = 0; i < pieces.length; i++) {
        const { start, end, chord, next, fresh } = pieces[i];
        const bar = bars[barIndexAt(start)];
        const key = bar.key;
        const pcs = guidePitchClasses(chord, key, next);
        const lifted = bar.visit.ordinal === contrast;
        const top = tops.has(start);
        // A seam into, inside or out of the contrast moves a 4th at most (`SEAM`); elsewhere a
        // phrase top may re-centre by a 5th (a ii-V chain falls a half step a chord, a 4th or
        // more over a phrase, and the line has to climb back as fast as it fell).
        const seam = lifted || bars[barIndexAt(start - 1)].visit.ordinal === contrast;
        if (!lifted) {
            entry = null;
        } else if (entry === null) {
            entry = prev ?? home;
        }
        // The guide tone nearest `target` within reach of the last note.
        const toward = (target: number) => {
            const from = prev ?? target;
            const reach = seam ? SEAM : RECENTRE;
            return nearest(
                pcs,
                target,
                target,
                Math.max(lo, from - reach),
                Math.min(hi, from + reach),
            );
        };
        const restates =
            top &&
            opening !== null &&
            bar.barInVisit === 0 &&
            sectionKey(bar.visit) === opening.section;
        let midi: number;
        if (prev === null) {
            // The chorus opens on the chord's 3rd when it is near home: it states the key.
            const third = nearestMidi(pcs[0], home, lo, hi);
            midi =
                third >= home - THIRD_FIRST.below && third <= home + THIRD_FIRST.above
                    ? third
                    : nearest(
                          pcs,
                          home,
                          home,
                          Math.max(lo, home - BAND.below),
                          Math.min(hi, home + BAND.above),
                      );
            opening = { midi, section: sectionKey(bar.visit) };
        } else if (top && lifted && entry !== null) {
            // Each of the contrast's phrases starts a 4th over where the line came in; its last
            // phrase a step over where the A starts, coming back down for it.
            const phrases = bars[bar.visit.firstBar + bar.visit.barCount - 1].phrase.index + 1;
            const last = bar.phrase.index === phrases - 1 && phrases > 1;
            const target = last
                ? (opening?.midi ?? entry) + CONTRAST_LIFT.last
                : entry + CONTRAST_LIFT.phrase;
            midi = toward(Math.min(ceiling, target));
        } else if (restates && opening) {
            // An A again starts where the first A did, so its line — over the same chords —
            // is the first A's: the tune comes back, not just its rhythm.
            midi = toward(opening.midi);
        } else if (top && (prev < home - BAND.below || prev > home + BAND.above || seam)) {
            // A phrase starting outside the band, or the first after the contrast, starts again
            // towards home.
            midi = toward(home);
        } else if (notes.at(-1)?.chord === chord) {
            // The same chord struck again (held past `LONGEST` bars, or over a phrase top): the
            // same tone. Its other guide tone is a 4th, 5th or tritone away — a leap, not a breath.
            midi = prev;
        } else if (lifted && entry !== null) {
            midi = nearest(pcs, prev, entry + CONTRAST_LIFT.phrase, lo, hi);
        } else {
            // The A's last chord before the contrast leans into it (`leanIn`).
            const after = pieces[i + 1];
            const afterBar = after && bars[barIndexAt(after.start)];
            midi =
                afterBar && afterBar.visit.ordinal === contrast
                    ? leanIn(pcs, prev, guidePitchClasses(after.chord, afterBar.key, after.next))
                    : nearest(pcs, prev, home, lo, hi);
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
