// The drum kit, from Virtuosity Drums. Each hit is one mono file: the kick,
// snare and overhead microphones added at the balance the library's basic kit
// program plays them at (all three at full, the room, mid and vintage mics
// off), with their timing as recorded. A pan per voice places it.

import { join } from "node:path";
import {
  byVelocity,
  type Part,
  pickLayers,
  type Recipe,
  type Take,
  type Voice,
} from "../recipe.ts";
import {
  alternate,
  readSfz,
  regionGainDb,
  type SfzRegion,
  soundsByDefault,
  velocities,
} from "../sfz.ts";

/** Layer tops for drum voices, which use the whole velocity range. */
const TOPS = [40, 64, 88, 127];

/** The basic kit program, and the full kit for what the basic one leaves out. */
const BASIC = "Programs/01-basic-kit.sfz";
const FULL = "Programs/02-full-kit.sfz";

interface Piece {
  readonly program: string;
  /** The key the program plays the hit on (its keymap's name in the comment). */
  readonly key: number;
  /** Recordings per layer, at most. */
  readonly alternates: number;
  /** Recordings in the softest and hardest layers, at most, where fewer than `alternates`. */
  readonly outer?: number;
  /** Seconds a hit may ring, at most. */
  readonly cap: number;
  readonly trim: number;
  readonly pan: number;
  /** Take only the softest hits, as one layer. */
  readonly softest?: boolean;
  /** Semitones to retune the hit by resampling. */
  readonly shift?: number;
  readonly chokes?: readonly string[];
}

// Lengths and alternates are cut down from the brief's (crash 5 s, ride and
// bell 4, open hat 2.5, the rest to their natural end within 3 s, every
// alternate), which came to 72.9 MB decoded against a budget of 40. The drums'
// caps are now near where the voice's median take has fallen 40 dB, the ride
// and bell ring 3.5 s, and the outer layers keep two alternates.
const PIECES: Record<string, Piece> = {
  // KICK_SNRIGHT: the kick with the snares on, as the snare is.
  kick: { program: BASIC, key: 36, alternates: 4, outer: 2, cap: 1.2, trim: 0, pan: 0 },
  // SNARE_CENTER
  snare: { program: BASIC, key: 38, alternates: 4, outer: 2, cap: 1, trim: 0, pan: 0 },
  ghostSnare: { program: BASIC, key: 38, alternates: 4, cap: 1, trim: 0, pan: 0, softest: true },
  // SNARE_CROSSSTICK, which only the full kit maps.
  crossStick: { program: FULL, key: 88, alternates: 3, outer: 2, cap: 0.6, trim: -6, pan: 0 },
  // HH_CLOSED
  closedHat: {
    ...{ program: BASIC, key: 42, alternates: 4, outer: 2, cap: 0.6, trim: -8, pan: 0.3 },
    chokes: ["openHat"],
  },
  // HH_PEDAL
  pedalHat: {
    ...{ program: BASIC, key: 44, alternates: 4, outer: 2, cap: 1, trim: -12, pan: 0.3 },
    chokes: ["openHat"],
  },
  // HH_OPEN
  openHat: { program: BASIC, key: 46, alternates: 3, outer: 2, cap: 2.5, trim: -8, pan: 0.3 },
  // RIDE_RIDE
  ride: { program: BASIC, key: 51, alternates: 4, outer: 2, cap: 3.5, trim: -6, pan: -0.35 },
  // RIDE_BELL
  rideBell: { program: BASIC, key: 53, alternates: 3, outer: 2, cap: 3.5, trim: -4, pan: -0.35 },
  // CRASH_CRASH
  crash: { program: BASIC, key: 49, alternates: 3, outer: 2, cap: 5, trim: -5, pan: 0.2 },
  // HTOM_CENTER
  highTom: { program: BASIC, key: 48, alternates: 3, outer: 2, cap: 1, trim: -1, pan: 0.15 },
  // The kit has two toms. The mid tom is the high tom tuned down a whole step.
  midTom: {
    ...{ program: BASIC, key: 48, alternates: 3, outer: 2, cap: 1, trim: -1, pan: -0.05 },
    shift: -2,
  },
  // LTOM_CENTER
  lowTom: { program: BASIC, key: 41, alternates: 3, outer: 2, cap: 1.5, trim: -1, pan: -0.3 },
  // PERC_SHAKER
  shaker: { program: BASIC, key: 82, alternates: 3, cap: 0.5, trim: -11, pan: 0.4 },
  // SNARE_STICKSHOT1: one stick struck on the other as it rests on the snare head.
  sticks: { program: BASIC, key: 37, alternates: 3, outer: 2, cap: 0.5, trim: -6, pan: 0 },
};

