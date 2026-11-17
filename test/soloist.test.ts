// Musical properties of the soloist, and of the piano around the soloist. See
// docs/TESTING.md, kind 2. Each test names its rule; none of them knows how the engine is built.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlanBar, Take } from "@ensemble/engine";
import {
  chordScale,
  chordTones,
  contextOf,
  isCompound,
  MEASURES,
  onPulse,
  PPQ,
  parse,
  pitchClass,
  plan,
  pulseTicks,
  render,
  SOLO_INSTRUMENTS,
  swing,
  tierOf,
} from "@ensemble/engine";
import { chordsUnder, harmonyOf, POCKET, strikesOf } from "./reading.ts";
import {
  enough,
  FULL,
  type Jam,
  type JamSpec,
  notesOf,
  only,
  ownCharts,
  SEEDS,
  STYLES,
  soloistTakes,
  stressTakes,
  takes,
  written,
} from "./takes.ts";

// ── the soloist ─────────────────────────────────────────────────────────────

test("the soloist is off unless asked for; asked for, it rests through the intro and a written ending, lays out and returns, and never solos more than three choruses in a row", () => {
  for (const style of STYLES) {
    for (const chart of ownCharts(style)) {
      const written = parse(chart.text).chart;
      for (const passes of [1, 2, 3, 4, 6, 9]) {
        const without = plan(written, style, { mode: "jam", passes });
        assert.ok(
          without.bars.every((bar) => bar.solo === null && bar.seats.solo === null),
          `${chart.file}: a soloist nobody asked for`,
        );

        const roadmap = plan(written, style, { mode: "jam", passes, solo: true });
        const where = `${chart.file}, ${passes} passes`;
        const byPass = new Map<number, PlanBar[]>();
        for (const bar of roadmap.bars) {
          assert.equal(bar.solo !== null, bar.seats.solo !== null, `${where}: bar ${bar.index}`);
          if (bar.kind !== "music" || bar.section.role !== "body") {
            assert.equal(bar.solo, null, `${where}: a solo outside the form, bar ${bar.index}`);
          } else {
            byPass.set(bar.pass, [...(byPass.get(bar.pass) ?? []), bar]);
          }
        }
        // A pass is all solo or all rest, and one chorus of the solo throughout.
        const turns = [...byPass.values()].map((bars) => {
          const marks = new Set(bars.map((bar) => JSON.stringify(bar.solo)));
          assert.equal(marks.size, 1, `${where}: a pass that changes its mind`);
          return bars[0]!.solo;
        });
        assert.ok(
          turns.some((turn) => turn !== null),
          `${where}: the soloist never plays`,
        );
        if (passes >= 2) assert.equal(turns[0], null, `${where}: the band states the form first`);
        let run = 0;
        turns.forEach((turn, pass) => {
          run = turn ? run + 1 : 0;
          assert.ok(run <= 3, `${where}: more than three choruses in a row`);
          if (!turn) return;
          // The solo counts its choruses in order and knows how many it has.
          assert.equal(turn.chorus, run - 1, `${where}: pass ${pass} is chorus ${turn.chorus}`);
          const left = turns.slice(pass).indexOf(null);
          const remaining = left < 0 ? turns.length - pass : left;
          assert.equal(turn.of, turn.chorus + remaining, `${where}: pass ${pass} of ${turn.of}`);
        });
        if (passes >= 6) {
          assert.ok(turns.slice(1).includes(null), `${where}: the soloist never lays out`);
        }

        // An open jam's solo does not depend on how long the jam turns out to be.
        const open = (n: number) =>
          plan(written, style, { mode: "jam", open: true, passes: n, solo: true }).bars;
        const shorter = open(passes);
        assert.deepEqual(
          open(passes + 1)
            .slice(0, shorter.length)
            .map((bar) => bar.solo),
          shorter.map((bar) => bar.solo),
          `${where}: an open jam's solos moved when it grew`,
        );
      }
    }
  }
});

