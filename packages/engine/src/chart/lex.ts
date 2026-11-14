// Lines, source ranges, comments, and the tokens of a line of bars.

import type { SourceRange } from "./types.ts";

export interface Line {
  readonly text: string;
  /** Offset of the line's first character in the whole text. */
  readonly offset: number;
  /** 1-based. */
  readonly number: number;
}

/** Split on LF, CRLF, or a lone CR, keeping each line's offset. */
export function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (const match of text.matchAll(/\r\n|\r|\n/g)) {
    lines.push({ text: text.slice(start, match.index), offset: start, number: lines.length + 1 });
    start = match.index + match[0].length;
  }
  lines.push({ text: text.slice(start), offset: start, number: lines.length + 1 });
  return lines;
}

/** The range of columns `from` to `to` (0-based, half-open) of a line. */
export function rangeIn(line: Line, from: number, to: number): SourceRange {
  return { start: line.offset + from, end: line.offset + to, line: line.number, column: from + 1 };
}

/** A range from the start of `first` to the end of `last`. */
export function cover(first: SourceRange, last: SourceRange): SourceRange {
  return { ...first, end: Math.max(first.end, last.end) };
}

const isSpace = (ch: string | undefined): boolean => ch !== undefined && /\s/.test(ch);

/**
 * Where a `//` comment starts in a line, or -1. A comment must be at the start
 * of the line or preceded by whitespace, so `title: AC//DC` has none.
 */
export function commentStart(text: string): number {
  let at = text.indexOf("//");
  while (at > 0 && !isSpace(text[at - 1])) at = text.indexOf("//", at + 1);
  return at;
}

export type Lexeme =
  /** Anything between bar lines and spaces: a chord, `.`, `%`, `x4`, or a mistake. */
  | { readonly kind: "word"; readonly text: string; readonly from: number; readonly to: number }
  /**
   * A run of `|` with its marks: `:|` closes a repeat, `|:` opens one, and a
   * number touching the bar line (`|1`, `:|2`) begins an ending.
   */
  | {
      readonly kind: "barline";
      readonly closes: boolean;
      readonly opens: boolean;
      readonly ending: number | null;
      readonly from: number;
      readonly to: number;
    }
  /** A `//` where a token would start. The rest of the line is the comment. */
  | { readonly kind: "comment"; readonly from: number };

/** The tokens of a line of bars, from column `start`. Never fails: odd text becomes words. */
export function lexBars(text: string, start: number): Lexeme[] {
  const out: Lexeme[] = [];
  const startsBarLine = (i: number): boolean =>
    text[i] === "|" || (text[i] === ":" && text[i + 1] === "|");
  let at = start;
  while (at < text.length) {
    if (isSpace(text[at])) {
      at++;
      continue;
    }
    if (text.startsWith("//", at)) {
      out.push({ kind: "comment", from: at });
      break;
    }
    const from = at;
    if (!startsBarLine(at)) {
      at++;
      while (at < text.length && !isSpace(text[at]) && !startsBarLine(at)) at++;
      out.push({ kind: "word", text: text.slice(from, at), from, to: at });
      continue;
    }
    const closes = text[at] === ":";
    if (closes) at++;
    while (text[at] === "|") at++;
    let opens = false;
    let ending: number | null = null;
    if (text[at] === ":") {
      opens = true;
      at++;
    } else {
      const digits = /^[0-9]+/.exec(text.slice(at, at + 6))?.[0];
      if (digits) {
        ending = Number(digits);
        at += digits.length;
      }
    }
    out.push({ kind: "barline", closes, opens, ending, from, to: at });
  }
  return out;
}

/** The most times a repeat may play. */
export const MAX_REPEATS = 99;

/** The number in a repeat count such as `x4`, or null when the word is not one. */
export const repeatCount = (word: string): number | null =>
  /^[xX]\d+$/.test(word) ? Number(word.slice(1)) : null;

export const validRepeatCount = (times: number): boolean => times >= 1 && times <= MAX_REPEATS;
