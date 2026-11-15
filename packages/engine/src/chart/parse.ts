// Chart text in, a chart and its diagnostics out. Never throws: every line
// becomes something, and what cannot be read is kept as typed and reported.
// See docs/CHART_FORMAT.md.

import { toneInterval } from "../theory/chord.ts";
import type { Key } from "../theory/pitch.ts";
import { keyToString, mod12, noteNameToString, pitchClass } from "../theory/pitch.ts";
import { fitsSong, readArrangement } from "./arrangement.ts";
import type { BarBuilder } from "./bars.ts";
import { createBarBuilder } from "./bars.ts";
import { chordText } from "./display.ts";
import { expandReporting, runsOf } from "./expand.ts";
import { labelId, meterToString, parseKey, parseMeter, parseTempo, roleOfLabel } from "./fields.ts";
import { chooseWidth } from "./layout.ts";
import type { Line } from "./lex.ts";
import { commentStart, emptyStretches, lexBars, rangeIn, splitLines } from "./lex.ts";
import type {
  ArrangementBlock,
  BarToken,
  Chart,
  ChartComment,
  ChartField,
  Section,
  SectionItem,
  UnreadLine,
} from "./model.ts";
import type { ChordSymbol } from "./symbol.ts";
import {
  keyFromFirstChord,
  parseChordSymbol,
  plainSigns,
  resolveChord,
  unreadableChord,
} from "./symbol.ts";
import type { ChartChord, Diagnostic, Meter, SourceRange } from "./types.ts";

const C_MAJOR: Key = { tonic: { letter: "C", accidental: 0 }, mode: "major" };
const COMMON_TIME: Meter = { beats: 4, unit: 4 };
const HEADER_FIELDS = ["title", "key", "tempo", "meter", "style"];
const NO_CHORD = /^(?:NC|nc|N\.C\.?|n\.c\.?)$/;
/** `name: value`. The colon may not touch a bar line, so `C :| x2` is bars. */
const FIELD_LINE = /^\s*([A-Za-z][A-Za-z0-9_-]*)\s*:(?!\|)(.*)$/;

/** A section while its lines are being read. */
interface Draft {
  readonly label: string;
  readonly implicit: boolean;
  readonly range: SourceRange;
  readonly leading: ChartComment[];
  readonly items: SectionItem[];
  readonly bars: BarBuilder;
  /** From the section's own `key:` and `meter:` lines. */
  key: Key | null;
  meter: Meter | null;
  meterLine: ChartField | null;
  readonly fieldsSeen: Set<string>;
}

