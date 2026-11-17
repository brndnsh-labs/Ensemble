// A chart's screen: the chart, how it is to be played in a line whose every
// part is pressed to change it, the band and the transport. What is rarely
// wanted is behind More. Edit puts the screen in the editing mode, at its own
// address (`#/edit/<id>`): the same screen, the chart pressed to change it.

import type { Key, Seat, StylePack, TakeRecipe } from "@ensemble/engine";
import {
  conventionalKey,
  keyToString,
  parseKey,
  pitchClass,
  plan as planOf,
  SOLO_INSTRUMENTS,
  seatChoice,
  tempoRange,
} from "@ensemble/engine";
import { STYLES, styleById } from "@ensemble/styles";
import { useEffect, useMemo, useRef, useState } from "react";
import { go, swap } from "../address.ts";
import { copyOf, deleteChart, duplicateChart, renameChart } from "../charts.ts";
import { download, fileName } from "../download.ts";
import { useEditor } from "../edit/useEditor.tsx";
import type { LibraryChart } from "../library.ts";
import { instrument } from "../posters.ts";
import { notePlayed } from "../recent.ts";
import { takeRow } from "../rows.tsx";
import type { ChartChoices, Settings } from "../settings.ts";
import { placeOf } from "../Trail.tsx";
import type { KeptTake } from "../takes.ts";
import { dayOf, followTake, keepTake } from "../takes.ts";
import { midiOf } from "./band.ts";
import type { Call, JamSetup } from "./jam.ts";
import { chartOf, SEAT_ORDER, takeOptions, tempoFor } from "./jam.ts";
import type { Rig } from "./rig.ts";
import { Sheet } from "./Sheet.tsx";
import type { Seated } from "./Stage.tsx";
import { playedOn, Stage } from "./Stage.tsx";
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
  /** What the address asks for: the chart to play, or the chart with the pencil down. */
  readonly mode: "play" | "edit";
  /** This chart is the player's copy of a built-in, made by the press that opened it. */
  readonly copied: boolean;
  /** A copy of a built-in has been made, to open in the mode; undefined once that has been said. */
  readonly madeCopy: (id: string | undefined) => void;
}

const LENGTHS: readonly (number | null)[] = [2, 3, 5, 10, 15, 20, null];
const SEAT_NAMES: Readonly<Record<Seat, string>> = {
  drums: "Drums",
  bass: "Bass",
  chords: "Chords",
  solo: "Soloist",
};
/** How far one press of minus or plus moves the tempo. */
const TEMPO_STEP = 4;

/** The seats whose instrument a style may offer a choice of. The soloist's has its own list. */
const BAND_SEATS = ["drums", "bass", "chords"] as const;

/** A kept take in a few words: its own name if it was given one, else when it was kept. */
function takeName(take: KeptTake): string {
  const named = take.name.trim();
  if (named && named !== take.recipe.chartName) return named;
  const kept = new Date(take.kept);
  const today = kept.toDateString() === new Date().toDateString();
  // The time of day for one kept today, since several may have been.
  return `Kept take, ${today ? kept.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : dayOf(take.kept)}`;
}

/** The twelve keys of a mode, as they are conventionally written, from C. */
const keysOf = (mode: Key["mode"]): Key[] =>
  Array.from({ length: 12 }, (_, pc) => conventionalKey(pc, mode, true));

/** How long, as the line says it. */
const lengthWords = (song: boolean, minutes: number | null): string =>
  song ? "the song, once through" : minutes === null ? "until I stop it" : `about ${minutes} min`;

type Part = "style" | "key" | "tempo" | "length";

