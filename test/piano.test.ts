// Musical properties of the piano: register, chord identity, harmony, one hand, the grid. See
// docs/TESTING.md, kind 2. Each test names its rule; none of them knows how the engine is built.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlanBar, Take, TakeOptions } from "@ensemble/engine";
import {
  chordAt,
  chordFamily,
  chordTones,
  fingering,
  fretsOf,
  isCompound,
  lastPulse,
  middlePulses,
  onAnd,
  PICKED,
  PPQ,
  pitchClass,
  pulseStarts,
  pulseTicks,
  render,
  STEP,
  scaleHas,
  strongPulses,
  tierOf,
} from "@ensemble/engine";
import {
  barAt,
  barsOnChord,
  bluesWritten,
  chordsUnder,
  harmonyOf,
  POCKET,
  pluckedOf,
  type Strike,
  strikesOf,
} from "./reading.ts";
import type { LibraryChart } from "./takes.ts";
import {
  COUNTRY_WALTZ,
  enough,
  FULL,
  heldTakes,
  homeTakes,
  LIBRARY,
  made,
  notesOf,
  only,
  ownCharts,
  SEEDS,
  STYLES,
  soloistTakes,
  stressTakes,
  takeOf,
  takes,
  WRITTEN,
  written,
} from "./takes.ts";

test("the piano stays in its register: nothing under the style's floor, nothing above E6, in every take", () => {
  let strikes = 0;
  for (const { style, chart, options, take } of [...takes(), ...stressTakes()]) {
    // A plucked string is held to the register as a chord is.
    for (const strike of [...strikesOf(take), ...pluckedOf(take)]) {
      strikes++;
      const where = `${chart.file} seed ${options.seed} at tick ${strike.tick}`;
      assert.ok(strike.pitches[0]! >= style.chords.register.floor, `${where}: under the floor`);
      assert.ok(strike.pitches.at(-1)! <= 88, `${where}: above E6`);
    }
  }
  assert.ok(strikes > enough(5000), `only ${strikes} strikes across the library`);
});

test("a chord keeps its identity: every strike of two or more notes has the chord's third (or suspension) and its seventh (or sixth), and every alteration the chart writes", () => {
  for (const { chart, options, take } of [...takes(), ...stressTakes()]) {
    for (const strike of strikesOf(take)) {
      if (strike.pitches.length < 2) continue;
      const classes = new Set(strike.pitches.map((pitch) => pitch % 12));
      const whole = chordsUnder(take, strike).some(({ chord }) => {
        const tones = chordTones(chord.quality);
        const sounds = (interval: number) => classes.has((pitchClass(chord.root) + interval) % 12);
        const one = (...roles: string[]) => {
          const tone = tones.find((candidate) => roles.includes(candidate.role));
          return tone === undefined || sounds(tone.interval);
        };
        const altered = { b5: 6, "#5": 8, b9: 1, "#9": 3, "#11": 6, b13: 8 } as const;
        return (
          one("third", "sus") &&
          one("seventh", "sixth") &&
          chord.quality.alterations.every((alteration) => sounds(altered[alteration]))
        );
      });
      assert.ok(
        whole,
        `${chart.file} seed ${options.seed} at tick ${strike.tick}: ${strike.pitches}`,
      );
    }
  }
});

test("the piano plays nothing the harmony rules out: every note is a tone of its chord or of that chord's scale", () => {
  for (const { chart, options, take } of [...takes(), ...stressTakes()]) {
    // A plucked string is held to the harmony as a chord is.
    for (const strike of [...strikesOf(take), ...pluckedOf(take)]) {
      const fits = chordsUnder(take, strike).some(({ chord, scale }) =>
        strike.pitches.every((pitch) => {
          const interval = (pitch - pitchClass(chord.root) + 120) % 12;
          return (
            scaleHas(scale, interval) ||
            chordTones(chord.quality).some((tone) => tone.interval % 12 === interval)
          );
        }),
      );
      assert.ok(
        fits,
        `${chart.file} seed ${options.seed} at tick ${strike.tick}: ${strike.pitches}`,
      );
    }
  }
});

test("every chord the chart writes is struck: the piano plays each one within an eighth before it arrives, or while it sounds; a hand that is picking plucks a string of it while it sounds", () => {
  for (const { chart, options, take } of [...takes(), ...stressTakes()]) {
    const strikes = strikesOf(take);
    const plucked = pluckedOf(take);
    const harmony = harmonyOf(take);
    harmony.forEach((arrival, i) => {
      const bar = take.plan.bars.find((candidate) => candidate.index === arrival.bar);
      // The same chord written again is not a new chord: it is owed nothing of its own.
      if (!arrival.chord || !arrival.changed) return;
      if (bar?.kind !== "music" || bar.seats.chords === null) return;
      let until = arrival.tick + arrival.duration;
      for (let j = i + 1; harmony[j] && !harmony[j]!.changed; j++) {
        until = harmony[j]!.tick + harmony[j]!.duration;
      }
      const chord = arrival.chord;
      const guides = chordTones(chord.quality)
        .filter((tone) => ["third", "sus", "seventh", "sixth"].includes(tone.role))
        .map((tone) => (pitchClass(chord.root) + tone.interval) % 12);
      // Struck by a chord that is this chord: any strike at all in the window would let the
      // chord before it, or a cluster of two chords, pass.
      // A picked chord is said a string at a time, never early, and no one string is the
      // chord: that every one of them is a string of the chord's shape is its own property.
      const struck =
        strikes.some(
          (strike) =>
            strike.tick >= arrival.tick - PPQ / 2 &&
            strike.tick < until &&
            guides.every((guide) => strike.pitches.some((pitch) => pitch % 12 === guide)),
        ) || plucked.some((note) => note.tick >= arrival.tick && note.tick < until);
      assert.ok(
        struck,
        `${chart.file} seed ${options.seed}: ${arrival.chord.text} in bar ${bar.index} never struck`,
      );
    });
  }
});

test("the hand does not growl: a chord's two lowest notes are a half step apart only on a dominant from E4 up, in every take, under a solo or not", () => {
  // A half step on the bottom of the hand is a fault on any chord but a dominant, and on a
  // dominant below E4 (Q-03, SU-B-10): a minor 9th under its 3rd at the bottom of Dm9 (E F A C)
  // is a cluster where the 7th on the bottom (C E F A) is the chord. Hard under a soloist,
  // where the hand is pressed down; and no voicing on the way into or out of a solo needs it.
  let judged = 0;
  // Thirteenths in every style, in four and in three, with the bass in and without: a grip that is clean
  // struck whole can growl across only its top strings (A13's F#3 G3 C#4); and the take where
  // country's chick in six first did, which the full run alone reaches.
  const thirteenths = ["4/4", "3/4"].map(
    (meter): LibraryChart => ({
      file: `thirteenths-in-${meter.replace("/", "-")}`,
      // And two chords whose top strings sound two notes at most, which keep the grips they
      // had: with no grip that sounds three notes there, the hand chooses as for any strike.
      text: `title: Thirteenths\nkey: D\nmeter: ${meter}\n\n[A]\n| A13 | E13 | D13 | G13 |\n| B13 | C13 | F#13 | Bb13 |\n| E5 | A5 | A13 | E13 |\n`,
      meter,
    }),
  );
  const country = STYLES.find((style) => style.id === "country");
  const sixEight = LIBRARY.find((chart) => chart.file === "disco-floor-six-d.chart");
  const extra = [
    ...STYLES.flatMap((style) =>
      thirteenths.flatMap((chart) =>
        [0.3, 0.6, 0.85].flatMap((energy) =>
          // With the bass in, and with none: then a picked boom takes the grip the chick holds.
          [[], ["bass" as const]].map((without) =>
            takeOf({ style, chart, options: { mode: "jam", passes: 1, energy, seed: 1, without } }),
          ),
        ),
      ),
    ),
    ...(country && sixEight
      ? [
          takeOf({
            style: country,
            chart: sixEight,
            options: { mode: "jam", open: true, passes: 3, seed: 6, tempo: 73 },
          }),
        ]
      : []),
  ];
  for (const { chart, options, take } of [
    ...takes(),
    ...stressTakes(),
    ...soloistTakes(),
    ...extra,
  ]) {
    for (const strike of strikesOf(take)) {
      judged++;
      const [low, next] = strike.pitches;
      if (low === undefined || next === undefined || next - low !== 1) continue;
      const dominant = chordsUnder(take, strike).some(
        ({ chord }) => chordFamily(chord.quality) === "dominant",
      );
      assert.ok(
        dominant && low >= 64,
        `${chart.file} ${JSON.stringify(options)} at tick ${strike.tick}: ${strike.pitches}`,
      );
    }
  }
  assert.ok(judged > enough(20000), `only ${judged} strikes`);
});

test("one hand, one chord: a strike has stopped sounding before the next one starts", () => {
  for (const { style, chart, options, take } of [...takes(), ...stressTakes()]) {
    const strikes = strikesOf(take);
    // Two chords struck on the same tick would read as one strike: a hand has five fingers
    // and plays no key twice; a guitar strums no more strings than its style holds.
    const idiom = style.chords.idiom;
    const most = idiom === "keys" ? 5 : Math.max(5, idiom.strings);
    for (const strike of strikes) {
      assert.ok(
        strike.pitches.length <= most && new Set(strike.pitches).size === strike.pitches.length,
        `${chart.file} seed ${options.seed} at tick ${strike.tick}: ${strike.pitches}`,
      );
    }
    for (let i = 1; i < strikes.length; i++) {
      const overlap = strikes[i - 1]!.ends - strikes[i]!.sounds;
      assert.ok(
        overlap <= POCKET,
        `${chart.file} seed ${options.seed} at tick ${strikes[i]!.tick}: two chords at once`,
      );
    }
  }
});

test("the piano's last chord is the final chord, struck once where it lands and never early; a style that ends on a button strikes it once more, and that is all", () => {
  for (const { chart, options, take } of takes((jam) => !jam.options.open)) {
    const last = take.plan.bars.findLast((bar) => bar.kind === "music")!;
    if (!last.ending) continue;
    const landing = last.start + last.ending.at;
    const strikes = strikesOf(take);
    const where = `${chart.file} seed ${options.seed}`;
    const final = strikes.filter((strike) => strike.tick >= landing);
    assert.equal(final[0]?.tick, landing, `${where}: the final chord is not struck where it lands`);
    const allowed = last.ending.gesture.kind === "button" ? 2 : 1;
    assert.ok(final.length <= allowed, `${where}: ${final.length} strikes of the final chord`);
    assert.deepEqual(
      final.at(-1)!.pitches,
      final[0]!.pitches,
      `${where}: the button is not the final chord`,
    );
    // Three notes at least, counting the soloist's last note: a three-note hand leaves the
    // soloist its note (CH-60), and the soloist's note is then the chord's.
    const soloist = notesOf(take, "solo")
      .filter((note) => note.tick <= landing && note.tick + note.duration > landing)
      .map((note) => note.pitch);
    const sounding = new Set([...final[0]!.pitches, ...soloist]);
    assert.ok(sounding.size >= 3, `${where}: a thin final chord`);
    const early = [...strikes, ...pluckedOf(take)].filter(
      (strike) => strike.tick < landing && strike.ends > landing + POCKET,
    );
    assert.equal(early.length, 0, `${where}: a chord ringing into the final hit`);
  }
});

/** The strikes that start in each bar of a take, by the bar's index. */
function strikesByBar(take: Take): Map<number, Strike[]> {
  const byBar = new Map<number, Strike[]>();
  const strikes = strikesOf(take);
  let at = 0;
  for (const bar of take.plan.bars) {
    const own: Strike[] = [];
    while (at < strikes.length && strikes[at]!.tick < bar.start + bar.ticks)
      own.push(strikes[at++]!);
    byBar.set(bar.index, own);
  }
  return byBar;
}

/**
 * A bar where the hand hammers every eighth of its harmony is a groove (the pump), with its
 * own rules at a change: it plays through, and strikes a pushed chord again on the beat. In a
 * bar whose shape the band tells (`told`: a part made for 5/4, 7/8 and their like) the pump
 * leaves the middle pulse of a group of three alone, and hammers every eighth outside it.
 */
function hammered(
  bar: PlanBar | undefined,
  strikes: readonly Strike[] | undefined,
  told = false,
): boolean {
  if (!bar || !strikes) return false;
  const lengths = pulseTicks(bar.meter);
  const starts = pulseStarts(bar.meter);
  const quiet = (told ? middlePulses(bar.meter) : []).map((start) => ({
    start,
    end: start + lengths[starts.indexOf(start)]!,
  }));
  const chorded = bar.spans
    .filter((span) => span.chord !== null)
    .reduce((ticks, span) => {
      const left = quiet.reduce((sum, pulse) => {
        const over =
          Math.min(pulse.end, span.start + span.duration) - Math.max(pulse.start, span.start);
        return sum - Math.max(0, over);
      }, span.duration);
      return ticks + left;
    }, 0);
  return chorded > 0 && strikes.length >= chorded / (PPQ / 2);
}

