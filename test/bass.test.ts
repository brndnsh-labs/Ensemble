// Musical properties of the bass line: where it sits, how it states and leads into the
// changes, and that it has a line of its own and varies it. See docs/TESTING.md, kind 2.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlanBar, Take } from "@ensemble/engine";
import {
  arrivals,
  chordScale,
  chordTones,
  contextOf,
  DEAD_VOICE,
  PPQ,
  pitchClass,
  render,
  scaleHas,
  strongPulses,
  tierOf,
} from "@ensemble/engine";
import { bluesWritten } from "./reading.ts";
import { enough, LIBRARY, notesOf, only, STYLES, takes, written } from "./takes.ts";

// ── the bass line ───────────────────────────────────────────────────────────

/** Every place the bass note of the harmony changes: where, and to which pitch class. */
function bassChanges(take: Take): { tick: number; root: number }[] {
  const changes: { tick: number; root: number }[] = [];
  let sounding = -1;
  for (const bar of take.plan.bars) {
    if (bar.kind !== "music") continue;
    for (const span of bar.spans) {
      if (span.tied) continue;
      const root = span.chord ? pitchClass(span.chord.bass ?? span.chord.root) : -1;
      if (root >= 0 && sounding >= 0 && root !== sounding) {
        changes.push({ tick: bar.start + span.start, root });
      }
      sounding = root;
    }
  }
  return changes;
}

test("a lead-in resolves by step in actual pitch: a note a step from the next root by name is a step from the note the bass plays next", () => {
  let leadIns = 0;
  for (const { chart, options, take } of takes()) {
    const bass = notesOf(take, "bass");
    const arrivalTicks = new Set(bassChanges(take).map((change) => change.tick));
    for (const change of bassChanges(take)) {
      const landing = bass.find((note) => note.tick === change.tick);
      const before = bass.findLast((note) => note.tick < change.tick);
      if (!landing || !before || change.tick - before.tick > PPQ) continue;
      const where = `${chart.file} seed ${options.seed} at tick ${change.tick}`;
      // The arrival is never sounded a beat early.
      if (!arrivalTicks.has(before.tick)) {
        assert.notEqual(before.pitch % 12, change.root, `${where}: the new root, a beat early`);
      }
      const byName = Math.min(
        (before.pitch - change.root + 120) % 12,
        (change.root - before.pitch + 120) % 12,
      );
      if (byName === 1 || byName === 2) {
        leadIns++;
        const leap = Math.abs(before.pitch - landing.pitch);
        assert.ok(leap <= 2, `${where}: a leading tone ${leap} semitones from where it leads`);
      }
    }
  }
  // A ceiling on bad lead-ins passes trivially when there are none: make sure there are some.
  assert.ok(leadIns > enough(500), `only ${leadIns} stepwise lead-ins across the library`);
});

test("the bass line never leaps more than an octave (from one note to the next, not across a section it lays out of)", () => {
  for (const { chart, options, take } of takes(written)) {
    const bass = notesOf(take, "bass");
    // Bars the arrangement lays the bass out of: the line starts again after them.
    const out = take.plan.bars.filter((bar) => bar.kind === "music" && bar.seats.bass === null);
    for (let i = 1; i < bass.length; i++) {
      const [from, to] = [bass[i - 1]!.tick, bass[i]!.tick];
      if (out.some((bar) => bar.start > from && bar.start < to)) continue;
      const leap = Math.abs(bass[i]!.pitch - bass[i - 1]!.pitch);
      assert.ok(leap <= 12, `${chart.file} seed ${options.seed}: a leap of ${leap} semitones`);
    }
  }
});

