// The arrangement block: who plays in each section of the song, and how hard.
// See docs/CHART_FORMAT.md section 11. One line for each section the song
// plays, in the order it plays them: the label, then the section's energy and
// a value for each player.

import type { Line } from "./lex.ts";
import { commentStart, rangeIn } from "./lex.ts";
import type {
  ArrangedSeat,
  ArrangementBlock,
  ArrangementLevel,
  ArrangementLine,
  SeatCall,
} from "./model.ts";
import type { Diagnostic, SourceRange } from "./types.ts";

/** The players' columns, in the order they are written. */
export const ARRANGED_SEATS: readonly ArrangedSeat[] = ["drums", "bass", "chords", "solo"];

const HEADING = ["energy", ...ARRANGED_SEATS];

type Say = (severity: Diagnostic["severity"], range: SourceRange, message: string) => void;

const isValue = (word: string): boolean => /^[-.1-4]$/.test(word);

/** The same label, whatever its capitals and spacing. */
const sameLabel = (a: string, b: string): boolean =>
  a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

/** Read the lines under `--- arrangement`. `clean` is false when any of them had to be guessed at. */
export function readArrangement(
  lines: readonly Line[],
  say: Say,
): Pick<ArrangementBlock, "lines" | "closing"> & { readonly clean: boolean } {
  const read: ArrangementLine[] = [];
  let pending: string[] = [];
  let clean = true;
  const wrong = (range: SourceRange, message: string) => {
    clean = false;
    say("error", range, message);
  };

  for (const line of lines) {
    const cut = commentStart(line.text);
    const content = cut < 0 ? line.text : line.text.slice(0, cut);
    const comment =
      cut < 0
        ? null
        : line.text
            .slice(cut + 2)
            .replace(/^ /, "")
            .trimEnd();
    const words = [...content.matchAll(/\S+/g)].map((match) => ({
      text: match[0],
      from: match.index,
      to: match.index + match[0].length,
    }));
    if (words.length === 0) {
      // The heading is written again by the printer, so it is not kept as a comment.
      const heading = comment?.trim().split(/\s+/).join(" ") === HEADING.join(" ");
      if (comment !== null && !heading) pending.push(comment);
      continue;
    }

    const whole = rangeIn(line, words[0]!.from, words.at(-1)!.to);
    let values = words.slice(-5);
    let labelWords = words.slice(0, -5);
    // Five words that are all values are a line for a section with no label.
    const enough = words.length > 5 || (words.length === 5 && words.every((w) => isValue(w.text)));
    if (!enough) {
      wrong(
        whole,
        "An arrangement line is a section's label and five values: energy, drums, bass, chords, solo. Each value is `1` to `4`, `-`, or `.`.",
      );
      // What is left of the line once the values it does have are set aside is its label.
      const first = words.findLastIndex((word) => !isValue(word.text)) + 1;
      labelWords = words.slice(0, first);
      values = [];
    }
    const call = (at: number): SeatCall => {
      const word = values[at];
      if (!word || word.text === "-") return null;
      if (word.text === ".") return "out";
      if (/^[1-4]$/.test(word.text)) return Number(word.text) as ArrangementLevel;
      wrong(
        rangeIn(line, word.from, word.to),
        `\`${word.text}\` is not a level. Write \`1\` to \`4\`, \`-\` to follow the section's energy, or \`.\` to lay out.`,
      );
      return null;
    };
    let energy = call(0);
    if (energy === "out") {
      wrong(
        rangeIn(line, values[0]!.from, values[0]!.to),
        "A section cannot lay out. Its energy is `1` to `4`, or `-` for the level the style gives it.",
      );
      energy = null;
    }
    read.push({
      label: labelWords.map((word) => word.text).join(" "),
      energy,
      seats: { drums: call(1), bass: call(2), chords: call(3), solo: call(4) },
      leading: pending,
      comment,
      range: whole,
    });
    pending = [];
  }
  return { lines: read, closing: pending, clean };
}

/**
 * Whether the lines are the song's sections, in the order it plays them. If
 * not, the first line that does not fit is marked, and the block is not used.
 */
export function fitsSong(block: ArrangementBlock, played: readonly string[], say: Say): boolean {
  const lines = block.lines;
  if (lines === null) return false;
  const unused =
    "The arrangement is not used until it has one line for each section, in the order the song plays them.";
  for (const [at, line] of lines.entries()) {
    const label = played[at];
    if (label === undefined) {
      say(
        "warning",
        line.range,
        `The song plays ${count(played.length)}, and this is line ${at + 1} of the arrangement. ${unused}`,
      );
      return false;
    }
    if (!sameLabel(line.label, label)) {
      say(
        "warning",
        line.range,
        `The song plays ${label === "" ? "a section with no label" : `\`${label}\``} here, and this line is for \`${line.label}\`. ${unused}`,
      );
      return false;
    }
  }
  if (lines.length < played.length) {
    say(
      "warning",
      block.range,
      `The song plays ${count(played.length)}, and the arrangement has ${lines.length === 1 ? "1 line" : `${lines.length} lines`}. ${unused}`,
    );
    return false;
  }
  return true;
}

const count = (sections: number): string => (sections === 1 ? "1 section" : `${sections} sections`);

const valueText = (call: SeatCall): string =>
  call === null ? "-" : call === "out" ? "." : String(call);

/** The block in its canonical form: the heading as a comment, and the columns aligned. */
export function printArrangement(block: ArrangementBlock): string[] {
  if (block.typed !== null || block.lines === null) return (block.typed ?? "").split("\n");
  const width = Math.max(2, ...block.lines.map((line) => line.label.length)) + 2;
  const row = (label: string, values: readonly string[]): string =>
    [label.padEnd(width), ...values.map((value, at) => value.padEnd(HEADING[at]!.length + 2))]
      .join("")
      .trimEnd();
  const out = ["--- arrangement", row("//", HEADING)];
  const comment = (text: string) => (text === "" ? "//" : `// ${text}`);
  for (const line of block.lines) {
    out.push(...line.leading.map(comment));
    const text = row(line.label, [
      valueText(line.energy),
      ...ARRANGED_SEATS.map((seat) => valueText(line.seats[seat])),
    ]);
    out.push(line.comment === null ? text : `${text}  ${comment(line.comment)}`);
  }
  out.push(...block.closing.map(comment));
  return out;
}
