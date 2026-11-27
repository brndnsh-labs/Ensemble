// PROTOTYPE (#2244, the study page; not for merging). A style made from a
// style: in a meter a seat has written nothing for, the seat's part for that
// meter is made from the part it wrote, and filed where a written one would
// be. See docs/decisions/meters.md, "every style in every meter: the design".

import { BAND_METERS, sameMeter } from "../chart/remeter.ts";
import type { Meter } from "../chart/types.ts";
import { PPQ } from "../chart/types.ts";
import { meterName, pulseTicks, writtenFor } from "../perform/meter.ts";
import { bassIn } from "../players/bass/derive.ts";
import { chordsIn } from "../players/chords/derive.ts";
import { drumsIn } from "../players/drums/derive.ts";
import { soloTimeIn } from "../players/solo/derive.ts";
import type { Clear, Cut } from "./cut.ts";
import { cutOf } from "./cut.ts";
import type { StylePack } from "./types.ts";

/**
 * What the band plays in a meter a seat has not written:
 * - `fit`: what it plays today (the drums' fit, the plain bass bar, the pad, the cut-off rhythm);
 * - `cut`: the derived part, in every meter but 4/4;
 * - `lope`: the derived part with every dotted pulse made the compound way (the study's comparison).
 * Left out: the derived part in the meters the band has no part for at all (5/4, 7/8 and the
 * like, and any meter with a grouping of its own), and the fit in the five it plays today.
 */
export type Floor = "fit" | "cut" | "lope";

/** One seat's derived part, and what was left out of it and why (for the study page). */
export interface Derived<T> {
  /** Undefined where nothing could be derived: the seat plays its plain form, as today. */
  readonly part: T | undefined;
  /** Each written thing the derived part leaves out, with the reason: "fill tom-run (8): longer than the bar less its first pulse". */
  readonly dropped: readonly string[];
  /** Each derived grid beside the written one it came from, for reading: "kick  x... .... x... ....  ->  x... .... ....". */
  readonly grids: readonly string[];
}

export interface Derivation {
  readonly style: StylePack;
  /** By seat; a seat that wrote the meter itself is not here. */
  readonly seats: Readonly<Partial<Record<"drums" | "bass" | "chords" | "solo", Derived<unknown>>>>;
}

const KEPT = new WeakMap<StylePack, Map<string, Derivation>>();

const FOUR: Meter = { beats: 4, unit: 4 };

function derives(meter: Meter, floor: Floor | undefined): boolean {
  if (floor === "fit" || (sameMeter(meter, FOUR) && !meter.groups)) return false;
  if (floor !== undefined) return true;
  return meter.groups !== undefined || !BAND_METERS.some((one) => sameMeter(one, meter));
}

/** The style with a part for this meter in every seat: its own where it wrote one, the derived one elsewhere. */
export function derivation(style: StylePack, meter: Meter, floor?: Floor, clear = ""): Derivation {
  if (!derives(meter, floor)) return { style, seats: {} };
  const key = `${meterName(meter)} ${floor ?? ""} ${clear}`;
  const asked = new Set(clear.split(",").filter(Boolean) as Clear[]);
  let kept = KEPT.get(style);
  if (!kept) {
    kept = new Map();
    KEPT.set(style, kept);
  }
  const found = kept.get(key);
  if (found) return found;

  const name = meterName(meter);
  const lope = floor === "lope";
  const cutFor = (seat: { readonly meters?: Readonly<Record<string, unknown>> | undefined }): Cut =>
    cutOf(meter, seat.meters?.["12/8"] !== undefined, lope, asked);
  const seats: Partial<Record<"drums" | "bass" | "chords" | "solo", Derived<unknown>>> = {};
  let made = style;

  if (!writtenFor(style.drums.meters, meter)) {
    const drums = drumsIn(style.drums, cutFor(style.drums));
    seats.drums = drums;
    if (drums.part)
      made = {
        ...made,
        drums: { ...made.drums, meters: { ...made.drums.meters, [name]: drums.part } },
      };
  }
  if (!writtenFor(style.bass.meters, meter)) {
    const bass = bassIn(style.bass, cutFor(style.bass));
    seats.bass = bass;
    if (bass.part)
      made = {
        ...made,
        bass: { ...made.bass, meters: { ...made.bass.meters, [name]: bass.part } },
      };
  }
  if (!writtenFor(style.chords.meters, meter)) {
    const chords = chordsIn(style.chords, cutFor(style.chords));
    seats.chords = chords;
    if (chords.part)
      made = {
        ...made,
        chords: { ...made.chords, meters: { ...made.chords.meters, [name]: chords.part } },
      };
  }
  if (!writtenFor(style.solo.meters, meter)) {
    const solo = soloTimeIn(style.solo, cutFor(style.solo));
    seats.solo = solo;
    if (solo.part)
      made = {
        ...made,
        solo: { ...made.solo, meters: { ...made.solo.meters, [name]: solo.part } },
      };
  }
  // A derived bar of dotted pulses is played at the speeds the style wrote for its twelve.
  const twelve = style.tempo.meters?.["12/8"];
  if (twelve && !style.tempo.meters?.[name] && pulseTicks(meter).every((t) => t === PPQ * 1.5))
    made = { ...made, tempo: { ...made.tempo, meters: { ...made.tempo.meters, [name]: twelve } } };

  const result = { style: made, seats };
  kept.set(key, result);
  return result;
}

/** The style as a take in these meters plays it. */
export function styleIn(
  style: StylePack,
  meters: readonly Meter[],
  floor?: Floor,
  clear = "",
): StylePack {
  let made = style;
  const seen = new Set<string>();
  for (const meter of meters) {
    const name = meterName(meter);
    if (seen.has(name)) continue;
    seen.add(name);
    // Each meter's parts are made from the style as written, and gathered into one.
    const one = derivation(style, meter, floor, clear).style;
    if (one === style) continue;
    made = {
      ...made,
      tempo: { ...made.tempo, meters: { ...made.tempo.meters, ...one.tempo.meters } },
      drums: { ...made.drums, meters: { ...made.drums.meters, ...one.drums.meters } },
      bass: { ...made.bass, meters: { ...made.bass.meters, ...one.bass.meters } },
      chords: { ...made.chords, meters: { ...made.chords.meters, ...one.chords.meters } },
      solo: { ...made.solo, meters: { ...made.solo.meters, ...one.solo.meters } },
    };
  }
  return made;
}
