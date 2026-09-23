/**
 * The engine: `(timeline, settings, pass) → BandEvent[]`. One pure function; live playback,
 * MIDI export and audio export all consume what it returns, so they cannot disagree.
 *
 * Per bar, lanes play in a fixed order — drums, then bass, then keys — and each later lane
 * hears what the earlier ones played (`heard`). That is the whole coordination model: data
 * flowing one way, not a blackboard every lane writes.
 */
import { planBars } from './arrange/plan.js';
import { rng } from './core/random.js';
import type { BandEvent, BandSettings, DrumHit, Lane, PitchedNote } from './core/types.js';
import { applyFeel } from './feel/feel.js';
import type { Timeline } from './form/timeline.js';
import { STYLES } from './styles/index.js';
import type { BarContext } from './styles/types.js';

/** What each lane remembers across bars (and across passes of a looping song). */
export type PassMemory = Record<Lane, unknown>;

export interface PassOptions {
    /** 0 for the first time through the song, 1 for the second… */
    pass: number;
    /** Whether the song repeats after this pass (fills lead back to the top; no ending). */
    looping: boolean;
    /** The memory left by the previous pass, for continuity across the loop point. */
    memory?: PassMemory;
}

export interface PassResult {
    /** Events sorted by tick (after feel), with ticks relative to the start of this pass. */
    events: BandEvent[];
    memory: PassMemory;
}

export function performPass(
    timeline: Timeline,
    settings: BandSettings,
    options: PassOptions,
): PassResult {
    const style = STYLES[settings.style];
    const plans = planBars(timeline, settings, options);
    const memory: PassMemory = options.memory
        ? { ...options.memory }
        : { drums: style.drums.init(), bass: style.bass.init(), keys: style.keys.init() };
    const { bars } = timeline;
    const events: BandEvent[] = [];

    bars.forEach((bar, i) => {
        const plan = plans[i];
        const nextIndex = i + 1 < bars.length ? i + 1 : options.looping ? 0 : -1;
        const prevIndex = i > 0 ? i - 1 : options.pass > 0 ? bars.length - 1 : -1;
        const heard: BarContext['heard'] = { drums: [], bass: [] };
        const context = (lane: Lane): BarContext => ({
            timeline,
            bar,
            plan,
            next: nextIndex >= 0 ? { bar: bars[nextIndex], plan: plans[nextIndex] } : null,
            prev: prevIndex >= 0 ? { bar: bars[prevIndex], plan: plans[prevIndex] } : null,
            heard,
            rng: (purpose, scope = 'bar') =>
                scope === 'section'
                    ? rng(settings.seed, style.id, lane, 'section', bar.visit.sectionIndex, purpose)
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
        if (plan.lanes.keys) {
            const out = style.keys.play(context('keys'), memory.keys);
            memory.keys = out.memory;
            events.push(...out.events);
        }
    });

    const felt = applyFeel(events, timeline, style.feel, settings);
    felt.sort((a, b) => a.tick - b.tick || laneOrder(a) - laneOrder(b));
    return { events: felt, memory };
}

const laneOrder = (e: BandEvent) => (e.lane === 'drums' ? 0 : e.lane === 'bass' ? 1 : 2);