export function parse(text: string): { chart: Chart; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const say = (severity: Diagnostic["severity"], range: SourceRange, message: string): void => {
    diagnostics.push({ severity, message, range });
  };

  const header: (ChartField | ChartComment | UnreadLine)[] = [];
  const headerSeen = new Set<string>();
  let title: string | null = null;
  let statedKey: Key | null = null;
  let tempo: number | null = null;
  let meter: Meter | null = null;
  let styleId: string | null = null;
  let arrangement: ArrangementBlock | null = null;

  const drafts: Draft[] = [];
  let section: Draft | null = null;
  /** Comment lines not yet placed: they belong to a label directly below them, if one comes. */
  let pending: ChartComment[] = [];
  /** The first chord written as a name. Its root is the key when the chart states none. */
  let firstNamed: (ChordSymbol & { written: "name" }) | null = null;
  /** The first chord that had to be read in that assumed key. */
  let assumedKeyAt: SourceRange | null = null;

  // ── tokens ────────────────────────────────────────────────────────────────

  function readToken(raw: string, range: SourceRange): BarToken {
    if (raw === ".") return { kind: "hold", range };
    if (raw === "%") return { kind: "simile", range };
    if (NO_CHORD.test(raw)) return { kind: "noChord", range };
    if (raw.startsWith("!") && raw.length > 1) {
      say(
        "info",
        range,
        `\`${raw}\` is reserved for hits and stops, which this version does not play yet. It is ignored.`,
      );
      return { kind: "annotation", word: raw.slice(1), range };
    }
    const symbol = parseChordSymbol(plainSigns(raw));
    if (!symbol) {
      say("error", range, unreadableChord(raw));
      return { kind: "unknown", text: raw, range };
    }
    const sectionKey = section?.key ?? statedKey;
    if (symbol.written === "name") {
      firstNamed ??= symbol;
      if (!sectionKey) assumedKeyAt ??= range;
    } else if (!sectionKey) {
      say(
        "error",
        range,
        `\`${raw}\` is a numeral, and numerals need a key. Add a line like \`key: C\` at the top of the chart.`,
      );
      return { kind: "unknown", text: raw, range };
    }
    const key = sectionKey ?? (firstNamed ? keyFromFirstChord(firstNamed) : C_MAJOR);
    const chord = resolveChord(symbol, key, raw, range);
    const meant = thirdInTheBass(chord);
    if (meant && chord.bass)
      say(
        "warning",
        range,
        `\`${raw}\` puts ${noteNameToString(chord.bass)} in the bass, a half step from this chord's own third. Bass degrees are counted in the major scale, in minor keys too; for the third, write \`${meant}\`.`,
      );
    return { kind: "chord", chord, range };
  }

  // ── lines ─────────────────────────────────────────────────────────────────

  function comment(line: Line, at: number, trailing: boolean): ChartComment {
    const text = line.text
      .slice(at + 2)
      .replace(/^ /, "")
      .trimEnd();
    return {
      kind: "comment",
      text,
      trailing,
      range: rangeIn(line, at, line.text.trimEnd().length),
    };
  }

  /** Comment lines that turned out not to sit above a label stay where they were written. */
  function settlePending(): void {
    for (const node of pending) {
      if (section) section.bars.aside(node);
      else header.push(node);
    }
    pending = [];
  }

  function startSection(label: string, implicit: boolean, range: SourceRange): Draft {
    section?.bars.endSection();
    const items: SectionItem[] = [];
    const draft: Draft = {
      label,
      implicit,
      range,
      leading: pending,
      items,
      bars: createBarBuilder(items, readToken, say),
      key: null,
      meter: null,
      meterLine: null,
      fieldsSeen: new Set(),
    };
    pending = [];
    drafts.push(draft);
    section = draft;
    return draft;
  }

  function readBars(line: Line, from: number): void {
    const lexemes = lexBars(line.text, from);
    const hasWords = lexemes.some((lexeme) => lexeme.kind === "word");
    // Bar lines with nothing between them, before any section, begin nothing.
    const draft = section ?? (hasWords ? startSection("", true, rangeIn(line, from, from)) : null);
    let trailing: ChartComment | null = null;
    for (const lexeme of lexemes) {
      if (lexeme.kind === "comment") trailing = comment(line, lexeme.from, true);
      else if (lexeme.kind === "word")
        draft?.bars.word(lexeme.text, rangeIn(line, lexeme.from, lexeme.to));
      else draft?.bars.barLine(lexeme, rangeIn(line, lexeme.from, lexeme.to));
    }
    for (const { from: start, to } of emptyStretches(lexemes))
      say(
        "warning",
        rangeIn(line, start, to),
        "There is nothing between these bar lines, so no bar is played here. Use `%` to repeat the bar before, or `.` to hold its chord.",
      );
    // A comment after a line with no bars on it is a comment line like any other.
    if (!draft?.bars.endLine(trailing) && trailing) pending.push({ ...trailing, trailing: false });
  }

  /**
   * Where no bars have been written yet (the header, or under a label), a line
   * is bars only if it has a bar line or every word on it could stand in a bar.
   * Anything else there is a slip in a header line, and must not start the bars.
   */
  function looksLikeBars(line: Line): boolean {
    const lexemes = lexBars(line.text, 0);
    if (lexemes.some((lexeme) => lexeme.kind === "barline")) return true;
    return lexemes.every((lexeme) => lexeme.kind !== "word" || isBarToken(lexeme.text));
  }

  /** Whether bars have been written where we are: in this section, or at all while in the header. */
  const hasBarsHere = (): boolean => section !== null && section.bars.barCount > 0;

  function readUnread(line: Line, content: string, cut: number): void {
    settlePending();
    const text = content.trim();
    const from = content.indexOf(text);
    const range = rangeIn(line, from, from + text.length);
    const [first = "", ...rest] = text.split(/\s+/);
    const name = first.toLowerCase();
    const hint =
      HEADER_FIELDS.includes(name) && rest.length > 0
        ? `Did you mean \`${name}: ${rest.join(" ")}\`?`
        : "A header line is written like `title: My Song`, and bars are chords between bar lines, like `| C | G |`.";
    say("error", range, `This line is neither a \`name: value\` line nor chords. ${hint}`);
    const list: { push(item: UnreadLine | ChartComment): unknown } = section?.items ?? header;
    list.push({ kind: "unread", text, range });
    if (cut >= 0) list.push(comment(line, cut, true));
  }

  function readLabel(line: Line, content: string, cut: number): void {
    const from = content.length - content.trimStart().length;
    const close = content.indexOf("]", from);
    const to = close < 0 ? content.trimEnd().length : close + 1;
    const label = content
      .slice(from + 1, close < 0 ? to : close)
      .trim()
      .replace(/\s+/g, " ");
    const range = rangeIn(line, from, to);
    const draft = startSection(label, false, range);
    if (close < 0) say("error", range, "This section label is missing its closing `]`.");
    if (label === "")
      say("error", range, "This section label is empty. Give it a name, like `[A]` or `[Verse]`.");
    if (close >= 0 && content.slice(to).trim() !== "") {
      say(
        "warning",
        rangeIn(line, to, content.trimEnd().length),
        "A section label goes on a line of its own. The rest of this line is read as bars.",
      );
      readBars(line, to);
    } else if (cut >= 0) {
      draft.items.push(comment(line, cut, true));
    }
  }

  /** A header field: note what it sets, and keep the line. */
  function headerField(typed: string, value: string, range: SourceRange): ChartField {
    const name = typed.toLowerCase();
    if (!HEADER_FIELDS.includes(name)) {
      say("info", range, `\`${typed}\` is not a field this version knows. It is kept and ignored.`);
      return { kind: "field", name: typed, value, range };
    }
    if (headerSeen.has(name)) {
      say("warning", range, `\`${name}\` is already set above. This line is ignored.`);
      return { kind: "field", name, value, range };
    }
    headerSeen.add(name);
    let canonical = value;
    if (name === "title") title = value === "" ? null : value;
    if (name === "style") styleId = value === "" ? null : value;
    if (name === "key") {
      statedKey = readKey(value, range);
      if (statedKey) canonical = keyToString(statedKey);
    }
    if (name === "meter") {
      meter = readMeter(value, range);
      if (meter) canonical = meterToString(meter);
    }
    if (name === "tempo") {
      tempo = parseTempo(value);
      if (tempo !== null) canonical = String(tempo);
      else
        say(
          "error",
          range,
          `\`tempo: ${value}\` is not a tempo. Write beats per minute as a whole number, like \`tempo: 120\`. Until then the style sets the tempo.`,
        );
    }
    return { kind: "field", name, value: canonical, range };
  }

  function readKey(value: string, range: SourceRange): Key | null {
    const key = parseKey(value);
    if (!key)
      say(
        "error",
        range,
        `\`key: ${value}\` is not a key. Write a note name, with \`m\` for minor: \`C\`, \`Bb\`, \`F#m\`.`,
      );
    return key;
  }

  function readMeter(value: string, range: SourceRange): Meter | null {
    const read = parseMeter(value);
    if (!read)
      say(
        "error",
        range,
        `\`meter: ${value}\` is not a meter. Write beats over 2, 4, or 8, like \`3/4\` or \`12/8\`. Until then this is read in 4/4.`,
      );
    return read;
  }

  /** A field under a section label, before its bars: `key` and `meter` apply to the section. */
  function sectionField(
    draft: Draft,
    typed: string,
    value: string,
    range: SourceRange,
  ): ChartField {
    const name = typed.toLowerCase();
    if (name !== "key" && name !== "meter") {
      say(
        "error",
        range,
        `Only \`key\` and \`meter\` can be set for one section. \`${typed}\` belongs at the top of the chart, and is ignored here.`,
      );
      return { kind: "field", name: typed, value, range };
    }
    if (draft.fieldsSeen.has(name)) {
      say("warning", range, `\`${name}\` is already set for this section. This line is ignored.`);
      return { kind: "field", name, value, range };
    }
    draft.fieldsSeen.add(name);
    let canonical = value;
    if (name === "key") {
      draft.key = readKey(value, range);
      if (draft.key) canonical = keyToString(draft.key);
    } else {
      draft.meter = readMeter(value, range);
      if (draft.meter) canonical = meterToString(draft.meter);
    }
    const node: ChartField = { kind: "field", name, value: canonical, range };
    if (name === "meter") draft.meterLine = node;
    return node;
  }

  function readField(line: Line, content: string, cut: number, typed: string, rest: string): void {
    settlePending();
    const from = content.indexOf(typed);
    const range = rangeIn(line, from, content.trimEnd().length);
    const value = rest.trim();
    let node: ChartField;
    if (!section) {
      node = headerField(typed, value, range);
      header.push(node);
      if (cut >= 0) header.push(comment(line, cut, true));
      return;
    }
    if (section.bars.barCount === 0) {
      node = sectionField(section, typed, value, range);
    } else {
      say(
        "error",
        range,
        `\`${typed}:\` lines go at the top of the chart, or (\`key\`, \`meter\`) directly under a section label. Here among the bars it is ignored; to change key or meter, start a new section.`,
      );
      node = { kind: "field", name: typed, value, range };
    }
    section.bars.aside(node);
    if (cut >= 0) section.bars.aside(comment(line, cut, true));
  }

  const lines = splitLines(text);
  for (const line of lines) {
    const trimmed = line.text.trim();
    if (trimmed === "") {
      settlePending();
      continue;
    }
    if (trimmed.startsWith("---")) {
      settlePending();
      const from = line.text.indexOf("---");
      const rest = text
        .slice(line.offset + from)
        .split(/\r\n|\r|\n/)
        .join("\n")
        .trimEnd();
      const range = rangeIn(line, from, line.text.trimEnd().length);
      const whole = { ...range, end: text.length };
      const cut = commentStart(line.text);
      const opening = (cut < 0 ? line.text : line.text.slice(0, cut)).trim();
      if (/^---\s*arrangement$/i.test(opening)) {
        const read = readArrangement(lines.slice(line.number), say);
        arrangement = {
          lines: read.lines,
          closing: read.closing,
          typed: read.clean ? null : rest,
          fits: false,
          range: whole,
        };
      } else {
        arrangement = { lines: null, closing: [], typed: rest, fits: false, range: whole };
        say(
          "info",
          range,
          "Everything from `---` on is kept and not read. An arrangement block starts `--- arrangement`.",
        );
      }
      break;
    }
    const cut = commentStart(line.text);
    const content = cut < 0 ? line.text : line.text.slice(0, cut);
    const field = FIELD_LINE.exec(content);
    if (content.trim() === "") pending.push(comment(line, cut, false));
    else if (content.trimStart().startsWith("[")) readLabel(line, content, cut);
    else if (field) readField(line, content, cut, field[1]!, field[2]!);
    else if (!hasBarsHere() && !looksLikeBars(line)) readUnread(line, content, cut);
    else {
      // Comments directly above bars that have no label lead that unlabeled section.
      if (section) settlePending();
      readBars(line, 0);
    }
  }
  settlePending();
  (section as Draft | null)?.bars.endSection();

  // ── what the chart resolves to ────────────────────────────────────────────

  const named = firstNamed as (ChordSymbol & { written: "name" }) | null;
  const fallbackKey = named ? keyFromFirstChord(named) : C_MAJOR;
  const chartKey: Key = statedKey ?? fallbackKey;
  const chartMeter: Meter = meter ?? COMMON_TIME;

  const defined = new Map<string, number>();
  const sections: Section[] = [];
  const hasLabels = drafts.some((draft) => !draft.implicit);
  let bodyBegun = false;
  drafts.forEach((draft, index) => {
    // Bars above the first label are a section with no label, which no typed
    // label can collide with. A chart with no labels at all is one section, `A`.
    const label = draft.implicit ? (hasLabels ? "" : "A") : draft.label;
    const id = labelId(label);
    const first = draft.implicit ? undefined : defined.get(id);
    const hasBars = draft.bars.barCount > 0;
    const name = `\`${label}\``;
    let barsFrom: number | null = first ?? null;
    if (first === undefined && hasBars) {
      if (!draft.implicit) defined.set(id, index);
      barsFrom = index;
    } else if (first === undefined) {
      say(
        "error",
        draft.range,
        `Section ${name} has no bars, and no section above is labeled ${name} for it to repeat. It is skipped.`,
      );
    } else if (hasBars) {
      say(
        "error",
        draft.range,
        `Section ${name} already has bars above (line ${drafts[first]?.range.line}). That first one is played here, and the bars under this label are ignored. Give this section its own label, like \`${label} 2\`.`,
      );
    }
    // An intro is what comes before the body. Once the body has begun, a
    // section called Intro (or a return to one) is part of the form that loops.
    let role = roleOfLabel(label);
    if (role === "intro" && bodyBegun) role = "body";
    if (role === "body" && barsFrom !== null) bodyBegun = true;
    // A section that repeats another keeps its meter, and its key unless it sets one.
    const source = barsFrom === null || barsFrom === index ? undefined : sections[barsFrom];
    if (source && draft.meterLine)
      say(
        "error",
        draft.meterLine.range,
        "A repeated section keeps the meter it was written in. This line is ignored.",
      );
    sections.push({
      label,
      implicit: draft.implicit,
      role,
      key: draft.key ?? source?.key ?? chartKey,
      meter: source ? source.meter : (draft.meter ?? chartMeter),
      barsFrom,
      leading: draft.leading,
      items: draft.items,
      barsPerLine: chooseWidth(draft.items, draft.bars.lineWidths),
      range: draft.range,
    });
  });

  const draft: Chart = {
    title: title ?? "Untitled",
    key: chartKey,
    tempo,
    meter: chartMeter,
    styleId,
    header,
    sections,
    arrangement,
    range: { start: 0, end: text.length, line: 1, column: 1 },
  };

  // Mistakes inside bars (slot counts, `%`, `.`) are found by playing the chart
  // through. A bar played many times is reported once.
  const reported = new Set<string>();
  const { song } = expandReporting(draft, (range, message) => {
    const id = `${range.start}:${message}`;
    if (!reported.has(id)) say("error", range, message);
    reported.add(id);
  });

  // An arrangement is for the song as it is played, which is only now known.
  const fits =
    arrangement !== null &&
    fitsSong(
      arrangement,
      runsOf(song).map((run) => run[0]!.sectionLabel),
      say,
    );
  const chart: Chart =
    arrangement && fits ? { ...draft, arrangement: { ...arrangement, fits } } : draft;

  // A missing key matters once a chord has had to assume one.
  const assumedAt = assumedKeyAt as SourceRange | null;
  if (assumedAt && !headerSeen.has("key"))
    say(
      "warning",
      assumedAt,
      `This chart has no \`key:\` line, so it is read in ${describeKey(fallbackKey)}, after its first chord. Add \`key: ${keyToString(fallbackKey)}\` at the top to say so.`,
    );

  diagnostics.sort((a, b) => a.range.start - b.range.start);
  return { chart, diagnostics };
}

const describeKey = (key: Key): string => `${keyToString({ ...key, mode: "major" })} ${key.mode}`;

/** Whether a word could stand in a bar: a chord in either form, `.`, `%`, `NC`, or `!word`. */
function isBarToken(word: string): boolean {
  if (word === "." || word === "%" || NO_CHORD.test(word)) return true;
  return (word.startsWith("!") && word.length > 1) || parseChordSymbol(plainSigns(word)) !== null;
}

/**
 * `i/3` in a minor key asks for the major third under a minor chord, because
 * bass degrees are counted in the major scale. When a numeral's bass sits a
 * half step from the chord's own third, this is the chord with its third in
 * the bass instead (`i/b3`); otherwise null.
 */
function thirdInTheBass(chord: ChartChord): string | null {
  const third = toneInterval(chord.quality, "third");
  if (chord.written !== "numeral" || !chord.bass || !chord.bassDegree || third === null)
    return null;
  const off = mod12(pitchClass(chord.bass) - pitchClass(chord.root) - third);
  if (off !== 1 && off !== 11) return null;
  const accidental = chord.bassDegree.accidental + (off === 1 ? -1 : 1);
  return chordText({ ...chord, bassDegree: { ...chord.bassDegree, accidental } }, "numeral");
}
