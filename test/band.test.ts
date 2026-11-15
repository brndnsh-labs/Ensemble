// Musical properties of the band: determinism, MIDI, the planner, blues, and the drummer
// (the bass line is in bass.test.ts). See docs/TESTING.md, kind 2. Each test names its
// rule; none of them knows how the engine is built.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Plan, PlanBar, Take } from "@ensemble/engine";
import {
  PPQ,
  parse,
  pitchClass,
  plan,
  render,
  tierOf,
  toMidi,
  validateStyle,
} from "@ensemble/engine";
import { styleIds } from "@ensemble/styles";
import { corpus } from "./corpus.ts";
import { blues, POCKET } from "./reading.ts";
import { FULL, LIBRARY, notesOf, only, ownCharts, readSmf, SEEDS, STYLES, takes } from "./takes.ts";

test("every style that ships is sound data", () => {
  for (const style of STYLES) assert.deepEqual(validateStyle(style), [], style.id);
});

test("the same chart, style, options, and seed give the identical performance, down to the MIDI bytes", () => {
  // One seed in three is played again: enough to meet every kind of take on every chart
  // twice. On a push, one take in three of those.
  const firsts = takes((jam) => Number(jam.options.seed) % 3 === 1);
  for (const { style, chart, options, take } of firsts.filter((_, i) => FULL || i % 3 === 0)) {
    const again = render(chart.text, style, options);
    assert.deepEqual(again.events, take.events, `${chart.file} seed ${options.seed}`);
    assert.deepEqual(
      toMidi(again.plan, again.events, style),
      toMidi(take.plan, take.events, style),
    );
  }
});

test("a different seed is a different take", () => {
  for (const style of STYLES) {
    for (const chart of ownCharts(style)) {
      const performances = SEEDS.map((seed) =>
        JSON.stringify(render(chart.text, style, { mode: "jam", passes: 3, seed }).events),
      );
      assert.equal(new Set(performances).size, SEEDS.length, chart.file);
    }
  }
});

test("a timed jam is a whole number of passes, the number that lands closest to the time asked for, and at least one", () => {
  for (const style of STYLES) {
    for (const chart of LIBRARY) {
      // The roadmap alone answers this: nobody needs to play it.
      const written = parse(chart.text).chart;
      for (const minutes of [0.2, 1, 3, 7]) {
        const lengthWith = (passes: number) =>
          musicSeconds(plan(written, style, { mode: "jam", passes }));
        const take = { plan: plan(written, style, { mode: "jam", minutes }) };
        const passes = take.plan.passes;
        assert.ok(Number.isInteger(passes) && passes >= 1, `${chart.file}: ${passes} passes`);
        const miss = (n: number) => Math.abs(lengthWith(n) - minutes * 60);
        assert.ok(
          miss(passes) <= miss(passes + 1) + 1e-6,
          `${chart.file} ${minutes} min: one more`,
        );
        if (passes > 1) {
          assert.ok(
            miss(passes) <= miss(passes - 1) + 1e-6,
            `${chart.file} ${minutes} min: one fewer`,
          );
        }
        // Never cut mid-form: every pass is the whole body.
        const body = take.plan.bars.filter(
          (bar) => bar.kind === "music" && bar.section.role === "body",
        );
        const perPass = body.filter((bar) => bar.pass === 0).length;
        assert.equal(body.length, perPass * passes, `${chart.file}: whole passes`);
      }
    }
  }
});

test("a jam that ends lands on the tonic: the last chord is rooted on the key, and the bass's last note is that root", () => {
  for (const { chart, options, take } of takes((jam) => !jam.options.open)) {
    const last = take.plan.bars.findLast((bar) => bar.kind === "music")!;
    assert.ok(last.ending, `${chart.file}: the last bar is an ending`);
    const final = last.spans.findLast((span) => span.chord !== null)?.chord;
    assert.ok(final, `${chart.file}: the ending has a chord`);
    assert.equal(pitchClass(final.root), pitchClass(last.key.tonic), `${chart.file}: ends at home`);
    assert.equal(final.bass, null, `${chart.file}: the tonic is in the bass`);
    const bass = notesOf(take, "bass").at(-1);
    if (bass) {
      assert.equal(
        bass.pitch % 12,
        pitchClass(last.key.tonic),
        `${chart.file} seed ${options.seed}`,
      );
    }
  }
});

