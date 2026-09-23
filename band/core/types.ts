/**
 * The band engine's shared vocabulary. Everything the engine produces is a `BandEvent`;
 * everything it consumes is a `Timeline` (see `form/timeline.ts`) plus `BandSettings`.
 */

/** Ticks per quarter note. 480 = 2⁵·3·5: exact for 32nds, triplets and quintuplets. */
export const PPQ = 480;

export type Lane = 'drums' | 'bass' | 'keys';
export const LANES: readonly Lane[] = ['drums', 'bass', 'keys'];

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
    lane: 'bass' | 'keys';
    midi: number;
    /** Written length in ticks (after swing, still ticks). */
    dur: number;
    /** A dead/palm-muted note: percussive, pitch barely audible. */
    muted?: boolean;
}

export type BandEvent = DrumHit | PitchedNote;

/** The four v0 genres. New genres add a style file; see `styles/index.ts`. */
export type StyleId = 'rock' | 'jazz' | 'funk' | 'bossa';

export interface BandSettings {
    style: StyleId;
    /** Lane power. A section's own `instruments` map can still silence a lane. */
    lanes: Record<Lane, boolean>;
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
    lanes: { drums: true, bass: true, keys: true },
    intensity: null,
    swing: null,
    swingGrid: null,
    humanize: null,
    seed: 'ensemble',
};
