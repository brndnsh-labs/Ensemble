// Musical properties of the piano: register, chord identity, harmony, one hand, the grid. See
// docs/TESTING.md, kind 2. Each test names its rule; none of them knows how the engine is built.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlanBar, Take } from "@ensemble/engine";
import {
  chordFamily,
  chordTones,
  lastPulse,
  PPQ,
  pitchClass,
  render,
  scaleHas,
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
  notesOf,
  only,
  ownCharts,
  SEEDS,
  STYLES,
  stressTakes,
  takes,
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

test("the strumming hand is a pendulum: on the grid it strums, a stroke between the beat's halves comes up, the high string first, and every other stroke goes down, the low string first", {
  skip: guitars.length === 0,
}, () => {
  let ups = 0;
  let downs = 0;
  for (const { style, chart, options, take } of takes(
    (jam) => strummed(jam) && jam.chart.meter === "4/4",
  )) {
    if (style.chords.idiom === "keys") continue;
    const pair = style.chords.idiom.strum.grid === "eighth" ? PPQ : PPQ / 2;
    const harmony = harmonyOf(take);
    const byTick = Map.groupBy(notesOf(take, "chords"), (note) => note.tick);
    for (const [tick, notes] of byTick) {
      const bar = take.plan.bars.findLast((candidate) => candidate.start <= tick)!;
      const between = (tick - bar.start) % pair >= pair / 2;
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
  for (const { style, chart, options, take } of [...takes(picked), ...stressTakes(picked)]) {
    const idiom = style.chords.idiom;
    if (idiom === "keys") continue;
    const harmony = harmonyOf(take);
    const plucked = pluckedOf(take);
    const strums = strikesOf(take);
    let from = 0;
    let strummed = 0;
    harmony.forEach((arrival, i) => {
      if (!arrival.changed) return;
      // The chord sounds until the next one that is not the same chord written again.
      const until = harmony.slice(i + 1).find((next) => next.changed)?.tick ?? Infinity;
      while (from < plucked.length && plucked[from]!.tick < arrival.tick) from++;
      let to = from;
      while (to < plucked.length && plucked[to]!.tick < until) to++;
      const own = plucked.slice(from, to);
      from = to;
      if (own.length === 0) return;
      chords++;
      const where = `${chart.file} seed ${options.seed}: ${arrival.chord?.text} at tick ${arrival.tick}`;
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
});

test("with no bassist the picking thumb is the bass: in a bar of four the guitar picks while the bass is out, a string is plucked on every beat a chord sounds on, and the first one plucked on a beat under a chord is that chord's root, with nothing in the bar under it but the fifth below", {
  skip: pickers.length === 0,
}, () => {
  let bars = 0;
  let stated = 0;
  for (const { chart, options, take } of takes(picked)) {
    const harmony = harmonyOf(take);
    const plucked = pluckedOf(take);
    const strums = strikesOf(take);
    for (const bar of take.plan.bars) {
      if (bar.kind !== "music" || bar.ending || bar.seats.chords === null) continue;
      if (bar.seats.bass !== null || bar.meter.beats !== 4 || bar.meter.unit !== 4) continue;
      const end = bar.start + bar.ticks;
      const own = plucked.filter((note) => note.tick >= bar.start && note.tick < end);
      if (own.length === 0 || strums.some((s) => s.tick >= bar.start && s.tick < end)) continue;
      bars++;
      const where = `${chart.file} seed ${options.seed} bar ${bar.index}`;
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
        for (let beat = bar.start; beat < end; beat += PPQ) {
          if (beat < starts || beat >= stops) continue;
          const thumb = own.filter((note) => note.tick === beat).map((note) => note.pitches[0]!);
          assert.ok(thumb.length > 0, `${where}: no string plucked on the beat at ${beat}`);
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
});
