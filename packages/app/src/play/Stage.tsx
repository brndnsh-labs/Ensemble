// What a chart's screen and a kept take's screen share: the way back, the
// screen's name and what is being played in a line, the chart with the
// playhead on it, and the dock: where the band is, the four players, and the
// transport. Behind More, what is rarely wanted. Each screen brings its own
// line, its own players' states and its own part of More.

import type { Chart, Plan, Seat, StylePack } from "@ensemble/engine";
import { keyToString, planBar, SOLO_INSTRUMENTS, seatChoice } from "@ensemble/engine";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { instrument } from "../posters.ts";
import type { Place } from "../Trail.tsx";
import { Trail } from "../Trail.tsx";
import type { Playhead } from "./ChartView.tsx";
import { ChartView } from "./ChartView.tsx";
import type { Reading } from "./ChordSymbol.tsx";
import type { Call, HowPlayed } from "./jam.ts";
import { homeStretch, nextChange } from "./jam.ts";
import { useLamps } from "./lamps.ts";
import { pageBarOf } from "./page.ts";
import { Sheet } from "./Sheet.tsx";
import { StatusStrip } from "./StatusStrip.tsx";
import type { Jam } from "./useJam.ts";

/** A player in the dock: the seat, what it is played on, and whether it plays. */
export interface Seated {
  readonly seat: Seat;
  /** The instrument, as its pack names it: "Upright bass". */
  readonly on: string;
  /**
   * In the band and heard; out of it (sitting out, or silenced); switched on
   * while the band plays a take it is not in, so heard from the next one; or
   * not in a kept take at all, which nothing can change.
   */
  readonly state: "in" | "out" | "next" | "absent";
  /** What a press does. None: the block cannot be pressed. */
  readonly press?: () => void;
}

interface Props {
  readonly jam: Jam;
  /** What a press of play starts. */
  readonly call: Call;
  /** The call's chart, in the key it is played in. */
  readonly chart: Chart;
  /** What play would start, to show its length and shape before it is pressed. */
  readonly preview: Plan;
  /** The screen's name, when it is not the chart's title. */
  readonly title?: string;
  /** The place above this screen: the part of the library it belongs under, or the takes. */
  readonly place: Place;
  readonly reading: Reading;
  readonly read: (reading: Reading) => void;
  /** At the end of the top row, before More: the way to the editor, or to a take's chart. */
  readonly side?: ReactNode;
  /** Under the name: what is played, in a line. */
  readonly sentence: ReactNode;
  /** The four players. */
  readonly players: readonly Seated[];
  /** Beside the transport: Keep. */
  readonly keep?: ReactNode;
  /** The screen's own part of More, under how the page is read. */
  readonly more: (close: () => void) => ReactNode;
  /** Something of the screen's own that went wrong, said where the band's own troubles are. */
  readonly problem?: string | undefined;
}

/** Somewhere a space is typed or chooses, or a sheet is open over the screen: the space is not the transport's there. */
const takesSpaces = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target instanceof Element && target.closest("dialog") !== null);

/**
 * The space bar is the transport, as on every recorder: it does what the big
 * button would. That holds wherever the focus is but in a text box, a list of
 * choices or a sheet, so a seat silenced with the mouse does not come back
 * when the player reaches for the space bar to stop the band. A button under
 * the focus is still pressed with Enter.
 */
function useSpaceBar(press: () => void): void {
  const latest = useRef(press);
  latest.current = press;
  useEffect(() => {
    /** True from the space bar going down to its coming up: the press a focused button would make of it is dropped. */
    let ours = false;
    const down = (event: KeyboardEvent) => {
      if (event.key !== " " || event.ctrlKey || event.metaKey || event.altKey) return;
      if (takesSpaces(event.target)) return;
      event.preventDefault();
      // A held key repeats; the band is started or stopped once.
      if (event.repeat) return;
      ours = true;
      latest.current();
    };
    const up = (event: KeyboardEvent) => {
      if (event.key !== " " || !ours) return;
      event.preventDefault();
      // The button's own press, where a browser still makes one, comes with the key's release.
      setTimeout(() => {
        ours = false;
      });
    };
    // A press made by a key, not a pointer, counts no clicks.
    const click = (event: MouseEvent) => {
      if (!ours || event.detail !== 0) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
      document.removeEventListener("click", click, true);
    };
  }, []);
}

/** How many bars ahead the play screen tells the chart about: enough to find the next line from anywhere. */
const COMING = 16;

const SEAT_NAMES: Readonly<Record<Seat, string>> = {
  drums: "Drums",
  bass: "Bass",
  chords: "Chords",
  solo: "Soloist",
};

/** What a seat is played on in a take, as its pack names it. */
export function playedOn(style: StylePack, options: HowPlayed, seat: Seat): string {
  if (seat === "solo") {
    const solo = options.soloInstrument ?? style.solo.instrument;
    return SOLO_INSTRUMENTS[solo]?.name ?? instrument(solo);
  }
  return instrument(seatChoice(style, seat, options.instruments).pack);
}

/** What a player's block says under its name, when it is not what it is played on. */
const SAYS: Readonly<Record<Seated["state"], string | undefined>> = {
  in: undefined,
  out: "sits out",
  next: "in next time",
  absent: "not in this take",
};

