// The play screen: the chart, who is playing it and how, and the transport.

import type { Key, Seat, StylePack, TakeRecipe } from "@ensemble/engine";
import {
  conventionalKey,
  keyToString,
  parseKey,
  pitchClass,
  plan as planOf,
  SOLO_INSTRUMENTS,
  seatChoice,
  seconds,
} from "@ensemble/engine";
import { STYLES, styleById } from "@ensemble/styles";
import { useEffect, useMemo, useRef, useState } from "react";
import { copyOf } from "../charts.ts";
import { download, fileName } from "../download.ts";
import type { LibraryChart } from "../library.ts";
import { notePlayed } from "../recent.ts";
import type { ChartChoices, Settings } from "../settings.ts";
import type { KeptTake } from "../takes.ts";
import { dayOf, followTake, heardAs, keepTake } from "../takes.ts";
import { midiOf } from "./band.ts";
import type { Call, JamSetup } from "./jam.ts";
import { chartOf, SEAT_ORDER, takeOptions } from "./jam.ts";
import type { Rig } from "./rig.ts";
import { Stage } from "./Stage.tsx";
import { clock } from "./StatusStrip.tsx";
import { useJam } from "./useJam.ts";

interface Props {
  readonly entry: LibraryChart;
  /** The takes kept of this chart, the latest first. */
  readonly takes: readonly KeptTake[];
  readonly rig: Rig;
  readonly settings: Settings;
  readonly change: (settings: Settings) => void;
  /** Start playing as soon as the screen opens: the tap that opened it asked for that. */
  readonly autoplay: boolean;
  /** Called when that has been done, so it happens once. */
  readonly started: () => void;
}

const LENGTHS: readonly (number | null)[] = [2, 3, 5, 10, 15, 20, null];
const SEAT_NAMES: Readonly<Record<Seat, string>> = {
  drums: "Drums",
  bass: "Bass",
  chords: "Chords",
  solo: "Soloist",
};

/** The seats whose instrument a style may offer a choice of. The soloist's has its own list. */
const BAND_SEATS = ["drums", "bass", "chords"] as const;

/**
 * A kept take in a few words: its own name if it was given one, else when it
 * was kept (the time of day for one kept today, since several may have been),
 * and how long it runs.
 */
function takeLabel(take: KeptTake): string {
  const named = take.name.trim();
  const heard = heardAs(take.recipe);
  const kept = new Date(take.kept);
  const today = kept.toDateString() === new Date().toDateString();
  const when = today
    ? kept.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : dayOf(take.kept);
  const what = named && named !== take.recipe.chartName ? named : when;
  return heard ? `${what}, ${clock(seconds(heard.plan))}` : what;
}

/** The twelve keys of a mode, as they are conventionally written. */
const keysOf = (mode: Key["mode"]): Key[] =>
  Array.from({ length: 12 }, (_, pc) => conventionalKey(pc, mode, true));

