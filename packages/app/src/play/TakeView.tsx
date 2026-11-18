// A kept take: the play screen with nothing to set. Play plays the take again,
// by its seed; it can be handed over as a MIDI file or as its recipe, the file
// `ensemble replay` reads. Nothing done here changes how the take goes: it is
// a recording, not a setup.

import type { Seat } from "@ensemble/engine";
import { keyToString, recipeText, seconds } from "@ensemble/engine";
import { styleById } from "@ensemble/styles";
import { useEffect, useMemo, useState } from "react";
import { swap, TAKES } from "../address.ts";
import { download, fileName } from "../download.ts";
import type { LibraryChart } from "../library.ts";
import { notePlayed } from "../recent.ts";
import type { Place } from "../Trail.tsx";
import { Trail } from "../Trail.tsx";
import type { Heard, KeptTake } from "../takes.ts";
import {
  dayOf,
  deleteTake,
  heardAs,
  ownName,
  renameTake,
  takeName,
  takesKeptOnDevice,
} from "../takes.ts";
import { midiOf } from "./band.ts";
import type { Reading } from "./ChordSymbol.tsx";
import type { Call } from "./jam.ts";
import { SEAT_ORDER, seatsOf } from "./jam.ts";
import type { Rig } from "./rig.ts";
import type { Seated } from "./Stage.tsx";
import { playedOn, Stage, soloWords } from "./Stage.tsx";
import { clock } from "./StatusStrip.tsx";
import { useJam } from "./useJam.ts";

interface Props {
  readonly take: KeptTake;
  /** The chart it is a take of, if that is still here: the take's screen has a way to it. */
  readonly chart: LibraryChart | undefined;
  readonly rig: Rig;
  readonly reading: Reading;
  readonly read: (reading: Reading) => void;
  /** Start playing as soon as the screen opens: the tap that opened it asked for that. */
  readonly autoplay: boolean;
  /** Called when that has been done, so it happens once. */
  readonly started: () => void;
}

/** The place above every take: home's list of them, where a take is found whether or not its chart is still here. */
const KEPT: Place = { href: TAKES, name: "Takes" };

/** Ask first, then forget the take and go to the list it was in. */
function remove(take: KeptTake): void {
  if (!confirm(`Delete “${take.name || take.recipe.chartName}”? This cannot be undone.`)) return;
  deleteTake(take.id);
  swap(TAKES);
}

/** The way from a take to the chart it is a take of: at the end of the top row, where a chart's screen has Edit. */
const chartLink = (chart: LibraryChart | undefined) =>
  chart && (
    <a className="edit-link" href={`#/chart/${chart.id}`}>
      Open its chart
    </a>
  );

export function TakeView(props: Props) {
  const { take, chart } = props;
  const heard = heardAs(take.recipe);
  if (heard) return <TakeStage {...props} heard={heard} />;
  // Kept by another build of the app: a style since removed, or options this engine cannot plan.
  const missing = styleById(take.recipe.style) ? undefined : take.recipe.style;
  return (
    <main className="play">
      <header className="bar-top">
        <Trail place={KEPT} />
        {chartLink(chart)}
      </header>
      <h1 className="chart-title">{take.name || take.recipe.chartName}</h1>
      <p className="problem" role="alert">
        This take does not play in this version of Ensemble
        {missing ? `: it was played in a style called “${missing}”, which is no longer here.` : "."}
      </p>
      <div className="tools take-gone">
        <button type="button" className="danger" onClick={() => remove(take)}>
          Delete
        </button>
      </div>
    </main>
  );
}

