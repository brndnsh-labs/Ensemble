// A performance as a Standard MIDI File: one track per seat, with tempo, time
// signature, section markers, and chord symbols, exactly as played.

import { PPQ } from "../chart/types.ts";
import type { PerformanceEvent } from "../perform/notes.ts";
import type { Plan } from "../plan/types.ts";
import type { Seat, StylePack } from "../style/types.ts";
import { SEATS } from "../style/types.ts";
import type { SmfMeta, SmfNote, SmfTrack } from "./smf.ts";
import { writeSmf } from "./smf.ts";

const TRACK_NAMES: Readonly<Record<Seat, string>> = {
  drums: "Drums",
  bass: "Bass",
  chords: "Chords",
  solo: "Solo",
};

/** General MIDI puts drums on channel 10 (index 9). The pitched seats take the first channels. */
const CHANNELS: Readonly<Record<Seat, number>> = { drums: 9, bass: 0, chords: 1, solo: 2 };

export function toMidi(
  plan: Plan,
  events: readonly PerformanceEvent[],
  style: StylePack,
): Uint8Array {
  const conductor: SmfMeta[] = [{ tick: 0, type: "tempo", bpm: plan.tempo }];
  let meter = "";
  for (const bar of plan.bars) {
    const signature = `${bar.meter.beats}/${bar.meter.unit}`;
    if (signature === meter) continue;
    meter = signature;
    conductor.push({
      tick: bar.start,
      type: "timeSignature",
      beats: bar.meter.beats,
      unit: bar.meter.unit,
    });
  }

  const notes: Record<Seat, SmfNote[]> = { drums: [], bass: [], chords: [], solo: [] };
  for (const event of events) {
    if (event.kind === "marker") {
      // Sections and landmarks are markers a DAW can show; chords and pass counts are text.
      const isLandmark = event.marker !== "chord" && event.marker !== "pass";
      const text = event.marker === "pass" ? `Pass ${event.text}` : event.text;
      conductor.push({ tick: event.tick, type: isLandmark ? "marker" : "text", text });
    } else {
      notes[event.seat].push({
        tick: event.tick + event.offset,
        duration: event.duration,
        pitch: event.pitch,
        velocity: event.velocity,
      });
    }
  }

  const tracks: SmfTrack[] = [];
  for (const seat of SEATS) {
    if (notes[seat].length === 0) continue;
    const track = { name: TRACK_NAMES[seat], channel: CHANNELS[seat], notes: notes[seat] };
    tracks.push(seat === "drums" ? track : { ...track, program: style.instruments[seat] });
  }
  return writeSmf({ ppq: PPQ, conductor, tracks });
}
