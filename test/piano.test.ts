// Musical properties of the piano: register, chord identity, harmony, one hand, the grid. See
// docs/TESTING.md, kind 2. Each test names its rule; none of them knows how the engine is built.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlanBar, Take } from "@ensemble/engine";
import { chordTones, PPQ, pitchClass, render, scaleHas, tierOf } from "@ensemble/engine";
import { blues, chordsUnder, harmonyOf, POCKET, type Strike, strikesOf } from "./reading.ts";
import { only, ownCharts, STYLES, stressTakes, takes } from "./takes.ts";

test("the piano stays in its register: nothing under the style's floor, nothing above E6, in every take", () => {
  let strikes = 0;
  for (const { style, chart, options, take } of [...takes(), ...stressTakes()]) {
    for (const strike of strikesOf(take)) {
      strikes++;
      const where = `${chart.file} seed ${options.seed} at tick ${strike.tick}`;
      assert.ok(strike.pitches[0]! >= style.chords.register.floor, `${where}: under the floor`);
      assert.ok(strike.pitches.at(-1)! <= 88, `${where}: above E6`);
    }
  }
  assert.ok(strikes > 5000, `only ${strikes} strikes across the library`);
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
    for (const strike of strikesOf(take)) {
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

test("every chord the chart writes is struck: the piano plays each one within an eighth before it arrives, or while it sounds", () => {
  for (const { chart, options, take } of [...takes(), ...stressTakes()]) {
    const strikes = strikesOf(take);
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
      const struck = strikes.some(
        (strike) =>
          strike.tick >= arrival.tick - PPQ / 2 &&
          strike.tick < until &&
          guides.every((guide) => strike.pitches.some((pitch) => pitch % 12 === guide)),
      );
      assert.ok(
        struck,
        `${chart.file} seed ${options.seed}: ${arrival.chord.text} in bar ${bar.index} never struck`,
      );
    });
  }
});

test("one hand, one chord: a strike has stopped sounding before the next one starts", () => {
  for (const { chart, options, take } of [...takes(), ...stressTakes()]) {
    const strikes = strikesOf(take);
    for (const strike of strikes) {
      // Two chords struck on the same tick would read as one strike: a hand has five fingers
      // and plays no key twice.
      assert.ok(
        strike.pitches.length <= 5 && new Set(strike.pitches).size === strike.pitches.length,
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
    assert.ok(final[0]!.pitches.length >= 3, `${where}: a thin final chord`);
    const early = strikes.filter(
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

test("the eighth before a change belongs to the chord coming: a strike there plays the new chord alone in its beat, is still sounding when the chord arrives, and is not struck again on the beat", () => {
  let pushes = 0;
  for (const { chart, options, take } of [...takes(), ...stressTakes()]) {
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
        if (!onlyStrike) {
          assert.equal(
            crowd.length,
            0,
            `${where}: the old chord on the beat, the new one right after`,
          );
        }
        if (hammered(landing, byBar.get(landing.index))) continue;
        const again: Strike[] = (byBar.get(landing.index) ?? []).filter(
          (other) => other.tick >= arrival.tick && other.tick < arrival.tick + PPQ / 2,
        );
        assert.equal(again.length, 0, `${where}: pushed, then struck again on the beat`);
      }
    }
  }
  assert.ok(pushes > 500, `only ${pushes} pushed chords across the library`);
});

test("the piano stays in its part of the keyboard: the top of its chords never wanders more than a sixth from where the style aims it", () => {
  for (const style of STYLES) {
    for (const chart of ownCharts(style)) {
      for (const seed of [1, 2, 3, 4]) {
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
  "blues: the piano comps on beats and their offbeats only, and a quiet band's piano is sparser than a loud one's",
  only("blues"),
  () => {
    const perBar = { low: [] as number[], high: [] as number[] };
    for (const { chart, options, take } of takes(blues)) {
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
    assert.ok(perBar.low.length > 100 && perBar.high.length > 100, "both levels are heard");
    assert.ok(
      mean(perBar.low) < mean(perBar.high),
      `quiet ${mean(perBar.low).toFixed(2)} strikes a bar, loud ${mean(perBar.high).toFixed(2)}`,
    );
  },
);

test("a section keeps its figure: away from a solo, every phrase opens on the same rhythm each time the section comes round at the same level", () => {
  let compared = 0;
  for (const { chart, options, take } of takes((jam) => jam.chart.meter === "4/4")) {
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
        .filter((tick) => tick >= PPQ / 2 && tick < bar.ticks - PPQ)
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
  assert.ok(compared > 1000, `only ${compared} phrase openings compared`);
});
