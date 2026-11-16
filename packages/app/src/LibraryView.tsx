// The home screen, in the order things are wanted: what was played lately, a
// tap from playing again; the player's own charts, each with what can be done
// to it; then the built-in charts, behind a search box and a choice of style
// so that fifty of them are not a scroll to get past.

import { keyToString, seconds } from "@ensemble/engine";
import { STYLES, styleById } from "@ensemble/styles";
import type { ReactNode } from "react";
import { useLayoutEffect, useState } from "react";
import {
  addChart,
  deleteChart,
  duplicateChart,
  findChart,
  readChartFile,
  renameChart,
  STARTER,
} from "./charts.ts";
import { download, fileName } from "./download.ts";
import type { LibraryChart } from "./library.ts";
import { LIBRARY } from "./library.ts";
import type { Saving } from "./offline.ts";
import { clock } from "./play/StatusStrip.tsx";
import type { KeptTake } from "./takes.ts";
import { chartFor, dayOf, heardAs } from "./takes.ts";

/** What the player is looking for among the built-in charts. */
export interface Finding {
  /** As typed in the search box. */
  readonly query: string;
  /** A style's id, or empty for every style. */
  readonly style: string;
}

interface Props {
  /** Open a chart or a take, by its address, and start the band, from the tap that asked. */
  readonly play: (address: string) => void;
  /** The player's own charts, the one changed last first. */
  readonly own: readonly LibraryChart[];
  /** The takes they kept, the latest first. */
  readonly takes: readonly KeptTake[];
  /** The addresses of what was played lately, the latest first. */
  readonly recent: readonly string[];
  /** Kept by the app, not the screen, so it is still there on coming back from a chart. */
  readonly finding: Finding;
  readonly find: (finding: Finding) => void;
  /** How far saving the instruments to the device has got; undefined where nothing is saved. */
  readonly saving: Saving | undefined;
}

/** How many of the things played lately the home screen shows. */
const RECENT = 5;

/** Where someone starts who has played nothing yet: a blues, a rock song and a funk vamp, all easy keys on a guitar or a bass. */
const FIRST = ["blues-12-bar-a", "rock-four-chord-g", "funk-vamp-a"];

/** The built-in charts with no style of their own, or one this version does not have, are found under this. */
const OTHER = "other";

/** Open a chart of the player's in the editor. */
const edit = (id: string) => {
  location.hash = `#/edit/${id}`;
};

/** A line on a shelf: a chart, or a take. */
interface Row {
  readonly address: string;
  readonly title: string;
  readonly facts: string;
}

const styleOf = (entry: LibraryChart) => styleById(entry.chart.styleId ?? "");

/** `withStyle` where the shelf does not already say the style. */
const chartRow = (entry: LibraryChart, withStyle: boolean): Row => {
  const style = styleOf(entry);
  const tempo = entry.chart.tempo ?? style?.tempo.default;
  const key = keyToString(entry.chart.key);
  return {
    address: `#/chart/${entry.id}`,
    title: entry.chart.title,
    facts: `${withStyle && style ? `${style.name} in ${key}` : key}, ${entry.bars} bars${tempo ? `, ${tempo} bpm` : ""}`,
  };
};

const takeRow = (take: KeptTake): Row => {
  const heard = heardAs(take.recipe);
  const kept = `kept ${dayOf(take.kept)}`;
  return {
    address: `#/take/${take.id}`,
    title: take.name.trim() || take.recipe.chartName,
    facts: heard
      ? `A take: ${heard.style.name} in ${keyToString(heard.chart.key)}, ${Math.round(heard.plan.tempo)} bpm, ${clock(seconds(heard.plan))}, ${kept}`
      : `A take that does not play in this version, ${kept}`,
  };
};

/** Does a chart match every word typed? A word is looked for in the title and the style's name, or is the key. */
function matches(entry: LibraryChart, words: readonly string[]): boolean {
  const key = keyToString(entry.chart.key).toLowerCase();
  const text = `${entry.chart.title} ${styleOf(entry)?.name ?? ""}`.toLowerCase();
  return words.every((word) => word === key || text.includes(word));
}

