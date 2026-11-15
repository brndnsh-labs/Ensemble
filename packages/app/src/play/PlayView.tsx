// The play screen: the chart, who is playing it and how, and the transport.

import type { Key, Seat, StylePack } from "@ensemble/engine";
import {
  conventionalKey,
  keyToString,
  parseKey,
  pitchClass,
  plan as planOf,
  SOLO_INSTRUMENTS,
} from "@ensemble/engine";
import { STYLES, styleById } from "@ensemble/styles";
import { useEffect, useMemo, useState } from "react";
import type { LibraryChart } from "../library.ts";
import type { ChartChoices, Settings } from "../settings.ts";
import type { Playhead } from "./ChartView.tsx";
import { ChartView } from "./ChartView.tsx";
import type { Reading } from "./ChordSymbol.tsx";
import type { JamSetup } from "./jam.ts";
import { chartOf, nextChange, SEAT_ORDER, takeOptions } from "./jam.ts";
import { pageBarOf } from "./page.ts";
import type { Rig } from "./rig.ts";
import { StatusStrip } from "./StatusStrip.tsx";
import { useJam } from "./useJam.ts";

interface Props {
  readonly entry: LibraryChart;
  readonly rig: Rig;
  readonly settings: Settings;
  readonly change: (settings: Settings) => void;
  /** Start playing as soon as the screen opens: the tap that opened it asked for that. */
  readonly autoplay: boolean;
  /** Called when that has been done, so it happens once. */
  readonly started: () => void;
}

const LENGTHS: readonly (number | null)[] = [2, 3, 5, 10, 15, 20, null];
const READINGS: readonly Reading[] = ["names", "numerals", "both"];
/** Each way of reading shown by example, and said in full for a screen reader. */
const READING_NAMES: Readonly<Record<Reading, readonly [shown: string, said: string]>> = {
  names: ["C7", "Chord names"],
  numerals: ["V7", "Numerals"],
  both: ["Both", "Names with numerals under them"],
};
const SEAT_NAMES: Readonly<Record<Seat, string>> = {
  drums: "Drums",
  bass: "Bass",
  chords: "Chords",
  solo: "Soloist",
};

/** The twelve keys of a mode, as they are conventionally written. */
const keysOf = (mode: Key["mode"]): Key[] =>
  Array.from({ length: 12 }, (_, pc) => conventionalKey(pc, mode, true));