test("a written ending is played as written: the band stops on the chart's last chord, even when it is not home", () => {
  const text = "key: A\n[A]\n| A7 | D7 | A7 | E7 |\n[Outro]\n| A7 | D7 | A7 | E7#9 |";
  for (const style of STYLES) {
    for (const seed of SEEDS) {
      const take = render(text, style, { mode: "jam", passes: 2, seed });
      const last = take.plan.bars.findLast((bar) => bar.kind === "music")!;
      const final = last.spans.findLast((span) => span.chord !== null)?.chord;
      assert.equal(final?.text, "E7#9", `seed ${seed}: the plan ends on the written chord`);
      assert.equal(notesOf(take, "bass").at(-1)!.pitch % 12, 4, `seed ${seed}: the bass ends on E`);
    }
  }
});

test("every note starts inside the performance and nothing rings past its end", () => {
  for (const { chart, options, take } of takes()) {
    for (const note of notesOf(take)) {
      const sounds = note.tick + note.offset;
      assert.ok(
        note.tick >= 0 && note.tick < take.plan.ticks,
        `${chart.file}: a note outside the plan`,
      );
      assert.ok(sounds >= -POCKET, `${chart.file}: a note before the start`);
      assert.ok(note.duration >= 1, `${chart.file}: a note with no length`);
      if (!options.open) {
        assert.ok(sounds + note.duration <= take.plan.ticks, `${chart.file}: rings past the end`);
      }
    }
  }
});

test("making an open jam one pass longer changes nothing that was already played", () => {
  for (const style of STYLES) {
    for (const [c, chart] of ownCharts(style).entries()) {
      // On a push a chart is played on one seed, the charts taking the seeds by turns.
      for (const seed of SEEDS.slice(0, 4).filter((s) => FULL || (s + c) % 2 === 0)) {
        // Each chart at each length, on two seeds or one by turns.
        for (const passes of [1, 2, 4].filter((_, i) => (i + seed + (c >> 1)) % 2 === 0)) {
          const jam = (n: number) =>
            // Half with the soloist asked for: its solo may not depend on the jam's length.
            render(chart.text, style, {
              mode: "jam",
              open: true,
              passes: n,
              seed,
              solo: seed % 2 === 0,
            });
          const shorter = jam(passes);
          const longer = jam(passes + 1);
          const before = (take: Take) =>
            take.events.filter((event) => event.tick < shorter.plan.ticks);
          assert.deepEqual(
            before(longer),
            shorter.events,
            `${chart.file} seed ${seed} at ${passes}`,
          );
        }
      }
    }
  }
});

test("a take with a count-in is the same music as one without, a bar later", () => {
  for (const style of STYLES) {
    for (const chart of ownCharts(style)) {
      const jam = (countIn: boolean) =>
        render(chart.text, style, { mode: "jam", passes: 2, seed: 5, countIn, solo: true });
      const counted = jam(true);
      const bare = jam(false);
      const shift = counted.plan.bars[0]!.ticks;
      const music = notesOf(counted)
        .filter((note) => note.tick >= shift)
        .map((note) => ({ ...note, tick: note.tick - shift }));
      assert.deepEqual(music, notesOf(bare), chart.file);
      const sticks = notesOf(counted).filter((note) => note.tick < shift);
      assert.ok(
        sticks.length > 0 && sticks.every((note) => note.seat === "drums"),
        "the count is sticks alone",
      );
    }
  }
});

