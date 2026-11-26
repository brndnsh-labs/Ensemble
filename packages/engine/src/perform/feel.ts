// Dynamics and feel, applied to every seat's written notes in one place.
// Players write on a straight grid at written levels; this is the only code
// that moves a note in time or scales it by the band's energy.

import { PPQ } from "../chart/types.ts";
import type { Plan, PlanBar } from "../plan/types.ts";
import type { Rng } from "../rng.ts";
import type { FeelStyle, StylePack } from "../style/types.ts";
import type { NoteEvent, WrittenNote } from "./notes.ts";

/** The largest human placement, in milliseconds, at humanize 100. */
const HUMAN_MS = 9;
/** The largest human change of velocity at humanize 100. */
const HUMAN_VELOCITY = 10;

/**
 * How loud a written level is played at an energy: 61% at 0, 85% at 0.7, 95% at 1.
 *
 * The old band played its levels at 72% to 112% (X-B-16), set against its own
 * sampler. Through a sampled kit that slammed: Brandon chose 15% under it by ear
 * at gate 1. Nothing written reaches the top of the range even at full energy,
 * so an accent stays an accent and there is headroom above the loudest chorus.
 */
export function energyGain(energy: number): number {
  return 0.61 + 0.34 * energy;
}

/**
 * Where a straight-grid position lands once swung. Each pair of the swung unit
 * is bent so its offbeat sits later; beats never move, and the bend is linear
 * inside each half so a note between grid lines keeps its place in line.
 */
export function swing(tickInBar: number, feel: FeelStyle): number {
  const amount = Math.min(100, Math.max(0, feel.swing.amount));
  if (amount === 0) return tickInBar;
  const pair = feel.swing.unit === "eighth" ? PPQ : PPQ / 2;
  const half = pair / 2;
  const offbeat = pair * (0.5 + amount / 600);
  const base = Math.floor(tickInBar / pair) * pair;
  const within = tickInBar - base;
  const bent =
    within < half
      ? (within / half) * offbeat
      : offbeat + ((within - half) / half) * (pair - offbeat);
  return base + bent;
}

/**
 * Where on the straight grid to write a note so that, once swung, it is heard at a place in
 * the bar: `swing` the other way. A note written there off the grid lines keeps its place in
 * line, as `swing` keeps it.
 */
export function unswing(heardInBar: number, feel: FeelStyle): number {
  const amount = Math.min(100, Math.max(0, feel.swing.amount));
  if (amount === 0) return heardInBar;
  const pair = feel.swing.unit === "eighth" ? PPQ : PPQ / 2;
  const half = pair / 2;
  const offbeat = pair * (0.5 + amount / 600);
  const base = Math.floor(heardInBar / pair) * pair;
  const within = heardInBar - base;
  const straight =
    within < offbeat
      ? (within / offbeat) * half
      : half + ((within - offbeat) / (pair - offbeat)) * half;
  return base + straight;
}

export function applyFeel(
  notes: readonly WrittenNote[],
  plan: Plan,
  style: StylePack,
  rng: Rng,
): NoteEvent[] {
  const ticksPerMs = (plan.quarters * PPQ) / 60_000;
  const human = Math.min(100, Math.max(0, style.feel.humanize)) / 100;

  // Each seat's last note as played, for a note that is no softer than it.
  const played = new Map<string, { tick: number; velocity: number }>();
  // The same place in the bar and the same touch come round every bar and every pass, and a
  // stream named the same is the same stream: each one's number is drawn once.
  // Kept by each seat's voice, then by a number for the place: no name is made for a note.
  const drawn = new Map<string, { places: Map<number, number>; touches: Map<string, number>[] }>();
  // A bar's place in the pass, the same text for every note of the bar.
  const inPass: string[] = [];
  return notes.map((note) => {
    const bar = plan.bars[note.bar]!;
    const tickInBar = note.tick - bar.start;
    // Swing is geometry on a quarter-note pulse; bars in 6/8 and the like play straight.
    const swings = bar.meter.unit === 4;
    const bend = (t: number) => (swings ? swing(t, style.feel) : t);
    const start = bend(tickInBar);
    // A swung note's end is swung too, so it still ends where its written end lands.
    const end = bend(tickInBar + note.duration);

    const lean = note.seat === "drums" ? 0 : style.feel.lean[note.seat] * ticksPerMs;
    // Human placement belongs to a position in the bar, so the same sixteenth leans the same
    // way every bar and reads as a pocket. Touch belongs to a position in the pass.
    const voice = note.voice ?? "";
    const hand = `${note.seat}/${voice}`;
    let kept = drawn.get(hand);
    if (!kept) {
      kept = { places: new Map(), touches: [] };
      drawn.set(hand, kept);
    }
    let place = kept.places.get(tickInBar);
    if (place === undefined) {
      place = rng.fork("place", note.seat, voice, tickInBar).next();
      kept.places.set(tickInBar, place);
    }
    inPass[note.bar] ??= barInPass(bar);
    kept.touches[note.pitch] ??= new Map();
    const where = inPass[note.bar]!;
    const touches = kept.touches[note.pitch]!;
    const touchName = `${where}/${tickInBar}`;
    let touch = touches.get(touchName);
    if (touch === undefined) {
      touch = rng.fork("touch", note.seat, voice, note.pitch, where, tickInBar).next();
      touches.set(touchName, touch);
    }
    const placement = (place * 2 - 1) * HUMAN_MS * human * ticksPerMs;
    const velocityShift = (touch * 2 - 1) * HUMAN_VELOCITY * human;

    const energy = bar.seats[note.seat] ?? bar.energy;
    const offset = Math.round(start - tickInBar + lean + placement + (note.nudge ?? 0));
    // Nothing rings past the end of a performance that ends, however the pocket moved the note.
    const room = plan.open ? Number.POSITIVE_INFINITY : plan.ticks - (note.tick + offset);
    let event: NoteEvent = {
      kind: "note",
      seat: note.seat,
      tick: note.tick,
      offset,
      duration: Math.max(1, Math.min(Math.round(end - start), room)),
      pitch: note.pitch,
      velocity: clampVelocity(note.velocity * energyGain(energy) + velocityShift),
    };
    const prior = played.get(note.seat);
    if (note.noSofter && prior && prior.tick < note.tick && prior.velocity > event.velocity)
      event = { ...event, velocity: prior.velocity };
    if (!prior || prior.tick <= note.tick)
      played.set(note.seat, { tick: note.tick, velocity: event.velocity });
    return {
      ...event,
      ...(note.voice === undefined ? {} : { voice: note.voice }),
      ...(note.move === undefined ? {} : { move: note.move }),
      ...(note.fade === undefined ? {} : { fade: note.fade }),
      ...(note.slur ? { slur: true } : {}),
    };
  });
}

/** A position that repeats every pass, so every chorus has the same touch at the same place. */
function barInPass(bar: PlanBar): string {
  return `${bar.section.identity}:${bar.barInSection}`;
}

const clampVelocity = (v: number): number => Math.min(127, Math.max(1, Math.round(v)));
