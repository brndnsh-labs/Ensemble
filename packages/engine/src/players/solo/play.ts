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
import type { Arrival } from "../../perform/harmony.ts";
import { onAnd, onPulse, pulseTicks } from "../../perform/meter.ts";
import type { Player, PlayerContext, WrittenNote } from "../../perform/notes.ts";
import { heldRng } from "../../perform/notes.ts";
import type { GlidePoint, PitchMove } from "../../perform/pitch.ts";
import { JUMP } from "../../perform/pitch.ts";
import type { Plan, PlanBar } from "../../plan/types.ts";
import type { Rng } from "../../rng.ts";
import { createRng } from "../../rng.ts";
import type { StylePack } from "../../style/types.ts";
import { TIER_MID } from "../../style/types.ts";
import type { ToneRole } from "../../theory/chord.ts";
import { mod12, pitchClass } from "../../theory/pitch.ts";
import type { Heard, SoloCandidate, SoloPick, Sounding } from "./critique.ts";
import { bassStruck, bySoloCritic, runOf, SOLO_FEATURES } from "./critique.ts";
import { EIGHTH, isChordTone, onlyPasses } from "./harmony.ts";
import { soloVoice } from "./instruments.ts";
import { placeOf, spotsOf } from "./line.ts";
import type { Memory, PassPickup, Phrase } from "./phrases.ts";
import { opensPass, passPickup, phrasesFor } from "./phrases.ts";
import type { Slot, World } from "./slots.ts";
import { doubleChanceOf, fourPulses, levelIndex, worldOf } from "./slots.ts";
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
  /** Ticks it sounds past its end, dying away: a fall. */
  readonly fade?: number;
  /** Not struck: hammered on or pulled off from the note before. */
  readonly slur?: boolean;
  /** A breath follows it: it ends a phrase as heard. */
  readonly ends: boolean;
  /** Its length in the rhythm, in ticks. */
  readonly value: number;
  /** A note of a pickup into the phrase. */
  readonly lead: boolean;
}

