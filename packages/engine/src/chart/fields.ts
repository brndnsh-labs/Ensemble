// The values of header fields: keys, meters, tempos, and section labels.

import type { Key, Letter } from "../theory/pitch.ts";
import { plainSigns } from "./symbol.ts";
import type { Meter, SectionRole } from "./types.ts";

/**
 * A key as written in a `key:` line: a root plus `m` for minor (`C`, `Bb`,
 * `F#m`). `min`, `minor`, `maj`, and `major` are understood too. Null if the
 * text is not a key.
 */
export function parseKey(text: string): Key | null {
  const match = /^([A-G])([#b]?)\s*(m|min|minor|maj|major)?$/.exec(plainSigns(text.trim()));
  if (!match) return null;
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  const word = match[3] ?? "";
  return {
    tonic: { letter: match[1] as Letter, accidental },
    mode: word === "m" || word.startsWith("mi") ? "minor" : "major",
  };
}

/** `n/d` with `d` one of 2, 4, 8 and `n` from 1 to 32. Null otherwise. */
export function parseMeter(text: string): Meter | null {
  const match = /^(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(text.trim());
  if (!match) return null;
  const beats = Number(match[1]);
  const unit = Number(match[2]);
  if (beats < 1 || beats > 32 || (unit !== 2 && unit !== 4 && unit !== 8)) return null;
  return { beats, unit };
}

export const meterToString = (meter: Meter): string => `${meter.beats}/${meter.unit}`;

/** Beats per minute: a whole number from 1 to 999. Null otherwise. */
export function parseTempo(text: string): number | null {
  const tempo = /^\d{1,3}$/.test(text.trim()) ? Number(text) : 0;
  return tempo >= 1 ? tempo : null;
}

/**
 * What jam mode does with a section, from its label. The reserved words count
 * with or without a number after them (`Intro`, `intro 2`, `Tag 1`); anything
 * else, including `Intro vamp`, is body.
 */
export function roleOfLabel(label: string): SectionRole {
  const word = /^(\w+)(?:\s+\d+)?$/.exec(label.trim())?.[1]?.toLowerCase();
  if (word === "intro") return "intro";
  if (word === "outro" || word === "ending" || word === "coda" || word === "tag") return "ending";
  return "body";
}

/** Labels match without regard to case or spacing: `[verse 1]` repeats `[Verse 1]`. */
export const labelId = (label: string): string => label.trim().replace(/\s+/g, " ").toLowerCase();
