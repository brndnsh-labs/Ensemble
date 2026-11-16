// What the play screen and a kept take's screen share: the chart with the
// playhead on it, how it is read, the status strip and the transport. Each
// screen brings what there is to do before the band starts: set it up, or
// name and export the take.

import type { Chart, Plan } from "@ensemble/engine";
import { keyToString, planBar, SOLO_INSTRUMENTS } from "@ensemble/engine";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Back } from "../Back.tsx";
import type { Playhead } from "./ChartView.tsx";
import { ChartView } from "./ChartView.tsx";
import type { Reading } from "./ChordSymbol.tsx";
import type { Call } from "./jam.ts";
import { homeStretch, nextChange } from "./jam.ts";
import { pageBarOf } from "./page.ts";
import { StatusStrip } from "./StatusStrip.tsx";
import type { Jam } from "./useJam.ts";

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
  readonly reading: Reading;
  readonly read: (reading: Reading) => void;
  /** At the end of the header: the way to the editor. */
  readonly side?: ReactNode;
  /** Over the chart while the band is not playing. */
  readonly before: ReactNode;
  /** Who is in the band: under the chart, and there while the band plays too. */
  readonly band?: ReactNode;
  /** Beside the transport, and quieter than it. */
  readonly aside?: ReactNode;
}

/** Somewhere a space is typed or chooses, so it is not the transport's there. */
const takesSpaces = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement;

/**
 * The space bar is the transport, as on every recorder: it does what the big
 * button would. That holds wherever the focus is but in a text box or a list
 * of choices, so a seat silenced with the mouse does not come back when the
 * player reaches for the space bar to stop the band. A button under the focus
 * is still pressed with Enter.
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
const READINGS: readonly Reading[] = ["names", "numerals", "both"];
/** Each way of reading shown by example, and said in full for a screen reader. */
const READING_NAMES: Readonly<Record<Reading, readonly [shown: string, said: string]>> = {
  names: ["C7", "Chord names"],
  numerals: ["V7", "Numerals"],
  both: ["Both", "Names with numerals under them"],
};

export function Stage(props: Props) {
  const { jam, call, chart, preview, title, reading, read, side, before, band, aside } = props;
  const [focus, setFocus] = useState(false);

  const idle = jam.phase === "idle";
  const playing = jam.phase === "playing";
  useSpaceBar(idle ? jam.play : jam.stop);
  const plan = playing && jam.playing ? jam.playing.plan : preview;
  const shown = playing && jam.playing ? jam.playing.chart : chart;

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

  return (
    <main className={`play${playing ? " playing" : ""}`}>
      <header className="bar-top">
        <Back />
        <h1>{title ?? shown.title}</h1>
        {side}
      </header>

      {/* What is being played, and how the page is read. */}
      <div className="view">
        <p className="summary">
          {style.name} in {keyToString(shown.key)}, {Math.round(plan.tempo)} bpm
        </p>
        <fieldset className="reading" aria-label="Show chords as">
          {READINGS.map((way) => (
            <button
              key={way}
              type="button"
              aria-pressed={reading === way}
              aria-label={READING_NAMES[way][1]}
              onClick={() => read(way)}
            >
              {READING_NAMES[way][0]}
            </button>
          ))}
        </fieldset>
        <button
          type="button"
          className="focus-toggle"
          aria-pressed={focus}
          onClick={() => setFocus(!focus)}
        >
          Focus
        </button>
      </div>

      {/* Gone from the press of play, not from the first note: the press is answered at once. */}
      {idle && before}

      <ChartView chart={shown} reading={reading} playhead={playhead} focus={focus} />

      {jam.problem && (
        <p className="problem" role="alert">
          {jam.problem}
        </p>
      )}

      <footer className="bar-bottom">
        <StatusStrip
          plan={plan}
          place={playing ? jam.place : undefined}
          elapsed={jam.elapsed}
          playing={playing}
          loading={jam.phase === "loading"}
          soloist={soloist}
        />
        {band}
        <div className="take-tools">{aside}</div>
        <div className="transport">
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
    </main>
  );
}
