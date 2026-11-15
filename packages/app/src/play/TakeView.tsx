// A kept take: the play screen with nothing to set. Play plays the take again,
// by its seed; it can be handed over as a MIDI file or as its recipe, the file
// `ensemble replay` reads. Nothing done here changes how the take goes: it is
// a recording, not a setup.

import { recipeText } from "@ensemble/engine";
import { styleById } from "@ensemble/styles";
import { useEffect, useMemo, useState } from "react";
import { download, fileName } from "../download.ts";
import type { Heard, KeptTake } from "../takes.ts";
import { deleteTake, heardAs, renameTake, takesKeptOnDevice } from "../takes.ts";
import { midiOf } from "./band.ts";
import type { Reading } from "./ChordSymbol.tsx";
import type { Call } from "./jam.ts";
import type { Rig } from "./rig.ts";
import { Stage } from "./Stage.tsx";
import { useJam } from "./useJam.ts";

interface Props {
  readonly take: KeptTake;
  readonly rig: Rig;
  readonly reading: Reading;
  readonly read: (reading: Reading) => void;
  /** Start playing as soon as the screen opens: the tap that opened it asked for that. */
  readonly autoplay: boolean;
  /** Called when that has been done, so it happens once. */
  readonly started: () => void;
}

/** Ask first, then forget the take and go back to the library. */
function remove(take: KeptTake): void {
  if (!confirm(`Delete “${take.name || take.recipe.chartName}”? This cannot be undone.`)) return;
  deleteTake(take.id);
  location.replace("#/");
}

export function TakeView(props: Props) {
  const { take } = props;
  const heard = heardAs(take.recipe);
  if (heard) return <TakeStage {...props} heard={heard} />;
  // Kept by another build of the app: a style since removed, or options this engine cannot plan.
  const missing = styleById(take.recipe.style) ? undefined : take.recipe.style;
  return (
    <main className="play">
      <header className="bar-top">
        <a className="back" href="#/" aria-label="Back to the charts">
          ‹<span>Charts</span>
        </a>
        <h1>{take.name || take.recipe.chartName}</h1>
      </header>
      <p className="problem" role="alert">
        This take does not play in this version of Ensemble
        {missing ? `: it was played in a style called “${missing}”, which is no longer here.` : "."}
      </p>
      <div className="setup">
        <div className="tools">
          <button type="button" onClick={() => remove(take)}>
            Delete
          </button>
        </div>
      </div>
    </main>
  );
}

function TakeStage({
  take,
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
  const jam = useJam(rig, call);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as the screen opens
  useEffect(() => {
    if (!autoplay) return;
    jam.play();
    started();
  }, []);

  const [problem, setProblem] = useState<string>();
  const named = take.name.trim() || recipe.chartName;
  const exportMidi = () => {
    setProblem(undefined);
    midiOf(recipe).then(
      (bytes) => download(bytes, "audio/midi", fileName(named, "take", ".mid")),
      () => setProblem("The MIDI file could not be made."),
    );
  };

  return (
    <Stage
      jam={jam}
      call={call}
      chart={heard.chart}
      preview={heard.plan}
      title={named}
      reading={reading}
      read={read}
      before={
        <div className="setup take-setup">
          <label className="take-name">
            <span>Name</span>
            <input
              type="text"
              value={take.name}
              enterKeyHint="done"
              onChange={(e) => renameTake(take.id, e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </label>
          <div className="tools">
            <button type="button" onClick={exportMidi}>
              Export MIDI
            </button>
            <button
              type="button"
              onClick={() =>
                download(
                  recipeText(recipe),
                  "application/json",
                  fileName(named, "take", ".take.json"),
                )
              }
            >
              Export take
            </button>
            <button type="button" onClick={() => remove(take)}>
              Delete
            </button>
          </div>
          {(problem || !takesKeptOnDevice()) && (
            <p className="problem" role="alert">
              {problem ??
                "This browser is not keeping takes, so this one lasts until the page is closed. Export it to keep it."}
            </p>
          )}
        </div>
      }
    />
  );
}
