// The soloist. It plays in phrases, never in notes (SO-03): for each phrase
// of each solo it asks what the chorus's form wants there (an idea stated,
// said again, changed, answered), writes several whole phrases that would do,
// and plays the one the critic prefers. What it carries from phrase to phrase
// is what it has played in this solo so far; every draw is keyed by its place
// in the form, so a jam made longer leaves every earlier note where it was.

import { PPQ } from "../../chart/types.ts";
import type { Scored } from "../../critic/choose.ts";
import { score } from "../../critic/choose.ts";
import { swing } from "../../perform/feel.ts";
import { cells, STEP } from "../../perform/grid.ts";
import { pulseTicks } from "../../perform/meter.ts";
import type { Player, PlayerContext, WrittenNote } from "../../perform/notes.ts";
import { heldRng } from "../../perform/notes.ts";
import type { PitchMove } from "../../perform/pitch.ts";
import type { PlanBar } from "../../plan/types.ts";
import type { Heard, SoloCandidate, SoloPick, Sounding } from "./critique.ts";
import { bassStruck, bySoloCritic, SOLO_FEATURES } from "./critique.ts";
import { EIGHTH, isChordTone } from "./harmony.ts";
import { soloVoice } from "./instruments.ts";
import type { Memory, Phrase } from "./phrases.ts";
import { phrasesFor } from "./phrases.ts";
import type { Slot, World } from "./slots.ts";
import { worldOf } from "./slots.ts";
import type { Form, Role } from "./style.ts";

/** The shortest note: half a sixteenth (SO-19). */
const SHORTEST = STEP / 2;

/** A note of a phrase, ready to be written. */
interface SoloNote {
  readonly bar: PlanBar;
  readonly tick: number;
  readonly duration: number;
  readonly pitch: number;
  readonly velocity: number;
  /** How its pitch moves while it sounds: a bend into it, a held note shaken. */
  readonly move?: PitchMove;
}

/** One phrase as it was chosen: for a report that wants to show the alternatives. */
export interface SoloChoice {
  readonly slot: Slot;
  /** What the form asked of the phrase: `s` state, `r` again, `v` changed, `a` answer, `c` contrast, `b` back. */
  readonly role: Role;
  readonly candidates: readonly Scored<SoloCandidate>[];
  readonly chosen: SoloCandidate;
}

/**
 * The seat's part, with the choice of phrase left open: the soloist asks the
 * critic, and a report can ask for the first phrase made, or any, to show on
 * the same seeds what the critic's choice is worth.
 */
