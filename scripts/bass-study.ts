// A study for an ear, not part of the band: the electric bass as the styles play it now,
// and the same lines with a softer touch (its gentler recordings, at the same level), with
// its tone rolled off, and with both. To choose how the bass should sound in each style.
//
//   node scripts/bass-study.ts   ->  out/bass-study/ (a page and its clips)
//
// Each clip is the top of one take, through the real sampler and mixer: once with the band
// and once the bass alone. Beside each, what was measured of the bass alone: how loud it is
// and how much of its energy lies above 800 Hz.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { STYLES } from "../packages/styles/src/index.ts";
import { renderAudio } from "./render-audio.ts";

const out = "out/bass-study";
mkdirSync(out, { recursive: true });

interface Variant {
  readonly id: string;
  readonly says: string;
  /** Added to each note's velocity to choose its recording. */
  readonly touch: number;
  /** The tone control, in Hz; absent for wide open. */
  readonly lowpass?: number;
}

const VARIANTS: readonly Variant[] = [
  { id: "a", says: "As it is now", touch: 0 },
  { id: "b", says: "A softer touch", touch: -12 },
  { id: "c", says: "A much softer touch", touch: -24 },
  { id: "d", says: "As now, the tone rolled off at 400 Hz", touch: 0, lowpass: 400 },
  { id: "e", says: "A softer touch, the tone rolled off at 600 Hz", touch: -12, lowpass: 600 },
  { id: "f", says: "A much softer touch, the tone rolled off at 400 Hz", touch: -24, lowpass: 400 },
];

const TUNES: readonly { style: string; chart: string; seconds: number }[] = [
  { style: "neosoul", chart: "neosoul-four-chord-d.chart", seconds: 24 },
  { style: "reggae", chart: "reggae-three-chord-d.chart", seconds: 24 },
  { style: "funk", chart: "funk-two-chord-dm.chart", seconds: 20 },
];

/** Loudness in LUFS, and the share of energy above 800 Hz in dB, of a file. */
function measure(path: string): { loudness: number; bright: number } {
  const run = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-i", path, "-af", "ebur128", "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 1 << 28 },
  );
  const summary = run.stderr.slice(run.stderr.lastIndexOf("Summary:"));
  const loudness = Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]);
  const rms = (filter: string[]): number => {
    const stats = spawnSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostats",
        "-i",
        path,
        "-af",
        [...filter, "astats"].join(","),
        "-f",
        "null",
        "-",
      ],
      { encoding: "utf8", maxBuffer: 1 << 28 },
    ).stderr;
    const overall = stats.slice(stats.lastIndexOf("Overall"));
    return Number(/RMS level dB:\s+(-?[\d.]+)/.exec(overall)?.[1]);
  };
  // Two high-passes in a row: 24 dB an octave, so the fundamentals do not leak through.
  return { loudness, bright: rms(["highpass=f=800", "highpass=f=800"]) - rms([]) };
}

const rows: string[] = [];
for (const tune of TUNES) {
  const style = STYLES.find((s) => s.id === tune.style)!;
  rows.push(`<h2>${style.name} <small>(${tune.chart.replace(".chart", "")})</small></h2>`);
  rows.push(
    "<table><tr><th></th><th>The band</th><th>The bass alone</th><th>Bass, measured</th></tr>",
  );
  for (const variant of VARIANTS) {
    const { seats } = style.sound.mix;
    const { lowpass: _, ...bass } = seats.bass;
    const mix = {
      ...style.sound.mix,
      seats: {
        ...seats,
        bass: variant.lowpass === undefined ? bass : { ...bass, lowpass: variant.lowpass },
      },
    };
    const files: string[] = [];
    let facts = { loudness: Number.NaN, bright: Number.NaN };
    for (const who of ["band", "bass"] as const) {
      const name = `${tune.style}-${variant.id}-${who}`;
      const { path } = await renderAudio(`bass-study-${name}`, {
        chart: tune.chart,
        style: tune.style,
        seed: "1",
        passes: "2",
        mix: JSON.stringify(mix),
        touch: `bass:${variant.touch}`,
        ...(who === "bass" ? { only: "bass" } : {}),
      });
      if (who === "bass") facts = measure(path);
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-i",
        path,
        "-t",
        String(tune.seconds),
        "-af",
        `afade=t=out:st=${tune.seconds - 1}:d=1`,
        "-codec:a",
        "libmp3lame",
        "-q:a",
        "3",
        `${out}/${name}.mp3`,
      ]);
      files.push(`${name}.mp3`);
    }
    console.log(
      `${tune.style} ${variant.id}: ${facts.loudness.toFixed(1)} LUFS, over 800 Hz ${facts.bright.toFixed(1)} dB  (${variant.says})`,
    );
    rows.push(
      `<tr><td><b>${variant.id.toUpperCase()}</b> ${variant.says}</td>` +
        files
          .map((file) => `<td><audio controls preload="none" src="${file}"></audio></td>`)
          .join("") +
        `<td>${facts.loudness.toFixed(1)} LUFS; over 800 Hz ${facts.bright.toFixed(1)} dB</td></tr>`,
    );
  }
  rows.push("</table>");
}

writeFileSync(
  `${out}/index.html`,
  `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The electric bass: touch and tone</title>
<style>
  body { font: 16px/1.4 system-ui, sans-serif; margin: 1rem; max-width: 60rem; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  td, th { padding: 0.4rem 0.5rem; border-bottom: 1px solid #ccc; text-align: left; vertical-align: middle; }
  audio { width: 14rem; max-width: 100%; }
  small { font-weight: normal; color: #666; }
</style>
<h1>The electric bass: touch and tone</h1>
<p>The same bass line six ways in each style, the first as the band plays it now. A softer
touch plays the bass's gentler recordings at the level the line is written at: the styles
play its two hardest sets of recordings almost all the time, and those are the bright ones.
The tone is the bass's own tone control turned down. The last column is the bass alone,
measured: its loudness, and how much of its energy lies above 800 Hz (lower is darker).</p>
${rows.join("\n")}
`,
);
console.log(`${out}/index.html`);
