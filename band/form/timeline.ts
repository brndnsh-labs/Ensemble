/**
 * Score → Timeline. The one place where authored form (repeats, endings, D.C./D.S., bar
 * repeats) and rational durations become performed bars in integer ticks. Everything
 * downstream reads the timeline and never the score.
 *
 * Unlike the old step grid, nothing here rejects music: holds extend the chord before them,
 * N.C. is a span with no chord, fermatas stretch time, and any meter/grouping the codec
 * accepts gets a pulse skeleton.
 */

import { resolveScoreContext } from '../../public/songbook/score-context.js';
import { compileScoreForm } from '../../public/songbook/score-form.js';
import { resolveScoreMeasureEvents } from '../../public/songbook/score-measure-events.js';
import type { ScoreDuration, SemanticScore } from '../../public/songbook/score-types.js';
import { type Lane, PPQ } from '../core/types.js';
import { type ChordFacts, parseChord } from '../theory/chord.js';
import { type KeyContext, notePc } from '../theory/pitch.js';
import { buildMeter, type Meter } from './meter.js';

/** A fermata holds its chord for this multiple of the written length. */
export const FERMATA_STRETCH = 2;

export interface ChordSpan {
    start: number;
    end: number;
    /** Null = N.C.: the pitched lanes rest. */
    chord: ChordFacts | null;
    fermata: boolean;
    /** A written hold under a fermata: the chord before it keeps ringing, nothing re-strikes. */
    tied: boolean;
}

/** A chord span as one bar sees it. `attack` is false when the span began in an earlier bar. */
export interface BarSpan extends ChordSpan {
    attack: boolean;
}

export interface SectionVisit {
    /** Ordinal of this visit in the performance (a D.C. or D.S. revisit is a new visit). */
    ordinal: number;
    sectionIndex: number;
    id: string;
    label: string;
    /** Which written pass of the section (its `repeat` count), from 0. */
    pass: number;
    firstBar: number;
    barCount: number;
    seamless: boolean;
    targetIntensity: number | null;
    lanes: Partial<Record<Lane, boolean>>;
}

export interface Bar {
    index: number;
    start: number;
    meter: Meter;
    key: KeyContext;
    spans: BarSpan[];
    visit: SectionVisit;
    /** Bar position within its section visit, from 0. */
    barInVisit: number;
    /** 4-bar phrasing within the visit: which phrase, where in it, and how long it is. */
    phrase: { index: number; bar: number; length: number };
}

export interface Timeline {
    bars: Bar[];
    visits: SectionVisit[];
    spans: ChordSpan[];
    ticks: number;
    /** Tick ranges that play slower than written (fermatas), as seconds-per-tick multipliers. */
    stretches: { start: number; end: number; factor: number }[];
}

function durationTicks([n, d]: Readonly<ScoreDuration>): number {
    return Math.round((n * PPQ) / d);
}

const SECTION_LANES: Record<string, Lane> = {
    groove: 'drums',
    bass: 'bass',
    chords: 'comp',
    soloist: 'lead',
};

function phraseLayout(barCount: number): number[] {
    // Four-bar phrases; a short tail joins the last phrase (a 6-bar section is 6, not 4+2).
    if (barCount <= 5) {
        return [barCount];
    }
    const phrases = Array.from({ length: Math.floor(barCount / 4) }, () => 4);
    const rest = barCount % 4;
    if (rest === 3) {
        phrases.push(3);
    } else if (rest) {
        phrases[phrases.length - 1] += rest;
    }
    return phrases;
}

/**
 * Did the performance get from one bar to the next by a written repeat's jump back? The pass
 * of the repeat it jumped in goes up by one; everything outside it stays the same.
 */
function repeatedFrom(before: number[], after: number[]): boolean {
    const depth = after.length - 1;
    return (
        depth >= 0 &&
        depth < before.length &&
        after[depth] === before[depth] + 1 &&
        after.slice(0, depth).every((pass, i) => pass === before[i])
    );
}