test("a chart with mistakes in it still plays", () => {
  for (const style of STYLES) {
    // The corpus is a parser's corpus; what a band adds is that it can play whatever
    // parsed. On a push each style plays a third of it, a different third each.
    const turn = styleIds().indexOf(style.id) % 3;
    const broken = [
      ...corpus.filter((_, i) => FULL || i % 3 === turn).map((row) => row.text),
      "",
      "\n\n",
      "| | |",
      "|: C | G",
      "key: H\n| Zzz | % | . |",
      "[A]\n[B]\n[A]",
      "title: only a header",
      "| C | G |\n--- arrangement\nnonsense",
      "\u0000\u{1F3B8} | C",
    ];
    for (const text of broken) {
      const take = render(text, style, { mode: "jam", passes: 1, seed: 1 });
      const hasChords = take.plan.bars.some((bar) => bar.spans.some((span) => span.chord !== null));
      if (hasChords) {
        assert.ok(notesOf(take, "bass").length > 0, `the bass plays: ${JSON.stringify(text)}`);
        assert.ok(notesOf(take, "drums").length > 0, `the drums play: ${JSON.stringify(text)}`);
      }
      readSmf(toMidi(take.plan, take.events, style));
    }
  }
});

test("every take is a valid MIDI file: one track per playing seat after the tempo track, drums on channel 10", () => {
  for (const { style, chart, take } of takes()) {
    const file = readSmf(toMidi(take.plan, take.events, style));
    assert.equal(file.format, 1, chart.file);
    assert.equal(file.ppq, PPQ);
    const names = file.tracks.map((track) => track.name);
    assert.deepEqual(names.slice(0, 3), ["Ensemble", "Drums", "Bass"], chart.file);
    assert.equal(file.tracks[0]!.tempos.length, 1, "one tempo: the band is metronomic");
    assert.equal(file.tracks[0]!.tempos[0], take.plan.tempo);
    const drums = file.tracks[1]!;
    assert.ok(drums.channels.size === 1 && drums.channels.has(9), "drums on channel 10");
    for (const track of file.tracks.slice(1)) {
      assert.equal(track.noteOns, track.noteOffs, `${track.name}: every note ends`);
      assert.ok(track.noteOns > 0);
    }
  }
});

test("a seat that is left out plays nothing, and the band still counts in", () => {
  for (const style of STYLES) {
    const chart = LIBRARY[0]!;
    const take = render(chart.text, style, {
      mode: "jam",
      passes: 2,
      seed: 2,
      without: ["drums"],
    });
    const drums = notesOf(take, "drums");
    const countIn = take.plan.bars[0]!;
    assert.ok(drums.length > 0, "the count-in is there");
    assert.ok(
      drums.every((note) => note.tick < countIn.ticks),
      "and nothing after it",
    );
    assert.ok(notesOf(take, "bass").length > 0);
  }
});

test("under a rest nobody pitched plays", () => {
  const text = "key: A\n| A7 | D7 | A7 . NC . | NC | E7 | D7 | A7 | E7 |";
  for (const style of STYLES) {
    for (const seed of SEEDS) {
      const take = render(text, style, { mode: "jam", passes: 3, seed, solo: true });
      for (const bar of take.plan.bars) {
        for (const span of bar.spans) {
          if (span.chord !== null || bar.kind !== "music") continue;
          const from = bar.start + span.start;
          const struck = notesOf(take).filter(
            (note) =>
              note.seat !== "drums" && note.tick >= from && note.tick < from + span.duration,
          );
          assert.equal(
            struck.length,
            0,
            `seed ${seed}: a pitched note under N.C. in bar ${bar.index}`,
          );
        }
      }
    }
  }
});

test("the bass stays on the instrument: nothing below the open E, nothing above A3, and one note at a time", () => {
  for (const { chart, options, take } of takes()) {
    const bass = notesOf(take, "bass");
    for (const note of bass) {
      assert.ok(
        note.pitch >= 28 && note.pitch <= 57,
        `${chart.file} seed ${options.seed}: ${note.pitch}`,
      );
    }
    for (let i = 1; i < bass.length; i++) {
      const previous = bass[i - 1]!;
      const overlap =
        previous.tick + previous.offset + previous.duration - (bass[i]!.tick + bass[i]!.offset);
      assert.ok(overlap <= POCKET, `${chart.file} seed ${options.seed}: two bass notes at once`);
    }
  }
});

