// Musical properties of the bass line: where it sits, how it states and leads into the
// changes, and that it has a line of its own and varies it. See docs/TESTING.md, kind 2.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlanBar, StylePack, Take } from "@ensemble/engine";
import {
  arrivals,
  chordScale,
  chordTones,
  chordToString,
  contextOf,
  DEAD_VOICE,
  isCompound,
  PPQ,
  pitchClass,
  pulseStarts,
  render,
  scaleHas,
  strongPulses,
  tierOf,
} from "@ensemble/engine";
import { bluesWritten, harmonyOf } from "./reading.ts";
import type { LibraryChart } from "./takes.ts";
import {
  enough,
  heldTakes,
  LIBRARY,
  notesOf,
  only,
  ownCharts,
  SEEDS,
  STYLES,
  takeOf,
  takes,
  written,
} from "./takes.ts";

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

test("a lead-in resolves by step in actual pitch: a note a step from the next root by name is a step from the note the bass plays next, unless it is the root or the fifth of the chord it is played over", () => {
  let leadIns = 0;
  for (const { chart, options, take } of takes()) {
    const bass = notesOf(take, "bass");
    const arrivalTicks = new Set(bassChanges(take).map((change) => change.tick));
    const changes = bassChanges(take);
    for (const [at, change] of changes.entries()) {
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
      // The root and the fifth of the chord being played are the line's own figure, not a way
      // into the next chord: a riff's fifth above its root, then a root a half step over it and
      // an octave down, is in a take Brandon passed (the neo-soul golden, F#2 over Bm9 into G1).
      const over = changes[at - 1]?.root;
      const figure =
        over !== undefined && [0, 7].includes((before.pitch - over + 120) % 12) && byName !== 0;
      if ((byName === 1 || byName === 2) && !figure) {
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

/** The bass's open low E. */
const LOW_E = 28;

/** A bar of four quarters. */
const inFour = (bar: PlanBar) => bar.meter.beats === 4 && bar.meter.unit === 4;

/**
 * Charts the library does not have, written to end every way a walk home can meet: from each
 * degree of a major and a minor key, from a chord struck on beat 3, and into a landing whose
 * low root has no fifth under it (E) and one whose does (C).
 */
const HOME_CHARTS: readonly LibraryChart[] = (
  [
    [
      "C",
      [
        "C",
        "F",
        "G",
        "G7",
        "Am",
        "Bb",
        "Ab",
        "Dm",
        "Em",
        "D7",
        "C7",
        "F G",
        "Dm G",
        "Am Bb",
        "G F",
      ],
    ],
    ["Am", ["Am", "Dm", "E7", "F", "G", "F E7", "Dm G"]],
    ["E", ["E", "A", "B7", "C#m", "D", "A B7"]],
    ["G", ["G", "C", "D7", "Em", "F"]],
  ] as const
).flatMap(([key, befores]) =>
  befores.map((before) => ({
    file: `home-${key}-${before.replace(" ", "-")}`,
    text: `title: Home\nkey: ${key}\ntempo: 100\n\n[A]\n| ${key} | ${key} | ${before} | ${key} |\n`,
    meter: "4/4",
  })),
);

test("in a style whose bass walks home, every ending that is one chord struck on its downbeat, in four after a bar of four of one chord (or two, the second on beat 3), is walked into: a note on beat 4 a step from the final root (none after a V struck on beat 3); a bar of one chord whose root is outside the run climbs on 2, 3 and 4 from the fifth under the root by steps (over the V the fifth is held from 1; from the IV the line comes down from the fourth over it), unless no octave holds that climb or it would leave the chord's scale; the walk on the instrument and in the bass's register, moving by a fourth at most (a V on beat 3 drops a fifth onto it, any other chord on 3 no more than an octave), and the final root in the lowest octave where all that holds; and the final root played at least as hard as the note it is walked in on", {
  skip: !STYLES.some((style) => style.bass.walks?.ending !== undefined),
}, () => {
  let walked = 0;
  const homeward = (style: StylePack) => style.bass.walks?.ending !== undefined;
  const own = STYLES.filter(homeward).flatMap((style) =>
    HOME_CHARTS.flatMap((chart) =>
      [0.3, 0.85].flatMap((energy) =>
        SEEDS.map((seed) =>
          takeOf({ style, chart, options: { mode: "jam", passes: 1, energy, seed } }),
        ),
      ),
    ),
  );
  for (const { style, chart, options, take } of [
    ...takes((jam) => homeward(jam.style) && !jam.options.open),
    ...own,
  ]) {
    const music = take.plan.bars.filter((bar) => bar.kind === "music");
    const end = music.at(-1)!;
    const before = music.at(-2);
    if (end.ending?.at !== 0 || !before || before.index !== end.index - 1) continue;
    if (!inFour(end) || !inFour(before) || end.seats.bass === null || before.seats.bass === null)
      continue;
    const chorded = end.spans.filter((span) => span.chord !== null);
    const final = chorded[0]!.chord!;
    if (chorded.some((span) => chordToString(span.chord!) !== chordToString(final))) continue;
    const spans = before.spans.filter((span) => !span.tied);
    if (before.spans.some((span) => span.chord === null)) continue;
    const split = spans.length === 2 && spans[1]!.start === 2 * PPQ;
    if (spans.length !== 1 && !split) continue;
    const where = `${chart.file} seed ${options.seed} ${JSON.stringify(options)}`;
    const bass = notesOf(take, "bass");
    const home = bass.find((note) => note.tick === end.start);
    assert.ok(home, `${where}: no final root`);
    const pc = pitchClass(final.bass ?? final.root);
    const { lowest, highest } = style.bass.register;
    const floor = Math.max(LOW_E, lowest);
    const inRegister = (pitch: number) => pitch >= floor && pitch <= highest;
    const bar = bass.filter((note) => note.tick >= before.start && note.tick < end.start);
    const at = (beat: number) => bar.filter((note) => note.tick === before.start + beat * PPQ);
    const last = spans.at(-1)!.chord!;
    const motion = (pitchClass(last.bass ?? last.root) - pc + 12) % 12;
    walked++;
    assert.equal(home.pitch % 12, pc, `${where}: the final root is not the root`);
    // Struck at least as hard as the note it is walked in on, as played (EN-46).
    const into = bar.at(-1)!;
    assert.ok(
      home.velocity >= into.velocity,
      `${where}: the final root (${home.velocity}) is softer than the walk's last note (${into.velocity})`,
    );
    const [four] = at(3);
    const [first] = at(0);
    // The walk's own notes, the note the line moves to it from, and how wide it may move:
    // a fourth inside the walk, a fifth onto it from the line's own note (the boom's move), a
    // fifth where a V on beat 3 drops onto the root, and an octave where another chord on 3 does.
    let walk: number[];
    let from: number | null;
    let widest = 5;
    let form: string;
    if (split) {
      form = "split";
      if (motion === 7)
        assert.equal(at(3).length, 0, `${where}: a V on beat 3 plays on into the final root`);
      walk = four ? [four.pitch] : [];
      from = at(2)[0]?.pitch ?? null;
      if (!four) widest = motion === 7 ? 7 : 12;
    } else {
      assert.ok(four && at(3).length === 1, `${where}: no note on beat 4 of the walk home`);
      const down = motion === 5 && first?.pitch === home.pitch + 5 && at(1).length === 0;
      const held = motion === 7 && first?.pitch === home.pitch - 5 && at(1).length === 0;
      const climbs = at(1).length === 1 && at(1)[0]!.pitch === home.pitch - 5;
      form = down ? "down" : held ? "held" : climbs ? "climb" : "four";
      if (form === "four") {
        walk = [four.pitch];
        from = bar.filter((note) => note.tick < four.tick).at(-1)?.pitch ?? null;
      } else {
        walk = [first!, ...(climbs ? at(1) : []), ...at(2), four].map((note) => note.pitch);
        from = null;
        assert.equal(walk.length, climbs ? 4 : 3, `${where}: the run is not whole`);
        const run = [...walk.slice(climbs ? 1 : 0), home.pitch];
        assert.ok(
          run.slice(1).every((pitch, i) => {
            const move = pitch - run[i]!;
            return down ? move < 0 && move >= -2 : move > 0 && move <= 2;
          }),
          `${where}: the run ${run} does not walk by steps`,
        );
      }
    }
    if (four) {
      assert.ok(
        Math.abs(four.pitch - home.pitch) <= 2 && four.pitch !== home.pitch,
        `${where}: beat 4 (${four.pitch}) is not a step from the final root (${home.pitch})`,
      );
    }
    // On the instrument, in the register, by moves of a fourth at most, and in the lowest octave
    // where all that holds (EN-48).
    const sits = (shift: number) => {
      const path = [...walk, home.pitch].map((pitch) => pitch + shift);
      const moves = [...(from === null ? [] : [from]), ...path];
      return (
        path.every(inRegister) &&
        moves.every(
          (pitch, i) =>
            i === 0 ||
            Math.abs(pitch - moves[i - 1]!) <=
              (i === 1 && from !== null && walk.length > 0 ? 7 : widest),
        )
      );
    };
    assert.ok(
      sits(0),
      `${where}: the walk home ${walk} into ${home.pitch} (${form}) leaves the register or leaps`,
    );
    assert.ok(!sits(-12), `${where}: the walk home ${walk} (${form}) could land an octave lower`);
    if (form !== "four" || motion > 7) continue;
    // In on beat 4 alone where the bar's root is outside the run: only where no octave holds the
    // climb, or its run would leave the chord's scale.
    const harmony = harmonyOf(take);
    const over = harmony.findLast((arrival) => arrival.tick <= before.start)!;
    const scale = chordScale(over.chord!, contextOf(harmony, over));
    const inScale = (pitch: number) =>
      scaleHas(scale, pitch - pitchClass(last.root)) ||
      chordTones(last.quality).some(
        (tone) => (((pitch - pitchClass(last.root) - tone.interval) % 12) + 12) % 12 === 0,
      );
    // A note struck within a beat before the bar, a step by name from its root, led there: the
    // bar's root stays a step from it in pitch (BA-05), and into the bar no leap over an octave.
    const prior = bass.findLast((note) => note.tick < before.start);
    const climbable = [-24, -12, 0, 12, 24].some((shift) => {
      const landing = home.pitch + shift;
      if (!inRegister(landing) || !inRegister(landing - 5)) return false;
      const roots = [0, 12, 24, 36, 48]
        .map(
          (o) =>
            LOW_E +
            (((((last.bass ? pitchClass(last.bass) : pitchClass(last.root)) - LOW_E) % 12) + 12) %
              12) +
            o,
        )
        .filter(inRegister);
      const root = roots.reduce((a, b) =>
        Math.abs(b - (landing - 5)) < Math.abs(a - (landing - 5)) ? b : a,
      );
      const byName = prior
        ? Math.min((((prior.pitch - root) % 12) + 12) % 12, (((root - prior.pitch) % 12) + 12) % 12)
        : 0;
      const led =
        prior !== undefined &&
        before.start - prior.tick <= PPQ &&
        (byName === 1 || byName === 2) &&
        Math.abs(prior.pitch - root) > 2;
      const leaps = prior !== undefined && Math.abs(prior.pitch - root) > 12;
      return Math.abs(root - (landing - 5)) <= 5 && !led && !leaps;
    });
    assert.ok(
      !climbable ||
        !inScale(home.pitch - 5) ||
        (!inScale(home.pitch - 3) && !inScale(home.pitch - 4)),
      `${where}: the bar goes in on beat 4 alone where its run would fit`,
    );
  }
  assert.ok(walked > enough(400), `only ${walked} endings walked home`);
});

/**
 * A bass that leads into a change by a half step: its line steps in from the half step under or
 * over the new root at some level. Its outside notes are common, so the rule below must see
 * enough of them; a bass whose line stays in the scale (country's, BA-51, BA-53) is held to the
 * rule on every note it plays, and to no count of them.
 */
const leadsInByHalfSteps = (style: (typeof STYLES)[number]): boolean => {
  const { chance, kinds } = style.bass.leadIn;
  const leads = [
    ...Object.values(chance.inside),
    ...Object.values(chance.intoSection),
    ...Object.values(chance.intoPhrase ?? {}),
    chance.intoEnding,
  ].some((value) => value > 0);
  return leads && Object.values(kinds).some((kind) => kind.below > 0 || kind.above > 0);
};

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
  if (STYLES.some(leadsInByHalfSteps))
    assert.ok(outside > enough(100), `only ${outside} notes outside their chord's scale`);
});

test(
  "blues: the bass keeps its line: away from the quiet level, a phrase opens on the same shape each time its section comes round at that level on the same kind of chord in the same place in the key",
  only("blues"),
  () => {
    let compared = 0;
    for (const { chart, options, take } of takes(bluesWritten)) {
      const bass = notesOf(take, "bass");
      const harmony = arrivals(take.plan);
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
        // The bass takes its shape from the chord's scale (BA-30: one box where the scale has
        // the flat seventh, another where it has not), and a chord written the same way has a
        // different scale in a different place in the key: a plain V has the flat seventh
        // where a plain I has not. They are not one kind of chord, and are not compared.
        const arrival = harmony.find((at) => at.tick === bar.start);
        if (!arrival?.chord) continue;
        const scale = chordScale(arrival.chord, contextOf(harmony, arrival)).intervals.join(",");
        const key = `${bar.section.identity} ${tierOf(bar.seats.bass)} ${quality} ${scale}`;
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

test(
  "blues: in six and twelve the bass is a tone a pulse and lopes into the next: quiet it plays on the pulses alone; from the working level it plays every pulse of a bar of one chord; hot, the lope into every pulse, a note on each pulse's last eighth; and never the triplet's middle eighth",
  only("blues"),
  () => {
    const blues = STYLES.find((style) => style.id === "blues")!;
    const compound = (meter: string) => meter === "12/8" || meter === "6/8";
    const counted = new Map<string, number>();
    const played = [
      ...takes((jam) => jam.style.id === "blues" && compound(jam.chart.meter)),
      ...heldTakes(blues, "12/8"),
      ...heldTakes(blues, "6/8"),
    ];
    for (const { chart, options, take } of played) {
      const bass = notesOf(take, "bass");
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.seats.bass === null || bar.ending) continue;
        if (!compound(chart.meter) || bar.spans.some((span) => span.chord === null)) continue;
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        const end = bar.start + bar.ticks;
        // In sixteenths: a pulse is six, its eighths at 0, 2 and 4 into it.
        const steps = new Set(
          bass
            .filter((note) => note.tick >= bar.start && note.tick < end)
            .map((note) => (note.tick - bar.start) / (PPQ / 4)),
        );
        const pulses = Array.from({ length: bar.ticks / (PPQ * 1.5) }, (_, i) => i * 6);
        const tier = tierOf(bar.seats.bass);
        counted.set(`${chart.meter} ${tier}`, (counted.get(`${chart.meter} ${tier}`) ?? 0) + 1);
        for (const step of steps)
          assert.notEqual(step % 6, 2, `${where}: the triplet's middle eighth at ${step}`);
        if (tier === "low") {
          for (const step of steps)
            assert.equal(step % 6, 0, `${where}: quiet, a note between the pulses at ${step}`);
          continue;
        }
        if (bar.spans.filter((span) => !span.tied).length === 1)
          for (const pulse of pulses)
            assert.ok(steps.has(pulse), `${where}: nothing on pulse ${pulse / 6 + 1}`);
        if (tier === "high")
          for (const pulse of pulses)
            assert.ok(steps.has(pulse + 4), `${where}: no lope into ${pulse / 6 + 2}`);
      }
    }
    for (const meter of ["12/8", "6/8"])
      if (LIBRARY.some((chart) => chart.meter === meter))
        for (const tier of ["low", "mid", "high"])
          assert.ok(
            (counted.get(`${meter} ${tier}`) ?? 0) > 20,
            `only ${counted.get(`${meter} ${tier}`) ?? 0} bars of ${meter} at ${tier}`,
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

test("jazz: in six and twelve the bass plays the pulses, and the triplet's last eighth as a pickup into one: every note on a pulse or on a pulse's last eighth (or where a chord lands), never the middle one; the strong pulses always; quiet it is in two (twelve: a note on 1 and 3 and at most a lead-in on 4; six: one on each pulse) with no pickups; from the working level a note on every pulse, never the same pitch twice running; and hot a pickup in every bar of one chord", {
  skip: only("jazz").skip || !LIBRARY.some((c) => c.meter === "6/8" || c.meter === "12/8"),
}, () => {
  const counted = { low: 0, mid: 0, high: 0 };
  const jazz = STYLES.find((style) => style.id === "jazz")!;
  const compound = (jam: { style: { id: string }; chart: { meter: string } }) =>
    jam.style.id === "jazz" && (jam.chart.meter === "6/8" || jam.chart.meter === "12/8");
  for (const { chart, options, take } of [
    ...takes(compound),
    ...heldTakes(jazz, "6/8", false, true),
    ...heldTakes(jazz, "12/8", false, true),
  ]) {
    const bass = notesOf(take, "bass");
    const harmony = arrivals(take.plan);
    let at = 0;
    for (const bar of take.plan.bars) {
      const own: typeof bass = [];
      while (at < bass.length && bass[at]!.tick < bar.start + bar.ticks) own.push(bass[at++]!);
      if (bar.kind !== "music" || bar.ending || bar.seats.bass === null) continue;
      if (!isCompound(bar.meter) || bar.spans.some((span) => span.chord === null)) continue;
      const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
      const landings = harmony
        .filter((arrival) => arrival.bar === bar.index)
        .map((arrival) => arrival.tick - bar.start);
      const pulses = pulseStarts(bar.meter);
      const ticks = own.map((note) => note.tick - bar.start);
      // A dotted pulse is three eighths: its last eighth is an eighth before the next pulse.
      const pickup = (tick: number) => tick % (PPQ * 1.5) === PPQ;
      for (const tick of ticks) {
        assert.ok(
          pulses.includes(tick) || pickup(tick) || landings.includes(tick),
          `${where}: a note at ${tick}, off the pulse and not a pickup`,
        );
      }
      for (const strong of strongPulses(bar.meter))
        assert.ok(ticks.includes(strong), `${where}: nothing on the strong pulse at ${strong}`);
      const tier = tierOf(bar.seats.bass);
      // The bar before the band opens up already plays where it is going (BA-25).
      const next = take.plan.bars[bar.index + 1];
      if (next?.seats.bass != null && tierOf(next.seats.bass) !== tier) continue;
      if (landings.some((tick) => tick !== 0)) continue;
      counted[tier]++;
      if (tier === "low") {
        const two = bar.meter.beats === 6 ? pulses : strongPulses(bar.meter);
        for (const tick of two) assert.ok(ticks.includes(tick), `${where}: quiet, not in two`);
        const lead = pulses.at(-1)!;
        for (const tick of ticks)
          assert.ok(two.includes(tick) || tick === lead, `${where}: quiet, a note at ${tick}`);
        continue;
      }
      for (const tick of pulses) assert.ok(ticks.includes(tick), `${where}: no note at ${tick}`);
      for (let i = 1; i < own.length; i++)
        assert.notEqual(own[i]!.pitch, own[i - 1]!.pitch, `${where}: a pitch twice running`);
      if (tier === "high")
        assert.ok(ticks.some(pickup), `${where}: hot, and no pickup into a pulse`);
    }
  }
  assert.ok(
    counted.low > 20 && counted.mid > 50 && counted.high > 20,
    `only ${counted.low} quiet bars, ${counted.mid} working, ${counted.high} hot`,
  );
});

// ── rock ────────────────────────────────────────────────────────────────────

test(
  "rock: the bass is the kick's, a note wherever the kick is played at every level (quiet the line follows it; in four the eighths cover it, and in six and twelve the kick's pickups are the bass's too); and in six and twelve it is roots on the pulses and never every eighth: every note on an eighth, a note between the pulses only on the eighth before one (a pickup), no more notes than two of every three eighths, from the working level a note on every pulse, and hot a pickup into every pulse",
  only("rock"),
  () => {
    let quiet = 0;
    const compound = new Map<string, number>();
    let hot = 0;
    const rock = STYLES.find((style) => style.id === "rock")!;
    const played = [
      ...takes((jam) => jam.style.id === "rock" && written(jam)),
      ...heldTakes(rock, "12/8"),
      ...heldTakes(rock, "6/8"),
    ];
    for (const { chart, options, take } of played) {
      const bass = notesOf(take, "bass");
      const kicks = notesOf(take, "drums").filter((note) => note.voice === "kick");
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.seats.bass === null || bar.ending) continue;
        if (bar.spans.some((span) => span.chord === null)) continue;
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        const end = bar.start + bar.ticks;
        const steps = new Set(
          bass
            .filter((note) => note.tick >= bar.start && note.tick < end)
            .map((note) => (note.tick - bar.start) / (PPQ / 4)),
        );
        const tier = tierOf(bar.seats.bass);
        if (bar.seats.drums !== null) {
          if (tier === "low") quiet++;
          for (const kick of kicks) {
            if (kick.tick < bar.start || kick.tick >= end) continue;
            const step = (kick.tick - bar.start) / (PPQ / 4);
            assert.ok(steps.has(step), `${where}: a kick at ${step} with no bass under it`);
          }
        }
        if (chart.meter !== "12/8" && chart.meter !== "6/8") continue;
        compound.set(chart.meter, (compound.get(chart.meter) ?? 0) + 1);
        // In sixteenths: a pulse is six, its eighths at 0, 2 and 4 into it.
        const pulses = Array.from({ length: bar.ticks / (PPQ * 1.5) }, (_, i) => i * 6);
        for (const step of steps) {
          assert.ok(step % 2 === 0, `${where}: a note between the eighths at ${step}`);
          assert.ok(step % 6 !== 2, `${where}: a note on the triplet's middle eighth at ${step}`);
        }
        assert.ok(steps.size <= pulses.length * 2, `${where}: ${steps.size} notes in a bar`);
        if (tier === "low") continue;
        for (const pulse of pulses)
          assert.ok(steps.has(pulse), `${where}: nothing on pulse ${pulse / 6 + 1}`);
        if (tier !== "high") continue;
        hot++;
        for (const pulse of pulses)
          assert.ok(steps.has(pulse + 4), `${where}: no pickup at ${pulse + 4}`);
      }
    }
    assert.ok(quiet > enough(200), `only ${quiet} quiet bars`);
    if (LIBRARY.some((chart) => chart.meter === "12/8"))
      assert.ok(
        (compound.get("12/8") ?? 0) > 200 && hot > 50,
        `only ${compound.get("12/8") ?? 0} bars of twelve, ${hot} hot`,
      );
    if (LIBRARY.some((chart) => chart.meter === "6/8"))
      assert.ok((compound.get("6/8") ?? 0) > 100, `only ${compound.get("6/8") ?? 0} bars of six`);
  },
);

// ── neo-soul ────────────────────────────────────────────────────────────────

test(
  "neo-soul: in six and twelve the bass plays its line, not the pulse: in a bar of one chord it is struck on the One, it plays a note of its own between the pulses (on an eighth: a late note, a re-strike or a pickup), and it never strikes every pulse, so the kick has room",
  only("neosoul"),
  () => {
    const neosoul = STYLES.find((style) => style.id === "neosoul")!;
    const compound = (jam: { chart: { meter: string } }) =>
      jam.chart.meter === "12/8" || jam.chart.meter === "6/8";
    const played = [
      ...takes((jam) => jam.style.id === "neosoul" && compound(jam)),
      ...heldTakes(neosoul, "12/8"),
      ...heldTakes(neosoul, "6/8"),
    ];
    let bars = 0;
    for (const { chart, options, take } of played) {
      const bass = notesOf(take, "bass");
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.seats.bass === null || bar.ending) continue;
        if (bar.spans.length !== 1 || bar.spans[0]!.chord === null) continue;
        bars++;
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        const end = bar.start + bar.ticks;
        // In sixteenths: a pulse is six, its eighths at 0, 2 and 4 into it.
        const steps = new Set(
          bass
            .filter((note) => note.tick >= bar.start && note.tick < end)
            .map((note) => (note.tick - bar.start) / (PPQ / 4)),
        );
        const pulses = Array.from({ length: Math.round(bar.ticks / (PPQ * 1.5)) }, (_, i) => i * 6);
        assert.ok(steps.has(0), `${where}: nothing on the One`);
        assert.ok(
          [...steps].some((step) => step % 2 === 0 && step % 6 !== 0),
          `${where}: only the pulses (${[...steps].join(" ")})`,
        );
        assert.ok(
          !pulses.every((pulse) => steps.has(pulse)),
          `${where}: every pulse struck (${[...steps].join(" ")})`,
        );
      }
    }
    if (LIBRARY.some((chart) => compound({ chart })))
      assert.ok(bars > 200, `only ${bars} bars of six and twelve`);
  },
);

// ── disco ───────────────────────────────────────────────────────────────────

test(
  "disco: in six and twelve the bass pumps with the floor: every note is on an eighth and every pulse is struck, with the kick; quiet it plays nothing between the pulses but a pickup on the bar's last eighth; from the working level up it strikes a pulse's last eighth in every bar, the octave over the pulse's note where it pumps, and below the hot level never the triplet's middle eighth",
  only("disco"),
  () => {
    const disco = STYLES.find((style) => style.id === "disco")!;
    const compound = (jam: { chart: { meter: string } }) =>
      jam.chart.meter === "12/8" || jam.chart.meter === "6/8";
    const played = [
      ...takes((jam) => jam.style.id === "disco" && compound(jam)),
      ...heldTakes(disco, "12/8"),
      ...heldTakes(disco, "6/8"),
    ];
    let bars = 0;
    let octaves = 0;
    for (const { chart, options, take } of played) {
      const bass = notesOf(take, "bass");
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.seats.bass === null || bar.ending) continue;
        if (bar.spans.some((span) => span.chord === null)) continue;
        bars++;
        const tier = tierOf(bar.seats.bass);
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        const end = bar.start + bar.ticks;
        const notes = bass.filter((note) => note.tick >= bar.start && note.tick < end);
        // In sixteenths: a pulse is six, its eighths at 0, 2 and 4 into it.
        const at = new Map(notes.map((note) => [(note.tick - bar.start) / (PPQ / 4), note.pitch]));
        const steps = Math.round(bar.ticks / (PPQ / 4));
        for (const step of at.keys()) assert.equal(step % 2, 0, `${where}: between the eighths`);
        for (let pulse = 0; pulse < steps; pulse += 6) {
          assert.ok(at.has(pulse), `${where}: nothing on the pulse at ${pulse}`);
          if (at.get(pulse + 4) === at.get(pulse)! + 12) octaves++;
          if (tier !== "high")
            assert.ok(!at.has(pulse + 2), `${where}: the middle eighth of the pulse at ${pulse}`);
        }
        const between = [...at.keys()].filter((step) => step % 6 !== 0);
        if (tier === "low") {
          assert.ok(
            between.every((step) => step === steps - 2),
            `${where}: quiet, and ${between.join(" ")} between the pulses`,
          );
        } else {
          assert.ok(
            between.some((step) => step % 6 === 4),
            `${where}: only the pulses (${[...at.keys()].join(" ")})`,
          );
        }
      }
    }
    if (LIBRARY.some((chart) => compound({ chart }))) {
      assert.ok(bars > 200, `only ${bars} bars of six and twelve`);
      assert.ok(octaves > bars / 2, `only ${octaves} octaves pumped in ${bars} bars`);
    }
  },
);

// ── an upright in six ───────────────────────────────────────────────────────

test(
  "acoustic: in six the upright is in two, and in twelve it is four's root and fifth said in pulses: every note on a pulse or a pulse's last eighth (never its middle eighth), no more than four in a bar of six or five in a bar of twelve; the chord's bass note on the first pulse; when the band is quiet nothing else in six but a chord arriving, and in twelve nothing else but a chord arriving and the third pulse (the chord's fifth or its bass note); where the root lies a seventh over the next one, the step down into it on the last pulse; and from the working level the second half's first pulse (the second pulse in six, the third in twelve) is always played, as the chord's fifth or its bass note, or a step into the next bass note",
  only("acoustic"),
  () => {
    const counted = new Map<string, number>();
    const acoustic = STYLES.find((style) => style.id === "acoustic")!;
    const compound = (meter: string) => meter === "6/8" || meter === "12/8";
    const played = [
      ...takes((jam) => jam.style.id === "acoustic" && compound(jam.chart.meter)).map(
        ({ chart, options, take }) => ({ where: `${chart.file} seed ${options.seed}`, take }),
      ),
      // Each chart in six and twelve held at each level (acoustic's own on a push, every one on
      // the full run).
      ...[...heldTakes(acoustic, "6/8"), ...heldTakes(acoustic, "12/8")].map(
        ({ chart, options, take }) => ({
          where: `${chart.file} at ${options.energy} seed ${options.seed}`,
          take,
        }),
      ),
    ];
    const PULSE = PPQ * 1.5;
    for (const { where: of, take } of played) {
      const bass = notesOf(take, "bass");
      const harmony = arrivals(take.plan);
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.ending || bar.seats.bass === null) continue;
        if (bar.spans.some((span) => span.chord === null)) continue;
        const twelve = bar.meter.beats === 12 && bar.meter.unit === 8;
        if (!twelve && !(bar.meter.beats === 6 && bar.meter.unit === 8)) continue;
        const end = bar.start + bar.ticks;
        const half = bar.ticks / 2;
        const last = bar.ticks - PULSE;
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
          assert.notEqual(tick % PULSE, PPQ / 2, `${where}: a note on a pulse's middle eighth`);
        }
        assert.ok(own.length <= (twelve ? 5 : 4), `${where}: ${own.length} notes in a bar`);
        const first = own.find((note) => note.tick === bar.start);
        assert.ok(first, `${where}: nothing on the first pulse`);
        assert.equal(first.pitch % 12, bassOf(sounding(bar.start)), `${where}: the One`);
        const next = harmony.find((arrival) => arrival.tick >= end && arrival.chord);
        const into = next?.chord ? bassOf(next.chord) : -1;
        const stepsInto = (pitch: number) =>
          into >= 0 && [1, 2, 10, 11].includes(((pitch % 12) - into + 12) % 12);
        const fifthOrBass = (note: (typeof own)[number]) => {
          const chord = sounding(note.tick);
          const pc = note.pitch % 12;
          return pc === (pitchClass(chord.root) + 7) % 12 || pc === bassOf(chord);
        };
        const tier = tierOf(bar.seats.bass);
        const key = `${bar.meter.beats}/8 ${tier}`;
        counted.set(key, (counted.get(key) ?? 0) + 1);
        if (tier === "low") {
          for (const note of own) {
            const tick = note.tick - bar.start;
            assert.ok(
              tick === 0 ||
                landings.includes(tick) ||
                (twelve && tick === half && fifthOrBass(note)) ||
                (tick === last && stepsInto(note.pitch)),
              `${where}: quiet, a note at ${tick}`,
            );
          }
          continue;
        }
        const second = own.find((note) => note.tick === bar.start + half);
        assert.ok(second, `${where}: nothing at ${half} at the ${tier} level`);
        assert.ok(
          fifthOrBass(second) || stepsInto(second.pitch),
          `${where}: ${second.pitch} at ${half} over ${sounding(second.tick).text}`,
        );
      }
    }
    for (const meter of ["6/8", "12/8"]) {
      if (!LIBRARY.some((chart) => chart.meter === meter && chart.file.startsWith("acoustic-")))
        continue;
      const n = (tier: string) => counted.get(`${meter} ${tier}`) ?? 0;
      assert.ok(
        n("low") > 20 && n("mid") > enough(300) && n("high") > enough(300),
        `${meter}: only ${n("low")} quiet bars, ${n("mid")} working, ${n("high")} hot`,
      );
    }
  },
);

