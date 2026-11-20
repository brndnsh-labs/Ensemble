// A performance as a Standard MIDI File: one track per seat, with tempo, time
// signature, section markers, and chord symbols, exactly as played.

import { PPQ } from "../chart/types.ts";
import { tempoPulse } from "../perform/meter.ts";
import type { PerformanceEvent } from "../perform/notes.ts";
import { asStruck, CURVE_STEP, pitchCurve } from "../perform/pitch.ts";
import type { Plan } from "../plan/types.ts";
import { SOLO_INSTRUMENTS } from "../players/solo/instruments.ts";
import type { Seat, StylePack } from "../style/types.ts";
import { SEATS, seatChoice } from "../style/types.ts";
import type { TakeOptions } from "../take.ts";
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

/** Channel expression, the controller a note's dying away is said with. */
const EXPRESSION = 11;
/** How many steps a fade is said in. */
const FADE_STEPS = 16;

/** General MIDI puts drums on channel 10 (index 9). The pitched seats take the first channels. */
const CHANNELS: Readonly<Record<Seat, number>> = { drums: 9, bass: 0, chords: 1, solo: 2 };

/**
 * The General MIDI program a band seat is played on: the style's own, or, where
 * the player chose another of the style's instruments for it, that one's. An
 * instrument is known by its pack, as the soloists' list names them.
 */
function programOf(
  style: StylePack,
  seat: Exclude<Seat, "drums" | "solo">,
  instruments: TakeOptions["instruments"],
): number {
  const played = seatChoice(style, seat, instruments).pack;
  if (played === style.sound.packs[seat]) return style.instruments[seat];
  return SOLO_INSTRUMENTS[played]?.program ?? style.instruments[seat];
}

/** `instruments` is the take's own (`TakeOptions.instruments`): the file names what was heard. */
export function toMidi(
  plan: Plan,
  events: readonly PerformanceEvent[],
  style: StylePack,
  instruments?: TakeOptions["instruments"],
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
  const controls: Record<Seat, { tick: number; number: number; value: number }[]> = {
    drums: [],
    bass: [],
    chords: [],
    solo: [],
  };
  const secondsPerTick = 60 / (plan.quarters * PPQ);
  let soloProgram: number | undefined;
  // A note not struck is said as part of the note before it: one note-on, the pitch bent.
  for (const event of asStruck(events, secondsPerTick)) {
    if (event.kind === "marker") {
      // Sections and landmarks are markers a DAW can show; chords and pass counts are text.
      const isLandmark = event.marker !== "chord" && event.marker !== "pass";
      const text = event.marker === "pass" ? `Pass ${event.text}` : event.text;
      conductor.push({ tick: event.tick, type: isLandmark ? "marker" : "text", text });
    } else {
      if (event.seat === "solo") soloProgram ??= SOLO_INSTRUMENTS[event.voice ?? ""]?.program;
      const start = event.tick + event.offset;
      // A note that dies away past its end is held until it has.
      const sounds = event.duration + (event.fade ?? 0);
      notes[event.seat].push({
        tick: start,
        duration: sounds,
        pitch: event.pitch,
        velocity: event.velocity,
      });
      if (event.fade) {
        // The dying away as the channel's expression, straight down to nothing as the sound's
        // gain goes, and back to full when the note is let go.
        for (let i = 0; i < FADE_STEPS; i++) {
          controls[event.seat].push({
            tick: start + event.duration + (event.fade * i) / FADE_STEPS,
            number: EXPRESSION,
            value: 127 * (1 - i / FADE_STEPS),
          });
        }
        controls[event.seat].push({ tick: start + sounds, number: EXPRESSION, value: 127 });
      }
      if (event.move) {
        // The same curve the sound follows, said as pitch bend wherever it has moved 3 cents.
        const curve = pitchCurve(event.move, secondsPerTick, sounds * secondsPerTick);
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
        bends[event.seat].push({ tick: start + sounds, semitones: 0 });
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
      ...(controls[seat].length > 0 ? { controls: controls[seat] } : {}),
    };
    if (seat === "drums") tracks.push(track);
    // The soloist's notes name the instrument that played them.
    else if (seat === "solo") tracks.push({ ...track, program: soloProgram ?? 0 });
    else tracks.push({ ...track, program: programOf(style, seat, instruments) });
  }
  return writeSmf({ ppq: PPQ, conductor, tracks });
}
