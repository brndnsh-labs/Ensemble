// The keyboard: one hand, every pitch of a strike at once, and a new strike
// cuts whatever the hand was holding (CH-35).

import type { WrittenNote } from "../../perform/notes.ts";
import { mod12 } from "../../theory/pitch.ts";
import type { InstrumentIdiom } from "./idiom.ts";
import type { Voicing } from "./strike.ts";

/** The top of the keyboard comp's reach, E6 (CH-15). */
const HIGHEST = 88;
/** The shortest note the comp plays: half a sixteenth (CH-35). */
const SHORTEST = 60;

export const keys: InstrumentIdiom = {
  /**
   * Every inversion of the tones in close position, in every octave, with
   * nothing under the floor (X-B-02) and nothing above E6 (CH-15). Lowest
   * first, so a tie goes to the lower hand.
   */
  candidates(tones, root, register) {
    const result: Voicing[] = [];
    const classOf = (interval: number) => mod12(root + interval);
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
        });
      }
    });
    return notes;
  },
};
