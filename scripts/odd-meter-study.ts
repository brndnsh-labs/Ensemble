// PROTOTYPE (#2244; a study for an ear, not part of the band, not for merging).
// The band in meters no style has written, as it plays them today (the fit) and
// with each seat's part derived from the part its style wrote (docs/decisions/
// meters.md, "every style in every meter: the design").
//
//   node scripts/odd-meter-study.ts [only=blues-5-4,rock-7-8] [text=1]
//       ->  out/odd-meter-study/ (a page and its clips)
//
// `text=1` writes the page without rendering any audio (clips already there are kept).
// Each clip is the top of one take through the real sampler and mixer: the band, the band
// with its soloist, and the drums and bass alone. Beside each, what was measured of a
// four-pass take of the same chart: how often a seat's bar is the bar at the same place a
// pass earlier, and how many times it strikes in a pulse, with the same chart in 4/4.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Meter, NoteEvent, StylePack, TakeOptions } from "../packages/engine/src/index.ts";
import { parseMeter, render, secondsAt } from "../packages/engine/src/index.ts";
import { meterName, pulseTicks } from "../packages/engine/src/perform/meter.ts";
import { derivation } from "../packages/engine/src/style/derive.ts";
import { STYLES } from "../packages/styles/src/index.ts";
import { renderAudio } from "./render-audio.ts";

const charts = "out/odd-meter-study/charts";

const args = Object.fromEntries(
  process.argv.slice(2).map((pair) => {
    const at = pair.indexOf("=");
    return [pair.slice(0, at), pair.slice(at + 1)];
  }),
);
const only = args.only?.split(",");
const textOnly = args.text === "1";
/** `page=2`: the second study, ways of making the bar's shape easier to feel, on two takes. */
const third = args.page === "3";
const second = args.page === "2" || third;
const out = third
  ? "out/odd-meter-study-3"
  : second
    ? "out/odd-meter-study-2"
    : "out/odd-meter-study";
mkdirSync(out, { recursive: true });

type Floor = "fit" | "cut" | "lope";

interface Variant {
  readonly id: string;
  readonly says: string;
  /** The chart, from the repository's root. */
  readonly chart: string;
  /** Play the chart in this meter (a chart written in 4/4, read in three). */
  readonly meter?: string;
  readonly floor?: Floor;
  /** Ways of making the shape easier to feel (`Clear` in `style/cut.ts`), a comma list. */
  readonly clear?: string;
}

interface Tune {
  readonly id: string;
  readonly style: string;
  readonly heading: string;
  /** The same chart in 4/4, for the measures. */
  readonly four: string;
  readonly variants: readonly Variant[];
}

const mine = (name: string) => `${charts}/${name}.chart`;

const five = (id: string, style: string, heading: string, four: string): Tune => ({
  id: `${id}-5-4`,
  style,
  heading,
  four,
  variants: [
    { id: "a", says: "Today: the fit (five equal beats)", chart: mine(`${id}-5-4`), floor: "fit" },
    { id: "b", says: "The derived part, 3+2", chart: mine(`${id}-5-4`) },
    {
      id: "c",
      says: "The derived part, 2+3 (its drums are the fit's: listen to the other three)",
      chart: mine(`${id}-5-4-23`),
    },
  ],
});

const seven = (id: string, style: string, heading: string, four: string): Tune => ({
  id: `${id}-7-8`,
  style,
  heading,
  four,
  variants: [
    {
      id: "a",
      says: "Today: the fit (2+2+3, the long beat loped)",
      chart: mine(`${id}-7-8`),
      floor: "fit",
    },
    { id: "b", says: "The derived part, 2+2+3, the eighth steady", chart: mine(`${id}-7-8`) },
    { id: "c", says: "The derived part, 3+2+2", chart: mine(`${id}-7-8-322`) },
    {
      id: "d",
      says: "The derived part, 2+2+3, the long beat as a compound beat (not chosen)",
      chart: mine(`${id}-7-8`),
      floor: "lope",
    },
  ],
});

