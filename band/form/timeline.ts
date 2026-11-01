/**
 * Score → Timeline. The one place where authored form (repeats, endings, D.C./D.S., bar
 * repeats) and rational durations become performed bars in integer ticks. Everything
 * downstream reads the timeline and never the score.
 *
 * Unlike the old step grid, nothing here rejects music for what it says: holds extend the chord
 * before them, N.C. is a span with no chord, fermatas stretch time, and any meter/grouping the
 * codec accepts gets a pulse skeleton. The one refusal is for size (`MAX_PERFORMED_SPANS`).
 */

import { resolveScoreContext } from '../../core/songbook/score-context.js';
import { addScoreDurations } from '../../core/songbook/score-duration.js';
import { compileScoreForm } from '../../core/songbook/score-form.js';
import { resolveScoreMeasureEvents } from '../../core/songbook/score-measure-events.js';
import type { ScoreDuration, SemanticScore } from '../../core/songbook/score-types.js';
import { type Lane, PPQ } from '../core/types.js';
import { type ChordFacts, parseChord } from '../theory/chord.js';
import { type KeyContext, notePc } from '../theory/pitch.js';
import { buildMeter, type Meter } from './meter.js';

/**
 * The most chord events a performance may play, inclusive: exactly this many is accepted, one
 * more is refused. `compileScoreForm` caps performed bars and `resolveScoreMeasureEvents` caps
 * written events, but neither caps their product (bars x events per bar x choruses), so the
 * count is checked here, from the performed bar order, before any span exists (#1632). Hold
 * events that extend the chord before them still count: the bound is an upper bound on spans.
 */
export const MAX_PERFORMED_SPANS = 65_536;

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

/**
 * What a section *is*, for every choice the band keeps per section: its label with the repeat
 * mark stripped (A, A2, A3, A′ all read "a"; "Intro", "Bridge" stay whole words), lower-cased.
 * A section with no letter left (unlabelled, or only digits) is told apart by its position.
 * A2 is the A again, so it gets the A's groove and the A's tune.
 */
