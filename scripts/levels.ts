// How loud is each seat, and how loud is the soloist against the band? Renders
// a style's seats one at a time through the real sampler and mixer and reads
// each file's loudness.
//
//   node scripts/levels.ts [style...]
//
// A measurement, not a test: nobody here can hear, and "the soloist may need
// to come up a touch" has to be a number before it is a change. The mix aims
// the soloist about a decibel under the band it plays over. Loudness is
// integrated LUFS, which leaves silence out, so a soloist is measured while it
// plays. Run it for a new style before an ear is asked.

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { parse, SOLO_INSTRUMENTS } from "../packages/engine/src/index.ts";
import { STYLES } from "../packages/styles/src/index.ts";
import { renderAudio } from "./render-audio.ts";

/** Integrated loudness in LUFS and the true peak in dBFS, as ffmpeg reads them. */
function read(path: string): { loudness: number; peak: number } {
  const run = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
    // The filter logs every tenth of a second: a take of twelve minutes writes more than the
    // default megabyte, and a summary cut off reads as NaN.
    { encoding: "utf8", maxBuffer: 1 << 28 },
  );
  const summary = run.stderr.slice(run.stderr.lastIndexOf("Summary:"));
  return {
    loudness: Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]),
    peak: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]),
  };
}

const wanted = process.argv.slice(2);
const library = readdirSync(new URL("../library/", import.meta.url));
const show = (value: number) => value.toFixed(1).padStart(6);

for (const style of STYLES.filter((s) => wanted.length === 0 || wanted.includes(s.id))) {
  // The style's most ordinary chart (the one nearest its usual tempo: not its ballad, not its
  // burner), five times round: the band alone, then a solo of three choruses.
  const chart = library
    .filter((file) => file.startsWith(`${style.id}-`))
    .map((file) => {
      const text = readFileSync(new URL(`../library/${file}`, import.meta.url), "utf8");
      return {
        file,
        off: Math.abs((parse(text).chart.tempo ?? style.tempo.default) - style.tempo.default),
      };
    })
    .sort((a, b) => a.off - b.off)[0]!.file;
  const take = { chart, style: style.id, seed: "1", passes: "5" };
  const measure = async (query: Record<string, string>) =>
    read((await renderAudio("levels", { ...take, ...query })).path);

  console.log(`\n${style.name} (${chart})`);
  for (const seat of ["drums", "bass", "chords"]) {
    console.log(`  ${seat.padEnd(18)}${show((await measure({ only: seat })).loudness)} LUFS`);
  }
  const band = await measure({ only: "drums,bass,chords" });
  console.log(`  ${"the band".padEnd(18)}${show(band.loudness)} LUFS`);
  for (const [id, instrument] of Object.entries(SOLO_INSTRUMENTS)) {
    const solo = await measure({ solo: id, only: "solo" });
    const all = await measure({ solo: id });
    console.log(
      `  ${instrument.name.padEnd(18)}${show(solo.loudness)} LUFS, ${show(solo.loudness - band.loudness)} dB against the band; ` +
        `everyone ${show(all.loudness)} LUFS, peak ${show(all.peak)} dBFS`,
    );
  }
}
