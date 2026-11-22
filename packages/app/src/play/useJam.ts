// The jam as the play screen sees it: press play, and it reports where the
// band is until the tune ends or someone stops it.

import type { Player } from "@ensemble/audio";
import type { Seat, StylePack, TakeRecipe } from "@ensemble/engine";
import { seconds } from "@ensemble/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CountedChart } from "../counts.ts";
import { count, lengthOf } from "../counts.ts";
import type { Made } from "./band.ts";
import { perform, Unplayable, warmUp } from "./band.ts";
import type { Call, Performance, Place } from "./jam.ts";
import { chairsOf, mixOf, OPEN_PASSES, placeAt, recipeOf, seatsOf, turnForHome } from "./jam.ts";
import type { Following, Onsets } from "./lamps.ts";
import { onsetsOf, replaced } from "./lamps.ts";
import type { Rig } from "./rig.ts";

export type Phase = "idle" | "loading" | "playing";

export interface Jam {
  readonly phase: Phase;
  /** What is being played. */
  readonly playing: Performance | undefined;
  readonly place: Place | undefined;
  /** Whole seconds into the performance, as heard. */
  readonly elapsed: number;
  /**
   * The take being played, or the last one played, as it was heard: what to
   * keep to hear it again. An open jam stopped dead is the passes it got to.
   */
  readonly take: TakeRecipe | undefined;
  /**
   * Who is in the take being loaded or played; undefined while the band is
   * idle. A seat outside it has no part to be heard, whatever is pressed.
   */
  readonly seats: readonly Seat[] | undefined;
  /** Why the band could not start, in words for the player. */
  readonly problem: string | undefined;
  /** Call from a tap. */
  play(): void;
  /** Tell the band to finish: it lands an ending at the end of this pass, or of the next if this one is nearly over. */
  finish(): void;
  /** True while the band plays a jam and has not been told to finish, or reached its last pass by itself. Never in a song. */
  readonly canFinish: boolean;
  /** True while a jam is on its way home: told to finish, or in its last pass by itself. Never in a song. */
  readonly finishing: boolean;
  /** Silence, now. */
  stop(): void;
  /** Where the band is and the notes it plays, read at the moment of asking; undefined while it is not playing. The same function for the screen's life. */
  readonly follow: () => Following | undefined;
}

/** How often the screen asks where the band is, in milliseconds. A timer, so a hidden tab still extends its jam. */
const LOOK_MS = 40;
/** A jam with no set length is given more to play when it has less than this many seconds left. */
const EXTEND_UNDER = 20;
/** New music takes over this far ahead: past everything already handed to the sampler. */
const REPLACE_AHEAD = 3;
/** An ending costs the engine about this many times what the jam it ends did: it makes both and joins them. */
const ENDING_COST = 2;
/** How long the last chord and the room are left to ring before the jam counts as over. */
const RING = 2.5;
/**
 * Stop is where Play was, so a press of it this soon after Play is the same
 * tap twice, not a change of mind.
 */
const SAME_TAP_MS = 400;

interface Running {
  readonly player: Player;
  readonly style: StylePack;
  /** What is playing, as it now stands: longer when an open jam is given more, told when it is told to finish. */
  recipe: TakeRecipe;
  made: Made;
  /** Each seat's notes as the player has them now: replaced with the take from where it was replaced. */
  onsets: Onsets;
  /** More of an open jam has been asked for and has not arrived. */
  extending: boolean;
  /** When the band was told to finish, on the page's clock. */
  toldAt: number | undefined;
  /** When the band started, on the page's clock. */
  readonly startedAt: number;
  /** Its end has been counted: once for each start, however it ended. */
  ended: boolean;
}

/** Count a run's end, unless it has been counted already. */
function countEnd(run: Running, how: "finished" | "ran-out" | "stopped" | "closed"): void {
  if (run.ended) return;
  run.ended = true;
  count("play_ended", { how, length: lengthOf((performance.now() - run.startedAt) / 1000) });
}

const newSeed = (): number => Math.floor(Math.random() * 2 ** 31);

const passesOf = (recipe: TakeRecipe): number => recipe.options.passes ?? OPEN_PASSES;

/**
 * `changed`, when given, is told each time the take changes, as `take` is. It
 * is told even as the screen closes, when the band is stopped and an open jam
 * becomes the passes it got to, which `take` can no longer show.
 *
 * `chart` is the chart as it is counted (`counts.ts`): the band starting and
 * ending are counted here, where each happens once.
 */
