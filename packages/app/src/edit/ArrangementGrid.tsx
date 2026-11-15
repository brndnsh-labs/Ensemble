// The arrangement as a grid: the song's sections across, in the order it plays
// them, and down the side the section's energy and each player. A cell says
// at a glance how hard that player plays there: a block filled to its level,
// quieter where it just follows the section, empty where it lays out. The
// chart's text is still the one place the arrangement lives; every change here
// is written into it, and nothing is written until something is changed.

import type {
  ArrangedSeat,
  ArrangementLevel,
  ArrangementLine,
  Chart,
  Diagnostic,
  SeatCall,
  StylePack,
} from "@ensemble/engine";
import {
  ARRANGED_SEATS,
  arrangedLines,
  LEVEL_ENERGY,
  plan,
  withArrangement,
  withoutArrangement,
} from "@ensemble/engine";
import type { KeyboardEvent } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

interface Props {
  readonly text: string;
  readonly chart: Chart;
  readonly diagnostics: readonly Diagnostic[];
  readonly change: (text: string) => void;
  /** The style the chart is played in, which sets a section's level when the arrangement leaves it be. */
  readonly style: StylePack;
  /** Go to the text, where a mistake in the block is marked. */
  readonly showText: () => void;
}

type Row = "energy" | ArrangedSeat;

const ROWS: readonly Row[] = ["energy", ...ARRANGED_SEATS];
const ROW_NAMES: Readonly<Record<Row, string>> = {
  energy: "Energy",
  drums: "Drums",
  bass: "Bass",
  chords: "Chords",
  solo: "Soloist",
};

interface Choice {
  readonly value: SeatCall;
  readonly label: string;
  /** The key that sets it, the same letter the text uses. */
  readonly key: string;
}

const levels = ([1, 2, 3, 4] as const).map((level) => ({
  value: level,
  label: String(level),
  key: String(level),
}));
const PLAYER_CHOICES: readonly Choice[] = [
  { value: null, label: "Follow", key: "-" },
  ...levels,
  { value: "out", label: "Out", key: "." },
];
const ENERGY_CHOICES: readonly Choice[] = [{ value: null, label: "Style", key: "-" }, ...levels];
const choicesFor = (row: Row) => (row === "energy" ? ENERGY_CHOICES : PLAYER_CHOICES);

const callOf = (line: ArrangementLine, row: Row): SeatCall =>
  row === "energy" ? line.energy : line.seats[row];

const withValue = (line: ArrangementLine, row: Row, value: SeatCall): ArrangementLine =>
  row === "energy"
    ? { ...line, energy: value as ArrangementLevel | null }
    : { ...line, seats: { ...line.seats, [row]: value } };

/** A cell in words, for a screen reader. */
function said(row: Row, value: SeatCall): string {
  if (value === "out") return "lays out";
  if (value === null) return row === "energy" ? "the style's level" : "follows the section";
  return `level ${value}`;
}

/** The arrangement's level nearest an energy the style gives a section, so the two can be drawn alike. */
function nearestLevel(energy: number): ArrangementLevel {
  const all = [1, 2, 3, 4] as const;
  return all.reduce((best, level) =>
    Math.abs(LEVEL_ENERGY[level] - energy) < Math.abs(LEVEL_ENERGY[best] - energy) ? level : best,
  );
}

/** The level the style gives each section of the song, as the song plays them, when the arrangement says nothing. */
function styleLevels(chart: Chart, style: StylePack): ArrangementLevel[] {
  try {
    const bars = plan({ ...chart, arrangement: null }, style, { mode: "song" }).bars;
    return bars
      .filter((bar) => bar.kind === "music" && bar.barInSection === 0)
      .map((bar) => nearestLevel(bar.level));
  } catch {
    // A chart the planner will not take is still a chart being typed: draw the ordinary level.
    return [];
  }
}

