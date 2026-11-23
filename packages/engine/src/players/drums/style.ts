// The drum seat's part of a style pack: what the drummer plays in a genre, as
// plain data. Patterns are written in the grid notation of `perform/grid.ts`
// (X accent, x normal, o soft, g ghost, a dot a rest; one character per
// sixteenth; spaces ignored). A groove line may also write "-": the stick
// taken off, a stroke the layers above wrote that this one takes away.

import type { LevelSymbol } from "../../perform/grid.ts";
import type { MeterName } from "../../perform/meter.ts";
import type { Hold, PerTier } from "../../style/types.ts";
import type { DrumVoice } from "./kit.ts";

/** A pattern for each piece that plays. A piece with no line is not touched. */
export type Lines = Readonly<Partial<Record<DrumVoice, string>>>;

/** What the kit strikes at one moment, and how hard. */
export type Strike = Readonly<Partial<Record<DrumVoice, LevelSymbol>>>;

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
  /**
   * Only in the last bar of a phrase (true), or never in it (false): the bar
   * that sets up the next phrase, whatever length the phrase is.
   */
  readonly phraseEnd?: boolean;
  /**
   * Only where a fill ends the bar (true), or only where none does (false): a
   * drummer's own set-up where the arrangement has not asked for a fill, or
   * asked for one too short to play.
   */
  readonly fill?: boolean;
  /**
   * Only where the harmony moves inside the bar (true: two chords or more), or
   * only where one chord holds the whole bar (false). The drummer reads the
   * chart as the pianist does, since he cannot hear him (DR-89).
   */
  readonly changeInBar?: boolean;
  /** Only where the next bar brings a new chord on its downbeat (true), or does not (false). */
  readonly changeAhead?: boolean;
  /**
   * Only in bars of these meters, by name as a chart writes them (`"4/4"`). A
   * part written for 4/4 is also what a bar of any meter it has not been
   * written for is fitted from, a beat to a pulse; a figure that is four's own
   * (a train's eighths on the snare, two to every beat, are every eighth of a
   * bar of twelve) names four, and a fitted bar plays the layers that name no
   * meter (DR-10, DR-59).
   */
  readonly meters?: readonly MeterName[];
}

export interface GrooveOption {
  /** Relative weight in the draw. Zero never wins. */
  readonly weight: number;
  /**
   * One bar, a step a sixteenth: sixteen to a line in 4/4, and in a part
   * written for another meter as many as its bar has (24 in 12/8 and 6/4). No
   * lines at all is the choice to add nothing.
   */
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
  /**
   * A turn must be heard (DR-06): when the drawn option would change nothing
   * in the bar (the hat already opens there), the next option in the list that
   * would is played instead. The draw is not made again. A stroke written where
   * the piece already strikes, at another level, changes nothing; one that turns
   * a snare into a ghost or a ghost into a snare does (DR-02).
   */
  readonly audible?: boolean;
  readonly options: readonly GrooveOption[];
}

/** A touch laid over the written time: these strokes are played at a fraction of their level. */
export interface Touch {
  readonly voices: readonly DrumVoice[];
  /** Sixteenths of the bar the grooves are written for, from 0. Left out, every stroke of those voices. */
  readonly steps?: readonly number[];
  readonly scale: number;
}

/** One whole fill, written to end at the barline. Its length is the length of its lines. */
export interface FillShape {
  readonly weight: number;
  /**
   * Every line is the same length. A fill replaces the time, but the kick and
   * the hat foot keep the groove's part unless the fill writes a line for
   * them (DR-12); a line of rests silences them. In a style whose fills keep
   * time, so does the cymbal.
   */
  readonly lines: Lines;
  /**
   * In a style whose fills keep time: how many sixteenths of this fill, from
   * its first, the cymbal goes on playing before the stick hand leaves it for
   * the drums (round the toms, ST-jazz-15). Left out, it plays through.
   */
  readonly handOff?: number;
}

/**
 * A fill vocabulary: one list, or one for each tier (a quiet band stays off
 * the toms; its hat plays eighths). A fill is sized by where the music is
 * going (CO-43), but its vocabulary is the tier of the bar it is played in:
 * the light head's last bar into the solos still stays off the toms (DR-38).
 */
export type FillShapes = readonly FillShape[] | PerTier<readonly FillShape[]>;

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
  readonly phrase: FillShapes;
  /** The shapes for the end of a section. */
  readonly section: FillShapes;
  /** The biggest shapes: into a new pass, into a bigger section, into the final hit (DR-15). */
  readonly top: FillShapes;
  /**
   * The cymbal keeps time through every fill, as the feet do: a fill is a
   * set-up played under the time, not a break in it (ST-jazz-15). Left out, a
   * fill takes the cymbal hand too.
   */
  readonly keepTime?: boolean;
}

/**
 * What the drummer writes as a bar: the time, the touches laid over it, and
 * the fills. A style writes it for 4/4, and may write it again for another
 * meter (`DrumStyle.meters`), every line then as long as that meter's bar.
 */
export interface DrumTime {
  /**
   * The time, as a different part for each tier. The layers are laid down in
   * order, each adding its strokes to the bar; where two write the same piece
   * on the same sixteenth, the later one wins.
   *
   * A bar of a meter nothing is written for is built from the 4/4 bar's beats,
   * one per pulse (DR-10): beat 1 on the downbeat, beat 2 on backbeat pulses,
   * beat 3 on other strong pulses, beat 4 on the last pulse.
   */
  readonly grooves: PerTier<readonly GrooveLayer[]>;
  /** Touches laid over the groove after it is built (not over fills or the ending). */
  readonly touches: readonly Touch[];
  readonly fills: DrumFills;
}

export interface DrumStyle extends DrumTime {
  /**
   * The same three things written for a bar of another meter, by the meter's
   * name as a chart writes it: `"12/8"`, `"6/4"`. A bar of a meter written
   * here is played from it as it stands; any other is fitted from the 4/4 bar.
   */
  readonly meters?: Readonly<Partial<Record<MeterName, DrumTime>>>;
  /**
   * The cymbals that keep time. An arrival crash takes the place of their
   * stroke on beat 1 (DR-03, DR-20). A style that rides the crash lists it here.
   */
  readonly timekeepers: readonly DrumVoice[];
  /**
   * The arrival crash is played only at this energy and above; under it a
   * quiet band marks the top of a section with its fill alone, and the crash's
   * kick never fills a One the groove leaves empty (ST-reggae-05: no kick on
   * the One at the low level). Left out, every arrival is crashed (CO-41).
   */
  readonly crashFrom?: number;
  readonly ending: {
    /** What the kit strikes where the final chord lands, and how hard. Nothing else is played. */
    readonly strike: Strike;
    /**
     * In a button ending, what the kit strikes on the button, the short hit on
     * the "and" of the last beat (EN-17, ST-jazz-48). Left out, the drums play
     * only the strike and let the band button without them.
     */
    readonly button?: Strike;
  };
}
