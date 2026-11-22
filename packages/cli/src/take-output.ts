// What `render`, `read` and `replay` share: the flags that say which take is meant,
// finding a style, playing a take, and the recipe file.

import { writeFileSync } from "node:fs";
import type { Seat, StylePack, TakeOptions, TakeRecipe } from "@ensemble/engine";
import {
  fits,
  meterName,
  parse,
  parseKey,
  parseMeter,
  recipeText,
  render,
  SOLO_INSTRUMENTS,
  seconds,
  toMidi,
} from "@ensemble/engine";
import { STYLES, styleById, styleIds } from "@ensemble/styles";
import { reportDiagnostics, UsageError } from "./command.ts";

export const SEAT_NAMES: readonly Seat[] = ["drums", "bass", "chords", "solo"];

/** The flags that say which take is meant, as `parseArgs` options. */
export const TAKE_FLAGS = {
  style: { type: "string", short: "s" },
  seed: { type: "string", default: "1" },
  minutes: { type: "string", short: "m" },
  passes: { type: "string", short: "p" },
  song: { type: "boolean", default: false },
  solo: { type: "boolean", default: false },
  "solo-instrument": { type: "string" },
  "solo-density": { type: "string" },
  "solo-from-top": { type: "boolean", default: false },
  breathe: { type: "boolean", default: false },
  tempo: { type: "string", short: "t" },
  energy: { type: "string", short: "e" },
  key: { type: "string", short: "k" },
  meter: { type: "string" },
  without: { type: "string" },
  "no-count-in": { type: "boolean", default: false },
} as const;

/** The take flags as shown in a usage line. */
export const TAKE_USAGE =
  "[--style S] [--seed N] [--minutes M | --passes P] [--song] [--solo] [--solo-instrument NAME] [--solo-density 0..1] [--solo-from-top] [--tempo BPM] [--breathe] [--energy 0..1] [--key K] [--meter 12/8] [--without seat,seat] [--no-count-in]";

/** The take flags' values as `parseArgs` gives them. */
export interface TakeFlags {
  readonly style?: string | undefined;
  readonly seed?: string | undefined;
  readonly minutes?: string | undefined;
  readonly passes?: string | undefined;
  readonly song?: boolean | undefined;
  readonly solo?: boolean | undefined;
  readonly "solo-instrument"?: string | undefined;
  readonly "solo-density"?: string | undefined;
  readonly "solo-from-top"?: boolean | undefined;
  readonly breathe?: boolean | undefined;
  readonly tempo?: string | undefined;
  readonly energy?: string | undefined;
  readonly key?: string | undefined;
  readonly meter?: string | undefined;
  readonly without?: string | undefined;
  readonly "no-count-in"?: boolean | undefined;
}

/** A list of seats from a flag (`drums,bass`), each checked. */
export function seatList(flag: string, value: string | undefined): Seat[] {
  const seats = (value ?? "")
    .split(",")
    .map((seat) => seat.trim())
    .filter((seat) => seat !== "");
  for (const seat of seats) {
    if (!SEAT_NAMES.includes(seat as Seat)) {
      throw new UsageError(`--${flag}: no seat "${seat}" (seats: ${SEAT_NAMES.join(", ")})`);
    }
  }
  return seats as Seat[];
}