export function compileTimeline(score: SemanticScore): Timeline {
    const visitsWritten = compileScoreForm(score);
    const events = resolveScoreMeasureEvents(score);

    // Effective context for every written measure.
    const contexts = score.sections.map((section) => {
        let context = resolveScoreContext(score, section);
        return section.measures.map((measure) => {
            context = resolveScoreContext(context, measure);
            return context;
        });
    });

    const bars: Bar[] = [];
    const visits: SectionVisit[] = [];
    const spans: ChordSpan[] = [];
    const stretches: Timeline['stretches'] = [];
    let tick = 0;
    let visit: SectionVisit | null = null;
    let visitKey = '';
    let last: (typeof visitsWritten)[number] | null = null;

    for (const written of visitsWritten) {
        const section = score.sections[written.sectionIndex];
        const key = `${written.sectionIndex}:${written.sectionPass}`;
        // A new visit starts at the section's first bar, and wherever a D.C. or D.S. jumps
        // back into it. A written repeat inside the section (a vamp, a two-bar turnaround) is
        // part of the visit it sits in, as is a forward skip (a second ending): giving each
        // lap its own visit would put a section fill and a crash on every one.
        const jumpedBack =
            last !== null &&
            written.measureIndex <= last.measureIndex &&
            !repeatedFrom(last.repeatPasses, written.repeatPasses);
        if (!visit || key !== visitKey || written.measureIndex === 0 || jumpedBack) {
            const lanes: Partial<Record<Lane, boolean>> = {};
            for (const [name, on] of Object.entries(section.instruments ?? {})) {
                // An authored key indexes this table: guard with hasOwn (the #1266 rule).
                const lane = Object.hasOwn(SECTION_LANES, name) ? SECTION_LANES[name] : null;
                if (lane && typeof on === 'boolean') {
                    lanes[lane] = on;
                }
            }
            visit = {
                ordinal: visits.length,
                sectionIndex: written.sectionIndex,
                id: section.id,
                label: section.label,
                pass: written.sectionPass,
                firstBar: bars.length,
                barCount: 0,
                seamless: section.seamless === true,
                targetIntensity:
                    typeof section.targetIntensity === 'number' ? section.targetIntensity : null,
                lanes,
            };
            visits.push(visit);
            visitKey = key;
        }
        last = written;
        const context = contexts[written.sectionIndex][written.measureIndex];
        const meter = buildMeter(context.meter, context.grouping);
        const keyContext = { tonic: notePc(context.key), minor: context.isMinor };
        const bar: Bar = {
            index: bars.length,
            start: tick,
            meter,
            key: keyContext,
            spans: [],
            visit,
            barInVisit: visit.barCount,
            phrase: { index: 0, bar: 0, length: 0 },
        };
        let at = tick;
        for (const event of events[written.sectionIndex][written.measureIndex]) {
            const length = durationTicks(event.duration);
            const fermata = event.fermata === true;
            if (event.kind === 'hold' && spans.length && !fermata) {
                spans[spans.length - 1].end = at + length;
            } else {
                const chord =
                    event.kind === 'chord'
                        ? parseChord(event.symbol, keyContext)
                        : event.kind === 'hold'
                          ? (spans.at(-1)?.chord ?? null)
                          : null;
                spans.push({
                    start: at,
                    end: at + length,
                    chord,
                    fermata,
                    tied: event.kind === 'hold',
                });
            }
            if (fermata) {
                stretches.push({ start: at, end: at + length, factor: FERMATA_STRETCH });
            }
            at += length;
        }
        // The codec guarantees events fill the bar; rounding (odd groupings such as sevens) is absorbed here.
        tick += meter.barTicks;
        if (spans.length) {
            spans[spans.length - 1].end = Math.max(spans[spans.length - 1].end, tick);
        }
        bars.push(bar);
        visit.barCount++;
    }

    impliedTensions(spans);

    // Slice global spans into each bar's view.
    let cursor = 0;
    for (const bar of bars) {
        const end = bar.start + bar.meter.barTicks;
        while (cursor < spans.length && spans[cursor].end <= bar.start) {
            cursor++;
        }
        for (let i = cursor; i < spans.length && spans[i].start < end; i++) {
            const span = spans[i];
            bar.spans.push({
                ...span,
                start: Math.max(span.start, bar.start),
                end: Math.min(span.end, end),
                attack: span.start >= bar.start && !span.tied,
            });
        }
    }

    for (const v of visits) {
        let first = 0;
        phraseLayout(v.barCount).forEach((length, index) => {
            for (let b = 0; b < length; b++) {
                bars[v.firstBar + first + b].phrase = { index, bar: b, length };
            }
            first += length;
        });
    }

    return { bars, visits, spans, ticks: tick, stretches };
}

const MINOR_FAMILIES = new Set(['minor', 'half-diminished', 'diminished']);

/**
 * A dominant that resolves down a fifth to a minor-family chord (V7→i, A7→Dm7) implies
 * the minor key's b9 and b13: it takes phrygian dominant as its scale and voicings prefer
 * those tensions. Only for dominants the chart leaves unaltered — written tensions win.
 */
function impliedTensions(spans: ChordSpan[]): void {
    const chords = spans.filter((s) => s.chord);
    chords.forEach((span, i) => {
        const chord = span.chord!;
        const next = (chords[i + 1] ?? chords[0])?.chord;
        if (
            chord.family !== 'dominant' ||
            chord.third === null ||
            chord.tensions.length > 0 ||
            chord.fifth !== 7 ||
            !next ||
            next.root !== (chord.root + 5) % 12 ||
            !MINOR_FAMILIES.has(next.family)
        ) {
            return;
        }
        span.chord = {
            ...chord,
            scale: [0, 1, 4, 5, 7, 8, 10],
            implied: { ninth: 1, thirteenth: 8 },
        };
    });
}

/** The chord sounding at a tick (N.C. → null). */
export function chordAt(timeline: Timeline, tick: number): ChordFacts | null {
    const span = timeline.spans.find((s) => s.start <= tick && tick < s.end);
    return span?.chord ?? null;
}

/** Seconds from tick 0 to `tick` at `bpm`, honouring fermata stretches. */
export function secondsAt(timeline: Timeline, tick: number, bpm: number): number {
    const perTick = 60 / bpm / PPQ;
    let seconds = tick * perTick;
    for (const s of timeline.stretches) {
        if (s.start >= tick) {
            break;
        }
        seconds += (Math.min(tick, s.end) - s.start) * perTick * (s.factor - 1);
    }
    return seconds;
}
