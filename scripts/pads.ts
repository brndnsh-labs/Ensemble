// Renders a take with the piano holding each chord (no rhythm book), so the
// voicings and how they move can be heard with no comping rhythm in the way.
// Usage: node scripts/pads.ts <chart> <out.mid> [passes] [seed]

import { readFileSync, writeFileSync } from "node:fs";
import { render, toMidi } from "../packages/engine/src/index.ts";
import { styleById } from "../packages/styles/src/index.ts";

const [chart, out, passes = "3", seed = "1"] = process.argv.slice(2);
const blues = styleById("blues");
if (!chart || !out || !blues) throw new Error("usage: pads.ts <chart> <out.mid> [passes] [seed]");
const style = { ...blues, chords: { ...blues.chords, rhythm: null } };
const take = render(readFileSync(chart, "utf8"), style, {
  mode: "jam",
  passes: Number(passes),
  seed: Number(seed),
  without: ["solo"],
});
writeFileSync(out, toMidi(take.plan, take.events, style));
console.log(`  ${out}: held chords, ${passes} passes, seed ${seed}`);
