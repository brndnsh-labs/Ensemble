// ensemble render <chart> --style S --seed N [--minutes M | --passes P] --out take.mid [--save take.json]

import { basename } from "node:path";
import { parseArgs } from "node:util";
import type { Seat, TakeOptions } from "@ensemble/engine";
import { parseKey } from "@ensemble/engine";
import { STYLES } from "@ensemble/styles";
import type { Command } from "../command.ts";
import { readChart, UsageError } from "../command.ts";
import { findStyle, playTake, RECIPE_VERSION, writeRecipe } from "../take-output.ts";

const SEAT_NAMES: readonly Seat[] = ["drums", "bass", "chords", "solo"];

export const renderCommand: Command = {
  summary: "play the chart and write the performance as a MIDI file",
  usage:
    "<chart> [--out take.mid] [--save take.json] [--style S] [--seed N] [--minutes M | --passes P] [--song] [--solo] [--tempo BPM] [--energy 0..1] [--key K] [--without seat,seat] [--no-count-in]",
  run(args) {
    const { positionals, values } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        out: { type: "string", short: "o" },
        save: { type: "string" },
        style: { type: "string", short: "s" },
        seed: { type: "string", default: "1" },
        minutes: { type: "string", short: "m" },
        passes: { type: "string", short: "p" },
        song: { type: "boolean", default: false },
        solo: { type: "boolean", default: false },
        tempo: { type: "string", short: "t" },
        energy: { type: "string", short: "e" },
        key: { type: "string", short: "k" },
        without: { type: "string" },
        "no-count-in": { type: "boolean", default: false },
      },
    });
    const path = positionals[0];
    const text = readChart(path);
    if (values.out === undefined && values.save === undefined)
      throw new UsageError("where to? Give --out take.mid, --save take.json, or both");

    const number = (name: string, value: string | undefined): number | undefined => {
      if (value === undefined) return undefined;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0)
        throw new UsageError(`--${name} must be a positive number`);
      return parsed;
    };
    const without = (values.without ?? "")
      .split(",")
      .map((seat) => seat.trim())
      .filter((seat) => seat !== "");
    for (const seat of without) {
      if (!SEAT_NAMES.includes(seat as Seat)) {
        throw new UsageError(`--without: no seat "${seat}" (seats: ${SEAT_NAMES.join(", ")})`);
      }
    }
    const key = values.key === undefined ? undefined : parseKey(values.key);
    if (values.key !== undefined && !key)
      throw new UsageError(`--key: "${values.key}" is not a key (try Bb or F#m)`);

    const minutes = number("minutes", values.minutes);
    const passes = number("passes", values.passes);
    const tempo = number("tempo", values.tempo);
    const energy = values.energy === undefined ? undefined : Number(values.energy);
    if (energy !== undefined && !(energy >= 0 && energy <= 1)) {
      throw new UsageError("--energy is a level from 0 (quiet) to 1 (loud)");
    }
    const options: TakeOptions = {
      mode: values.song ? "song" : "jam",
      seed: values.seed,
      countIn: !values["no-count-in"],
      ...(values.solo ? { solo: true } : {}),
      without: without as Seat[],
      ...(minutes === undefined ? {} : { minutes }),
      ...(passes === undefined ? {} : { passes }),
      ...(tempo === undefined ? {} : { tempo }),
      ...(energy === undefined ? {} : { energy }),
      ...(key ? { key } : {}),
    };

    // The style named on the command line, else the chart's own, else the first that ships.
    const fromChart = /^style:\s*(\S+)/m.exec(text)?.[1];
    const style = findStyle(values.style ?? fromChart ?? STYLES[0]!.id);

    const chartName = path ? basename(path) : "";
    if (values.save !== undefined) {
      writeRecipe(values.save, {
        version: RECIPE_VERSION,
        chartName,
        chartText: text,
        style: style.id,
        options,
      });
      console.log(`${values.save}: recipe saved`);
    }
    playTake(chartName, text, style, options, values.out);
    return 0;
  },
};
