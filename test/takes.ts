// The material the properties are checked against: every library chart, in
// every style that ships, across seeds and kinds of jam. A take renders the first time
// something asks for it, once per process.

import { readdirSync, readFileSync } from "node:fs";
import type { NoteEvent, Seat, StylePack, Take, TakeOptions } from "@ensemble/engine";
import { parse, render } from "@ensemble/engine";
import { STYLES } from "@ensemble/styles";

export { STYLES };

/** Enough seeds to meet every weighted choice a few times, few enough to stay inside the budget. */
export const SEEDS: readonly number[] = [1, 2, 3, 4, 5, 6];

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

const TAKE_SPECS: readonly JamSpec[] = STYLES.flatMap((style) =>
  LIBRARY.flatMap((chart) =>
    SEEDS.flatMap((seed) => KINDS.map((kind) => ({ style, chart, options: { ...kind, seed } }))),
  ),
);

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
    [1, 2, 3, 4].flatMap((seed) =>
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

const SOLOIST_SPECS: readonly JamSpec[] = STYLES.flatMap((style) =>
  [...LIBRARY, ...STRESS].flatMap((chart, c) =>
    SOLOIST_KINDS.map((kind, k) => ({
      style,
      chart,
      options: { ...kind, seed: 1 + ((c + k) % 2) },
    })),
  ),
);

/**
 * The soloist where a plain jam does not take it: a song, fast and slow, quiet and
 * loud, and on the horn, which has to breathe. Every chart in every kind, on one
 * of two seeds by turns. Only the soloist's properties read these.
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
