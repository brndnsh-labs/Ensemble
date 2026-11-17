// Home and the library: the two screens a chart is found on. They are one
// component so that the search box is one box: typing in it on home turns the
// screen into the library showing what was found, and the box, the caret and
// the phone's keyboard stay where the typing is.

import type { CSSProperties } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import type { Route } from "./address.ts";
import { address, cameBack, cameFrom, finding, go, HOME, LIBRARY, swap, TAKES } from "./address.ts";
import { HomeCharts, HomeTakes } from "./HomeView.tsx";
import { Library, styleShown } from "./LibraryView.tsx";
import type { LibraryChart } from "./library.ts";
import type { Saving } from "./offline.ts";
import { posterWidth, useLettersIn } from "./PosterName.tsx";
import type { Played } from "./recent.ts";
import { inkOf } from "./rows.tsx";
import type { ChartChoices } from "./settings.ts";
import { Trail } from "./Trail.tsx";
import type { KeptTake } from "./takes.ts";

interface Props {
  readonly route: Extract<Route, { screen: "home" | "library" }>;
  /** Open a chart or a take, by its address, and start the band, from the tap that asked. */
  readonly play: (address: string) => void;
  /** The player's own charts, the one changed last first. */
  readonly own: readonly LibraryChart[];
  /** The takes they kept, the latest first. */
  readonly takes: readonly KeptTake[];
  /** What was played lately, the latest first. */
  readonly recent: readonly Played[];
  readonly choices: Readonly<Record<string, ChartChoices>>;
  readonly saving: Saving | undefined;
}

/** How far down each of these screens was when it was last left, by its address. */
const leftAt = new Map<string, number>();

/** A screen under these: coming up from one is coming back. */
const BELOW = /^#\/(chart|edit|take|credits)\b/;

/**
 * Coming back to home or the library is coming back to where it was
 * scrolled: from a chart, by its row of places or the back gesture, and to
 * home from anywhere. A part of the library gone to afresh (from the wall,
 * the strip, a search) starts at its top.
 */
function useScrollKept(home: boolean): void {
  // Home is home however its address is written: with nothing after the page's own, or `#/`.
  const here = home && address() !== TAKES ? HOME : address();
  const key = useRef(here);
  useLayoutEffect(() => {
    key.current = here;
    const back = home || cameBack() || BELOW.test(cameFrom());
    scrollTo(0, back ? (leftAt.get(here) ?? 0) : 0);
    leftAt.set(here, scrollY);
  }, [here, home]);
  useLayoutEffect(() => {
    // Kept as the page moves: by the time a screen is taken down the next one may have moved it.
    const keep = () => leftAt.set(key.current, scrollY);
    addEventListener("scroll", keep, { passive: true });
    return () => removeEventListener("scroll", keep);
  }, []);
}

/** The search box. What is typed is in the address, so it is still there on coming back from a chart. */
function Finder({ text, home }: { text: string; home: boolean }) {
  const box = useRef<HTMLInputElement>(null);
  const type = (next: string) => {
    // The first letter is a step from wherever it was typed, and the back gesture undoes it;
    // the letters after it are the same step.
    if (text === "") go(finding(next));
    else swap(finding(next));
  };
  return (
    <div className="finder">
      <input
        ref={box}
        type="search"
        className={text === "" ? "finder-box" : "finder-box typed"}
        aria-label="Find a chart"
        value={text}
        placeholder={home ? "Find a chart: a title, a key or a style" : "Find a chart"}
        enterKeyHint="search"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => type(e.target.value)}
        // The phone's Search key puts its keyboard away: what was found is already on the page.
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      {text !== "" && (
        <button
          type="button"
          className="finder-clear"
          aria-label="Clear what is typed"
          onClick={() => {
            swap(LIBRARY);
            box.current?.focus();
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}

export function Browse({ route, play, own, takes, recent, choices, saving }: Props) {
  const home = route.screen === "home";
  const lettersIn = useLettersIn();
  useScrollKept(home);
  const style = home ? undefined : styleShown(route.show, route.find);

  // A style's page keeps its name beside the way home once its poster has scrolled away.
  const [past, setPast] = useState(false);
  useLayoutEffect(() => {
    if (!style) return setPast(false);
    const mark = () => {
      const head = document.querySelector<HTMLElement>(".style-head");
      setPast(head !== null && scrollY > head.offsetHeight - 24);
    };
    mark();
    addEventListener("scroll", mark, { passive: true });
    return () => removeEventListener("scroll", mark);
  }, [style]);

  return (
    <div
      className={home ? "browse home" : "browse library"}
      data-style={style ? inkOf(style.id) : undefined}
    >
      <div className="browse-top">
        {home ? (
          <header className="masthead">
            {/* On a phone the name is as wide as the page, once its letters are in to be measured. */}
            <h1
              className={lettersIn ? "wordmark fitted" : "wordmark"}
              style={
                lettersIn
                  ? ({ "--w": posterWidth("Ensemble").toFixed(3) } as CSSProperties)
                  : undefined
              }
            >
              Ensemble
            </h1>
            {/* Charts and Takes: two views of this one screen, said where its name is. */}
            <nav className="views" aria-label="Show">
              <a className="tab" href={HOME} aria-current={route.takes ? undefined : "page"}>
                Charts
              </a>
              <a className="tab" href={TAKES} aria-current={route.takes ? "page" : undefined}>
                Takes
                {takes.length > 0 && <span className="views-count">{takes.length}</span>}
              </a>
            </nav>
          </header>
        ) : (
          <Trail
            here={
              style &&
              past && (
                <>
                  <span className="crumb-sep" aria-hidden="true">
                    /
                  </span>
                  <span className="here">{style.name}</span>
                </>
              )
            }
          />
        )}
        {!(home && route.takes) && <Finder text={home ? "" : route.find} home={home} />}
      </div>
      {home ? (
        route.takes ? (
          <HomeTakes takes={takes} play={play} />
        ) : (
          <HomeCharts
            play={play}
            own={own}
            takes={takes}
            recent={recent}
            choices={choices}
            saving={saving}
          />
        )
      ) : (
        <Library show={route.show} find={route.find} own={own} play={play} />
      )}
    </div>
  );
}
