import type { Measure } from "../types.ts";
import { bandMeasures, meterMeasures } from "./band.ts";
import { bassMeasures } from "./bass.ts";
import { chordMeasures } from "./chords.ts";
import { compingMeasures } from "./comping.ts";
import { conversationMeasures } from "./conversation.ts";
import { drumMeasures } from "./drums.ts";
import { soloMeasures } from "./solo.ts";

/** Every measure the scorecard reports, in the order it reports them. */
export const MEASURES: readonly Measure[] = [
  ...drumMeasures,
  ...bassMeasures,
  ...chordMeasures,
  ...compingMeasures,
  ...conversationMeasures,
  ...soloMeasures,
  ...bandMeasures,
];

/** What `ensemble score --meter` reads besides: a seat in a meter, set against itself in four. */
export const METER_MEASURES: readonly Measure[] = meterMeasures;