test("the eighth before a change belongs to the chord coming: a strike there that is still sounding when the chord arrives plays the new chord, alone in its beat, and is not struck again on the beat; one that stops short of the change is played only by a groove, which keeps its figure on the chord it is on", () => {
  let pushes = 0;
  for (const { style, chart, options, take } of [...takes(), ...stressTakes()]) {
    // A comp that keeps a figure going plays it up to the change; one that converses leaves
    // the stab out, because the old chord just before the new one is heard as a wrong chord.
    const groove = style.chords.anticipation.otherwise === "stay";
    const told = made({ style, chart });
    const byBar = strikesByBar(take);
    const harmony = harmonyOf(take);
    for (const arrival of harmony) {
      const before = harmony[arrival.index - 1];
      const chord = arrival.chord;
      if (!chord || !arrival.changed || !before?.chord) continue;
      // A chord written for an eighth or less is struck where it is written: its own strike
      // cannot help falling in the eighth before the next change.
      if (before.duration <= PPQ / 2) continue;
      const bar = take.plan.bars.find(
        (candidate) =>
          candidate.start < arrival.tick && arrival.tick <= candidate.start + candidate.ticks,
      );
      const landing = take.plan.bars.find((candidate) => candidate.index === arrival.bar);
      if (bar?.kind !== "music" || landing?.kind !== "music") continue;
      const where = `${chart.file} seed ${options.seed}: into ${chord.text} in bar ${landing.index}`;
      const own = byBar.get(bar.index) ?? [];
      // A groove plays through the change on whichever chord it is on.
      if (hammered(bar, own, told)) continue;
      const early = own.filter(
        (strike) => strike.tick >= arrival.tick - PPQ / 2 && strike.tick < arrival.tick,
      );
      for (const strike of early) {
        // A groove's clipped stroke on the last sixteenth stops at the barline, give or take
        // the player's timing; a chord leant into rings well past it.
        if (groove && strike.ends <= arrival.tick + POCKET) continue;
        pushes++;
        assert.ok(strike.ends >= arrival.tick - POCKET, `${where}: a stab just before the change`);
        const guides: { role: string; interval: number }[] = chordTones(chord.quality).filter(
          (tone) => ["third", "sus", "seventh", "sixth"].includes(tone.role),
        );
        assert.ok(
          guides.every((tone) =>
            strike.pitches.some(
              (pitch) => pitch % 12 === (pitchClass(chord.root) + tone.interval) % 12,
            ),
          ),
          `${where}: the old chord, an eighth before the new one`,
        );
        // The last beat before the change is the new chord's alone: no quick stab of the old
        // chord on the beat and then the new one on its "and".
        const crowd: Strike[] = own.filter(
          (other) => other.tick >= strike.tick - PPQ / 2 && other.tick < strike.tick,
        );
        const onlyStrike = before.tick >= strike.tick - PPQ / 2;
        if (!onlyStrike && !groove) {
          assert.equal(
            crowd.length,
            0,
            `${where}: the old chord on the beat, the new one right after`,
          );
        }
        if (!groove && hammered(landing, byBar.get(landing.index), told)) continue;
        const again: Strike[] = (byBar.get(landing.index) ?? []).filter(
          (other) => other.tick >= arrival.tick && other.tick < arrival.tick + PPQ / 2,
        );
        assert.equal(again.length, 0, `${where}: pushed, then struck again on the beat`);
      }
    }
  }
  // A comp that never leans in (rock, ST-rock-27) has nothing to count; one that does must
  // have been seen doing it, and one that leans in only when the band is hot (disco,
  // ST-disco-28) is seen doing it less, since most of the library is played at the working level.
  const { midBar, barline } = STYLES.reduce(
    (most, style) => ({
      midBar: most.midBar || style.chords.anticipation.midBar === "tie",
      barline: {
        low: Math.max(most.barline.low, style.chords.anticipation.barline.low),
        mid: Math.max(most.barline.mid, style.chords.anticipation.barline.mid),
        high: Math.max(most.barline.high, style.chords.anticipation.barline.high),
      },
    }),
    { midBar: false, barline: { low: 0, mid: 0, high: 0 } },
  );
  const floor =
    midBar || barline.low > 0 || barline.mid > 0 ? enough(500) : barline.high > 0 ? enough(30) : 0;
  assert.ok(pushes >= floor, `only ${pushes} pushed chords across the library`);
});

test("the piano stays in its part of the keyboard: the top of its chords never wanders more than a sixth from where the style aims it", () => {
  for (const style of STYLES) {
    for (const [c, chart] of ownCharts(style).entries()) {
      // On a push a chart is played on one seed, the charts taking the seeds by turns.
      for (const seed of SEEDS.slice(0, 4).filter((s) => FULL || (s + c) % 2 === 0)) {
        // Long enough for a hand that drifts a step a chorus to get somewhere.
        const take = render(chart.text, style, { mode: "jam", minutes: 4, seed });
        for (const strike of strikesOf(take)) {
          const away = strike.pitches.at(-1)! - style.chords.register.target;
          assert.ok(
            Math.abs(away) <= 9,
            `${chart.file} seed ${seed} at tick ${strike.tick}: the top voice is ${away} from its target`,
          );
        }
      }
    }
  }
});

test(
  "blues: the piano comps on the eighths only (in four the beats and their offbeats, in twelve the triplet's three), and a quiet band's piano is sparser than a loud one's",
  only("blues"),
  () => {
    const perBar = { low: [] as number[], high: [] as number[] };
    for (const { chart, options, take } of takes(bluesWritten)) {
      const byBar = strikesByBar(take);
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.ending || bar.seats.chords === null) continue;
        const own = byBar.get(bar.index) ?? [];
        for (const strike of own) {
          assert.equal(
            (strike.tick - bar.start) % (PPQ / 2),
            0,
            `${chart.file} seed ${options.seed} bar ${bar.index}: off the eighth-note grid`,
          );
        }
        const tier = tierOf(bar.seats.chords);
        if (tier !== "mid") perBar[tier].push(own.length);
      }
    }
    const mean = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    assert.ok(
      perBar.low.length > enough(100) && perBar.high.length > enough(100),
      "both levels are heard",
    );
    assert.ok(
      mean(perBar.low) < mean(perBar.high),
      `quiet ${mean(perBar.low).toFixed(2)} strikes a bar, loud ${mean(perBar.high).toFixed(2)}`,
    );
  },
);

test(
  "blues: in six the piano plays the gospel blues: away from a soloist, a quiet bar of one chord is struck twice at most, besides a lean into a new chord on its last eighth; and hot, every bar of one chord has the triplet on its backbeat: the second pulse struck, and with it one of its two later eighths at least (before a change the hand gives the old chord's middle eighth, or its last, to the new chord)",
  only("blues"),
  () => {
    let quiet = 0;
    let hot = 0;
    const blues = STYLES.find((style) => style.id === "blues")!;
    const played = [
      ...takes((jam) => jam.style.id === "blues" && jam.chart.meter === "6/8"),
      ...heldTakes(blues, "6/8"),
    ];
    for (const { chart, options, take } of played) {
      const byBar = strikesByBar(take);
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.ending || bar.seats.chords === null || bar.solo) continue;
        if (bar.spans.some((span) => span.chord === null)) continue;
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        const steps = new Set(
          (byBar.get(bar.index) ?? []).map((strike) => (strike.tick - bar.start) / STEP),
        );
        const tier = tierOf(bar.seats.chords);
        // A chord that arrives on the backbeat is struck early or there, as the hand leans.
        if (bar.spans.filter((span) => !span.tied).length > 1) continue;
        if (tier === "low") {
          quiet++;
          const next = take.plan.bars[bar.index + 1];
          const change =
            next?.kind !== "music" || next.spans[0]!.chord?.text !== bar.spans[0]!.chord?.text;
          const own = [...steps].filter((step) => !(change && step === 10));
          assert.ok(own.length <= 2, `${where}: ${steps.size} strikes, quiet`);
        } else if (tier === "high") {
          hot++;
          assert.ok(steps.has(6), `${where}: no strike on the backbeat`);
          assert.ok(steps.has(8) || steps.has(10), `${where}: the backbeat alone`);
        }
      }
    }
    if (LIBRARY.some((chart) => chart.meter === "6/8"))
      assert.ok(quiet > 20 && hot > 20, `only ${quiet} bars quiet, ${hot} hot`);
  },
);

test(
  "rock: in six and twelve the piano plays the ballad's triplets: away from a soloist and from the working level up, a chord on every eighth of every bar it comps, and nothing between them; quiet, no more than a chord a pulse; and under a soloist, in four as in six and twelve, no more strikes in a bar than the bar has pulses (no busier than quarter notes, or a chord a dotted quarter)",
  only("rock"),
  () => {
    let triplets = 0;
    let quiet = 0;
    let under = 0;
    const rock = STYLES.find((style) => style.id === "rock")!;
    const played = [
      ...takes((jam) => jam.style.id === "rock" && written(jam)),
      ...heldTakes(rock, "12/8"),
      ...heldTakes(rock, "12/8", true),
      ...heldTakes(rock, "6/8"),
      ...heldTakes(rock, "6/8", true),
    ];
    const meters = new Set<string>();
    for (const { chart, options, take } of played) {
      const byBar = strikesByBar(take);
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.ending || bar.seats.chords === null) continue;
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        const steps = (byBar.get(bar.index) ?? []).map(
          (strike) => (strike.tick - bar.start) / (PPQ / 4),
        );
        const pulses = pulseStarts(bar.meter).length;
        if (bar.solo !== null) {
          under++;
          assert.ok(steps.length <= pulses, `${where}: ${steps.length} strikes under the soloist`);
          continue;
        }
        if (chart.meter !== "12/8" && chart.meter !== "6/8") continue;
        meters.add(chart.meter);
        for (const step of steps) assert.equal(step % 2, 0, `${where}: between the eighths`);
        if (tierOf(bar.seats.chords) === "low") {
          quiet++;
          assert.ok(steps.length <= pulses, `${where}: ${steps.length} strikes, quiet`);
          continue;
        }
        triplets++;
        for (let step = 0; step < bar.ticks / STEP; step += 2)
          assert.ok(steps.includes(step), `${where}: no chord on eighth ${step / 2 + 1}`);
      }
    }
    assert.ok(under > enough(300), `only ${under} bars under a soloist`);
    if (LIBRARY.some((chart) => chart.meter === "12/8"))
      assert.ok(triplets > 100 && quiet > 50, `only ${triplets} bars of triplets, ${quiet} quiet`);
    for (const meter of ["12/8", "6/8"])
      if (LIBRARY.some((chart) => chart.meter === meter))
        assert.ok(meters.has(meter), `no bar of ${meter} away from a soloist`);
  },
);

test("jazz: in six and twelve the piano comps round the pulses, not a pad (AU-94): no bar it comps is struck more than five times (four, and the lean into the next bar), seven strikes in ten at least are on a pulse or the eighth before one, and from the working level, away from a soloist, it pushes, striking the eighth before a pulse, in a fifth of its bars or more", {
  skip: only("jazz").skip || !LIBRARY.some((c) => c.meter === "6/8" || c.meter === "12/8"),
}, () => {
  const jazz = STYLES.find((style) => style.id === "jazz")!;
  const compound = (jam: { style: { id: string }; chart: { meter: string } }) =>
    jam.style.id === "jazz" && (jam.chart.meter === "6/8" || jam.chart.meter === "12/8");
  const counted = { strikes: 0, round: 0, working: 0, pushed: 0 };
  for (const { chart, options, take } of [
    ...takes(compound),
    ...heldTakes(jazz, "6/8", false, true),
    ...heldTakes(jazz, "12/8", false, true),
  ]) {
    const byBar = strikesByBar(take);
    for (const bar of take.plan.bars) {
      if (bar.kind !== "music" || bar.ending || bar.seats.chords === null) continue;
      if (!isCompound(bar.meter)) continue;
      const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
      const ticks = (byBar.get(bar.index) ?? []).map((strike) => strike.tick - bar.start);
      assert.ok(ticks.length <= 5, `${where}: ${ticks.length} strikes`);
      const pulses = pulseStarts(bar.meter);
      const pushes = ticks.filter((tick) => onAnd(bar.meter, tick));
      counted.strikes += ticks.length;
      counted.round += ticks.filter((tick) => pulses.includes(tick)).length + pushes.length;
      if (bar.solo !== null || tierOf(bar.seats.chords) === "low") continue;
      counted.working++;
      if (pushes.length > 0) counted.pushed++;
    }
  }
  assert.ok(counted.strikes > 500 && counted.working > 100, `only ${JSON.stringify(counted)}`);
  assert.ok(
    counted.round >= 0.7 * counted.strikes,
    `${counted.round} of ${counted.strikes} strikes on a pulse or the eighth before one`,
  );
  assert.ok(
    counted.pushed >= 0.2 * counted.working,
    `pushed in ${counted.pushed} of ${counted.working} working bars`,
  );
});