export function soloPart(
  context: PlayerContext,
  pick?: SoloPick,
  report?: (choice: SoloChoice) => void,
): WrittenNote[] {
  const { plan, style, rng, heard } = context;
  const world = worldOf(plan, style, bassStruck((heard.bass ?? []).flat()));
  const weights = style.critic.weights.solo ?? {};
  const choose = pick ?? bySoloCritic(weights);
  const voice = soloVoice(style.solo);
  // The band's final hit is the soloist's too, at no less than the band's accent (EN-34).
  const accent = style.chords.ending.velocity + style.chords.ending.accent;

  const written: WrittenNote[] = [];
  let memory: Memory = NOTHING;
  let earlier: Heard[] = [];
  let form: readonly Role[] = ["s"];
  let solo = -1;
  for (const slot of world.slots) {
    const first = slot.bars[0]!;
    if (slot.solo !== solo) {
      solo = slot.solo;
      memory = NOTHING;
      earlier = [];
    }
    if (slot.index === 0) {
      // One form for the chorus. With no idea yet to pick up, it opens on a statement.
      const forms = writtenFor(
        world.solo.forms.filter(
          (option) =>
            option.weight > 0 && (memory.motif !== null || cells(option.phrases)[0] === "s"),
        ),
        slot.count,
      );
      const drawn = rng
        .fork("form", first.pass, first.section.occurrence)
        .weighted(forms.length > 0 ? forms : [{ weight: 1, phrases: "s" }], (f) => f.weight);
      // A chorus shorter than the form keeps how it opens and how it closes.
      const letters = cells(drawn.phrases) as Role[];
      form =
        slot.count >= letters.length
          ? letters
          : [letters[0]!, ...letters.slice(letters.length - (slot.count - 1))].slice(0, slot.count);
    }
    const role = form[slot.index % form.length] ?? "s";

    const phrases = phrasesFor(world, slot, role, memory, heldRng(rng, "phrase", "phrase", first));
    const notes = phrases.map((phrase) => realise(world, phrase, accent));
    const candidates = phrases.map(
      (phrase, i): SoloCandidate => ({
        kind: phrase.kind,
        slot,
        notes: notes[i]!.map((note) => sounding(world, note)),
        earlier,
        world,
      }),
    );
    const chosen = choose(candidates);
    const at = Math.max(0, candidates.indexOf(chosen));
    report?.({ slot, role, candidates: score(candidates, SOLO_FEATURES, weights), chosen });

    const phrase = phrases[at]!;
    const played = notes[at]!;
    for (const note of played) {
      written.push({ ...note, seat: "solo", bar: note.bar.index, voice });
    }
    const last = played.at(-1);
    // A new idea is the idea from now on, wherever in the form it turned up; and so is
    // what was played where the form asked for one stated, changed, set apart or brought
    // back. Said again or answered, the idea stays what it was.
    const stated = memory.motif === null || phrase.fresh || "svcb".includes(role);
    earlier = [...earlier, candidates[at]!];
    memory = {
      // The climb to the top note is a use of the idea, not a new one.
      motif: slot.peak ? memory.motif : stated ? phrase : memory.motif,
      theme: memory.theme ?? phrase,
      opening: slot.index === 0 ? phrase : memory.opening,
      rest: last?.pitch ?? memory.rest,
      highest: Math.max(memory.highest, ...played.map((note) => note.pitch)),
      restEnds: last ? last.tick + last.duration : memory.restEnds,
      endedEmpty: phrase.bars.at(-1)?.part === "R",
    };
  }
  return written;
}

export const playSolo: Player = (context) => soloPart(context);

/**
 * The forms written for a chorus of this many phrases; failing that the longest that
 * fit inside it, which go round again; failing that the shortest, which are cut.
 */
function writtenFor(forms: readonly Form[], count: number): readonly Form[] {
  const length = (form: Form) => cells(form.phrases).length;
  const lengths = forms.map(length);
  const shorter = lengths.filter((n) => n <= count);
  const wanted = shorter.length > 0 ? Math.max(...shorter) : Math.min(...lengths);
  return forms.filter((form) => length(form) === wanted);
}

const NOTHING: Memory = {
  motif: null,
  theme: null,
  opening: null,
  rest: null,
  highest: 0,
  restEnds: 0,
  endedEmpty: false,
};

/** The ticks a written note sounds for once the band's swing has bent it. */
function soundsFor(world: World, bar: PlanBar, tick: number, duration: number): number {
  const at = tick - bar.start;
  const bend = (within: number) => (bar.meter.unit === 4 ? swing(within, world.feel) : within);
  return Math.max(1, Math.round(bend(at + duration) - bend(at)));
}

/** A written note as it will sound once the band's swing has bent it. */
function sounding(world: World, note: SoloNote): Sounding {
  const length = soundsFor(world, note.bar, note.tick, note.duration);
  return { bar: note.bar, tick: note.tick, ends: note.tick + length, pitch: note.pitch };
}

/**
 * How a note's pitch moves, on an instrument whose hand can move it. `bend`
 * is the semitones under the note a string is pushed up from, where the line
 * asked for one; `value` is the note's length in the rhythm and `sounds` how
 * long it is heard for, both in ticks. A hand moves in seconds, whatever the
 * tempo, so a move that the note is too short to finish is not started: a
 * bend needs the note to last as long again once it has arrived, a shake
 * needs time to reach its depth. A note bent into may be shaken too (SO-52,
 * SO-53).
 */
