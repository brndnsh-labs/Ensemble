// The library: every chart, a tap away from playing. The player's own charts
// come first, then the takes they kept, and a new chart is a tap away from
// typing.

import { keyToString, seconds } from "@ensemble/engine";
import { STYLES, styleById } from "@ensemble/styles";
import { addChart, readChartFile, STARTER } from "./charts.ts";
import type { LibraryChart } from "./library.ts";
import { LIBRARY } from "./library.ts";
import type { Saving } from "./offline.ts";
import { clock } from "./play/StatusStrip.tsx";
import type { KeptTake } from "./takes.ts";
import { heardAs } from "./takes.ts";

interface Props {
  /** Open a chart or a take, by its address, and start the band, from the tap that asked. */
  readonly play: (address: string) => void;
  /** The player's own charts, the one changed last first. */
  readonly own: readonly LibraryChart[];
  /** The takes they kept, the latest first. */
  readonly takes: readonly KeptTake[];
  /** How far saving the instruments to the device has got; undefined where nothing is saved. */
  readonly saving: Saving | undefined;
}

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

const chartRow = (entry: LibraryChart): Row => {
  const tempo = entry.chart.tempo ?? styleById(entry.chart.styleId ?? "")?.tempo.default;
  return {
    address: `#/chart/${entry.id}`,
    title: entry.chart.title,
    facts: `${keyToString(entry.chart.key)}, ${entry.bars} bars${tempo ? `, ${tempo} bpm` : ""}`,
  };
};

/** The day a take was kept: the year only when it was not this one. */
const dayOf = (time: number): string => {
  const date = new Date(time);
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
};

const takeRow = (take: KeptTake): Row => {
  const heard = heardAs(take.recipe);
  const kept = `kept ${dayOf(take.kept)}`;
  return {
    address: `#/take/${take.id}`,
    title: take.name.trim() || take.recipe.chartName,
    facts: heard
      ? `${heard.style.name} in ${keyToString(heard.chart.key)}, ${Math.round(heard.plan.tempo)} bpm, ${clock(seconds(heard.plan))}, ${kept}`
      : `Does not play in this version, ${kept}`,
  };
};

export function LibraryView({ play, own, takes, saving }: Props) {
  const shelves = [
    { name: "Your charts", rows: own.map(chartRow) },
    { name: "Takes", rows: takes.map(takeRow) },
    ...STYLES.map((style) => ({
      name: style.name,
      rows: LIBRARY.filter((entry) => entry.chart.styleId === style.id).map(chartRow),
    })),
    {
      name: "Other",
      rows: LIBRARY.filter((entry) => !styleById(entry.chart.styleId ?? "")).map(chartRow),
    },
  ].filter((shelf) => shelf.rows.length > 0);

  return (
    <main className="library">
      <header className="masthead">
        <h1>Ensemble</h1>
        <p>Pick a chart and the band plays it.</p>
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
      </header>
      {shelves.map((shelf) => (
        <section key={shelf.name} className="shelf">
          <h2>{shelf.name}</h2>
          <ul>
            {shelf.rows.map((row) => (
              <li key={row.address}>
                <a className="tune" href={row.address}>
                  <span className="tune-title">{row.title}</span>
                  <span className="tune-facts">{row.facts}</span>
                </a>
                <button
                  type="button"
                  className="tune-play"
                  aria-label={`Play ${row.title}`}
                  onClick={() => play(row.address)}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M6 3.5v13l11-6.5z" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
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
