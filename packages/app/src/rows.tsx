// A line of a list: a chart or a kept take, its name opening it and the round
// button playing it in one tap. The button is printed in the ink of the
// chart's style, which is the mark every chart carries wherever it is listed.

import { keyToString, seconds } from "@ensemble/engine";
import { STYLES, styleById } from "@ensemble/styles";
import type { ReactNode } from "react";
import { useState } from "react";
import { deleteChart, duplicateChart, renameChart } from "./charts.ts";
import { download, fileName } from "./download.ts";
import type { LibraryChart } from "./library.ts";
import { clock } from "./play/StatusStrip.tsx";
import { count, writtenFor } from "./posters.ts";
import type { ChartChoices } from "./settings.ts";
import type { KeptTake } from "./takes.ts";
import { dayOf, heardAs } from "./takes.ts";

export interface Row {
  readonly address: string;
  readonly title: string;
  readonly facts: string;
  /** The style whose ink the line is marked with. None: the ink of a chart that names no style. */
  readonly style: string | undefined;
  /** The style, key and tempo alone, for a small bill with no room for more. */
  readonly short?: string;
  /** A kept take's length, printed on a block of its ink at the start of the line. */
  readonly length?: string;
}

/** A style this version does not have is no style: `data-style` then asks for the ink kept for those. */
export const inkOf = (style: string | undefined): string => style ?? "none";

export const PLAY = (
  <svg className="tri" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M6.5 3.5v13l10.5-6.5z" />
  </svg>
);

/** A chart as it is written. `withStyle` where the list does not already say the style. */
export function chartRow(entry: LibraryChart, withStyle: boolean): Row {
  const style = writtenFor(entry);
  const tempo = entry.chart.tempo ?? style?.tempo.default;
  const key = keyToString(entry.chart.key);
  return {
    address: `#/chart/${entry.id}`,
    title: entry.chart.title,
    facts: `${withStyle && style ? `${style.name} in ${key}` : key}, ${count(entry.bars, "bar", "bars")}${tempo ? `, ${Math.round(tempo)} bpm` : ""}`,
    style: style?.id,
  };
}

/**
 * A chart as it was last played here: in the style, key and tempo chosen for
 * it on its own screen, which is what a press of its play button starts.
 */
export function playedRow(entry: LibraryChart, choices: ChartChoices | undefined): Row {
  const style = styleById(choices?.style ?? entry.chart.styleId ?? "") ?? STYLES[0]!;
  const tempo = choices?.tempo ?? entry.chart.tempo ?? style.tempo.default;
  const key = choices?.key ?? keyToString(entry.chart.key);
  return {
    address: `#/chart/${entry.id}`,
    title: entry.chart.title,
    facts: `${style.name} in ${key}, ${count(entry.bars, "bar", "bars")}, ${Math.round(tempo)} bpm`,
    short: `${style.name} in ${key}, ${Math.round(tempo)} bpm`,
    style: style.id,
  };
}

export function takeRow(take: KeptTake): Row {
  const heard = heardAs(take.recipe);
  const kept = `Kept ${dayOf(take.kept)}`;
  const base = { address: `#/take/${take.id}`, title: take.name.trim() || take.recipe.chartName };
  if (!heard)
    return {
      ...base,
      facts: `Does not play in this version. ${kept}`,
      style: undefined,
      length: "",
    };
  const short = `${heard.style.name} in ${keyToString(heard.chart.key)}, ${Math.round(heard.plan.tempo)} bpm`;
  return {
    ...base,
    facts: `${short}. ${kept}`,
    short,
    style: heard.style.id,
    length: clock(seconds(heard.plan)),
  };
}

interface LineProps {
  readonly row: Row;
  readonly play: (address: string) => void;
  /** One of the player's own, in a list that holds other charts too: it says so. */
  readonly yours?: boolean;
  /** Between the name and the play button. */
  readonly children?: ReactNode;
}