export function useJam(
  rig: Rig,
  call: Call,
  chart: CountedChart,
  changed?: (take: TakeRecipe) => void,
): Jam {
  const [phase, setPhase] = useState<Phase>("idle");
  const [playing, setPlaying] = useState<Performance>();
  const [now, setNow] = useState<{ place: Place | undefined; elapsed: number }>({
    place: undefined,
    elapsed: 0,
  });
  const [take, setShownTake] = useState<TakeRecipe>();
  const counted = useRef(chart);
  counted.current = chart;
  const tell = useRef(changed);
  tell.current = changed;
  const setTake = useCallback((next: TakeRecipe) => {
    setShownTake(next);
    tell.current?.(next);
  }, []);
  const [problem, setProblem] = useState<string>();
  const [told, setTold] = useState(false);
  const [seats, setSeats] = useState<readonly Seat[]>();
  const running = useRef<Running>(undefined);
  /** Counts presses of play and stop, so a slow load that has been overtaken does nothing. */
  const presses = useRef(0);
  /** When play was last pressed, on the page's clock. */
  const pressedAt = useRef(Number.NEGATIVE_INFINITY);

  // Fetch the band's instruments as soon as it is known who is playing, not when play is
  // pressed. Only fetched: seating them changes the mix, which a band already playing owns.
  const packs = chairsOf(call.style, call.options)
    .map((chair) => chair.pack)
    .join(" ");
  useEffect(() => {
    warmUp();
    for (const pack of packs.split(" ").filter(Boolean)) {
      rig.load(pack).catch(() => {
        // Said when play is pressed, if it still fails then.
      });
    }
  }, [rig, packs]);

  /** Silence. `ended` is why: the take came to its end, or anything else stopped it. */
  const stop = useCallback(
    (ended: "ran-out" | "stopped" = "stopped") => {
      presses.current++;
      const run = running.current;
      if (run) countEnd(run, ended === "ran-out" && run.toldAt !== undefined ? "finished" : ended);
      const position = run?.player.position;
      if (run && position !== undefined && run.made.plan.open) {
        // An open jam that was not told to finish is, as a take, the passes it got to.
        const bar = placeAt(run.made.plan, Math.max(0, position - rig.latency))?.bar;
        const passes = bar?.kind === "music" ? bar.pass + 1 : 1;
        setTake({ ...run.recipe, options: { ...run.recipe.options, passes } });
      }
      running.current = undefined;
      rig.stop();
      setPhase("idle");
      setSeats(undefined);
      setTold(false);
      setNow({ place: undefined, elapsed: 0 });
    },
    [rig, setTake],
  );

  const play = () => {
    rig.wake();
    stop();
    pressedAt.current = performance.now();
    const mine = ++presses.current;
    const { style } = call;
    const recipe = recipeOf(call, call.options.seed ?? newSeed());
    setProblem(undefined);
    setPhase("loading");
    // Whoever was silenced in the last take is heard in this one, if they are in it.
    rig.unhush();
    setSeats(seatsOf(recipe.options));
    Promise.all([
      perform(recipe),
      rig.seat(chairsOf(style, recipe.options), mixOf(style, recipe.options)),
    ]).then(
      ([made]) => {
        if (presses.current !== mine) return;
        running.current = {
          player: rig.play(made.sounds),
          style,
          recipe,
          made,
          onsets: onsetsOf(made.sounds, made.plan),
          extending: false,
          toldAt: undefined,
          startedAt: performance.now(),
          ended: false,
        };
        const { beats, unit } = made.chart.meter;
        const options = recipe.options;
        count("play_started", {
          style: style.id,
          meter: `${beats}/${unit}`,
          mode: made.plan.mode,
          soloist: options.solo ? (options.soloInstrument ?? style.solo.instrument) : "none",
          chart: counted.current,
        });
        setPlaying(made);
        setTake(recipe);
        setPhase("playing");
      },
      (error: unknown) => {
        if (presses.current !== mine) return;
        setPhase("idle");
        setSeats(undefined);
        setProblem(
          error instanceof Unplayable
            ? "The band could not play this."
            : "The instruments did not load. Check the connection, then press play again.",
        );
      },
    );
  };

  const finish = () => {
    const run = running.current;
    // A song has its own end: there is nothing to tell the band.
    if (!run || run.toldAt !== undefined || run.made.plan.mode === "song") return;
    run.toldAt = performance.now();
    setTold(true);
    // The ending has to be made, which takes a moment, and the phrase top it was made for
    // may have gone by when it arrives. Then the next one is taken instead. The take that
    // comes back is the jam as it was up to that top and the ending from there, so it can
    // take over anywhere before the top.
    const turnAndJoin = () => {
      const position = run.player.position;
      if (running.current !== run || position === undefined) return;
      const { plan } = run.made;
      const place = placeAt(plan, Math.max(0, position));
      const allowance = run.made.took * ENDING_COST + 0.25;
      const home = place && turnForHome(plan, place, position + REPLACE_AHEAD + allowance);
      if (!home) return;
      const told: TakeRecipe = {
        ...run.recipe,
        options: { ...run.recipe.options, endAfter: home.endAfter, toldAt: home.toldAt },
      };
      perform(told, position).then(
        (made) => {
          const at = run.player.position;
          if (running.current !== run || at === undefined) return;
          if (home.from < at + REPLACE_AHEAD) {
            // Too late for that top. This one took as long as the next will.
            run.made = { ...run.made, took: made.took / ENDING_COST };
            turnAndJoin();
            return;
          }
          run.player.replace(at + REPLACE_AHEAD, made.sounds);
          run.onsets = replaced(run.onsets, onsetsOf(made.sounds, made.plan), at + REPLACE_AHEAD);
          run.made = made;
          run.recipe = told;
          setPlaying(made);
          setTake(told);
        },
        () => {
          // The ending could not be made: the band plays on as it was, and can be asked again.
          run.toldAt = undefined;
          setTold(false);
        },
      );
    };
    turnAndJoin();
  };

  useEffect(() => {
    if (phase !== "playing") return;
    /** Give an open jam more to play, well before it runs out. */
    const extend = (run: Running, position: number) => {
      run.extending = true;
      const passes =
        passesOf(run.recipe) + Math.max(OPEN_PASSES, Math.ceil(passesOf(run.recipe) / 4));
      const longer: TakeRecipe = { ...run.recipe, options: { ...run.recipe.options, passes } };
      perform(longer, position).then(
        (made) => {
          run.extending = false;
          const at = run.player.position;
          // Stopped, or told to finish while this was being made: the ending is what counts.
          if (running.current !== run || run.toldAt !== undefined || at === undefined) return;
          run.player.replace(at + REPLACE_AHEAD, made.sounds);
          run.onsets = replaced(run.onsets, onsetsOf(made.sounds, made.plan), at + REPLACE_AHEAD);
          run.made = made;
          run.recipe = longer;
          setPlaying(made);
          setTake(longer);
        },
        () => {
          run.extending = false;
        },
      );
    };
    const look = () => {
      const run = running.current;
      const position = run?.player.position;
      if (!run || position === undefined) return;
      const { plan } = run.made;
      const left = seconds(plan) - position;
      // The longer the jam, the longer more of it takes to make, and the earlier it is asked for.
      const wanted = plan.open && !run.extending && run.toldAt === undefined;
      if (wanted && left < Math.max(EXTEND_UNDER, run.made.took * 8)) {
        extend(run, position);
      }
      if (!plan.open && position > seconds(plan) + RING) {
        stop("ran-out");
        return;
      }
      const heard = position - rig.latency;
      const place = placeAt(plan, heard);
      const elapsed = Math.max(0, Math.floor(heard));
      setNow((was) =>
        was.elapsed === elapsed &&
        was.place?.bar === place?.bar &&
        was.place?.span === place?.span &&
        was.place?.beat === place?.beat
          ? was
          : { place, elapsed },
      );
    };
    const timer = setInterval(look, LOOK_MS);
    return () => clearInterval(timer);
  }, [phase, rig, stop, setTake]);

  const follow = useCallback((): Following | undefined => {
    const run = running.current;
    const position = run?.player.position;
    if (!run || position === undefined) return undefined;
    return { heard: position - rig.latency, onsets: run.onsets };
  }, [rig]);

  // Leaving the screen stops the band.
  useEffect(() => () => stop(), [stop]);

  // The page closed while the band plays: that is its end. A page kept by the browser and come
  // back to plays on, and its end has been counted. Hidden is not closed: a phone puts a page
  // away while it plays.
  useEffect(() => {
    const closed = () => {
      const run = running.current;
      if (run) countEnd(run, "closed");
    };
    addEventListener("pagehide", closed);
    return () => removeEventListener("pagehide", closed);
  }, []);

  const bar = now.place?.bar;
  const canFinish =
    phase === "playing" &&
    playing?.plan.mode === "jam" &&
    !told &&
    bar !== undefined &&
    !bar.lastPass &&
    !bar.ending &&
    bar.kind !== "tail";
  // With no bar under it the band is either about to count in or letting its last chord ring.
  const finishing =
    phase === "playing" &&
    playing?.plan.mode === "jam" &&
    (told || (bar ? bar.lastPass || Boolean(bar.ending) || bar.kind === "tail" : now.elapsed > 0));
  return {
    phase,
    playing,
    place: now.place,
    elapsed: now.elapsed,
    take,
    seats,
    problem,
    play,
    finish,
    canFinish,
    finishing,
    follow,
    stop: () => {
      if (performance.now() - pressedAt.current < SAME_TAP_MS) return;
      stop();
    },
  };
}