export function PlayView({ entry, rig, settings, change, autoplay, started }: Props) {
  const choices: ChartChoices = settings.charts[entry.id] ?? {};
  const choose = (patch: ChartChoices) =>
    change({
      ...settings,
      charts: { ...settings.charts, [entry.id]: { ...choices, ...patch } },
    });
  const [focus, setFocus] = useState(false);

  const style: StylePack = styleById(choices.style ?? entry.chart.styleId ?? "") ?? STYLES[0]!;
  const tempo = choices.tempo ?? null;
  const setup: Omit<JamSetup, "seed"> = useMemo(
    () => ({
      text: entry.text,
      style,
      minutes: settings.minutes,
      tempo,
      key: choices.key === undefined ? null : parseKey(choices.key),
      band: settings.band,
      soloInstrument: settings.soloInstrument,
    }),
    [
      entry.text,
      style,
      settings.minutes,
      tempo,
      choices.key,
      settings.band,
      settings.soloInstrument,
    ],
  );

  const jam = useJam(rig, setup);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as the screen opens
  useEffect(() => {
    if (!autoplay) return;
    jam.play();
    started();
  }, []);

  const chart = useMemo(() => chartOf(setup), [setup]);
  // What play would start, to show its length and shape before it is pressed.
  const preview = useMemo(
    () => planOf(chart, setup.style, takeOptions({ ...setup, key: null, seed: 0 })),
    [chart, setup],
  );
  const playing = jam.phase === "playing";
  const plan = playing && jam.take ? jam.take.plan : preview;
  const shown = playing && jam.take ? jam.take.chart : chart;

  let playhead: Playhead | undefined;
  if (playing && jam.place) {
    const next = nextChange(plan, jam.place);
    const nextBar = next && pageBarOf(next.bar);
    playhead = {
      bar: pageBarOf(jam.place.bar) ?? "",
      ...(next && nextBar ? { next: { bar: nextBar, at: next.at } } : {}),
    };
  }

  const shownTempo = Math.round(plan.tempo);
  const soloist = SOLO_INSTRUMENTS[settings.soloInstrument]?.name;

  return (
    <main className={`play${playing ? " playing" : ""}`}>
      <header className="bar-top">
        <a className="back" href="#/" aria-label="Back to the charts">
          ‹<span>Charts</span>
        </a>
        <h1>{shown.title}</h1>
        <fieldset className="reading" aria-label="Show chords as">
          {READINGS.map((reading) => (
            <button
              key={reading}
              type="button"
              aria-pressed={settings.reading === reading}
              aria-label={READING_NAMES[reading][1]}
              onClick={() => change({ ...settings, reading })}
            >
              {READING_NAMES[reading][0]}
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
      </header>

      {playing ? (
        <p className="summary">
          {style.name} in {keyToString(shown.key)}, {shownTempo} bpm
        </p>
      ) : (
        <div className="setup">
          <label>
            <span>Style</span>
            <select value={style.id} onChange={(e) => choose({ style: e.target.value })}>
              {STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Key</span>
            <select
              value={setup.key ? keyToString(setup.key) : ""}
              onChange={(e) => {
                const { key: _, ...rest } = choices;
                change({
                  ...settings,
                  charts: {
                    ...settings.charts,
                    [entry.id]: e.target.value ? { ...rest, key: e.target.value } : rest,
                  },
                });
              }}
            >
              <option value="">{keyToString(entry.chart.key)} (written)</option>
              {keysOf(entry.chart.key.mode)
                .filter((k) => pitchClass(k.tonic) !== pitchClass(entry.chart.key.tonic))
                .map((k) => (
                  <option key={keyToString(k)} value={keyToString(k)}>
                    {keyToString(k)}
                  </option>
                ))}
            </select>
          </label>
          <div className="field">
            <span id="tempo-label">Tempo</span>
            <fieldset className="stepper" aria-labelledby="tempo-label">
              <button
                type="button"
                aria-label="Slower"
                onClick={() => choose({ tempo: Math.max(style.tempo.min, shownTempo - 4) })}
              >
                −
              </button>
              <output>{shownTempo}</output>
              <button
                type="button"
                aria-label="Faster"
                onClick={() => choose({ tempo: Math.min(style.tempo.max, shownTempo + 4) })}
              >
                +
              </button>
            </fieldset>
          </div>
          <label>
            <span>Length</span>
            <select
              value={settings.minutes ?? "open"}
              onChange={(e) =>
                change({
                  ...settings,
                  minutes: e.target.value === "open" ? null : Number(e.target.value),
                })
              }
            >
              {LENGTHS.map((minutes) => (
                <option key={minutes ?? "open"} value={minutes ?? "open"}>
                  {minutes === null ? "Until I stop it" : `About ${minutes} min`}
                </option>
              ))}
            </select>
          </label>
          <div className="field band">
            <span id="band-label">Band</span>
            <fieldset className="seats" aria-labelledby="band-label">
              {SEAT_ORDER.map((seat) => (
                <button
                  key={seat}
                  type="button"
                  aria-pressed={settings.band[seat]}
                  onClick={() =>
                    change({
                      ...settings,
                      band: { ...settings.band, [seat]: !settings.band[seat] },
                    })
                  }
                >
                  {SEAT_NAMES[seat]}
                </button>
              ))}
              {settings.band.solo && (
                <select
                  aria-label="The soloist's instrument"
                  value={settings.soloInstrument}
                  onChange={(e) => change({ ...settings, soloInstrument: e.target.value })}
                >
                  {Object.entries(SOLO_INSTRUMENTS).map(([id, instrument]) => (
                    <option key={id} value={id}>
                      {instrument.name}
                    </option>
                  ))}
                </select>
              )}
            </fieldset>
          </div>
        </div>
      )}

      <ChartView chart={shown} reading={settings.reading} playhead={playhead} focus={focus} />

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
          soloist={settings.band.solo ? soloist : undefined}
        />
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
