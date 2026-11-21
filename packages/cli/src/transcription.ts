// A take as a transcription: bar by bar, each seat as a musician would write
// it down, for a reader who knows music and cannot hear. Pure: the same take,
// style and options give the same text. `ensemble read` prints it.
//
// The counting, the roles, the moves and the marks are explained in the
// header the text opens with, so the text can be read without this file.

import type {
  ChartChord,
  Meter,
  NoteEvent,
  Plan,
  PlanBar,
  Seat,
  SoloInstrument,
  StylePack,
  Take,
  TakeOptions,
} from "@ensemble/engine";
import {
  chordText,
  chordTones,
  isCompound,
  type KIT,
  keyLeansFlat,
  keyToString,
  meterName,
  mod12,
  noteNameToString,
  PPQ,
  pitchClass,
  planBar,
  pulseTicks,
  SOLO_INSTRUMENTS,
  spellPitchClass,
} from "@ensemble/engine";

export interface ReadOptions {
  /** The chart's file name, for the header. */
  readonly chartName: string;
  /** The options the take was played with. */
  readonly options: TakeOptions;
  /** Only these bars, by the numbers the text gives them (first and last, inclusive). */
  readonly bars?: readonly [number, number];
  /** Only these seats. */
  readonly seats?: readonly Seat[];
  /** Add how far each note was played from the grid, in ticks. */
  readonly timing?: boolean;
}

/** No line longer than this: a long seat line wraps with a hanging indent. */
export const LINE_LIMIT = 160;

const SEATS: readonly Seat[] = ["drums", "bass", "chords", "solo"];
const LABEL = 7;

/** A drum stroke this much louder than the median stroke of its voice in the bar is an accent. */
const ACCENT_OVER_MEDIAN = 1.15;

/** The drum voices as the text names them, in the order a line lists them. */
const DRUM_NAMES: readonly (readonly [voice: keyof typeof KIT, name: string])[] = [
  ["kick", "kick"],
  ["snare", "snare"],
  ["ghostSnare", "snare"],
  ["crossStick", "xstick"],
  ["closedHat", "hat"],
  ["pedalHat", "pedal"],
  ["openHat", "open"],
  ["ride", "ride"],
  ["rideBell", "bell"],
  ["crash", "crash"],
  ["highTom", "tom1"],
  ["midTom", "tom2"],
  ["lowTom", "floor"],
  ["shaker", "shaker"],
  ["sticks", "sticks"],
];
const DRUM_ORDER = [...new Set(DRUM_NAMES.map(([, name]) => name))];
const drumName = (voice: string | undefined): string =>
  DRUM_NAMES.find(([v]) => v === voice)?.[1] ?? voice ?? "drum";

// ---------------------------------------------------------------------------
// Numbers and names

const num = (value: number): string => String(Number(value.toFixed(2)));

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Where a tick from the barline is, in the bar's own counting. A quarter-note
 * pulse: `3`, `3e`, `3&`, `3a`, and the triplet's middle and last `3t`, `3l`.
 * A dotted-quarter pulse: `2`, `2la`, `2li`, and a sixteenth after any of them
 * `2+`, `2la+`, `2li+`. Anything else: the pulse and the fraction of it, `3+5/12`.
 */
export function position(meter: Meter, tickInBar: number): string {
  const pulses = pulseTicks(meter);
  let start = 0;
  let beat = 0;
  while (beat < pulses.length - 1 && tickInBar >= start + pulses[beat]!) start += pulses[beat++]!;
  const into = tickInBar - start;
  const length = pulses[beat]!;
  const n = beat + 1;
  if (length === PPQ) {
    const quarter: Record<number, string> = {
      0: "",
      120: "e",
      160: "t",
      240: "&",
      320: "l",
      360: "a",
    };
    if (into in quarter) return `${n}${quarter[into]}`;
  } else if (length === PPQ * 1.5) {
    const dotted: Record<number, string> = {
      0: "",
      120: "+",
      240: "la",
      360: "la+",
      480: "li",
      600: "li+",
    };
    if (into in dotted) return `${n}${dotted[into]}`;
  }
  const whole = Math.round(into);
  const d = gcd(whole, length);
  return `${n}+${whole / d}/${length / d}`;
}

/** The unit a length is counted in: the eighth in compound time, else the quarter. */
const lengthUnit = (meter: Meter): number => (isCompound(meter) ? PPQ / 2 : PPQ);

function pitchName(pitch: number, flat: boolean): string {
  return (
    noteNameToString(spellPitchClass(pitch, flat ? "flat" : "sharp")) + (Math.floor(pitch / 12) - 1)
  );
}