test('jazz: in a waltz the piano comps, not a pad (prompts/jazz-waltz-study.md): no bar of three it comps is struck more than four times, besides a lean into the next bar on the "and" of 3; quiet, with the band to itself, a bar of one chord is one chord laid in on 1, the "and" of 1 or beat 2 and held, to the barline or to the lean (F4, F5, F7), or left alone; and from the working level, away from a soloist, two bars in five or more strike the "and" of 1 or of 2 (F6, F9, F2); and on the full run, pooled over the bars under a soloist from the working level up, each of the six eighths of the bar struck in 15% to 55% of them (Kelly: 31% to 44%, study 1.1) and 30% of them at most with one strike or none (Kelly: 4 bars of 16)', {
  skip: only("jazz").skip || !LIBRARY.some((chart) => chart.meter === "3/4"),
}, () => {
  const jazz = STYLES.find((style) => style.id === "jazz")!;
  const counted = { bars: 0, quiet: 0, working: 0, ands: 0, takes: 0 };
  const underTheSolo = { bars: 0, thin: 0, eighths: [0, 0, 0, 0, 0, 0] };
  // On the full run, twelve more jams of the waltz with the soloist, so the pooled shares are
  // read over a dozen sections' figures and more (the waltz is one section of sixteen bars).
  const waltz = LIBRARY.find((chart) => chart.file === "jazz-waltz-f.chart");
  const more = FULL && waltz ? Array.from({ length: 12 }, (_, i) => i + 1) : [];
  for (const { chart, options, take } of [
    ...takes((jam) => jam.style.id === "jazz" && jam.chart.meter === "3/4"),
    ...heldTakes(jazz, "3/4", false, true),
    ...heldTakes(jazz, "3/4", true, true),
    ...more.map((seed) => {
      const options: TakeOptions = { mode: "jam", passes: 4, solo: true, seed: 100 + seed };
      return { chart: waltz!, options, take: render(waltz!.text, jazz, options) };
    }),
  ]) {
    const byBar = strikesByBar(take);
    if (options.solo) counted.takes++;
    for (const bar of take.plan.bars) {
      if (bar.kind !== "music" || bar.ending || bar.seats.chords === null) continue;
      if (bar.meter.beats !== 3 || bar.meter.unit !== 4) continue;
      const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
      const end = bar.start + bar.ticks;
      const own = byBar.get(bar.index) ?? [];
      // The lean into the next bar: the "and" of 3, ringing over the barline.
      const lean = own.find((strike) => strike.tick === end - PPQ / 2 && strike.ends > end);
      const body = own.filter((strike) => strike !== lean);
      const steps = body.map((strike) => (strike.tick - bar.start) / STEP);
      counted.bars++;
      assert.ok(body.length <= 4, `${where}: ${body.length} strikes (${steps.join(" ")})`);
      if (bar.solo !== null) {
        if (tierOf(bar.seats.chords) === "low") continue;
        underTheSolo.bars++;
        if (own.length <= 1) underTheSolo.thin++;
        for (const strike of own) underTheSolo.eighths[(strike.tick - bar.start) / (PPQ / 2)]!++;
        continue;
      }
      if (tierOf(bar.seats.chords) === "low") {
        if (bar.spans.filter((span) => !span.tied).length !== 1 || bar.spans[0]!.chord === null)
          continue;
        counted.quiet++;
        assert.ok(body.length <= 1, `${where}: quiet, and ${body.length} strikes`);
        for (const strike of body) {
          assert.ok([0, 2, 4].includes(steps[0]!), `${where}: quiet, a chord at ${steps[0]}`);
          const until = Math.min(lean?.tick ?? end, end);
          assert.ok(
            strike.ends >= until - PPQ / 4,
            `${where}: quiet, a chord at ${steps[0]} let go ${until - strike.ends} ticks early`,
          );
        }
        continue;
      }
      counted.working++;
      if (steps.some((step) => step === 2 || step === 6)) counted.ands++;
    }
  }
  assert.ok(
    counted.bars > 500 && counted.quiet > 20 && counted.working > 100,
    `only ${JSON.stringify(counted)}`,
  );
  assert.ok(
    counted.ands >= 0.4 * counted.working,
    `an "and" of 1 or of 2 struck in ${counted.ands} of ${counted.working} working bars`,
  );
  // Pooled: a proportion, read over enough bars to mean one (the full run's waltz takes with a
  // soloist; a push sees too few).
  if (!FULL) return;
  const pooled = `${underTheSolo.bars} bars under a soloist in ${counted.takes} takes`;
  const shares = underTheSolo.eighths.map((n) => n / underTheSolo.bars);
  assert.ok(underTheSolo.bars > 600, `only ${pooled}`);
  assert.ok(
    underTheSolo.thin <= 0.3 * underTheSolo.bars,
    `${pooled}: ${underTheSolo.thin} with one strike or none`,
  );
  assert.ok(
    shares.every((share) => share >= 0.15 && share <= 0.55),
    `${pooled}: struck on 1 1& 2 2& 3 3& in ${shares.map((share) => `${Math.round(share * 100)}%`).join(" ")}`,
  );
});

/**
 * A bar of the waltz's hemiola (three short chords over two bars, F1 of the study), as it is
 * played: its first bar 1 and 3, its second bar 2, each a stab (in the other phase the same
 * two bars the other way round). The bar of 2 is the one no other figure plays; a chord
 * arriving on 3 may be struck in it.
 */
function hemiolaBar(bar: PlanBar, strikes: readonly Strike[], half: 0 | 1): boolean {
  const stab = (strike: Strike | undefined) =>
    strike !== undefined && strike.ends - strike.sounds <= PPQ / 2 + POCKET;
  const at = strikes.map((strike) => strike.tick - bar.start);
  if (half === 0) return strikes.every(stab) && at.length === 2 && at[0] === 0 && at[1] === 2 * PPQ;
  // The stab on 2; a chord arriving on 3 is laid in there as any chord is.
  return stab(strikes[0]) && at[0] === PPQ && at.every((tick) => tick === PPQ || tick >= 2 * PPQ);
}

/** Whether a style's book for a bar's meter, at the bar's level, has a figure of two bars. */
const playsTwoBars = (style: (typeof STYLES)[number], bar: PlanBar): boolean => {
  const book =
    bar.meter.beats === 4 && bar.meter.unit === 4
      ? style.chords.rhythm
      : style.chords.meters?.[`${bar.meter.beats}/${bar.meter.unit}`];
  return book?.tiers[tierOf(bar.seats.chords ?? bar.energy)].twoBars !== undefined;
};

/**
 * Takes held on a push for the hemiola's rules, each one whose draw would break a rule if the
 * rule were not kept (found by planting the fault): a jam with the soloist whose draw puts the
 * hemiola in a solo phrase were the soloist not heard; a long one whose draw runs phrases on
 * past eight bars and over a chorus's top were a run not stopped.
 */
const HEMIOLA_HELD: readonly TakeOptions[] = [
  // With the soloist not heard, the hemiola in bars 18 to 24 and 33 to 36, under the alto.
  { mode: "jam", passes: 3, solo: true, energy: 0.55, seed: 3 },
  // With a run let go on over a section's top: two passes, over the second chorus's top.
  { mode: "jam", passes: 2, energy: 0.55, seed: 41 },
  // With a run let go on past eight bars: three passes, a run of twelve.
  { mode: "jam", passes: 3, energy: 0.55, seed: 19 },
];

/**
 * A phrase played on the hemiola: its bars alternate the figure's two bars from the phrase's
 * first, in either phase (1 and 3 then 2, or 2 then 1 and 3). Null where it is not.
 */
function hemiolaPhase(bars: readonly PlanBar[], strikes: (bar: PlanBar) => Strike[]): 0 | 1 | null {
  for (const phase of [0, 1] as const)
    if (bars.every((bar) => hemiolaBar(bar, strikes(bar), ((bar.phrase.bar + phase) % 2) as 0 | 1)))
      return phase;
  return null;
}

test("jazz: in a waltz, with the band to itself at the working level, the piano now and then plays a whole phrase as the hemiola (three short chords over two bars, F1, in either phase): from the phrase's first bar every bar plays it, and it stops where the phrase does; a run of such phrases is eight bars at most and never goes on over the first bar of a section or of a chorus; never where a soloist has the lead; in a minority of the phrases", {
  skip: only("jazz").skip || !LIBRARY.some((chart) => chart.meter === "3/4"),
}, () => {
  const jazz = STYLES.find((style) => style.id === "jazz")!;
  const waltz = LIBRARY.find((chart) => chart.file === "jazz-waltz-f.chart")!;
  const counted = { phrases: 0, runs: 0, longest: 0 };
  for (const { chart, options, take } of [
    ...takes((jam) => jam.style.id === "jazz" && jam.chart.meter === "3/4"),
    ...heldTakes(jazz, "3/4", false, true),
    ...heldTakes(jazz, "3/4", true, true),
    ...HEMIOLA_HELD.map((options) => ({
      chart: waltz,
      options,
      take: render(waltz.text, jazz, options),
    })),
  ]) {
    const byBar = strikesByBar(take);
    const strikes = (bar: PlanBar) => byBar.get(bar.index) ?? [];
    const phrases = new Map<string, PlanBar[]>();
    for (const bar of take.plan.bars) {
      if (bar.kind !== "music" || bar.ending || bar.seats.chords === null) continue;
      if (bar.meter.beats !== 3 || bar.meter.unit !== 4) continue;
      const place = `${bar.section.occurrence}/${bar.phrase.index}`;
      phrases.set(place, [...(phrases.get(place) ?? []), bar]);
    }
    // The run of phrases on the hemiola that ends at the phrase before: its bars, its last bar.
    let run = { bars: 0, last: -1 };
    for (const bars of phrases.values()) {
      const first = bars[0]!;
      const where = `${chart.file} ${JSON.stringify(options)} bars ${first.index} to ${bars.at(-1)!.index}`;
      const band = bars.every((bar) => bar.solo === null);
      const whole = first.phrase.bar === 0 && bars.length === first.phrase.length;
      if (band && whole && tierOf(first.seats.chords!) === "mid") counted.phrases++;
      // Under a soloist: no phrase of it is the hemiola throughout.
      if (!band) {
        assert.equal(hemiolaPhase(bars, strikes), null, `${where}: the hemiola under a soloist`);
        run = { bars: 0, last: -1 };
        continue;
      }
      // With the band alone a bar of the hemiola that no other figure plays (a lone stab on 2)
      // says the phrase is played on it, and then all of it is.
      const said = bars.some((bar) => hemiolaBar(bar, strikes(bar), 1));
      if (!said) {
        run = { bars: 0, last: -1 };
        continue;
      }
      const at = bars.map((bar) =>
        strikes(bar)
          .map((strike) => (strike.tick - bar.start) / STEP)
          .join(" "),
      );
      assert.equal(first.phrase.bar, 0, `${where}: the hemiola, not from the phrase's top`);
      assert.notEqual(
        hemiolaPhase(bars, strikes),
        null,
        `${where}: not the hemiola throughout (${at.join(" | ")})`,
      );
      assert.equal(tierOf(first.seats.chords!), "mid", `${where}: the hemiola, not working`);
      assert.ok(
        first.phrase.length >= 4 && first.phrase.length <= 8,
        `${where}: a phrase of ${first.phrase.length}`,
      );
      counted.runs++;
      const goesOn = run.last === first.index - 1;
      assert.ok(
        !goesOn || first.barInSection !== 0,
        `${where}: the hemiola goes on over the top of a section`,
      );
      run = { bars: (goesOn ? run.bars : 0) + bars.length, last: bars.at(-1)!.index };
      counted.longest = Math.max(counted.longest, run.bars);
      assert.ok(run.bars <= 8, `${where}: a run of the hemiola ${run.bars} bars long`);
    }
  }
  assert.ok(counted.phrases > 20 && counted.runs > 0, `only ${JSON.stringify(counted)}`);
  assert.ok(
    counted.runs < 0.5 * counted.phrases,
    `the hemiola in ${counted.runs} of ${counted.phrases} working phrases`,
  );
});

test(
  "neo-soul: in six and twelve the Rhodes holds and leans:away from a soloist, in a bar of one chord, it is never struck on every pulse, and from the working level up it leans into a pulse, struck on an eighth between them (the lazy re-strike, or a chord laid in late)",
  only("neosoul"),
  () => {
    let quiet = 0;
    let working = 0;
    const neosoul = STYLES.find((style) => style.id === "neosoul")!;
    const compound = (jam: { chart: { meter: string } }) =>
      jam.chart.meter === "12/8" || jam.chart.meter === "6/8";
    const played = [
      ...takes((jam) => jam.style.id === "neosoul" && compound(jam)),
      ...heldTakes(neosoul, "12/8"),
      ...heldTakes(neosoul, "6/8"),
    ];
    for (const { chart, options, take } of played) {
      const byBar = strikesByBar(take);
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.ending || bar.seats.chords === null) continue;
        if (bar.solo !== null || bar.spans.length !== 1 || bar.spans[0]!.chord === null) continue;
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        const steps = (byBar.get(bar.index) ?? []).map(
          (strike) => (strike.tick - bar.start) / (PPQ / 4),
        );
        const pulses = pulseStarts(bar.meter).map((tick) => tick / (PPQ / 4));
        assert.ok(
          !pulses.every((pulse) => steps.includes(pulse)),
          `${where}: a chord on every pulse (${steps.join(" ")})`,
        );
        if (tierOf(bar.seats.chords) === "low") {
          quiet++;
          continue;
        }
        working++;
        assert.ok(
          steps.some((step) => step % 2 === 0 && !pulses.includes(step)),
          `${where}: struck only on the pulses (${steps.join(" ")})`,
        );
      }
    }
    if (LIBRARY.some((chart) => compound({ chart })))
      assert.ok(working > 100 && quiet > 50, `only ${working} bars working and ${quiet} quiet`);
  },
);

