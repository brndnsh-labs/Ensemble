// The material the properties are checked against: every library chart, in
// every style that ships, across seeds and kinds of jam. A take renders the first time
// something asks for it, once per process.

import { readdirSync, readFileSync } from "node:fs";
import type { NoteEvent, Seat, StylePack, Take, TakeOptions } from "@ensemble/engine";
import { parse, render, tempoRange } from "@ensemble/engine";
import { STYLES as SHIPPING, styleById } from "@ensemble/styles";

/**
 * The styles the properties are checked in: every style that ships, or the ones
 * `ENSEMBLE_STYLES=funk,jazz` names (`scripts/test.ts` runs one style to a process).
 */
export const STYLES: readonly StylePack[] = process.env.ENSEMBLE_STYLES
  ? process.env.ENSEMBLE_STYLES.split(",").map((id) => {
      const style = styleById(id.trim());
      if (!style) throw new Error(`ENSEMBLE_STYLES: no style "${id}"`);
      return style;
    })
  : SHIPPING;

/** For a property that is one style's own: `test("blues: ...", only("blues"), () => {})`. */
export const only = (id: string) => ({ skip: !STYLES.some((style) => style.id === id) });

/**
 * How many seeds each property is checked on. Every push plays two, which is what fits three
 * styles inside the budget; `pnpm test:full` plays six, enough to meet every weighted choice
 * a few times, and is run before a listening gate and after anything a player's choices
 * depend on (docs/TESTING.md, "Budgets").
 */
export const SEEDS: readonly number[] = Array.from(
  { length: Number(process.env.ENSEMBLE_SEEDS ?? 2) },
  (_, i) => i + 1,
);

/** The full run: every seed, and everything a push only samples. */
export const FULL = SEEDS.length >= 6;

/**
 * A floor on how many cases a property must have met to mean anything, written for the full
 * run of six seeds and scaled to the seeds in play.
 */
export const enough = (full: number): number => Math.floor((full * SEEDS.length) / 6);

export interface LibraryChart {
  readonly file: string;
  readonly text: string;
  /** The chart's meter as written, such as "4/4". */
  readonly meter: string;
}

const libraryDir = new URL("../library/", import.meta.url);
export const LIBRARY: readonly LibraryChart[] = readdirSync(libraryDir)
  .filter((file) => file.endsWith(".chart"))
  .sort()
  .map((file) => {
    const text = readFileSync(new URL(file, libraryDir), "utf8");
    const { meter } = parse(text).chart;
    return { file, text, meter: `${meter.beats}/${meter.unit}` };
  });

/**
 * The meters a style has written a band for besides 4/4 (DECISIONS.md, "the band in six and
 * twelve"). A style's own rules, and the rules that hold wherever a band plays from its
 * own parts, are held in these as they are in 4/4. In any other meter a style plays a bar it
 * makes up from its 4/4 parts, and only the rules that hold of any bar are asked of it.
 */
export const WRITTEN: Readonly<Record<string, readonly string[]>> = {
  jazz: ["6/4"],
  blues: ["12/8"],
};

/** A take whose chart is in 4/4 or in a meter its style has written. */
export const written = (jam: Pick<JamSpec, "style" | "chart">): boolean =>
  jam.chart.meter === "4/4" || (WRITTEN[jam.style.id] ?? []).includes(jam.chart.meter);

/** What a take is made from, before it is rendered. */
export interface JamSpec {
  readonly style: StylePack;
  readonly chart: LibraryChart;
  readonly options: TakeOptions;
}

export interface Jam extends JamSpec {
  readonly take: Take;
}

/**
 * Renders what is asked for and nothing else. The filter sees a take's style, chart, and
 * options; it is decided before anything renders, and a take rendered once is kept for the
 * rest of the process, so no take is rendered twice. Specs come in a fixed order and the
 * filter keeps that order.
 */
const rendered = new Map<string, Jam>();

function render1(spec: JamSpec): Jam {
  const key = `${spec.style.id}\0${spec.chart.file}\0${JSON.stringify(spec.options)}`;
  let jam = rendered.get(key);
  if (jam === undefined) {
    jam = { ...spec, take: render(spec.chart.text, spec.style, spec.options) };
    rendered.set(key, jam);
  }
  return jam;
}

function renderOnly(specs: readonly JamSpec[], only: (spec: JamSpec) => boolean): Jam[] {
  return specs.filter(only).map(render1);
}

/**
 * The kinds of take every property sees: a short jam, a timed one, one with no planned end,
 * the chart as a song, and a jam with the soloist asked for (the band, then a three-chorus
 * solo that runs into the ending).
 */
const KINDS: readonly Omit<TakeOptions, "seed">[] = [
  { mode: "jam", passes: 2 },
  { mode: "jam", minutes: 2.5 },
  { mode: "jam", open: true, passes: 3 },
  { mode: "song" },
  { mode: "jam", passes: 4, solo: true },
];

/**
 * How many charts written for other styles each style is handed: twenty on a push, and every
 * one of them on the full run, which held the floors of the blues' properties when the library
 * lost three blues charts that differed only by a setting (DECISIONS.md, the library's standards).
 */