test("a bass note held for a half note or more is a tone of its chord", () => {
  for (const { chart, options, take } of takes()) {
    for (const note of notesOf(take, "bass")) {
      // A half note as it sounds: a note with two beats to itself is let go a little early.
      if (note.duration < PPQ * 1.6) continue;
      const bar = take.plan.bars.findLast((candidate) => candidate.start <= note.tick)!;
      const span = bar.spans.findLast((candidate) => bar.start + candidate.start <= note.tick);
      const chord = span?.chord;
      if (!chord) continue;
      const tones = chordTones(chord.quality).map(
        (tone) => (pitchClass(chord.root) + tone.interval) % 12,
      );
      if (chord.bass) tones.push(pitchClass(chord.bass));
      assert.ok(
        tones.includes(note.pitch % 12),
        `${chart.file} seed ${options.seed}: a long passing tone in bar ${bar.index}`,
      );
    }
  }
});

test("the last bass note of a jam that ends is the lowest root on the instrument, or the root an octave over it where the fall from the note before would be more than an octave", () => {
  for (const { chart, options, take } of takes((jam) => !jam.options.open && written(jam))) {
    const bass = notesOf(take, "bass");
    const last = bass.at(-1)!;
    const ending = take.plan.bars.findLast((bar) => bar.kind === "music")!;
    const before = bass.findLast((note) => note.tick < ending.start);
    const lowest = 28 + ((last.pitch - 28) % 12);
    // A line on a low tonic lives an octave over the open string, and its last note can be
    // a seventh over that: it comes home there, not two octaves down by a leap (EN-28).
    const leap = before !== undefined && before.pitch - lowest > 12;
    assert.ok(
      last.pitch === lowest || (leap && last.pitch === lowest + 12),
      `${chart.file} seed ${options.seed}: ends on ${last.pitch} from ${before?.pitch}`,
    );
  }
});

test("a bass note outside its chord's scale only passes: it is stepped into and out of the same way, or it is the half step onto the note that states the next change", () => {
  let outside = 0;
  for (const { chart, options, take } of takes(written)) {
    const bass = notesOf(take, "bass");
    const harmony = arrivals(take.plan);
    const changes = new Set(
      harmony.filter((arrival) => arrival.changed && arrival.chord).map((arrival) => arrival.tick),
    );
    let at = 0;
    bass.forEach((note, i) => {
      while (harmony[at + 1] && harmony[at + 1]!.tick <= note.tick) at++;
      const over = harmony[at];
      if (!over?.chord || over.tick > note.tick) return;
      const interval = note.pitch - pitchClass(over.chord.root);
      const scale = chordScale(over.chord, contextOf(harmony, over));
      const tone = chordTones(over.chord.quality).some(
        (candidate) => (candidate.interval - interval) % 12 === 0,
      );
      if (tone || scaleHas(scale, interval)) return;
      outside++;
      const [before, after] = [bass[i - 1], bass[i + 1]];
      const where = `${chart.file} seed ${options.seed} ${JSON.stringify(options)} at tick ${note.tick}: ${note.pitch} over ${over.chord.text}`;
      // An open jam stops where it is stopped: its last note may be leading into a chorus
      // that was never played.
      if (!after && take.plan.open) return;
      assert.ok(after, `${where}: the line ends on it`);
      const out = after.pitch - note.pitch;
      // The lope may strike it again before it lands.
      const landing = out === 0 ? bass[i + 2] : after;
      // The note that states the change: on it, or the first after it where the line keeps a
      // hole on the One across the barline (ST-reggae-14).
      const states = (next: (typeof bass)[number]) =>
        changes.has(next.tick) ||
        [...changes].some(
          (tick) => tick > note.tick && tick < next.tick && next.tick - tick <= 2 * PPQ,
        );
      if (landing && states(landing) && Math.abs(landing.pitch - note.pitch) === 1) return;
      if (!landing && take.plan.open) return;
      assert.ok(before, `${where}: the line starts on it`);
      const into = note.pitch - before.pitch;
      // The lope strikes a beat's note again: the note it passes from is the one before that.
      const from = into === 0 && bass[i - 2] ? note.pitch - bass[i - 2]!.pitch : into;
      const leaves = out === 0 && bass[i + 2] ? bass[i + 2]!.pitch - note.pitch : out;
      assert.ok(
        Math.abs(from) <= 2 && Math.abs(leaves) <= 2 && Math.sign(from) === Math.sign(leaves),
        `${where}: reached by ${from}, left by ${leaves}`,
      );
    });
  }
  assert.ok(outside > enough(100), `only ${outside} notes outside their chord's scale`);
});