export function PlayView(props: Props) {
  const { entry, takes, rig, settings, change, autoplay, started, copied, madeCopy } = props;
  const choices: ChartChoices = settings.charts[entry.id] ?? {};
  const choose = (patch: ChartChoices) =>
    change({
      ...settings,
      charts: { ...settings.charts, [entry.id]: { ...choices, ...patch } },
    });

  const style: StylePack = styleById(choices.style ?? entry.chart.styleId ?? "") ?? STYLES[0]!;
  const tempo = tempoFor(entry.chart, style, choices.tempo);
  // The style's own soloist, unless the player chose another for this chart.
  const chosen = choices.soloInstrument;
  const soloInstrument =
    chosen !== undefined && chosen in SOLO_INSTRUMENTS ? chosen : style.solo.instrument;
  // The pencil: down where the address says so, for a chart of the player's own. Done takes it up
  // in the press, before the address has caught up with the browser's history.
  const [asked, setAsked] = useState(props.mode);
  const [leaving, setLeaving] = useState(false);
  if (asked !== props.mode) {
    setAsked(props.mode);
    setLeaving(false);
  }
  const editing = props.mode === "edit" && entry.own && !leaving;
  /** The mode was entered from this screen with Edit: Done goes back to that entry of the history, rather than piling up another. */
  const pushed = useRef(false);
  const editor = useEditor({
    entry,
    on: editing,
    style,
    copied,
    remove: () => remove(),
  });

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
    if (copied) madeCopy(undefined);
    if (!autoplay) return;
    jam.play();
    started();
  }, []);

  // A built-in is not edited in place: an address that asks for that shows the chart to play.
  useEffect(() => {
    if (props.mode === "edit" && !entry.own) swap(`#/chart/${entry.id}`);
  }, [props.mode, entry]);

  // The band stops when the pencil is picked up, however the mode was reached.
  // biome-ignore lint/correctness/useExhaustiveDependencies: when the mode is entered
  useEffect(() => {
    if (editing && band.phase !== "idle") band.stop();
  }, [editing]);

  const enter = () => {
    pushed.current = true;
    go(`#/edit/${entry.id}`);
  };
  /** Put the pencil down: everything typed is written first. */
  const leave = () => {
    editor.finish();
    setLeaving(true);
    if (pushed.current) {
      pushed.current = false;
      history.back();
    } else swap(`#/chart/${entry.id}`);
  };
  /** Play, from the mode: the band starts once the screen is drawn from the chart as it now stands. */
  const [startSoon, setStartSoon] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: when the mode has been left to play
  useEffect(() => {
    if (!startSoon || editing) return;
    setStartSoon(false);
    jam.play();
  }, [startSoon, editing]);

  /** The player's copy of a built-in, opened in the mode and played as the built-in was set up to be. */
  const editCopy = () => {
    const id = copyOf(entry.text);
    if (!settings.charts[id])
      change({ ...settings, charts: { ...settings.charts, [id]: choices } });
    madeCopy(id);
    go(`#/edit/${id}`);
  };

  function remove() {
    if (!confirm(`Delete “${entry.chart.title}”? This cannot be undone. Takes kept from it stay.`))
      return;
    editor.forget();
    swap(placeOf(entry.chart).href);
    deleteChart(entry.id);
  }

  // What play would start: the tempo shown before it is pressed is the one it would play at.
  const preview = useMemo(() => planOf(chart, call.style, call.options), [chart, call]);
  const shownTempo = Math.round(preview.tempo);
  const take = jam.phase === "loading" ? undefined : jam.take;
  const isKept = take !== undefined && kept?.seed === take.options.seed;
  const idle = jam.phase === "idle";

  /** The sheet open over the screen, if one is: a part of the line being changed. */
  const [open, setOpen] = useState<Part>();
  const close = () => setOpen(undefined);
  /** The new title being typed, while the chart is being renamed in More. */
  const [renaming, setRenaming] = useState<string>();

  const [problem, setProblem] = useState<string>();
  /** Hand the take over as a MIDI file, named for the chart: the whole band as it played, whoever was silenced. */
  const exportMidi = (recipe: TakeRecipe) => {
    setProblem(undefined);
    midiOf(recipe).then(
      (bytes) => download(bytes, "audio/midi", fileName(recipe.chartName, "take", ".mid")),
      () => setProblem("The MIDI file could not be made."),
    );
  };
  // An instrument is chosen only where the style has more than one for the seat.
  const chosenFor = choices.instruments;
  const offered = BAND_SEATS.flatMap((seat) => {
    const all = style.sound.choices?.[seat];
    return all ? [[seat, all] as const] : [];
  });

  // What is heard is who is in the take and still switched on. A seat switched off while the
  // band plays is its channel taken down, and its part goes on underneath, so switching it
  // on again brings it back in time. The take is not changed: kept or exported, it is what
  // the whole band played.
  useEffect(() => {
    for (const seat of jam.seats ?? []) rig.hush(seat, !settings.band[seat]);
  }, [rig, jam.seats, settings.band]);

  const options = !idle && jam.take ? jam.take.options : call.options;
  const players: Seated[] = SEAT_ORDER.map((seat) => {
    const on = settings.band[seat];
    // Switched on while the band plays a take it is not in: there is no part to bring in, so
    // the block says when it will be heard.
    const inTake = jam.seats === undefined || jam.seats.includes(seat);
    return {
      seat,
      on: playedOn(style, options, seat),
      state: !on ? "out" : inTake ? "in" : "next",
      press: () => change({ ...settings, band: { ...settings.band, [seat]: !on } }),
    };
  });

  // The tempo without one set: what "back" goes to.
  const unset = tempoFor(entry.chart, style, undefined);
  const written = entry.chart.tempo;
  // The style's limits in the chart's meter: a slow blues in twelve goes under the shuffle's floor.
  const range = tempoRange(style, entry.chart.meter);
  const usual = unset ?? written ?? range.default;
  const inLimits = (bpm: number) => Math.min(range.max, Math.max(range.min, bpm));

  const writtenKey = entry.chart.key;
  const keyShown = keyToString(chart.key);
  const length = lengthWords(song, settings.minutes);

  /** A part of the line: pressed to change it before Play, a plain word while the band plays. */
  const part = (which: Part, label: string, shown: string) =>
    idle ? (
      <button type="button" className="part" aria-haspopup="dialog" onClick={() => setOpen(which)}>
        <span className="vh">{label}: </span>
        {shown}
      </button>
    ) : (
      <b className="part">{shown}</b>
    );

  // A chart counted in anything but four says so: it is what the tempo counts.
  const { beats, unit } = entry.chart.meter;
  const meterShown = beats === 4 && unit === 4 ? "" : `${beats}/${unit}`;

  const sentence = (
    <p className={`sentence${idle ? "" : " told"}`}>
      {part("style", "Style", style.name)} in {part("key", "Key", keyShown)}
      {meterShown && `, ${meterShown},`} at {part("tempo", "Tempo", `${shownTempo} bpm`)},{" "}
      {part("length", "Length", length)}
      {!idle && <span className="vh"> (changed when the band is stopped)</span>}
    </p>
  );

  return (
    <>
      <Stage
        jam={
          editing
            ? {
                ...jam,
                // Inside the press, so the browser lets the band start once the mode is left.
                play: () => {
                  leave();
                  rig.wake();
                  setStartSoon(true);
                },
              }
            : jam
        }
        editor={editing ? editor : undefined}
        call={call}
        chart={chart}
        preview={preview}
        reading={settings.reading}
        read={(reading) => change({ ...settings, reading })}
        // Under the style the chart was written for, whatever style it is being played in.
        place={placeOf(entry.chart)}
        side={
          entry.own ? (
            // One button, in one place: Edit, and Done while the pencil is down.
            <button
              type="button"
              className={`edit-link edit-toggle${editing ? " done" : ""}`}
              onClick={editing ? leave : enter}
            >
              {editing ? "Done" : "Edit"}
            </button>
          ) : (
            // A built-in stays as it ships; the player changes a copy of their own.
            <button type="button" className="edit-link" onClick={editCopy}>
              Edit a copy
            </button>
          )
        }
        sentence={sentence}
        players={players}
        problem={problem}
        keep={
          // There from the press of Play, so Stop does not move when the take arrives.
          (take || !idle) && (
            <button
              type="button"
              className="keep"
              disabled={!take || isKept}
              onClick={() =>
                take && setKept({ id: keepTake(take, entry.id), seed: take.options.seed })
              }
            >
              {isKept ? "Kept" : "Keep"}
            </button>
          )
        }
        more={(closeMore) => (
          <>
            {/* What the band plays on, settled before Play. */}
            {idle &&
              offered.map(([seat, all]) => (
                <li key={seat}>
                  <label className="menu-pick">
                    <span>{SEAT_NAMES[seat]} played on</span>
                    <small>{instrument(seatChoice(style, seat, chosenFor).pack)}</small>
                    <select
                      value={seatChoice(style, seat, chosenFor).pack}
                      onChange={(e) =>
                        choose({ instruments: { ...chosenFor, [seat]: e.target.value } })
                      }
                    >
                      {all.map((choice) => (
                        <option key={choice.pack} value={choice.pack}>
                          {choice.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            {idle && (
              <li>
                <label className="menu-pick">
                  <span>Soloist plays</span>
                  <small>
                    {SOLO_INSTRUMENTS[soloInstrument]?.name}
                    {settings.band.solo ? "" : " (the soloist sits out)"}
                  </small>
                  <select
                    value={soloInstrument}
                    onChange={(e) => choose({ soloInstrument: e.target.value })}
                  >
                    {Object.entries(SOLO_INSTRUMENTS).map(([id, played]) => (
                      <option key={id} value={id}>
                        {played.name}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            )}
            {/* The takes kept of this chart: performances of it, so this is where they are found. */}
            {takes.map((one) => {
              const row = takeRow(one);
              return (
                <li key={one.id}>
                  <a className="menu-line" href={`#/take/${one.id}`}>
                    <span>{takeName(one)}</span>
                    <small>{row.short ? `${row.short}, ${row.length}` : row.facts}</small>
                  </a>
                </li>
              );
            })}
            {/* The take just played, or still playing, as a file: no need to keep it first. */}
            {take && (
              <li>
                <button
                  className="menu-line"
                  type="button"
                  onClick={() => {
                    exportMidi(take);
                    closeMore();
                  }}
                >
                  <span>Export MIDI</span>
                  <small>
                    {idle
                      ? "The take just played, the whole band"
                      : "The take playing now, the whole band"}
                  </small>
                </button>
              </li>
            )}
            <li>
              <button
                className="menu-line"
                type="button"
                onClick={() => {
                  download(
                    editing ? editor.text : entry.text,
                    "text/plain;charset=utf-8",
                    fileName(entry.chart.title, "chart", ".chart"),
                  );
                  closeMore();
                }}
              >
                <span>Export the chart's text</span>
                <small>As a .chart file, to keep or to send</small>
              </button>
            </li>
            {entry.own ? (
              <>
                <li>
                  {renaming === undefined ? (
                    <button
                      className="menu-line"
                      type="button"
                      onClick={() => setRenaming(editing ? editor.title : entry.chart.title)}
                    >
                      <span>Rename</span>
                    </button>
                  ) : (
                    <form
                      className="menu-rename"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (editing) editor.rename(renaming);
                        else renameChart(entry.id, renaming);
                        setRenaming(undefined);
                      }}
                    >
                      <label className="field">
                        <span>Title</span>
                        <input
                          type="text"
                          value={renaming}
                          enterKeyHint="done"
                          // biome-ignore lint/a11y/noAutofocus: the box appears because Rename was pressed, to be typed in
                          autoFocus
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => setRenaming(e.target.value)}
                        />
                      </label>
                      <button type="submit" className="act first" disabled={renaming.trim() === ""}>
                        Save
                      </button>
                      <button type="button" className="act" onClick={() => setRenaming(undefined)}>
                        Cancel
                      </button>
                    </form>
                  )}
                </li>
                <li>
                  <button
                    className="menu-line"
                    type="button"
                    onClick={() => {
                      if (editing) editor.finish();
                      const copy = duplicateChart(entry.id);
                      if (copy) go(`#/chart/${copy}`);
                    }}
                  >
                    <span>Duplicate</span>
                    <small>A copy of your own, named as a copy, opened here</small>
                  </button>
                </li>
                <li>
                  <button type="button" className="menu-line danger" onClick={remove}>
                    <span>Delete this chart</span>
                  </button>
                </li>
              </>
            ) : (
              <li>
                <button className="menu-line" type="button" onClick={editCopy}>
                  <span>Make a copy to edit</span>
                  <small>This chart stays as it ships; the copy is yours</small>
                </button>
              </li>
            )}
          </>
        )}
      />

      <Sheet open={open === "style"} close={close} title="Played as" kind="style-sheet">
        <div className="opts styles-opts">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className="opt style-opt"
              data-style={s.id}
              aria-pressed={s.id === style.id}
              onClick={() => {
                // Another style brings its own band: instruments chosen for the last one go.
                const { soloInstrument: _, instruments: __, ...rest } = choices;
                change({
                  ...settings,
                  charts: { ...settings.charts, [entry.id]: { ...rest, style: s.id } },
                });
                close();
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
        <p className="sheet-note">
          Another style brings its own band and its own tempo range.
          {entry.chart.styleId && styleById(entry.chart.styleId)
            ? ` This chart was written for ${styleById(entry.chart.styleId)!.name.toLowerCase()}.`
            : ""}
        </p>
      </Sheet>

      <Sheet open={open === "key"} close={close} title="Key">
        <div className="opts keys-opts">
          {keysOf(writtenKey.mode).map((k) => {
            const isWritten = pitchClass(k.tonic) === pitchClass(writtenKey.tonic);
            const name = keyToString(isWritten ? writtenKey : k);
            return (
              <button
                key={name}
                type="button"
                className="opt"
                aria-pressed={pitchClass(k.tonic) === pitchClass(chart.key.tonic)}
                onClick={() => {
                  const { key: _, ...rest } = choices;
                  change({
                    ...settings,
                    charts: {
                      ...settings.charts,
                      [entry.id]: isWritten ? rest : { ...rest, key: name },
                    },
                  });
                  close();
                }}
              >
                {name}
                {isWritten && <small>written</small>}
              </button>
            );
          })}
        </div>
      </Sheet>

      <Sheet open={open === "tempo"} close={close} title="Tempo" kind="tempo-sheet">
        <div className="tempo-set">
          <button
            type="button"
            className="step"
            aria-label={`Slower by ${TEMPO_STEP}`}
            disabled={shownTempo <= range.min}
            onClick={() => choose({ tempo: inLimits(shownTempo - TEMPO_STEP) })}
          >
            −
          </button>
          <p className="tempo-now">
            <output aria-live="polite">{shownTempo}</output>
            <span className="tempo-unit">bpm</span>
          </p>
          <button
            type="button"
            className="step"
            aria-label={`Faster by ${TEMPO_STEP}`}
            disabled={shownTempo >= range.max}
            onClick={() => choose({ tempo: inLimits(shownTempo + TEMPO_STEP) })}
          >
            +
          </button>
        </div>
        <input
          className="tempo-range"
          type="range"
          min={range.min}
          max={range.max}
          step={1}
          value={shownTempo}
          aria-label={`Tempo, ${range.min} to ${range.max} bpm`}
          onChange={(e) => choose({ tempo: inLimits(Number(e.target.value)) })}
        />
        <div className="tempo-ends">
          <span>{range.min}</span>
          {choices.tempo !== undefined && inLimits(choices.tempo) !== Math.round(usual) ? (
            <button
              type="button"
              className="tempo-back"
              onClick={() => {
                const { tempo: _, ...rest } = choices;
                change({ ...settings, charts: { ...settings.charts, [entry.id]: rest } });
              }}
            >
              Back to {Math.round(inLimits(usual))},{" "}
              {unset === null && written !== null
                ? "as written"
                : `${style.name.toLowerCase()}'s usual`}
            </button>
          ) : choices.tempo === undefined &&
            unset !== null &&
            written !== null &&
            inLimits(written) !== shownTempo ? (
            // Played in another style at its usual tempo: the chart's own is a press away.
            <button
              type="button"
              className="tempo-back"
              onClick={() => choose({ tempo: inLimits(written) })}
            >
              Play at {Math.round(inLimits(written))}, as written
            </button>
          ) : (
            <span />
          )}
          <span>{range.max}</span>
        </div>
      </Sheet>

      <Sheet open={open === "length"} close={close} title="How long">
        <div className="opts list-opts">
          {[...(["song"] as const), ...LENGTHS].map((minutes) => {
            const isSong = minutes === "song";
            const chosenNow = isSong ? song : !song && settings.minutes === minutes;
            return (
              <button
                key={String(minutes)}
                type="button"
                className="opt"
                aria-pressed={chosenNow}
                onClick={() => {
                  // The song is this chart's choice; a length is every chart's, and undoes it here.
                  const charts = { ...settings.charts, [entry.id]: { ...choices, song: isSong } };
                  change(isSong ? { ...settings, charts } : { ...settings, charts, minutes });
                  close();
                }}
              >
                {isSong
                  ? "The song, once through"
                  : minutes === null
                    ? "Until I stop it"
                    : `About ${minutes} min`}
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