test(
  'disco: in six and twelve the guitar\'s chop is on the "and": in every bar it comps, soloist or not, a chord sounds on the last eighth of each backbeat pulse (2 and 4 in twelve, the second pulse in six), and the hand touches the strings on nothing between the eighths; quiet, only on the pulses and their last eighths; from the working level up on every eighth, a chop or a scratch (the One may be left to a chord leant into, still ringing)',
  only("disco"),
  () => {
    let quiet = 0;
    let working = 0;
    const disco = STYLES.find((style) => style.id === "disco")!;
    const compound = (jam: { chart: { meter: string } }) =>
      jam.chart.meter === "12/8" || jam.chart.meter === "6/8";
    const played = [
      ...takes((jam) => jam.style.id === "disco" && compound(jam)),
      ...heldTakes(disco, "12/8"),
      ...heldTakes(disco, "6/8"),
    ];
    const SIXTEENTH = PPQ / 4;
    for (const { chart, options, take } of played) {
      const chops = strikesOf(take);
      const strokes = [...chops, ...strikesOf(take, true)];
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.ending || bar.seats.chords === null) continue;
        if (bar.spans.some((span) => span.chord === null)) continue;
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        const end = bar.start + bar.ticks;
        const inBar = (list: readonly Strike[]) =>
          new Set(
            list
              .filter((strike) => strike.tick >= bar.start && strike.tick < end)
              .map((strike) => (strike.tick - bar.start) / SIXTEENTH),
          );
        const sounds = inBar(chops);
        const touched = inBar(strokes);
        const steps = Math.round(bar.ticks / SIXTEENTH);
        // The backbeat pulses: every pulse that is not a strong one. In sixteenths, a pulse is six.
        for (let pulse = 6; pulse < steps; pulse += 12)
          assert.ok(
            sounds.has(pulse + 4),
            `${where}: no chop on the "and" of the pulse at ${pulse}`,
          );
        for (const step of touched) assert.equal(step % 2, 0, `${where}: between the eighths`);
        if (tierOf(bar.seats.chords) === "low") {
          quiet++;
          for (const step of touched)
            assert.ok(step % 6 !== 2, `${where}: quiet, and the middle eighth at ${step}`);
          continue;
        }
        working++;
        const leant = chops.some(
          (strike) => strike.tick === bar.start - PPQ / 2 && strike.ends > bar.start + POCKET,
        );
        for (let step = leant ? 2 : 0; step < steps; step += 2)
          assert.ok(touched.has(step), `${where}: the hand leaves eighth ${step / 2 + 1} out`);
      }
    }
    if (LIBRARY.some((chart) => compound({ chart })))
      assert.ok(working > 100 && quiet > 50, `only ${working} bars working and ${quiet} quiet`);
  },
);

test("a section keeps its figure: away from a solo, every phrase opens on the same rhythm each time the section comes round at the same level, but a phrase played whole on a figure of two bars (the waltz's hemiola), which opens on that figure", () => {
  let compared = 0;
  for (const { style, chart, options, take } of takes(written)) {
    const byBar = strikesByBar(take);
    const openings = new Map<string, string>();
    for (const bar of take.plan.bars) {
      if (bar.kind !== "music" || bar.ending || bar.seats.chords === null) continue;
      if (bar.phrase.bar !== 0) continue;
      // Where the soloist has the lead the hand lays out under the line and answers its
      // breaths: the figure is still the section's, with strikes left out and put in.
      if (bar.solo !== null) continue;
      // A bar with one chord: where a chord changes inside the bar, the hand owes it a strike.
      if (bar.spans.filter((span) => !span.tied).length !== 1 || bar.spans[0]!.chord === null)
        continue;
      // A phrase on a figure of two bars, where the book has one: its second bar says so.
      const next = take.plan.bars[bar.index + 1];
      if (
        playsTwoBars(style, bar) &&
        next?.phrase.index === bar.phrase.index &&
        (hemiolaBar(next, byBar.get(next.index) ?? [], 1) ||
          (hemiolaBar(bar, byBar.get(bar.index) ?? [], 1) &&
            hemiolaBar(next, byBar.get(next.index) ?? [], 0)))
      )
        continue;
      // Leave out the first eighth and the last beat, where a push comes and goes with the
      // harmony (a pushed chord is not struck again; the beat before a push is cleared for it).
      const rhythm = (byBar.get(bar.index) ?? [])
        .map((strike) => strike.tick - bar.start)
        .filter((tick) => tick >= PPQ / 2 && tick < bar.ticks - lastPulse(bar.meter))
        .join(" ");
      const key = `${bar.section.identity} ${tierOf(bar.seats.chords)}`;
      const known = openings.get(key);
      if (known === undefined) openings.set(key, rhythm);
      else {
        compared++;
        assert.equal(rhythm, known, `${chart.file} seed ${options.seed} bar ${bar.index} (${key})`);
      }
    }
  }
  assert.ok(compared > enough(1000), `only ${compared} phrase openings compared`);
});

// ── a guitar in the chord seat ──────────────────────────────────────────────

test(
  "jazz: the piano is one hand, and the root is the bass's: a strike is at most four notes inside an octave, and on a chord with a seventh or a sixth it has no root, unless the chord is a diminished seventh or is written over another bass note",
  only("jazz"),
  () => {
    let rootless = 0;
    const jazz = (jam: { style: { id: string } }) => jam.style.id === "jazz";
    for (const { chart, options, take } of [...takes(jazz), ...stressTakes(jazz)]) {
      for (const strike of strikesOf(take)) {
        const where = `${chart.file} seed ${options.seed} at tick ${strike.tick}: ${strike.pitches}`;
        assert.ok(strike.pitches.length <= 4, `${where}: more than four notes`);
        assert.ok(strike.pitches.at(-1)! - strike.pitches[0]! <= 12, `${where}: wider than a hand`);
        // The chords the strike may be playing (the one coming, when it leans in): it is wrong
        // only if it is wrong as each of them.
        const under = chordsUnder(take, strike).map(({ chord }) => ({
          chord,
          owed:
            chord.bass === null &&
            chordFamily(chord.quality) !== "diminished" &&
            chordTones(chord.quality).some((tone) => ["seventh", "sixth"].includes(tone.role)),
        }));
        if (!under.some(({ owed }) => owed)) continue;
        rootless++;
        assert.ok(
          under.some(
            ({ chord, owed }) =>
              !owed || strike.pitches.every((pitch) => pitch % 12 !== pitchClass(chord.root)),
          ),
          `${where}: the root of ${under.map(({ chord }) => chord.text).join(" or ")}`,
        );
      }
    }
    assert.ok(rootless > enough(3000), `only ${rootless} strikes on a seventh or sixth chord`);
  },
);

const guitars = STYLES.filter((style) => style.chords.idiom !== "keys");
const strummed = (jam: { style: (typeof STYLES)[number] }) => guitars.includes(jam.style);

/** The library's charts in six-eight. */
const SIXES = LIBRARY.filter((chart) => chart.meter === "6/8");
/**
 * The guitars whose hand swings in eighths that have written a band for six-eight, where the
 * library has a chart in it: what is picked and strummed in six as six-eight is (acoustic's). A
 * hand that swings in sixteenths (funk's) is held to its own rules in six.
 */
const guitarsInSix = guitars.filter(
  (style) =>
    SIXES.length > 0 &&
    (WRITTEN[style.id] ?? []).includes("6/8") &&
    style.chords.idiom !== "keys" &&
    style.chords.idiom.strum.grid === "eighth",
);
/** The library's charts in twelve-eight, and the guitars that swing in eighths and have written it. */
const TWELVES = LIBRARY.filter((chart) => chart.meter === "12/8");
const guitarsInTwelve = guitars.filter(
  (style) =>
    TWELVES.length > 0 &&
    (WRITTEN[style.id] ?? []).includes("12/8") &&
    style.chords.idiom !== "keys" &&
    style.chords.idiom.strum.grid === "eighth",
);
const inSix = (jam: { style: (typeof STYLES)[number]; chart: { meter: string } }) =>
  (guitarsInSix.includes(jam.style) && jam.chart.meter === "6/8") ||
  (guitarsInTwelve.includes(jam.style) && jam.chart.meter === "12/8");
/**
 * The bars of six and twelve a guitar plays: every take of the library's in six or twelve that
 * it is handed; each chart in six held quiet with a bassist and without one, and held working
 * and hot; and each chart in twelve (its own on a push, every one on the full run) held at the
 * three levels as the other seats' properties hold it, and quiet with no bassist.
 */
function sixes(): { where: string; style: (typeof STYLES)[number]; take: Take }[] {
  return [
    ...guitarsInTwelve.flatMap((style) => [
      ...heldTakes(style, "12/8").map(({ chart, options, take }) => ({
        where: `${chart.file} held at ${options.energy} seed ${options.seed}`,
        style,
        take,
      })),
      ...(FULL ? TWELVES : ownCharts(style).filter((chart) => chart.meter === "12/8")).flatMap(
        (chart) =>
          SEEDS.slice(0, 2).map((seed) => ({
            where: `${chart.file} held at 0.3 with no bassist seed ${seed}`,
            style,
            take: render(chart.text, style, {
              mode: "jam",
              passes: 2,
              seed,
              energy: 0.3,
              without: ["bass"],
            }),
          })),
      ),
    ]),
    ...takes(inSix).map(({ style, chart, options, take }) => ({
      where: `${chart.file} seed ${options.seed}`,
      style,
      take,
    })),
    ...guitarsInSix.flatMap((style) =>
      (FULL ? SIXES : ownCharts(style).filter((chart) => chart.meter === "6/8")).flatMap((chart) =>
        [
          { energy: 0.3 },
          { energy: 0.3, without: ["bass"] as const },
          { energy: 0.55 },
          { energy: 0.85 },
        ].flatMap((held) =>
          SEEDS.slice(0, 2).map((seed) => ({
            where: `${chart.file} held at ${held.energy}${held.without ? " with no bassist" : ""} seed ${seed}`,
            style,
            take: render(chart.text, style, { mode: "jam", passes: 2, seed, ...held }),
          })),
        ),
      ),
    ),
  ];
}
let sixesMade: ReturnType<typeof sixes> | undefined;
const sixesOnce = () => {
  sixesMade ??= sixes();
  return sixesMade;
};
// Floors for the bars of six. The strums are counted over the library's takes, written for the
// full run and scaled to its seeds; the rest are mostly the charts held at a level, rendered on
// two seeds on every run (acoustic's own on a push, every chart in the meter on the full run),
// and are not scaled (a push sees 62 bars picked alone, 379 chords picked, 273 bars picked and
// 124 of them quiet, 433 strummed). A
// chart added to the library moves which charts a style is handed on a push: with the blues'
// chart in six the push counted 1,317 strums, under the 1,333 that 4,000 asked of it.
// With jazz's chart in six and acoustic's in twelve in the library the push counts 259 chords
// picked in six and 194 bars: the floors are about two thirds of that, since the next chart
// added will move them again. They say the rule met bars to judge, and nothing else.
const COMPOUND_STRUMS = 3600;
const ALONE_IN_SIX = 40;
const PICKED_IN_SIX = 170;
const PICKED_BARS_IN_SIX = 130;
const QUIET_IN_SIX = 80;
const STRUMMED_BARS_IN_SIX = 300;
// The same in twelve (a push sees 226 chords picked, 126 bars picked alone, 220 bars picked
// and 189 of them quiet, 491 strummed).
const PICKED_IN_TWELVE = 150;
const ALONE_IN_TWELVE = 80;
const PICKED_BARS_IN_TWELVE = 150;
const QUIET_IN_TWELVE = 120;
const STRUMMED_BARS_IN_TWELVE = 300;

/** Standard tuning, low string first. */
const OPEN = [40, 45, 50, 55, 59, 64];

/**
 * Whether a hand can hold these notes (low to high) on a guitar: a string each, pitch rising
 * string to string, on neighbouring strings or with one muted inside the grip where the
 * guitar allows that, nothing over the 15th fret, every fretted note inside four frets, and an
 * open string only where the guitar plays them. `apart`: the notes are strings picked out of
 * a shape, so any number of its strings may lie unplucked between them.
 */
function holdable(
  pitches: readonly number[],
  guitar: { readonly open: boolean; readonly skip: boolean },
  apart = false,
): boolean {
  const place = (at: number, from: number, low: number, high: number, muted: boolean): boolean => {
    if (at === pitches.length) return true;
    for (let string = from; string < OPEN.length; string++) {
      // A string passed over inside the grip is muted: one at most, where the guitar may.
      const passed = at > 0 ? string - from : 0;
      if (passed > 0 && !apart && (passed > 1 || muted || !guitar.skip)) break;
      const fret = pitches[at]! - OPEN[string]!;
      if (fret < (guitar.open ? 0 : 1) || fret > 15) continue;
      const [lowest, highest] =
        fret === 0 ? [low, high] : [Math.min(low, fret), Math.max(high, fret)];
      if (highest - lowest > 3) continue;
      if (place(at + 1, string + 1, lowest, highest, muted || passed > 0)) return true;
    }
    return false;
  };
  return place(0, 0, Infinity, -Infinity, false);
}

/**
 * The top strings a style's every strum crosses in a bar of four, where its book writes them
 * all across the top N strings (`Attack.top`); otherwise none.
 */
const topStrings = (style: (typeof STYLES)[number]): number | null => {
  const book = style.chords.rhythm;
  if (!book) return null;
  const tops = [book.tiers.low, book.tiers.mid, book.tiers.high].flatMap((tier) => [
    tier.arrival,
    ...[tier.articulation, ...tier.figures.map((figure) => figure.articulation ?? {})].flatMap(
      (articulation) => Object.values(articulation),
    ),
  ]);
  const strums = tops.filter((attack) => attack.pluck === undefined && !attack.muted);
  const top = strums[0]?.top;
  return top !== undefined && strums.every((attack) => attack.top === top) ? top : null;
};