/** A soloist's note as the band is given it. */
function writtenOf(note: SoloNote, voice: string, leadsIn: boolean): WrittenNote {
  return {
    seat: "solo",
    bar: note.bar.index,
    tick: note.tick,
    duration: note.duration,
    pitch: note.pitch,
    velocity: note.velocity,
    voice,
    ...(note.move ? { move: note.move } : {}),
    ...(note.fade ? { fade: note.fade } : {}),
    ...(note.slur ? { slur: true } : {}),
    ...(leadsIn ? { leadsIn: true } : {}),
  };
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
  /** The last line before this one fell. */
  let fell = false;
  /** This solo has played its run in double time. */
  let doubled = false;
  /** What the solo played: its first chorus's notes and beats, and the phrase before's. */
  let firstChorus = { notes: 0, beats: 0 };
  let lastPhrase: PlayedPhrase | null = null;
  /** A pickup into the top of a pass, made from the pass before (`passPickup`). */
  const intoPass = (bar: PlanBar, previous: Slot | undefined): PassPickup | null => {
    if (!opensPass(plan, bar)) return null;
    const going =
      previous !== undefined &&
      previous.bars.at(-1)!.index === bar.index - 1 &&
      bar.solo?.chorus !== 0;
    return passPickup(
      world,
      bar,
      memory,
      going ? previous : null,
      // Keyed by its place in the form and the chord it leads into.
      heldRng(rng, "pass pickup", "bar", bar).fork(String(bar.spans[0]?.chord?.root ?? "")),
    );
  };
  const writeLead = (lead: PassPickup, bar: PlanBar): SoloNote[] => {
    const notes = realiseLead(world, lead, bar);
    for (const note of notes) written.push(writtenOf(note, voice, true));
    return notes;
  };
  world.slots.forEach((slot, s) => {
    const first = slot.bars[0]!;
    if (slot.solo !== solo) {
      solo = slot.solo;
      // A new solo remembers nothing of the last but where its last note stopped: a pickup
      // into it leaves that note its breath.
      memory = { ...NOTHING, restEnds: memory.restEnds };
      earlier = [];
      fell = false;
      doubled = false;
      firstChorus = { notes: 0, beats: 0 };
      lastPhrase = null;
    }
    const lead = intoPass(first, world.slots[s - 1]);
    if (slot.index === 0) form = chorusForm(world, rng, slot, memory.motif !== null);
    const role = form[slot.index % form.length] ?? "s";

    const offered = phrasesFor(
      world,
      slot,
      role,
      memory,
      heldRng(rng, "phrase", "phrase", first),
      lead?.first ?? null,
      doubled || !earned(lastPhrase, firstChorus)
        ? null
        : doubleTimeAt(world, s, heldRng(rng, "double time", "phrase", first)),
    );
    // The pass before's pickup into this phrase is played as it was made, whichever is chosen.
    const leading = lead ? writeLead(lead, first) : [];
    const from = leading[0]?.tick;
    // An idea said a beat away keeps every note's length and shake, its last note a pulse
    // shorter at most for its breath; where it cannot, it is not offered (SO-08, SO-17).
    const realised = offered.map((phrase) => realise(world, phrase, accent, from));
    const keeps = offered.map(
      (phrase, i) =>
        (!phrase.inPlace ||
          keepsLengths(realise(world, phrase.inPlace, accent, from), realised[i]!)) &&
        (!phrase.burst || landsHeld(world, phrase.burst.lands, realised[i]!)),
    );
    const phrases = offered.filter((_, i) => keeps[i]);
    const notes = realised.filter((_, i) => keeps[i]);
    const candidates = phrases.map((phrase, i): SoloCandidate => {
      const heard = [...leading, ...notes[i]!].map((note) => sounding(world, note));
      const run = runOf(world, heard);
      return {
        kind: phrase.kind,
        slot,
        notes: heard,
        ...(run && { run }),
        earlier,
        ...(phrase.inPlace && { moved: true }),
        world,
      };
    });
    const chosen = choose(candidates);
    const at = Math.max(0, candidates.indexOf(chosen));
    report?.({ slot, role, candidates: score(candidates, SOLO_FEATURES, weights), chosen });

    const phrase = phrases[at]!;
    // How the horn plays the phrase chosen: what it does with the pitch of the notes it
    // arrives on and of the notes it leaves. Drawn by place, after the choice, so the
    // phrase is the one the critic chose whatever it does.
    const horned = hornMoves(world, slot, notes[at]!, rng, fell);
    // And how a guitarist's left hand plays it: a landing slid into, a note hammered on or
    // pulled off.
    const played = slurs(world, phrase, slideInto(world, phrase, horned.notes, rng), rng);
    lastPhrase = playedIn(slot, played);
    if (slot.chorus === 0) {
      firstChorus = {
        notes: firstChorus.notes + lastPhrase.notes,
        beats: firstChorus.beats + lastPhrase.beats,
      };
    }
    fell = horned.fell;
    if (phrase.burst) doubled = true;
    const opens = slot.bars[0]!.start;
    for (const note of played) {
      // A pickup struck before the phrase's first bar leads into it, from wherever it is played.
      written.push(writtenOf(note, voice, note.tick < opens));
    }
    const last = played.at(-1);
    // A new idea is the idea from now on, wherever in the form it turned up; and so is
    // what was played where the form asked for one stated, changed, set apart or brought
    // back. Said again or answered, the idea stays what it was.
    const stated = memory.motif === null || phrase.fresh || "svcb".includes(role);
    // A phrase with a run in double time is remembered as the line it doubles.
    const kept = phrase.plain ?? phrase;
    earlier = [...earlier, candidates[at]!];
    memory = {
      // The climb to the top note is a use of the idea, not a new one. An idea said a beat
      // away is remembered where it was: what follows is made from it as it was stated.
      motif: slot.peak ? memory.motif : stated ? (phrase.inPlace ?? kept) : memory.motif,
      theme: memory.theme ?? kept,
      opening: slot.index === 0 ? kept : memory.opening,
      rest: last?.pitch ?? memory.rest,
      highest: Math.max(memory.highest, ...played.map((note) => note.pitch)),
      restEnds: last ? last.tick + last.duration : memory.restEnds,
      endedEmpty: phrase.bars.at(-1)?.part === "R",
    };
  });
  // An open jam's next pass is not played, but a pickup into it is the last pass's to play:
  // made as it will be when the jam is made longer.
  const next = plan.lookahead[0];
  if (next?.solo) {
    if (next.solo.chorus === 0) memory = { ...NOTHING, restEnds: memory.restEnds };
    const lead = intoPass(next, world.slots.at(-1));
    if (lead) writeLead(lead, next);
  }
  return written;
}

