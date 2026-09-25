/**
 * The engine: `(timeline, settings, pass) → BandEvent[]`. One pure function; live playback,
 * MIDI export and audio export all consume what it returns, so they cannot disagree.
 *
 * Per bar, lanes play in a fixed order — drums, bass, lead, then comp — and each later lane
 * hears what the earlier ones played (`heard`), so the comp can answer the lead. That is the whole coordination model: data
 * flowing one way, not a blackboard every lane writes.
 */
import { fullWindow, type PassWindow, planBars } from './arrange/plan.js';
import { rng } from './core/random.js';
import type { BandEvent, BandSettings, DrumHit, Lane, PitchedNote } from './core/types.js';
import { applyFeel } from './feel/feel.js';
import type { Timeline } from './form/timeline.js';
import { COMP_INSTRUMENTS } from './players/comp/instruments.js';
import { LEAD_INSTRUMENTS } from './players/lead/instruments.js';
import { feelFor, STYLES } from './styles/index.js';
import type { BarContext } from './styles/types.js';
import { nearestMidi } from './theory/pitch.js';

/** What each lane remembers across bars (and across passes of a looping song). */
export type PassMemory = Record<Lane, unknown>;

export interface PassOptions {
    /** 0 for the first time through the song (or the first lap of a loop), 1 for the next… */
    pass: number;
    /** Whether the performance continues after this pass (fills lead on; no ending). */
    looping: boolean;
    /** The memory left by whatever played just before this pass's first bar. */
    memory?: PassMemory;
    /** The bars to play, in order, and where they lead. Defaults to the whole song. */
    window?: PassWindow;
}

export interface PassResult {
    /** Events sorted by tick (after feel), with ticks relative to the start of the song. */
    events: BandEvent[];
    /** The memory after the last bar — what the next pass continues from. */
    memory: PassMemory;
    /** The memory *before* each bar played, by bar index — to resume at any barline. */
    snapshots: PassMemory[];
}

export function performPass(
    timeline: Timeline,
    settings: BandSettings,
    options: PassOptions,
): PassResult {
    const style = STYLES[settings.style];
    const instrument = COMP_INSTRUMENTS[settings.comp];
    const comp = style.comp[instrument.family];
    const lead = style.lead?.idiom;
    const leadProfile = LEAD_INSTRUMENTS[settings.lead];
    const window = options.window ?? fullWindow(timeline);
    const plans = planBars(timeline, settings, { ...options, window });
    const memory: PassMemory = options.memory
        ? { ...options.memory }
        : {
              drums: style.drums.init(),
              bass: style.bass.init(),
              comp: comp.init(),
              lead: lead?.init() ?? null,
          };
    const { bars } = timeline;
    const events: BandEvent[] = [];
    const snapshots: PassMemory[] = [];

    for (let i = window.from; i < window.to; i++) {
        const bar = bars[i];
        const plan = plans[i];
        snapshots[i] = { ...memory };
        const nextIndex = i + 1 < window.to ? i + 1 : options.looping ? window.wrapTo : -1;
        // The bar after the window is planned by the pass that plays it; its plan is only
        // needed for "is the next bar an arrival/ending", which a wrap resolves the same way.
        const nextPlan = plans[nextIndex] ?? {
            ...plan,
            crash: nextIndex >= 0,
            ending: false,
            fill: 'none',
        };
        const heard: BarContext['heard'] = { drums: [], bass: [], lead: [] };
        const context = (lane: Lane): BarContext => ({
            timeline,
            bar,
            plan,
            next: nextIndex >= 0 ? { bar: bars[nextIndex], plan: nextPlan } : null,
            heard,
            instrument,
            lead: leadProfile,
            pass: options.pass,
            looping: options.looping,
            rng: (purpose, scope = 'bar') =>
                scope === 'song'
                    ? rng(settings.seed, style.id, lane, 'song', purpose)
                    : scope === 'section'
                      ? rng(
                            settings.seed,
                            style.id,
                            lane,
                            'section',
                            bar.visit.sectionIndex,
                            purpose,
                        )
                      : rng(settings.seed, style.id, lane, options.pass, bar.index, purpose),
        });
        if (plan.lanes.drums) {
            const out = style.drums.play(context('drums'), memory.drums);
            memory.drums = out.memory;
            heard.drums = out.events as DrumHit[];
            events.push(...out.events);
        }
        if (plan.lanes.bass) {
            const out = style.bass.play(context('bass'), memory.bass);
            memory.bass = out.memory;
            heard.bass = out.events as PitchedNote[];
            events.push(...out.events);
        }
        if (plan.lanes.lead && lead) {
            const out = lead.play(context('lead'), memory.lead);
            memory.lead = out.memory;
            heard.lead = out.events as PitchedNote[];
            events.push(...out.events);
        }
        if (plan.lanes.comp) {
            const out = comp.play(context('comp'), memory.comp);
            memory.comp = out.memory;
            events.push(...out.events);
        }
    }

    const yielded = instrument.family === 'keyboard' ? yieldToLead(events) : events;
    const fermatas = holdFermatas(yielded, timeline, plans);
    const held = instrument.legato && !comp.percussive ? sustain(fermatas, timeline) : fermatas;
    const felt = applyFeel(held, timeline, feelFor(style, instrument.family), {
        ...settings,
        strumMs: instrument.strumMs,
    });
    felt.sort((a, b) => a.tick - b.tick || laneOrder(a) - laneOrder(b));
    return { events: felt, memory, snapshots };
}