test("the band builds with the solo: it never comes down from one chorus of a solo to the next, and under the last of three it is louder than under the first", () => {
  for (const style of STYLES) {
    for (const chart of ownCharts(style)) {
      const written = parse(chart.text).chart;
      for (const passes of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20]) {
        const roadmap = plan(written, style, { mode: "jam", passes, solo: true });
        const level = new Map<number, number[]>();
        const mark = new Map<number, NonNullable<PlanBar["solo"]>>();
        for (const bar of roadmap.bars) {
          if (!bar.solo) continue;
          level.set(bar.pass, [...(level.get(bar.pass) ?? []), bar.energy]);
          mark.set(bar.pass, bar.solo);
        }
        const mean = (pass: number) => {
          const values = level.get(pass)!;
          return values.reduce((sum, value) => sum + value, 0) / values.length;
        };
        for (const [pass, solo] of mark) {
          // A band that takes its breath under the middle of a solo is pulling against it.
          if (solo.chorus > 0) {
            assert.ok(
              mean(pass) >= mean(pass - 1) - 1e-9,
              `${chart.file}, ${passes} passes: the band comes down under the solo at pass ${pass}`,
            );
          }
          if (solo.chorus !== 0 || solo.of === 1) continue;
          const last = pass + solo.of - 1;
          const where = `${chart.file}, ${passes} passes, the solo from pass ${pass}`;
          assert.ok(mean(last) >= mean(pass) - 1e-9, `${where}: ${mean(pass)} then ${mean(last)}`);
          // Louder by a fiftieth of the range at least, less for a style that plays its arc
          // shallower: reggae's builds are heard in dynamics only, at half depth (ST-reggae-34).
          if (solo.of === 3) {
            assert.ok(
              mean(last) > mean(pass) + 0.02 * style.arc.depth,
              `${where}: no build under the solo`,
            );
          }
        }
      }
    }
  }
});

/** A take's solos: each one's notes, and the plan bars it runs over. */
function solosOf(take: Take): { bars: PlanBar[]; notes: ReturnType<typeof notesOf> }[] {
  const solos: { bars: PlanBar[]; notes: ReturnType<typeof notesOf> }[] = [];
  let current: PlanBar[] | null = null;
  for (const bar of take.plan.bars) {
    if (bar.solo && (!current || (bar.solo.chorus === 0 && bar.barInPass === 0))) {
      current = [];
      solos.push({ bars: current, notes: [] });
    }
    if (bar.solo) current!.push(bar);
    else current = null;
  }
  const all = notesOf(take, "solo");
  for (const solo of solos) {
    const from = solo.bars[0]!.start;
    const last = solo.bars.at(-1)!;
    // A pickup into the solo's first phrase may start in the bar before it.
    solo.notes = all.filter(
      (note) => note.tick >= from - PPQ && note.tick < last.start + last.ticks,
    );
  }
  return solos;
}

/** Takes with the soloist asked for. */
const solo = (jam: JamSpec) => jam.options.solo === true;

const soloTakes = () => [...takes(solo), ...stressTakes(solo), ...soloistTakes()];

test("the soloist plays only where it has the lead (a pickup may lead in by a beat), stays on its instrument, and is one voice", () => {
  let notes = 0;
  for (const { chart, options, take } of soloTakes()) {
    const solo = notesOf(take, "solo");
    const where = `${chart.file} seed ${options.seed}`;
    solo.forEach((note, i) => {
      notes++;
      const bar = take.plan.bars.findLast((candidate) => candidate.start <= note.tick)!;
      const next = take.plan.bars[bar.index + 1];
      const leadsIn = next?.solo && note.tick >= next.start - PPQ;
      assert.ok(
        bar.solo || leadsIn,
        `${where}: a solo note in bar ${bar.index}, where it lays out`,
      );
      const instrument = SOLO_INSTRUMENTS[note.voice ?? ""];
      assert.ok(instrument, `${where}: played on "${note.voice}"`);
      assert.ok(
        note.pitch >= instrument.range[0] && note.pitch <= instrument.range[1],
        `${where}: ${note.pitch} is off the ${instrument.name}`,
      );
      const after = solo[i + 1];
      if (after) {
        const overlap = note.tick + note.offset + note.duration - (after.tick + after.offset);
        assert.ok(overlap <= POCKET, `${where} at tick ${after.tick}: two solo notes at once`);
      }
    });
  }
  assert.ok(notes > enough(5000), `only ${notes} solo notes`);
});

test("the soloist lands the changes: a note struck where a chord arrives is a tone of that chord, and a note held across a change on a beat is a tone of the new chord", () => {
  let landings = 0;
  for (const { style, chart, options, take } of soloTakes()) {
    const solo = notesOf(take, "solo");
    // A soloist the style lays back is late everywhere, the change included, and the comp with
    // it: a note is held across a change by what it has left once that lay-back is set aside.
    const laidBack = (Math.max(0, style.feel.lean.solo) / 1000) * (take.plan.quarters / 60) * PPQ;
    for (const arrival of harmonyOf(take)) {
      const chord = arrival.chord;
      if (!chord || !arrival.changed) continue;
      const tones = new Set(
        chordTones(chord.quality).map((tone) => (pitchClass(chord.root) + tone.interval) % 12),
      );
      const where = `${chart.file} seed ${options.seed} into ${chord.text} at tick ${arrival.tick}`;
      for (const note of solo) {
        if (note.tick > arrival.tick) break;
        const struck = note.tick === arrival.tick;
        const held =
          arrival.tick % PPQ === 0 &&
          note.tick < arrival.tick &&
          note.tick + note.offset - laidBack + note.duration > arrival.tick + POCKET;
        if (!struck && !held) continue;
        landings++;
        assert.ok(
          tones.has(note.pitch % 12),
          `${where}: ${note.pitch} ${struck ? "struck" : "held"}`,
        );
      }
    }
  }
  // A reggae line enters after the One and rests on the drop (ST-reggae-25), so few of its
  // notes are struck where a chord arrives: about 300 on the full run, where funk's and
  // disco's are about 2,000 each. The floor is well under that, for a library that grows.
  assert.ok(landings > enough(200), `only ${landings} landings`);
});