test(
  "blues: the bass keeps its line: away from the quiet level, a phrase opens on the same shape each time its section comes round at that level",
  only("blues"),
  () => {
    let compared = 0;
    for (const { chart, options, take } of takes(bluesWritten)) {
      const bass = notesOf(take, "bass");
      const openings = new Map<string, string>();
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.ending || bar.seats.bass === null) continue;
        if (bar.phrase.bar !== 0 || tierOf(bar.seats.bass) === "low") continue;
        const next = take.plan.bars[bar.index + 1];
        // A bar of one chord with the same chord after it: the first half of a box, with no
        // change at the barline to lead into.
        const one = (b: PlanBar | undefined) =>
          b?.kind === "music" &&
          b.spans.filter((span) => !span.tied).length === 1 &&
          b.spans[0]!.chord;
        const [here, there] = [one(bar), one(next)];
        if (!here || !there || here.text !== there.text) continue;
        // The chord arrives with the phrase. A phrase that opens partway through a stay on a
        // chord is the line carrying on: the second bar of a two-bar shape, not its top.
        const before = take.plan.bars[bar.index - 1]?.spans.at(-1)?.chord;
        if (before?.text === here.text) continue;
        const notes = bass.filter(
          (note) => note.tick >= bar.start && note.tick < bar.start + bar.ticks,
        );
        if (notes.length === 0) continue;
        const shape = notes
          .map((note) => `${note.tick - bar.start}:${note.pitch - notes[0]!.pitch}`)
          .join(" ");
        const quality = JSON.stringify(here.quality);
        const key = `${bar.section.identity} ${tierOf(bar.seats.bass)} ${quality}`;
        const known = openings.get(key);
        if (known === undefined) openings.set(key, shape);
        else {
          compared++;
          assert.equal(
            shape,
            known,
            `${chart.file} seed ${options.seed} bar ${bar.index} (${key})`,
          );
        }
      }
    }
    assert.ok(compared > enough(250), `only ${compared} phrase openings compared`);
  },
);

test(
  "blues: the bass does not play one line all night: in a jam of five choruses at the working level it plays more than one two-bar shape in bars 3 and 4, and at least one chorus ends by walking into the top",
  only("blues"),
  () => {
    const twelve = LIBRARY.find((chart) => chart.file === "blues-12-bar-a.chart")!;
    let varied = 0;
    let walked = 0;
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    for (const style of STYLES.filter((candidate) => candidate.id === "blues")) {
      for (const seed of seeds) {
        const take = render(twelve.text, style, { mode: "jam", passes: 5, seed, energy: 0.55 });
        const bass = notesOf(take, "bass");
        const shapes = new Set<string>();
        let walks = 0;
        for (const bar of take.plan.bars) {
          if (bar.kind !== "music" || bar.ending) continue;
          const notes = bass.filter(
            (note) => note.tick >= bar.start && note.tick < bar.start + 2 * bar.ticks,
          );
          // Bars 3 and 4 of the form: the second box on the I, where an answer may be played
          // (the first box is always the section's own line).
          if (bar.barInSection === 2 && notes.length > 0) {
            shapes.add(
              notes
                .map((note) => `${note.tick - bar.start}:${note.pitch - notes[0]!.pitch}`)
                .join(" "),
            );
          }
          // The last bar of the form, going round again: four quarters by step into the top.
          const next = take.plan.bars[bar.index + 1];
          if (next?.kind === "music" && next.barInSection === 0 && !next.ending) {
            const last = bass.filter((note) => note.tick >= bar.start && note.tick < next.start);
            const landing = bass.find((note) => note.tick === next.start);
            const line = [...last.map((note) => note.pitch), landing?.pitch ?? Number.NaN];
            const steps = line.slice(1).map((pitch, i) => pitch - line[i]!);
            const oneWay = steps.every((step) => Math.sign(step) === Math.sign(steps[0]!));
            if (last.length === 4 && oneWay && steps.slice(1).every((step) => Math.abs(step) <= 2))
              walks++;
          }
        }
        if (shapes.size > 1) varied++;
        if (walks > 0) walked++;
      }
    }
    assert.ok(
      varied >= seeds.length / 2,
      `more than one shape on the I in only ${varied} of ${seeds.length} takes`,
    );
    assert.ok(
      walked >= seeds.length / 2,
      `a walk into the top in only ${walked} of ${seeds.length} takes`,
    );
  },
);