const three = (id: string, style: string, heading: string, four: string): Tune => ({
  id: `${id}-3-4`,
  style,
  heading,
  four,
  variants: [
    { id: "a", says: "Today: the fit", chart: four, meter: "3/4", floor: "fit" },
    { id: "b", says: "The derived part", chart: four, meter: "3/4", floor: "cut" },
  ],
});

const clearer = (id: string, style: string, heading: string, four: string): Tune => ({
  id,
  style,
  heading,
  four,
  variants: [
    { id: "a", says: "As on the first page: the derived part", chart: mine(id) },
    {
      id: "b",
      says: "Held: one figure for the bass and one for the chords; the drums turn only at a phrase's end",
      chart: mine(id),
      clear: "hold",
    },
    {
      id: "c",
      says: "Held, and one backbeat a group: nothing but time in the middle of a three",
      chart: mine(id),
      clear: "hold,back",
    },
    {
      id: "d",
      says: "All four: held, one backbeat, the bass marking the shape, the downbeat kept",
      chart: mine(id),
      clear: "hold,back,bass,one",
    },
  ],
});

const SECOND: readonly { readonly heading: string; readonly tunes: readonly Tune[] }[] = [
  {
    heading: "5/4 (3+2)",
    tunes: [
      clearer(
        "blues-5-4",
        "blues",
        "The twelve-bar blues, as blues",
        "library/blues-12-bar-a.chart",
      ),
    ],
  },
  {
    heading: "7/8 (2+2+3)",
    tunes: [clearer("rock-7-8", "rock", "Four chords, as rock", "library/rock-four-chord-g.chart")],
  },
];

const ALL = "hold,back,bass,one";
const beside = (id: string, style: string, heading: string, four: string): Tune => ({
  id,
  style,
  heading,
  four,
  variants: [
    { id: "a", says: "As on the first page: the derived part", chart: mine(id) },
    {
      id: "d",
      says: "D: held, one backbeat a group, the bass marking the shape, the downbeat kept",
      chart: mine(id),
      clear: ALL,
    },
  ],
});
const THIRD: readonly { readonly heading: string; readonly tunes: readonly Tune[] }[] = [
  {
    heading: "D in three more styles",
    tunes: [
      beside("jazz-5-4", "jazz", "A two-five-one in 5/4 (3+2), as jazz", mine("jazz-4-4")),
      beside(
        "funk-7-8",
        "funk",
        "A two-chord vamp in 7/8 (2+2+3), as funk",
        "library/funk-two-chord-dm.chart",
      ),
      beside(
        "reggae-7-8",
        "reggae",
        "One and four in 7/8 (2+2+3), as reggae",
        "library/reggae-one-four-g.chart",
      ),
    ],
  },
  {
    heading: "D in each grouping",
    tunes: [
      {
        id: "blues-5-4-groupings",
        style: "blues",
        heading: "The twelve-bar blues in 5/4",
        four: "library/blues-12-bar-a.chart",
        variants: [
          { id: "32", says: "3+2", chart: mine("blues-5-4"), clear: ALL },
          { id: "23", says: "2+3", chart: mine("blues-5-4-23"), clear: ALL },
        ],
      },
      {
        id: "rock-7-8-groupings",
        style: "rock",
        heading: "Four chords in 7/8, as rock",
        four: "library/rock-four-chord-g.chart",
        variants: [
          { id: "223", says: "2+2+3", chart: mine("rock-7-8"), clear: ALL },
          { id: "322", says: "3+2+2", chart: mine("rock-7-8-322"), clear: ALL },
          { id: "232", says: "2+3+2", chart: mine("rock-7-8-232"), clear: ALL },
        ],
      },
    ],
  },
];