function moveOf(
  world: World,
  bend: number,
  value: number,
  sounds: number,
): { move: PitchMove } | undefined {
  const { instrument, solo, ticksPerSecond } = world;
  const seconds = sounds / ticksPerSecond;
  const push = instrument.bend;
  const bends =
    push !== null && bend > 0 && value >= (bend === 1 ? EIGHTH : PPQ) && seconds >= 2 * push.takes;
  const shake = instrument.shake;
  const shakes =
    shake !== null && value >= solo.habits.shake * PPQ && seconds >= shake.after + shake.grows;
  if (!bends && !shakes) return undefined;
  return {
    move: {
      ...(bends
        ? {
            glide: [
              { at: 0, semitones: -bend },
              { at: push.takes * ticksPerSecond, semitones: 0 },
            ],
          }
        : {}),
      ...(shakes
        ? {
            vibrato: {
              from: shake.after * ticksPerSecond,
              grow: shake.grows * ticksPerSecond,
              depth: shake.depth,
              rate: shake.rate,
              ...(shake.upward ? { upward: true } : {}),
            },
          }
        : {}),
    },
  };
}

/**
 * A phrase's notes with their lengths and levels. Inside a line a note sounds
 * until the next; the note that ends a line is cut to leave a breath, in
 * seconds, before whatever follows (Q-47, SU-B-15); a note stops at a change
 * of chord unless it belongs to the new one (X-B-07).
 */
function realise(world: World, phrase: Phrase, accent: number): SoloNote[] {
  const { solo, instrument, harmony } = world;
  const { slot } = phrase;
  const touch = solo.touch;
  const home = instrument.home + solo.lift;
  const breath = Math.ceil(
    Math.max(solo.space.breath, instrument.breath?.takes ?? 0) * world.ticksPerSecond,
  );
  const lastBar = slot.bars.at(-1)!;
  const slotEnd = lastBar.start + lastBar.ticks;
  const all = [...phrase.pickup, ...phrase.line];
  // A horn's air: how long it may play from where it last breathed.
  const lungs = (instrument.breath?.lungs ?? Number.POSITIVE_INFINITY) * world.ticksPerSecond;
  let breathed = all[0]?.spot.tick ?? 0;

  return all.flatMap(({ spot, pitch, lead, bend }, i): SoloNote[] => {
    const { bar, tick } = spot;
    const next = all[i + 1];
    const before = all[i - 1];
    let level = (slot.peak ? touch.peak : touch.level) + touch.perSemitone * (pitch - home);
    if (spot.hold <= EIGHTH && (tick - bar.start) % PPQ === EIGHTH) level += touch.offbeat;
    if (before && next && pitch < before.pitch && pitch < next.pitch) level -= touch.valley;
    if (lead) level -= touch.pickup;
    const velocity = Math.round(Math.min(touch.ceiling, Math.max(touch.floor, level)));

    const isFinal = (note: typeof next) =>
      note !== undefined && note.spot.bar.ending !== null && phrase.bars.at(-1)?.part === "F";
    if (!next && isFinal(all[i])) {
      return finalStrikes(bar, tick).map((strike) => {
        // A horn holds the last note as long as the band does, or as long as it has air.
        const duration = Math.min(
          strike.duration,
          Math.max(PPQ, Math.floor(breathed + lungs - strike.tick - STEP)),
        );
        return {
          bar,
          tick: strike.tick,
          duration,
          pitch,
          velocity: strike.accent ? Math.max(velocity, accent) : velocity,
          // Nothing is bent in the bar the band ends on (SO-57); a last note held is shaken.
          ...moveOf(world, 0, duration, soundsFor(world, bar, strike.tick, duration)),
        };
      });
    }

    const space = next ? next.spot.tick - tick : Number.POSITIVE_INFINITY;
    const endsLine = !next || next.spot.tick - (tick + spot.hold) >= PPQ || next.spot.bar !== bar;
    // A note tied over the barline ends in the bar it is held into (SO-38).
    const inSlot = slot.bars.indexOf(bar);
    const over = tick + spot.hold > bar.start + bar.ticks ? slot.bars[inSlot + 1] : undefined;
    const endsIn = over ?? bar;
    const part = phrase.bars[over ? inSlot + 1 : inSlot]?.part;
    let duration = spot.hold;
    if (endsLine && (part === "E" || !next) && !lead) {
      // The breath is taken by shortening the note that sounds into it, never by leaving it
      // out. It is a breath as heard: measured after the swing has moved the note's end.
      const bend = (at: number) => (bar.meter.unit === 4 ? swing(at, world.feel) : at);
      const limit =
        Math.min(endsIn.start + endsIn.ticks, next ? next.spot.tick : slotEnd) - bar.start;
      let until = Math.floor((limit - breath) / STEP) * STEP;
      while (until > 0 && bend(limit) - bend(until) < breath) until -= STEP;
      duration = Math.min(duration, Math.max(EIGHTH, bar.start + until - tick));
      // (A sixteenth in hand: the swing can carry a note's end that much later.)
      duration = Math.min(duration, Math.max(EIGHTH, Math.floor(breathed + lungs - tick - STEP)));
    }
    // In the rhythm the note is as long as its space, however the hand lifts off it.
    let value = duration;
    if (duration >= space) {
      value = space;
      duration = Math.round(space * touch.legato);
    }

    // Held over a change, it must be a tone of the new chord; otherwise it stops there.
    const here = world.arrivalAt(tick);
    for (let a = (here?.index ?? -1) + 1; a < harmony.length; a++) {
      const arrival = harmony[a]!;
      if (arrival.tick >= tick + duration) break;
      if (arrival.tick <= tick || (!arrival.changed && arrival.chord !== null)) continue;
      const pool = world.poolOf(arrival);
      if (pool && isChordTone(pool, pitch)) continue;
      duration = arrival.tick - tick;
      value = duration;
      break;
    }
    // Whether that left a breath is judged as heard too: swing carries the end of a note
    // cut on an "and" later, and a gap that is a breath on paper may not be one.
    const heard = (at: number, where: PlanBar) => {
      const within = at - where.start;
      const swung = where.meter.unit === 4 && within < where.ticks;
      return where.start + (swung ? swing(within, world.feel) : within);
    };
    if (next) {
      const gap = heard(next.spot.tick, next.spot.bar) - heard(tick + duration, bar);
      if (gap >= breath) breathed = next.spot.tick;
    }
    duration = Math.max(SHORTEST, duration);
    const move = moveOf(world, bend ?? 0, value, soundsFor(world, bar, tick, duration));
    return [{ bar, tick, duration, pitch, velocity, ...move }];
  });
}

