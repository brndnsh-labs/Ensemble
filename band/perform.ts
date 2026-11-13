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
import {
    type BandEvent,
    type BandSettings,
    type DrumHit,
    type Lane,
    type PitchedNote,
    PPQ,
} from './core/types.js';
import { applyFeel } from './feel/feel.js';
import {
    type Bar,
    barAtTick,
    type ChordSpan,
    chorusBars,
    firstSpanAfter,
    sectionKey,
    type Timeline,
} from './form/timeline.js';
import { COMP_INSTRUMENTS } from './players/comp/instruments.js';
import { LEAD_INSTRUMENTS } from './players/lead/instruments.js';
import { feelFor, STYLES } from './styles/index.js';
import type { BarContext, DrumIdiom, EndingGesture, PitchedIdiom } from './styles/types.js';
import { nearestMidi } from './theory/pitch.js';

/**
 * What each lane remembers across bars (and across passes of a looping song), plus the last
 * bass note sounded — the pitch a fermata's held bass is found near (`holdFermatas`). A lane
 * owns its own memory, but the fermata is written over the whole pass after the lanes play, so
 * its reference is carried here for a pass that resumes on (or starts at) a fermata bar.
 * `at` is the song tick the memory stands at — the barline before the next bar to play — so a
 * pass that begins somewhere else (a loop's wrap back to its top) knows the performance jumped.
 */