/**
 * The comp gives the lead its register. While the lead sounds, a keyboard voice at or above
 * it (within a half step) drops an octave, the way a pianist moves the left hand's voicing
 * down under a horn — never below middle C, where a dropped voice would muddy the chord; a
 * voice that can't go down, and that another voice already doubles, is left out instead. The
 * chord keeps its pitch classes either way. A guitar's grip is its hand shape, so it stays.
 */
function yieldToLead(events: BandEvent[]): BandEvent[] {
    const lead = events.filter((e): e is PitchedNote => e.lane === 'lead');
    if (!lead.length) {
        return events;
    }
    const comp = events.filter((e): e is PitchedNote => e.lane === 'comp' && !e.muted);
    const dropped = new Map<BandEvent, BandEvent | null>();
    for (const c of comp) {
        let under = Number.POSITIVE_INFINITY;
        for (const l of lead) {
            if (l.tick < c.tick + c.dur && l.tick + l.dur > c.tick) {
                under = Math.min(under, l.midi);
            }
        }
        if (c.midi < under - 1) {
            continue;
        }
        const chord = comp.filter((o) => o.tick === c.tick && o !== c);
        if (c.midi - 12 >= 60 && !chord.some((o) => o.midi === c.midi - 12)) {
            dropped.set(c, { ...c, midi: c.midi - 12 });
        } else if (chord.some((o) => (o.midi - c.midi) % 12 === 0)) {
            dropped.set(c, null);
        }
    }
    if (!dropped.size) {
        return events;
    }
    return events.flatMap((e) => {
        const replaced = dropped.get(e);
        return replaced === undefined ? [e] : replaced ? [replaced] : [];
    });
}

/**
 * A sustaining instrument (the organ) holds every chord until the next one is struck, across
 * barlines too — the idioms play one bar at a time, so this is done once over the pass. It
 * lets go at an N.C., which is a rest for the whole band.
 */
