// The page for an ear on the band in meters no style has written (#2339): the
// built band in 5/4 and 7/8 beside the prototype's row D, which is the same
// notes, and in the styles and charts no study page had.
//
//   node scripts/made-meters.ts [text=1]   ->  out/made-meters/ (a page and its clips)
//
// `text=1` writes the page without rendering audio (clips already there are kept).
// Each clip is the top of one take through the real sampler and mixer. Beside each,
// what `ensemble score --meter` reads, on a four-pass take of the same chart: how
// often a seat's bar is the bar at the same place a pass earlier, and its strikes
// a pulse, and of the soloist its bars of one note, in the meter and in 4/4.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { TakeOptions } from "../packages/engine/src/index.ts";
import {
  METER_MEASURES,
  meterName,
  parseMeterChoice,
  render,
  secondsAt,
} from "../packages/engine/src/index.ts";
import { STYLES } from "../packages/styles/src/index.ts";
import { renderAudio } from "./render-audio.ts";

const out = "out/made-meters";
mkdirSync(out, { recursive: true });
const textOnly = process.argv.includes("text=1");

interface Take {
  readonly id: string;
  readonly style: string;
  readonly chart: string;
  readonly meter: string;
  readonly heading: string;
  /** A clip of the prototype's row D of this take, from a study page, where there is one. */
  readonly rowD?: string;
  readonly clips: readonly ("band" | "rhythm" | "solo")[];
}

const TAKES: readonly { readonly title: string; readonly says: string; readonly takes: Take[] }[] =
  [
    {
      title: "The two you leaned to D on, as built",
      says: "The first clip of each row is the prototype's row D from the second page. The rest are the built band on the same chart and seed: the same MIDI file, byte for byte, so the band clip should be the one you heard. New here: the soloist over it.",
      takes: [
        {
          id: "blues-5-4",
          style: "blues",
          chart: "library/blues-12-bar-a.chart",
          meter: "5/4",
          heading: "The twelve-bar blues in 5/4 (3+2)",
          rowD: "../odd-meter-study-2/blues-5-4-d-band.mp3",
          clips: ["band", "rhythm", "solo"],
        },
        {
          id: "rock-7-8",
          style: "rock",
          chart: "library/rock-four-chord-g.chart",
          meter: "7/8",
          heading: "The four-chord song in 7/8 (2+2+3)",
          rowD: "../odd-meter-study-2/rock-7-8-d-band.mp3",
          clips: ["band", "rhythm", "solo"],
        },
      ],
    },
    {
      title: "What no page had",
      says: "A 4/4 chart from the library read into the meter, as the picker will do it, in the styles you have not heard in these meters. Disco and acoustic are the two places the built band is not the prototype: disco's guitar had lost its chop to a pad on every beat, and acoustic's shaker (its timekeeper) stopped for the middle beat of a three. Both are mended. Read, not heard: in neo-soul's 5/4 neither the kick nor the bass is on beat 4, so only the snare on 3 and 5 says three and two.",
      takes: [
        {
          id: "disco-5-4",
          style: "disco",
          chart: "library/disco-dominant-vamp-bb.chart",
          meter: "5/4",
          heading: "Disco's dominant vamp in 5/4 (3+2)",
          clips: ["band", "rhythm"],
        },
        {
          id: "neosoul-5-4",
          style: "neosoul",
          chart: "library/neosoul-ballad-ab.chart",
          meter: "5/4",
          heading: "Neo-soul's ballad in 5/4 (3+2)",
          clips: ["band", "solo"],
        },
        {
          id: "acoustic-7-8",
          style: "acoustic",
          chart: "library/acoustic-canon-d.chart",
          meter: "7/8 (3+2+2)",
          heading: "Acoustic's canon in 7/8 (3+2+2)",
          clips: ["band", "solo"],
        },
        {
          id: "country-7-8",
          style: "country",
          chart: "library/country-ballad-g.chart",
          meter: "7/8 (2+3+2)",
          heading: "Country's ballad in 7/8 (2+3+2)",
          clips: ["band", "solo"],
        },
        {
          id: "jazz-5-4",
          style: "jazz",
          chart: "library/jazz-two-five-one-c.chart",
          meter: "5/4",
          heading: "A two-five-one, two chords a bar, read into 5/4 (3+2) as jazz",
          clips: ["band", "solo"],
        },
      ],
    },
  ];

const WHO = {
  band: "The band",
  rhythm: "Drums and bass",
  solo: "With the soloist",
} as const;

function mp3(wav: string, seconds: number, name: string): void {
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    wav,
    "-t",
    String(seconds),
    "-af",
    `afade=t=out:st=${Math.max(0, seconds - 1)}:d=1`,
    "-codec:a",
    "libmp3lame",
    "-q:a",
    "3",
    `${out}/${name}.mp3`,
  ]);
}

/** The measures of a seat in a meter on a four-pass take of the chart with the soloist, in the meter and in 4/4. */
function measured(take: Take): string {
  const style = STYLES.find((one) => one.id === take.style)!;
  const text = readFileSync(take.chart, "utf8");
  const options: TakeOptions = { mode: "jam", passes: 4, solo: true, seed: 1, countIn: false };
  const there = render(text, style, { ...options, meter: parseMeterChoice(take.meter)! });
  const own = render(text, style, options);
  const f = (value: number | undefined, unit: string) =>
    value === undefined
      ? "not measured"
      : unit === "share"
        ? `${Math.round(value * 100)}%`
        : value.toFixed(2);
  return METER_MEASURES.map((measure) => {
    const [now, was] = [measure.of(there, style), measure.of(own, style)];
    return `${measure.id}: ${f(now?.value, measure.unit)} <small>(${f(was?.value, measure.unit)} in 4/4)</small>`;
  }).join("<br>");
}