export type PassMemory = Record<Lane, unknown> & {
    lastBass?: number;
    at?: number;
    /**
     * The lead's notes struck before the barline and still sounding across it (a pushed arrival
     * tied over it, #2164; a head's held note) — what the keyboard yields its register to there
     * (`yieldToLead`), carried as `lastBass` is, since a pass resumed on the barline never plays
     * the bar that struck them.
     */
    leadSounding?: PitchedNote[];
};

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
     * performance goes and where it ends. The live performance is generated in chunks
     * (`BandHost`): a counted chart's a chorus at a time, an uncounted pass at most 32 bars at
     * a time (#1665), each resuming from the memory the one before left, as a settings change
     * resumes a pass at a barline. The bars past `until` are played and dropped — one, and on
     * while the comp has neither struck again nor reached a rest (an N.C. or a bar it sits
     * out), but never past the end of the next chorus nor more than `LOOK_BARS` past `until` —
     * so what the whole pass
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
    // the main thread inside the scheduler's 150 ms lookahead. And never more than `LOOK_BARS`
    // past it: an uncounted chart is one chorus, so a chunk of a long one (#1665) would plan
    // every bar left in the song. On a real comp neither cap binds (a sustaining comp
    // re-presses a held chord at each phrase top); they bound the cost all the same.
    let through = Math.min(until + 1, window.to);
    const lookLimit =
        until < window.to
            ? Math.min(chorusBars(timeline, until).end, until + LOOK_BARS, window.to)
            : window.to;
    // Trading with the drummer needs a drummer who can solo in this style.
    const drumSolos = Boolean(style.drums.solos);
    // Planned only as far as the look can reach, and the bar it leads into: a chunk of a long
    // counted performance costs its own bars, not the whole timeline's.
    const plans = planBars(timeline, settings, {
        ...options,
        window,
        planned: lookLimit + 1,
        drumSolos,
        arcShape: style.jamArc,
        endingGesture: style.endingGesture,
        keepsHighLine: style.keepsHighLine,
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
              // Only its first bar is read: planning the whole next pass cost a long chart's
              // every bar on each chunk (#1665).
              planned: 1,
              drumSolos,
              arcShape: style.jamArc,
              endingGesture: style.endingGesture,
              keepsHighLine: style.keepsHighLine,
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
            ending: null,
            fill: 'none',
        };
        const nextPlan =
            last && wrapPlan
                ? {
                      ...wrapped,
                      lanes: wrapPlan.lanes,
                      lead: wrapPlan.lead,
                      // Its form role with it: the head's last bar walks into a solo chorus
                      // the loop wraps into (#2018).
                      form: wrapPlan.form,
                      // The fill into the next lap is sized by that lap's own energy, so a
                      // pass resumed here (whose window has no bar 0 to read) sizes it alike.
                      energy: wrapPlan.energy,
                      level: wrapPlan.level,
                      // And it crashes, or not, as the next lap's top does (`lapFill`).
                      crash: wrapPlan.crash,
                  }
                : wrapped;
        const heard: BarContext['heard'] = { drums: [], bass: [], lead: [] };
        const barFirst = events.length;
        // The seeded streams for a bar at its place in the performance: this bar's, and the
        // next one's (the next pass's, when the song wraps), so a lane that plans across the
        // barline can make the choice the next bar will make — a lead-in placing its target
        // in the next section's register (#2071).
        const rngAt =
            (lane: Lane, at: Bar, atPass: number, atPlace: number): BarContext['rng'] =>
            (purpose, scope = 'bar') =>
                scope === 'song'
                    ? rng(settings.seed, style.id, lane, 'song', purpose)
                    : scope === 'section'
                      ? rng(settings.seed, style.id, lane, 'section', sectionKey(at.visit), purpose)
                      : rng(settings.seed, style.id, lane, atPass, atPlace, purpose);
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
                          rng: rngAt(
                              lane,
                              bars[nextIndex],
                              (last ? options.pass + 1 : options.pass) +
                                  bars[nextIndex].visit.chorus,
                              nextIndex - chorusBars(timeline, nextIndex).first,
                          ),
                      }
                    : null,
            heard,
            instrument,
            lead: leadProfile,
            pass,
            looping: options.looping,
            guideToneHead: settings.head === 'guide-tones',
            ending,
            rng: rngAt(lane, bar, pass, place),
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
    // The lead notes sounding into the window from before it, as the bar before heard them.
    const carried = options.memory?.leadSounding ?? [];
    const yielded = instrument.family === 'keyboard' ? yieldToLead(events, carried) : events;
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
    // And the lead notes sounding across its barline, struck before it — in this window or
    // carried into it — so a resume there yields the keyboard to them as the full pass does.
    const leadLine = [...carried, ...events.filter((e): e is PitchedNote => e.lane === 'lead')];
    for (let i = window.from; i < through; i++) {
        const at = bars[i].start;
        snapshots[i].leadSounding = leadLine.filter((n) => n.tick < at && n.tick + n.dur > at);
    }
    // The next pass starts its lap afresh: nothing of this one's lead sounds into it.
    memory.leadSounding = undefined;
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
    // The musician's own lane (`BandSettings.you`, #1992) was played above like any other, so
    // every lane after it heard it and the band played as if its player were there; only here,
    // with all of that decided, is it left out — the hole the musician fills.
    const you = settings.you ?? null;
    const sounded = you ? felt.filter((e) => e.lane !== you) : felt;
    const lastSnapshot = snapshots[until];
    if (through > until) {
        // The look across the barline is dropped: the next chunk plays that bar itself, from
        // the memory before it.
        snapshots.length = until;
        return {
            events: sounded.filter((e) => e.bar < until),
            memory: lastSnapshot,
            snapshots,
        };
    }
    return { events: sounded, memory, snapshots };
}

/**
 * The comp gives the lead its register. While the lead sounds, a keyboard voice at or above
 * it (within a half step) drops an octave, the way a pianist moves the right hand's voicing
 * down under a horn — never below middle C, where a dropped voice would muddy the chord, and
 * never beneath the chord's own bottom note (a power chord keeps its root under its 5th). A
 * voice that can't go down, and that a voice staying in the chord doubles, is left out
 * instead. The chord keeps its pitch classes either way. A guitar's grip is its hand shape, so
 * it stays. (The comp voiced each chord against the lead it heard already — `leadCost` in
 * `players/comp/voicing.ts` — and left out a voice the line sits on; this settles the rest.)
 * `carried`: the lead notes struck before the window and sounding into it (`leadSounding`).
 */
