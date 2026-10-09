/**
 * The engine: `(timeline, settings, pass) → BandEvent[]`. One pure function; live playback,
 * MIDI export and audio export all consume what it returns, so they cannot disagree.
 *
 * Per bar, lanes play in a fixed order — drums, bass, lead, then comp — and each later lane
 * hears what the earlier ones played (`heard`), so the comp can answer the lead. That is the whole coordination model: data
 * flowing one way, not a blackboard every lane writes.
 */
import { heldEnding } from './arrange/ending.js';
import { type BarPlan, fullWindow, type PassWindow, planBars } from './arrange/plan.js';
import { rng } from './core/random.js';
import type { BandEvent, BandSettings, DrumHit, Lane, PitchedNote } from './core/types.js';
import { applyFeel } from './feel/feel.js';
import { chorusBars, firstSpanAfter, type Timeline } from './form/timeline.js';
import { COMP_INSTRUMENTS } from './players/comp/instruments.js';
import { LEAD_INSTRUMENTS } from './players/lead/instruments.js';
import { feelFor, STYLES } from './styles/index.js';
import type { BarContext, DrumIdiom, PitchedIdiom } from './styles/types.js';
import { nearestMidi } from './theory/pitch.js';

/**
 * What each lane remembers across bars (and across passes of a looping song), plus the last
 * bass note sounded — the pitch a fermata's held bass is found near (`holdFermatas`). A lane
 * owns its own memory, but the fermata is written over the whole pass after the lanes play, so
 * its reference is carried here for a pass that resumes on (or starts at) a fermata bar.
 * `at` is the song tick the memory stands at — the barline before the next bar to play — so a
 * pass that begins somewhere else (a loop's wrap back to its top) knows the performance jumped.
 */
export type PassMemory = Record<Lane, unknown> & { lastBass?: number; at?: number };

