// The jam as the play screen sees it: press play, and it reports where the
// band is until the tune ends or someone stops it.

import type { Player } from "@ensemble/audio";
import type { Take } from "@ensemble/engine";
import { seconds } from "@ensemble/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import type { JamSetup, Place } from "./jam.ts";
import { chairsOf, mixOf, OPEN_PASSES, placeAt, soundsOf, takeOf, turnForHome } from "./jam.ts";
import type { Rig } from "./rig.ts";

export type Phase = "idle" | "loading" | "playing";

export interface Jam {
  readonly phase: Phase;
  /** The take being played. */
  readonly take: Take | undefined;
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

interface Running {
  readonly player: Player;
  readonly setup: JamSetup;
  take: Take;
  passes: number;
}

const newSeed = (): number => Math.floor(Math.random() * 2 ** 31);

export function useJam(rig: Rig, setup: Omit<JamSetup, "seed">): Jam {
  const [phase, setPhase] = useState<Phase>("idle");
  const [take, setTake] = useState<Take>();
  const [now, setNow] = useState<{ place: Place | undefined; elapsed: number }>({
    place: undefined,
    elapsed: 0,
  });
  const [problem, setProblem] = useState<string>();
  /** The band has been told to finish. */
  const [told, setTold] = useState(false);
  const running = useRef<Running>(undefined);
  /** Counts presses of play and stop, so a slow load that has been overtaken does nothing. */
  const turn = useRef(0);

  // Fetch the band's instruments as soon as it is known who is playing, not when play is pressed.
  const chairs = JSON.stringify(chairsOf({ ...setup, seed: 0 }));
  // biome-ignore lint/correctness/useExhaustiveDependencies: the chairs are what the setup means here
  useEffect(() => {
    rig.seat(chairsOf({ ...setup, seed: 0 }), mixOf(setup.style)).catch(() => {
      // Said when play is pressed, if it still fails then.
    });
  }, [rig, chairs, setup.style]);

  const stop = useCallback(() => {
    turn.current++;
    running.current = undefined;
    rig.stop();
    setPhase("idle");
    setTold(false);
    setNow({ place: undefined, elapsed: 0 });
  }, [rig]);

  const play = () => {
    rig.wake();
    stop();
    const mine = ++turn.current;
    const jam: JamSetup = { ...setup, seed: newSeed() };
    setProblem(undefined);
    setPhase("loading");
    rig.seat(chairsOf(jam), mixOf(jam.style)).then(
      () => {
        if (turn.current !== mine) return;
        const made = takeOf(jam);
        running.current = {
          player: rig.play(soundsOf(made, jam)),
          setup: jam,
          take: made,
          passes: OPEN_PASSES,
        };
        setTake(made);
        setPhase("playing");
      },
      () => {
        if (turn.current !== mine) return;
        setPhase("idle");
        setProblem("The instruments did not load. Check the connection, then press play again.");
      },
    );
  };

  const finish = () => {
    const run = running.current;
    const position = run?.player.position;
    if (!run || position === undefined) return;
    const place = placeAt(run.take.plan, Math.max(0, position));
    const turn = place && turnForHome(run.take.plan, place, position + REPLACE_AHEAD);
    if (!turn) return;
    run.take = takeOf(run.setup, run.passes, turn.endAfter);
    run.player.replace(turn.from, soundsOf(run.take, run.setup));
    setTake(run.take);
    setTold(true);
  };

  useEffect(() => {
    if (phase !== "playing") return;
    const look = () => {
      const run = running.current;
      const position = run?.player.position;
      if (!run || position === undefined) return;
      let plan = run.take.plan;
      if (plan.open && seconds(plan) - position < EXTEND_UNDER) {
        // Each extension is made from the top, so make them fewer as the jam grows longer.
        run.passes += Math.max(OPEN_PASSES, Math.ceil(run.passes / 2));
        run.take = takeOf(run.setup, run.passes);
        run.player.replace(position + REPLACE_AHEAD, soundsOf(run.take, run.setup));
        plan = run.take.plan;
        setTake(run.take);
      }
      if (position > seconds(plan) + RING) {
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
    take,
    place: now.place,
    elapsed: now.elapsed,
    problem,
    play,
    finish,
    canFinish,
    stop,
  };
}