export const playSolo: Player = (context) => soloPart(context);

/**
 * Whether the phrase in a slot is offered a run in double time, and how long it may be in
 * bars: late in a solo (its last chorus, never its first phrase), earned (at the style's
 * busiest level, or the climb to the top note, straight after a phrase at the busiest level),
 * where the style plays it (the climb alone where it says so), never where the tune ends; on a
 * ballad only from the setting the style says; then as often as the style and the setting say,
 * drawn by the phrase's place. Null where not. Whether one will go, and at what speed, is the
 * phrase's own (`burstOf`).
 */
function doubleTimeAt(world: World, s: number, draw: Rng): number | null {
  const { plan, solo, slots } = world;
  const slot = slots[s]!;
  const before = slots[s - 1];
  const { doubleTime } = solo;
  const busiest = solo.levels.length - 1;
  if (slot.chorus !== slot.of - 1 || slot.first || slot.bars.at(-1)!.ending !== null) return null;
  if (doubleTime.climbOnly && !slot.peak) return null;
  if (levelIndex(solo, slot.level) !== busiest && !slot.peak) return null;
  if (!before || before.solo !== slot.solo || levelIndex(solo, before.level) !== busiest)
    return null;
  const slow = fourPulses(plan, slot.bars[0]!) > solo.tempo.slowBar ? doubleTime.slow : null;
  if (slow && (plan.soloDensity ?? 0.5) < slow.from) return null;
  if (!draw.chance(doubleChanceOf(plan, solo))) return null;
  return slow ? slow.longest : doubleTime.bars.longest;
}

/** What a phrase of the solo played: its notes struck in its own bars, its beats, its empty bars. */
interface PlayedPhrase {
  readonly notes: number;
  readonly beats: number;
  readonly empty: boolean;
}

function playedIn(slot: Slot, notes: readonly SoloNote[]): PlayedPhrase {
  const own = notes.filter((note) => note.tick >= slot.bars[0]!.start);
  return {
    notes: own.length,
    beats: slot.bars.reduce((sum, bar) => sum + bar.ticks, 0) / PPQ,
    empty: slot.bars.some((bar) => !own.some((note) => note.bar === bar)),
  };
}

/**
 * Whether the phrase before has earned a run in double time, judged on what it played: no
 * empty bar, and at least the notes a beat the solo played in its first chorus.
 */
function earned(before: PlayedPhrase | null, first: { notes: number; beats: number }): boolean {
  if (before === null || before.empty || first.beats === 0) return false;
  return before.notes / before.beats >= first.notes / first.beats;
}

/**
 * Whether a run in double time lands held: the note it runs into sounds a pulse at least, as
 * heard, once its breath is taken.
 */
function landsHeld(world: World, at: number, notes: readonly SoloNote[]): boolean {
  const note = notes.find((one) => one.tick === at && !one.lead);
  if (!note) return false;
  const pulse = pulseTicks(note.bar.meter)[0]!;
  return soundsFor(world, note.bar, note.tick, note.duration) >= pulse;
}

/**
 * Whether an idea said a beat away is as long as where it was: the same notes, each
 * sounding as long and shaken where it was shaken; the last may give up a pulse for the
 * breath after it, and is still shaken if it was.
 */
function keepsLengths(was: readonly SoloNote[], now: readonly SoloNote[]): boolean {
  const [from, to] = [was.filter((note) => !note.lead), now.filter((note) => !note.lead)];
  if (from.length !== to.length) return false;
  return to.every((note, i) => {
    const before = from[i]!;
    const last = i === to.length - 1;
    const give = last ? pulseTicks(note.bar.meter)[0]! : 0;
    const shaken = before.move?.vibrato === undefined || note.move?.vibrato !== undefined;
    return note.duration >= before.duration - give && shaken;
  });
}