/** The take the flags mean of a chart's text: its options and its style. */
export function takeOf(
  values: TakeFlags,
  text: string,
): { options: TakeOptions; style: StylePack } {
  const number = (name: string, value: string | undefined): number | undefined => {
    if (value === undefined) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0)
      throw new UsageError(`--${name} must be a positive number`);
    return parsed;
  };
  const without = seatList("without", values.without);
  const key = values.key === undefined ? undefined : parseKey(values.key);
  if (values.key !== undefined && !key)
    throw new UsageError(`--key: "${values.key}" is not a key (try Bb or F#m)`);

  // Another of the band's meters, which the chart must fit: refused with the reason it does not.
  const meter = values.meter === undefined ? undefined : parseMeter(values.meter);
  if (values.meter !== undefined) {
    if (!meter) throw new UsageError(`--meter: "${values.meter}" is not a meter (try 12/8 or 3/4)`);
    const fit = fits(parse(text).chart, meter);
    if (!fit.ok) throw new UsageError(`--meter ${values.meter}: ${fit.reason}`);
  }

  // Asking for an instrument is asking for the soloist.
  const instrument = values["solo-instrument"];
  if (instrument !== undefined && !Object.hasOwn(SOLO_INSTRUMENTS, instrument)) {
    throw new UsageError(
      `--solo-instrument: no "${instrument}" (instruments: ${Object.keys(SOLO_INSTRUMENTS).join(", ")})`,
    );
  }

  const minutes = number("minutes", values.minutes);
  const passes = number("passes", values.passes);
  const tempo = number("tempo", values.tempo);
  const energy = values.energy === undefined ? undefined : Number(values.energy);
  if (energy !== undefined && !(energy >= 0 && energy <= 1)) {
    throw new UsageError("--energy is a level from 0 (quiet) to 1 (loud)");
  }
  // How busy the soloist is, and the soloist from the first pass: each asks for the soloist.
  const density = values["solo-density"] === undefined ? undefined : Number(values["solo-density"]);
  if (density !== undefined && !(density >= 0 && density <= 1)) {
    throw new UsageError(
      "--solo-density is a setting from 0 (sparse) to 1 (busy); 0.5 is the style's own",
    );
  }
  const fromTop = values["solo-from-top"] === true;
  const soloist =
    values.solo === true || instrument !== undefined || density !== undefined || fromTop;
  const options: TakeOptions = {
    mode: values.song ? "song" : "jam",
    seed: values.seed ?? "1",
    countIn: !values["no-count-in"],
    ...(soloist ? { solo: true } : {}),
    ...(instrument === undefined ? {} : { soloInstrument: instrument }),
    ...(density === undefined ? {} : { soloDensity: density }),
    ...(fromTop ? { soloFromTop: true } : {}),
    without,
    ...(minutes === undefined ? {} : { minutes }),
    ...(passes === undefined ? {} : { passes }),
    ...(tempo === undefined ? {} : { tempo }),
    // The tempo breathes with the arc; left out, it is the tempo set in every bar.
    ...(values.breathe === true ? { breathe: true } : {}),
    ...(energy === undefined ? {} : { energy }),
    ...(key ? { key } : {}),
    ...(meter ? { meter } : {}),
  };

  // The style named on the command line, else the chart's own, else the first that ships.
  const fromChart = /^style:\s*(\S+)/m.exec(text)?.[1];
  const style = findStyle(values.style ?? fromChart ?? STYLES[0]!.id);
  return { options, style };
}

export function findStyle(id: string): StylePack {
  const style = styleById(id);
  if (!style) throw new UsageError(`no style "${id}" (styles: ${styleIds().join(", ")})`);
  return style;
}

/** The recipe as the engine writes it (`recipeText`): the app's Export take writes the same. */
export function writeRecipe(path: string, recipe: TakeRecipe): void {
  writeFileSync(path, recipeText(recipe));
}

/** Renders, reports diagnostics, writes the MIDI file (if asked), prints the one-line summary. */
export function playTake(
  chartName: string,
  text: string,
  style: StylePack,
  options: TakeOptions,
  out: string | undefined,
): void {
  const take = render(text, style, options);
  reportDiagnostics(chartName, take.diagnostics);
  if (out !== undefined)
    writeFileSync(out, toMidi(take.plan, take.events, style, options.instruments));
  const notes = take.events.filter((event) => event.kind === "note").length;
  const length = Math.round(seconds(take.plan));
  console.log(
    `${out ?? chartName}: ${style.name}, ${options.meter ? `${meterName(options.meter)}, ` : ""}${take.plan.tempo} bpm, ${take.plan.passes} ${take.plan.passes === 1 ? "pass" : "passes"}, ` +
      `${take.plan.bars.length} bars, ${Math.floor(length / 60)}:${String(length % 60).padStart(2, "0")}, ${notes} notes, seed ${options.seed}`,
  );
}
