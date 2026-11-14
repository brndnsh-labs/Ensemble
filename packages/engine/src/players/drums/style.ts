// The drum seat's part of a style pack: what the drummer plays in a genre, as
// plain data. Patterns are written in the grid notation of `perform/grid.ts`
// (X accent, x normal, o soft, g ghost, anything else a rest; one character
// per sixteenth; spaces ignored).

import type { LevelSymbol } from "../../perform/grid.ts";
import type { Hold, PerTier } from "../../style/types.ts";
import type { DrumVoice } from "./kit.ts";

/** A pattern for each piece that plays. A piece with no line is not touched. */
export type Lines = Readonly<Partial<Record<DrumVoice, string>>>;

/**
 * When a layer plays. Every condition given must hold; a layer with none plays
 * in every bar. A new kind of condition (the bar's harmony, the section's
 * role) is a new field here and one line in the engine.
 */
export interface When {
  /**
   * Only in these bars of the phrase, counted from 1. `[2, 4, 6]` is every
   * second bar: the answer bars of DR-05.
   */
  readonly phraseBars?: readonly number[];
  /** Only at this energy or above. */
  readonly energyFrom?: number;
  /** Only under this energy. */
  readonly energyBelow?: number;
  /**
   * Only while this piece already has a part in the bar, from the layers
   * above: an open hat is a turn for a drummer whose hand is on the hat.
   */
  readonly playing?: DrumVoice;
}

export interface GrooveOption {
  /** Relative weight in the draw. Zero never wins. */
  readonly weight: number;
  /** One bar of 4/4, sixteen steps a line. No lines at all is the choice to add nothing. */
  readonly lines: Lines;
}

/**
 * One decision the drummer makes about the time: which kick, which cymbal,
 * whether to ghost. The options are drawn once and kept for the span `hold`
 * names, so a section keeps its groove (DR-04).
 */
export interface GrooveLayer {
  /**
   * Names the decision. Layers with one id and one hold in different tiers
   * share a draw, so a section that pushes its kick when quiet tends to push
   * it when loud. Two layers in one tier must not share an id.
   */
  readonly id: string;
  readonly hold: Hold;
  readonly when?: When;
  readonly options: readonly GrooveOption[];
}

/** A touch laid over the written time: these strokes are played at a fraction of their level. */
export interface Touch {
  readonly voices: readonly DrumVoice[];
  /** Sixteenths of the 4/4 bar, from 0. Left out, every stroke of those voices. */
  readonly steps?: readonly number[];
  readonly scale: number;
}

/** One whole fill, written to end at the barline. Its length is the length of its lines. */
export interface FillShape {
  readonly weight: number;
  /**
   * Every line is the same length. A fill replaces the time, but the kick and
   * the hat foot keep the groove's part unless the fill writes a line for
   * them (DR-12); a line of rests silences them.
   */
  readonly lines: Lines;
}

export interface DrumFills {
  /**
   * How long a fill is, in sixteenths before the barline, by the boundary it
   * marks and the tier the music is going to. Zero plays time straight through.
   */
  readonly length: {
    readonly phrase: PerTier<number>;
    readonly section: PerTier<number>;
  };
  /** The shapes for the end of a phrase inside a section. */
  readonly phrase: readonly FillShape[];
  /** The shapes for the end of a section. */
  readonly section: readonly FillShape[];
  /** The biggest shapes: into a new pass, into a bigger section, into the final hit (DR-15). */
  readonly top: readonly FillShape[];
}

export interface DrumStyle {
  /**
   * The time, as a different part for each tier. The layers are laid down in
   * order, each adding its strokes to the bar; where two write the same piece
   * on the same sixteenth, the later one wins.
   *
   * A bar that is not 4/4 is built from this bar's beats, one per pulse
   * (DR-10): beat 1 on the downbeat, beat 2 on backbeat pulses, beat 3 on
   * other strong pulses, beat 4 on the last pulse.
   */
  readonly grooves: PerTier<readonly GrooveLayer[]>;
  /**
   * The cymbals that keep time. An arrival crash takes the place of their
   * stroke on beat 1 (DR-03, DR-20). A style that rides the crash lists it here.
   */
  readonly timekeepers: readonly DrumVoice[];
  /** Touches laid over the groove after it is built (not over fills or the ending). */
  readonly touches: readonly Touch[];
  readonly fills: DrumFills;
  readonly ending: {
    /** What the kit strikes where the final chord lands, and how hard. Nothing else is played. */
    readonly strike: Readonly<Partial<Record<DrumVoice, LevelSymbol>>>;
  };
}
