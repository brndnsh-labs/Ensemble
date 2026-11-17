// A performance as a Standard MIDI File: one track per seat, with tempo, time
// signature, section markers, and chord symbols, exactly as played.

import { PPQ } from "../chart/types.ts";
import { tempoPulse } from "../perform/meter.ts";
import type { PerformanceEvent } from "../perform/notes.ts";
import { CURVE_STEP, pitchCurve } from "../perform/pitch.ts";
import type { Plan } from "../plan/types.ts";
import { SOLO_INSTRUMENTS } from "../players/solo/instruments.ts";
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

/** Cents the pitch must have moved before the file says so again. */
const BEND_STEP = 3;

/** General MIDI puts drums on channel 10 (index 9). The pitched seats take the first channels. */
const CHANNELS: Readonly<Record<Seat, number>> = { drums: 9, bass: 0, chords: 1, solo: 2 };

export function toMidi(
  plan: Plan,
  events: readonly PerformanceEvent[],
  style: StylePack,
): Uint8Array {
  // A MIDI file's tempo is quarter notes a minute, whatever the pulse the figure counts.
  const conductor: SmfMeta[] = [{ tick: 0, type: "tempo", bpm: plan.quarters }];
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
      // The metronome clicks the pulse the tempo counts: 24 MIDI clocks to a quarter note.
      click: Math.round(24 * tempoPulse(bar.meter)),
    });
  }

  const notes: Record<Seat, SmfNote[]> = { drums: [], bass: [], chords: [], solo: [] };
  const bends: Record<Seat, { tick: number; semitones: number }[]> = {
    drums: [],
    bass: [],
    chords: [],
    solo: [],
  };
  const secondsPerTick = 60 / (plan.quarters * PPQ);
  let soloProgram: number | undefined;
  for (const event of events) {
    if (event.kind === "marker") {
      // Sections and landmarks are markers a DAW can show; chords and pass counts are text.
      const isLandmark = event.marker !== "chord" && event.marker !== "pass";
      const text = event.marker === "pass" ? `Pass ${event.text}` : event.text;
      conductor.push({ tick: event.tick, type: isLandmark ? "marker" : "text", text });
    } else {
      if (event.seat === "solo") soloProgram ??= SOLO_INSTRUMENTS[event.voice ?? ""]?.program;
      const start = event.tick + event.offset;
      notes[event.seat].push({
        tick: start,
        duration: event.duration,
        pitch: event.pitch,
        velocity: event.velocity,
      });
      if (event.move) {
        // The same curve the sound follows, said as pitch bend wherever it has moved 3 cents.
        const curve = pitchCurve(event.move, secondsPerTick, event.duration * secondsPerTick);
        let said = Number.NaN;
        curve.forEach((cents, i) => {
          if (Math.abs(cents - said) < BEND_STEP && i > 0) return;
          said = cents;
          bends[event.seat].push({
            tick: start + (i * CURVE_STEP) / secondsPerTick,
            semitones: cents / 100,
          });
        });
        // The channel is let go when the note is, or the next note would start bent.
        bends[event.seat].push({ tick: start + event.duration, semitones: 0 });
      }
    }
  }

  const tracks: SmfTrack[] = [];
  for (const seat of SEATS) {
    if (notes[seat].length === 0) continue;
    const track = {
      name: TRACK_NAMES[seat],
      channel: CHANNELS[seat],
      notes: notes[seat],
      ...(bends[seat].length > 0 ? { bends: bends[seat] } : {}),
    };
    if (seat === "drums") tracks.push(track);
    // The soloist's notes name the instrument that played them.
    else if (seat === "solo") tracks.push({ ...track, program: soloProgram ?? 0 });
    else tracks.push({ ...track, program: style.instruments[seat] });
  }
  return writeSmf({ ppq: PPQ, conductor, tracks });
}