function sustain(events: BandEvent[], timeline: Timeline): BandEvent[] {
    const strikes = [
        ...new Set(events.filter((e) => e.lane === 'comp' && !e.muted).map((e) => e.tick)),
    ].sort((a, b) => a - b);
    const until = new Map<number, number>();
    strikes.forEach((tick, i) => {
        const next = strikes[i + 1];
        if (next === undefined) {
            return;
        }
        const rest = timeline.spans.find((s) => !s.chord && s.start > tick && s.start < next);
        until.set(tick, rest ? rest.start : next);
    });
    return events.map((e) => {
        const end = e.lane === 'comp' && !e.muted ? until.get(e.tick) : undefined;
        return end !== undefined && e.lane === 'comp' && end - e.tick > e.dur
            ? { ...e, dur: end - e.tick }
            : e;
    });
}

const LANE_ORDER: Record<BandEvent['lane'], number> = { drums: 0, bass: 1, comp: 2, lead: 3 };
const laneOrder = (e: BandEvent) => LANE_ORDER[e.lane];

/**
 * A fermata is a held chord, not a slow groove: whatever the idioms played inside a fermata
 * span is replaced by one crash-and-kick, one held bass note, the comp's first chord and the
 * lead's note if it struck one there, all ringing to the end of the (stretched) span. A fermata on a hold ties over: nothing new is
 * struck, and the notes already sounding are extended through it.
 */
function holdFermatas(
    events: BandEvent[],
    timeline: Timeline,
    plans: { lanes: Record<Lane, boolean> }[],
): BandEvent[] {
    const spans = timeline.spans.filter((s) => s.fermata);
    if (!spans.length) {
        return events;
    }
    let out = events;
    for (const span of spans) {
        const inside = (e: BandEvent) => e.tick >= span.start && e.tick < span.end;
        const barIndex = timeline.bars.findIndex(
            (b) => b.start <= span.start && span.start < b.start + b.meter.barTicks,
        );
        const plan = plans[barIndex];
        if (!plan) {
            continue; // outside this pass's window
        }
        const compAtStart = out.filter((e) => e.lane === 'comp' && e.tick === span.start);
        // The lead's note on the fermata is held with the band; anything after it goes.
        const leadAtStart = out.filter((e) => e.lane === 'lead' && e.tick === span.start);
        const before = out.filter((e) => e.tick < span.start);
        out = out.filter((e) => !inside(e));
        if (span.tied) {
            // Extend the last bass note and the last comp chord through the fermata.
            let bassTick = -1;
            let compTick = -1;
            for (const e of before) {
                if (e.lane === 'bass') {
                    bassTick = Math.max(bassTick, e.tick);
                } else if (e.lane === 'comp' && !e.muted) {
                    compTick = Math.max(compTick, e.tick);
                }
            }
            out = out.map((e) =>
                (e.lane === 'bass' && e.tick === bassTick) ||
                (e.lane === 'comp' && !e.muted && e.tick === compTick)
                    ? { ...e, dur: span.end - e.tick }
                    : e,
            );
            continue;
        }
        const length = span.end - span.start;
        if (plan.lanes.drums) {
            out.push(
                {
                    lane: 'drums',
                    piece: 'crash',
                    tick: span.start,
                    velocity: 100,
                    offsetMs: 0,
                    bar: barIndex,
                },
                {
                    lane: 'drums',
                    piece: 'kick',
                    tick: span.start,
                    velocity: 96,
                    offsetMs: 0,
                    bar: barIndex,
                },
            );
        }
        if (plan.lanes.bass && span.chord) {
            let lastBass: PitchedNote | undefined;
            for (const e of before) {
                if (e.lane === 'bass') {
                    lastBass = e;
                }
            }
            const midi = nearestMidi(span.chord.bass, lastBass?.midi ?? 38, 28, 52);
            out.push({
                lane: 'bass',
                midi,
                tick: span.start,
                dur: length,
                velocity: 92,
                offsetMs: 0,
                bar: barIndex,
            });
        }
        out.push(...compAtStart.map((e) => ({ ...e, dur: length })));
        out.push(...leadAtStart.map((e) => ({ ...e, dur: length })));
    }
    return out;
}