/** The microphone a region's file is from: the folder under `Samples/`. */
function mic(r: SfzRegion): string {
  const m = /\/Samples\/(perc\/[^/]+|[^/]+)\//.exec(r.sample);
  return m ? m[1]! : "?";
}

/** The kit's hits on one key: each the same stroke as heard by every microphone that plays it. */
function hits(regions: readonly SfzRegion[], key: number): Map<string, SfzRegion[]> {
  const out = new Map<string, SfzRegion[]>();
  for (const r of regions) {
    if (r.opcodes.key !== String(key) || r.sample.startsWith("*") || !soundsByDefault(r)) continue;
    if (mic(r) === "lofi") continue;
    const v = velocities(r);
    const id = `${v.lo}-${v.hi}-${alternate(r)}`;
    const list = out.get(id) ?? [];
    list.push(r);
    out.set(id, list);
  }
  const mics = new Set([...out.values()].map((h) => h.map(mic).sort().join("+")));
  if (mics.size !== 1) throw new Error(`key ${key}: hits differ in microphones: ${[...mics]}`);
  return out;
}

function part(r: SfzRegion): Part {
  const offset = Number(r.opcodes.offset ?? 0);
  return offset > 0
    ? { file: r.sample, db: regionGainDb(r), offset }
    : { file: r.sample, db: regionGainDb(r) };
}

export const drumKit: Recipe = {
  id: "drum-kit",
  name: "Drum kit",
  source: "virtuosity-drums",
  channels: 1,
  kbps: 80,
  level: { measure: "peak", reference: -6 },
  foldDb: -6.0206,
  budgetMB: 40,
  changes:
    "Each hit's kick, snare and overhead microphones mixed to one mono file at the basic kit program's balance; " +
    "a selection of velocity layers and alternates; trimmed to the onset, cut at its decay or a length cap and faded; " +
    "levelled to one peak; the mid tom made from the high tom tuned down two semitones; encoded as Opus.",
  voices(dir) {
    const programs = new Map<string, SfzRegion[]>();
    const program = (p: string) => {
      if (!programs.has(p)) programs.set(p, readSfz(join(dir, p)));
      return programs.get(p)!;
    };
    return Object.entries(PIECES).map(([name, piece]): Voice => {
      const all = hits(program(piece.program), piece.key);
      // One region stands for each hit when choosing layers; its hit brings every microphone.
      const lead = new Map<SfzRegion, SfzRegion[]>();
      for (const h of all.values()) lead.set(h[0]!, h);
      const groups = byVelocity([...lead.keys()]);
      const picked = piece.softest
        ? [{ top: 127, regions: groups.slice(0, piece.alternates).flat() }]
        : pickLayers(groups, TOPS, (i, n) =>
            i === 0 || i === n - 1 ? (piece.outer ?? piece.alternates) : piece.alternates,
          );
      const take = (r: SfzRegion): Take => {
        const t = { parts: lead.get(r)!.map(part), cap: piece.cap };
        return piece.shift ? { ...t, shift: piece.shift } : t;
      };
      const voice: Voice = {
        name,
        layers: picked.map((l) => ({ top: l.top, zones: [{ takes: l.regions.map(take) }] })),
        trim: piece.trim,
        pan: piece.pan,
        oneShot: true,
      };
      return piece.chokes ? { ...voice, chokes: piece.chokes } : voice;
    });
  },
};