/** The take's first bars as `ensemble read` prints them. */
function transcription(take: Take, bars: number): string {
  const run = spawnSync(
    "node",
    [
      "packages/cli/src/main.ts",
      "read",
      take.chart,
      "--style",
      take.style,
      "--seed",
      "1",
      "--passes",
      "2",
      "--meter",
      take.meter,
      "--bars",
      `1-${bars}`,
    ],
    { encoding: "utf8", maxBuffer: 1 << 26 },
  );
  if (run.status !== 0) return `read failed: ${run.stderr}`;
  return run.stdout.trimEnd().replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

const sections: string[] = [];
let clipCount = 0;
for (const group of TAKES) {
  const parts: string[] = [];
  for (const take of group.takes) {
    const style = STYLES.find((one) => one.id === take.style)!;
    const text = readFileSync(take.chart, "utf8");
    const meter = parseMeterChoice(take.meter)!;
    // The clip: the first pass and two bars of the second.
    const played = render(text, style, { mode: "jam", passes: 2, seed: 1, meter });
    const music = played.plan.bars.filter((bar) => bar.kind === "music");
    const pass = music.filter((bar) => bar.pass === music[0]!.pass).length;
    const stop = music[Math.min(music.length - 1, pass + 2)]!;
    const seconds = Math.min(60, secondsAt(played.plan, stop.start));

    const cells: string[] = [];
    if (take.rowD) {
      clipCount++;
      cells.push(
        `<td><small>Row D, the prototype</small><br><audio controls preload="none" src="${take.rowD}"></audio></td>`,
      );
    }
    for (const who of take.clips) {
      const file = `${take.id}-${who}`;
      clipCount++;
      if (!textOnly) {
        const { path } = await renderAudio(`made-meters-${file}`, {
          chartAt: `/${take.chart}`,
          style: take.style,
          seed: "1",
          passes: "2",
          meter: take.meter,
          ...(who === "solo" ? { solo: style.solo.instrument, fromtop: "1" } : {}),
          ...(who === "rhythm" ? { only: "drums,bass" } : {}),
        });
        mp3(path, seconds, file);
        console.log(`${file}.mp3 (${seconds.toFixed(0)} s)`);
      }
      const missing = existsSync(`${out}/${file}.mp3`) ? "" : " <small>(not rendered)</small>";
      cells.push(
        `<td><small>${WHO[who]}, built</small>${missing}<br><audio controls preload="none" src="${file}.mp3"></audio></td>`,
      );
    }
    parts.push(
      `<h3>${take.heading} <small>(${style.name}, ${meterName(meter)}, ${played.plan.tempo} bpm, seed 1)</small></h3>`,
      `<table><tr>${cells.join("")}<td class="m">${measured(take)}</td></tr></table>`,
      `<details><summary>The first eight bars, as read</summary><pre>${transcription(take, 8)}</pre></details>`,
    );
  }
  sections.push(`<h2>${group.title}</h2>\n<p>${group.says}</p>\n${parts.join("\n")}`);
}

const page = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>5/4 and 7/8, built</title>
<style>
  body { font: 16px/1.45 system-ui, sans-serif; margin: 1rem auto; padding: 0 1rem; max-width: 72rem; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 0.75rem; }
  td, th { padding: 0.4rem 0.5rem; border-bottom: 1px solid #ccc; text-align: left; vertical-align: top; }
  td.m { font-size: 0.85rem; white-space: nowrap; }
  audio { width: 13rem; max-width: 100%; }
  small { font-weight: normal; color: #666; }
  pre { font-size: 0.78rem; overflow-x: auto; background: #f6f6f6; padding: 0.6rem; }
  h2 { margin-top: 2.5rem; border-top: 2px solid #333; padding-top: 0.75rem; }
  h3 { margin-top: 1.75rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #111; color: #ddd; } pre { background: #1c1c1c; } small { color: #999; }
    td, th { border-color: #444; } h2 { border-color: #aaa; }
  }
</style>
<h1>5/4 and 7/8, built</h1>
<p>For issue #2339: the band in a meter no style has written, now in the engine and not on a
scratch branch. Each seat plays a part made from the one its style wrote, and tells the bar's
shape as row D did. ${clipCount} clips, each the first pass and two bars of the second, seed 1.</p>
<p><b>Measured, not heard.</b> On the study's charts the built band is the prototype's row D
note for note in seven styles of nine: 140 of 180 takes are the same MIDI file byte for byte
(nine styles, 5/4 as 3+2 and 2+3, 7/8 in its three groupings, two seeds, with and without the
soloist). The other forty are disco and acoustic, in the second part. Beside each take, over
four passes, with the same chart in 4/4 in brackets: how often a seat's bar is the bar at the
same place a pass earlier, how many times it strikes in a pulse, and of the soloist how many
of its bars are one note and no more.</p>
<p><b>The soloist is thinner in 7/8.</b> A bar of 7/8 takes beats 1, 2 and 4 of a 4/4 rhythm,
and a sparse rhythm rests on 4, so the long beat is often empty. Over 48 takes funk's soloist
has one note and no more in 20% of its bars, against 14% of the same takes in 4/4; rock's 19%
against 13%.</p>
<p><b>What this page asks you:</b></p>
<ol>
<li>Is the built band good enough to put 5/4 and 7/8 in the meter list, an entry a grouping?
Does any take in the second part fall apart?</li>
<li>The soloist over it, in 7/8 most of all: enough as a floor, or does it need more in the long beat?</li>
</ol>
${sections.join("\n")}
`;
writeFileSync(`${out}/index.html`, page);
console.log(`${out}/index.html (${clipCount} clips)`);