const TONE_NAMES: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  root: { 0: "R" },
  third: { 3: "b3", 4: "3" },
  sus: { 2: "2", 5: "4" },
  fifth: { 6: "b5", 7: "5", 8: "#5" },
  sixth: { 9: "6" },
  seventh: { 9: "bb7", 10: "b7", 11: "7" },
  ninth: { 13: "b9", 14: "9", 15: "#9" },
  eleventh: { 17: "11", 18: "#11" },
  thirteenth: { 20: "b13", 21: "13" },
};
const PLAIN = ["R", "b9", "9", "b3", "3", "4", "b5", "5", "#5", "6", "b7", "7"];

/**
 * A pitch's role against a chord, by its distance above the root: the tone's
 * name where the symbol has it (`b3`, `#9`, `13`), else the interval with `*`.
 */
export function role(pitch: number, chord: ChartChord | null): string {
  if (!chord) return "-";
  const interval = mod12(pitch - pitchClass(chord.root));
  const tones = chordTones(chord.quality);
  const tone = tones.find((t) => mod12(t.interval) === interval);
  if (tone) return TONE_NAMES[tone.role]?.[tone.interval] ?? PLAIN[interval]!;
  const has = (i: number) => tones.some((t) => mod12(t.interval) === i);
  const name =
    interval === 3 && has(4)
      ? "#9"
      : interval === 6 && has(7)
        ? "#11"
        : interval === 8 && has(7)
          ? "b13"
          : interval === 9 && (has(10) || has(11))
            ? "13"
            : PLAIN[interval]!;
  return `${name}*`;
}

const isTone = (pitch: number, chord: ChartChord | null): boolean =>
  chord !== null &&
  chordTones(chord.quality).some(
    (t) => mod12(t.interval) === mod12(pitch - pitchClass(chord.root)),
  );

/** What a note does with its pitch, named from how the soloist shapes it (`players/solo`). */
function moves(
  note: NoteEvent,
  before: NoteEvent | undefined,
  hand: SoloInstrument | null,
): string[] {
  const names: string[] = [];
  const glide = note.move?.glide;
  if (glide && glide.length > 0) {
    const first = glide[0]!;
    const last = glide.at(-1)!;
    const steps = glide.every((p) => Number.isInteger(p.semitones));
    if (glide.length === 2 && first.at === 0 && first.semitones < 0 && last.semitones === 0) {
      // Struck under the note and brought up to it: a guitar's bend, a horn's scoop.
      const by = num(-first.semitones);
      names.push(hand?.bend ? `bend${by}` : hand?.scoop ? `scoop${by}` : "move");
    } else if (first.semitones === 0 && last.semitones < 0 && glide.length === 2) {
      names.push(`fall${num(-last.semitones)}`);
    } else if (
      glide.length >= 3 &&
      first.at === 0 &&
      last.semitones === 0 &&
      steps &&
      Math.abs(first.semitones) <= 2 &&
      first.semitones !== 0 &&
      hand?.slide
    ) {
      // Stepped onto the note a fret at a time: from below is `slide-2`, from above `slide+2`.
      names.push(`slide${first.semitones > 0 ? "+" : ""}${first.semitones}`);
    } else names.push("move");
  }
  if (note.move?.vibrato) names.push("shake");
  if (note.fade !== undefined && !names.some((n) => n.startsWith("fall"))) names.push("fade");
  if (note.slur)
    names.push(before === undefined ? "slur" : note.pitch >= before.pitch ? "hammer" : "pull");
  return names;
}

// ---------------------------------------------------------------------------
// The bars

interface Placed {
  readonly note: NoteEvent;
  readonly bar: PlanBar;
  readonly at: number;
}

function barOf(plan: Plan, tick: number): PlanBar | undefined {
  const bars = plan.bars;
  let lo = 0;
  let hi = bars.length - 1;
  if (hi < 0 || tick < bars[0]!.start) return undefined;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bars[mid]!.start <= tick) lo = mid;
    else hi = mid - 1;
  }
  return bars[lo];
}

function chordAt(bar: PlanBar, at: number): ChartChord | null {
  let chord: ChartChord | null = null;
  for (const span of bar.spans) if (span.start <= at) chord = span.chord;
  return chord;
}