/**
 * What the phrases of a chorus are for: one form drawn for the chorus, by its pass and
 * its section, from those the style writes for a chorus of its length. With no idea yet
 * to pick up, it opens on a statement. A chorus shorter than the form keeps how it opens
 * and how it closes.
 */
function chorusForm(world: World, rng: Rng, slot: Slot, hasIdea: boolean): readonly Role[] {
  const first = slot.bars[0]!;
  const forms = writtenFor(
    world.solo.forms.filter(
      (option) => option.weight > 0 && (hasIdea || cells(option.phrases)[0] === "s"),
    ),
    slot.count,
  );
  const drawn = rng
    .fork("form", first.pass, first.section.occurrence)
    .weighted(forms.length > 0 ? forms : [{ weight: 1, phrases: "s" }], (f) => f.weight);
  const letters = cells(drawn.phrases) as Role[];
  return slot.count >= letters.length
    ? letters
    : [letters[0]!, ...letters.slice(letters.length - (slot.count - 1))].slice(0, slot.count);
}

/**
 * What the form asked of each phrase of a take's solos, by the index of the phrase's
 * first bar: the letters the soloist played them for. A take is its chart, style,
 * options and seed, and the form is drawn from the seed and the plan alone; the idea in
 * hand when a chorus starts is there once a phrase of the solo that is not the climb to
 * the top note has been played, as the soloist remembers it.
 */