const FIRST: readonly { readonly heading: string; readonly tunes: readonly Tune[] }[] = [
  {
    heading: "5/4",
    tunes: [
      five("blues", "blues", "The twelve-bar blues, as blues", "library/blues-12-bar-a.chart"),
      five("jazz", "jazz", "A two-five-one, as jazz", mine("jazz-4-4")),
    ],
  },
  {
    heading: "7/8",
    tunes: [
      seven("rock", "rock", "Four chords, as rock", "library/rock-four-chord-g.chart"),
      seven("funk", "funk", "A two-chord vamp, as funk", "library/funk-two-chord-dm.chart"),
      seven("reggae", "reggae", "One and four, as reggae", "library/reggae-one-four-g.chart"),
    ],
  },
  {
    heading: "3/4",
    tunes: [
      three("blues", "blues", "The twelve-bar blues, as blues", "library/blues-12-bar-a.chart"),
      three("neosoul", "neosoul", "Four chords, as neo-soul", "library/neosoul-four-chord-d.chart"),
    ],
  },
];

const GROUPS = third ? THIRD : second ? SECOND : FIRST;

const safe = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SEATS = ["drums", "bass", "chords"] as const;

/** A take's options as the page and the CLI both make them. */
function optionsOf(
  variant: { meter?: string; floor?: Floor; clear?: string },
  passes: number,
): TakeOptions {
  return {
    mode: "jam",
    seed: 1,
    passes,
    ...(variant.meter ? { meter: parseMeter(variant.meter)! } : {}),
    ...(variant.floor ? { floor: variant.floor } : {}),
    ...(variant.clear ? { clear: variant.clear } : {}),
  };
}

interface Measured {
  /** By seat: the share of bars that are the bar at the same place a pass earlier, and strikes a pulse. */
  readonly seats: Record<
    (typeof SEATS)[number],
    {
      same: number;
      strikes: number /** The share of bars whose rhythm is the bar before's. */;
      again: number;
    }
  >;
}

/** The two measures of the design's section 6, over a four-pass take. */
function measure(
  text: string,
  style: StylePack,
  variant: { meter?: string; floor?: Floor; clear?: string },
): Measured {
  const take = render(text, style, { ...optionsOf(variant, 4), countIn: false });
  const music = take.plan.bars.filter((bar) => bar.kind === "music" && !bar.ending);
  const notes = take.events.filter((event): event is NoteEvent => event.kind === "note");
  const seats = {} as Measured["seats"];
  for (const seat of SEATS) {
    const mineOnly = notes.filter((note) => note.seat === seat);
    const place = new Map<number, number>();
    const said = new Map<string, string>();
    let same = 0;
    let compared = 0;
    let strikes = 0;
    let pulses = 0;
    let rhythmBefore: string | undefined;
    let again = 0;
    let followed = 0;
    for (const bar of music) {
      const at = place.get(bar.pass) ?? 0;
      place.set(bar.pass, at + 1);
      if (bar.seats[seat] === null) continue;
      const inBar = mineOnly.filter(
        (note) => note.tick >= bar.start && note.tick < bar.start + bar.ticks,
      );
      const says = inBar
        .map((note) => `${note.tick - bar.start}:${note.pitch}`)
        .sort()
        .join(" ");
      said.set(`${bar.pass}:${at}`, says);
      const before = said.get(`${bar.pass - 1}:${at}`);
      if (before !== undefined) {
        compared++;
        if (before === says) same++;
      }
      const rhythm = [...new Set(inBar.map((note) => note.tick - bar.start))].sort().join(" ");
      if (rhythmBefore !== undefined) {
        followed++;
        if (rhythm === rhythmBefore) again++;
      }
      rhythmBefore = rhythm;
      strikes += new Set(inBar.map((note) => note.tick)).size;
      pulses += pulseTicks(bar.meter).length;
    }
    seats[seat] = {
      same: compared ? same / compared : Number.NaN,
      strikes: pulses ? strikes / pulses : Number.NaN,
      again: followed ? again / followed : Number.NaN,
    };
  }
  return { seats };
}

const measuredCell = (measured: Measured): string =>
  SEATS.map((seat) => {
    const { same, strikes, again } = measured.seats[seat];
    if (second)
      return `${seat}: ${Math.round(again * 100)}% the rhythm of the bar before, ${strikes.toFixed(2)} a pulse`;
    return `${seat}: ${Number.isNaN(same) ? "–" : `${Math.round(same * 100)}%`} same, ${strikes.toFixed(2)} a pulse`;
  }).join("<br>");

