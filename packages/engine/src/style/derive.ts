// A style made from a style (#2244; docs/decisions/meters.md, "every style in
// every meter: the design", section 2): in a meter a seat has written nothing
// for, the seat's part is made from the part it wrote and found where a
// written one is. Each player asks its own seat's (`players/*/derive.ts`);
// this gathers the four, for whoever reads a style's data.

import type { Meter } from "../chart/types.ts";
import { meterName } from "../perform/meter.ts";
import { bassLinesIn } from "../players/bass/derive.ts";
import { rhythmBookIn } from "../players/chords/derive.ts";
import { drumTimeIn } from "../players/drums/derive.ts";
import { soloTimeIn } from "../players/solo/derive.ts";
import type { StylePack } from "./types.ts";

/**
 * The style as the band plays it in a meter: each seat's part for the meter filed under the
 * meter's name, its own where it wrote one and the made one where it did not. The style itself
 * in 4/4, and a seat is left as it is where nothing is made for it (a meter the band still fits
 * its 4/4 bar to, or a seat with nothing to make a part from).
 */
export function styleIn(style: StylePack, meter: Meter): StylePack {
  const name = meterName(meter);
  if (name === "4/4") return style;
  const drums = drumTimeIn(style.drums, meter);
  const bass = bassLinesIn(style.bass, meter);
  const chords = rhythmBookIn(style.chords, meter);
  const solo = soloTimeIn(style.solo, meter);
  return {
    ...style,
    drums: drums
      ? { ...style.drums, meters: { ...style.drums.meters, [name]: drums } }
      : style.drums,
    bass: bass ? { ...style.bass, meters: { ...style.bass.meters, [name]: bass } } : style.bass,
    chords: chords
      ? { ...style.chords, meters: { ...style.chords.meters, [name]: chords } }
      : style.chords,
    solo: solo ? { ...style.solo, meters: { ...style.solo.meters, [name]: solo } } : style.solo,
  };
}
