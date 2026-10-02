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
    /** Which chorus of a counted performance (`SemanticScore.choruses`), from 0; else 0. */
    chorus: number;
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
    /**
     * Set when the performance ends in a last-chorus coda (#1472): a counted chart whose final
     * chorus hops to written outro material, so its last bar is the chart's own ending and the
     * band holds it as written (`arrange/ending.ts`). Absent otherwise, so every other
     * timeline is shaped exactly as before.
     */
    coda?: true;
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
        // A new chorus always starts a new visit, even of the section the last one ended in.
        const key = `${written.chorus}:${written.sectionIndex}:${written.sectionPass}`;
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
                chorus: written.chorus,
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

    // A counted chart with a last-chorus coda always ends in it: only the final chorus takes
    // the hop, and the score form refuses a D.C./D.S. beside it, so nothing follows the coda.
    // An uncounted chart never takes it (its one chorus loops), so it has no written ending.
    const coda =
        score.choruses !== undefined &&
        score.sections.some((section) =>
            section.measures.some((measure) =>
                [...(measure.start ?? []), ...(measure.end ?? [])].some(
                    (direction) => direction.kind === 'last-chorus',
                ),
            ),
        );
    return {
        bars,
        visits,
        spans,
        ticks: tick,
        stretches,
        ...(coda ? { coda: true as const } : {}),
    };
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

const CHORUSES = new WeakMap<Timeline, { first: number; end: number }[]>();

/**
 * The bars of the chorus bar `index` belongs to: `first` up to (not including) `end`. A counted
 * chart (`SemanticScore.choruses`, #1475) unrolls every chorus into one timeline, and what the
 * band shapes over "the song" — a solo chorus's arc — is one chorus of it, as it is one lap of
 * an uncounted chart, whose single chorus is the whole timeline. So a bar's place in the form
 * is `index - first`: what the band keys its choices on, so chorus k plays what lap k plays.
 */
export function chorusBars(timeline: Timeline, index: number): { first: number; end: number } {
    let byBar = CHORUSES.get(timeline);
    if (!byBar) {
        const spans: { first: number; end: number }[] = [];
        byBar = [];
        for (const bar of timeline.bars) {
            const last = spans.at(-1);
            if (last && timeline.bars[last.first].visit.chorus === bar.visit.chorus) {
                last.end = bar.index + 1;
            } else {
                spans.push({ first: bar.index, end: bar.index + 1 });
            }
            byBar.push(spans[spans.length - 1]);
        }
        CHORUSES.set(timeline, byBar);
    }
    return byBar[index] ?? { first: 0, end: timeline.bars.length };
}

/**
 * Is bar `index` in the last chorus of a counted performance of two or more choruses? An
 * uncounted chart's one chorus loops, so it has no last one; nor does a single counted chorus.
 */
export function inFinalChorus(timeline: Timeline, index: number): boolean {
    const last = timeline.bars.at(-1)?.visit.chorus ?? 0;
    return last > 0 && timeline.bars[index].visit.chorus === last;
}

/**
 * Is bar `index` in the chorus `ahead` choruses before the last of a counted performance (1:
 * the one that leads into the out-head)? Never, for an uncounted chart, or for the first
 * chorus (which is always the head).
 */
export function beforeFinalChorus(timeline: Timeline, index: number, ahead = 1): boolean {
    const last = timeline.bars.at(-1)?.visit.chorus ?? 0;
    return last > ahead && timeline.bars[index].visit.chorus === last - ahead;
}

/**
 * The index of the first span starting after `tick` (`spans.length` if none). Spans are in
 * order of their starts, so this is a binary search: a counted chart's timeline holds every
 * chorus, and a scan from the top would make each lookup cost the whole performance so far.
 */
export function firstSpanAfter(timeline: Timeline, tick: number): number {
    const { spans } = timeline;
    let lo = 0;
    let hi = spans.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (spans[mid].start <= tick) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}

/**
 * The index of the first span sounding at `tick`, or -1 — what `spans.findIndex` over
 * `start <= tick < end` answers, without the scan (`firstSpanAfter`). What the searches rely
 * on: spans are sorted by start, and two spans overlap, if at all, by a few ticks at a
 * barline. That happens when a bar's durations are not whole ticks (a 1/7 of a quarter rounds
 * to 69 ticks, and seven of them overrun the bar): the last span then ends just past the next
 * bar's first span's start (the timeline absorbs the rounding there). The walk back finds that
 * earlier span first, as the scan did — on every chart in the corpus the search returns what
 * the scan returned (pinned by the property test in `timeline.test.ts`).
 */
export function spanIndexAt(timeline: Timeline, tick: number): number {
    const { spans } = timeline;
    let first = firstSpanAfter(timeline, tick) - 1;
    while (first > 0 && spans[first - 1].end > tick) {
        first--;
    }
    for (let i = Math.max(first, 0); i < spans.length && spans[i].start <= tick; i++) {
        if (tick < spans[i].end) {
            return i;
        }
    }
    return -1;
}

/** The chord sounding at a tick (N.C. → null). */
export function chordAt(timeline: Timeline, tick: number): ChordFacts | null {
    return timeline.spans[spanIndexAt(timeline, tick)]?.chord ?? null;
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