test("a guitar's chords can be held: every stroke is three notes or more and no more than the guitar has strings (four, where it grips three), one to a string, inside a four-fret hand, none over the 15th fret; on neighbouring strings and none open, unless the style's guitar may mute a string inside its grip or plays open strings; and a strum across the top N strings sounds nothing under the N-th string's open pitch", {
  skip: guitars.length === 0,
}, () => {
  let strokes = 0;
  let topped = 0;
  for (const { style, chart, options, take } of [...takes(strummed), ...stressTakes(strummed)]) {
    const idiom = style.chords.idiom;
    if (idiom === "keys") continue;
    const top = topStrings(style);
    for (const stroke of [...strikesOf(take), ...strikesOf(take, true)]) {
      strokes++;
      const where = `${chart.file} seed ${options.seed} at tick ${stroke.tick}: ${stroke.pitches}`;
      assert.ok(
        stroke.pitches.length >= 3 && stroke.pitches.length <= Math.max(4, idiom.strings),
        `${where}: the strings`,
      );
      assert.ok(holdable(stroke.pitches, idiom), `${where}: no hand holds this`);
      // In a bar of four the book plays, short of the ending, every strum crosses the top strings.
      if (top === null) continue;
      const bar = barAt(take.plan.bars, stroke.tick);
      if (!bar || bar.ending || bar.meter.beats !== 4 || bar.meter.unit !== 4) continue;
      topped++;
      const lowest = OPEN[OPEN.length - top]!;
      // Under them only a tone the chord is heard by (its third or suspension, its seventh or
      // sixth, a written alteration) that the top strings lack, reached for as an upstroke
      // reaches (X-B-13): the guitar's own rule.
      const chord = chordAt(take, stroke.tick);
      const altered = { b5: 6, "#5": 8, b9: 1, "#9": 3, "#11": 6, b13: 8 } as const;
      const heard = (pitch: number) =>
        chord !== null &&
        [
          ...chordTones(chord.quality)
            .filter(
              (tone, _, all) =>
                ["third", "sus", "seventh", "sixth"].includes(tone.role) ||
                // An eleventh chord's eleventh stands where the third would (the voicing's 3).
                (tone.role === "eleventh" &&
                  !all.some((other) => other.role === "third" || other.role === "sus")),
            )
            .map((tone) => tone.interval),
          ...chord.quality.alterations.map((alteration) => altered[alteration]),
        ].some((interval) => (pitchClass(chord.root) + interval) % 12 === pitch % 12);
      const over = stroke.pitches.filter((pitch) => pitch >= lowest);
      for (const pitch of stroke.pitches.filter((pitch) => pitch < lowest)) {
        assert.ok(
          heard(pitch) && !over.some((other) => (other - pitch) % 12 === 0),
          `${where}: a strum across the top ${top} strings sounds ${pitch}, under ${lowest}`,
        );
      }
    }
  }
  assert.ok(strokes > enough(20000), `only ${strokes} strokes`);
  if (STYLES.some((style) => topStrings(style) !== null))
    assert.ok(topped > enough(30000), `only ${topped} strums across the top strings`);
});

test("a guitarist holds a grip: the notes under the hand change only where the chord does (or leaning into it), a scratch deadens the grip being held and never goes back to the last one, and after a chord leant into nothing is stroked until it has rung an eighth", {
  skip: guitars.length === 0,
}, () => {
  let moves = 0;
  let scratches = 0;
  let leant = 0;
  for (const { style, chart, options, take } of [...takes(strummed), ...stressTakes(strummed)]) {
    const idiom = style.chords.idiom;
    if (idiom === "keys") continue;
    // A guitar whose upstroke catches only the top strings of its grip shows part of the
    // shape there and the rest on the downstroke: that is one grip, not a move.
    const partial = idiom.strum.up < idiom.strings;
    const harmony = harmonyOf(take);
    const strokes = [
      ...strikesOf(take).map((stroke) => ({ ...stroke, scratch: false })),
      ...strikesOf(take, true).map((stroke) => ({ ...stroke, scratch: true })),
    ].sort((a, b) => a.tick - b.tick);
    let grip: number[] = [];
    let since = -1;
    let ringing = -1;
    for (const stroke of strokes) {
      const where = `${chart.file} seed ${options.seed} at tick ${stroke.tick}`;
      assert.ok(stroke.tick >= ringing, `${where}: stroked over a chord that was leant into`);
      const more = partial && grip.every((pitch) => stroke.pitches.includes(pitch));
      const held = stroke.pitches.every((pitch) => grip.includes(pitch)) || more;
      if (stroke.scratch) scratches++;
      // A chord leant into: struck in the eighth before its change and ringing across it.
      const coming = harmony.find(
        (arrival) =>
          !stroke.scratch &&
          arrival.changed &&
          arrival.tick > stroke.tick &&
          arrival.tick - stroke.tick <= PPQ / 2 &&
          stroke.ends > arrival.tick + POCKET,
      );
      if (coming) {
        leant++;
        ringing = coming.tick + PPQ / 2;
      }
      if (held) {
        if (more) grip = stroke.pitches;
        continue;
      }
      // The hand moved: a chord has arrived since it last did, or this is a chord leant
      // into. A scratch never leads the way: it deadens the old grip until the new chord
      // has sounded or arrived.
      moves++;
      const reach = stroke.scratch ? 0 : PPQ / 2;
      const changed = harmony.some(
        (arrival) =>
          (arrival.changed || arrival.index === 0) &&
          arrival.tick > since &&
          arrival.tick <= stroke.tick + reach,
      );
      assert.ok(changed, `${where}: from ${grip} to ${stroke.pitches} under one chord`);
      grip = stroke.pitches;
      since = stroke.tick;
    }
  }
  // A guitar that never scratches, or never leans into a change, has none of either to show:
  // the reggae skank is chops alone and is never early (ST-reggae-19, ST-reggae-29).
  const scratching = guitars.some((style) => {
    const book = style.chords.rhythm;
    return (
      book !== null &&
      [book.tiers.low, book.tiers.mid, book.tiers.high].some((tier) =>
        Object.values(tier.articulation).some((attack) => attack.muted === true),
      )
    );
  });
  const leaning = guitars.some(
    (style) =>
      Object.values(style.chords.anticipation.barline).some((chance) => chance > 0) ||
      style.chords.anticipation.midBar === "tie",
  );
  assert.ok(
    moves > enough(1000) &&
      (!scratching || scratches > enough(5000)) &&
      (!leaning || leant > enough(100)),
    `only ${moves} moves, ${scratches} scratches, ${leant} chords leant into`,
  );
});

test("the strumming hand is a pendulum: on the grid it strums, a stroke between the beat's halves comes up, the high string first, and every other stroke goes down, the low string first; in a bar of dotted pulses a hand strumming eighths swings down on the pulse and comes up on its last eighth", {
  skip: guitars.length === 0,
}, () => {
  let ups = 0;
  let downs = 0;
  let compound = 0;
  for (const { style, chart, options, take } of takes((jam) => strummed(jam) && written(jam))) {
    if (style.chords.idiom === "keys") continue;
    const eighths = style.chords.idiom.strum.grid === "eighth";
    const pair = eighths ? PPQ : PPQ / 2;
    const harmony = harmonyOf(take);
    const byTick = Map.groupBy(notesOf(take, "chords"), (note) => note.tick);
    for (const [tick, notes] of byTick) {
      const bar = barAt(take.plan.bars, tick)!;
      // A pulse of three eighths is down, down, up: the "and" is the pulse's last eighth
      // (ST-acoustic-04, DR-10), and the hand comes back up unheard between the first two.
      const dotted = eighths && isCompound(bar.meter);
      if (dotted && notes.some((note) => note.voice !== PICKED)) compound++;
      const between = dotted
        ? onAnd(bar.meter, tick - bar.start)
        : (tick - bar.start) % pair >= pair / 2;
      // The chord that arrives off the beat is struck down wherever the hand is, and so is
      // the last chord of the tune.
      const deliberate = bar.ending || harmony.some((arrival) => arrival.tick === tick);
      if (between && deliberate) continue;
      const rising = notes.toSorted((a, b) => a.pitch - b.pitch).map((note) => note.offset);
      const where = `${chart.file} seed ${options.seed} bar ${bar.index} tick ${tick - bar.start}`;
      for (let i = 1; i < rising.length; i++) {
        if (between) assert.ok(rising[i]! <= rising[i - 1]!, `${where}: an upstroke, low first`);
        else assert.ok(rising[i]! >= rising[i - 1]!, `${where}: a downstroke, high first`);
      }
      const rolled = rising.at(-1)! !== rising[0]!;
      if (rolled && between) ups++;
      if (rolled && !between) downs++;
    }
  }
  // The reggae hand comes up only for the flick after a chop (ST-reggae-19): on the full run it
  // rolls about 1,300 upstrokes where funk's and disco's roll 32,000 and 76,000. The floor is
  // well under that: it says the rule was seen at work, and a library that grows moves the count.
  assert.ok(
    ups > enough(800) && downs > enough(5000),
    `only ${ups} upstrokes and ${downs} downstrokes rolled`,
  );
  if (guitarsInSix.length > 0)
    assert.ok(compound > enough(COMPOUND_STRUMS), `only ${compound} strums in six`);
});

// ── a guitar that picks ─────────────────────────────────────────────────────

/** The guitars whose rhythm book plucks: a tier's attacks, or a figure's own. */
const pickers = guitars.filter((style) => {
  const book = style.chords.rhythm;
  if (!book) return false;
  return [book.tiers.low, book.tiers.mid, book.tiers.high].some((tier) =>
    [tier.articulation, ...tier.figures.map((figure) => figure.articulation ?? {})].some(
      (articulation) => Object.values(articulation).some((attack) => attack.pluck !== undefined),
    ),
  );
});
const picked = (jam: { style: (typeof STYLES)[number] }) => pickers.includes(jam.style);
/** The symbols a figure's grid strikes with, by what each attack is. */
const attacksOf = (style: (typeof STYLES)[number]) => {
  const book = style.chords.rhythm;
  if (!book) return [];
  return [book.tiers.low, book.tiers.mid, book.tiers.high].flatMap((tier) =>
    tier.figures.map((figure) => {
      const articulation = { ...tier.articulation, ...(figure.articulation ?? {}) };
      const attacks = (grid: string) =>
        [...grid].flatMap((symbol) => (articulation[symbol] ? [articulation[symbol]!] : []));
      return { grid: attacks(figure.grid), alone: figure.alone ? attacks(figure.alone) : null };
    }),
  );
};
/**
 * A guitar that picks with the band: a figure it plays with a bassist has plucked strings in it.
 * Its plucks are common, so the rule below must see enough of them; a guitar that picks only the
 * boom with no bassist (country's, ST-country-07) is held to the rule on every string it plucks,
 * and to no count of them.
 */
const picksWithTheBand = (style: (typeof STYLES)[number]): boolean =>
  attacksOf(style).some(({ grid }) => grid.some((attack) => attack.pluck !== undefined));
/**
 * A guitar that plucks with no bassist: a figure's second grid has plucked strings in it, the
 * Travis hand's or a boom-chick's boom. Every bar it plucks with the bass out is read below.
 */
/**
 * Where a style's figures write the boom-chick's alternate (`fifth`), with no bassist: the
 * sixteenths of a bar of four. Read from the figures' second grids, so a hand told to take the
 * chord's fifth is held to it wherever the data says so, and nowhere else.
 */
const fifthsWritten = (style: (typeof STYLES)[number]): ReadonlySet<number> => {
  const steps = new Set<number>();
  const book = style.chords.rhythm;
  if (!book) return steps;
  for (const tier of [book.tiers.low, book.tiers.mid, book.tiers.high]) {
    for (const figure of tier.figures) {
      const articulation = { ...tier.articulation, ...(figure.articulation ?? {}) };
      const grid = [...(figure.alone ?? "")].filter((symbol) => symbol !== " ");
      if (grid.length !== 16) continue;
      grid.forEach((symbol, step) => {
        if (articulation[symbol]?.pluck?.includes("fifth")) steps.add(step);
      });
    }
  }
  return steps;
};
const plucksAlone = (style: (typeof STYLES)[number]): boolean =>
  attacksOf(style).some(({ alone }) => alone?.some((attack) => attack.pluck !== undefined));
/**
 * A guitar that picks a whole bar with no bassist: a figure's second grid that is all plucked
 * strings, the Travis hand. Such a bar is asked a string on every pulse besides; a boom-chick's
 * bar with no bassist strums its chick between.
 */
const picksAlone = (style: (typeof STYLES)[number]): boolean =>
  attacksOf(style).some(
    ({ alone }) =>
      alone !== null && alone.length > 0 && alone.every((attack) => attack.pluck !== undefined),
  );