/** A line of a shelf: its name opens it, and the round button plays it in one tap. */
function Tune({
  row,
  play,
  children,
}: {
  row: Row;
  play: (address: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="tune-line">
      <a className="tune" href={row.address}>
        <span className="tune-title">{row.title}</span>
        <span className="tune-facts">{row.facts}</span>
      </a>
      {children}
      <button
        type="button"
        className="tune-play"
        aria-label={`Play ${row.title}`}
        onClick={() => play(row.address)}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M6.5 3.5v13l10.5-6.5z" />
        </svg>
      </button>
    </div>
  );
}

function Shelf({ rows, play }: { rows: readonly Row[]; play: (address: string) => void }) {
  return (
    <ul>
      {rows.map((row) => (
        <li key={row.address}>
          <Tune row={row} play={play} />
        </li>
      ))}
    </ul>
  );
}

/** One of the player's own charts: a line like any other, and behind More what can be done to it. */
function OwnChart({
  entry,
  open,
  toggle,
  play,
}: {
  entry: LibraryChart;
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
      <Tune row={chartRow(entry, true)} play={play}>
        <button
          type="button"
          className="tune-more"
          aria-expanded={open}
          aria-label={`More for ${title}`}
          onClick={() => {
            setRenaming(undefined);
            toggle();
          }}
        >
          More
        </button>
      </Tune>
      {open &&
        (renaming === undefined ? (
          <div className="tune-tools">
            <a href={`#/edit/${entry.id}`}>Edit</a>
            <button type="button" onClick={() => setRenaming(title)}>
              Rename
            </button>
            <button type="button" onClick={() => duplicateChart(entry.id)}>
              Duplicate
            </button>
            <button
              type="button"
              onClick={() =>
                download(entry.text, "text/plain;charset=utf-8", fileName(title, "chart", ".chart"))
              }
            >
              Export
            </button>
            <button type="button" className="danger" onClick={remove}>
              Delete
            </button>
          </div>
        ) : (
          <form
            className="tune-tools"
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
            <button type="submit" className="first" disabled={renaming.trim() === ""}>
              Save
            </button>
            <button type="button" onClick={() => setRenaming(undefined)}>
              Cancel
            </button>
          </form>
        ))}
    </li>
  );
}

/** How far down home was when it was last left, so that coming back from a chart is coming back to the same place. */
let leftAt = 0;

export function LibraryView({ play, own, takes, recent, finding, find, saving }: Props) {
  useLayoutEffect(() => {
    scrollTo(0, leftAt);
    // Kept as the page moves: by the time this screen is taken down the next one may have moved it.
    const keep = () => {
      leftAt = scrollY;
    };
    addEventListener("scroll", keep, { passive: true });
    return () => removeEventListener("scroll", keep);
  }, []);

  /** The chart of the player's whose More is open: one at a time. */
  const [open, setOpen] = useState<string>();

  // What was played lately and is still here.
  const played = recent
    .flatMap((address): Row[] => {
      const [, kind, id] = /^#\/(chart|take)\/(.+)$/.exec(address) ?? [];
      if (kind === "take") return takes.filter((take) => take.id === id).map(takeRow);
      const entry = id === undefined ? undefined : findChart(id);
      return entry ? [chartRow(entry, true)] : [];
    })
    .slice(0, RECENT);
  const first = FIRST.flatMap((id) => LIBRARY.filter((entry) => entry.id === id)).map((entry) =>
    chartRow(entry, true),
  );

  // A take is found on its chart's screen. One whose chart is gone has no such screen, so it is listed here.
  const strays = takes.filter((take) => !chartFor(take)).map(takeRow);

  const groups = [
    ...STYLES.map((style) => ({
      id: style.id,
      name: style.name,
      charts: LIBRARY.filter((entry) => entry.chart.styleId === style.id),
    })),
    { id: OTHER, name: "Other", charts: LIBRARY.filter((entry) => !styleOf(entry)) },
  ].filter((group) => group.charts.length > 0);
  const chosen = groups.find((group) => group.id === finding.style);
  const words = finding.query.toLowerCase().split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const found = (chosen?.charts ?? LIBRARY).filter((entry) => matches(entry, words));

  return (
    <main className="library">
      <header className="masthead">
        <h1>Ensemble</h1>
        <p>Pick a chart and the band plays it.</p>
      </header>

      {played.length > 0 ? (
        <section className="shelf">
          <h2>Recent</h2>
          <Shelf rows={played} play={play} />
        </section>
      ) : (
        <section className="shelf">
          <h2>Start here</h2>
          <Shelf rows={first} play={play} />
        </section>
      )}

      <section className="shelf">
        <h2>Your charts</h2>
        {own.length === 0 && (
          <p className="shelf-note">
            Nothing of yours yet. Type a chart of your own, or bring one in as a text file.
          </p>
        )}
        <div className="actions">
          <button type="button" onClick={() => edit(addChart(STARTER))}>
            New chart
          </button>
          <label>
            Import a chart
            <input
              type="file"
              accept=".chart,.txt,text/plain"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const text = await readChartFile(file);
                if (text === undefined) alert(`${file.name} is too big to be a chart.`);
                else edit(addChart(text));
              }}
            />
          </label>
        </div>
        {own.length > 0 && (
          <ul>
            {own.map((entry) => (
              <OwnChart
                key={entry.id}
                entry={entry}
                open={open === entry.id}
                toggle={() => setOpen(open === entry.id ? undefined : entry.id)}
                play={play}
              />
            ))}
          </ul>
        )}
      </section>

      {strays.length > 0 && (
        <section className="shelf">
          <h2>Takes of charts no longer here</h2>
          <Shelf rows={strays} play={play} />
        </section>
      )}

      <section className="shelf">
        <h2>Built-in charts</h2>
        <div className="finder">
          <label className="field">
            <span>Search</span>
            <input
              type="search"
              value={finding.query}
              placeholder="A title, a key or a style"
              enterKeyHint="search"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => find({ ...finding, query: e.target.value })}
            />
          </label>
          <label className="field pick">
            <span>Style</span>
            <select
              value={chosen?.id ?? ""}
              onChange={(e) => find({ ...finding, style: e.target.value })}
            >
              <option value="">Every style</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {chosen && (
          // A style was opened: the way back to all of them is said where its list starts, and
          // not left to the picker above.
          <div className="opened">
            <button
              type="button"
              className="back"
              onClick={() => find({ ...finding, style: "" })}
              aria-label="Back to all the styles"
            >
              <svg viewBox="0 0 22 22" aria-hidden="true">
                <path d="M13.5 4.5L7 11l6.5 6.5" />
              </svg>
              <span>All styles</span>
            </button>
            <h3>{chosen.name}</h3>
          </div>
        )}
        {!searching && !chosen ? (
          // Nothing asked for yet: the styles themselves, each a tap from its charts.
          <ul>
            {groups.map((group) => (
              <li key={group.id}>
                <button
                  type="button"
                  className="style-line"
                  onClick={() => find({ ...finding, style: group.id })}
                >
                  <span className="tune-title">{group.name}</span>
                  <span className="tune-facts">
                    {group.charts.map((entry) => entry.chart.title).join(", ")}
                  </span>
                  <span className="style-count">{group.charts.length} charts</span>
                </button>
              </li>
            ))}
          </ul>
        ) : found.length > 0 ? (
          <Shelf rows={found.map((entry) => chartRow(entry, !chosen))} play={play} />
        ) : (
          <div className="shelf-note">
            <p>
              No {chosen ? `${chosen.name.toLowerCase()} chart` : "built-in chart"} matches “
              {finding.query.trim()}”.
            </p>
            {chosen && (
              <button type="button" onClick={() => find({ ...finding, style: "" })}>
                Search every style
              </button>
            )}
          </div>
        )}
      </section>

      <footer className="colophon">
        {saving && (
          <p>
            {saving.done === saving.total
              ? "Everything is saved on this device. Ensemble plays with no connection."
              : saving.finished
                ? `${saving.done} of ${saving.total} instrument files are saved on this device. The rest will be fetched the next time Ensemble is opened with a connection.`
                : `Saving the instruments to this device: ${saving.done} of ${saving.total} files.`}
          </p>
        )}
        <p>
          <a href="#/credits">Credits and licences</a>
        </p>
      </footer>
    </main>
  );
}