/** A take read as text, as `ensemble read` prints it. */
function read(
  variant: Variant,
  style: string,
  bars: number,
  extra: readonly string[] = [],
): string {
  const run = spawnSync(
    "node",
    [
      "packages/cli/src/main.ts",
      "read",
      variant.chart,
      "--style",
      style,
      "--seed",
      "1",
      "--passes",
      "2",
      "--no-count-in",
      "--bars",
      `1-${bars}`,
      ...(variant.meter ? ["--meter", variant.meter] : []),
      ...(variant.floor ? ["--floor", variant.floor] : []),
      ...(variant.clear ? [`--clear=${variant.clear}`] : []),
      ...extra,
    ],
    { encoding: "utf8", maxBuffer: 1 << 26 },
  );
  if (run.status !== 0) return `read failed: ${run.stderr}`;
  // The legend is the same for every take: it is printed once, at the top of the page.
  const lines = run.stdout.split("\n");
  const first = lines.findIndex((line) => line.startsWith("bar 1 "));
  return [lines[0], lines[1], ...lines.slice(Math.max(first, 0))].join("\n").trimEnd();
}

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

const sections: string[] = [];
let legend = "";

for (const group of GROUPS) {
  const parts: string[] = [];
  for (const tune of group.tunes) {
    if (only && !only.includes(tune.id)) continue;
    const style = STYLES.find((one) => one.id === tune.style)!;
    const fourText = readFileSync(tune.four, "utf8");
    const inFour = measure(fourText, style, {});
    const rows: string[] = [];
    const notes: string[] = [];

    for (const variant of tune.variants) {
      const text = readFileSync(variant.chart, "utf8");
      const name = `${tune.id}-${variant.id}`;
      const measured = measure(text, style, variant);

      // The clip: the first pass and two bars of the second, as the page will play it.
      const played = render(text, style, optionsOf(variant, 2));
      const music = played.plan.bars.filter((bar) => bar.kind === "music");
      const pass = music.filter((bar) => bar.pass === music[0]!.pass).length;
      const stop = music[Math.min(music.length - 1, pass + 2)]!;
      const seconds = Math.min(75, secondsAt(played.plan, stop.start));
      const meter: Meter = played.chart.meter;

      const clips = [
        { who: "band", query: {} },
        { who: "solo", query: { solo: style.solo.instrument, fromtop: "1" } },
        { who: "rhythm", query: { only: "drums,bass" } },
        // The second study changes nothing the soloist plays: no clip with it.
      ].filter((clip) => !second || clip.who !== "solo");
      for (const clip of clips) {
        const file = `${name}-${clip.who}`;
        if (textOnly && existsSync(`${out}/${file}.mp3`)) continue;
        if (textOnly) continue;
        const { path } = await renderAudio(`odd-meter-${file}`, {
          chartAt: `/${variant.chart}`,
          style: tune.style,
          seed: "1",
          passes: "2",
          ...(variant.meter ? { meter: variant.meter } : {}),
          ...(variant.floor ? { floor: variant.floor } : {}),
          ...(variant.clear ? { clear: variant.clear } : {}),
          ...clip.query,
        });
        mp3(path, seconds, file);
        console.log(`${file}.mp3 (${seconds.toFixed(0)} s)`);
      }

      rows.push(
        `<tr><td><b>${variant.id.toUpperCase()}</b> ${variant.says}<br><small>${meterName(meter)}, ${played.plan.tempo} bpm</small></td>` +
          clips
            .map(
              (clip) =>
                `<td><audio controls preload="none" src="${name}-${clip.who}.mp3"></audio></td>`,
            )
            .join("") +
          `<td class="m">${measuredCell(measured)}</td></tr>`,
      );

      // What is under the clip: every bar of the first pass, the soloist's line, and where the part came from.
      const whole = read(variant, tune.style, pass);
      if (!legend) {
        const run = spawnSync(
          "node",
          [
            "packages/cli/src/main.ts",
            "read",
            variant.chart,
            "--style",
            tune.style,
            "--bars",
            "1-1",
            "--no-count-in",
          ],
          { encoding: "utf8" },
        );
        legend = run.stdout
          .split("\n")
          .filter(
            (line, index) =>
              index >= 2 && !line.startsWith("bar ") && !/^(drums|bass|chords|solo)\s/.test(line),
          )
          .join("\n")
          .trim();
      }
      const solo = read(variant, tune.style, pass, [
        "--solo-instrument",
        style.solo.instrument,
        "--solo-from-top",
        "--seats",
        "solo",
      ]);
      const made =
        variant.floor === "fit" ? null : derivation(style, meter, variant.floor, variant.clear);
      const derived = made
        ? (["drums", "bass", "chords", "solo"] as const)
            .map((seat) => {
              const one = made.seats[seat];
              if (!one) return `${seat}: written by the style for this meter`;
              if (!one.part)
                return `${seat}: nothing derived; the seat plays as it does today\n${one.dropped.map((line) => `  left out: ${line}`).join("\n")}`;
              return [
                `${seat}: ${one.grids.length} derived, ${one.dropped.length} left out`,
                ...one.dropped.map((line) => `  left out: ${line}`),
                ...one.grids.map((line) => `  ${line}`),
              ].join("\n");
            })
            .join("\n\n")
        : "";
      notes.push(
        `<details><summary><b>${variant.id.toUpperCase()}</b> every bar of the first pass</summary><pre>${safe(whole)}</pre>` +
          `<p>The soloist's line in the clip with the soloist:</p><pre>${safe(solo)}</pre></details>` +
          (made
            ? `<details><summary><b>${variant.id.toUpperCase()}</b> the derived part beside the written one</summary><pre>${safe(derived)}</pre></details>`
            : ""),
      );
      console.log(`${name}: ${measuredCell(measured).replace(/<br>/g, "; ")}`);
    }

    parts.push(
      `<h3>${tune.heading} <small>(${style.name})</small></h3>`,
      `<table><tr><th></th><th>The band</th>${second ? "" : "<th>With its soloist</th>"}<th>Drums and bass</th><th>Measured, four passes</th></tr>`,
      ...rows,
      `<tr><td>The same chart in 4/4 <small>(no clip)</small></td><td></td>${second ? "" : "<td></td>"}<td></td><td class="m">${measuredCell(inFour)}</td></tr>`,
      "</table>",
      ...notes,
    );
  }
  if (parts.length) sections.push(`<h2>${group.heading}</h2>`, ...parts);
}