test("a solo breathes and keeps going: no silence inside it reaches three bars (in six-eight, where a bar is two pulses, three bars of four pulses: the same stretch of time), and it has one top note, in its last chorus", () => {
  let solos = 0;
  for (const { chart, options, take } of soloTakes()) {
    for (const { bars, notes } of solosOf(take)) {
      const where = `${chart.file} seed ${options.seed}, the solo from bar ${bars[0]!.index}`;
      assert.ok(notes.length > 0, `${where}: a solo with no notes`);
      solos++;
      // A bar of dotted pulses shorter than four of them (6/8) is counted as a bar of four: at
      // disco's tempo a bar of six is a second long, and three of them are no silence at all.
      const barTicks = isCompound(bars[0]!.meter)
        ? Math.max(bars[0]!.ticks, 4 * 1.5 * PPQ)
        : bars[0]!.ticks;
      for (let i = 1; i < notes.length; i++) {
        const gap = notes[i]!.tick - (notes[i - 1]!.tick + notes[i - 1]!.duration);
        assert.ok(gap < barTicks * 3, `${where}: ${(gap / barTicks).toFixed(1)} bars of silence`);
      }
      const of = bars[0]!.solo!.of;
      if (of < 2 || bars.at(-1)!.solo!.chorus !== of - 1) continue;
      const top = Math.max(...notes.map((note) => note.pitch));
      const tops = notes.filter((note) => note.pitch === top);
      const lastChorus = bars.find((bar) => bar.solo!.chorus === of - 1)!;
      assert.ok(
        tops.every((note) => note.tick >= lastChorus.start),
        `${where}: the top note comes before the last chorus`,
      );
    }
  }
  assert.ok(solos > enough(40), `only ${solos} solos`);
});

test("a three-chorus solo builds: its last chorus has more notes than its first, in nine solos in ten", () => {
  let built = 0;
  let solos = 0;
  for (const { take } of takes(solo)) {
    for (const { bars, notes } of solosOf(take)) {
      if (bars[0]!.solo!.of !== 3) continue;
      const inChorus = (chorus: number) => {
        const own = bars.filter((bar) => bar.solo!.chorus === chorus);
        const from = own[0]!.start;
        const to = own.at(-1)!.start + own.at(-1)!.ticks;
        return notes.filter((note) => note.tick >= from && note.tick < to).length;
      };
      solos++;
      if (inChorus(2) > inChorus(0)) built++;
    }
  }
  assert.ok(solos > enough(30), `only ${solos} three-chorus solos`);
  assert.ok(built >= solos * 0.9, `${built} of ${solos} solos built`);
});

test("a solo that runs into the ending ends with the band: its last note is struck where the final chord lands (and once more with the band's button), on that chord's root, third or fifth", () => {
  let endings = 0;
  for (const { chart, options, take } of soloTakes()) {
    const last = take.plan.bars.findLast((bar) => bar.kind === "music")!;
    if (!last.ending || !last.solo) continue;
    const final = last.spans.findLast((span) => span.chord !== null)?.chord;
    const landing = last.start + last.ending.at;
    const landed = notesOf(take, "solo").filter((other) => other.tick >= landing);
    const note = landed.at(-1);
    const where = `${chart.file} seed ${options.seed}`;
    assert.ok(final && note, `${where}: no last note`);
    endings++;
    assert.equal(landed[0]!.tick, landing, `${where}: the last note is not on the final chord`);
    const allowed = last.ending.gesture.kind === "button" ? 2 : 1;
    assert.ok(landed.length <= allowed, `${where}: ${landed.length} notes on the final chord`);
    assert.equal(note.pitch, landed[0]!.pitch, `${where}: the button is not the last note again`);
    const resting = chordTones(final.quality)
      .filter((tone) => ["root", "third", "fifth"].includes(tone.role))
      .map((tone) => (pitchClass(final.root) + tone.interval) % 12);
    assert.ok(
      resting.includes(note.pitch % 12),
      `${where}: ends on ${note.pitch} over ${final.text}`,
    );
    // The top of a solo is the phrase before its last, not the note it goes home on (SO-05).
    const solo = solosOf(take).at(-1)!.notes;
    if (solo.length >= 12) {
      const highest = Math.max(...solo.map((other) => other.pitch));
      assert.ok(note.pitch < highest, `${where}: the solo ends on its top note`);
    }
  }
  // At least: on the full run funk meets exactly 80, since a sixth style's charts took its
  // borrowed charts from eleven to nine (`otherCharts` in takes.ts).
  assert.ok(endings >= enough(80), `only ${endings} endings with the soloist`);
});