test("a picked note is a string of the shape the hand is holding: everything the guitar plucks under one chord, with whatever it strums there, is no more notes than it has strings and one shape a hand can hold; and a plucked string rings on under the hand until it is plucked again, never past its chord and never into a strum", {
  skip: pickers.length === 0,
}, () => {
  let chords = 0;
  let plucks = 0;
  let rang = 0;
  let six = 0;
  let twelve = 0;
  const played = [
    ...[...takes(picked), ...stressTakes(picked)].map(({ style, chart, options, take }) => ({
      of: `${chart.file} seed ${options.seed}`,
      style,
      take,
    })),
    ...sixesOnce().map(({ where, style, take }) => ({ of: where, style, take })),
  ];
  for (const { style, of, take } of played) {
    const idiom = style.chords.idiom;
    if (idiom === "keys") continue;
    const harmony = harmonyOf(take);
    const plucked = pluckedOf(take);
    const strums = strikesOf(take);
    let from = 0;
    let strummed = 0;
    harmony.forEach((arrival, i) => {
      if (!arrival.changed) return;
      // The chord sounds until the next one that is not the same chord written again. The same
      // chord over another bass note (G7 to G7/B) is the same grip: a guitar that stands on its
      // root holds it, and leaves the bass note to the bassist.
      const above = (chord: typeof arrival.chord) => chord?.text.split("/")[0];
      const until =
        harmony
          .slice(i + 1)
          .find((next) => next.changed && above(next.chord) !== above(arrival.chord))?.tick ??
        Infinity;
      while (from < plucked.length && plucked[from]!.tick < arrival.tick) from++;
      let to = from;
      while (to < plucked.length && plucked[to]!.tick < until) to++;
      const own = plucked.slice(from, to);
      from = to;
      if (own.length === 0) return;
      chords++;
      const meter = take.plan.bars[arrival.bar]!.meter;
      if (meter.beats === 6 && meter.unit === 8) six++;
      if (meter.beats === 12 && meter.unit === 8) twelve++;
      const where = `${of}: ${arrival.chord?.text} at tick ${arrival.tick}`;
      // What it strums under the same chord is the same shape. A strum in the eighth before
      // the next chord may be that chord, played early, and is left out.
      while (strummed < strums.length && strums[strummed]!.tick < arrival.tick) strummed++;
      const alongside: Strike[] = [];
      for (let at = strummed; strums[at] && strums[at]!.tick < until - PPQ / 2; at++) {
        alongside.push(strums[at]!);
      }
      const shape = [...new Set([...own, ...alongside].flatMap((stroke) => stroke.pitches))].sort(
        (a, b) => a - b,
      );
      assert.ok(shape.length <= idiom.strings, `${where}: ${shape}: more notes than strings`);
      assert.ok(holdable(shape, idiom, true), `${where}: ${shape}: not one shape a hand holds`);
      const nextStrum = (tick: number) => {
        let at = strummed;
        while (strums[at] && strums[at]!.tick <= tick) at++;
        return strums[at];
      };
      own.forEach((note, at) => {
        plucks++;
        const [pitch] = note.pitches;
        assert.ok(note.ends <= until + POCKET, `${where}: ${pitch} rings into the next chord`);
        const again = own.slice(at + 1).find((later) => later.pitches[0] === pitch);
        if (again) {
          assert.ok(
            note.ends <= again.sounds + POCKET,
            `${where}: ${pitch} still ringing when its string is plucked again`,
          );
        }
        const strum = nextStrum(note.tick);
        if (strum) {
          assert.ok(note.ends <= strum.sounds + POCKET, `${where}: ${pitch} rings into a strum`);
        }
        // It rings on: past the next string plucked, where its own is not plucked first.
        const next = own[at + 1];
        if (next && next.tick > note.tick && note.ends > next.sounds + POCKET) rang++;
      });
    });
  }
  if (STYLES.some(picksWithTheBand))
    assert.ok(
      chords > enough(1200) && plucks > enough(9000) && rang > enough(7000),
      `only ${chords} picked chords, ${plucks} plucked notes, ${rang} that rang on`,
    );
  if (guitarsInSix.length > 0) assert.ok(six > PICKED_IN_SIX, `only ${six} chords picked in six`);
  if (guitarsInTwelve.length > 0)
    assert.ok(twelve > PICKED_IN_TWELVE, `only ${twelve} chords picked in twelve`);
});

test("with no bassist the picking thumb is the bass: in a bar of four, or of six or twelve where the style has written it, wherever the guitar plucks while the bass is out (strumming between or not), the first string plucked on a pulse under a chord is that chord's root, with nothing plucked in the bar under it but the fifth below; a string plucked where the figure asks the boom's fifth sounds the chord's fifth, never the bass again; and a guitar that picks the whole bar plucks a string on every pulse a chord sounds on", {
  skip: pickers.length === 0,
}, () => {
  let bars = 0;
  let stated = 0;
  let plucking = 0;
  let booms = 0;
  let fifths = 0;
  let six = 0;
  let twelve = 0;
  const played = [
    ...takes(picked).map(({ style, chart, options, take }) => ({
      where: `${chart.file} seed ${options.seed}`,
      style,
      take,
    })),
    ...sixesOnce(),
  ];
  for (const { where: of, style, take } of played) {
    const toFifth = fifthsWritten(style);
    const harmony = harmonyOf(take);
    const plucked = pluckedOf(take);
    const strums = strikesOf(take);
    for (const bar of take.plan.bars) {
      if (bar.kind !== "music" || bar.ending || bar.seats.chords === null) continue;
      const four = bar.meter.beats === 4 && bar.meter.unit === 4;
      const inSix = bar.meter.beats === 6 && bar.meter.unit === 8;
      const inTwelve = bar.meter.beats === 12 && bar.meter.unit === 8;
      if (bar.seats.bass !== null || !(four || inSix || inTwelve)) continue;
      const end = bar.start + bar.ticks;
      const own = plucked.filter((note) => note.tick >= bar.start && note.tick < end);
      if (own.length === 0) continue;
      // A bar picked whole, the Travis hand; or one where the pick plays the boom between strums.
      const whole = !strums.some((s) => s.tick >= bar.start && s.tick < end);
      plucking++;
      if (whole) {
        bars++;
        if (inSix) six++;
        if (inTwelve) twelve++;
      }
      const where = `${of} bar ${bar.index}`;
      // The chords of the bar, each from where it arrives (or the barline) to the next.
      const at = harmony.findLastIndex((arrival) => arrival.tick <= bar.start);
      for (let i = Math.max(0, at); harmony[i] && harmony[i]!.tick < end; i++) {
        const arrival = harmony[i]!;
        if (!arrival.chord || (i > at && !arrival.changed)) continue;
        const chord = arrival.chord;
        const starts = Math.max(arrival.tick, bar.start);
        const next = harmony.slice(i + 1).find((later) => later.changed);
        const stops = Math.min(next?.tick ?? Infinity, end);
        const root = pitchClass(chord.root);
        let first = true;
        for (const pulse of pulseStarts(bar.meter)) {
          const beat = bar.start + pulse;
          if (beat < starts || beat >= stops) continue;
          const thumb = own.filter((note) => note.tick === beat).map((note) => note.pitches[0]!);
          if (whole)
            assert.ok(thumb.length > 0, `${where}: no string plucked on the pulse at ${beat}`);
          if (thumb.length === 0 || !first) continue;
          first = false;
          if (whole) stated++;
          else booms++;
          const bass = Math.min(...thumb);
          assert.equal(bass % 12, root, `${where}: ${chord.text} is first given ${bass}`);
          // Nothing under the bass but the alternate bass, a fourth below it.
          const under = own.filter(
            (note) => note.tick >= starts && note.tick < stops && note.pitches[0]! < bass,
          );
          assert.ok(
            under.every((note) => note.pitches[0] === bass - 5),
            `${where}: ${chord.text} has ${under.map((note) => note.pitches[0])} under its bass ${bass}`,
          );
        }
        // A string plucked as the boom's alternate (`fifth`) sounds the chord's fifth (its own root
        // over a slash chord on its fifth), never the bass again: where the chord is already
        // stated, for under a new chord the thumb's first note is its bass.
        if (four) {
          const fifth = chordTones(chord.quality).find((tone) => tone.role === "fifth");
          const wanted = [(root + (fifth?.interval ?? 7)) % 12];
          if (chord.bass && pitchClass(chord.bass) === wanted[0]) wanted.push(root);
          for (const step of toFifth) {
            const tick = bar.start + step * STEP;
            if (tick <= starts || tick >= stops) continue;
            if (!own.some((note) => note.tick >= starts && note.tick < tick)) continue;
            const at = own.filter((note) => note.tick === tick).map((note) => note.pitches[0]!);
            if (at.length === 0) continue;
            fifths++;
            const thumb = Math.min(...at) % 12;
            assert.ok(
              wanted.includes(thumb),
              `${where}: ${chord.text} is plucked ${Math.min(...at)} where the figure asks its fifth`,
            );
          }
        }
      }
    }
  }
  if (STYLES.some((style) => fifthsWritten(style).size > 0))
    assert.ok(fifths > enough(60), `only ${fifths} strings plucked as a chord's fifth`);
  if (STYLES.some(picksAlone))
    assert.ok(
      bars > enough(60) && stated > enough(60),
      `only ${bars} bars picked with no bassist, ${stated} chords stated`,
    );
  if (STYLES.some(plucksAlone))
    assert.ok(
      plucking > enough(60) && stated + booms > enough(60),
      `only ${plucking} bars plucked with no bassist, ${stated + booms} chords stated`,
    );
  if (guitarsInSix.length > 0)
    assert.ok(six > ALONE_IN_SIX, `only ${six} bars of six picked alone`);
  if (guitarsInTwelve.length > 0)
    assert.ok(twelve > ALONE_IN_TWELVE, `only ${twelve} bars of twelve picked alone`);
});

// ── a guitar in six ─────────────────────────────────────────────────────────

/** The bars of six a guitar plays as written (not the ending's), with what it plucks and strums in each. */
function barsOfSix() {
  return sixesOnce().flatMap(({ where, take }) => {
    const plucked = pluckedOf(take);
    const strums = strikesOf(take);
    const harmony = harmonyOf(take);
    return take.plan.bars
      .filter(
        (bar) =>
          bar.kind === "music" &&
          !bar.ending &&
          bar.seats.chords !== null &&
          (bar.meter.beats === 6 || bar.meter.beats === 12) &&
          bar.meter.unit === 8,
      )
      .map((bar) => {
        const inBar = <T extends { tick: number }>(list: readonly T[]) =>
          list.filter((s) => s.tick >= bar.start && s.tick < bar.start + bar.ticks);
        return {
          where: `${where} bar ${bar.index}`,
          bar,
          harmony,
          plucks: inBar(plucked),
          strums: inBar(strums),
          // The chord leant into on the eighth before the barline, still ringing in this bar.
          pushed: strums.some(
            (strum) => strum.tick === bar.start - PPQ / 2 && strum.ends > bar.start + POCKET,
          ),
          velocities: new Map(
            [...Map.groupBy(inBar(notesOf(take, "chords")), (note) => note.tick)].map(
              ([tick, notes]) => [
                tick,
                notes.reduce((sum, note) => sum + note.velocity, 0) / notes.length,
              ],
            ),
          ),
        };
      });
  });
}

const EIGHTH = PPQ / 2;

test("a guitar picks a bar of six or twelve as compound time is picked: quiet it always picks, and a picked bar has a string on every eighth and nothing between them, the thumb on the first pulse of each half of the bar (both pulses in six, 1 and 3 in twelve) and no finger under it before the next half", {
  skip: guitarsInSix.length === 0 && guitarsInTwelve.length === 0,
}, () => {
  const picked = { 6: 0, 12: 0 };
  const quiet = { 6: 0, 12: 0 };
  for (const { where, bar, harmony, plucks, strums } of barsOfSix()) {
    const beats = bar.meter.beats as 6 | 12;
    if (tierOf(bar.seats.chords!) === "low") {
      quiet[beats]++;
      assert.equal(strums.length, 0, `${where}: quiet, and strummed`);
    }
    if (plucks.length === 0 || strums.length > 0) continue;
    picked[beats]++;
    for (const pluck of plucks) {
      assert.equal((pluck.tick - bar.start) % EIGHTH, 0, `${where}: a string between the eighths`);
    }
    for (let eighth = 0; eighth < beats; eighth++) {
      const tick = bar.start + eighth * EIGHTH;
      assert.ok(
        plucks.some((pluck) => pluck.tick === tick),
        `${where}: nothing plucked on eighth ${eighth + 1}`,
      );
    }
    const half = bar.ticks / 2;
    for (const from of [0, half]) {
      const at = bar.start + from;
      const thumb = Math.min(
        ...plucks.filter((pluck) => pluck.tick === at).map((pluck) => pluck.pitches[0]!),
      );
      // Under the chord the thumb stated: a chord arriving inside the half bar has its own bass.
      const next = harmony.find((arrival) => arrival.changed && arrival.tick > at);
      const stops = Math.min(at + half, next?.tick ?? Infinity);
      const fingers = plucks.filter((pluck) => pluck.tick > at && pluck.tick < stops);
      assert.ok(
        fingers.every((finger) => finger.pitches[0]! >= thumb),
        `${where}: a finger under the thumb's ${thumb} in the half bar from ${from}`,
      );
    }
  }
  if (guitarsInSix.length > 0)
    assert.ok(
      picked[6] > PICKED_BARS_IN_SIX && quiet[6] > QUIET_IN_SIX,
      `only ${picked[6]} bars of six picked, ${quiet[6]} quiet`,
    );
  if (guitarsInTwelve.length > 0)
    assert.ok(
      picked[12] > PICKED_BARS_IN_TWELVE && quiet[12] > QUIET_IN_TWELVE,
      `only ${picked[12]} bars of twelve picked, ${quiet[12]} quiet`,
    );
});