/** The final chord as the band plays it: where the soloist strikes, and for how long (EN-32 to EN-35). */
function finalStrikes(
  bar: PlanBar,
  from: number,
): { tick: number; duration: number; accent: boolean }[] {
  const ending = bar.ending!;
  const until = bar.start + ending.at + ending.ring;
  const barEnd = bar.start + bar.ticks;
  const held = [{ tick: from, duration: until - from, accent: false }];
  switch (ending.gesture.kind) {
    case "hold":
    case "soft":
      return held;
    case "stop":
      return [{ tick: from, duration: Math.min(EIGHTH, until - from), accent: true }];
    case "button": {
      // Held to the "and" of the last pulse, then the button with the band (EN-17, EN-35).
      const lastPulse = pulseTicks(bar.meter).at(-1)!;
      const button = barEnd - (lastPulse > PPQ ? EIGHTH : lastPulse / 2);
      if (button - from < EIGHTH || button >= until) return held;
      return [
        { tick: from, duration: button - from, accent: false },
        { tick: button, duration: Math.min(EIGHTH, until - button), accent: true },
      ];
    }
    case "hits": {
      // Every stab the band plays after the chord lands; the last one rings (EN-33).
      const starts: number[] = [];
      let tick = bar.start;
      for (const pulse of pulseTicks(bar.meter)) {
        starts.push(tick);
        tick += pulse;
      }
      const wanted = ending.gesture.beats
        .map((beat) => starts[beat - 1])
        .filter((at): at is number => at !== undefined && at >= from && at < until);
      const ticks = wanted.length > 0 ? [...new Set(wanted)].sort((a, b) => a - b) : [from];
      return ticks.map((at, i) => {
        const next = ticks[i + 1];
        return {
          tick: at,
          duration: next === undefined ? until - at : Math.min(EIGHTH, next - at),
          accent: true,
        };
      });
    }
  }
}
