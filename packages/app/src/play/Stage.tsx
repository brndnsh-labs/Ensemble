// What the play screen and a kept take's screen share: the chart with the
// playhead on it, how it is read, the status strip and the transport. Each
// screen brings what there is to do before the band starts: set it up, or
// name and export the take.

import type { Chart, Plan } from "@ensemble/engine";
import { keyToString, planBar, SOLO_INSTRUMENTS } from "@ensemble/engine";
import type { ReactNode } from "react";
import { useState } from "react";
import type { Playhead } from "./ChartView.tsx";
import { ChartView } from "./ChartView.tsx";
import type { Reading } from "./ChordSymbol.tsx";
import type { Call } from "./jam.ts";
import { nextChange } from "./jam.ts";
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
  /** Beside the transport, and quieter than it. */
  readonly aside?: ReactNode;
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
  const { jam, call, chart, preview, title, reading, read, side, before, aside } = props;
  const [focus, setFocus] = useState(false);

  const playing = jam.phase === "playing";
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
    // On the last pass the final bar is the ending the band will play, not the turnaround written there.
    const last = bar.lastPass || bar.kind === "tail" ? plan.bars.find((b) => b.ending) : undefined;
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

  const { options, style } = call;
  const soloist = options.solo
    ? SOLO_INSTRUMENTS[options.soloInstrument ?? style.solo.instrument]?.name
    : undefined;

  return (
    <main className={`play${playing ? " playing" : ""}`}>
      <header className="bar-top">
        <a className="back" href="#/" aria-label="Back to the charts">
          ‹<span>Charts</span>
        </a>
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

      {!playing && before}

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
          soloist={soloist}
        />
        {aside}
        {jam.phase === "idle" ? (
          <button type="button" className="go" onClick={jam.play}>
            Play
          </button>
        ) : jam.canFinish ? (
          // One press brings the band to an ending; the button then stops it dead.
          <button type="button" className="go stop" onClick={jam.finish}>
            Finish
          </button>
        ) : (
          <button type="button" className="go stop" onClick={jam.stop}>
            {jam.phase === "loading" ? "Loading" : "Stop"}
          </button>
        )}
      </footer>
    </main>
  );
}
