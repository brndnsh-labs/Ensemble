// The keyboard: one hand, every pitch of a strike at once, and a new strike
// cuts whatever the hand was holding (CH-35).

import type { WrittenNote } from "../../perform/notes.ts";
import { mod12 } from "../../theory/pitch.ts";
import type { InstrumentIdiom } from "./idiom.ts";
import type { Voicing } from "./strike.ts";
import { MUTED } from "./strike.ts";

/** The top of the keyboard comp's reach, E6 (CH-15). */
const HIGHEST = 88;
/** The shortest note the comp plays: half a sixteenth (CH-35). */
const SHORTEST = 60;

export const keys: InstrumentIdiom = {
  holds: false,

  /**
   * Every inversion of the tones in close position, in every octave, with
   * nothing under the floor (X-B-02) and nothing above E6 (CH-15). Lowest
   * first, so a tie goes to the lower hand. A spread is the tones in the order
   * given, each the nearest of its note above the one before, from its bottom
   * note in every octave.
   */
  candidates(tones, root, register, position) {
    const result: Voicing[] = [];
    const classOf = (interval: number) => mod12(root + interval);
    if (position === "spread") {
      const first = tones[0];
      if (!first) return result;
      for (let bottom = register.floor; bottom <= HIGHEST; bottom++) {
        if (classOf(first.interval) !== mod12(bottom)) continue;
        const pitches = [bottom];
        for (const tone of tones.slice(1)) {
          const below = pitches[pitches.length - 1]!;
          pitches.push(below + 1 + mod12(classOf(tone.interval) - below - 1));
        }
        if (pitches[pitches.length - 1]! > HIGHEST) break;
        result.push({ pitches, tones: tones.map((tone) => tone.tone) });
      }
      return result;
    }
    for (let bottom = register.floor; bottom <= HIGHEST; bottom++) {
      const lowest = tones.find((t) => classOf(t.interval) === mod12(bottom));
      if (!lowest) continue;
      // Close position: each tone the nearest of its pitch class above the bottom note.
      const stacked = tones
        .map((t) => ({ tone: t.tone, pitch: bottom + mod12(classOf(t.interval) - bottom) }))
        .sort((a, b) => a.pitch - b.pitch);
      if (stacked[stacked.length - 1]!.pitch > HIGHEST) break;
      result.push({ pitches: stacked.map((s) => s.pitch), tones: stacked.map((s) => s.tone) });
    }
    return result;
  },

  write(part) {
    const notes: WrittenNote[] = [];
    part.forEach(({ strike, voicing }, i) => {
      const next = part[i + 1]?.strike;
      const room = next && next.tick > strike.tick ? next.tick - strike.tick : Infinity;
      const duration = Math.max(SHORTEST, Math.min(strike.duration, room));
      for (const pitch of voicing.pitches) {
        notes.push({
          seat: "chords",
          bar: strike.bar,
          tick: strike.tick,
          duration,
          pitch,
          velocity: strike.velocity,
          ...(strike.muted ? { voice: MUTED } : {}),
        });
      }
    });
    return notes;
  },
};