test("where a chord is written the bass plays a tone of that chord, and at a change of chord it is the chord's bass note", () => {
  for (const { chart, options, take } of takes()) {
    const bass = notesOf(take, "bass");
    let previous = "";
    for (const bar of take.plan.bars) {
      if (bar.kind !== "music") continue;
      for (const span of bar.spans) {
        const chord = span.chord;
        if (!chord || span.tied) {
          if (!span.tied) previous = "";
          continue;
        }
        const at = bar.start + span.start;
        const struck = bass.find((note) => note.tick === at);
        const where = `${chart.file} seed ${options.seed} bar ${bar.index}`;
        assert.ok(struck, `${where}: no bass note on the arrival`);
        const name = `${pitchClass(chord.root)}:${chord.quality.base}:${chord.bass ? pitchClass(chord.bass) : ""}`;
        const root = pitchClass(chord.bass ?? chord.root);
        if (name !== previous || bar.ending) {
          assert.equal(struck.pitch % 12, root, `${where}: the change is not stated`);
        }
        previous = name;
      }
    }
  }
});

test("a timed jam has a shape: it does not start at its peak, and it ends above where it started", () => {
  for (const style of STYLES) {
    for (const passes of [3, 4, 6, 9, 14]) {
      const take = render(LIBRARY[0]!.text, style, { mode: "jam", passes, seed: 1 });
      const body = take.plan.bars.filter(
        (bar) => bar.kind === "music" && bar.section.role === "body",
      );
      const mean = (bars: readonly PlanBar[]) =>
        bars.reduce((sum, bar) => sum + bar.energy, 0) / bars.length;
      const byPass = Array.from({ length: passes }, (_, pass) =>
        mean(body.filter((bar) => bar.pass === pass)),
      );
      const peak = byPass.indexOf(Math.max(...byPass));
      assert.ok(peak > 0, `${passes} passes: peaks on pass ${peak + 1}`);
      assert.ok(
        body.at(-1)!.energy > byPass[0]!,
        `${passes} passes: the last bar is above the first pass`,
      );
      // With room for it, there is a breath between the peak and the last pass.
      const between = byPass.slice(peak + 1, -1);
      if (passes >= 4) {
        assert.ok(
          between.some((energy) => energy < byPass[peak]!),
          `${passes} passes: no breath after the peak`,
        );
      }
    }
  }
});

test("a level the player sets is held: every pass plays at that level, with no arc and no lift", () => {
  for (const style of STYLES) {
    for (const energy of [0.2, 0.5, 0.9]) {
      const take = render(LIBRARY[0]!.text, style, { mode: "jam", passes: 5, seed: 1, energy });
      const body = take.plan.bars.filter(
        (bar) => bar.kind === "music" && bar.section.role === "body",
      );
      const firstPass = body.filter((bar) => bar.pass === 0).map((bar) => bar.energy);
      for (let pass = 1; pass < 5; pass++) {
        const energies = body.filter((bar) => bar.pass === pass).map((bar) => bar.energy);
        assert.deepEqual(energies, firstPass, `pass ${pass + 1} at ${energy}`);
      }
      assert.ok(
        firstPass.every((e) => Math.abs(e - energy) < 0.15),
        `the level stays near ${energy}`,
      );
    }
  }
});

// ── blues ───────────────────────────────────────────────────────────────────

test("blues: the offbeat eighth is the last note of a triplet, for everyone", only("blues"), () => {
  for (const { chart, take } of takes(blues)) {
    for (const note of notesOf(take)) {
      const inBeat = note.tick % PPQ;
      if (inBeat !== PPQ / 2) continue;
      // Written on the "and", it sounds two thirds of the way through the beat.
      const lands = inBeat + note.offset;
      assert.ok(Math.abs(lands - (PPQ * 2) / 3) <= POCKET, `${chart.file}: an "and" at ${lands}`);
    }
  }
});

