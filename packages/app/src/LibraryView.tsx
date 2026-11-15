// The library: every chart, a tap away from playing.

import { keyToString } from "@ensemble/engine";
import { STYLES, styleById } from "@ensemble/styles";
import type { LibraryChart } from "./library.ts";
import { LIBRARY } from "./library.ts";
import type { Saving } from "./offline.ts";

interface Props {
  /** Open a chart and start the band, from the tap that asked. */
  readonly play: (entry: LibraryChart) => void;
  /** How far saving the instruments to the device has got; undefined where nothing is saved. */
  readonly saving: Saving | undefined;
}

export function LibraryView({ play, saving }: Props) {
  const shelves = [
    ...STYLES.map((style) => ({
      name: style.name,
      charts: LIBRARY.filter((entry) => entry.chart.styleId === style.id),
    })),
    {
      name: "Other",
      charts: LIBRARY.filter((entry) => !styleById(entry.chart.styleId ?? "")),
    },
  ].filter((shelf) => shelf.charts.length > 0);

  return (
    <main className="library">
      <header className="masthead">
        <h1>Ensemble</h1>
        <p>Pick a chart and the band plays it.</p>
      </header>
      {shelves.map((shelf) => (
        <section key={shelf.name} className="shelf">
          <h2>{shelf.name}</h2>
          <ul>
            {shelf.charts.map((entry) => {
              const tempo =
                entry.chart.tempo ?? styleById(entry.chart.styleId ?? "")?.tempo.default;
              return (
                <li key={entry.id}>
                  <a className="tune" href={`#/chart/${entry.id}`}>
                    <span className="tune-title">{entry.chart.title}</span>
                    <span className="tune-facts">
                      {keyToString(entry.chart.key)}, {entry.bars} bars
                      {tempo ? `, ${tempo} bpm` : ""}
                    </span>
                  </a>
                  <button
                    type="button"
                    className="tune-play"
                    aria-label={`Play ${entry.chart.title}`}
                    onClick={() => play(entry)}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M6 3.5v13l11-6.5z" />
                    </svg>
                  </button>
                </li>
              );
            })}
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