test("the soloist plays no wrong note on a beat or held: nothing a half step over a chord tone unless the chord's scale has it, and no major seventh on a chord without one", () => {
  let judged = 0;
  for (const { chart, options, take } of soloTakes()) {
    const harmony = harmonyOf(take);
    const bars = take.plan.bars;
    let at = 0;
    let bar = 0;
    for (const note of notesOf(take, "solo")) {
      while (harmony[at + 1] && harmony[at + 1]!.tick <= note.tick) at++;
      while (bars[bar + 1] && bars[bar + 1]!.start <= note.tick) bar++;
      const measure = bars[bar]!;
      // A beat is the bar's pulse: a quarter note, or in six-eight and twelve-eight a dotted one.
      const onBeat = onPulse(measure.meter, note.tick - measure.start);
      if (!onBeat && note.duration < PPQ * 0.75) continue;
      // A note struck in the eighth before a change and held over it is the new chord's
      // (X-B-07); one struck where its own chord arrives is that chord's, however soon the
      // next one comes.
      const next = harmony[at + 1];
      const leans =
        next?.changed &&
        harmony[at]!.tick !== note.tick &&
        next.tick - note.tick <= PPQ / 2 &&
        // By more than swing lengthens an eighth on the beat: the change swings with it.
        note.tick + note.duration > next.tick + PPQ / 4;
      const arrival = leans ? next : harmony[at]!;
      const chord = arrival.chord;
      if (!chord) continue;
      judged++;
      const root = pitchClass(chord.root);
      const tones = chordTones(chord.quality).map((tone) => (root + tone.interval) % 12);
      const pc = note.pitch % 12;
      if (tones.includes(pc)) continue;
      const scale = chordScale(chord, contextOf(harmony, arrival));
      if (scale.intervals.some((interval) => (root + interval) % 12 === pc)) continue;
      const where = `${chart.file} seed ${options.seed} ${JSON.stringify(options)} bar ${measure.index}: ${note.pitch} over ${chord.text}`;
      assert.ok(!tones.includes((pc + 11) % 12), `${where}: a half step over a chord tone`);
      assert.notEqual(pc, (root + 11) % 12, `${where}: the major seventh`);
    }
  }
  assert.ok(judged > enough(5000), `only ${judged} notes judged`);
});

test("a phrase is followed by a breath: the soloist leaves the style's breath of air before the next phrase, a pickup into it included, at any tempo", () => {
  const breathes = MEASURES.find((measure) => measure.id === "solo.phrases-breathe")!;
  let joins = 0;
  for (const { style, chart, options, take } of soloTakes()) {
    const measured = breathes.of(take, style);
    if (!measured) continue;
    joins += measured.cases;
    assert.equal(
      measured.value,
      1,
      `${chart.file} ${JSON.stringify(options)}: ${Math.round((1 - measured.value) * measured.cases)} of ${measured.cases} phrases run into the next`,
    );
  }
  assert.ok(joins > enough(600), `only ${joins} phrase joins`);
});

test("a horn breathes: the alto never plays eight seconds without half a second of air, as heard", () => {
  const horn = (take: Take, tempo: number, where: string) => {
    const perTick = 60 / tempo / PPQ;
    const notes = notesOf(take, "solo");
    assert.ok(notes.length > 0 && notes.every((note) => note.voice === "alto-sax"), where);
    let since = notes[0]!.tick;
    for (let i = 1; i < notes.length; i++) {
      const before = notes[i - 1]!;
      // As heard: where each note really starts and stops, swing and all.
      const starts = notes[i]!.tick + notes[i]!.offset;
      const air = (starts - (before.tick + before.offset + before.duration)) * perTick;
      // A tenth of the breath is the player's own timing.
      if (air >= 0.45) since = starts;
      const blown = (starts + notes[i]!.duration - since) * perTick;
      assert.ok(blown <= 8.5, `${where}: ${blown.toFixed(1)} s on one breath`);
    }
  };
  for (const style of STYLES) {
    for (const [c, chart] of ownCharts(style).entries()) {
      // On a push, slow and medium by turns.
      for (const tempo of [66, 120].filter((_, t) => FULL || (c + t) % 2 === 0)) {
        const take = render(chart.text, style, {
          mode: "jam",
          passes: 4,
          seed: 3,
          solo: true,
          tempo,
          soloInstrument: "alto-sax",
        });
        horn(take, take.plan.quarters, `${chart.file} at ${tempo}`);
      }
    }
  }
  for (const { chart, options, take } of soloistTakes()) {
    if (options.soloInstrument !== "alto-sax") continue;
    horn(take, take.plan.quarters, `${chart.file} ${JSON.stringify(options)}`);
  }
  // Very slow, over eight chords a bar: a note cut at a change of chord on an "and" leaves a
  // breath on paper that swing takes back.
  const { style, chart } = stressTakes().find((jam) => jam.chart.file === "awkward.chart")!;
  for (const seed of [1, 5]) {
    const take = render(chart.text, style, {
      mode: "jam",
      passes: 4,
      seed,
      solo: true,
      tempo: 50,
      soloInstrument: "alto-sax",
    });
    horn(take, 50, `${chart.file} at 50, seed ${seed}`);
  }
});