// ── a riff ──────────────────────────────────────────────────────────────────

const funk = STYLES.find((style) => style.id === "funk");
/** Funk where it plays its own parts, and funk in six and in twelve held at each of its levels. */
const funkPlayed = () => [
  ...takes((jam) => jam.style.id === "funk" && written(jam)),
  ...(funk
    ? [...heldTakes(funk, "6/8", false, true), ...heldTakes(funk, "12/8", false, true)]
    : []),
];

test(
  "funk: the bass is on the One and under the kick: a sounded note on beat 1 of every bar that has a chord there, a note or a dead note wherever the bass drum is played, every note on the sixteenths (in six and twelve on the eighths), none ringing past two and a half sixteenths, and a dead note never on the One, on a change, or when the band is quiet",
  only("funk"),
  () => {
    let bars = 0;
    let kicks = 0;
    let dead = 0;
    let compound = 0;
    for (const { chart, options, take } of funkPlayed()) {
      const bass = notesOf(take, "bass");
      const sounded = new Set(
        bass.filter((note) => note.voice !== DEAD_VOICE).map((note) => note.tick),
      );
      const struck = new Set(bass.map((note) => note.tick));
      const changes = new Set(arrivals(take.plan).map((arrival) => arrival.tick));
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.seats.bass === null || bar.ending) continue;
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        if (bar.spans[0]?.chord && bar.spans[0].start === 0) {
          bars++;
          if (isCompound(bar.meter)) compound++;
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
          `${chart.file} ${JSON.stringify(options)} bar ${bar.index} tick ${kick.tick - bar.start}: a kick (${kick.velocity}) with no bass under it`,
        );
      }
      for (const note of bass) {
        const bar = take.plan.bars.findLast((candidate) => candidate.start <= note.tick)!;
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        const grid = isCompound(bar.meter) ? PPQ / 2 : PPQ / 4;
        assert.equal(
          (note.tick - bar.start) % grid,
          0,
          `${where}: off the grid at ${note.tick - bar.start}`,
        );
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
    if (LIBRARY.some((chart) => chart.meter === "6/8" || chart.meter === "12/8"))
      assert.ok(compound > 100, `only ${compound} bars of six and twelve`);
  },
);