const BORROWED = FULL ? Number.POSITIVE_INFINITY : 20;

/**
 * A style's own charts: the ones written for it, named for it. Any band can be handed any
 * tune, so a style is held to its own in every kind of take on every seed, and to up to a
 * dozen of the others in one take each (a kind and a seed by turns). They are spread evenly
 * through the rest of the library, starting at a different chart for each style, so that
 * between them the styles play all of it, and a new style's charts do not make every
 * other style's run longer.
 */
export const ownCharts = (style: StylePack): LibraryChart[] =>
  LIBRARY.filter((chart) => chart.file.startsWith(`${style.id}-`));

/**
 * The standards (`standard-*.chart`): tunes as they are known, longer and harder than the
 * library's own progressions, each written for a style (its `style:` line). The style they are
 * written for plays each of them on every push twice: once soloist included, and once in one of
 * the other kinds by turns. The full run plays each in every kind of take on half the seeds.
 * Every other style is handed them in turn with the rest of the library.
 */
const STANDARDS: readonly LibraryChart[] = LIBRARY.filter((chart) =>
  chart.file.startsWith("standard-"),
);
const standardsOf = (style: StylePack): LibraryChart[] =>
  STANDARDS.filter((chart) => parse(chart.text).chart.styleId === style.id);
const SOLO_KIND = KINDS.find((kind) => kind.solo)!;
const BAND_KINDS = KINDS.filter((kind) => !kind.solo);

const otherCharts = (style: StylePack): LibraryChart[] => {
  const mine = new Set([...ownCharts(style), ...standardsOf(style)]);
  const others = LIBRARY.filter((chart) => !mine.has(chart));
  const every = Math.max(1, Math.ceil(others.length / BORROWED));
  const from = SHIPPING.indexOf(style) % every;
  return others.filter((_, at) => at % every === from);
};

const TAKE_SPECS: readonly JamSpec[] = STYLES.flatMap((style) => [
  ...ownCharts(style).flatMap((chart) =>
    SEEDS.flatMap((seed) => KINDS.map((kind) => ({ style, chart, options: { ...kind, seed } }))),
  ),
  ...standardsOf(style).flatMap((chart, c) =>
    FULL
      ? // Every kind on half the seeds, the odd or the even ones by turns.
        SEEDS.filter((_, s) => s % 2 === c % 2).flatMap((seed) =>
          KINDS.map((kind) => ({ style, chart, options: { ...kind, seed } })),
        )
      : [
          { style, chart, options: { ...SOLO_KIND, seed: SEEDS[c % SEEDS.length]! } },
          {
            style,
            chart,
            options: {
              ...BAND_KINDS[c % BAND_KINDS.length]!,
              seed: SEEDS[(c + 1) % SEEDS.length]!,
            },
          },
        ],
  ),
  // A chart written for another style is played at this style's usual tempo, as the app
  // plays it (`tempoFor` in the app's `play/jam.ts`): Cherokee is 240 as jazz and 85 as neo-soul.
  ...otherCharts(style).map((chart, c) => ({
    style,
    chart,
    options: {
      ...KINDS[c % KINDS.length]!,
      seed: SEEDS[c % SEEDS.length]!,
      tempo: tempoRange(style, parse(chart.text).chart.meter).default,
    },
  })),
]);

/** The library's takes that pass `only`, which reads the style, chart, and options. */
export function takes(only: (spec: JamSpec) => boolean = () => true): Jam[] {
  return renderOnly(TAKE_SPECS, only);
}

const chartsDir = new URL("./charts/", import.meta.url);
const testChart = (file: string): LibraryChart => ({
  file,
  text: readFileSync(new URL(file, chartsDir), "utf8"),
  meter: "4/4",
});

/**
 * Not tunes: charts written to reach what the library cannot.
 *
 * - every-colour: every kind of chord the format can write, with tensions, alterations, and
 *   a slash chord. The library is nearly all plain sevenths.
 * - awkward: chords an eighth long, rests inside bars, two and four and eight chords a bar.
 */
const STRESS: readonly LibraryChart[] = [
  testChart("every-colour.chart"),
  testChart("awkward.chart"),
];

const STRESS_KINDS: readonly Omit<TakeOptions, "seed">[] = [
  { mode: "jam", passes: 2, energy: 0.3 },
  { mode: "jam", passes: 2, energy: 0.55 },
  { mode: "jam", passes: 2, energy: 0.85 },
  { mode: "jam", passes: 3 },
  { mode: "jam", passes: 3, solo: true },
];

const STRESS_SPECS: readonly JamSpec[] = STYLES.flatMap((style) =>
  STRESS.flatMap((chart) =>
    SEEDS.slice(0, 4).flatMap((seed) =>
      STRESS_KINDS.map((kind) => ({ style, chart, options: { ...kind, seed } })),
    ),
  ),
);

/**
 * The stress charts at each level and as a jam with an arc and an ending, over a few seeds,
 * those that pass `only`.
 */
export function stressTakes(only: (spec: JamSpec) => boolean = () => true): Jam[] {
  return renderOnly(STRESS_SPECS, only);
}

