// Home, in the order things are wanted: what was played last, large, a tap
// from playing again; the wall of styles, each a way into the one library;
// the player's own charts, each with what can be done to it; and the way to
// every chart there is. The takes that were kept are a second view of it.

import { STYLES } from "@ensemble/styles";
import { go, LIBRARY, showing } from "./address.ts";
import { addChart, findChart, readChartFile, STARTER } from "./charts.ts";
import type { LibraryChart } from "./library.ts";
import { LIBRARY as BUILT_IN } from "./library.ts";
import type { Saving } from "./offline.ts";
import { PosterName, usePosterWidths } from "./PosterName.tsx";
import { count, lineUp, spelled, writtenFor } from "./posters.ts";
import type { Played } from "./recent.ts";
import type { Row } from "./rows.tsx";
import { Charts, chartRow, inkOf, Lines, PLAY, playedRow, takeRow } from "./rows.tsx";
import type { ChartChoices } from "./settings.ts";
import type { KeptTake } from "./takes.ts";
import { dayOf } from "./takes.ts";

/** Where someone starts who has played nothing yet: a blues, a rock song and a funk vamp, all easy keys on a guitar or a bass. */
const FIRST = ["blues-12-bar-a", "rock-four-chord-g", "funk-vamp-a"];

/** The last thing played is a poster; this many before it are smaller bills under it. */
const LATELY = 2;

/** Open a chart of the player's on its screen, with the pencil down. */
const edit = (id: string) => go(`#/edit/${id}`);

/** A new chart, or one brought in as a file: wherever the player's own charts are listed. */
export function NewCharts() {
  return (
    <div className="actions">
      <button type="button" className="act first" onClick={() => edit(addChart(STARTER))}>
        New chart
      </button>
      <label className="act">
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
  );
}

/** "today", "yesterday", or the day. */
function dayAgo(time: number): string {
  const start = (at: number) => new Date(at).setHours(0, 0, 0, 0);
  const days = Math.round((start(Date.now()) - start(time)) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : dayOf(time);
}

/** The one poster on the screen: a chart or a take in its style's ink, and the large Play. */
function Hero({ row, lead, play }: { row: Row; lead: string; play: (address: string) => void }) {
  return (
    <section className="last" data-style={inkOf(row.style)}>
      <p className="last-lead">{lead}</p>
      <h2>
        <a className="last-open" href={row.address}>
          {row.title}
        </a>
      </h2>
      <p className="last-facts">{row.facts}</p>
      <button
        type="button"
        className="last-play"
        aria-label={`Play ${row.title}`}
        onClick={() => play(row.address)}
      >
        {PLAY}
        <span>Play</span>
      </button>
    </section>
  );
}

interface Props {
  /** Open a chart or a take, by its address, and start the band, from the tap that asked. */
  readonly play: (address: string) => void;
  /** The player's own charts, the one changed last first. */
  readonly own: readonly LibraryChart[];
  readonly takes: readonly KeptTake[];
  /** What was played lately, the latest first. */
  readonly recent: readonly Played[];
  /** What was chosen for each chart on its own screen: a chart played lately is shown as it was played. */
  readonly choices: Readonly<Record<string, ChartChoices>>;
  /** How far saving the instruments to the device has got; undefined where nothing is saved. */
  readonly saving: Saving | undefined;
}

export function HomeCharts({ play, own, takes, recent, choices, saving }: Props) {
  const width = usePosterWidths();

  // What was played lately and is still here, as it was played.
  const played = recent
    .flatMap((item): (Row & { readonly at: number })[] => {
      const [, kind, id] = /^#\/(chart|take)\/(.+)$/.exec(item.id) ?? [];
      if (kind === "take") {
        const take = takes.find((kept) => kept.id === id);
        if (!take) return [];
        const row = takeRow(take);
        // On a poster a take says that it is one, and how long it runs.
        const facts = row.short
          ? `A take kept ${dayOf(take.kept)}: ${row.short}, ${row.length}`
          : row.facts;
        return [{ ...row, facts, at: item.played }];
      }
      const entry = id === undefined ? undefined : findChart(id);
      return entry ? [{ ...playedRow(entry, choices[entry.id]), at: item.played }] : [];
    })
    .slice(0, 1 + LATELY);
  const [last, ...lately] = played;
  const first = FIRST.flatMap((id) => BUILT_IN.filter((entry) => entry.id === id));
  const [start, ...next] = first;

  const all = [...own, ...BUILT_IN];
  // Two columns on a phone, filled in turn, so that the wall reads across as the styles are ordered.
  const columns = [0, 1].map((column) => STYLES.filter((_, index) => index % 2 === column));

  return (
    <div className="home-body">
      {last ? (
        <>
          <Hero row={last} lead={`Last played, ${dayAgo(last.at)}`} play={play} />
          {lately.length > 0 && (
            <ul className="lately">
              {lately.map((row) => (
                <li key={row.address} className="lately-item" data-style={inkOf(row.style)}>
                  <a className="lately-open" href={row.address}>
                    <span className="row-title">{row.title}</span>
                    <span className="row-facts">{row.short ?? row.facts}</span>
                  </a>
                  <button
                    type="button"
                    className="row-play"
                    aria-label={`Play ${row.title}`}
                    onClick={() => play(row.address)}
                  >
                    {PLAY}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        start && (
          <>
            <Hero
              row={{
                ...chartRow(start, true),
                facts: `${count(start.bars, "bar", "bars")} at ${start.chart.tempo ?? writtenFor(start)?.tempo.default ?? 100} bpm. Press Play and the band comes in.`,
              }}
              lead="Start here"
              play={play}
            />
            <div className="lately-rows">
              <Lines rows={next.map((entry) => chartRow(entry, true))} play={play} />
            </div>
          </>
        )
      )}

      <section className="styles">
        <h2>{spelled(STYLES.length)} styles</h2>
        <div className="wall">
          {columns.map((column) => (
            <div key={column[0]?.id} className="wall-col">
              {column.map((style) => (
                <a key={style.id} className="tile" data-style={style.id} href={showing(style.id)}>
                  <PosterName name={style.name} width={width(style.name)} />
                  <span className="tile-band">{lineUp(style)}</span>
                  <span className="tile-count">
                    {count(
                      all.filter((entry) => writtenFor(entry) === style).length,
                      "chart",
                      "charts",
                    )}
                  </span>
                </a>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="yours">
        <h2>Your charts</h2>
        {own.length > 0 ? (
          <Charts entries={own} play={play} withStyle sayYours={false} />
        ) : (
          <p className="note">
            Nothing of yours yet. Start one from four empty bars, or bring one in as a text file.
          </p>
        )}
        <NewCharts />
      </section>

      <a className="whole" href={LIBRARY}>
        <span className="whole-name">All {all.length} charts</span>
        <span className="whole-says">
          {own.length > 0 ? "Yours and the built-in ones" : "Every built-in chart"}, in one list by
          title
        </span>
      </a>

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
    </div>
  );
}

/** Every take that was kept, the latest first: one whose chart has since been deleted is still here. */
export function HomeTakes({
  takes,
  play,
}: {
  takes: readonly KeptTake[];
  play: (address: string) => void;
}) {
  return (
    <section className="takes">
      <h2>Takes you kept</h2>
      {takes.length > 0 ? (
        <>
          <Lines rows={takes.map(takeRow)} play={play} />
          <p className="note">
            A take is one performance, kept exactly: the same notes every time it is played.
          </p>
        </>
      ) : (
        <p className="note">
          No takes yet. When the band plays something worth hearing again, press Keep while it
          plays, and it is here.
        </p>
      )}
    </section>
  );
}
