/**
 * The band engine's shared vocabulary. Everything the engine produces is a `BandEvent`;
 * everything it consumes is a `Timeline` (see `form/timeline.ts`) plus `BandSettings`.
 */

/** Ticks per quarter note. 480 = 2⁵·3·5: exact for 32nds, triplets and quintuplets. */
export const PPQ = 480;

export type Lane = 'drums' | 'bass' | 'comp' | 'lead';
/** In playing order: each lane hears the ones before it, so the comp can answer the lead. */
export const LANES: readonly Lane[] = ['drums', 'bass', 'lead', 'comp'];

/**
 * The kit, named for what a drummer plays rather than for any one sound source.
 * `host/voices.ts` maps each piece onto whatever the audio layer calls it.
 */
export type DrumPiece =
    | 'kick'
    | 'snare'
    | 'ghost'
    | 'rim'
    | 'hat'
    | 'hatOpen'
    | 'hatPedal'
    | 'ride'
    | 'rideBell'
    | 'crash'
    | 'tomHigh'
    | 'tomMid'
    | 'tomLow'
    | 'shaker';

interface EventTiming {
    /** Position in ticks from the start of the pass. Fractional once swing is applied. */
    tick: number;
    /** Tier-2/3 micro-timing in milliseconds (band lean + character). Never a band-wide shift. */
    offsetMs: number;
    /** MIDI velocity, 1–127. */
    velocity: number;
    /** Index of the performed bar this event belongs to (for splicing and seeking). */
    bar: number;
}

export interface DrumHit extends EventTiming {
    lane: 'drums';
    piece: DrumPiece;
}

export interface PitchedNote extends EventTiming {
    lane: 'bass' | 'comp' | 'lead';
    midi: number;
    /** Written length in ticks (after swing, still ticks). */
    dur: number;
    /** A dead/palm-muted note: percussive, pitch barely audible (a bass pop, a guitar scratch). */
    muted?: boolean;
    /**
     * Palm-muted: the picking hand rests on the strings by the bridge. Unlike `muted` the pitch
     * sounds — a short, dark, pitched chug (the metal and punk rhythm guitar) — so it is a
     * real chord strike to every rule; only the host shortens and darkens it.
     */
    palm?: boolean;
    /**
     * A strummed chord's direction: the feel layer rolls its notes low→high on a downstroke
     * and high→low on an upstroke, at the instrument's strum speed. Unset = struck together.
     */
    stroke?: 'down' | 'up';
    /**
     * A lead note that starts this many semitones below its written pitch and glides up into
     * it: a horn's scoop (1) or a guitarist's bend into the note (1 = b3 → 3, 2 = b7 → root).
     */
    bendIn?: number;
    /** A lead note held long enough to sing: the player adds vibrato. */
    vibrato?: boolean;
}

export type BandEvent = DrumHit | PitchedNote;

/**
 * What plays the comp lane. The instrument decides *how* the band's harmony is played —
 * a guitar strums playable grips, an organ holds, a piano voices for two hands — while the
 * style decides *what* is played. See `players/comp/instruments.ts`.
 */
export type CompInstrument = 'piano' | 'rhodes' | 'organ' | 'clav' | 'guitar' | 'nylon';

/**
 * What plays the lead. Like the comp, the instrument decides what is physical (range, breath,
 * whether it bends) and the style decides what is played. See `players/lead/instruments.ts`.
 */
export type LeadInstrument = 'sax' | 'trumpet' | 'guitar' | 'overdrive' | 'nylon';

/** The genres the band plays natively. A new genre is a style file; see `styles/index.ts`. */
export type StyleId =
    | 'rock'
    | 'jazz'
    | 'funk'
    | 'bossa'
    | 'reggae'
    | 'blues'
    | 'country'
    | 'hiphop'
    | 'disco'
    | 'neosoul'
    | 'metal'
    | 'skapunk'
    | 'acoustic';

export interface BandSettings {
    style: StyleId;
    /** Lane power. A section's own `instruments` map can still silence a lane. */
    lanes: Record<Lane, boolean>;
    /** The comp lane's instrument. */
    comp: CompInstrument;
    /** The lead's instrument. */
    lead: LeadInstrument;
    /** 0–1. The band's energy. `null` lets the arrangement plan follow the form. */
    intensity: number | null;
    /** 0–100 shuffle amount (100 = triplet swing); `null` uses the style's own feel. */
    swing: number | null;
    /** Which subdivision swings (8ths or 16ths); `null` uses the style's own grid. */
    swingGrid: 8 | 16 | null;
    /** 0–100 human timing/velocity variation; `null` uses the style's own amount. */
    humanize: number | null;
    /** Free-form seed text; the same seed always plays the same performance. */
    seed: string;
}

export const DEFAULT_SETTINGS: BandSettings = {
    style: 'rock',
    // The lead is off until asked for: someone practising wants the band, not a soloist.
    lanes: { drums: true, bass: true, comp: true, lead: false },
    comp: 'piano',
    lead: 'sax',
    intensity: null,
    swing: null,
    swingGrid: null,
    humanize: null,
    seed: 'ensemble',
};