test("a guitar strums a bar of six or twelve as a pendulum in eighths: it strikes every pulse (the first may be the chord leant into on the eighth before, still ringing) and at least one eighth between them, and every stroke between is lighter than the pulse it follows, so the eighths are never all hammered", {
  skip: guitarsInSix.length === 0 && guitarsInTwelve.length === 0,
}, () => {
  const bars = { 6: 0, 12: 0 };
  let leant = 0;
  for (const { where, bar, plucks, strums, velocities, pushed } of barsOfSix()) {
    if (strums.length === 0 || plucks.length > 0) continue;
    bars[bar.meter.beats as 6 | 12]++;
    const ticks = strums.map((strum) => strum.tick - bar.start);
    const pulses = pulseStarts(bar.meter);
    if (!ticks.includes(0)) {
      assert.ok(pushed, `${where}: no strum on the first pulse`);
      leant++;
    }
    for (const pulse of pulses.slice(1))
      assert.ok(ticks.includes(pulse), `${where}: no strum on the pulse at ${pulse}`);
    const between = ticks.filter((tick) => !pulses.includes(tick));
    assert.ok(between.length > 0, `${where}: only the pulses strummed`);
    for (const tick of between) {
      const pulse = pulses.findLast((start) => start < tick)!;
      if (!ticks.includes(pulse)) continue;
      const on = velocities.get(bar.start + pulse)!;
      const off = velocities.get(bar.start + tick)!;
      assert.ok(
        off < on,
        `${where}: the stroke at ${tick} (${off.toFixed(0)}) as hard as its pulse (${on.toFixed(0)})`,
      );
    }
  }
  if (guitarsInSix.length > 0)
    assert.ok(
      bars[6] > STRUMMED_BARS_IN_SIX && leant > 50,
      `only ${bars[6]} bars of six strummed, ${leant} leant into`,
    );
  if (guitarsInTwelve.length > 0)
    assert.ok(bars[12] > STRUMMED_BARS_IN_TWELVE, `only ${bars[12]} bars of twelve strummed`);
});

// ── the reggae skank in six and twelve ──────────────────────────────────────

test(
  "reggae: in six and twelve the skank chops the pulses between the strong ones (2 and 4 in twelve, the second pulse in six) and nothing else that matters: the guitar never strikes a strong pulse (but a chord gone before the next chop, where it arrives), every bar of chords has a chop on each of those pulses, the loudest stroke in the bar, and any other stroke is the flick on the eighth after a chop or a lighter stroke on a pulse's last eighth",
  only("reggae"),
  () => {
    const reggae = STYLES.find((style) => style.id === "reggae")!;
    const played = [
      ...takes((jam) => jam.style.id === "reggae" && written(jam)),
      ...heldTakes(reggae, "6/8", false, true),
      ...heldTakes(reggae, "12/8", false, true),
    ];
    let bars = 0;
    for (const { chart, options, take } of played) {
      if (chart.meter !== "6/8" && chart.meter !== "12/8") continue;
      const chords = notesOf(take, "chords");
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.ending || bar.seats.chords === null) continue;
        if (!isCompound(bar.meter) || bar.spans.some((span) => span.chord === null)) continue;
        bars++;
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        const notes = chords.filter((n) => n.tick >= bar.start && n.tick < bar.start + bar.ticks);
        const strong = strongPulses(bar.meter);
        const chops = pulseStarts(bar.meter).filter((tick) => !strong.includes(tick));
        const loudest = (ticks: (tick: number) => boolean) =>
          Math.max(0, ...notes.filter((n) => ticks(n.tick - bar.start)).map((n) => n.velocity));
        for (const chop of chops)
          assert.ok(
            notes.some((n) => n.tick - bar.start === chop),
            `${where}: no chop at ${chop}`,
          );
        for (const note of notes) {
          const tick = note.tick - bar.start;
          const step = tick / STEP;
          // A chord gone before the next chop is struck where it arrives, or it would not sound.
          const unchopped = bar.spans.some(
            (span) =>
              span.start === tick &&
              !chops.some((c) => c >= span.start && c < span.start + span.duration),
          );
          if (unchopped) continue;
          assert.ok(!strong.includes(tick), `${where}: a stroke on the strong pulse at ${tick}`);
          assert.ok(
            chops.includes(tick) || chops.includes(tick - PPQ / 2) || step % 6 === 4,
            `${where}: a stroke at ${tick}`,
          );
        }
        const chop = loudest((tick) => chops.includes(tick));
        const rest = loudest((tick) => !chops.includes(tick));
        assert.ok(chop > rest, `${where}: the chop at ${chop}, another stroke at ${rest}`);
      }
    }
    if (ownCharts(reggae).some((chart) => chart.meter === "6/8" || chart.meter === "12/8"))
      assert.ok(bars > 300, `only ${bars} bars of six and twelve`);
  },
);

// ── a funk guitar in six and twelve ─────────────────────────────────────────

test(
  "funk: in six and twelve the guitar scratches the eighths: quiet it stabs and never scratches; from the working level up it strokes more of the bar than its pulses, a muted scratch among them; and hot every eighth is a stroke but where a chord leant into still rings over the barline",
  only("funk"),
  () => {
    const funk = STYLES.find((style) => style.id === "funk")!;
    const counted = { low: 0, mid: 0, high: 0 };
    const played = [
      ...takes((jam) => jam.style.id === "funk" && written(jam)),
      ...heldTakes(funk, "6/8", false, true),
      ...heldTakes(funk, "12/8", false, true),
    ];
    for (const { chart, options, take } of played) {
      if (chart.meter !== "6/8" && chart.meter !== "12/8") continue;
      const strokes = [...strikesOf(take), ...strikesOf(take, true)];
      const scratches = new Set(strikesOf(take, true).map((strike) => strike.tick));
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.ending || bar.seats.chords === null) continue;
        if (!isCompound(bar.meter) || bar.spans.some((span) => span.chord === null)) continue;
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        const ticks = new Set(
          strokes
            .filter((s) => s.tick >= bar.start && s.tick < bar.start + bar.ticks)
            .map((s) => s.tick - bar.start),
        );
        const scratched = [...ticks].some((tick) => scratches.has(bar.start + tick));
        const tier = tierOf(bar.seats.chords);
        counted[tier]++;
        if (tier === "low") {
          assert.ok(!scratched, `${where}: a scratch, quiet`);
          continue;
        }
        assert.ok(ticks.size > pulseStarts(bar.meter).length, `${where}: ${ticks.size} strokes`);
        assert.ok(scratched, `${where}: no scratch`);
        if (tier !== "high") continue;
        // The chord leant into on the eighth before the barline, still ringing in this bar.
        const pushed = strokes.some(
          (s) => s.tick === bar.start - PPQ / 2 && s.ends > bar.start + POCKET,
        );
        for (let tick = pushed ? PPQ / 2 : 0; tick < bar.ticks; tick += PPQ / 2)
          assert.ok(ticks.has(tick), `${where}: hot, and nothing on the eighth at ${tick}`);
      }
    }
    if (LIBRARY.some((chart) => chart.meter === "6/8" || chart.meter === "12/8"))
      assert.ok(
        counted.low > 50 && counted.mid > 50 && counted.high > 50,
        `only ${counted.low} quiet bars, ${counted.mid} working, ${counted.high} hot`,
      );
  },
);

test(
  'funk: in four the guitar\'s line has a stab in the bar\'s last eighth from the working level up, on the "and" of 4 or its "a", so that it can lean into the chord coming (ST-funk-38)',
  only("funk"),
  () => {
    let bars = 0;
    for (const { chart, options, take } of takes(
      (jam) => jam.style.id === "funk" && written(jam),
    )) {
      const stabs = new Set(strikesOf(take).map((strike) => strike.tick));
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.ending || bar.seats.chords === null) continue;
        if (bar.meter.beats !== 4 || bar.meter.unit !== 4) continue;
        if (tierOf(bar.seats.chords) === "low" || bar.spans.some((span) => span.chord === null))
          continue;
        bars++;
        assert.ok(
          stabs.has(bar.start + 14 * STEP) || stabs.has(bar.start + 15 * STEP),
          `${chart.file} ${JSON.stringify(options)} bar ${bar.index}: no stab in the last eighth`,
        );
      }
    }
    assert.ok(bars > enough(2000), `only ${bars} bars`);
  },
);

test("in a style whose guitar pulls off its final chord, the stinger is played on the final tonic of an ending that rings, and nowhere else: the 6th (the b6 over a minor chord) struck on the B or the high E string and pulled off to the 5th under it on that string an eighth later, softer by the style's share; where the strike has a 6th there that its string can pull off from within the hand, without a half step over it, it always is; and no other chord note is pulled off or hammered on", {
  skip: !STYLES.some((style) => style.chords.ending.pullOff),
}, () => {
  let stung = 0;
  // The short endings in every key the walk-home property plays, the same takes: the library's
  // endings lean on C, whose open shape has no stinger (EN-49).
  const endings = STYLES.filter(
    (style) => style.chords.ending.pullOff && style.chords.idiom !== "keys",
  ).flatMap(homeTakes);
  for (const { style, chart, options, take } of [...takes(), ...stressTakes(), ...endings]) {
    const slurs = notesOf(take, "chords").filter((note) => note.slur);
    const where = `${chart.file} seed ${options.seed} ${JSON.stringify(options)}`;
    const pullOff = style.chords.ending.pullOff;
    const idiom = style.chords.idiom;
    if (!pullOff || idiom === "keys") {
      assert.equal(slurs.length, 0, `${where}: a chord note pulled off in a style that does not`);
      continue;
    }
    const last = take.plan.bars.findLast((bar) => bar.kind === "music");
    const ending = last?.ending;
    const landing = last && ending ? last.start + ending.at : -1;
    const final = harmonyOf(take).findLast((arrival) => arrival.tick <= landing)?.chord ?? null;
    const rings =
      last !== undefined &&
      ending !== undefined &&
      ending !== null &&
      (ending.gesture.kind === "hold" || ending.gesture.kind === "soft") &&
      ending.ring > PPQ &&
      final !== null &&
      pitchClass(final.root) === pitchClass(last.key.tonic);
    if (!rings || !final) {
      assert.equal(slurs.length, 0, `${where}: a pull-off where no final tonic rings`);
      continue;
    }
    const root = pitchClass(final.root);
    const minor = chordTones(final.quality).some(
      (tone) => tone.role === "third" && tone.interval === 3,
    );
    const step = minor ? 1 : 2;
    const sixth = minor ? 8 : 9;
    // At most one, an eighth after the final chord lands, to its 5th: whatever is struck there.
    assert.ok(slurs.length <= 1, `${where}: ${slurs.length} pull-offs`);
    const [pulled] = slurs;
    if (pulled) {
      assert.equal(
        pulled.tick,
        landing + PPQ / 2,
        `${where}: the pull-off is not an eighth after the chord`,
      );
      assert.equal((pulled.pitch - root + 120) % 12, 7, `${where}: the pull-off is not to the 5th`);
    }
    const strike = strikesOf(take).find((one) => one.tick === landing);
    if (!strike) {
      assert.equal(slurs.length, 0, `${where}: a pull-off with no final chord struck`);
      continue;
    }
    // The guitar's top two strings, the B and the high E: a note under a silent B is not on top.
    const strings = fingering(idiom, strike.pitches);
    const frets = strings ? fretsOf(strings, strike.pitches) : [];
    const top = strike.pitches.filter((_, k) => (strings?.[k] ?? -1) >= 4);
    // Where the strike's 6th on one of those strings can pull off to the 5th: within the hand,
    // and nothing a half step over it.
    const fretted = frets.filter((fret) => fret > 0);
    const can = top.some((pitch) => {
      const k = strike.pitches.indexOf(pitch);
      const to = frets[k]! - step;
      const reach = to === 0 || Math.max(...fretted) - Math.min(to, ...fretted) <= 3;
      return (
        (pitch - root + 120) % 12 === sixth &&
        to >= 0 &&
        reach &&
        !strike.pitches.some((other) => (((other - pitch) % 12) + 12) % 12 === 1)
      );
    });
    if (can)
      assert.equal(slurs.length, 1, `${where}: the final tonic ${strike.pitches} has no stinger`);
    if (!pulled) continue;
    stung++;
    const from = notesOf(take, "chords").find(
      (note) => note.tick === landing && !note.slur && note.pitch === pulled.pitch + step,
    );
    assert.ok(
      from && top.includes(from.pitch),
      `${where}: no 6th on the top two strings to pull off from`,
    );
    const touch = (2 * 10 * style.feel.humanize) / 100 + 1;
    assert.ok(
      Math.abs(pulled.velocity - from.velocity * pullOff.level) <= touch,
      `${where}: the pull-off at ${pulled.velocity} after a strike at ${from.velocity}`,
    );
  }
  assert.ok(stung > enough(90), `only ${stung} stingers`);
});

test(
  "country: while a bassist plays, the guitar strums only its top four strings (ST-country-07): no stroke before the final chord sounds under the D string's open D3, in any meter",
  only("country"),
  () => {
    const country = STYLES.find((style) => style.id === "country")!;
    const lowest = OPEN[2]!;
    const others = [
      COUNTRY_WALTZ,
      ...["3/4", "6/8", "12/8", "6/4"].map(
        (meter) => LIBRARY.find((chart) => chart.meter === meter)!,
      ),
    ];
    let outside = 0;
    for (const { chart, options, take } of [
      ...takes((jam) => jam.style === country),
      ...others.flatMap((chart) =>
        [0.3, 0.85].map((energy) =>
          takeOf({
            style: country,
            chart,
            options: { mode: "jam", passes: 1, energy, seed: SEEDS.length },
          }),
        ),
      ),
    ]) {
      for (const strike of strikesOf(take)) {
        const bar = barAt(take.plan.bars, strike.tick)!;
        if (bar.kind !== "music" || bar.ending || bar.seats.bass === null) continue;
        if (bar.meter.beats !== 4 || bar.meter.unit !== 4) outside++;
        assert.ok(
          strike.pitches[0]! >= lowest,
          `${chart.file} seed ${options.seed} ${JSON.stringify(options)} bar ${bar.index}: ${strike.pitches} under the top four strings`,
        );
      }
    }
    assert.ok(outside > enough(600), `only ${outside} strokes outside 4/4`);
  },
);

/**
 * The open shapes country's guitar holds, as a player writes them (CH-24, the style's own
 * notes), by key: a plain major on the I or the IV with its 6th, on the V a triad. A6 is left
 * out: the hand takes x04220, a four-note shape with the root, where x02222 would do as well.
 * A seventh or a thirteenth drops its perfect fifth or holds it as its shape has it (C7
 * x32310 with none, A13 x02022 with the 5th for its root, #2304).
 */