test("a bass note that leads into a change belongs to the scale of the chord it is played over, unless it is a half step from where it lands", () => {
  let leadIns = 0;
  for (const { chart, options, take } of takes()) {
    const bass = notesOf(take, "bass");
    const harmony = arrivals(take.plan);
    const arrivalTicks = new Set(harmony.map((arrival) => arrival.tick));
    for (const change of bassChanges(take)) {
      const landing = bass.find((note) => note.tick === change.tick);
      const before = bass.findLast((note) => note.tick < change.tick);
      if (!landing || !before || change.tick - before.tick > PPQ) continue;
      if (arrivalTicks.has(before.tick)) continue;
      const over = harmony.findLast((arrival) => arrival.tick <= before.tick);
      if (!over?.chord) continue;
      leadIns++;
      if (Math.abs(before.pitch - landing.pitch) === 1) continue;
      const scale = chordScale(over.chord, contextOf(harmony, over));
      assert.ok(
        scaleHas(scale, before.pitch - pitchClass(over.chord.root)),
        `${chart.file} seed ${options.seed} at tick ${change.tick}: ${before.pitch} over ${over.chord.text} (${scale.name})`,
      );
    }
  }
  assert.ok(leadIns > enough(500), `only ${leadIns} lead-ins across the library`);
});

// ── a walking bass ──────────────────────────────────────────────────────────

test(
  "jazz: once the band has opened up the bass walks: in 4/4 a note on every beat and nothing between (a chord that lands off the beat gets its root there), never the same note twice running, and into a change of bass note by a half step, a whole step, a fourth or a fifth",
  only("jazz"),
  () => {
    let bars = 0;
    let approaches = 0;
    for (const { chart, options, take } of takes(
      (jam) => jam.style.id === "jazz" && jam.chart.meter === "4/4",
    )) {
      const bass = notesOf(take, "bass");
      const harmony = arrivals(take.plan);
      const changes = new Map(bassChanges(take).map((change) => [change.tick, change.root]));
      const walking = (bar: PlanBar | undefined) =>
        bar?.kind === "music" &&
        !bar.ending &&
        bar.seats.bass !== null &&
        tierOf(bar.seats.bass) !== "low";
      let at = 0;
      for (const bar of take.plan.bars) {
        const own: typeof bass = [];
        while (at < bass.length && bass[at]!.tick < bar.start + bar.ticks) own.push(bass[at++]!);
        if (!walking(bar) || bar.spans.some((span) => span.chord === null)) continue;
        bars++;
        const where = `${chart.file} seed ${options.seed} bar ${bar.index}`;
        const landings = harmony
          .filter((arrival) => arrival.bar === bar.index)
          .map((arrival) => arrival.tick - bar.start);
        const wanted = [...new Set([0, PPQ, 2 * PPQ, 3 * PPQ, ...landings])].sort((a, b) => a - b);
        assert.deepEqual(
          own.map((note) => note.tick - bar.start),
          wanted,
          `${where}: not a note to a beat`,
        );
        for (const note of own) {
          const i = bass.indexOf(note);
          const before = bass[i - 1];
          // The note before is the one it follows: in this bar or the last. A bass that has
          // laid out for a section comes back on whatever the chord asks.
          const from = before && take.plan.bars.findLast((b) => b.start <= before.tick);
          if (!before || !from || from.index < bar.index - 1 || !walking(from)) continue;
          assert.notEqual(note.pitch, before.pitch, `${where}: ${note.pitch} twice running`);
          if (changes.get(note.tick) !== note.pitch % 12) continue;
          // Where the note before is itself a root on a change (chords a beat apart, as in Body
          // and Soul's bridge: C7 for a beat, then F#m7), the root on its chord and the step
          // into the next cannot both hold. The root wins; the step is not asked for there.
          if (changes.get(before.tick) === before.pitch % 12) continue;
          approaches++;
          const by = Math.abs(note.pitch - before.pitch);
          assert.ok(
            [1, 2, 5, 7].includes(by),
            `${where}: into ${note.pitch} from ${before.pitch}, by ${by} semitones`,
          );
        }
      }
    }
    assert.ok(
      bars > enough(3000) && approaches > enough(2000),
      `only ${bars} bars, ${approaches} approaches`,
    );
  },
);