function TakeStage({
  take,
  chart,
  rig,
  reading,
  read,
  autoplay,
  started,
  heard,
}: Props & { heard: Heard }) {
  const { recipe } = take;
  const call: Call = useMemo(
    () => ({
      name: recipe.chartName,
      text: recipe.chartText,
      style: heard.style,
      options: recipe.options,
    }),
    [recipe, heard],
  );
  const band = useJam(rig, call);
  // A press of play here is what puts the take at the top of the home screen.
  const jam = {
    ...band,
    play: () => {
      notePlayed(`#/take/${take.id}`);
      band.play();
    },
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as the screen opens
  useEffect(() => {
    if (!autoplay) return;
    jam.play();
    started();
  }, []);

  // The seats silenced here. A take is what it is: who plays in it is settled, and a press
  // only takes a seat's channel down or brings it back, now or at the next Play.
  const [silenced, setSilenced] = useState<ReadonlySet<Seat>>(new Set());
  useEffect(() => {
    for (const seat of jam.seats ?? []) rig.hush(seat, silenced.has(seat));
  }, [rig, jam.seats, silenced]);
  const inTake = seatsOf(recipe.options);
  const players: Seated[] = SEAT_ORDER.map((seat) =>
    inTake.includes(seat)
      ? {
          seat,
          on: playedOn(heard.style, recipe.options, seat),
          state: silenced.has(seat) ? "out" : "in",
          press: () => {
            const next = new Set(silenced);
            if (!next.delete(seat)) next.add(seat);
            setSilenced(next);
          },
        }
      : { seat, on: playedOn(heard.style, recipe.options, seat), state: "absent" },
  );

  const [problem, setProblem] = useState<string>();
  /** The name being typed, while the take is being renamed: it starts as the take's own, empty if it has none. */
  const [naming, setNaming] = useState<string>();
  const named = take.name.trim() || recipe.chartName;
  const exportMidi = () => {
    setProblem(undefined);
    midiOf(recipe).then(
      (bytes) => download(bytes, "audio/midi", fileName(named, "take", ".mid")),
      () => setProblem("The MIDI file could not be made."),
    );
  };

  const { plan } = heard;
  return (
    <Stage
      jam={jam}
      call={call}
      chart={heard.chart}
      preview={plan}
      title={named}
      place={KEPT}
      side={chartLink(chart)}
      reading={reading}
      read={read}
      // What was played, said and not offered: a take is a recording, not a setup.
      sentence={
        <p className="sentence told take-told">
          A take kept {dayOf(take.kept)}: {heard.style.name} in {keyToString(heard.chart.key)},{" "}
          {Math.round(plan.tempo)} bpm, {clock(seconds(plan))}
          {soloWords(recipe.options) && `, ${soloWords(recipe.options)}`}
        </p>
      }
      players={players}
      problem={
        problem ??
        (takesKeptOnDevice()
          ? undefined
          : "This browser is not keeping takes, so this one lasts until the page is closed. Export it to keep it.")
      }
      more={(close) => (
        <>
          <li>
            {naming !== undefined ? (
              <label className="field menu-name">
                <span>Name</span>
                <input
                  type="text"
                  value={naming}
                  // With no name of its own, what it is called is said where one would be typed.
                  placeholder={takeName(take)}
                  enterKeyHint="done"
                  // biome-ignore lint/a11y/noAutofocus: the box appears because Rename was pressed, to be typed in
                  autoFocus
                  onChange={(e) => {
                    setNaming(e.target.value);
                    renameTake(take.id, e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    setNaming(undefined);
                  }}
                  onBlur={() => setNaming(undefined)}
                />
              </label>
            ) : (
              <button type="button" className="menu-line" onClick={() => setNaming(ownName(take))}>
                <span>Rename</span>
                <small>Called “{takeName(take)}”</small>
              </button>
            )}
          </li>
          <li>
            <button
              className="menu-line"
              type="button"
              onClick={() => {
                exportMidi();
                close();
              }}
            >
              <span>Export MIDI</span>
              <small>This take, the whole band</small>
            </button>
          </li>
          <li>
            <button
              className="menu-line"
              type="button"
              onClick={() => {
                download(
                  recipeText(recipe),
                  "application/json",
                  fileName(named, "take", ".take.json"),
                );
                close();
              }}
            >
              <span>Export take</span>
              <small>Its recipe, the file the command line's replay reads</small>
            </button>
          </li>
          <li>
            <button type="button" className="menu-line danger" onClick={() => remove(take)}>
              <span>Delete this take</span>
            </button>
          </li>
        </>
      )}
    />
  );
}
