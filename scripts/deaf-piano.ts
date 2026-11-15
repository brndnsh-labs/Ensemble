// Renders a take with a piano that cannot hear the soloist: the style's
// `chords.listening` off and the comper's `under-the-soloist` weight at zero.
// Everything else, the soloist included, is the same take. Gate 3 sets it
// beside the listening piano so the difference can be heard.
// Usage: node scripts/deaf-piano.ts <chart> <out.mid> [passes] [seed] [without]

import { readFileSync, writeFileSync } from "node:fs";
import type { Seat, StylePack } from "../packages/engine/src/index.ts";
import { render, toMidi } from "../packages/engine/src/index.ts";
import { styleById } from "../packages/styles/src/index.ts";

/** The same band with a piano that plays as if nobody were soloing. */
export function deaf(style: StylePack): StylePack {
  return {
    ...style,
    chords: { ...style.chords, listening: null },
    critic: {
      ...style.critic,
      weights: {
        ...style.critic.weights,
        comping: { ...style.critic.weights.comping, "under-the-soloist": 0 },
      },
    },
  };
}

if (import.meta.main) {
  const [chart, out, passes = "5", seed = "1", without = "drums,bass"] = process.argv.slice(2);
  const blues = styleById("blues");
  if (!chart || !out || !blues) {
    throw new Error("usage: deaf-piano.ts <chart> <out.mid> [passes] [seed] [without]");
  }
  const style = deaf(blues);
  const take = render(readFileSync(chart, "utf8"), style, {
    mode: "jam",
    passes: Number(passes),
    seed: Number(seed),
    solo: true,
    without: without.split(",").filter(Boolean) as Seat[],
  });
  writeFileSync(out, toMidi(take.plan, take.events, style));
  console.log(`  ${out}: the piano deaf to the soloist, ${passes} passes, seed ${seed}`);
}