test(
  "funk: the riff is the section's: in one time through a section at one level, every bar opens on the same rhythm for the first half of the bar (its first two beats; in twelve its first two pulses, in six its first), unless the chord changes inside it",
  only("funk"),
  () => {
    let compared = 0;
    for (const { chart, options, take } of funkPlayed()) {
      const bass = notesOf(take, "bass");
      const harmony = arrivals(take.plan);
      const riffs = new Map<string, string>();
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.seats.bass === null || bar.ending) continue;
        if (bar.spans.some((span) => span.chord === null)) continue;
        const half = bar.start + bar.ticks / 2;
        const inside = harmony.some((arrival) => arrival.tick > bar.start && arrival.tick < half);
        if (inside) continue;
        const rhythm = bass
          .filter((note) => note.tick >= bar.start && note.tick < half)
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
            `${chart.file} ${JSON.stringify(options)} bar ${bar.index}: another riff`,
          );
        }
      }
    }
    assert.ok(compared > enough(3000), `only ${compared} bars compared`);
  },
);

test(
  "funk: in six and twelve the bass plays the section's riff, not the kick's roots: from the working level up every bar with one chord has more in it than roots (an octave pop, the fifth, the seventh or a dead note), and quiet it is roots alone, but for the note on the last eighth, which may lead into the next chord",
  only("funk"),
  () => {
    let working = 0;
    let quiet = 0;
    for (const { chart, options, take } of funkPlayed()) {
      if (chart.meter !== "6/8" && chart.meter !== "12/8") continue;
      const bass = notesOf(take, "bass");
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.seats.bass === null || bar.ending || bar.spans.length !== 1)
          continue;
        const chord = bar.spans[0]!.chord;
        if (!chord || !isCompound(bar.meter)) continue;
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        const root = pitchClass(chord.bass ?? chord.root);
        // The last eighth may lead into the next chord by step, at any level (BA-07): quiet,
        // it is the one note that need not be a root. From the working level up it counts
        // with the rest: a bar of six has few notes, and where the riff's one pop or fifth
        // sat on the last eighth and became the lead-in, the lead-in is what the bar has
        // beyond its roots.
        const quietBar = tierOf(bar.seats.bass) === "low";
        const notes = bass.filter(
          (n) => n.tick >= bar.start && n.tick < bar.start + bar.ticks - (quietBar ? PPQ / 2 : 0),
        );
        const lowest = Math.min(...notes.map((n) => n.pitch));
        const more = notes.some(
          (n) => n.voice === DEAD_VOICE || n.pitch % 12 !== root || n.pitch > lowest,
        );
        if (quietBar) {
          quiet++;
          assert.ok(!more, `${where}: quiet, and more than roots`);
        } else {
          working++;
          assert.ok(more, `${where}: roots alone at ${bar.seats.bass.toFixed(2)}`);
        }
      }
    }
    if (LIBRARY.some((chart) => chart.meter === "6/8" || chart.meter === "12/8"))
      assert.ok(working > 100 && quiet > 50, `only ${working} bars working and ${quiet} quiet`);
  },
);

