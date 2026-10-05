/**
 * Styles and idioms. An *idiom* is one way of playing one instrument (a walking bass, a
 * backbeat, a Charleston comp). A *style* is a genre: a feel plus one idiom per lane (and,
 * for the comp, one per instrument family: a bossa guitar and a bossa piano differ).
 * Idioms are shared vocabulary, so a new style is usually a new combination, and an
 * "influence" (rock with a Motown bass) is a style that borrows another family's idiom.
 */
import type { BarPlan } from '../arrange/plan.js';
import type { Rng } from '../core/random.js';
import type {
    CompInstrument,
    DrumHit,
    LeadInstrument,
    PitchedNote,
    StyleId,
} from '../core/types.js';
import type { Bar, Timeline } from '../form/timeline.js';
import type { CompProfile } from '../players/comp/instruments.js';
import type { LeadProfile } from '../players/lead/instruments.js';

/** Everything an idiom may know when it plays one bar. All of it is read-only. */
export interface BarContext {
    timeline: Timeline;
    /**
     * The bar being played. On the last bar of a pass that ends (`plan.ending`) it is the held
     * ending's (`arrange/ending.ts`): a final turnaround arrives already resolved to the tonic,
     * so every lane's ending, which plays the chords `endingSpans` gives it, holds that one
     * chord — or, in a bar that gets home itself (`| G7 C |`), strikes the V and holds the I.
     */
    bar: Bar;
    plan: BarPlan;
    /**
     * The bar after this one in performance order (wrapping when the song loops). `wraps`: the
     * next pass plays it, not this one — a loop's wrap back to its top, or the song a released
     * loop leads on into — so a sustaining instrument's hold ends at its barline.
     */
    next: { bar: Bar; plan: BarPlan; wraps: boolean } | null;
    /** What the lanes before this one already played in this bar, on the straight grid. */
    heard: { drums: DrumHit[]; bass: PitchedNote[]; lead: PitchedNote[] };
    /** The comp lane's instrument (what is physical about it: range, strum, sustain). */
    instrument: CompProfile;
    /** The lead's instrument. */
    lead: LeadProfile;
    /** Which time through the song this is (0 = first). The lead's form is built on it. */
    pass: number;
    /** Whether the performance goes round again after this pass. */
    looping: boolean;
    /**
     * The bar this pass ends on as the band plays it, when that differs from the written one: a
     * turnaround resolved to the tonic (`arrange/ending.ts`). Null when the pass loops or ends
     * as written. On the ending bar itself `bar` is this bar; a lane that plans ahead of it
     * (the lead's phrase) reads it here.
     */
    ending: Bar | null;
    /**
     * A seeded stream for one decision. Keyed on the musical position, so a decision is
     * stable no matter what was generated before it. `scope: 'section'` keys on the
     * written section instead of the bar, for choices that should hold for a whole section
     * (a groove's kick pattern, a funk riff) — the motif is the section's, not the bar's.
     * `scope: 'song'` keys on the performance alone, for what a band commits to for the whole
     * tune (reggae's riddim: a band doesn't flip from rockers to steppers between choruses).
     */
    rng(purpose: string, scope?: 'bar' | 'section' | 'song'): Rng;
}

export interface Idiom<E, M> {
    name: string;
    /**
     * A comp idiom whose figure *is* its articulation: it plays even a sustaining instrument
     * short, so the organ's hold-to-the-next-strike is off (the reggae organ bubble is chopped,
     * never held). Absent everywhere else: an organ holds.
     */
    percussive?: boolean;
    /**
     * A drum idiom that can take a solo when the player trades with the drummer
     * (`DrumBook.trade`). Absent, trading with the drums isn't offered in the style.
     */
    solos?: boolean;
    init(): M;
    play(ctx: BarContext, memory: M): { events: E[]; memory: M };
    /**
     * Move the song ticks this memory holds by `ticks`: the performance jumped (a loop's wrap
     * back to its top), and a tick remembered from before the jump is read in the new lap's
     * own ticks. Absent, the memory holds no ticks.
     */
    rebase?(memory: M, ticks: number): M;
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
    lean: Record<'bass' | 'comp', number> & {
        /** The lead's lean; unset, it sits with the bass. */
        lead?: number;
    };
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
    /**
     * The lead: the style's soloist, and the instrument it is heard on by default. Absent,
     * the style has no lead yet and the lane stays silent.
     */
    lead?: { idiom: PitchedIdiom; prefers: LeadInstrument };
    /**
     * The tonic chord a held ending plays when the chart's last bar points back to the top (a
     * ii–V, a V7): the quality the genre ends on, written as a chord-symbol suffix (`6`,
     * `maj7`, `9`, `''` for the triad) for the chord authority to read, in a major key and in
     * a minor one. See `arrange/ending.ts`.
     */
    ending: EndingQuality;
}

/**
 * Chord-symbol suffixes for the tonic a held ending resolves to (`Style.ending`). The family is
 * the chart's own tonic's, the colour the style's (`arrange/ending.ts`, #1502).
 */
export interface EndingQuality {
    major: string;
    minor: string;
    /**
     * The colour on a chart whose tonic is a dominant (a blues's `C7`, a dominant vamp's
     * `E9`), in a major key: it keeps the b7 the chart wrote. Absent, the style's `major`
     * plays there — right for a colour with no 7th (a triad, a 6th); a style whose major
     * colour carries a 7th must say which seventh a dominant tonic gets.
     */
    dominant?: string;
}