test(
  "jazz: in six the bass does not walk every beat until the band is hot: every note is on a beat (a chord that lands off one gets its root there), both of the bar's strong beats, 1 and 4, are played, and a bar of one chord has two to five notes at the working level and three to six hot; when the band is quiet it is in two, a note on each strong beat and at most a lead-in",
  only("jazz"),
  () => {
    const counted = { low: 0, mid: 0, high: 0 };
    for (const { chart, options, take } of takes(
      (jam) => jam.style.id === "jazz" && jam.chart.meter === "6/4",
    )) {
      const bass = notesOf(take, "bass");
      const harmony = arrivals(take.plan);
      let at = 0;
      for (const bar of take.plan.bars) {
        const own: typeof bass = [];
        while (at < bass.length && bass[at]!.tick < bar.start + bar.ticks) own.push(bass[at++]!);
        if (bar.kind !== "music" || bar.ending || bar.seats.bass === null) continue;
        if (bar.spans.some((span) => span.chord === null)) continue;
        const where = `${chart.file} seed ${options.seed} bar ${bar.index}`;
        const landings = harmony
          .filter((arrival) => arrival.bar === bar.index)
          .map((arrival) => arrival.tick - bar.start);
        const ticks = own.map((note) => note.tick - bar.start);
        for (const tick of ticks) {
          assert.ok(tick % PPQ === 0 || landings.includes(tick), `${where}: a note off the beat`);
        }
        for (const strong of strongPulses(bar.meter)) {
          assert.ok(ticks.includes(strong), `${where}: nothing on beat ${strong / PPQ + 1}`);
        }
        // How many notes is asked of a bar the chart leaves alone: one chord, all bar.
        if (landings.some((tick) => tick !== 0)) continue;
        // The bar before the band opens up already plays where it is going (BA-25).
        const next = take.plan.bars[bar.index + 1];
        const tier = tierOf(bar.seats.bass);
        if (next?.seats.bass != null && tierOf(next.seats.bass) !== tier) continue;
        counted[tier]++;
        const [fewest, most] = tier === "low" ? [2, 3] : tier === "mid" ? [2, 5] : [3, 6];
        assert.ok(
          own.length >= fewest && own.length <= most,
          `${where}: ${own.length} notes in a bar at the ${tier} level`,
        );
      }
    }
    if (LIBRARY.some((chart) => chart.meter === "6/4"))
      assert.ok(
        counted.low > enough(60) && counted.mid > enough(150) && counted.high > enough(60),
        `only ${counted.low} quiet bars, ${counted.mid} working, ${counted.high} hot`,
      );
  },
);