export interface PassOptions {
    /**
     * 0 for the first time through the song, 1 for the next… A
     * counted chart's timeline holds all its choruses, and each bar's chorus is added to this
     * (`planBars`'s `passAt`), so one pass over it plays every chorus as its own time through.
     */
    pass: number;
    /** Whether the performance continues after this pass (fills lead on; no ending). */
    looping: boolean;
    /** The memory left by whatever played just before this pass's first bar. */
    memory?: PassMemory;
    /** The bars to play, in order, and where they lead. Defaults to the whole song. */
    window?: PassWindow;
    /**
     * Return only the window's bars before this one; the window still says where the
     * performance goes and where it ends. A counted chart's live performance is generated a
     * chorus at a time (`BandHost`), each chorus resuming from the memory the one before left,
     * as a settings change resumes a pass at a barline. The bars past `until` are played and
     * dropped — one, and on while the comp has neither struck again nor reached a rest (an N.C.
     * or a bar it sits out), but never past the end of the next chorus — so what the whole pass
     * does across that barline (a held organ chord, a comp voice yielding to the lead) is done
     * here too: the chunks join into the whole pass, event for event. (The organ re-presses a
     * held chord at each phrase top, so the look never needs the cap; a comp that never struck
     * again would have its hold end there.) `memory` is then the memory before bar `until`.
     * Defaults to the window's end.
     */
    until?: number;
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
    const until = Math.min(options.until ?? window.to, window.to);
    // The bars actually played: past a chunk's end, a look across its barline (above) — at
    // least one bar, and on until the comp strikes again or rests, since a sustaining comp
    // holds its last chord to its next strike, which can be bars away. Capped at the end of
    // the next chorus, so a chunk costs at most two choruses' bars: chunks are generated on
    // the main thread inside the scheduler's 150 ms lookahead. On a real comp it never binds
    // (a sustaining comp re-presses a held chord at each phrase top); it bounds the cost all
    // the same.
    let through = Math.min(until + 1, window.to);
    const lookLimit =
        until < window.to ? Math.min(chorusBars(timeline, until).end, window.to) : window.to;
    // Trading with the drummer needs a drummer who can solo in this style.
    const drumSolos = Boolean(style.drums.solos);
    // Planned only as far as the look can reach, and the bar it leads into: a chunk of a long
    // counted performance costs its own bars, not the whole timeline's.
    const plans = planBars(timeline, settings, {
        ...options,
        window,
        planned: lookLimit + 1,
        drumSolos,
    });
    // Where the pass wraps, the next bar belongs to the next pass, whose lanes can differ (the
    // fours may open with the drummer alone): what it plays is taken from that pass's plan.
    // That next pass is always a fresh one from the top, never a resume, so its own origin is
    // reset to its `from` — not inherited from `window.origin`, which `{ ...window }` would
    // otherwise carry over from a resumed `window` here.
    const wrapPlan = options.looping
        ? planBars(timeline, settings, {
              pass: options.pass + 1,
              looping: true,
              window: { ...window, from: 0, origin: 0 },
              drumSolos,
          })[0]
        : undefined;
    const memory: PassMemory = options.memory
        ? { ...options.memory }
        : {
              drums: style.drums.init(),
              bass: style.bass.init(),
              comp: comp.init(),
              lead: lead?.init() ?? null,
          };
    const { bars } = timeline;
    // A loop's next lap continues from the memory the lap before left at its end, but in the
    // new lap's own ticks: what a lane remembers by song tick (the comp: where the lead's last
    // note ends) is moved by the jump back, so the top of a lap hears the lead as the top of
    // the same chorus counted does (#1492). A resume, or a counted chorus, starts where its
    // memory stands, and moves nothing.
    const jump = options.memory?.at === undefined ? 0 : bars[window.from].start - options.memory.at;
    if (jump !== 0) {
        const idioms: [Lane, PitchedIdiom | DrumIdiom | undefined][] = [
            ['drums', style.drums],
            ['bass', style.bass],
            ['lead', lead],
            ['comp', comp],
        ];
        for (const [lane, idiom] of idioms) {
            if (idiom?.rebase) {
                memory[lane] = idiom.rebase(memory[lane], jump);
            }
        }
    }
    // The held ending (`arrange/ending.ts`): a pass that ends resolves a final turnaround to
    // the tonic. Only the ending bar is played on it; every bar before it hears the chart.
    const ending = options.looping ? null : heldEnding(timeline, window.to - 1, style.ending);
    const events: BandEvent[] = [];
    const snapshots: PassMemory[] = [];