function yieldToLead(events: BandEvent[], carried: readonly PitchedNote[]): BandEvent[] {
    const lead = [...carried, ...events.filter((e): e is PitchedNote => e.lane === 'lead')];
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
            const on = new Set<number>();
            for (const l of lead) {
                if (l.tick < c.tick + c.dur && l.tick + l.dur > c.tick) {
                    under = Math.min(under, l.midi);
                    on.add(l.midi);
                }
            }
            if (c.midi < under - 1) {
                continue;
            }
            const down = c.midi - 12;
            // Never down onto a note the lead is playing: that trades a voice above the line
            // for a unison inside it (#2014).
            if (
                down >= 60 &&
                !sounding.has(down) &&
                !on.has(down) &&
                (c.midi === bottom || down > bottom)
            ) {
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
        // The ending bar's lengths are its gesture's (#2017): a stop and the hits are
        // short on an organ too, and a held ending already rings to the bar's end.
        if (plans[e.bar]?.ending) {
            return e;
        }
        const end = e.lane === 'comp' && !e.muted ? until.get(e.tick) : undefined;
        return end !== undefined && e.lane === 'comp' && end - e.tick > e.dur
            ? { ...e, dur: end - e.tick }
            : e;
    });
}

/** How far past a chunk's end the look across its barline may go (`PassOptions.until`). */
const LOOK_BARS = 32;

const LANE_ORDER: Record<BandEvent['lane'], number> = { drums: 0, bass: 1, comp: 2, lead: 3 };
const laneOrder = (e: BandEvent) => LANE_ORDER[e.lane];

/**
 * A fermata is a held chord, not a slow groove: whatever the idioms played inside a fermata
 * span is replaced by one crash-and-kick, one held bass note, the comp's first chord and the
 * lead's note if it struck one there, all ringing to the end of the (stretched) span. A fermata on a hold ties over: nothing new is
 * struck, and the notes already sounding are extended through it, except a tie of a rest, which
 * holds the rest and nothing rings across it (#2223).
 *
 * On the bar a performance ends on (`plan.ending`) the band is already playing its style's
 * ending gesture (#2017), and a fermata written there holds that gesture instead (#2175): the
 * kit's line stays the book's ending, and each pitched lane's last strike in the span rings to
 * the span's end. A tied fermata there strikes nothing new but keeps the kit's one arrival, on
 * the downbeat or on the push with the band (#2187, #2223), and the bar before's last bass note and comp chord become the ending's
 * own arrival, the root and a full chord, rung to the span's end (#2210), both on one tick (#2223).
 * A tie that runs on over the last barline is the ending's too. A fermata elsewhere,
 * or in a performance that loops, is held as above.
 *
 * The events are indexed by tick once, so a fermata costs a search and the events it replaces,
 * not a scan of the whole pass (#1665): a chart may write tens of thousands of them.
 */
