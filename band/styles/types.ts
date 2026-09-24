/**
 * Styles and idioms. An *idiom* is one way of playing one instrument (a walking bass, a
 * backbeat, a Charleston comp). A *style* is a genre: a feel plus one idiom per lane (and,
 * for the comp, one per instrument family: a bossa guitar and a bossa piano differ).
 * Idioms are shared vocabulary, so a new style is usually a new combination, and an
 * "influence" (rock with a Motown bass) is a style that borrows another family's idiom.
 */
import type { BarPlan } from '../arrange/plan.js';
import type { Rng } from '../core/random.js';
import type { CompInstrument, DrumHit, Lane, PitchedNote, StyleId } from '../core/types.js';
import type { Bar, Timeline } from '../form/timeline.js';
import type { CompProfile } from '../players/comp/instruments.js';

/** Everything an idiom may know when it plays one bar. All of it is read-only. */
export interface BarContext {
    timeline: Timeline;
    bar: Bar;
    plan: BarPlan;
    /** The bar after this one in performance order (wrapping when the song loops). */
    next: { bar: Bar; plan: BarPlan } | null;
    /** What the lanes before this one already played in this bar, on the straight grid. */
    heard: { drums: DrumHit[]; bass: PitchedNote[] };
    /** The comp lane's instrument (what is physical about it: range, strum, sustain). */
    instrument: CompProfile;
    /**
     * A seeded stream for one decision. Keyed on the musical position, so a decision is
     * stable no matter what was generated before it. `scope: 'section'` keys on the
     * written section instead of the bar, for choices that should hold for a whole section
     * (a groove's kick pattern, a funk riff) — the motif is the section's, not the bar's.
     */
    rng(purpose: string, scope?: 'bar' | 'section'): Rng;
}

export interface Idiom<E, M> {
    name: string;
    init(): M;
    play(ctx: BarContext, memory: M): { events: E[]; memory: M };
}

export type DrumIdiom = Idiom<DrumHit, any>;
export type PitchedIdiom = Idiom<PitchedNote, any>;

export interface Feel {
    /** Default shuffle, 0–100 (100 = triplet swing). The user's swing setting overrides it. */
    swing: number;
    /** Which subdivision the swing bends: swung eighths (jazz) or swung sixteenths. */
    swingGrid: 8 | 16;
    /**
     * Tier-2 band lean in ms: melodic lanes against the drums, which are the clock and
     * never lean. Positive = behind the beat.
     */
    lean: Record<Exclude<Lane, 'drums'>, number>;
    /**
     * The comp's lean when the instrument family plays it differently: a jazz pianist lays
     * back behind the beat, a swing rhythm guitarist sits right with the walking bass.
     */
    compLean?: Partial<Record<'keyboard' | 'guitar', number>>;
    /** Default human variation, 0–100. */
    humanize: number;
}

export interface Style {
    id: StyleId;
    name: string;
    feel: Feel;
    drums: DrumIdiom;
    bass: PitchedIdiom;
    /** One comping book per instrument family; the settings' instrument picks between them. */
    comp: { keyboard: PitchedIdiom; guitar: PitchedIdiom };
    /** The comp instrument the genre is heard on by default (the app's Auto sound). */
    prefers: CompInstrument;
}
