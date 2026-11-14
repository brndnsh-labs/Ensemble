// ensemble render <chart> --style S --seed N [--minutes M | --passes P] --out take.mid

import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Seat, TakeOptions } from "@ensemble/engine";
import { parseKey, render, seconds, toMidi } from "@ensemble/engine";
import { STYLES, styleById } from "@ensemble/styles";
import type { Command } from "../command.ts";
import { readChart, reportDiagnostics, UsageError } from "../command.ts";

const SEAT_NAMES: readonly Seat[] = ["drums", "bass", "chords", "solo"];

export const renderCommand: Command = {
  summary: "play the chart and write the performance as a MIDI file",
  usage:
    "<chart> --out take.mid [--style S] [--seed N] [--minutes M | --passes P] [--song] [--tempo BPM] [--energy 0..1] [--key K] [--without seat,seat] [--no-count-in]",
  run(args) {
    const { positionals, values } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        out: { type: "string", short: "o" },
        style: { type: "string", short: "s" },
        seed: { type: "string", default: "1" },
        minutes: { type: "string", short: "m" },
        passes: { type: "string", short: "p" },
        song: { type: "boolean", default: false },
        tempo: { type: "string", short: "t" },
        energy: { type: "string", short: "e" },
        key: { type: "string", short: "k" },
        without: { type: "string" },
        "no-count-in": { type: "boolean", default: false },
      },
    });
    const path = positionals[0];
    const text = readChart(path);
    if (values.out === undefined) throw new UsageError("where to? Give --out take.mid");

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
      without: without as Seat[],
      ...(minutes === undefined ? {} : { minutes }),
      ...(passes === undefined ? {} : { passes }),
      ...(tempo === undefined ? {} : { tempo }),
      ...(energy === undefined ? {} : { energy }),
      ...(key ? { key } : {}),
    };

    // The style named on the command line, else the chart's own, else the first that ships.
    const fromChart = /^style:\s*(\S+)/m.exec(text)?.[1];
    const styleId = values.style ?? fromChart ?? STYLES[0]!.id;
    const style = styleById(styleId);
    if (!style) {
      throw new UsageError(`no style "${styleId}" (styles: ${STYLES.map((s) => s.id).join(", ")})`);
    }

    const take = render(text, style, options);
    reportDiagnostics(path ?? "", take.diagnostics);
    writeFileSync(values.out, toMidi(take.plan, take.events, style));
    const notes = take.events.filter((event) => event.kind === "note").length;
    const length = Math.round(seconds(take.plan));
    console.log(
      `${values.out}: ${style.name}, ${take.plan.tempo} bpm, ${take.plan.passes} ${take.plan.passes === 1 ? "pass" : "passes"}, ` +
        `${take.plan.bars.length} bars, ${Math.floor(length / 60)}:${String(length % 60).padStart(2, "0")}, ${notes} notes, seed ${values.seed}`,
    );
    return 0;
  },
};