export function soloRoles(plan: Plan, style: StylePack, seed: number | string): Map<number, Role> {
  const world = worldOf(plan, style, new Map());
  const rng = createRng(seed).fork("seat", "solo");
  const roles = new Map<number, Role>();
  let form: readonly Role[] = ["s"];
  let solo = -1;
  let hasIdea = false;
  for (const slot of world.slots) {
    if (slot.solo !== solo) [solo, hasIdea] = [slot.solo, false];
    if (slot.index === 0) form = chorusForm(world, rng, slot, hasIdea);
    if (!slot.peak) hasIdea = true;
    roles.set(slot.bars[0]!.index, form[slot.index % form.length] ?? "s");
  }
  return roles;
}

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
  ends: boolean,
): { move: PitchMove } | undefined {
  const { instrument, solo, ticksPerSecond } = world;
  const seconds = sounds / ticksPerSecond;
  const push = instrument.bend;
  const bends =
    push !== null && bend > 0 && value >= (bend === 1 ? EIGHTH : PPQ) && seconds >= 2 * push.takes;
  const shake = instrument.shake;
  // A guitarist shakes every note held long enough; a horn player the note a phrase ends on.
  const shakes =
    shake !== null &&
    (shake.on === "held"
      ? value >= solo.habits.shake * PPQ && seconds >= shake.after + shake.grows
      : ends && seconds >= (shake.shortest ?? shake.after + shake.grows));
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
function realise(world: World, phrase: Phrase, accent: number, breathedAt?: number): SoloNote[] {
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
  // (Or from a pickup into it played before it.)
  let breathed = breathedAt ?? all[0]?.spot.tick ?? 0;

  return all.flatMap(({ spot, pitch, lead, bend }, i): SoloNote[] => {
    const { bar, tick } = spot;
    const next = all[i + 1];
    const before = all[i - 1];
    // A pickup is played at the line's own level, less its own, whatever the phrase it leads to.
    let level =
      (slot.peak && !lead ? touch.peak : touch.level) + touch.perSemitone * (pitch - home);
    if (spot.hold <= EIGHTH && onAnd(bar.meter, tick - bar.start)) level += touch.offbeat;
    if (before && next && pitch < before.pitch && pitch < next.pitch) level -= touch.valley;
    if (lead) level -= touch.pickup;
    const velocity = Math.round(Math.min(touch.ceiling, Math.max(touch.floor, level)));

    const isFinal = (note: typeof next) =>
      note !== undefined && note.spot.bar.ending !== null && phrase.bars.at(-1)?.part === "F";
    if (!next && isFinal(all[i])) {
      return finalStrikes(bar, tick).map((strike, s, strikes) => {
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
          // A last note held is shaken. (The line never asks for a bend here: SO-57.)
          ...moveOf(
            world,
            bend ?? 0,
            duration,
            soundsFor(world, bar, strike.tick, duration),
            s === strikes.length - 1,
          ),
          value: duration,
          ends: s === strikes.length - 1,
          lead: false,
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
    // A horn whose air is gone before its next note starts breathes before that note: this
    // one is let go early, where it is long enough to give a breath up. It happens where
    // one bar is most of a breath long: a slow tune in six.
    if (next && next.spot.tick - breathed >= lungs) {
      const entry = heard(next.spot.tick, next.spot.bar);
      let until = next.spot.tick - breath;
      while (until > tick && entry - heard(until, bar) < breath) until -= STEP;
      if (until - tick >= STEP) duration = Math.min(duration, until - tick);
    }
    // A breath after it, as heard, and it ends a phrase as heard; the last note of a phrase
    // always has one before whatever follows.
    let ends = !next;
    if (next) {
      const gap = heard(next.spot.tick, next.spot.bar) - heard(tick + duration, bar);
      if (gap >= breath) breathed = next.spot.tick;
      ends = gap >= breath && !lead;
    }
    duration = Math.max(SHORTEST, duration);
    const move = moveOf(world, bend ?? 0, value, soundsFor(world, bar, tick, duration), ends);
    return [
      {
        bar,
        tick,
        duration,
        pitch,
        velocity,
        ...move,
        value: spot.hold,
        ends,
        lead: lead === true,
      },
    ];
  });
}

/**
 * A pickup into the top of a pass, played as a pickup into any phrase is: its
 * notes, as far as the note it leads to on the bar's downbeat.
 */
function realiseLead(world: World, lead: PassPickup, bar: PlanBar): SoloNote[] {
  const into = spotsOf(world, bar, "x")[0];
  if (!into) return [];
  const level = world.solo.levels[0]!;
  const slot: Slot = {
    bars: [bar],
    solo: 0,
    chorus: 0,
    of: 1,
    index: 0,
    count: 1,
    first: false,
    peak: false,
    last: false,
    level,
    room: 0,
    asked: level,
    centre: lead.first,
    low: lead.first,
    high: lead.first,
    top: lead.first,
  };
  const phrase: Phrase = {
    kind: "pickup",
    slot,
    bars: [
      { part: "L", cell: "x", again: false, stab: false, tied: false, pitches: [], bends: [] },
    ],
    line: [{ spot: into, pitch: lead.first }],
    pickup: lead.notes,
    fresh: false,
    lyrical: false,
  };
  return realise(world, phrase, 0).slice(0, lead.notes.length);
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

/** A fall's chance in a section's last two bars, and elsewhere (SO-54). */
const FALL_AT_CLOSE = 1.5;
const FALL_ELSEWHERE = 0.7;
/** And straight after a line that fell (SO-54). */
const FALL_AFTER_FALL = 1 / 3;

/**
 * What a horn does with the pitch of a phrase's notes, on an instrument that
 * scoops and falls (SO-53, SO-54, SO-57). One note it arrives on may be
 * scooped, as often as the style says: struck on a strong beat (the bar's
 * first, or the pulse halfway through it) where the chord changes or where
 * the phrase ends, a quarter note or longer, come to in the line from below or
 * by a leap. A note scooped into stays plain (SO-52): no shake, no fall.
 * A line's last note may fall: a half note or longer, above the line's home,
 * with the band at its working level or above, never one scooped into, never
 * in or into the bar the band ends on, and only where the fall and a breath
 * are over before anything else can be struck: the next note of the phrase,
 * or, after its last, the later half of its last bar, which is as early as a
 * pickup into the next phrase can start (SO-37). It sounds its full length,
 * drops, and dies away as it drops. Every draw is keyed by its place.
 */
function hornMoves(
  world: World,
  slot: Slot,
  notes: readonly SoloNote[],
  rng: Rng,
  fellBefore: boolean,
): { notes: SoloNote[]; fell: boolean } {
  const { instrument, solo, ticksPerSecond, plan } = world;
  const scoop = solo.habits.scoop > 0 ? instrument.scoop : null;
  const fall = solo.habits.fall > 0 ? instrument.fall : null;
  if (scoop === null && fall === null) return { notes: [...notes], fell: false };
  const breath = Math.ceil(
    Math.max(solo.space.breath, instrument.breath?.takes ?? 0) * ticksPerSecond,
  );
  const out = [...notes];

  if (scoop !== null) {
    const arrivals = notes.flatMap((note, i) => {
      const before = notes[i - 1];
      if (!before || note.lead || note.bar.ending !== null) return [];
      if (note.value < PPQ) return [];
      // Come to in the line, as heard: well inside a breath of the note before.
      const heardEnd = before.tick + soundsFor(world, before.bar, before.tick, before.duration);
      if (2 * (note.tick - heardEnd) >= breath) return [];
      // On a strong beat: the bar's first, or the pulse halfway through it.
      const inBar = note.tick - note.bar.start;
      if (inBar !== 0 && (inBar * 2 !== note.bar.ticks || !onPulse(note.bar.meter, inBar)))
        return [];
      // Where the chord changes, or the note a phrase ends on.
      const arrival = world.arrivalAt(note.tick);
      if (!arrival?.chord) return [];
      if (!note.ends && (!arrival.changed || arrival.tick !== note.tick)) return [];
      const by = note.pitch - before.pitch;
      return by > 0 || by <= -3 ? [i] : [];
    });
    const first = slot.bars[0]!;
    const draw = rng.fork("scoop", placeOf(first, first.start));
    if (arrivals.length > 0 && draw.chance(solo.habits.scoop)) {
      const i = draw.pick(arrivals);
      // A scooped note stays plain (SO-52): it is not shaken as well.
      out[i] = {
        ...notes[i]!,
        move: {
          glide: [
            { at: 0, semitones: -scoop.below },
            { at: scoop.takes * ticksPerSecond, semitones: 0 },
          ],
        },
      };
    }
  }

  let fell = fellBefore;
  if (fall !== null) {
    const lastBar = slot.bars.at(-1)!;
    const nextPhrase = lastBar.start + lastBar.ticks / 2;
    const home = instrument.home + solo.lift;
    const drop = Math.round(fall.takes * ticksPerSecond);
    out.forEach((note, i) => {
      if (!note.ends || note.lead) return;
      const before = fell;
      fell = false;
      // A half note or longer in the rhythm, and a dotted quarter at least as heard, its
      // breath taken (SO-54).
      const sounds = soundsFor(world, note.bar, note.tick, note.duration);
      if (note.move?.glide || note.value < 2 * PPQ || sounds < 1.5 * PPQ) return;
      if (note.pitch <= home) return;
      if ((note.bar.seats.solo ?? note.bar.energy) < TIER_MID) return;
      const over = note.tick + sounds + drop + breath;
      if (over > (out[i + 1]?.tick ?? nextPhrase)) return;
      if (!plan.open && over > plan.ticks) return;
      for (let b = note.bar.index; b < plan.bars.length; b++) {
        const bar = plan.bars[b]!;
        if (bar.start >= over) break;
        if (bar.ending !== null || bar.kind !== "music") return;
      }
      const closing = note.bar.barInSection >= note.bar.section.bars - 2;
      const chance =
        solo.habits.fall *
        (closing ? FALL_AT_CLOSE : FALL_ELSEWHERE) *
        (before ? FALL_AFTER_FALL : 1);
      if (!rng.fork("fall", placeOf(note.bar, note.tick)).chance(chance)) return;
      fell = true;
      out[i] = {
        ...note,
        move: {
          ...note.move,
          glide: [
            { at: sounds, semitones: 0 },
            { at: sounds + drop, semitones: -fall.semitones },
          ],
        },
        fade: drop,
      };
    });
  }
  return { notes: out, fell };
}

/**
 * Where a slide into a note may start (SO-56), within two frets: by the
 * note's distance above the chord's root and its role in the chord, the
 * semitones from it to the start. From below, the flat 7th up to the root,
 * the 4th up to the 5th, the 2nd up to a major 3rd, and the one slide of a
 * single fret, the minor 3rd up to the major; from above, the 2nd down to
 * the root, the 6th to the 5th, the 4th to a minor 3rd, the root to the
 * flat 7th. SO-56's longer slides (three to five frets) are not played.
 */
const SLIDE_STARTS: readonly { into: number; role: ToneRole; by: number }[] = [
  { into: 0, role: "root", by: -2 },
  { into: 7, role: "fifth", by: -2 },
  { into: 4, role: "third", by: -2 },
  { into: 4, role: "third", by: -1 },
  { into: 0, role: "root", by: 2 },
  { into: 7, role: "fifth", by: 2 },
  { into: 3, role: "third", by: 2 },
  { into: 10, role: "seventh", by: 2 },
];

/**
 * The starts a hand may slide into a note from, in semitones from it: a
 * tone of the style's notes over the chord, never one that only passes
 * (SU-B-17: never a chromatic note chosen by distance), except the minor
 * third a fret under the major, which SO-56 allows as it is; on the
 * instrument. From below where there is a start below (SO-56: mostly from
 * below), else from above.
 */
function slideStarts(world: World, arrival: Arrival, pitch: number, into: "landing" | "third") {
  const pool = world.poolOf(arrival);
  const chord = arrival.chord;
  if (!pool || !chord) return [];
  const interval = mod12(pitch - pitchClass(chord.root));
  const role = pool.tones.find((tone) => tone.pc === mod12(pitch))?.role;
  const [low, high] = world.instrument.range;
  const starts = SLIDE_STARTS.filter((start) => {
    if (start.into !== interval || start.role !== role) return false;
    if (into === "third" && start.by !== -1) return false;
    const from = pitch + start.by;
    if (from < low || from > high) return false;
    return start.by === -1 || (pool.ladder.includes(from) && !onlyPasses(pool, from));
  }).map((start) => start.by);
  const below = starts.filter((by) => by < 0);
  return below.length > 0 ? below : starts;
}

/**
 * Glide points that stand on each fret in turn, `from` semitones away to the
 * note, jumping between: on the note at `arrive` ticks, each fret before it
 * held `each`, the first from the strike until its turn comes.
 */
function frets(from: number, each: number, arrive: number, jump: number): GlidePoint[] {
  const count = Math.abs(from);
  const way = Math.sign(from);
  const points: GlidePoint[] = [{ at: 0, semitones: from }];
  for (let j = 1; j <= count; j++) {
    const at = arrive - (count - j) * each;
    points.push({ at: at - jump, semitones: from - way * (j - 1) });
    points.push({ at, semitones: from - way * j });
  }
  return points;
}

/**
 * A guitarist's slide (SO-56, SO-57), on an instrument whose hand slides, as
 * often as the style says, in a phrase the hand gets lyrical in, as bends
 * are (KF-B-10): one landing of the phrase at most, a note of an
 * eighth or longer struck where the chord changes, that is not bent, not a
 * pickup and not in the bar the band ends on, slid into from a fret or two
 * away (`slideStarts`). It is struck on its beat at the start fret and
 * stands on each fret in turn, in the hand's seconds; a note held long
 * enough is still shaken, from where the shake starts, after it has
 * arrived. A slide moves no note: the phrase is the one the critic chose.
 * Drawn by the phrase's place.
 */
function slideInto(world: World, phrase: Phrase, notes: readonly SoloNote[], rng: Rng): SoloNote[] {
  const { instrument, solo, ticksPerSecond } = world;
  const hand = instrument.slide;
  const habit = solo.habits.slide;
  // Slides come where bends do: in a phrase the hand gets lyrical in (KF-B-10).
  if (hand === null || habit.chance <= 0 || !phrase.lyrical) return [...notes];
  const candidates = notes.flatMap((note, i) => {
    if (note.lead || note.bar.ending !== null || note.value < EIGHTH || note.move?.glide) return [];
    const arrival = world.arrivalAt(note.tick);
    if (!arrival?.chord || !arrival.changed || arrival.tick !== note.tick) return [];
    // A hand moves in seconds: the note has to sound as long again once it has arrived.
    const sounds = soundsFor(world, note.bar, note.tick, note.duration) / ticksPerSecond;
    const starts = slideStarts(world, arrival, note.pitch, habit.into).filter(
      (by) => sounds >= 2 * (Math.abs(by) === 1 ? hand.oneFret : 2 * hand.fret),
    );
    return starts.length > 0 ? [{ i, starts }] : [];
  });
  if (candidates.length === 0) return [...notes];
  const first = phrase.slot.bars[0]!;
  const draw = rng.fork("slide", placeOf(first, first.start));
  if (!draw.chance(habit.chance)) return [...notes];
  const { i, starts } = draw.pick(candidates);
  const by = draw.pick(starts);
  const note = notes[i]!;
  const [each, arrive] =
    Math.abs(by) === 1 ? [hand.oneFret, hand.oneFret] : [hand.fret, 2 * hand.fret];
  const glide = frets(by, each * ticksPerSecond, arrive * ticksPerSecond, JUMP * ticksPerSecond);
  const out = [...notes];
  out[i] = { ...note, move: { ...note.move, glide } };
  return out;
}

/**
 * A guitarist's hammer-on and pull-off, on an instrument whose hand sounds a
 * note without striking it, each as often as the style says: one of each in
 * a phrase at most. Two notes of the line become one struck string: a note
 * of an eighth or shorter, held into the next and no longer than it, that
 * steps a fret or two to it, up (a hammer-on) or down (a pull-off); the next
 * is not struck. Neither is bent or slid, nor struck where the chord changes
 * (a landing keeps its attack), nor a pickup, nor in the bar the band ends
 * on; the first is not the phrase's first note, and no breath comes between
 * them. Where a phrase has both, at least one struck note stands between the
 * two pairs: never three notes on one strike, nor a trill (SO-28). The notes
 * are the line's: only whether the second is struck changes. Drawn by the
 * phrase's place, after the critic has chosen it.
 */
function slurs(world: World, phrase: Phrase, notes: readonly SoloNote[], rng: Rng): SoloNote[] {
  const { instrument, solo } = world;
  const { hammerOn, pullOff } = solo.habits;
  if (!instrument.hammers || (hammerOn <= 0 && pullOff <= 0)) return [...notes];
  const landing = (note: SoloNote) => {
    const arrival = world.arrivalAt(note.tick);
    return arrival?.changed === true && arrival.tick === note.tick;
  };
  const plain = (note: SoloNote) =>
    !note.lead && !note.move?.glide && note.bar.ending === null && !landing(note);
  // The first note of each pair that may be one string, by the index of the first.
  const pairs = notes.flatMap((first, i) => {
    const second = notes[i + 1];
    const before = notes[i - 1];
    if (!second || !before || before.ends || first.ends) return [];
    if (!plain(first) || !plain(second) || before.lead) return [];
    if (first.value > EIGHTH || first.value > second.value) return [];
    if (second.tick !== first.tick + first.value) return [];
    const step = second.pitch - first.pitch;
    return Math.abs(step) === 1 || Math.abs(step) === 2 ? [{ i, up: step > 0 }] : [];
  });
  if (pairs.length === 0) return [...notes];
  const first = phrase.slot.bars[0]!;
  const place = placeOf(first, first.start);
  const out = [...notes];
  let hammered: number | undefined;
  const hammer = rng.fork("hammer-on", place);
  const ups = pairs.filter((pair) => pair.up);
  if (ups.length > 0 && hammer.chance(hammerOn)) {
    hammered = hammer.pick(ups).i;
    out[hammered + 1] = { ...out[hammered + 1]!, slur: true };
  }
  const pull = rng.fork("pull-off", place);
  const downs = pairs.filter(
    (pair) => !pair.up && (hammered === undefined || Math.abs(pair.i - hammered) >= 3),
  );
  if (downs.length > 0 && pull.chance(pullOff)) {
    const i = pull.pick(downs).i;
    out[i + 1] = { ...out[i + 1]!, slur: true };
  }
  return out;
}