test(
  "acoustic: in six the upright is in two: every note on an eighth and no more than four in a bar; the chord's bass note on the first pulse; when the band is quiet nothing else but a chord arriving, and from the working level the second pulse is always played, as the chord's fifth or its bass note, or a step into the next bass note",
  only("acoustic"),
  () => {
    const counted = { low: 0, mid: 0, high: 0 };
    const acoustic = STYLES.find((style) => style.id === "acoustic")!;
    const sixes = LIBRARY.filter((chart) => chart.meter === "6/8");
    const played = [
      ...takes((jam) => jam.style.id === "acoustic" && jam.chart.meter === "6/8").map(
        ({ chart, options, take }) => ({ where: `${chart.file} seed ${options.seed}`, take }),
      ),
      ...sixes.flatMap((chart) =>
        [0.3, 0.55, 0.85].map((energy) => ({
          where: `${chart.file} held at ${energy}`,
          take: render(chart.text, acoustic, { mode: "jam", passes: 2, energy, seed: 3 }),
        })),
      ),
    ];
    const PULSE = PPQ * 1.5;
    for (const { where: of, take } of played) {
      const bass = notesOf(take, "bass");
      const harmony = arrivals(take.plan);
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.ending || bar.seats.bass === null) continue;
        if (bar.spans.some((span) => span.chord === null)) continue;
        const end = bar.start + bar.ticks;
        const own = bass.filter((note) => note.tick >= bar.start && note.tick < end);
        const where = `${of} bar ${bar.index}`;
        const sounding = (tick: number) =>
          harmony.findLast((arrival) => arrival.tick <= tick)!.chord!;
        const bassOf = (chord: ReturnType<typeof sounding>) => pitchClass(chord.bass ?? chord.root);
        const landings = harmony
          .filter((arrival) => arrival.bar === bar.index)
          .map((arrival) => arrival.tick - bar.start);
        const ticks = own.map((note) => note.tick - bar.start);
        for (const tick of ticks) {
          assert.equal(tick % (PPQ / 2), 0, `${where}: a note between the eighths`);
        }
        assert.ok(own.length <= 4, `${where}: ${own.length} notes in a bar`);
        const first = own.find((note) => note.tick === bar.start);
        assert.ok(first, `${where}: nothing on the first pulse`);
        assert.equal(first.pitch % 12, bassOf(sounding(bar.start)), `${where}: the One`);
        const tier = tierOf(bar.seats.bass);
        counted[tier]++;
        if (tier === "low") {
          for (const tick of ticks) {
            assert.ok(tick === 0 || landings.includes(tick), `${where}: quiet, a note at ${tick}`);
          }
          continue;
        }
        const second = own.find((note) => note.tick === bar.start + PULSE);
        assert.ok(second, `${where}: nothing on the second pulse at the ${tier} level`);
        const chord = sounding(second.tick);
        const pc = second.pitch % 12;
        const next = harmony.find((arrival) => arrival.tick >= end && arrival.chord);
        const into = next?.chord ? bassOf(next.chord) : -1;
        const step = into >= 0 && [1, 2, 10, 11].includes((pc - into + 12) % 12);
        assert.ok(
          pc === (pitchClass(chord.root) + 7) % 12 || pc === bassOf(chord) || step,
          `${where}: ${second.pitch} on the second pulse over ${chord.text}`,
        );
      }
    }
    if (sixes.length > 0)
      assert.ok(
        counted.low > enough(40) && counted.mid > enough(100) && counted.high > enough(40),
        `only ${counted.low} quiet bars, ${counted.mid} working, ${counted.high} hot`,
      );
  },
);

// ── a riff ──────────────────────────────────────────────────────────────────