function holdFermatas(
    events: BandEvent[],
    timeline: Timeline,
    plans: { lanes: Record<Lane, boolean>; ending: EndingGesture | null }[],
    lastBassBefore: number | undefined,
): BandEvent[] {
    const held: {
        span: ChordSpan;
        barIndex: number;
        plan: (typeof plans)[number];
        /** The ending the span's hold ends the performance on, if it does. */
        ending: EndingGesture | null;
        /** The bar the span ends in: its own bar, or the last one a tie runs on over. */
        endIndex: number;
    }[] = [];
    for (const span of timeline.spans) {
        // A fermata whose span rounds to no ticks holds nothing for no time: skip it. Holding
        // one copied the comp chord and removed nothing, so a few on one tick doubled the
        // events each time (#1670).
        if (span.fermata && span.end > span.start) {
            const barIndex = barAtTick(timeline, span.start)?.index ?? -1;
            const plan = plans[barIndex];
            // No plan: the fermata is outside this pass's window.
            if (plan) {
                // why: a fermata tie that runs on over the last barline (`| C | /(fermata) | / |`)
                // is the ending's own hold: the span starts in the bar before the ending bar,
                // but what it holds is the ending, so its ending is the last bar's plan (#2223).
                // Only a tie takes it: a held chord that a plain hold extends is the span's own
                // first bar's gesture, as before.
                const endIndex = span.tied
                    ? (barAtTick(timeline, span.end - 1)?.index ?? barIndex)
                    : barIndex;
                const ending = span.tied ? (plans[endIndex] ?? plan).ending : plan.ending;
                held.push({ span, barIndex, plan, ending, endIndex });
            }
        }
    }
    if (!held.length) {
        return events;
    }
    // Every tick an event sits on or a fermata starts at is a slot, in tick order. `live` is
    // the events still standing in each slot (their places in `out`, in order), and the two
    // slot sets say which slots hold a bass note and a struck comp chord.
    const out: (BandEvent | null)[] = events.slice();
    const ticks = Float64Array.from(
        new Set([...events.map((e) => e.tick), ...held.map(({ span }) => span.start)]),
    ).sort();
    const slots = new Map<number, number>();
    ticks.forEach((tick, slot) => {
        slots.set(tick, slot);
    });
    const live: number[][] = Array.from(ticks, () => []);
    events.forEach((e, i) => {
        live[slots.get(e.tick)!].push(i);
    });
    const isBass = (e: BandEvent): e is PitchedNote => e.lane === 'bass';
    const isStruckComp = (e: BandEvent): e is PitchedNote => e.lane === 'comp' && !e.muted;
    const bass = slotSet(ticks.length);
    const comp = slotSet(ticks.length);
    const mark = (slot: number) => {
        bass.set(
            slot,
            live[slot].some((i) => isBass(out[i]!)),
        );
        comp.set(
            slot,
            live[slot].some((i) => isStruckComp(out[i]!)),
        );
    };
    live.forEach((_, slot) => {
        mark(slot);
    });

    for (const { span, barIndex, plan, ending, endIndex } of held) {
        const from = slots.get(span.start)!;
        if (plan.ending && !span.tied) {
            // The ending bar's fermata holds the style's gesture (#2175), not the crash and
            // kick every style once shared: the kit keeps its book's ending line (a bossa's
            // soft rim and surdo crash nowhere), and each pitched lane's last strike in the
            // span rings to the span's end. why: a fermata means "hold this", and what a band
            // holds is the note it is playing when it reaches it, so the one chord of a hold
            // or a soft ending is held as it was, a stop's eighth becomes its hit held, the
            // button plays as written (its eighth already ends the bar, stretched only in
            // time), and the last of the hits rings on while the hits before it stay short.
            // The simplest rule a chart can rely on, and the same for every gesture.
            const struck: number[] = [];
            for (let slot = from; slot < ticks.length && ticks[slot] < span.end; slot++) {
                struck.push(...live[slot]);
            }
            // why: a lead note that lasts half the bar or longer under the fermata is sung, not
            // stopped, so it gets the vibrato a long note has (`endWithTheBand` strips it from
            // the eighth it cut), whether the hold stretched it or the gesture wrote it long
            // (metal's last hit, a `| G7 C |` landing). Half a bar in ticks is a whole bar in
            // time under the stretch, past every book's own threshold (4–12 sixteenths).
            const longHold = timeline.bars[barIndex].meter.barTicks / 2;
            for (const lane of ['bass', 'comp', 'lead'] as const) {
                const notes = struck.filter((i) => {
                    const e = out[i]!;
                    return e.lane === lane && !(e as PitchedNote).muted;
                });
                const lastTick = notes.reduce((tick, i) => Math.max(tick, out[i]!.tick), -1);
                for (const i of notes) {
                    const e = out[i] as PitchedNote;
                    if (e.tick === lastTick) {
                        const dur = Math.max(e.dur, span.end - e.tick);
                        out[i] = {
                            ...e,
                            dur,
                            ...(lane === 'lead' && dur >= longHold ? { vibrato: true } : {}),
                        };
                    }
                }
            }
            continue;
        }
        const atStart = live[from].map((i) => out[i]!);
        const compAtStart = atStart.filter((e): e is PitchedNote => e.lane === 'comp');
        // The lead's note on the fermata is held with the band; anything after it goes.
        const leadAtStart = atStart.filter((e): e is PitchedNote => e.lane === 'lead');
        // The last slots before the span with a bass note and a struck comp chord in them.
        const bassBefore = bass.lastBefore(from);
        const compBefore = comp.lastBefore(from);
        // why: a tie on the ending bar (`| C | /(fermata) |`) holds the chord already ringing, but
        // the band still ends on a drum hit (#2017): the kit's one arrival on the downbeat
        // (`drumIdiom`'s `held?.span.tied` branch writes only that in a tied bar) stays under
        // the ringing chord, where wiping it left the band ending on no drum hit at all (#2187).
        // The pitched lanes strike nothing new on the downbeat; what rings is the bar before's
        // last strike, played as the ending's arrival (below, #2210).
        // `ending` is set only on the last bar of a pass that actually ends, so a looping
        // pass and a mid-chart tie with a chord are held as before. A tie of a rest has no
        // chord to ring, so it has no arrival to mark (the kit's branch asks for a chord too)
        // and holds nothing, below.
        const tiedEnding = ending !== null && span.tied && span.chord !== null;
        // The ending bar's own downbeat strikes: the arrival the bar before's last strikes
        // become. When the tie runs on over the last barline the span starts earlier, so these
        // are read from the ending bar's tick, before the span's slots are wiped.
        const endSlot = slots.get(timeline.bars[endIndex].start);
        const arrivalAt =
            tiedEnding && endSlot !== undefined ? live[endSlot].map((i) => out[i]!) : [];
        const keptKit: number[] = [];
        for (let slot = from; slot < ticks.length && ticks[slot] < span.end; slot++) {
            if (live[slot].length) {
                const kept: number[] = [];
                for (const i of live[slot]) {
                    // The kit's one arrival is the ending bar's own, never the groove of a bar
                    // the tie runs on through before it.
                    if (tiedEnding && out[i]!.lane === 'drums' && out[i]!.bar === endIndex) {
                        kept.push(i);
                        keptKit.push(i);
                    } else {
                        out[i] = null;
                    }
                }
                live[slot] = kept;
                mark(slot);
            }
        }
        if (span.tied) {
            // why: a tie of a rest (`| C | N.C. | /(fermata) |`) holds the rest: the written
            // silence is what the fermata lengthens, and no chord is sounding to ring across it.
            // Extending the last notes before it rang the C through the N.C. (#2223).
            if (!span.chord) {
                continue;
            }
            // Extend the last bass note and the last comp chord through the fermata.
            const extend = (slot: number, wanted: (e: BandEvent) => e is PitchedNote) => {
                for (const i of live[slot] ?? []) {
                    const e = out[i]!;
                    if (wanted(e)) {
                        out[i] = { ...e, dur: span.end - e.tick };
                    }
                }
            };
            if (!tiedEnding) {
                extend(bassBefore, isBass);
                extend(compBefore, isStruckComp);
                continue;
            }
            // why: the bar before a tied ending was played as the approach into an ending
            // (`endingAim`, #2178), and the arrival it aims at, the ending bar's own bass note
            // (low, the chord's root or written bass) and chord struck to ring (`endingBass`,
            // `endingStrikes`), is the one thing the tie wipes. Held as they stood, the bar
            // before's last notes are the approach itself (jazz's leading tone under the
            // root, a G, an A) and its last stab (a skank, one picked string): the band holds
            // a note that was leading somewhere. So the last strike of each lane is played as
            // the arrival and the bar's groove stays. Nothing is struck on the downbeat; a lane
            // with no arrival (off in the ending bar) extends what it had.
            const lanes = [
                { wanted: isBass, slot: bassBefore },
                { wanted: isStruckComp, slot: compBefore },
            ].map(({ wanted, slot }) => ({
                wanted,
                slot,
                arrives: arrivalAt.filter(wanted),
                last: (live[slot] ?? []).map((i) => out[i]!).filter(wanted),
            }));
            const before = barAtTick(timeline, span.start - 1);
            // why: bass and comp are one band landing on one chord, so they land on one tick
            // (#2223). Each kept its own last strike's tick before, and a band whose bass hit
            // the "and" of 4, comp the "e" of 4 and kit the downbeat arrived three times for
            // one chord. The "and" of the last beat is a push into the downbeat: if either
            // lane's last strike is there (or the "a" after it) both push there, ringing over
            // the barline, and the kit's one arrival moves to the push with them, its strokes
            // after the push giving way (the fill ends on the push; nothing on the tied one).
            // Any other strike falls back to the beat it sits in, the "e" of 4 to 4,
            // the "and" of 3 to 3, so a sixteenth offbeat or a skank's upbeat is never an
            // arrival; the later of the two lanes' beats is the band's (a lane that ended on 3
            // while the other reached 4 joins it on 4). A lane's strike never moves after the
            // downbeat the tie sits on: nothing is struck there (the tie reading #2175/#2187).
            const pulseStarts = before ? before.meter.pulses.map((p) => before.start + p) : [];
            const push =
                before?.meter.quarterPulse && span.start === before.start + before.meter.barTicks
                    ? span.start - PPQ / 2
                    : -1;
            const landing = (tick: number) =>
                push >= 0 && tick >= push
                    ? push
                    : (pulseStarts.filter((p) => p <= tick).at(-1) ?? tick);
            const strikes = lanes
                .filter(({ arrives, last }) => arrives.length && last.length)
                .map(({ last }) => last[0].tick)
                .filter((tick) => !!before && tick >= before.start);
            // why: a tick both lanes already share on an eighth (hip hop's "and" of 3, where the
            // kick plays too) is already one landing and stays: flooring it would move a band
            // that was together. Anything off the eighths still snaps as above.
            const shared =
                strikes.length === 2 && strikes[0] === strikes[1] && strikes[0] % (PPQ / 2) === 0;
            const together = shared
                ? strikes[0]
                : strikes.length
                  ? Math.max(...strikes.map(landing))
                  : null;
            for (const { wanted, slot, arrives, last } of lanes) {
                if (!arrives.length || !last.length) {
                    extend(slot, wanted);
                    continue;
                }
                const own = last[0].tick;
                const at = together ?? own;
                // why: the arrival is the lane's last word, so what the lane played from its
                // tick on in the bar before (the strike it replaces, and a push's sixteenth
                // after an eighth) gives way to it. A note before it stays as the groove played
                // it and lets go where the arrival is struck: a lane whose last strike was on 3
                // plays that note and then lands on 4 (an approach, then the root), and a bass
                // quarter on 4 does not sound under a root struck on the "and". A lane that
                // struck nothing in the bar before keeps its earlier bar's note as played, and
                // still gets its arrival at the band's tick.
                const from = Math.min(before?.start ?? at, at);
                for (const [i, e] of out.entries()) {
                    if (!e || !wanted(e) || e.tick < from || e.tick >= span.start) {
                        continue;
                    }
                    // A strike closer to the arrival than an eighth is a flam under it (the
                    // funk comp's "e" of 4 before a push on the "and"), not a note of the
                    // groove: it is the arrival's, and goes with it.
                    if (e.tick > at - PPQ / 2) {
                        out[i] = null;
                        const where = slots.get(e.tick);
                        if (where !== undefined) {
                            live[where] = live[where].filter((j) => j !== i);
                        }
                    } else if (e.tick + e.dur > at) {
                        out[i] = { ...e, dur: at - e.tick };
                    }
                }
                for (const note of arrives) {
                    // The arrival's pitch and weight at the common tick, ringing to the end.
                    const index = out.length;
                    out.push({
                        ...note,
                        tick: at,
                        dur: span.end - at,
                        offsetMs: last[0].offsetMs,
                        bar: barAtTick(timeline, at)?.index ?? last[0].bar,
                    });
                    const landed = slots.get(at);
                    if (landed !== undefined) {
                        live[landed].push(index);
                        mark(landed);
                    }
                }
                mark(slot);
            }
            // why: the kit's one arrival (#2187) goes with the band. When the band pushes into
            // the one (the "and" of the last beat) the drummer hits the push with it, and the
            // kit's own strokes from there to the downbeat, the fill's tail, give way as the
            // pitched lanes' do: the fill ends on the push, and nothing is struck on the one
            // the tie sits on. When the band lands on a beat the kit's arrival stays on the
            // one, a beat later, its own gesture. A tie that runs on over the last barline
            // has the arrival at the span's start, where the held chord begins, not a bar or
            // two into it.
            const kitAt = together !== null && together === push ? push : span.start;
            if (kitAt === push && push >= 0) {
                for (const [i, e] of out.entries()) {
                    if (e?.lane === 'drums' && e.tick >= push && e.tick < span.start) {
                        out[i] = null;
                    }
                }
            }
            for (const i of keptKit) {
                out[i] = {
                    ...out[i]!,
                    tick: kitAt,
                    bar: barAtTick(timeline, kitAt)?.index ?? out[i]!.bar,
                };
            }
            continue;
        }
        const length = span.end - span.start;
        const push = (e: BandEvent) => {
            live[from].push(out.length);
            out.push(e);
        };
        if (plan.lanes.drums) {
            push({
                lane: 'drums',
                piece: 'crash',
                tick: span.start,
                velocity: 100,
                offsetMs: 0,
                bar: barIndex,
            });
            push({
                lane: 'drums',
                piece: 'kick',
                tick: span.start,
                velocity: 96,
                offsetMs: 0,
                bar: barIndex,
            });
        }
        if (plan.lanes.bass && span.chord) {
            // The latest bass note before the span — by tick, and of several on that tick the
            // last in `out`, since an earlier fermata's held note is appended after the notes
            // that follow it. None in this pass (it resumed here) → the one sounded before the
            // pass began.
            const lastBass = (live[bassBefore] ?? [])
                .map((i) => out[i]!)
                .filter(isBass)
                .at(-1);
            const midi = nearestMidi(
                span.chord.bass,
                lastBass?.midi ?? lastBassBefore ?? 38,
                28,
                52,
            );
            push({
                lane: 'bass',
                midi,
                tick: span.start,
                dur: length,
                velocity: 92,
                offsetMs: 0,
                bar: barIndex,
            });
        }
        for (const e of [...compAtStart, ...leadAtStart]) {
            push({ ...e, dur: length });
        }
        mark(from);
    }
    return out.filter((e) => e !== null);
}

/**
 * A set of slots (0 up to `size`) that answers "the last slot in the set before this one" in
 * logarithmic time while slots come and go: a binary tree over the slots, each node saying
 * whether any slot under it is in the set.
 */
function slotSet(size: number) {
    let leaves = 1;
    while (leaves < size) {
        leaves *= 2;
    }
    const has = new Uint8Array(2 * leaves);
    return {
        set(slot: number, on: boolean): void {
            // Up for as long as a node's answer changes.
            let node = slot + leaves;
            let value = on ? 1 : 0;
            while (node >= 1 && has[node] !== value) {
                has[node] = value;
                node >>= 1;
                value = has[2 * node] | has[2 * node + 1];
            }
        },
        /** The last slot in the set before `slot`, or -1. */
        lastBefore(slot: number): number {
            // Up until a branch to the left has one, then down that branch's right-hand side.
            let node = slot + leaves;
            while (node > 1 && !(node & 1 && has[node - 1])) {
                node >>= 1;
            }
            if (node <= 1) {
                return -1;
            }
            node--;
            while (node < leaves) {
                node = has[2 * node + 1] ? 2 * node + 1 : 2 * node;
            }
            return node - leaves;
        },
    };
}