const title = third
  ? "Odd meters: D in more styles and in each grouping"
  : second
    ? "Odd meters: making the bar's shape easier to feel"
    : "Every style in every meter: a study in 5/4, 7/8 and 3/4";
// What building the prototype found, written by hand beside this script's output.
const found = existsSync(`${out}/found.html`) ? readFileSync(`${out}/found.html`, "utf8") : "";
const intro = existsSync(`${out}/intro.html`) ? readFileSync(`${out}/intro.html`, "utf8") : "";

writeFileSync(
  `${out}/index.html`,
  `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { font: 16px/1.45 system-ui, sans-serif; margin: 1rem auto; padding: 0 1rem; max-width: 72rem; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 0.75rem; }
  td, th { padding: 0.4rem 0.5rem; border-bottom: 1px solid #ccc; text-align: left; vertical-align: middle; }
  td.m { font-size: 0.85rem; white-space: nowrap; }
  audio { width: 13rem; max-width: 100%; }
  small { font-weight: normal; color: #666; }
  pre { font-size: 0.78rem; overflow-x: auto; background: #f6f6f6; padding: 0.6rem; }
  details { margin: 0.25rem 0; }
  h2 { margin-top: 2.5rem; border-top: 2px solid #333; padding-top: 0.75rem; }
  h3 { margin-top: 1.75rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #111; color: #ddd; } pre { background: #1c1c1c; } small { color: #999; }
    td, th { border-color: #444; } h2 { border-color: #aaa; }
  }
</style>
<h1>${title}</h1>
${intro}
${sections.join("\n")}
${found}
<h2>How to read the bars</h2>
<pre>${safe(legend)}</pre>
`,
);
console.log(`${out}/index.html`);