export function Stage(props: Props) {
  const { jam, call, chart, preview, reading, read } = props;
  const { title, place, side, sentence, players, keep, more } = props;
  const problem = jam.problem ?? props.problem;
  const [focus, setFocus] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const idle = jam.phase === "idle";
  const playing = jam.phase === "playing";
  useSpaceBar(idle ? jam.play : jam.stop);
  const plan = playing && jam.playing ? jam.playing.plan : preview;
  const shown = playing && jam.playing ? jam.playing.chart : chart;

  // Each player's lamp, lit by its notes while the band plays: written to directly, never through React.
  const lamps = useRef(new Map<Seat, HTMLElement>());
  const states = new Map(players.map((player) => [player.seat, player.state]));
  useLamps(playing, jam.follow, lamps, (seat) => states.get(seat) === "in");

  let playhead: Playhead | undefined;
  if (playing && jam.place) {
    const { bar } = jam.place;
    const next = nextChange(plan, jam.place);
    const nextBar = next && pageBarOf(next.bar);
    const coming: string[] = [];
    for (let index = bar.index + 1; index <= bar.index + COMING; index++) {
      const id = pageBarOf(planBar(plan, index) ?? bar);
      if (id !== undefined) coming.push(id);
    }
    // On the way home the final bar is the ending the band will play, not the turnaround written there.
    const last = homeStretch(plan, bar) ? plan.bars.find((b) => b.ending) : undefined;
    const lastBar = last && pageBarOf(last);
    playhead = {
      bar: pageBarOf(bar) ?? "",
      coming,
      ...(next && nextBar ? { next: { bar: nextBar, at: next.at } } : {}),
      ...(last && lastBar
        ? {
            landing: {
              bar: lastBar,
              chords: last.spans
                .filter((span) => !span.tied)
                .map((span) => ({
                  chord: span.chord,
                  at: span.start / last.ticks,
                  span: span.duration / last.ticks,
                })),
            },
          }
        : {}),
    };
  }

  const { style } = call;
  // While the band plays the strip follows the take, not the switches: a soloist silenced
  // still has its solos marked, for the player to take.
  const options = !idle && jam.take ? jam.take.options : call.options;
  const soloist = options.solo
    ? SOLO_INSTRUMENTS[options.soloInstrument ?? style.solo.instrument]?.name
    : undefined;
  const close = () => setMoreOpen(false);
  // An example of each way of reading, in the key the chart is played in.
  const tonic = keyToString({ tonic: shown.key.tonic, mode: "major" });

  return (
    // The screen takes the ink of the style the band plays in: the line, the dock and Play.
    <main className="play" data-style={style.id} data-state={jam.phase}>
      <div className="top">
        <header className="bar-top">
          <Trail place={place} />
          {side}
          <button
            type="button"
            className="edit-link more-link"
            aria-haspopup="dialog"
            onClick={() => setMoreOpen(true)}
          >
            More
          </button>
        </header>
        <h1 className="chart-title">{title ?? shown.title}</h1>
        {sentence}
      </div>

      <ChartView chart={shown} reading={reading} playhead={playhead} focus={focus} />

      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}

      <footer className="band-dock">
        <StatusStrip
          plan={plan}
          place={playing ? jam.place : undefined}
          elapsed={jam.elapsed}
          playing={playing}
          loading={jam.phase === "loading"}
          soloist={soloist}
        />
        <fieldset className="players" aria-label="Band">
          {players.map(({ seat, on, state, press }) => {
            const says = SAYS[state];
            const words = (
              <>
                <span className="who">{SEAT_NAMES[seat]}</span>
                {/* The space is for whoever hears the block read out. */}
                <span className="what"> {says ?? on}</span>
              </>
            );
            return (
              <button
                key={seat}
                type="button"
                className={`player ${state}`}
                aria-pressed={state === "in" || state === "next"}
                disabled={press === undefined}
                onClick={press}
              >
                <span
                  className="lamp"
                  aria-hidden="true"
                  ref={(element) => {
                    if (element) lamps.current.set(seat, element);
                    else lamps.current.delete(seat);
                  }}
                >
                  {words}
                </span>
                {words}
              </button>
            );
          })}
        </fieldset>
        <div className="transport">
          {keep}
          {/* The second choice, and only a jam's: a song ends by itself. It comes in beside Stop, moving nothing. */}
          {!idle && plan.mode === "jam" && (
            <button type="button" className="finish" disabled={!jam.canFinish} onClick={jam.finish}>
              {jam.finishing ? "Finishing" : "Finish"}
            </button>
          )}
          {/* One button in one place: Play, and Stop while there is anything to stop. */}
          <button
            type="button"
            className={`go${idle ? "" : " stop"}`}
            onClick={idle ? jam.play : jam.stop}
          >
            {idle ? "Play" : "Stop"}
          </button>
        </div>
      </footer>

      <Sheet open={moreOpen} close={close} title={title ?? shown.title} kind="more-sheet">
        <p className="sheet-label" id="reading-label">
          Show the chords as
        </p>
        <fieldset className="opts seg" aria-labelledby="reading-label">
          <button
            type="button"
            className="opt"
            aria-pressed={reading === "names"}
            onClick={() => read("names")}
          >
            Names<small>{tonic}7</small>
          </button>
          <button
            type="button"
            className="opt"
            aria-pressed={reading === "numerals"}
            onClick={() => read("numerals")}
          >
            Numerals<small>I7</small>
          </button>
          <button
            type="button"
            className="opt"
            aria-pressed={reading === "both"}
            onClick={() => read("both")}
          >
            Both<small>{tonic}7 over I7</small>
          </button>
        </fieldset>
        <ul className="menu">
          <li>
            <button
              className="menu-line"
              type="button"
              aria-pressed={focus}
              onClick={() => {
                setFocus(!focus);
                close();
              }}
            >
              <span>{focus ? "Focus is on" : "Focus"}</span>
              <small>
                {focus
                  ? "Press to show the whole chart again"
                  : "Only the line being played and the next, large"}
              </small>
            </button>
          </li>
          {more(close)}
        </ul>
      </Sheet>
    </main>
  );
}