test("a guitar bends only into a note a phrase lands on (one struck where the chord changes, or the last before a breath), of an eighth or longer and never in the bar the band ends on: a half step up into a major third, or a whole step up into a root or a fifth of a quarter or longer (the solo's top note from the scale note under it, whatever tone it is, in two solos in three at least), in a tenth of a second; it shakes only a note held as long as the style asks; a style that does not bend does not; and a horn and a vibraphone do neither", () => {
  // Every instrument whose hand can move a pitch, in a style where it is not the soloist
  // already: the takes the other properties read are on each style's own soloist and the
  // horn. On a push, each chart on one seed where the style bends, and every other chart
  // where it only shakes.
  const bendsIn = ({ solo }: Jam["style"]) =>
    solo.habits.bend.third + solo.habits.bend.rootOrFifth > 0;
  const moving = Object.entries(SOLO_INSTRUMENTS).filter(([, hand]) => hand.bend || hand.shake);
  const handed = STYLES.flatMap((style) =>
    moving
      .filter(([soloInstrument]) => soloInstrument !== style.solo.instrument)
      .flatMap(([soloInstrument]) =>
        ownCharts(style).flatMap((chart, c) =>
          SEEDS.filter((_, s) => FULL || (s === c % 2 && (bendsIn(style) || c % 4 < 2))).map(
            (seed): Jam => {
              const options = { mode: "jam", passes: 4, seed, solo: true, soloInstrument } as const;
              return { style, chart, options, take: render(chart.text, style, options) };
            },
          ),
        ),
      ),
  );
  const PLAIN = ["alto-sax", "vibraphone"];
  let [bent, shaken, plain] = [0, 0, 0];
  // Solos on a hand that bends in a style that does, and how many push up into their top note.
  let [solos, topped] = [0, 0];
  for (const { style, chart, options, take } of [...soloTakes(), ...handed]) {
    const harmony = harmonyOf(take);
    const notes = notesOf(take, "solo");
    const bars = take.plan.bars;
    const perSecond = (take.plan.quarters * PPQ) / 60;
    const { habits, space, touch } = style.solo;
    let [at, b] = [0, 0];
    const top = Math.max(...notes.map((note) => note.pitch));
    if (bendsIn(style) && notes.some((note) => SOLO_INSTRUMENTS[note.voice ?? ""]?.bend)) {
      solos++;
      if (notes.some((note) => note.pitch === top && note.move?.glide)) topped++;
    }
    notes.forEach((note, i) => {
      const hand = SOLO_INSTRUMENTS[note.voice ?? ""]!;
      const where = `${chart.file} ${JSON.stringify(options)} at tick ${note.tick}: ${note.pitch}`;
      const { glide, vibrato } = note.move ?? {};
      if (PLAIN.includes(note.voice ?? "")) {
        plain++;
        assert.equal(note.move, undefined, `${where}: the pitch of a ${hand.name} moved`);
      }
      if (!glide && !vibrato) return;
      while (harmony[at + 1] && harmony[at + 1]!.tick <= note.tick) at++;
      while (bars[b + 1] && bars[b + 1]!.start <= note.tick) b++;
      const bar = bars[b]!;
      // How long a note of some length in the rhythm sounds from here, played legato and swung.
      const within = note.tick - bar.start;
      const swung = (tick: number) => (bar.meter.unit === 4 ? swing(tick, style.feel) : tick);
      const sounds = (ticks: number) =>
        Math.round(swung(within + ticks * touch.legato) - swung(within)) - 1;

      if (glide) {
        bent++;
        assert.ok(hand.bend, `${where}: a bend on the ${hand.name}`);
        assert.ok(
          habits.bend.third > 0 || habits.bend.rootOrFifth > 0,
          `${where}: a bend in a style that does not bend`,
        );
        // Struck flat and pushed up to the note, and nothing else: no slide, no release.
        const [from, to] = glide;
        assert.ok(glide.length === 2 && from!.at === 0 && to!.semitones === 0, `${where}: a glide`);
        assert.ok(
          Math.abs(to!.at / perSecond - hand.bend.takes) < 1e-6,
          `${where}: a bend that takes ${(to!.at / perSecond).toFixed(3)} s`,
        );
        const up = -from!.semitones;
        assert.ok(up === 1 || up === 2, `${where}: bent up ${up} semitones`);

        // The chord it is struck over, or the one it leans into from the eighth before.
        const next = harmony[at + 1];
        const leans =
          next?.changed &&
          next.tick - note.tick <= PPQ / 2 &&
          note.tick + note.duration > next.tick;
        const roles = [harmony[at], next?.changed && next.tick - note.tick <= PPQ / 2 ? next : null]
          .flatMap((arrival) => (arrival?.chord ? [arrival.chord] : []))
          .flatMap((chord) =>
            chordTones(chord.quality)
              .filter((tone) => (pitchClass(chord.root) + tone.interval) % 12 === note.pitch % 12)
              .map((tone) => `${tone.role} ${tone.interval % 12}`),
          );
        // The solo's top note is pushed up from the scale note under it, whatever tone it is.
        assert.ok(
          note.pitch === top ||
            (up === 1
              ? roles.includes("third 4")
              : roles.includes("root 0") || roles.includes("fifth 7")),
          `${where}: bent up ${up} into ${roles.join(", ") || "no chord tone"}`,
        );

        const after = notes[i + 1];
        const air = (after ? after.tick : Infinity) - (note.tick + note.duration);
        const breath = Math.min(PPQ - PPQ / 6, space.breath * 0.9 * perSecond);
        assert.ok(
          (harmony[at]!.tick === note.tick && harmony[at]!.changed) || leans || air >= breath,
          `${where}: a bend into a passing note`,
        );
        assert.ok(
          note.duration >= sounds(up === 1 ? PPQ / 2 : PPQ),
          `${where}: bent up ${up} into a note ${note.duration} ticks long`,
        );
        assert.equal(bar.ending, null, `${where}: a bend in the bar the band ends on`);
      }

      if (vibrato) {
        shaken++;
        assert.ok(hand.shake, `${where}: a shake on the ${hand.name}`);
        assert.deepEqual(
          [vibrato.depth, vibrato.rate, vibrato.upward === true],
          [hand.shake.depth, hand.shake.rate, hand.shake.upward],
          `${where}: not the instrument's shake`,
        );
        assert.ok(
          note.duration >= sounds(habits.shake * PPQ) || bar.ending !== null,
          `${where}: a shake on a note ${note.duration} ticks long`,
        );
        // The last note of the tune is held as long as the band holds it.
        if (bar.ending) assert.ok(note.duration >= habits.shake * PPQ - POCKET, where);
      }
    });
  }
  const bends = STYLES.some(bendsIn);
  // Where the style's hand bends, both are heard often enough to have been judged: bends as
  // often as the style's chances of one say (disco's are half the blues' and rock's, ST-disco-25).
  const chances = Math.min(
    1,
    ...STYLES.filter(bendsIn).map(
      ({ solo }) => solo.habits.bend.third + solo.habits.bend.rootOrFifth,
    ),
  );
  assert.ok(!bends || bent >= enough(60 * chances), `only ${bent} bent notes`);
  assert.ok(!bends || shaken > enough(300), `only ${shaken} shaken notes`);
  // The top note is always pushed up into where the hand can (SO-53): not in a song's one
  // short solo, which has no climb, nor over a chord that leaves no note under it to start on.
  assert.ok(topped * 3 >= solos * 2, `only ${topped} of ${solos} solos bend into their top note`);
  assert.ok(plain > enough(2000), `only ${plain} notes on the horn and the vibraphone`);
});

