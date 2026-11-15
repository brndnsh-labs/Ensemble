// The jam as the play screen sees it: press play, and it reports where the
// band is until the tune ends or someone stops it.

import type { Player } from "@ensemble/audio";
import { seconds } from "@ensemble/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Made } from "./band.ts";
import { perform, warmUp } from "./band.ts";
import type { JamSetup, Performance, Place } from "./jam.ts";
import { chairsOf, mixOf, OPEN_PASSES, placeAt, turnForHome } from "./jam.ts";
import type { Rig } from "./rig.ts";

export type Phase = "idle" | "loading" | "playing";

export interface Jam {
  readonly phase: Phase;
  /** What is being played. */
  readonly playing: Performance | undefined;
  readonly place: Place | undefined;
  /** Whole seconds into the performance, as heard. */
  readonly elapsed: number;
  /** Why the band could not start, in words for the player. */
  readonly problem: string | undefined;
  /** Call from a tap. */
  play(): void;
  /** Tell the band to finish: it lands an ending at the end of this pass, or of the next if this one is nearly over. */
  finish(): void;
  /** True while the band is playing and has not been told to finish, or reached its last pass by itself. */
  readonly canFinish: boolean;
  /** Silence, now. */
  stop(): void;
}

/** How often the screen asks where the band is, in milliseconds. A timer, so a hidden tab still extends its jam. */
const LOOK_MS = 40;
/** A jam with no set length is given more to play when it has less than this many seconds left. */
const EXTEND_UNDER = 20;
/** New music takes over this far ahead: past everything already handed to the sampler. */
const REPLACE_AHEAD = 3;
/** How long the last chord and the room are left to ring before the jam counts as over. */
const RING = 2.5;
/** A press of Stop this soon after Finish is the same tap twice, not a change of mind. */
const SAME_TAP_MS = 600;

interface Running {
  readonly player: Player;
  readonly setup: JamSetup;
  made: Made;
  passes: number;
  /** More of an open jam has been asked for and has not arrived. */
  extending: boolean;
  /** When the band was told to finish, on the page's clock. */
  toldAt: number | undefined;
}

const newSeed = (): number => Math.floor(Math.random() * 2 ** 31);

export function useJam(rig: Rig, setup: Omit<JamSetup, "seed">): Jam {
  const [phase, setPhase] = useState<Phase>("idle");
  const [playing, setPlaying] = useState<Performance>();
  const [now, setNow] = useState<{ place: Place | undefined; elapsed: number }>({
    place: undefined,
    elapsed: 0,
  });
  const [problem, setProblem] = useState<string>();
  const [told, setTold] = useState(false);
  const running = useRef<Running>(undefined);
  /** Counts presses of play and stop, so a slow load that has been overtaken does nothing. */
  const presses = useRef(0);

  // Fetch the band's instruments as soon as it is known who is playing, not when play is
  // pressed. Only fetched: seating them changes the mix, which a band already playing owns.
  const packs = chairsOf({ ...setup, seed: 0 })
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

  const stop = useCallback(() => {
    presses.current++;
    running.current = undefined;
    rig.stop();
    setPhase("idle");
    setTold(false);
    setNow({ place: undefined, elapsed: 0 });
  }, [rig]);

  const play = () => {
    rig.wake();
    stop();
    const mine = ++presses.current;
    const jam: JamSetup = { ...setup, seed: newSeed() };
    setProblem(undefined);
    setPhase("loading");
    Promise.all([perform(jam), rig.seat(chairsOf(jam), mixOf(jam.style))]).then(
      ([made]) => {
        if (presses.current !== mine) return;
        running.current = {
          player: rig.play(made.sounds),
          setup: jam,
          made,
          passes: OPEN_PASSES,
          extending: false,
          toldAt: undefined,
        };
        setPlaying(made);
        setPhase("playing");
      },
      () => {
        if (presses.current !== mine) return;
        setPhase("idle");
        setProblem("The instruments did not load. Check the connection, then press play again.");
      },
    );
  };

  const finish = () => {
    const run = running.current;
    if (!run || run.toldAt !== undefined) return;
    run.toldAt = performance.now();
    setTold(true);
    // The ending has to be made, which takes a moment, and the phrase top it was made for
    // may have gone by when it arrives. Then the next one is taken instead.
    const turnAndJoin = () => {
      const position = run.player.position;
      if (running.current !== run || position === undefined) return;
      const { plan } = run.made;
      const place = placeAt(plan, Math.max(0, position));
      const allowance = run.made.took * 2 + 0.25;
      const home = place && turnForHome(plan, place, position + REPLACE_AHEAD + allowance);
      if (!home) return;
      perform(run.setup, { passes: run.passes, endAfter: home.endAfter, since: position }).then(
        (made) => {
          const at = run.player.position;
          if (running.current !== run || at === undefined) return;
          if (home.from < at + REPLACE_AHEAD) {
            run.made = { ...run.made, took: made.took };
            turnAndJoin();
            return;
          }
          // Where an open jam has run out before the join, the ending takes over where it stops.
          run.player.replace(Math.min(home.from, seconds(plan)), made.sounds);
          run.made = made;
          setPlaying(made);
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
      const passes = run.passes + Math.max(OPEN_PASSES, Math.ceil(run.passes / 4));
      perform(run.setup, { passes, since: position }).then(
        (made) => {
          run.extending = false;
          const at = run.player.position;
          // Stopped, or told to finish while this was being made: the ending is what counts.
          if (running.current !== run || run.toldAt !== undefined || at === undefined) return;
          run.player.replace(at + REPLACE_AHEAD, made.sounds);
          run.made = made;
          run.passes = passes;
          setPlaying(made);
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
        stop();
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
  }, [phase, rig, stop]);

  // Leaving the screen stops the band.
  useEffect(() => stop, [stop]);

  const bar = now.place?.bar;
  const canFinish =
    phase === "playing" &&
    !told &&
    bar !== undefined &&
    !bar.lastPass &&
    !bar.ending &&
    bar.kind !== "tail";
  return {
    phase,
    playing,
    place: now.place,
    elapsed: now.elapsed,
    problem,
    play,
    finish,
    canFinish,
    stop: () => {
      const toldAt = running.current?.toldAt;
      if (toldAt !== undefined && performance.now() - toldAt < SAME_TAP_MS) return;
      stop();
    },
  };
}