test(
  "blues: the time is kick on 1 and 3 and a backbeat on 2 and 4, in every bar the drummer plays time",
  only("blues"),
  () => {
    for (const { chart, options, take } of takes(blues)) {
      const drums = notesOf(take, "drums");
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.ending) continue;
        const at = (beat: number, ...voices: string[]) =>
          drums.some(
            (note) => note.tick === bar.start + beat * PPQ && voices.includes(note.voice ?? ""),
          );
        const where = `${chart.file} seed ${options.seed} bar ${bar.index}`;
        assert.ok(at(0, "kick"), `${where}: no kick on 1`);
        assert.ok(at(2, "kick"), `${where}: no kick on 3`);
        assert.ok(at(1, "snare", "crossStick"), `${where}: no backbeat on 2`);
        // A long fill takes the hands off the backbeat on 4; a short one never does.
        if (!bar.fill) assert.ok(at(3, "snare", "crossStick"), `${where}: no backbeat on 4`);
      }
    }
  },
);

test(
  "blues: nothing is ever played on the last sixteenth of a beat, which would flam against the triplet",
  only("blues"),
  () => {
    for (const { chart, take } of takes(blues)) {
      for (const note of notesOf(take)) {
        assert.notEqual(note.tick % PPQ, (PPQ * 3) / 4, `${chart.file}: ${note.seat} on an "a"`);
      }
    }
  },
);

test("an arrival is one crash with a kick under it, and the cymbal that keeps time gives way to it", () => {
  for (const { chart, options, take } of takes()) {
    const drums = notesOf(take, "drums");
    for (const bar of take.plan.bars) {
      if (bar.kind !== "music" || bar.ending) continue;
      const onOne = drums.filter((note) => note.tick === bar.start);
      const voices = onOne.map((note) => note.voice);
      const where = `${chart.file} seed ${options.seed} bar ${bar.index}`;
      const crashes = voices.filter((voice) => voice === "crash").length;
      assert.equal(crashes, bar.crash ? 1 : 0, `${where}: crashes on 1`);
      if (bar.crash) {
        assert.ok(voices.includes("kick"), `${where}: a crash with no kick`);
        assert.ok(
          !voices.includes("closedHat") && !voices.includes("ride"),
          `${where}: two cymbals in one hand`,
        );
      }
    }
  }
});

// ── the planner and the drummer, on charts the library does not have ────────

test("a last bar that is all rest is silence: nobody plays in it, and the drummer does not roll into it", () => {
  const charts = [
    "key: A\n| A7 | D7 | E7 | NC |",
    "key: A\n| A7 | D7 | A7 | A7 | D7 | D7 | E7 | NC |",
  ];
  for (const style of STYLES) {
    for (const text of charts) {
      for (const seed of SEEDS) {
        const take = render(text, style, { mode: "jam", passes: 2, seed });
        const music = take.plan.bars.filter((bar) => bar.kind === "music");
        const last = music.at(-1)!;
        const before = music.at(-2)!;
        const played = notesOf(take).filter((note) => note.tick >= last.start);
        assert.equal(played.length, 0, `seed ${seed}: ${played.length} notes in the silent bar`);
        assert.equal(before.fill, null, `seed ${seed}: a fill into silence`);
      }
    }
  }
});

test("at full energy the band still has accents: almost nothing is pinned to the top of the range", () => {
  for (const style of STYLES) {
    for (const chart of ownCharts(style)) {
      const take = render(chart.text, style, { mode: "jam", passes: 2, energy: 1, seed: 1 });
      const notes = notesOf(take);
      const pinned = notes.filter((note) => note.velocity >= 127).length;
      assert.ok(
        pinned <= notes.length * 0.02,
        `${chart.file}: ${pinned} of ${notes.length} notes at 127`,
      );
    }
  }
});