// ── the piano around the soloist ────────────────────────────────────────────

/** The same band with a piano that cannot hear the soloist: the baseline the stage is measured against. */
const deaf = (style: Jam["style"]): Jam["style"] => ({
  ...style,
  chords: { ...style.chords, listening: null },
  critic: {
    ...style.critic,
    weights: {
      ...style.critic.weights,
      comping: { ...style.critic.weights.comping, "under-the-soloist": 0 },
    },
  },
});

/** Where the piano and the soloist meet in a take: strikes under a sounding note, and voices on that note. */
function meetings(take: Take): { strikes: number; under: number; onNote: number } {
  const solo = notesOf(take, "solo");
  const bars = take.plan.bars;
  let [strikes, under, onNote, at] = [0, 0, 0, 0];
  for (const strike of strikesOf(take)) {
    const bar = bars.findLast((candidate) => candidate.start <= strike.tick);
    if (!bar?.solo) continue;
    strikes++;
    while (solo[at] && solo[at]!.tick + solo[at]!.duration <= strike.tick) at++;
    const sounding = solo
      .slice(at, at + 4)
      .filter((note) => note.tick <= strike.tick && strike.tick < note.tick + note.duration);
    if (sounding.length === 0) continue;
    under++;
    if (sounding.some((note) => strike.pitches.includes(note.pitch))) onNote++;
  }
  return { strikes, under, onNote };
}