export function PlayView({ entry, takes, rig, settings, change, autoplay, started }: Props) {
  const choices: ChartChoices = settings.charts[entry.id] ?? {};
  const choose = (patch: ChartChoices) =>
    change({
      ...settings,
      charts: { ...settings.charts, [entry.id]: { ...choices, ...patch } },
    });

  const style: StylePack = styleById(choices.style ?? entry.chart.styleId ?? "") ?? STYLES[0]!;
  const tempo = choices.tempo ?? null;
  // The style's own soloist, unless the player chose another for this chart.
  const chosen = choices.soloInstrument;
  const soloInstrument =
    chosen !== undefined && chosen in SOLO_INSTRUMENTS ? chosen : style.solo.instrument;
  // An arrangement that fits says the chart is meant to be played as written; anything else is a jam.
  const song = choices.song ?? entry.chart.arrangement?.fits === true;
  const setup: JamSetup = useMemo(
    () => ({
      text: entry.text,
      style,
      song,
      minutes: settings.minutes,
      tempo,
      key: choices.key === undefined ? null : parseKey(choices.key),
      band: settings.band,
      soloInstrument,
      instruments: choices.instruments,
    }),
    [
      entry.text,
      style,
      song,
      settings.minutes,
      tempo,
      choices.key,
      settings.band,
      soloInstrument,
      choices.instruments,
    ],
  );

  const chart = useMemo(() => chartOf(setup.text, setup.key), [setup.text, setup.key]);
  const call: Call = useMemo(
    () => ({
      name: chart.title,
      text: setup.text,
      style: setup.style,
      options: takeOptions(setup),
    }),
    [chart, setup],
  );
  // The take kept from this screen, and the seed that makes it that jam and no other: while that
  // jam is the one playing, or the last played, every change to it is the kept take's too.
  const [kept, setKept] = useState<{
    readonly id: string;
    readonly seed: TakeRecipe["options"]["seed"];
  }>();
  const following = useRef(kept);
  following.current = kept;
  const band = useJam(rig, call, (take) => {
    const to = following.current;
    if (to && take.options.seed === to.seed) followTake(to.id, take);
  });
  // A press of play here is what puts the chart at the top of the home screen.
  const jam = {
    ...band,
    play: () => {
      notePlayed(`#/chart/${entry.id}`);
      band.play();
    },
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as the screen opens
  useEffect(() => {
    if (!autoplay) return;
    jam.play();
    started();
  }, []);

  // What play would start: the tempo shown before it is pressed is the one it would play at.
  const preview = useMemo(() => planOf(chart, call.style, call.options), [chart, call]);
  const shownTempo = Math.round(preview.tempo);
  const take = jam.phase === "loading" ? undefined : jam.take;
  const isKept = take !== undefined && kept?.seed === take.options.seed;
  const idle = jam.phase === "idle";

  const [problem, setProblem] = useState<string>();
  /** Hand the take over as a MIDI file, named for the chart: the whole band as it played, whoever was silenced. */
  const exportMidi = (recipe: TakeRecipe) => {
    setProblem(undefined);
    midiOf(recipe).then(
      (bytes) => download(bytes, "audio/midi", fileName(recipe.chartName, "take", ".mid")),
      () => setProblem("The MIDI file could not be made."),
    );
  };
  // An instrument is chosen only where the style has more than one for the seat, and the seat is in.
  const chosenFor = choices.instruments;
  const offered = BAND_SEATS.flatMap((seat) => {
    const all = style.sound.choices?.[seat];
    return all && settings.band[seat] ? [[seat, all] as const] : [];
  });

  // What is heard is who is in the take and still switched on. A seat switched off while the
  // band plays is its channel taken down, and its part goes on underneath, so switching it
  // on again brings it back in time. The take is not changed: kept or exported, it is what
  // the whole band played.
  useEffect(() => {
    for (const seat of jam.seats ?? []) rig.hush(seat, !settings.band[seat]);
  }, [rig, jam.seats, settings.band]);

  return (
    <Stage
      jam={jam}
      call={call}
      chart={chart}
      preview={preview}
      reading={settings.reading}
      read={(reading) => change({ ...settings, reading })}
      side={
        entry.own ? (
          <a className="edit-link" href={`#/edit/${entry.id}`}>
            Edit
          </a>
        ) : (
          // A built-in stays as it ships; the player changes a copy of their own.
          <button
            type="button"
            className="edit-link"
            onClick={() => {
              location.hash = `#/edit/${copyOf(entry.text)}`;
            }}
          >
            Edit a copy
          </button>
        )
      }
      problem={problem}
      aside={
        take && (
          <>
            <button
              type="button"
              className="keep"
              disabled={isKept}
              onClick={() => setKept({ id: keepTake(take, entry.id), seed: take.options.seed })}
            >
              {isKept ? "Kept" : "Keep"}
            </button>
            {/* The take just played, or still playing, as a file: no need to keep it first. */}
            <button type="button" className="keep" onClick={() => exportMidi(take)}>
              Export MIDI
            </button>
          </>
        )
      }
      before={
        <>
          <div className="setup">
            <label className="field pick">
              <span>Style</span>
              <select
                value={style.id}
                onChange={(e) => {
                  // Another style brings its own band: instruments chosen for the last one go.
                  const { soloInstrument: _, instruments: __, ...rest } = choices;
                  change({
                    ...settings,
                    charts: { ...settings.charts, [entry.id]: { ...rest, style: e.target.value } },
                  });
                }}
              >
                {STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field pick">
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
            <div className="field tempo">
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
            <label className="field pick">
              <span>Length</span>
              <select
                value={song ? "song" : (settings.minutes ?? "open")}
                onChange={(e) => {
                  const { value } = e.target;
                  // The song is this chart's choice; a length is every chart's, and undoes it here.
                  const charts = {
                    ...settings.charts,
                    [entry.id]: { ...choices, song: value === "song" },
                  };
                  change(
                    value === "song"
                      ? { ...settings, charts }
                      : { ...settings, charts, minutes: value === "open" ? null : Number(value) },
                  );
                }}
              >
                <option value="song">The song, once through</option>
                {LENGTHS.map((minutes) => (
                  <option key={minutes ?? "open"} value={minutes ?? "open"}>
                    {minutes === null ? "Until I stop it" : `About ${minutes} min`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {/* The takes kept of this chart: performances of it, so this is where they are found. */}
          {takes.length > 0 && (
            <nav className="kept" aria-label="Kept takes of this chart">
              <span>Kept takes</span>
              <ul>
                {takes.map((kept) => (
                  <li key={kept.id}>
                    <a href={`#/take/${kept.id}`}>{takeLabel(kept)}</a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </>
      }
      band={
        <div className="band">
          {/* What a seat is played on is settled before play, so it is offered only then: each
              choice over the row of seats, named for its own. */}
          {idle && (offered.length > 0 || settings.band.solo) && (
            <div className="band-picks">
              {offered.map(([seat, choices]) => (
                <label key={seat} className="field pick">
                  <span>{SEAT_NAMES[seat]} played on</span>
                  <select
                    value={seatChoice(style, seat, chosenFor).pack}
                    onChange={(e) =>
                      choose({ instruments: { ...chosenFor, [seat]: e.target.value } })
                    }
                  >
                    {choices.map((choice) => (
                      <option key={choice.pack} value={choice.pack}>
                        {choice.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {settings.band.solo && (
                <label className="field pick">
                  <span>Soloist plays</span>
                  <select
                    value={soloInstrument}
                    onChange={(e) => choose({ soloInstrument: e.target.value })}
                  >
                    {Object.entries(SOLO_INSTRUMENTS).map(([id, instrument]) => (
                      <option key={id} value={id}>
                        {instrument.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          <fieldset className="seats" aria-label="Band">
            {SEAT_ORDER.map((seat) => {
              // Switched on while the band plays a take it is not in: there is no part to bring in,
              // so the button says when it will be heard.
              const waiting = jam.seats !== undefined && !jam.seats.includes(seat);
              return (
                <button
                  key={seat}
                  type="button"
                  className={waiting && settings.band[seat] ? "next" : undefined}
                  aria-pressed={settings.band[seat]}
                  onClick={() =>
                    change({
                      ...settings,
                      band: { ...settings.band, [seat]: !settings.band[seat] },
                    })
                  }
                >
                  {SEAT_NAMES[seat]}
                  {/* The space is for whoever hears the button read out. */}
                  {waiting && settings.band[seat] && <small> next time</small>}
                </button>
              );
            })}
          </fieldset>
        </div>
      }
    />
  );
}