export function sectionKey(visit: Pick<SectionVisit, 'label' | 'sectionIndex'>): string {
    const letter = visit.label
        .trim()
        .toLowerCase()
        .replace(/[\d\s'\u2032\u2019\u02b9]+$/u, '');
    return letter || `#${visit.sectionIndex}`;
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
     * Set when the performance ends in a written coda: its last bar was reached through a coda
     * hop — a D.C./D.S. al Coda's, or a counted chart's last-chorus coda (#1472) — so it is the
     * chart's own ending and the band holds it as written (`arrange/ending.ts`). Absent
     * otherwise, so every other timeline is shaped exactly as before.
     */
    coda?: true;
}

function durationTicks([n, d]: Readonly<ScoreDuration>): number {
    return Math.round((n * PPQ) / d);
}

/**
 * Where a bar's events start, in ticks from the barline, and then where the last one ends:
 * each event's exact place in the bar, rounded once (#1684). Rounding each length instead let
 * the errors add up — 63 chords of 0.6 ticks took a tick each and ran 25 ticks past the
 * barline. The stand's slots (`bandChart`) use the same boundaries, so they meet the spans.
 */
export function eventBoundaries(
    events: readonly { duration: Readonly<ScoreDuration> }[],
): number[] {
    const boundaries = [0];
    let elapsed: ScoreDuration = [0, 1];
    for (const event of events) {
        elapsed = addScoreDurations(elapsed, event.duration);
        boundaries.push(durationTicks(elapsed));
    }
    return boundaries;
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

/**
 * Refuse a chart that performs more than `MAX_PERFORMED_SPANS` chord events, counting from the
 * written events and the performed bar order alone: no event is copied and no span built. A
 * measure repeat counts as its source's events, the length `resolveScoreMeasureEvents` gives it.
 */
function checkPerformedSpans(
    score: SemanticScore,
    visits: readonly { sectionIndex: number; measureIndex: number }[],
): void {
    const written = new Map<string, number>();
    const counts = score.sections.map((section) =>
        section.measures.map((measure) => {
            const { content } = measure;
            const count =
                content.kind === 'events'
                    ? content.events.length
                    : (written.get(content.measureId) ?? 0);
            written.set(measure.id, count);
            return count;
        }),
    );
    let performed = 0;
    for (const { sectionIndex, measureIndex } of visits) {
        performed += counts[sectionIndex][measureIndex];
        if (performed > MAX_PERFORMED_SPANS) {
            throw new Error(
                `This chart plays more than the playback limit of ${MAX_PERFORMED_SPANS.toLocaleString('en-US')} chord events. Reduce repeats${score.choruses !== undefined ? ', choruses' : ''} or chords per bar.`,
            );
        }
    }
}

export function compileTimeline(score: SemanticScore): Timeline {
    const visitsWritten = compileScoreForm(score);
    checkPerformedSpans(score, visitsWritten);
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
        const barEvents = events[written.sectionIndex][written.measureIndex];
        const boundaries = eventBoundaries(barEvents);
        for (const [i, event] of barEvents.entries()) {
            const at = tick + boundaries[i];
            const length = boundaries[i + 1] - boundaries[i];
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
        }
        // The codec guarantees the events fill the bar exactly, and a bar is a whole number of
        // ticks (a sixteenth unit at the finest), so the last event ends on the barline.
        tick += meter.barTicks;
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

    const coda = endsInCoda(score, visitsWritten.at(-1));
    return {
        bars,
        visits,
        spans,
        ticks: tick,
        stretches,
        ...(coda ? { coda: true as const } : {}),
    };
}

/**
 * Does the performance end in a coda? Every coda hop (a jump "al Coda", or a last-chorus coda)
 * lands on a written coda marker that follows its departure (the score form refuses a backward
 * one) and plays on from there. So the performance ends in a coda when its last bar is written
 * at or after a coda arrival: the measure a `start` marker sits on, or the one after an `end`
 * marker. An uncounted chart never takes its last-chorus coda, so its last bar comes before
 * that arrival and it does not end in one.
 */
function endsInCoda(
    score: SemanticScore,
    last: { sectionIndex: number; measureIndex: number } | undefined,
): boolean {
    if (!last) {
        return false;
    }
    const arrivals = new Set<string>();
    const markers: { label: string; at: number }[] = [];
    let position = 0;
    let lastAt = -1;
    score.sections.forEach((section, s) => {
        section.measures.forEach((measure, m) => {
            if (s === last.sectionIndex && m === last.measureIndex) {
                lastAt = position;
            }
            for (const [edge, directions] of [
                ['start', measure.start],
                ['end', measure.end],
            ] as const) {
                for (const direction of directions ?? []) {
                    if (direction.kind === 'coda') {
                        markers.push({
                            label: direction.label,
                            at: position + (edge === 'end' ? 1 : 0),
                        });
                    } else if (
                        (direction.kind === 'last-chorus' || direction.kind === 'jump') &&
                        direction.destination.kind === 'coda'
                    ) {
                        arrivals.add(direction.destination.target);
                    }
                }
            }
            position++;
        });
    });
    return markers.some(({ label, at }) => arrivals.has(label) && lastAt >= at);
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
 * `start <= tick < end` answers, without the scan (`firstSpanAfter`). What the search relies
 * on: spans run end to end in order, each starting where the one before ends, because each
 * boundary is an event's exact place in its bar rounded once (#1684). A span can be empty (a
 * chord shorter than half a tick), so the walk forward steps over one sitting on `tick`.
 * Pinned against the scan by the property test in `timeline.test.ts`.
 */
export function spanIndexAt(timeline: Timeline, tick: number): number {
    const { spans } = timeline;
    const first = firstSpanAfter(timeline, tick) - 1;
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

/** The performed bar `tick` falls in, or null past either end of the timeline. */
export function barAtTick(timeline: Timeline, tick: number): Bar | null {
    const { bars } = timeline;
    let lo = 0;
    let hi = bars.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const bar = bars[mid];
        if (tick < bar.start) {
            hi = mid - 1;
        } else if (tick >= bar.start + bar.meter.barTicks) {
            lo = mid + 1;
        } else {
            return bar;
        }
    }
    return null;
}

interface StretchIndex {
    /** Each stretch's start and end: in order, and never overlapping (#1684). */
    starts: Float64Array;
    ends: Float64Array;
    /** The ticks of written time all the stretches before each one add, played whole. */
    added: Float64Array;
}

// Keyed by the array itself: a compiled timeline's stretches are never edited afterwards
// (`compileTimeline` is the only writer), so an index built once stays true.
const STRETCH_INDEX = new WeakMap<Timeline['stretches'], StretchIndex>();

function stretchIndex(stretches: Timeline['stretches']): StretchIndex {
    let index = STRETCH_INDEX.get(stretches);
    if (!index) {
        index = {
            starts: new Float64Array(stretches.length),
            ends: new Float64Array(stretches.length),
            added: new Float64Array(stretches.length + 1),
        };
        stretches.forEach((s, i) => {
            index!.starts[i] = s.start;
            index!.ends[i] = s.end;
            index!.added[i + 1] = index!.added[i] + (s.end - s.start) * (s.factor - 1);
        });
        STRETCH_INDEX.set(stretches, index);
    }
    return index;
}

/** The first index whose value is past `limit` (or at it, when `inclusive`); the length if none. */
function firstPast(ascending: Float64Array, limit: number, inclusive: boolean): number {
    let lo = 0;
    let hi = ascending.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (ascending[mid] > limit || (inclusive && ascending[mid] === limit)) {
            hi = mid;
        } else {
            lo = mid + 1;
        }
    }
    return lo;
}

/**
 * Seconds from tick 0 to `tick` at `bpm`, honouring fermata stretches. Every scheduled event
 * asks, and a chart may write tens of thousands of fermatas, so the stretches that are over by
 * `tick` are read off a running total (`stretchIndex`) found by binary search (#1665). Only the
 * stretch `tick` falls inside, if any, is measured on its own: stretches never overlap (#1684).
 */
export function secondsAt(timeline: Timeline, tick: number, bpm: number): number {
    const perTick = 60 / bpm / PPQ;
    const { stretches } = timeline;
    if (!stretches.length) {
        return tick * perTick;
    }
    const { starts, ends, added } = stretchIndex(stretches);
    // Stretches count up to the first that starts at or after `tick`; those before the first
    // still going at `tick` count whole.
    const started = firstPast(starts, tick, true);
    const over = Math.min(started, firstPast(ends, tick, false));
    let ticks = tick + added[over];
    for (let i = over; i < started; i++) {
        const s = stretches[i];
        ticks += (Math.min(tick, s.end) - s.start) * (s.factor - 1);
    }
    return ticks * perTick;
}
