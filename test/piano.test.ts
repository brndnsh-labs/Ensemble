// Musical properties of the piano: register, chord identity, harmony, one hand, the grid. See
// docs/TESTING.md, kind 2. Each test names its rule; none of them knows how the engine is built.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlanBar, Take } from "@ensemble/engine";
import {
  chordFamily,
  chordTones,
  isCompound,
  lastPulse,
  onAnd,
  PICKED,
  PPQ,
  pitchClass,
  pulseStarts,
  render,
  STEP,
  scaleHas,
  strongPulses,
  tierOf,
} from "@ensemble/engine";
import {
  bluesWritten,
  chordsUnder,
  harmonyOf,
  POCKET,
  pluckedOf,
  type Strike,
  strikesOf,
} from "./reading.ts";
import {
  enough,
  FULL,
  heldTakes,
  LIBRARY,
  notesOf,
  only,
  ownCharts,
  SEEDS,
  STYLES,
  soloistTakes,
  stressTakes,
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
  for (const { chart, options, take } of [...takes(), ...stressTakes(), ...soloistTakes()]) {
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
 * own rules at a change: it plays through, and strikes a pushed chord again on the beat.
 */
function hammered(bar: PlanBar | undefined, strikes: readonly Strike[] | undefined): boolean {
  if (!bar || !strikes) return false;
  const chorded = bar.spans
    .filter((span) => span.chord !== null)
    .reduce((ticks, span) => ticks + span.duration, 0);
  return chorded > 0 && strikes.length >= chorded / (PPQ / 2);
}

test("the eighth before a change belongs to the chord coming: a strike there that is still sounding when the chord arrives plays the new chord, alone in its beat, and is not struck again on the beat; one that stops short of the change is played only by a groove, which keeps its figure on the chord it is on", () => {
  let pushes = 0;
  for (const { style, chart, options, take } of [...takes(), ...stressTakes()]) {
    // A comp that keeps a figure going plays it up to the change; one that converses leaves
    // the stab out, because the old chord just before the new one is heard as a wrong chord.
    const groove = style.chords.anticipation.otherwise === "stay";
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
      if (hammered(bar, own)) continue;
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
        if (!groove && hammered(landing, byBar.get(landing.index))) continue;
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

test('jazz: in a waltz the piano comps, not a pad (prompts/jazz-waltz-study.md): no bar of three it comps is struck more than four times, besides a lean into the next bar on the "and" of 3; quiet, with the band to itself, a bar of one chord is one chord laid in on 1, the "and" of 1 or beat 2 and held, to the barline or to the lean (F4, F5, F7), or left alone; and from the working level, away from a soloist, two bars in five or more strike the "and" of 1 or of 2 (F6, F9, F2)', {
  skip: only("jazz").skip || !LIBRARY.some((chart) => chart.meter === "3/4"),
}, () => {
  const jazz = STYLES.find((style) => style.id === "jazz")!;
  const counted = { bars: 0, quiet: 0, working: 0, ands: 0 };
  for (const { chart, options, take } of [
    ...takes((jam) => jam.style.id === "jazz" && jam.chart.meter === "3/4"),
    ...heldTakes(jazz, "3/4", false, true),
    ...heldTakes(jazz, "3/4", true, true),
  ]) {
    const byBar = strikesByBar(take);
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
      if (bar.solo !== null) continue;
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

test("a section keeps its figure: away from a solo, every phrase opens on the same rhythm each time the section comes round at the same level", () => {
  let compared = 0;
  for (const { chart, options, take } of takes(written)) {
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

test("a guitar's chords can be held: every stroke is three notes or more and no more than the guitar has strings (four, where it grips three), one to a string, inside a four-fret hand, none over the 15th fret; on neighbouring strings and none open, unless the style's guitar may mute a string inside its grip or plays open strings", {
  skip: guitars.length === 0,
}, () => {
  let strokes = 0;
  for (const { style, chart, options, take } of [...takes(strummed), ...stressTakes(strummed)]) {
    const idiom = style.chords.idiom;
    if (idiom === "keys") continue;
    for (const stroke of [...strikesOf(take), ...strikesOf(take, true)]) {
      strokes++;
      const where = `${chart.file} seed ${options.seed} at tick ${stroke.tick}: ${stroke.pitches}`;
      assert.ok(
        stroke.pitches.length >= 3 && stroke.pitches.length <= Math.max(4, idiom.strings),
        `${where}: the strings`,
      );
      assert.ok(holdable(stroke.pitches, idiom), `${where}: no hand holds this`);
    }
  }
  assert.ok(strokes > enough(20000), `only ${strokes} strokes`);
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
      const bar = take.plan.bars.findLast((candidate) => candidate.start <= tick)!;
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
  assert.ok(
    chords > enough(1200) && plucks > enough(9000) && rang > enough(7000),
    `only ${chords} picked chords, ${plucks} plucked notes, ${rang} that rang on`,
  );
  if (guitarsInSix.length > 0) assert.ok(six > PICKED_IN_SIX, `only ${six} chords picked in six`);
  if (guitarsInTwelve.length > 0)
    assert.ok(twelve > PICKED_IN_TWELVE, `only ${twelve} chords picked in twelve`);
});

test("with no bassist the picking thumb is the bass: in a bar of four, or of six or twelve where the style has written it, the guitar picks while the bass is out, a string is plucked on every pulse a chord sounds on, and the first one plucked on a pulse under a chord is that chord's root, with nothing in the bar under it but the fifth below", {
  skip: pickers.length === 0,
}, () => {
  let bars = 0;
  let stated = 0;
  let six = 0;
  let twelve = 0;
  const played = [
    ...takes(picked).map(({ chart, options, take }) => ({
      where: `${chart.file} seed ${options.seed}`,
      take,
    })),
    ...sixesOnce(),
  ];
  for (const { where: of, take } of played) {
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
      if (own.length === 0 || strums.some((s) => s.tick >= bar.start && s.tick < end)) continue;
      bars++;
      if (inSix) six++;
      if (inTwelve) twelve++;
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
          assert.ok(thumb.length > 0, `${where}: no string plucked on the pulse at ${beat}`);
          if (!first) continue;
          first = false;
          stated++;
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
      }
    }
  }
  assert.ok(
    bars > enough(60) && stated > enough(60),
    `only ${bars} bars picked with no bassist, ${stated} chords stated`,
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
