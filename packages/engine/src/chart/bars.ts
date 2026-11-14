// Builds the bars of one section from its tokens: bar lines, repeats, and
// numbered endings. See docs/CHART_FORMAT.md sections 4 and 5.
//
// The rules it applies where the spec leaves room:
// - Bar lines with nothing but spaces between them are one bar line.
// - A repeat is one level deep. A stray `:|`, `|:`, or ending number is an
//   error and reads as a plain bar line.
// - An ending that follows a `:|` is the last one unless another `:|` closes
//   it, and it stops at the end of its line. The `:|` and the ending number
//   may be on separate lines (`... :|` then `|2 ...`).
// - A repeat left open closes at the end of the section.

import type { Lexeme } from "./lex.ts";
import { cover, MAX_REPEATS, repeatCount, validRepeatCount } from "./lex.ts";
import type { Bar, BarToken, ChartComment, ChartField, RepeatItem, SectionItem } from "./model.ts";
import type { Diagnostic, SourceRange } from "./types.ts";

export type Say = (severity: Diagnostic["severity"], range: SourceRange, message: string) => void;

export interface BarBuilder {
  /** A chord, `.`, `%`, `NC`, `!word`, or a repeat count. */
  word(text: string, range: SourceRange): void;
  barLine(mark: Lexeme & { kind: "barline" }, range: SourceRange): void;
  /**
   * The end of a line of bars. A comment at the end of the line is passed
   * here; false means the line held no bars, so the comment was not taken.
   */
  endLine(trailing: ChartComment | null): boolean;
  /** A line that is not bars: it goes after the most recent bar. */
  aside(node: ChartComment | ChartField): void;
  endSection(): void;
  /** Bars so far. */
  readonly barCount: number;
  /** How many bars each line of bars held, for the printer's line width. */
  readonly lineWidths: readonly number[];
}

/** The mutable shape of a `Repeat` while it is being read. */
interface RepeatDraft {
  kind: "repeat";
  body: RepeatItem[];
  endings: { items: RepeatItem[]; range: SourceRange }[];
  times: number;
  range: SourceRange;
}

interface OpenRepeat {
  readonly node: RepeatDraft;
  /** `closed`: a `:|` was just read, and only an ending number can continue the repeat. */
  phase: "body" | "ending" | "closed";
  /** A `:|` has been read, so an ending in progress is the last and stops at the end of its line. */
  closedOnce: boolean;
  /** The node is in the section's items. It goes in with its first bar. */
  placed: boolean;
  readonly mark: SourceRange;
}