/** The next change of chord after a place in a bar, within the bar or at the next bar line. */
function nextChange(
  plan: Plan,
  bar: PlanBar,
  at: number,
): { at: number; chord: ChartChord } | null {
  for (const span of bar.spans)
    if (span.start > at && !span.tied && span.chord) return { at: span.start, chord: span.chord };
  const next = planBar(plan, bar.index + 1);
  const first = next?.spans[0];
  if (next && next.kind === "music" && first && !first.tied && first.chord)
    return { at: bar.ticks, chord: first.chord };
  return null;
}

/**
 * The chord a sounding group is read against: the one under it, or the one
 * coming when it is struck within an eighth before a change and more of its
 * pitches belong to that one (a push, an anticipation). True for the second.
 */
function heardAgainst(
  plan: Plan,
  bar: PlanBar,
  at: number,
  pitches: readonly number[],
): { chord: ChartChord | null; ahead: boolean } {
  const under = chordAt(bar, at);
  const next = nextChange(plan, bar, at);
  if (next && next.at - at <= PPQ / 2) {
    const fits = (chord: ChartChord | null) => pitches.filter((p) => isTone(p, chord)).length;
    if (fits(next.chord) > fits(under)) return { chord: next.chord, ahead: true };
  }
  return { chord: under, ahead: false };
}

function chordsOf(bar: PlanBar): string {
  return bar.spans
    .map((span) => {
      const name = span.chord ? chordText(span.chord) : "N.C.";
      const shown = span.tied ? `(${name})` : name;
      return span.start === 0 ? shown : `${shown}@${position(bar.meter, span.start)}`;
    })
    .join(" ");
}

function marksOf(bar: PlanBar, firstOfLast: boolean): string[] {
  const marks: string[] = [];
  if (bar.solo) marks.push(`solo ${bar.solo.chorus + 1}/${bar.solo.of}`);
  if (bar.crash) marks.push("crash");
  if (bar.fill) marks.push(`fill ${bar.fill.boundary}${bar.fill.top ? " top" : ""}`);
  if (firstOfLast) marks.push("last pass");
  if (bar.ending) {
    const { gesture, at, ring } = bar.ending;
    const kind = gesture.kind === "hits" ? `hits ${gesture.beats.join(",")}` : gesture.kind;
    marks.push(`ending ${kind}@${position(bar.meter, at)} rings ${num(ring / PPQ)}`);
  }
  return marks;
}

/** Pieces packed into lines of at most the limit, each line after the first under a hanging indent. */
function packed(label: string, pieces: readonly string[]): string[] {
  const lines: string[] = [];
  let line = label.padEnd(LABEL);
  let empty = true;
  for (const piece of pieces) {
    const text = empty ? piece.replace(/^(, | · )/, "") : piece;
    if (!empty && line.length + text.length > LINE_LIMIT) {
      lines.push(line.trimEnd());
      line = " ".repeat(LABEL) + piece.replace(/^(, | · )/, "");
      continue;
    }
    line += text;
    empty = false;
  }
  lines.push(line.trimEnd());
  return lines;
}

// ---------------------------------------------------------------------------
// The text