// ── a reggae riff in six and twelve ─────────────────────────────────────────

test(
  "reggae: in six and twelve the bass plays the section's riff, with holes in it, and not the pulses: every note starts on an eighth; from the working level up every bar of one chord has a note between the pulses; and in twelve no bar of one chord strikes all four pulses, but where the drummer's kick takes the One and the bass goes with it (ST-reggae-12, ST-reggae-13; a change is stated where it lands, ST-reggae-14)",
  only("reggae"),
  () => {
    const reggae = STYLES.find((style) => style.id === "reggae")!;
    const played = [
      ...takes((jam) => jam.style.id === "reggae" && written(jam)),
      ...heldTakes(reggae, "6/8", false, true),
      ...heldTakes(reggae, "12/8", false, true),
    ];
    let working = 0;
    let twelve = 0;
    for (const { chart, options, take } of played) {
      if (chart.meter !== "6/8" && chart.meter !== "12/8") continue;
      const bass = notesOf(take, "bass");
      const kicks = new Set(
        notesOf(take, "drums")
          .filter((note) => note.voice === "kick")
          .map((note) => note.tick),
      );
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.ending || bar.seats.bass === null) continue;
        if (!isCompound(bar.meter)) continue;
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        const ticks = bass
          .filter((note) => note.tick >= bar.start && note.tick < bar.start + bar.ticks)
          .map((note) => note.tick - bar.start);
        for (const tick of ticks) assert.equal(tick % (PPQ / 2), 0, `${where}: a note at ${tick}`);
        const pulses = pulseStarts(bar.meter);
        const oneChord = bar.spans.length === 1 && bar.spans[0]!.chord !== null;
        if (oneChord && tierOf(bar.seats.bass) !== "low") {
          working++;
          assert.ok(
            ticks.some((tick) => !pulses.includes(tick)),
            `${where}: only the pulses (${ticks})`,
          );
        }
        if (oneChord && pulses.length === 4 && !kicks.has(bar.start)) {
          twelve++;
          assert.ok(
            pulses.some((tick) => !ticks.includes(tick)),
            `${where}: every pulse struck (${ticks})`,
          );
        }
      }
    }
    if (ownCharts(reggae).some((chart) => chart.meter === "6/8" || chart.meter === "12/8"))
      assert.ok(working > 200 && twelve > 200, `only ${working} working bars, ${twelve} of twelve`);
  },
);