const SOLOIST_KINDS: readonly Omit<TakeOptions, "seed">[] = [
  { mode: "song", solo: true },
  { mode: "jam", passes: 3, solo: true, tempo: 160 },
  { mode: "jam", passes: 3, solo: true, tempo: 60, soloInstrument: "alto-sax" },
  { mode: "jam", passes: 3, solo: true, energy: 0.3 },
  { mode: "jam", passes: 3, solo: true, energy: 0.85, soloInstrument: "alto-sax" },
];

const SOLOIST_SPECS: readonly JamSpec[] = STYLES.flatMap((style) => [
  ...[...ownCharts(style), ...STRESS].flatMap((chart, c) =>
    SOLOIST_KINDS.flatMap((kind, k) =>
      // On a push, every other kind, a chart starting where the last left off.
      FULL || (c + k) % 2 === 0
        ? [{ style, chart, options: { ...kind, seed: 1 + ((c + k) % 2) } }]
        : [],
    ),
  ),
  ...otherCharts(style).map((chart, c) => ({
    style,
    chart,
    options: { ...SOLOIST_KINDS[c % SOLOIST_KINDS.length]!, seed: 1 + (c % 2) },
  })),
]);

/**
 * The soloist where a plain jam does not take it: a song, fast and slow, quiet and
 * loud, and on the horn, which has to breathe. Each of the style's own charts in every
 * kind (on a push, every other kind), on one of two seeds by turns, and every other chart
 * in one. Only the soloist's properties read these.
 */
export function soloistTakes(): Jam[] {
  return renderOnly(SOLOIST_SPECS, () => true);
}

/** A take's notes in the order they sound, for one seat or for all. */
export function notesOf(take: Take, seat?: Seat): NoteEvent[] {
  return take.events.filter(
    (event): event is NoteEvent =>
      event.kind === "note" && (seat === undefined || event.seat === seat),
  );
}

// ── reading a MIDI file back ────────────────────────────────────────────────

export interface SmfTrackSummary {
  name: string;
  readonly tempos: number[];
  readonly channels: Set<number>;
  noteOns: number;
  noteOffs: number;
}

export interface SmfSummary {
  readonly format: number;
  readonly ppq: number;
  readonly tracks: SmfTrackSummary[];
}

/** Parse a Standard MIDI File strictly. Throws if a single byte is out of place. */
export function readSmf(bytes: Uint8Array): SmfSummary {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== "MThd" || view.getUint32(4) !== 6) throw new Error("not a MIDI file header");
  const format = view.getUint16(8);
  const trackCount = view.getUint16(10);
  const ppq = view.getUint16(12);
  const tracks: SmfTrackSummary[] = [];
  let at = 14;
  for (let t = 0; t < trackCount; t++) {
    if (tag(at) !== "MTrk") throw new Error(`track ${t}: no MTrk`);
    const end = at + 8 + view.getUint32(at + 4);
    at += 8;
    const track: SmfTrackSummary = {
      name: "",
      tempos: [],
      channels: new Set(),
      noteOns: 0,
      noteOffs: 0,
    };
    let ended = false;
    while (at < end) {
      if (ended) throw new Error(`track ${t}: events after end of track`);
      // Delta time: a variable-length quantity.
      while (bytes[at]! & 0x80) at++;
      at++;
      const status = bytes[at]!;
      if (status === 0xff) {
        const type = bytes[at + 1]!;
        const length = bytes[at + 2]!;
        if (length & 0x80) throw new Error(`track ${t}: long meta event`);
        const data = bytes.subarray(at + 3, at + 3 + length);
        if (type === 0x03) track.name ||= new TextDecoder().decode(data);
        if (type === 0x51) {
          track.tempos.push(
            Math.round(60_000_000 / ((data[0]! << 16) | (data[1]! << 8) | data[2]!)),
          );
        }
        if (type === 0x2f) ended = true;
        at += 3 + length;
      } else if ((status & 0xf0) === 0x90 || (status & 0xf0) === 0x80) {
        const sounding = (status & 0xf0) === 0x90 && bytes[at + 2]! > 0;
        if (bytes[at + 1]! > 127 || bytes[at + 2]! > 127)
          throw new Error(`track ${t}: bad note data`);
        if (sounding) track.noteOns++;
        else track.noteOffs++;
        track.channels.add(status & 0x0f);
        at += 3;
      } else if ((status & 0xf0) === 0xc0) {
        at += 2;
      } else if ((status & 0xf0) === 0xb0 || (status & 0xf0) === 0xe0) {
        // A controller (the bend range) or a pitch bend: two data bytes.
        if (bytes[at + 1]! > 127 || bytes[at + 2]! > 127) throw new Error(`track ${t}: bad data`);
        at += 3;
      } else {
        throw new Error(`track ${t}: unexpected status ${status.toString(16)}`);
      }
    }
    if (!ended || at !== end) throw new Error(`track ${t}: does not end where it says`);
    tracks.push(track);
  }
  if (at !== bytes.length) throw new Error("bytes after the last track");
  return { format, ppq, tracks };
}