export function Line({ row, play, yours = false, children }: LineProps) {
  return (
    <div className="row" data-style={inkOf(row.style)}>
      {row.length !== undefined && <span className="badge">{row.length}</span>}
      <a className="row-open" href={row.address}>
        <span className="row-title">{row.title}</span>
        <span className="row-facts">
          {yours && <span className="mine">Yours</span>}
          {row.facts}
        </span>
      </a>
      {children}
      <button
        type="button"
        className="row-play"
        aria-label={`Play ${row.title}`}
        onClick={() => play(row.address)}
      >
        {PLAY}
      </button>
    </div>
  );
}

/** One of the player's own charts: a line like any other, and behind More what can be done to it. */
function OwnChart({
  entry,
  row,
  yours,
  open,
  toggle,
  play,
}: {
  entry: LibraryChart;
  row: Row;
  yours: boolean;
  open: boolean;
  toggle: () => void;
  play: (address: string) => void;
}) {
  const { title } = entry.chart;
  /** The new title being typed, while the chart is being renamed. */
  const [renaming, setRenaming] = useState<string>();

  const remove = () => {
    if (confirm(`Delete “${title}”? This cannot be undone. Takes kept from it stay.`))
      deleteChart(entry.id);
  };

  return (
    <li>
      <Line row={row} play={play} yours={yours}>
        <button
          type="button"
          className="row-more"
          aria-expanded={open}
          aria-label={`More for ${title}`}
          onClick={() => {
            setRenaming(undefined);
            toggle();
          }}
        >
          More
        </button>
      </Line>
      {open &&
        (renaming === undefined ? (
          <div className="row-tools">
            <a className="act" href={`#/edit/${entry.id}`}>
              Edit
            </a>
            <button type="button" className="act" onClick={() => setRenaming(title)}>
              Rename
            </button>
            <button type="button" className="act" onClick={() => duplicateChart(entry.id)}>
              Duplicate
            </button>
            <button
              type="button"
              className="act"
              onClick={() =>
                download(entry.text, "text/plain;charset=utf-8", fileName(title, "chart", ".chart"))
              }
            >
              Export
            </button>
            <button type="button" className="act danger" onClick={remove}>
              Delete
            </button>
          </div>
        ) : (
          <form
            className="row-tools"
            onSubmit={(e) => {
              e.preventDefault();
              renameChart(entry.id, renaming);
              setRenaming(undefined);
            }}
          >
            <label className="field">
              <span>Title</span>
              <input
                type="text"
                value={renaming}
                enterKeyHint="done"
                // biome-ignore lint/a11y/noAutofocus: the box appears because Rename was pressed, to be typed in
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setRenaming(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setRenaming(undefined)}
              />
            </label>
            <button type="submit" className="act first" disabled={renaming.trim() === ""}>
              Save
            </button>
            <button type="button" className="act" onClick={() => setRenaming(undefined)}>
              Cancel
            </button>
          </form>
        ))}
    </li>
  );
}

interface ChartsProps {
  readonly entries: readonly LibraryChart[];
  readonly play: (address: string) => void;
  /** Say each chart's style in its line: where the list is not one style's. */
  readonly withStyle: boolean;
  /** Say which charts are the player's own: where the list holds built-in ones too. */
  readonly sayYours: boolean;
}

/** A list of charts. One of the player's own has its actions behind More, wherever it is listed. */
export function Charts({ entries, play, withStyle, sayYours }: ChartsProps) {
  /** The chart of the player's whose More is open: one at a time. */
  const [open, setOpen] = useState<string>();
  return (
    <ul className="rows">
      {entries.map((entry) =>
        entry.own ? (
          <OwnChart
            key={entry.id}
            entry={entry}
            row={chartRow(entry, withStyle)}
            yours={sayYours}
            open={open === entry.id}
            toggle={() => setOpen(open === entry.id ? undefined : entry.id)}
            play={play}
          />
        ) : (
          <li key={entry.id}>
            <Line row={chartRow(entry, withStyle)} play={play} />
          </li>
        ),
      )}
    </ul>
  );
}

/** A list of anything else that is a line: kept takes, or the charts someone starts with. */
export function Lines({ rows, play }: { rows: readonly Row[]; play: (address: string) => void }) {
  return (
    <ul className="rows">
      {rows.map((row) => (
        <li key={row.address}>
          <Line row={row} play={play} />
        </li>
      ))}
    </ul>
  );
}
