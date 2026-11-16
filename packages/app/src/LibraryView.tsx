// The library: every chart there is, the built-in ones and the player's own
// together, on one page that says at its top what it is showing. A chart's
// style is a mark it carries, not a place it lives: the band plays any chart
// in any style. The strip under the way home moves between everything, the
// player's own, and the charts written for each style; a search looks across
// all of them, and what it finds is this page showing that.

import { keyToString } from "@ensemble/engine";
import { STYLES, styleById } from "@ensemble/styles";
import { LIBRARY, showing, YOURS } from "./address.ts";
import { NewCharts } from "./HomeView.tsx";
import type { LibraryChart } from "./library.ts";
import { LIBRARY as BUILT_IN } from "./library.ts";
import { PosterName, usePosterWidths } from "./PosterName.tsx";
import { byTitle, count, lineUp, saysOf, writtenFor } from "./posters.ts";
import { Charts } from "./rows.tsx";

/** Does a chart match every word typed? A word is looked for in the title and the style's name, or is the key. */
function matches(entry: LibraryChart, words: readonly string[]): boolean {
  const key = keyToString(entry.chart.key).toLowerCase();
  const text = `${entry.chart.title} ${writtenFor(entry)?.name ?? ""}`.toLowerCase();
  return words.every((word) => word === key || text.includes(word));
}

interface Props {
  /** Empty for every chart, `yours`, or a style's id. */
  readonly show: string;
  /** What is being searched for, as typed. Anything here is looked for across every chart. */
  readonly find: string;
  /** The player's own charts, the one changed last first. */
  readonly own: readonly LibraryChart[];
  readonly play: (address: string) => void;
}

/** The style the library is showing, when it is showing one this version has. */
export const styleShown = (show: string, find: string) =>
  find.trim() === "" ? styleById(show) : undefined;

export function Library({ show, find, own, play }: Props) {
  const width = usePosterWidths();
  const all = [...own, ...BUILT_IN];
  const words = find.toLowerCase().split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const style = styleShown(show, find);
  const yours = !searching && show === YOURS;

  if (searching) {
    const found = all.filter((entry) => matches(entry, words)).sort(byTitle);
    return (
      <main className="library-main">
        <header className="showing found">
          <h1>
            {found.length > 0
              ? `${count(found.length, "chart matches", "charts match")} “${find.trim()}”`
              : `No chart matches “${find.trim()}”`}
          </h1>
          {found.length === 0 && (
            <>
              <p className="note">
                A search looks in titles and styles, and for a key: “Bb”, “Am”.
              </p>
              <div className="actions">
                <a className="act" href={LIBRARY}>
                  Show every chart
                </a>
              </div>
            </>
          )}
        </header>
        {found.length > 0 && <Charts entries={found} play={play} withStyle sayYours />}
      </main>
    );
  }

  const strip = (
    <nav className="shows" aria-label="Show">
      <a className="shows-all" href={LIBRARY} aria-current={!style && !yours ? "page" : undefined}>
        All
      </a>
      <a className="shows-all" href={showing(YOURS)} aria-current={yours ? "page" : undefined}>
        Yours
      </a>
      {STYLES.map((each) => (
        <a
          key={each.id}
          className="shows-style"
          data-style={each.id}
          href={showing(each.id)}
          aria-current={each === style ? "page" : undefined}
        >
          {each.name}
        </a>
      ))}
    </nav>
  );

  if (style) {
    const written = all.filter((entry) => writtenFor(entry) === style).sort(byTitle);
    const says = saysOf(style);
    return (
      <>
        <header className="style-head">
          {strip}
          <div className="style-poster">
            <PosterName heading name={style.name} width={width(style.name)} />
          </div>
          {says && <p className="style-says">{says}</p>}
          <p className="style-band">
            {lineUp(style)}. {count(written.length, "chart", "charts")} written for it,{" "}
            {style.tempo.min} to {style.tempo.max} bpm.
          </p>
        </header>
        <main className="library-main">
          <Charts entries={written} play={play} withStyle={false} sayYours />
        </main>
      </>
    );
  }

  if (yours)
    return (
      <main className="library-main">
        {strip}
        <header className="showing">
          <h1>Your charts</h1>
          <p className="note">
            {own.length > 0
              ? `${count(own.length, "chart", "charts")} of your own, the one changed last first.`
              : "Nothing of yours yet. Start one from four empty bars, or bring one in as a text file."}
          </p>
          <NewCharts />
        </header>
        {own.length > 0 && <Charts entries={own} play={play} withStyle sayYours={false} />}
      </main>
    );

  return (
    <main className="library-main">
      {strip}
      <header className="showing">
        <h1>All charts</h1>
        <p className="note">
          {all.length} charts, by title{own.length > 0 ? ", yours among them" : ""}. The band plays
          any of them in any style.
        </p>
      </header>
      <Charts entries={[...all].sort(byTitle)} play={play} withStyle sayYours />
    </main>
  );
}
