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
  PPQ,
  pitchClass,
  render,
  scaleHas,
  tierOf,
} from "@ensemble/engine";
import { blues, POCKET } from "./reading.ts";
import { LIBRARY, notesOf, only, STYLES, takes } from "./takes.ts";

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
  assert.ok(leadIns > 500, `only ${leadIns} stepwise lead-ins across the library`);
});

test("the bass line never leaps more than an octave", () => {
  for (const { chart, options, take } of takes((jam) => jam.chart.meter === "4/4")) {
    const bass = notesOf(take, "bass");
    for (let i = 1; i < bass.length; i++) {
      const leap = Math.abs(bass[i]!.pitch - bass[i - 1]!.pitch);
      assert.ok(leap <= 12, `${chart.file} seed ${options.seed}: a leap of ${leap} semitones`);
    }
  }
});

test("a bass note held for a half note or more is a tone of its chord", () => {
  for (const { chart, options, take } of takes()) {
    for (const note of notesOf(take, "bass")) {
      if (note.duration < PPQ * 2 - POCKET) continue;
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

test("the last bass note of a jam that ends is the lowest root on the instrument", () => {
  for (const { chart, options, take } of takes(
    (jam) => !jam.options.open && jam.chart.meter === "4/4",
  )) {
    const last = notesOf(take, "bass").at(-1)!;
    assert.ok(
      last.pitch >= 28 && last.pitch < 40,
      `${chart.file} seed ${options.seed}: ends on ${last.pitch}`,
    );
  }
});

test("a bass note outside its chord's scale only passes: it is stepped into and out of the same way, or it is the half step onto the next change", () => {
  let outside = 0;
  for (const { chart, options, take } of takes((jam) => jam.chart.meter === "4/4")) {
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
      if (landing && changes.has(landing.tick) && Math.abs(landing.pitch - note.pitch) === 1)
        return;
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
  assert.ok(outside > 200, `only ${outside} notes outside their chord's scale`);
});

test(
  "blues: the bass keeps its line: away from the quiet level, a phrase opens on the same shape each time its section comes round at that level",
  only("blues"),
  () => {
    let compared = 0;
    for (const { chart, options, take } of takes(blues)) {
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
    assert.ok(compared > 250, `only ${compared} phrase openings compared`);
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
  assert.ok(leadIns > 500, `only ${leadIns} lead-ins across the library`);
});