    for (let i = window.from; i < through; i++) {
        const bar = bars[i];
        const plan = plans[i];
        // The band's pass at this bar: a counted chart's chorus is its time through the song.
        const pass = options.pass + bar.visit.chorus;
        // And its place in the form: seeds are keyed on it, so chorus k plays what lap k plays.
        const place = i - chorusBars(timeline, i).first;
        snapshots[i] = { ...memory, at: bar.start };
        const last = i === window.to - 1;
        const nextIndex = i + 1 < window.to ? i + 1 : options.looping ? 0 : -1;
        // The bar after the window is planned by the pass that plays it. "Is the next bar an
        // arrival/ending" a wrap resolves the same way; who plays it comes from `wrapPlan`.
        const wrapped = plans[nextIndex] ?? {
            ...plan,
            crash: nextIndex >= 0,
            ending: false,
            fill: 'none',
        };
        const nextPlan =
            last && wrapPlan ? { ...wrapped, lanes: wrapPlan.lanes, lead: wrapPlan.lead } : wrapped;
        const heard: BarContext['heard'] = { drums: [], bass: [], lead: [] };
        const barFirst = events.length;
        const context = (lane: Lane): BarContext => ({
            timeline,
            bar: plan.ending && ending?.index === i ? ending : bar,
            plan,
            // The bar before the held ending hears the chord the band is about to hold, so its
            // approach notes walk into the tonic rather than into a turnaround nobody plays.
            next:
                nextIndex >= 0
                    ? {
                          bar:
                              nextPlan.ending && ending?.index === nextIndex
                                  ? ending
                                  : bars[nextIndex],
                          plan: nextPlan,
                          wraps: last,
                      }
                    : null,
            heard,
            instrument,
            lead: leadProfile,
            pass,
            looping: options.looping,
            ending,
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
                      : rng(settings.seed, style.id, lane, pass, place, purpose),
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
        if (plan.ending) {
            // A written stop in the last bar (`G7:2 N.C.:2`): the held ending sounds up to it
            // and no further, resolved or not. The lanes hold their last chord for the bar.
            const played = ending?.index === i ? ending : bar;
            const rest = played.spans.find((span, k) => k > 0 && !span.chord);
            for (let k = barFirst; rest && k < events.length; k++) {
                const e = events[k];
                if (e.lane !== 'drums' && e.tick < rest.start && e.tick + e.dur > rest.start) {
                    events[k] = { ...e, dur: rest.start - e.tick };
                }
            }
        }
        const looking = i === through - 1 && i >= until && through < lookLimit;
        if (
            looking &&
            plan.lanes.comp &&
            !bar.spans.some((s) => !s.chord) &&
            !events.some((e) => e.lane === 'comp' && !e.muted && e.bar >= until)
        ) {
            through++;
        }
    }

    // The bar after the last one played is planned only so it knows where it leads; nothing
    // below may write into it.
    const played = through < window.to ? plans.slice(0, through) : plans;
    const yielded = instrument.family === 'keyboard' ? yieldToLead(events) : events;
    const fermatas = holdFermatas(yielded, timeline, played, options.memory?.lastBass);
    // Each snapshot (and the memory the next pass continues from) takes the last bass note
    // sounded before its barline, after the fermatas have been held — what the full pass's
    // `holdFermatas` hears from a later fermata, whatever bar a resume starts at.
    const bassLine = fermatas
        .filter((e): e is PitchedNote => e.lane === 'bass')
        .sort((a, b) => a.tick - b.tick);
    let lastBass = options.memory?.lastBass;
    let next = 0;
    for (let i = window.from; i < through; i++) {
        while (next < bassLine.length && bassLine[next].tick < bars[i].start) {
            lastBass = bassLine[next++].midi;
        }
        snapshots[i].lastBass = lastBass;
    }
    memory.lastBass = bassLine.at(-1)?.midi ?? lastBass;
    const lastPlayed = bars[through - 1];
    memory.at = lastPlayed.start + lastPlayed.meter.barTicks;
    // Where the last strike's hold may reach. A chunk that looked past its end and stopped
    // short of the performance's end: a rest or tacet bar it saw, else where the look ended
    // (the cap). Otherwise the end of the pass — a looping pass's next lap presses anew at its
    // top, and a whole pass ends there (#1488).
    const horizon =
        through > until && through < window.to
            ? bars[through].start
            : lastPlayed.start + lastPlayed.meter.barTicks;
    const held =
        instrument.legato && !comp.percussive
            ? sustain(fermatas, timeline, played, horizon)
            : fermatas;
    const felt = applyFeel(held, timeline, feelFor(style, instrument.family), {
        ...settings,
        strumMs: instrument.strumMs,
    });
    felt.sort((a, b) => a.tick - b.tick || laneOrder(a) - laneOrder(b));
    const lastSnapshot = snapshots[until];
    if (through > until) {
        // The look across the barline is dropped: the next chunk plays that bar itself, from
        // the memory before it.
        snapshots.length = until;
        return {
            events: felt.filter((e) => e.bar < until),
            memory: lastSnapshot,
            snapshots,
        };
    }
    return { events: felt, memory, snapshots };
}

/**
 * The comp gives the lead its register. While the lead sounds, a keyboard voice at or above
 * it (within a half step) drops an octave, the way a pianist moves the right hand's voicing
 * down under a horn — never below middle C, where a dropped voice would muddy the chord, and
 * never beneath the chord's own bottom note (a power chord keeps its root under its 5th). A
 * voice that can't go down, and that a voice staying in the chord doubles, is left out
 * instead. The chord keeps its pitch classes either way. A guitar's grip is its hand shape, so
 * it stays.
 */
function yieldToLead(events: BandEvent[]): BandEvent[] {
    const lead = events.filter((e): e is PitchedNote => e.lane === 'lead');
    if (!lead.length) {
        return events;
    }
    const comp = events.filter((e): e is PitchedNote => e.lane === 'comp' && !e.muted);
    const chords = new Map<number, PitchedNote[]>();
    for (const c of comp) {
        chords.set(c.tick, [...(chords.get(c.tick) ?? []), c]);
    }
    const dropped = new Map<BandEvent, BandEvent | null>();
    for (const notes of chords.values()) {
        // Top voice first: the one most in the lead's way, and the one a doubling gives up.
        const voices = [...notes].sort((a, b) => b.midi - a.midi);
        const bottom = Math.min(...voices.map((v) => v.midi));
        const sounding = new Set(voices.map((v) => v.midi));
        for (const c of voices) {
            let under = Number.POSITIVE_INFINITY;
            for (const l of lead) {
                if (l.tick < c.tick + c.dur && l.tick + l.dur > c.tick) {
                    under = Math.min(under, l.midi);
                }
            }
            if (c.midi < under - 1) {
                continue;
            }
            const down = c.midi - 12;
            if (down >= 60 && !sounding.has(down) && (c.midi === bottom || down > bottom)) {
                dropped.set(c, { ...c, midi: down });
                sounding.delete(c.midi);
                sounding.add(down);
            } else if ([...sounding].some((m) => m !== c.midi && (m - c.midi) % 12 === 0)) {
                dropped.set(c, null);
                sounding.delete(c.midi);
            }
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
 * lets go at an N.C., which is a rest for the whole band, and at a bar the comp sits out.
 */
function sustain(
    events: BandEvent[],
    timeline: Timeline,
    plans: BarPlan[],
    horizon: number,
): BandEvent[] {
    const strikes = [
        ...new Set(events.filter((e) => e.lane === 'comp' && !e.muted).map((e) => e.tick)),
    ].sort((a, b) => a - b);
    // A bar the comp sits out (a tacet section, the drummer's four) is silence, not a hold.
    const tacet = timeline.bars.filter((bar) => plans[bar.index]?.lanes.comp === false);
    const until = new Map<number, number>();
    strikes.forEach((tick, i) => {
        // The last strike has no next one in what was played: it holds to `horizon` — the end
        // of the pass, or, in a chunk that looked past its end, the rest or tacet bar the look
        // stopped at, or the look's end. (A last strike that let go at the end of its bar
        // left a one-chord vamp silent from its second bar on, and a loop silent after the
        // chord its last change struck: #1488.)
        const next = strikes[i + 1] ?? horizon;
        // The first N.C. starting after the strike and before `next` (spans are in order).
        let rest: (typeof timeline.spans)[number] | undefined;
        for (
            let j = firstSpanAfter(timeline, tick);
            j < timeline.spans.length && timeline.spans[j].start < next;
            j++
        ) {
            if (!timeline.spans[j].chord) {
                rest = timeline.spans[j];
                break;
            }
        }
        const out = tacet.find((bar) => bar.start > tick && bar.start < next);
        until.set(tick, Math.min(rest ? rest.start : next, out ? out.start : next));
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
    lastBassBefore: number | undefined,
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
            // The latest bass note before the span — by tick, since an earlier fermata's held
            // note is appended after the notes that follow it. None in this pass (it resumed
            // here) → the one sounded before the pass began.
            let lastBass: PitchedNote | undefined;
            for (const e of before) {
                if (e.lane === 'bass' && (!lastBass || e.tick >= lastBass.tick)) {
                    lastBass = e;
                }
            }
            const midi = nearestMidi(
                span.chord.bass,
                lastBass?.midi ?? lastBassBefore ?? 38,
                28,
                52,
            );
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