const listens = STYLES.some((style) => style.chords.listening !== null);

test("a comp that listens makes room: hearing the soloist, fewer of its strikes come down under the line and far fewer sit on the soloist's note than when it cannot hear", {
  skip: !listens,
}, () => {
  const sum = { strikes: 0, under: 0, onNote: 0 };
  const deafSum = { strikes: 0, under: 0, onNote: 0 };
  let lower = 0;
  let compared = 0;
  for (const { style, chart, options, take } of takes(
    (jam) =>
      jam.style.chords.listening !== null &&
      jam.options.solo === true &&
      jam.chart.meter === "4/4" &&
      Number(jam.options.seed) <= 4,
  )) {
    const heard = meetings(take);
    const unheard = meetings(render(chart.text, deaf(style), options));
    for (const key of ["strikes", "under", "onNote"] as const) {
      sum[key] += heard[key];
      deafSum[key] += unheard[key];
    }
    compared++;
    if (heard.under / heard.strikes <= unheard.under / unheard.strikes) lower++;
  }
  assert.ok(compared >= enough(24), `only ${compared} takes compared`);
  const overlap = sum.under / sum.strikes;
  const deafOverlap = deafSum.under / deafSum.strikes;
  assert.ok(
    overlap < deafOverlap - 0.01,
    `strikes under the line: ${overlap.toFixed(3)} hearing, ${deafOverlap.toFixed(3)} deaf`,
  );
  assert.ok(lower >= compared * 0.75, `lower in only ${lower} of ${compared} takes`);
  const [on, deafOn] = [sum.onNote / sum.under, deafSum.onNote / deafSum.under];
  assert.ok(
    on < deafOn / 2,
    `on the soloist's note: ${on.toFixed(3)} hearing, ${deafOn.toFixed(3)} deaf`,
  );
});

test(
  "blues: under a solo the piano does not get busier as the band gets louder: where the soloist has the lead it never hammers a bar, and at the band's hot level it averages under three strikes a bar",
  only("blues"),
  () => {
    let hot = 0;
    let strikes = 0;
    for (const { style, chart, options, take } of soloTakes()) {
      if (style.id !== "blues" || chart.meter !== "4/4") continue;
      const perBar = new Map<number, number>();
      const bars = take.plan.bars;
      for (const strike of strikesOf(take)) {
        const bar = bars.findLast((candidate) => candidate.start <= strike.tick)!;
        perBar.set(bar.index, (perBar.get(bar.index) ?? 0) + 1);
      }
      for (const bar of bars) {
        if (bar.kind !== "music" || !bar.solo || bar.ending || bar.seats.chords === null) continue;
        const count = perBar.get(bar.index) ?? 0;
        // A chord gets its strike however many the bar has, so only bars of one or two chords
        // say anything about how busy the hand chose to be.
        const chords = bar.spans.filter((span) => !span.tied && span.chord !== null).length;
        if (chords <= 2) {
          assert.ok(
            count <= 5,
            `${chart.file} ${JSON.stringify(options)} bar ${bar.index}: ${count} strikes under the solo`,
          );
        }
        if (tierOf(bar.energy) === "high" && chords <= 1) {
          hot++;
          strikes += count;
        }
      }
    }
    assert.ok(hot > enough(300), `only ${hot} hot bars under a solo`);
    assert.ok(strikes / hot < 3, `${(strikes / hot).toFixed(2)} strikes a bar under a hot solo`);
  },
);

test("with nobody soloing, a piano that listens plays exactly what a deaf one plays", () => {
  for (const style of STYLES) {
    for (const [c, chart] of ownCharts(style).entries()) {
      const options = { mode: "jam", passes: 2, seed: c + 1 } as const;
      assert.deepEqual(
        render(chart.text, style, options).events,
        render(chart.text, deaf(style), options).events,
        chart.file,
      );
    }
  }
});

