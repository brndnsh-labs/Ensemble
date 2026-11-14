// How a section's bars fall into lines when printed. The parser uses the same
// rules to find the line width the author used, so that printing a chart and
// parsing it again arrive at the same width.

import type { Bar, ChartComment, ChartField, Repeat, SectionItem, UnreadLine } from "./model.ts";

/** One bar on a printed line, with the marks on the bar lines around it. */
export interface Cell {
  readonly kind: "cell";
  readonly bar: Bar;
  /** The bar line that begins the bar, as it looks at the start of a line: `|`, `|:`, `|2`. */
  readonly open: string;
  /** Set when a repeat closes after this bar. `times` is null where no count can be written. */
  readonly close: { readonly times: number | null } | null;
  /** How many bars from here must share a line: the length of a later ending at its first bar, else 1. */
  readonly run: number;
  /** Must stay on the line of the bar before it (inside a second or later ending). */
  readonly joined: boolean;
  /** The line ends after this bar (the end of a last ending that no `:|` closes). */
  readonly breakAfter: boolean;
}

/** A line that is not bars. */
export type TextLine = ChartComment | ChartField | UnreadLine;

type Piece = Cell | TextLine;

export type Row =
  | { readonly kind: "bars"; readonly cells: Cell[]; comment: ChartComment | null }
  | {
      readonly kind: "line";
      readonly item: TextLine;
      comment: ChartComment | null;
    };

function repeatPieces(repeat: Repeat): Piece[] {
  const out: Piece[] = [];
  const endings = repeat.endings.length;
  let opened = false;
  [repeat.body, ...repeat.endings.map((ending) => ending.items)].forEach((list, number) => {
    // `number` is 0 for the body, then the ending's number.
    const bars = list.filter((item) => item.kind === "bar");
    const closes = number === 0 ? endings === 0 : number < endings || repeat.times > endings;
    // An ending that follows a `:|` stops at the end of its line, so it must stay on one line.
    const oneLine = number >= 2;
    // The last ending, when no `:|` closes it: the end of the line is all that ends it.
    const openEnded = number > 0 && !closes;
    for (const item of list) {
      if (item.kind !== "bar") {
        out.push(item);
        continue;
      }
      const first = item === bars[0];
      const last = item === bars.at(-1);
      let open = first && number > 0 ? `|${number}` : "|";
      // A repeat that goes straight into its first ending: `|:|1`, with no space to read as an empty bar.
      if (!opened) open = open === "|" ? "|:" : `|:${open}`;
      opened = true;
      out.push({
        kind: "cell",
        bar: item,
        open,
        close: last && closes ? { times: number === 0 ? repeat.times : null } : null,
        run: oneLine && first ? bars.length : 1,
        joined: oneLine && !first,
        breakAfter: openEnded && last,
      });
    }
  });
  return out;
}

function pieces(items: readonly SectionItem[]): Piece[] {
  return items.flatMap((item): Piece[] => {
    if (item.kind === "repeat") return repeatPieces(item);
    if (item.kind !== "bar") return [item];
    return [
      { kind: "cell", bar: item, open: "|", close: null, run: 1, joined: false, breakAfter: false },
    ];
  });
}

/**
 * Lay a section's items out in rows of at most `width` bars. A comment or a
 * field line takes a row of its own; a trailing comment ends the row it is on.
 * A second or later ending is never split, because it stops at the end of its
 * line; and nothing follows the last one on its line.
 */
export function flow(items: readonly SectionItem[], width: number): Row[] {
  const rows: Row[] = [];
  /** The row still taking bars. */
  let current: (Row & { kind: "bars" }) | null = null;
  for (const piece of pieces(items)) {
    if (piece.kind === "cell") {
      const fits =
        current !== null &&
        (piece.joined ||
          (current.cells.length < width && current.cells.length + piece.run <= width));
      if (!current || !fits) {
        current = { kind: "bars", cells: [], comment: null };
        rows.push(current);
      }
      current.cells.push(piece);
      if (piece.breakAfter) current = null;
      continue;
    }
    current = null;
    const before = rows.at(-1);
    if (piece.kind === "comment" && piece.trailing && before && !before.comment)
      before.comment = piece;
    else rows.push({ kind: "line", item: piece, comment: null });
  }
  return rows;
}

/**
 * The line width to print a section at: four bars, unless the source's lines
 * (`sourceWidths`, bars per line) are exactly what another width would give.
 */
export function chooseWidth(
  items: readonly SectionItem[],
  sourceWidths: readonly number[],
): number {
  const gives = (width: number): boolean => {
    const widths = flow(items, width).flatMap((row) =>
      row.kind === "bars" ? [row.cells.length] : [],
    );
    return widths.length === sourceWidths.length && widths.every((n, i) => n === sourceWidths[i]);
  };
  const candidates = [4, ...[...new Set(sourceWidths)].sort((a, b) => a - b)];
  return candidates.find(gives) ?? 4;
}