export function ArrangementGrid({ text, chart, diagnostics, change, style, showText }: Props) {
  const block = chart.arrangement;
  const lines = useMemo(() => arrangedLines(chart), [chart]);
  const usual = useMemo(() => styleLevels(chart, style), [chart, style]);
  const [selected, setSelected] = useState({ row: 0, column: 0 });
  const table = useRef<HTMLTableElement>(null);
  /** Set by the keyboard: the selected cell takes the focus once it is drawn. */
  const focusing = useRef(false);

  const column = Math.min(selected.column, Math.max(0, lines.length - 1));
  const row = ROWS[selected.row]!;
  const line = lines[column];

  // A block whose text could not all be read, or is not an arrangement at all: what was typed
  // is not rewritten behind the player's back, so the grid waits until they say.
  const unread = block !== null && block.lines === null;
  const mistaken = block?.lines != null && block.typed !== null;
  const outgrown = block?.lines != null && block.typed === null && !block.fits;
  const locked = unread || mistaken;
  const mistake =
    mistaken &&
    diagnostics.find((d) => d.severity === "error" && d.range.start >= block.range.start);

  useLayoutEffect(() => {
    if (!focusing.current) return;
    focusing.current = false;
    const cell = table.current?.querySelector<HTMLElement>(".chosen button");
    cell?.focus({ preventScroll: true });
    // Clear of the row names that stay put over the left edge.
    cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  const set = (value: SeatCall) => {
    if (locked || !line) return;
    if (row === "energy" && value === "out") return;
    if (callOf(line, row) === value) return;
    change(
      withArrangement(
        text,
        lines.map((each, at) => (at === column ? withValue(each, row, value) : each)),
      ),
    );
  };

  const keyed = (event: KeyboardEvent) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      Home: [0, -lines.length],
      End: [0, lines.length],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      focusing.current = true;
      setSelected({
        row: Math.max(0, Math.min(ROWS.length - 1, selected.row + move[0])),
        column: Math.max(0, Math.min(lines.length - 1, column + move[1])),
      });
      return;
    }
    const choice = choicesFor(row).find((c) => c.key === event.key);
    if (choice && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      set(choice.value);
    }
  };

  const remove = () => {
    if (!confirm("Remove the arrangement? The song goes back to the style's own playing.")) return;
    change(withoutArrangement(text));
  };

  if (lines.length === 0)
    return <p className="grid-empty">The song's sections appear here once the chart has bars.</p>;

  return (
    <div className="arrangement">
      {block === null && (
        <p className="grid-note">
          No arrangement yet. This is how the band plays the song left to itself, and the first
          change writes it into the chart.
        </p>
      )}
      {outgrown && (
        <p className="grid-note warn" role="status">
          The song has changed since this arrangement was written. It is shown lined up with the
          song again, and the first change writes it that way.
        </p>
      )}
      {mistaken && (
        <div className="grid-note warn" role="status">
          <p>
            Line {mistake ? mistake.range.line : block.range.line} of the arrangement has a mistake
            in it, marked in the chords' text. Until it is put right the grid only shows it, with
            anything that could not be read as following the section.
          </p>
          <div className="grid-fix">
            <button type="button" className="fix" onClick={showText}>
              Show the mistake
            </button>
            <button
              type="button"
              className="fix"
              onClick={() => change(withArrangement(text, lines))}
            >
              Write it out clean
            </button>
          </div>
        </div>
      )}
      {unread && (
        <div className="grid-note warn" role="status">
          <p>
            The text from line {block.range.line} on is not an arrangement: it starts with{" "}
            <code>---</code> but not <code>--- arrangement</code>. It is kept as typed. To arrange
            the song, change that line or take the text out.
          </p>
          <div className="grid-fix">
            <button type="button" className="fix" onClick={showText}>
              Show the text
            </button>
          </div>
        </div>
      )}

      <div className="grid-scroll">
        <table
          ref={table}
          className={`grid${locked ? " locked" : ""}`}
          aria-label="The arrangement"
          onKeyDown={keyed}
        >
          <thead>
            <tr>
              <td />
              {lines.map((each, at) => (
                <th
                  // biome-ignore lint/suspicious/noArrayIndexKey: a column is a place in the song, and a label can come twice
                  key={at}
                  scope="col"
                  className={at === column ? "here" : undefined}
                >
                  {each.label || "—"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((name, r) => (
              <tr key={name}>
                <th scope="row">{ROW_NAMES[name]}</th>
                {lines.map((each, at) => {
                  const value = callOf(each, name);
                  const chosen = r === selected.row && at === column;
                  // A player that follows is drawn at the section's level, the style's when it has none.
                  const section = each.energy ?? usual[at] ?? 2;
                  const height = value === "out" ? 0 : (value ?? section);
                  return (
                    <td
                      // biome-ignore lint/suspicious/noArrayIndexKey: a column is a place in the song
                      key={at}
                      className={chosen ? "chosen" : undefined}
                    >
                      <button
                        type="button"
                        tabIndex={chosen ? 0 : -1}
                        className={`cell${value === null ? " follows" : ""}${value === "out" ? " out" : ""}`}
                        aria-label={`${ROW_NAMES[name]} in ${each.label || "the section"}, section ${at + 1}: ${said(name, value)}`}
                        onClick={() => setSelected({ row: r, column: at })}
                      >
                        <span className="level" style={{ height: `${height * 25}%` }} />
                        {name === "energy" && value === null && (
                          <span className="cell-word">style</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {line && (
        <div className="grid-set">
          <p className="grid-which">
            {ROW_NAMES[row]} in <strong>{line.label || "the section"}</strong>, {column + 1} of{" "}
            {lines.length}
          </p>
          <fieldset className="choices" aria-label={`${ROW_NAMES[row]} in ${line.label}`}>
            {choicesFor(row).map((choice) => (
              <button
                key={choice.key}
                type="button"
                className="choice"
                disabled={locked}
                aria-pressed={callOf(line, row) === choice.value}
                aria-keyshortcuts={
                  choice.key === "-" ? "Minus" : choice.key === "." ? "Period" : choice.key
                }
                onClick={() => set(choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </fieldset>
        </div>
      )}

      {block?.lines != null && (
        <button type="button" className="grid-remove" onClick={remove}>
          Remove arrangement
        </button>
      )}
    </div>
  );
}