test("under a solo the piano leaves the soloist its note: a voice held on the soloist's own pitch for more than a beat is the bottom of the hand or a tone the chord is heard by", () => {
  let under = 0;
  for (const { style, chart, options, take } of soloTakes()) {
    const solo = notesOf(take, "solo");
    const strikes = strikesOf(take);
    const bars = take.plan.bars;
    strikes.forEach((strike, i) => {
      const bar = bars.findLast((candidate) => candidate.start <= strike.tick);
      if (!bar?.solo || strike.pitches.length <= 2) return;
      // A comp that does not listen plays as if nobody were soloing, by design (a strummed
      // groove, CH-60, CH-68): its strokes are short, so it holds nothing under the line
      // until the last chord, and there its grip may have the note the soloist ends on.
      if (style.chords.listening === null && bar.ending) return;
      // One hand: a strike sounds until the next one, and is judged inside its own bar.
      const ends = Math.min(strike.ends, strikes[i + 1]?.sounds ?? Infinity, bar.start + bar.ticks);
      under++;
      for (const pitch of strike.pitches.slice(1)) {
        const shared = solo
          .filter((note) => note.pitch === pitch)
          .reduce((sum, note) => {
            const from = Math.max(strike.sounds, note.tick + note.offset);
            const to = Math.min(ends, note.tick + note.offset + note.duration);
            return sum + Math.max(0, to - from);
          }, 0);
        // A beat on paper (the bar's pulse: a dotted quarter in twelve-eight); the feel moves
        // both ends of both notes, so a quarter more as heard.
        if (shared < pulseTicks(bar.meter)[0]! * 1.25) continue;
        const needed = chordsUnder(take, strike).some(({ chord }) => {
          const interval = (pitch - pitchClass(chord.root) + 120) % 12;
          const altered = { b5: 6, "#5": 8, b9: 1, "#9": 3, "#11": 6, b13: 8 } as const;
          return (
            chordTones(chord.quality).some(
              (tone) =>
                ["third", "sus", "seventh", "sixth"].includes(tone.role) &&
                tone.interval % 12 === interval,
            ) || chord.quality.alterations.some((alteration) => altered[alteration] === interval)
          );
        });
        assert.ok(
          needed,
          `${chart.file} ${JSON.stringify(options)} at tick ${strike.tick}: ${strike.pitches} sits on the soloist's ${pitch}`,
        );
      }
    });
  }
  assert.ok(under > enough(3000), `only ${under} strikes under a solo`);
});

// ── the jazz soloist ────────────────────────────────────────────────────────

test(
  "jazz: a note from outside the chord's scale is on its way somewhere: it is off the beat, and the next note follows straight on, a half step from it",
  only("jazz"),
  () => {
    let chromatic = 0;
    // Where jazz has written its soloist: in a bar of dotted pulses it has not written (6/8,
    // 12/8) the line is the fit's, and is not jazz's own until it is written there.
    const own = (jam: Parameters<typeof written>[0]) =>
      written(jam) || !isCompound(parse(jam.chart.text).chart.meter);
    for (const { chart, options, take } of soloTakes().filter(own)) {
      const harmony = harmonyOf(take);
      const solo = notesOf(take, "solo");
      const has = (arrival: (typeof harmony)[number] | undefined, pitch: number) => {
        if (!arrival?.chord) return true;
        const root = pitchClass(arrival.chord.root);
        const scale = chordScale(arrival.chord, contextOf(harmony, arrival));
        return [...scale.intervals, ...chordTones(arrival.chord.quality).map((t) => t.interval)]
          .map((interval) => (root + interval) % 12)
          .includes(pitch % 12);
      };
      let at = 0;
      solo.forEach((note, i) => {
        while (harmony[at + 1] && harmony[at + 1]!.tick <= note.tick) at++;
        if (has(harmony[at], note.pitch)) return;
        // Struck in the eighth before a change, it may be the chord coming (X-B-07).
        const coming = harmony[at + 1];
        if (coming && coming.tick - note.tick <= PPQ / 2 && has(coming, note.pitch)) return;
        const bar = take.plan.bars.findLast((candidate) => candidate.start <= note.tick)!;
        chromatic++;
        const where = `${chart.file} seed ${options.seed} bar ${bar.index}: ${note.pitch} over ${harmony[at]!.chord!.text}`;
        assert.ok(!onPulse(bar.meter, note.tick - bar.start), `${where}: on a beat`);
        const next = solo[i + 1];
        assert.ok(
          next && next.tick - note.tick <= PPQ / 2,
          `${where}: left hanging, nothing follows it`,
        );
        assert.equal(Math.abs(next.pitch - note.pitch), 1, `${where}: left for ${next.pitch}`);
      });
    }
    assert.ok(chromatic > enough(300), `only ${chromatic} notes outside the scale`);
  },
);