export function createBarBuilder(
  items: SectionItem[],
  readToken: (text: string, range: SourceRange) => BarToken,
  say: Say,
): BarBuilder {
  let tokens: BarToken[] = [];
  let open: OpenRepeat | null = null;
  /**
   * The list holding the most recent bar: where comments and stray lines go.
   * It is that bar's list even once its repeat is over, so that where a
   * comment lands depends only on the bar before it.
   */
  let asides: { push(item: ChartComment | ChartField): unknown } = items;
  /** The repeat a count (`x4`) would apply to: set by `:|`, cleared by the next chord. */
  let countFor: RepeatDraft | null = null;
  let barsOnLine = 0;
  let barCount = 0;
  const lineWidths: number[] = [];

  const lastEnding = () => open?.node.endings.at(-1);

  function finishBar(): void {
    const first = tokens[0];
    const last = tokens.at(-1);
    if (!first || !last) return;
    const bar: Bar = { kind: "bar", tokens, range: cover(first.range, last.range) };
    tokens = [];
    if (open && !open.placed) {
      items.push(open.node);
      open.placed = true;
    }
    const ending = open?.phase === "ending" ? lastEnding() : undefined;
    const list = ending ? ending.items : open ? open.node.body : items;
    list.push(bar);
    asides = list;
    if (ending) ending.range = cover(ending.range, bar.range);
    if (open) open.node.range = cover(open.node.range, bar.range);
    barsOnLine++;
    barCount++;
  }

  function addToken(token: BarToken): void {
    // A chord after `:|` starts the bars that follow the repeat.
    if (open?.phase === "closed") closeOut();
    countFor = null;
    tokens.push(token);
  }

  /** An ending with no bars is a mistake: report it and carry on without it. */
  function dropEmptyEnding(): void {
    const ending = lastEnding();
    if (open?.phase !== "ending" || !ending || ending.items.length > 0) return;
    say("error", ending.range, `Ending ${open.node.endings.length} has no bars.`);
    open.node.endings.pop();
    open.phase = open.closedOnce ? "closed" : "body";
  }

  /** The repeat is over: settle how many times it plays. */
  function closeOut(): void {
    if (!open) return;
    dropEmptyEnding();
    const endings = open.node.endings.length;
    // An ending that follows a `:|` and is not itself closed is the last pass.
    const endsOnAnEnding = open.phase === "ending" && open.closedOnce;
    if (endings > 0) open.node.times = endsOnAnEnding ? endings : endings + 1;
    open = null;
  }

  function openRepeat(range: SourceRange): void {
    if (open) {
      const over = open.phase === "closed" || (open.phase === "ending" && open.closedOnce);
      if (!over) {
        say(
          "error",
          range,
          "Repeats do not nest. Close the first repeat with `:|` before opening another; this `|:` is read as a plain bar line.",
        );
        return;
      }
      closeOut();
    }
    const node: RepeatDraft = { kind: "repeat", body: [], endings: [], times: 2, range };
    open = { node, phase: "body", closedOnce: false, placed: false, mark: range };
  }

  function closeRepeat(range: SourceRange): void {
    if (!open || open.phase === "closed") {
      say(
        "error",
        range,
        "`:|` closes a repeat, but none is open here. Put `|:` where the repeated bars start; this is read as a plain bar line.",
      );
      return;
    }
    dropEmptyEnding();
    if (!open.placed) {
      say("error", cover(open.mark, range), "This repeat has no bars in it.");
      open = null;
      return;
    }
    open.phase = "closed";
    open.closedOnce = true;
    open.node.range = cover(open.node.range, range);
    countFor = open.node;
  }

  function beginEnding(number: number, range: SourceRange): void {
    if (!open) {
      say(
        "error",
        range,
        `An ending needs a repeat around it. Put \`|:\` where the repeated bars start; this \`|${number}\` is read as a plain bar line.`,
      );
      return;
    }
    if (open.phase === "closed" && open.node.endings.length === 0) {
      say(
        "error",
        range,
        "A later ending needs a first ending. Mark the first with `|1` before the `:|`; this is read as a plain bar line.",
      );
      closeOut();
      return;
    }
    if (open.phase === "ending") {
      // `|2` inside ending 1 can only mean that ending 1 is over.
      dropEmptyEnding();
      if (open.phase === "ending") open.closedOnce = true;
    }
    const expected = open.node.endings.length + 1;
    if (number !== expected)
      say(
        "error",
        range,
        `Endings count up from 1 in order. This one is read as ending ${expected}.`,
      );
    open.node.endings.push({ items: [], range });
    open.node.range = cover(open.node.range, range);
    open.phase = "ending";
  }

  /** Apply `x4` to the repeat it follows. False when it does not apply, and why has been said. */
  function setCount(
    node: RepeatDraft | null,
    times: number,
    text: string,
    range: SourceRange,
  ): boolean {
    if (!node) {
      say(
        "error",
        range,
        `\`${text}\` sets how many times a repeat plays, so it goes right after \`:|\`. Here it is read as an unrecognized chord.`,
      );
      return false;
    }
    if (node.endings.length > 0) {
      say(
        "error",
        range,
        `Numbered endings already say how many times this repeat plays, so \`${text}\` cannot be used with them.`,
      );
      return false;
    }
    if (!validRepeatCount(times)) {
      say(
        "error",
        range,
        `A repeat plays from 1 to ${MAX_REPEATS} times, so \`${text}\` is not a count. It is read as an unrecognized chord.`,
      );
      return false;
    }
    if (times === 1)
      say("warning", range, "`x1` plays these bars once, which is no repeat at all.");
    node.times = times;
    return true;
  }

  return {
    word(text, range) {
      const times = repeatCount(text);
      if (times !== null) {
        const node = tokens.length === 0 ? countFor : null;
        countFor = null;
        if (!setCount(node, times, text, range)) addToken({ kind: "unknown", text, range });
      } else {
        addToken(readToken(text, range));
      }
    },
    barLine(mark, range) {
      finishBar();
      if (mark.closes) closeRepeat(range);
      if (mark.ending !== null) beginEnding(mark.ending, range);
      else if (mark.opens) openRepeat(range);
    },
    endLine(trailing) {
      finishBar();
      countFor = null;
      const hadBars = barsOnLine > 0;
      if (hadBars) lineWidths.push(barsOnLine);
      barsOnLine = 0;
      if (hadBars && trailing) asides.push(trailing);
      // The last ending runs to the end of the line it has bars on.
      const ending = lastEnding();
      if (open?.phase === "ending" && open.closedOnce && ending && ending.items.length > 0)
        closeOut();
      return hadBars;
    },
    aside(node) {
      asides.push(node);
    },
    endSection() {
      finishBar();
      if (!open) return;
      if (open.phase === "body" || (open.phase === "ending" && !open.closedOnce))
        say(
          "error",
          open.mark,
          "This repeat is never closed. Add `:|` where it ends; until then it runs to the end of the section.",
        );
      closeOut();
    },
    get barCount() {
      return barCount;
    },
    lineWidths,
  };
}