export function transcription(take: Take, style: StylePack, read: ReadOptions): string {
  const { plan } = take;
  const { options } = read;
  const timing = read.timing === true;
  const shown = new Set(read.seats && read.seats.length > 0 ? read.seats : SEATS);
  const countIns = plan.bars.filter((bar) => bar.kind === "count-in").length;
  const numberOf = (bar: PlanBar) => bar.index - countIns + 1;
  const instrumentName = options.soloInstrument ?? style.solo.instrument;
  const hand = SOLO_INSTRUMENTS[instrumentName] ?? Object.values(SOLO_INSTRUMENTS)[0] ?? null;
  const offset = (note: NoteEvent) =>
    timing ? `@${note.offset >= 0 ? "+" : ""}${Math.round(note.offset)}` : "";

  // Every note in the bar it starts in.
  const placed = new Map<number, Placed[]>();
  for (const event of take.events) {
    if (event.kind !== "note") continue;
    const bar = barOf(plan, event.tick);
    if (!bar) continue;
    const list = placed.get(bar.index) ?? [];
    list.push({ note: event, bar, at: event.tick - bar.start });
    placed.set(bar.index, list);
  }
  for (const list of placed.values())
    list.sort((a, b) => a.note.tick - b.note.tick || a.note.pitch - b.note.pitch);

  // The soloist's phrases, numbered across the take: a rest of a beat or more ends one.
  const phraseOf = new Map<NoteEvent, number>();
  const beforeOf = new Map<NoteEvent, NoteEvent>();
  {
    let phrase = 0;
    let end = Number.NEGATIVE_INFINITY;
    let before: NoteEvent | undefined;
    for (const bar of plan.bars) {
      for (const { note } of placed.get(bar.index) ?? []) {
        if (note.seat !== "solo") continue;
        if (note.tick - end >= pulseTicks(bar.meter)[0]!) phrase++;
        phraseOf.set(note, phrase);
        if (before) beforeOf.set(note, before);
        before = note;
        end = Math.max(end, note.tick + note.duration);
      }
    }
  }

  const music = plan.bars.filter((bar) => bar.kind === "music");
  const first = music[0];
  const meter = first?.meter ?? take.chart.meter;
  const key = first?.key ?? take.chart.key;
  const out: string[] = [];

  // The header.
  const pulse = isCompound(meter) ? "a dotted quarter" : "a quarter";
  out.push(
    `${read.chartName}: ${style.name}, ${plan.tempo} bpm (${pulse}), ${meterName(meter)}, key ${keyToString(key)}, seed ${options.seed}`,
  );
  const said: string[] = [plan.mode === "song" ? "song" : "jam"];
  said.push(`${plan.passes} ${plan.passes === 1 ? "pass" : "passes"}`);
  if (options.minutes !== undefined && options.passes === undefined)
    said.push(`asked for ${options.minutes} min`);
  said.push(`${music.length} bars of music`);
  if (options.tempo !== undefined) said.push(`tempo set to ${options.tempo}`);
  if (options.energy !== undefined) said.push(`energy held at ${options.energy}`);
  if (options.key) said.push(`played in ${keyToString(options.key)}`);
  if (options.solo) {
    said.push(
      `soloist ${instrumentName}` +
        (options.soloDensity === undefined ? "" : `, density ${options.soloDensity}`) +
        (options.soloFromTop ? ", from the top" : ""),
    );
  } else said.push("no soloist");
  if (options.without && options.without.length > 0)
    said.push(`without ${options.without.join(", ")}`);
  if (options.countIn === false) said.push("no count-in");
  out.push(said.join("; "));
  if (timing) {
    const ms = 60000 / (plan.quarters * PPQ);
    out.push(
      `timing: @+N after a note is where it was played, in ticks from the grid; a tick is ${Number(ms.toFixed(3))} ms (${PPQ} to the quarter)`,
    );
  }
  out.push(
    isCompound(meter)
      ? "count: pulses 1 2 (dotted quarters), eighths 1 1la 1li, a sixteenth after any +; 1+2/9 is off that grid; lengths in eighths"
      : "count: beats 1 2 3 4, sixteenths 1e 1& 1a, triplet eighths 1t 1l; 3+5/12 is off that grid; lengths in quarters",
  );
  out.push(
    "bar: number · pass · section bar/of · chords@where · energy · marks. bass, solo: where pitch role length (as sounded) velocity moves",
  );
  out.push(
    "roles from the chord's root; * not a tone of the symbol; ^ read against the chord coming (struck within an eighth before it)",
  );
  out.push(
    "chords: a strike is the notes struck together, low to high pitch:role; = the same notes as the strike before; x muted, pick plucked",
  );
  out.push(
    `drums: each voice and where it strikes; (ghost) the ghost snare; >accent ${Math.round((ACCENT_OVER_MEDIAN - 1) * 100)}% over the voice's median in the bar`,
  );
  out.push(
    "moves: bendN scoopN (struck N under), slide-N slide+N (from N frets under, over), fallN, shake, hammer, pull, fade, move (unnamed); x dead",
  );
  out.push("solo phrases: §N starts phrase N of the take; | a rest of a beat or more");

  // The bars.
  const lastPassAt = plan.bars.find((bar) => bar.kind === "music" && bar.lastPass)?.index;
  for (const bar of plan.bars) {
    const notes = placed.get(bar.index) ?? [];
    const number = numberOf(bar);
    if (read.bars && (number < read.bars[0] || number > read.bars[1])) continue;
    if (bar.kind === "count-in" && !notes.some((p) => p.note.voice !== "sticks")) continue;
    if (bar.kind === "tail" && notes.length === 0) continue;

    const head = [`bar ${number}`];
    if (bar.kind !== "music") head.push(bar.kind);
    else {
      head.push(`pass ${bar.pass + 1}`);
      head.push(`${bar.section.label} ${bar.barInSection + 1}/${bar.section.bars}`);
      head.push(chordsOf(bar));
      head.push(`energy ${num(bar.energy)}`);
    }
    if (meterName(bar.meter) !== meterName(meter)) head.push(meterName(bar.meter));
    if (keyToString(bar.key) !== keyToString(key)) head.push(`key ${keyToString(bar.key)}`);
    head.push(...marksOf(bar, bar.index === lastPassAt));
    out.push(head.join(" · "));

    const flat = keyLeansFlat(bar.key);
    const unit = lengthUnit(bar.meter);
    const where = (at: number) => position(bar.meter, at);
    for (const seat of SEATS) {
      if (!shown.has(seat)) continue;
      const own = notes.filter((p) => p.note.seat === seat);
      if (own.length === 0) continue;
      if (seat === "drums") out.push(...packed("drums", drumPieces(own, where, offset)));
      else if (seat === "chords")
        out.push(...packed("chords", strikePieces(plan, own, flat, unit, where, offset)));
      else {
        const pieces = own.map(({ note, at }, i) => {
          const heard = heardAgainst(plan, bar, at, [note.pitch]);
          const named = [
            where(at) + offset(note),
            pitchName(note.pitch, flat),
            role(note.pitch, heard.chord) + (heard.ahead ? "^" : ""),
            num(note.duration / unit),
            `v${note.velocity}`,
            ...(note.voice === "dead" ? ["x"] : []),
            ...moves(note, beforeOf.get(note), seat === "solo" ? hand : null),
          ].join(" ");
          if (seat !== "solo") return i === 0 ? named : `, ${named}`;
          const phrase = phraseOf.get(note)!;
          const before = beforeOf.get(note);
          const starts = before === undefined || phraseOf.get(before) !== phrase;
          if (!starts) return i === 0 ? named : `, ${named}`;
          return i === 0 ? `§${phrase} ${named}` : ` | §${phrase} ${named}`;
        });
        out.push(...packed(seat, pieces));
      }
    }
  }
  return `${out.join("\n")}\n`;
}