test("a short vamp is played in choruses of several laps: a chorus is at least twelve bars and a whole number of laps, a phrase is never shorter than three bars and is four on a vamp of one or two, and the soloist's chorus is the band's", () => {
  const changes = ["A7", "D7", "A7", "E7", "D7", "A7", "E7"];
  for (const style of STYLES) {
    for (let lap = 1; lap <= 7; lap++) {
      const text = `key: A\n| ${changes.slice(0, lap).join(" | ")} |`;
      const roadmap = plan(parse(text).chart, style, { mode: "jam", passes: 5, solo: true });
      const body = roadmap.bars.filter((bar) => bar.kind === "music");
      const chorus = body.filter((bar) => bar.pass === 0).length;
      assert.ok(chorus >= 12, `a vamp of ${lap}: a chorus of ${chorus} bars`);
      assert.equal(chorus % lap, 0, `a vamp of ${lap}: a chorus of ${chorus} bars cuts a lap`);
      assert.equal(body.length, chorus * 5, `a vamp of ${lap}: five choruses`);
      const harmony = (bar: PlanBar) => JSON.stringify(bar.spans.map((span) => span.chord));
      let solos = 0;
      for (const [i, bar] of body.entries()) {
        const where = `a vamp of ${lap}, bar ${i + 1}`;
        assert.ok(bar.phrase.length >= 3, `${where}: a phrase of ${bar.phrase.length}`);
        if (lap <= 2) assert.equal(bar.phrase.length, 4, `${where}: phrase length`);
        assert.equal(bar.section.bars, chorus, `${where}: the chorus is the section`);
        if (i >= lap && !bar.ending) {
          assert.equal(harmony(bar), harmony(body[i - lap]!), `${where}: not the lap as written`);
        }
        const top = body[i - bar.barInSection]!;
        assert.deepEqual(bar.solo, top.solo, `${where}: the solo changes hands inside a chorus`);
        if (bar.solo) solos++;
      }
      assert.equal(solos, chorus * 3, `a vamp of ${lap}: a solo of three choruses`);
    }
  }
});

test("on a short vamp the drummer does not change cymbal every lap: the cymbal that keeps time holds for a chorus of 16 bars", () => {
  const text = "key: A\n| A7 | D7 | A7 | E7 |";
  for (const style of STYLES) {
    const perSeed = new Set<string>();
    for (const seed of SEEDS) {
      const take = render(text, style, { mode: "jam", passes: 4, energy: 0.85, seed });
      const music = take.plan.bars.filter((bar) => bar.kind === "music");
      const drums = notesOf(take, "drums");
      for (let from = 0; from < music.length; from += 16) {
        const stretch = music.slice(from, from + 16);
        const start = stretch[0]!.start;
        const end = stretch.at(-1)!.start + stretch.at(-1)!.ticks;
        const cymbals = new Set(
          drums
            .filter((note) => note.tick >= start && note.tick < end)
            .map((note) => note.voice)
            .filter((voice) => voice === "closedHat" || voice === "ride"),
        );
        assert.ok(
          cymbals.size <= 1,
          `seed ${seed}: hat and ride both within bars ${from + 1} to ${from + 16}`,
        );
        for (const cymbal of cymbals) perSeed.add(cymbal!);
      }
    }
    // Guard against passing because one cymbal was dropped altogether.
    if (style.id === "blues")
      assert.equal(perSeed.size, 2, "both hat and ride are heard somewhere");
  }
});

test("in a jam on a one-section form, the biggest fill is kept for where the band steps up a level", () => {
  const rank = (energy: number) => ["low", "mid", "high"].indexOf(tierOf(energy));
  let tops = 0;
  let plain = 0;
  for (const { chart, take } of takes((jam) => jam.options.mode === "jam")) {
    const body = take.plan.bars.filter(
      (bar) => bar.kind === "music" && bar.section.role === "body",
    );
    if (new Set(body.map((bar) => bar.section.identity)).size !== 1) continue;
    for (let i = 0; i + 1 < body.length; i++) {
      const bar = body[i]!;
      const next = body[i + 1]!;
      if (next.pass === bar.pass || next.ending) continue;
      assert.ok(bar.fill, `${chart.file}: a chorus ends without a fill`);
      const stepsUp = rank(next.energy) > rank(bar.energy);
      assert.equal(bar.fill.top, stepsUp, `${chart.file} bar ${bar.index}: top fill`);
      if (stepsUp) tops++;
      else plain++;
    }
  }
  assert.ok(tops > 0 && plain > 0, `${tops} tops and ${plain} ordinary chorus ends`);
});

function musicSeconds(roadmap: Plan): number {
  const ticks = roadmap.bars
    .filter((bar) => bar.kind === "music")
    .reduce((sum, bar) => sum + bar.ticks, 0);
  return (ticks / PPQ) * (60 / roadmap.tempo);
}