const COUNTRY_SHAPES: readonly (readonly [
  key: string,
  shapes: Readonly<Record<string, string>>,
])[] = [
  [
    "C",
    {
      C: "x32210",
      C7: "x32310",
      F13: "1x1231",
      // After C, as it resolves: led down from G's G4, the hand takes x33013 (F3 G3 C4 G4).
      Csus4: "x33011",
      F: "1x0211",
      G: "3x0003",
      Am: "x02210",
      Dm: "xx0231",
      Em: "022000",
    },
  ],
  [
    "G",
    {
      G: "3x0000",
      C: "x32210",
      D: "xx0232",
      G7: "3x0001",
      D7: "xx0212",
      Gsus4: "3x0013",
      G13: "3x3000",
    },
  ],
  [
    "D",
    {
      D: "xx0202",
      A: "x02220",
      D7: "xx0212",
      Bm: "x24432",
      Dsus4: "xx0233",
      A7: "x02020",
      A13: "x02022",
      Dm7: "xx0211",
    },
  ],
  [
    "A",
    {
      D: "xx0202",
      E: "022100",
      E7: "022130",
      B7: "x21202",
      Asus4: "x02230",
      Am7: "x02010",
      E13: "020120",
    },
  ],
  ["E", { E: "022120", B7: "x21202", Esus4: "022200", Em7: "022030", B13: "x21204" }],
];

test(
  "country: with a bassist the chick sounds the top four strings of the open shape a player holds (CH-24, ST-country-07): C6 is x32210, E3 A3 C4 E4, four notes with the root among them, not three with the B string silent",
  only("country"),
  () => {
    const country = STYLES.find((style) => style.id === "country")!;
    const wrong: string[] = [];
    let checked = 0;
    for (const [key, shapes] of COUNTRY_SHAPES) {
      const symbols = Object.keys(shapes);
      // Each chord for a bar, then home: the last bar is the ending, which is not a chick.
      const text = `title: Open shapes in ${key}\nkey: ${key}\nstyle: country\n\n[A]\n${symbols.map((symbol) => `| ${symbol} `).join("")}| ${key} | ${key} |\n`;
      const chart: LibraryChart = { file: `open-shapes-${key}`, text, meter: "4/4" };
      const { take } = takeOf({
        style: country,
        chart,
        options: { mode: "jam", passes: 1, energy: 0.5, seed: 1 },
      });
      for (const [i, symbol] of symbols.entries()) {
        const shape = shapes[symbol]!;
        // The shape's top four strings, the D string up, as a player frets them.
        const expected = [...shape]
          .map((fret, string) => (fret === "x" ? null : OPEN[string]! + Number(fret)))
          .slice(2)
          .filter((pitch): pitch is number => pitch !== null);
        const bar = take.plan.bars.filter((candidate) => candidate.kind === "music")[i];
        if (!bar || bar.seats.bass === null) continue;
        const struck = strikesOf(take).filter(
          (strike) =>
            strike.tick >= bar.start &&
            strike.tick < bar.start + bar.ticks &&
            (strike.tick - bar.start) % PPQ === 0,
        );
        for (const strike of struck) {
          checked++;
          if (strike.pitches.join(" ") !== expected.join(" ")) {
            wrong.push(`${symbol} in ${key} (${shape}): ${strike.pitches} where ${expected}`);
          }
        }
      }
    }
    assert.deepEqual([...new Set(wrong)], []);
    assert.ok(checked > 60, `only ${checked} chicks`);
  },
);

test(
  "country: a chord whose fifth is altered or diminished keeps that fifth, with a bassist and without: Am7b5 is not Am7 and C7#5 not C7; with a bassist the chick holds the grip it held before the seventh freed its fifth (D7b5 and G7#5 with their roots), and with none the boom is the root (CH-24 frees only a perfect fifth; X-B-13)",
  only("country"),
  () => {
    const country = STYLES.find((style) => style.id === "country")!;
    // With a bassist the chick on each, as it was before #2304 (seed 1, quiet and working).
    const held: Readonly<Record<string, string>> = {
      Am7b5: "55,60,63",
      Em7b5: "52,58,62,67",
      D7b5: "50,56,60,66",
      "C7#5": "52,58,68",
      "G7#5": "51,55,59,65",
      "F#dim7": "51,57,60,66",
    };
    const symbols = Object.keys(held);
    const chart: LibraryChart = {
      file: "altered-fifths",
      text: `title: Altered fifths\nkey: C\nstyle: country\n\n[A]\n${symbols.map((symbol) => `| ${symbol} `).join("")}| C | C |\n`,
      meter: "4/4",
    };
    const wrong: string[] = [];
    let checked = 0;
    for (const without of [[], ["bass" as const]]) {
      for (const energy of [0.3, 0.6]) {
        const { take } = takeOf({
          style: country,
          chart,
          options: { mode: "jam", passes: 1, energy, seed: 1, without },
        });
        const bars = take.plan.bars.filter((bar) => bar.kind === "music");
        for (const [i, symbol] of symbols.entries()) {
          const bar = bars[i]!;
          const chord = harmonyOf(take).findLast((arrival) => arrival.tick <= bar.start)!.chord!;
          const root = pitchClass(chord.root);
          const fifth = chordTones(chord.quality).find((tone) => tone.role === "fifth")!.interval;
          const where = `${symbol} ${without.length ? "alone" : "with bass"} at ${energy}`;
          const inBar = (strike: Strike) =>
            strike.tick >= bar.start && strike.tick < bar.start + bar.ticks;
          for (const strike of strikesOf(take).filter(inBar)) {
            checked++;
            const classes = strike.pitches.map((pitch) => (pitch - root + 12) % 12);
            if (!classes.includes(fifth % 12))
              wrong.push(`${where}: ${strike.pitches} lacks its fifth`);
            if (classes.includes(7))
              wrong.push(`${where}: ${strike.pitches} sounds a perfect fifth`);
            if (new Set(classes).size < 3)
              wrong.push(`${where}: ${strike.pitches} under three notes`);
            const onBeat = (strike.tick - bar.start) % PPQ === 0;
            if (!without.length && onBeat && `${strike.pitches}` !== held[symbol]) {
              wrong.push(`${where}: ${strike.pitches} where ${held[symbol]}`);
            }
          }
          if (without.length) {
            const boom = pluckedOf(take).find((strike) => strike.tick === bar.start);
            if (!boom || pitchClass(chord.root) !== boom.pitches[0]! % 12) {
              wrong.push(`${where}: the boom is ${boom?.pitches}, not the root`);
            }
          }
        }
      }
    }
    assert.deepEqual([...new Set(wrong)], []);
    assert.ok(checked > 40, `only ${checked} strikes`);
  },
);

test(
  "country: with no bassist the boom on a plain major on the I or the IV is on the low E or the A string, in Gb and in Db too: the pick carries the root, and the chord's fifth is the shape's, not the bassist's to leave (CH-24: a fifth is dropped only over a bassist; ST-country-07)",
  only("country"),
  () => {
    const country = STYLES.find((style) => style.id === "country")!;
    let booms = 0;
    for (const [key, chords] of [
      ["Gb", "| Gb | Gb | Db7 | Db7 | Gb | Cb | Gb | Gb |"],
      ["Db", "| Db | Db | Gb | Gb | Ab7 | Ab7 | Db | Db |"],
    ] as const) {
      const chart: LibraryChart = {
        file: `boom-${key}`,
        text: `title: Boom in ${key}\nkey: ${key}\nstyle: country\n\n[A]\n${chords}\n`,
        meter: "4/4",
      };
      for (const energy of [0.3, 0.6]) {
        const { take } = takeOf({
          style: country,
          chart,
          options: { mode: "jam", passes: 1, energy, seed: 1, without: ["bass"] },
        });
        const tonic = pitchClass(take.plan.bars[0]!.key.tonic);
        for (const bar of take.plan.bars) {
          if (bar.kind !== "music" || bar.ending) continue;
          const chord = harmonyOf(take).findLast((arrival) => arrival.tick <= bar.start)?.chord;
          if (chord?.quality.base !== "" || chord.quality.alterations.length > 0) continue;
          const degree = (pitchClass(chord.root) - tonic + 12) % 12;
          if (degree !== 0 && degree !== 5) continue;
          const boom = pluckedOf(take).find((strike) => strike.tick === bar.start);
          if (!boom) continue;
          booms++;
          assert.ok(
            boom.pitches[0]! < OPEN[2]!,
            `boom in ${key} at ${energy}, bar ${bar.index}: ${boom.pitches} is not on the low E or the A string`,
          );
        }
      }
    }
    assert.ok(booms >= 12, `only ${booms} booms`);
  },
);

test(
  "country: the final tonic chord of an ending leaves nothing out: a triad or a sixth chord sounds its fifth, struck with it or as the stinger's landing, in every key (EN-49; a chick may leave the open shape's fifth to the bass, a chord that rings as the end may not)",
  only("country"),
  () => {
    const country = STYLES.find((style) => style.id === "country")!;
    let finals = 0;
    for (const { chart, options, take } of [
      ...takes((jam) => jam.style === country),
      ...homeTakes(country),
    ]) {
      const last = take.plan.bars.findLast((bar) => bar.kind === "music");
      if (!last?.ending || last.seats.chords === null) continue;
      const landing = last.start + last.ending.at;
      const final = harmonyOf(take).findLast((arrival) => arrival.tick <= landing)?.chord;
      if (!final || pitchClass(final.root) !== pitchClass(last.key.tonic)) continue;
      // A triad or a sixth chord, whose every voicing holds its fifth: a seventh's may give
      // its seat to a tension.
      const tones = chordTones(final.quality);
      const plain = tones.every((tone) =>
        ["root", "third", "sus", "fifth", "sixth"].includes(tone.role),
      );
      if (!plain || !tones.some((tone) => tone.role === "fifth" && tone.interval === 7)) continue;
      const sounded = notesOf(take, "chords").filter(
        (note) => note.tick === landing || (note.slur && note.tick === landing + PPQ / 2),
      );
      if (sounded.length === 0) continue;
      finals++;
      assert.ok(
        sounded.some((note) => (note.pitch - pitchClass(final.root) + 120) % 12 === 7),
        `${chart.file} seed ${options.seed} ${JSON.stringify(options)}: the final ${sounded.map((note) => note.pitch)} has no fifth`,
      );
    }
    assert.ok(finals > enough(2400), `only ${finals} final chords`);
  },
);

test(
  "country: in three with no bassist the guitar's pick takes the boom on 1 of every bar it plays that is not a rest or the final chord: one plucked note, the lowest the guitar sounds in the bar, the grip's bass in the bar its chord is struck in and every second bar it holds after, the grip's alternate bass (its fifth) in the bars between, counted as the waltz bass counts (ST-country-07, CH-26, BA-56). The grip stands on the chord's own root: over a slash chord the boom is that root and its fifth, the slash note left to a bassist, as in four",
  only("country"),
  () => {
    const country = STYLES.find((style) => style.id === "country")!;
    let booms = 0;
    // Slash chords held and changed: the boom is the grip's (C3, G2, C3 over C/G), not the slash.
    const slashes: LibraryChart = {
      file: "slash-waltz",
      text: "title: Slash waltz\nkey: C\nmeter: 3/4\n\n[A]\n| C/G | C/G | C/G | F |\n| G/B | G/B | D/F# | D/F# |\n",
      meter: "3/4",
    };
    for (const chart of [
      COUNTRY_WALTZ,
      slashes,
      ...LIBRARY.filter((candidate) => candidate.meter === "3/4"),
    ]) {
      for (const energy of [0.3, 0.6, 0.85]) {
        for (const seed of SEEDS) {
          const options: TakeOptions = { mode: "jam", passes: 2, energy, seed, without: ["bass"] };
          const { take } = takeOf({ style: country, chart, options });
          const plucked = pluckedOf(take);
          const strikes = strikesOf(take);
          const counts = barsOnChord(take, "chords");
          for (const bar of take.plan.bars) {
            const first = bar.spans[0]?.chord ?? null;
            const cycle = counts.get(bar.index);
            if (bar.kind !== "music" || bar.ending || cycle === undefined || !first) continue;
            const where = `${chart.file} seed ${seed} at ${energy} bar ${bar.index}`;
            const inBar = (tick: number) => tick >= bar.start && tick < bar.start + bar.ticks;
            const boom = plucked.filter((note) => note.tick === bar.start);
            assert.equal(boom.length, 1, `${where}: ${boom.length} plucked notes on 1`);
            const pitch = boom[0]!.pitches[0]!;
            const standsOn = pitchClass(first.root);
            const other =
              (standsOn +
                (chordTones(first.quality).find((tone) => tone.role === "fifth")?.interval ?? 7)) %
              12;
            const odd = cycle % 2 === 1;
            assert.equal(
              pitch % 12,
              odd ? other : standsOn,
              `${where}: ${cycle} bars into the chord, the boom ${pitch} where the ${odd ? "alternate bass" : "bass"} belongs`,
            );
            const chick = strikes
              .filter((strike) => inBar(strike.tick))
              .flatMap((strike) => strike.pitches);
            assert.ok(
              chick.every((note) => note >= pitch),
              `${where}: the boom ${pitch} is over the chick (${Math.min(...chick)})`,
            );
            booms++;
          }
        }
      }
    }
    assert.ok(booms > enough(600), `only ${booms} bars with no bassist`);
  },
);