function drumPieces(
  own: readonly Placed[],
  where: (at: number) => string,
  offset: (note: NoteEvent) => string,
): string[] {
  const byName = new Map<string, Placed[]>();
  for (const p of own) {
    const name = drumName(p.note.voice);
    byName.set(name, [...(byName.get(name) ?? []), p]);
  }
  const names = [...byName.keys()].sort(
    (a, b) => (DRUM_ORDER.indexOf(a) + 1 || 99) - (DRUM_ORDER.indexOf(b) + 1 || 99),
  );
  const pieces: string[] = [];
  for (const name of names) {
    const strokes = byName.get(name)!;
    const levels = strokes.map((p) => p.note.velocity).sort((a, b) => a - b);
    const median = levels[Math.floor((levels.length - 1) / 2)]!;
    strokes.forEach((p, i) => {
      const at = where(p.at) + offset(p.note);
      const ghost = p.note.voice === "ghostSnare";
      const accent = !ghost && levels.length >= 3 && p.note.velocity >= median * ACCENT_OVER_MEDIAN;
      const stroke = ghost ? `(${at})` : accent ? `>${at}` : at;
      pieces.push(i === 0 ? `${pieces.length === 0 ? "" : " · "}${name} ${stroke}` : ` ${stroke}`);
    });
  }
  return pieces;
}

function strikePieces(
  plan: Plan,
  own: readonly Placed[],
  flat: boolean,
  unit: number,
  where: (at: number) => string,
  offset: (note: NoteEvent) => string,
): string[] {
  // Notes struck together, on the straight grid: a strum's strokes and a rolled chord share a place.
  const strikes: Placed[][] = [];
  for (const p of own) {
    const last = strikes.at(-1);
    if (last && last[0]!.note.tick === p.note.tick) last.push(p);
    else strikes.push([p]);
  }
  let before = "";
  return strikes.map((strike, i) => {
    const { bar, at } = strike[0]!;
    const pitches = strike.map((p) => p.note.pitch).sort((a, b) => a - b);
    const heard = heardAgainst(plan, bar, at, pitches);
    const notes = pitches.map((p) => `${pitchName(p, flat)}:${role(p, heard.chord)}`).join(" ");
    const same = notes === before;
    before = notes;
    const length = Math.max(...strike.map((p) => p.note.duration));
    const level = Math.max(...strike.map((p) => p.note.velocity));
    const voices = new Set(strike.map((p) => p.note.voice));
    const text = [
      where(at) + offset(strike[0]!.note) + (heard.ahead ? "^" : ""),
      same ? "=" : notes,
      num(length / unit),
      `v${level}`,
      ...(voices.has("muted") ? ["x"] : []),
      ...(voices.has("picked") ? ["pick"] : []),
    ].join(" ");
    return i === 0 ? text : `, ${text}`;
  });
}