test(
  "funk: the bass is on the One and under the kick: a sounded note on beat 1 of every bar that has a chord there, a note or a dead note wherever the bass drum is played, every note on the sixteenths, none ringing past two and a half sixteenths, and a dead note never on the One, on a change, or when the band is quiet",
  only("funk"),
  () => {
    let bars = 0;
    let kicks = 0;
    let dead = 0;
    for (const { chart, options, take } of takes(
      (jam) => jam.style.id === "funk" && jam.chart.meter === "4/4",
    )) {
      const bass = notesOf(take, "bass");
      const sounded = new Set(
        bass.filter((note) => note.voice !== DEAD_VOICE).map((note) => note.tick),
      );
      const struck = new Set(bass.map((note) => note.tick));
      const changes = new Set(arrivals(take.plan).map((arrival) => arrival.tick));
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.seats.bass === null || bar.ending) continue;
        const where = `${chart.file} seed ${options.seed} bar ${bar.index}`;
        if (bar.spans[0]?.chord && bar.spans[0].start === 0) {
          bars++;
          assert.ok(sounded.has(bar.start), `${where}: nothing on the One`);
        }
      }
      for (const kick of notesOf(take, "drums")) {
        if (kick.voice !== "kick") continue;
        const bar = take.plan.bars.findLast((candidate) => candidate.start <= kick.tick)!;
        if (bar.kind !== "music" || bar.seats.bass === null || bar.ending) continue;
        if (bar.spans.some((span) => span.chord === null)) continue;
        kicks++;
        // A dead note under the kick is the same thump: the hand is there.
        assert.ok(
          struck.has(kick.tick),
          `${chart.file} seed ${options.seed} bar ${bar.index} tick ${kick.tick - bar.start}: a kick (${kick.velocity}) with no bass under it`,
        );
      }
      for (const note of bass) {
        const bar = take.plan.bars.findLast((candidate) => candidate.start <= note.tick)!;
        const where = `${chart.file} seed ${options.seed} bar ${bar.index}`;
        assert.equal((note.tick - bar.start) % (PPQ / 4), 0, `${where}: off the sixteenths`);
        if (bar.ending) continue;
        // Two and a quarter as written; the trace of swing on the sixteenths can add a little.
        assert.ok(note.duration <= (PPQ / 4) * 2.5, `${where}: a note of ${note.duration}`);
        if (note.voice !== DEAD_VOICE) continue;
        dead++;
        assert.notEqual(note.tick, bar.start, `${where}: a dead note on the One`);
        assert.ok(!changes.has(note.tick), `${where}: a dead note on a change`);
        assert.notEqual(
          tierOf(bar.seats.bass ?? bar.energy),
          "low",
          `${where}: a dead note, quiet`,
        );
      }
    }
    assert.ok(
      bars > enough(3000) && kicks > enough(8000) && dead > enough(1500),
      `only ${bars} bars, ${kicks} kicks, ${dead} dead notes`,
    );
  },
);

test(
  "funk: the riff is the section's: in one time through a section at one level, every bar opens on the same rhythm for its first two beats, unless the chord changes inside them",
  only("funk"),
  () => {
    let compared = 0;
    for (const { chart, options, take } of takes(
      (jam) => jam.style.id === "funk" && jam.chart.meter === "4/4",
    )) {
      const bass = notesOf(take, "bass");
      const harmony = arrivals(take.plan);
      const riffs = new Map<string, string>();
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.seats.bass === null || bar.ending) continue;
        if (bar.spans.some((span) => span.chord === null)) continue;
        const inside = harmony.some(
          (arrival) => arrival.tick > bar.start && arrival.tick < bar.start + 2 * PPQ,
        );
        if (inside) continue;
        const rhythm = bass
          .filter((note) => note.tick >= bar.start && note.tick < bar.start + 2 * PPQ)
          .map(
            (note) =>
              `${(note.tick - bar.start) / (PPQ / 4)}${note.voice === DEAD_VOICE ? "x" : ""}`,
          )
          .join(" ");
        const key = `${bar.pass} ${bar.section.identity} ${bar.section.occurrence} ${tierOf(bar.seats.bass)}`;
        const known = riffs.get(key);
        if (known === undefined) riffs.set(key, rhythm);
        else {
          compared++;
          assert.equal(
            rhythm,
            known,
            `${chart.file} seed ${options.seed} bar ${bar.index}: another riff`,
          );
        }
      }
    }
    assert.ok(compared > enough(3000), `only ${compared} bars compared`);
  },
);
