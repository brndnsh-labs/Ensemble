// Musical properties: rules a musician would care about, checked across
// charts, seeds, and styles. See docs/TESTING.md, kind 2. Each test names its
// rule; none of them knows how the engine is built.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Plan, PlanBar, Take } from "@ensemble/engine";
import {
  arrivals,
  chordScale,
  chordTones,
  contextOf,
  PPQ,
  parse,
  pitchClass,
  plan,
  render,
  SOLO_INSTRUMENTS,
  scaleHas,
  tierOf,
  toMidi,
  validateStyle,
} from "@ensemble/engine";
import { corpus } from "./corpus.ts";
import { type Jam, LIBRARY, notesOf, readSmf, SEEDS, STYLES, stressTakes, takes } from "./takes.ts";

/** Ticks of slack for where a note sounds: the largest lean plus human placement. */
const POCKET = 40;

test("every style that ships is sound data", () => {
  for (const style of STYLES) assert.deepEqual(validateStyle(style), [], style.id);
});

test("the same chart, style, options, and seed give the identical performance, down to the MIDI bytes", () => {
  // Every other seed is played again: enough to meet every kind of take on every chart.
  for (const { style, chart, options, take } of takes(
    (jam) => Number(jam.options.seed) % 2 === 1,
  )) {
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
    for (const chart of LIBRARY) {
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
    for (const chart of LIBRARY) {
      for (const seed of SEEDS.slice(0, 4)) {
        for (const passes of [1, 2, 4]) {
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
    for (const chart of LIBRARY) {
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
    const broken = [
      ...corpus.map((row) => row.text),
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
      const take = render(text, style, { mode: "jam", passes: 2, seed: 1 });
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

const blues = (jam: Jam) => jam.style.id === "blues" && jam.chart.meter === "4/4";

test("blues: the offbeat eighth is the last note of a triplet, for everyone", () => {
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

test("blues: the time is kick on 1 and 3 and a backbeat on 2 and 4, in every bar the drummer plays time", () => {
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
});

test("blues: nothing is ever played on the last sixteenth of a beat, which would flam against the triplet", () => {
  for (const { chart, take } of takes(blues)) {
    for (const note of notesOf(take)) {
      assert.notEqual(note.tick % PPQ, (PPQ * 3) / 4, `${chart.file}: ${note.seat} on an "a"`);
    }
  }
});

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
    for (const chart of LIBRARY) {
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

test("on a short vamp the drummer does not change cymbal every lap: the cymbal that keeps time holds for 16 bars", () => {
  const text = "key: A\n| A7 | D7 | A7 | E7 |";
  for (const style of STYLES) {
    const perSeed = new Set<string>();
    for (const seed of SEEDS) {
      const take = render(text, style, { mode: "jam", passes: 16, energy: 0.85, seed });
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
    if (body[0]!.section.bars < 8) continue; // a short vamp counts its own lines
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

// ── the soloist ─────────────────────────────────────────────────────────────

test("the soloist is off unless asked for; asked for, it rests through the intro and a written ending, lays out and returns, and never solos more than three choruses in a row", () => {
  for (const style of STYLES) {
    for (const chart of LIBRARY) {
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

test("the band builds with the solo: under a solo's last chorus it is at least as loud as under its first, and louder when the solo has three", () => {
  for (const style of STYLES) {
    for (const chart of LIBRARY) {
      const written = parse(chart.text).chart;
      for (const passes of [2, 3, 4, 5, 6, 7, 8, 9]) {
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
          if (solo.chorus !== 0 || solo.of === 1) continue;
          const last = pass + solo.of - 1;
          const where = `${chart.file}, ${passes} passes, the solo from pass ${pass}`;
          assert.ok(mean(last) >= mean(pass) - 1e-9, `${where}: ${mean(pass)} then ${mean(last)}`);
          if (solo.of === 3) {
            assert.ok(mean(last) > mean(pass) + 0.02, `${where}: no build under the solo`);
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

const soloTakes = () => [...takes(), ...stressTakes()].filter((jam) => jam.options.solo === true);

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
  assert.ok(notes > 5000, `only ${notes} solo notes`);
});

test("the soloist lands the changes: a note struck where a chord arrives is a tone of that chord, and a note held across a change on a beat is a tone of the new chord", () => {
  let landings = 0;
  for (const { chart, options, take } of soloTakes()) {
    const solo = notesOf(take, "solo");
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
          note.tick + note.offset + note.duration > arrival.tick + POCKET;
        if (!struck && !held) continue;
        landings++;
        assert.ok(
          tones.has(note.pitch % 12),
          `${where}: ${note.pitch} ${struck ? "struck" : "held"}`,
        );
      }
    }
  }
  assert.ok(landings > 800, `only ${landings} landings`);
});

test("a solo breathes and keeps going: no silence inside it reaches three bars, and it has one top note, in its last chorus", () => {
  let solos = 0;
  for (const { chart, options, take } of soloTakes()) {
    for (const { bars, notes } of solosOf(take)) {
      const where = `${chart.file} seed ${options.seed}, the solo from bar ${bars[0]!.index}`;
      assert.ok(notes.length > 0, `${where}: a solo with no notes`);
      solos++;
      const barTicks = bars[0]!.ticks;
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
  assert.ok(solos > 40, `only ${solos} solos`);
});

test("a three-chorus solo builds: its last chorus has more notes than its first, in nine solos in ten", () => {
  let built = 0;
  let solos = 0;
  for (const { take } of takes((jam) => jam.options.solo === true)) {
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
  assert.ok(solos > 40, `only ${solos} three-chorus solos`);
  assert.ok(built >= solos * 0.9, `${built} of ${solos} solos built`);
});

test("a solo that runs into the ending ends with the band: its last note is struck where the final chord lands, on that chord's root, third or fifth", () => {
  let endings = 0;
  for (const { chart, options, take } of soloTakes()) {
    const last = take.plan.bars.findLast((bar) => bar.kind === "music")!;
    if (!last.ending || !last.solo) continue;
    const final = last.spans.findLast((span) => span.chord !== null)?.chord;
    const note = notesOf(take, "solo").at(-1);
    const where = `${chart.file} seed ${options.seed}`;
    assert.ok(final && note, `${where}: no last note`);
    endings++;
    assert.equal(
      note.tick,
      last.start + last.ending.at,
      `${where}: the last note is not on the final chord`,
    );
    const resting = chordTones(final.quality)
      .filter((tone) => ["root", "third", "fifth"].includes(tone.role))
      .map((tone) => (pitchClass(final.root) + tone.interval) % 12);
    assert.ok(
      resting.includes(note.pitch % 12),
      `${where}: ends on ${note.pitch} over ${final.text}`,
    );
  }
  assert.ok(endings > 40, `only ${endings} endings with the soloist`);
});

test("a horn breathes: the alto never plays eight seconds without half a second of air", () => {
  for (const style of STYLES) {
    for (const chart of LIBRARY) {
      for (const tempo of [66, 120]) {
        const take = render(chart.text, style, {
          mode: "jam",
          passes: 4,
          seed: 3,
          solo: true,
          tempo,
          soloInstrument: "alto-sax",
        });
        const perTick = 60 / tempo / PPQ;
        const notes = notesOf(take, "solo");
        assert.ok(notes.length > 0 && notes.every((note) => note.voice === "alto-sax"));
        let since = notes[0]!.tick;
        for (let i = 1; i < notes.length; i++) {
          const before = notes[i - 1]!;
          const air = (notes[i]!.tick - (before.tick + before.duration)) * perTick;
          if (air >= 0.5) since = notes[i]!.tick;
          const blown = (notes[i]!.tick + notes[i]!.duration - since) * perTick;
          assert.ok(blown <= 8.5, `${chart.file} at ${tempo}: ${blown.toFixed(1)} s on one breath`);
        }
      }
    }
  }
});

// ── the piano ───────────────────────────────────────────────────────────────

interface Strike {
  readonly tick: number;
  readonly pitches: number[];
  readonly sounds: number;
  readonly ends: number;
}

/** The comp's notes grouped into the times the hand comes down. */
function strikesOf(take: Take): Strike[] {
  const strikes: Strike[] = [];
  for (const note of notesOf(take, "chords")) {
    const last = strikes.at(-1);
    if (last && last.tick === note.tick) {
      last.pitches.push(note.pitch);
    } else {
      strikes.push({
        tick: note.tick,
        pitches: [note.pitch],
        sounds: note.tick + note.offset,
        ends: note.tick + note.offset + note.duration,
      });
    }
  }
  for (const strike of strikes) strike.pitches.sort((a, b) => a - b);
  return strikes;
}

/**
 * The chords a strike may be playing: the one written under it, and, when it is struck within
 * an eighth before a change and rings into it, the one coming (X-B-07).
 */
const harmonies = new WeakMap<Take, ReturnType<typeof arrivals>>();

/** A take's chord arrivals, worked out once. */
function harmonyOf(take: Take) {
  let harmony = harmonies.get(take);
  if (!harmony) {
    harmony = arrivals(take.plan);
    harmonies.set(take, harmony);
  }
  return harmony;
}

function chordsUnder(take: Take, strike: Strike) {
  const harmony = harmonyOf(take);
  const at = harmony.findLastIndex((arrival) => arrival.tick <= strike.tick);
  const under = [harmony[at]];
  const next = harmony[at + 1];
  if (next && next.tick - strike.tick <= PPQ / 2 && strike.ends >= next.tick - POCKET) {
    under.push(next);
  }
  return under.flatMap((arrival) =>
    arrival?.chord
      ? [{ chord: arrival.chord, scale: chordScale(arrival.chord, contextOf(harmony, arrival)) }]
      : [],
  );
}

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

test("the piano's last chord is the final chord, struck once where it lands and never early", () => {
  for (const { chart, options, take } of takes((jam) => !jam.options.open)) {
    const last = take.plan.bars.findLast((bar) => bar.kind === "music")!;
    if (!last.ending) continue;
    const landing = last.start + last.ending.at;
    const strikes = strikesOf(take);
    const where = `${chart.file} seed ${options.seed}`;
    assert.equal(
      strikes.at(-1)?.tick,
      landing,
      `${where}: the last strike is not on the final chord`,
    );
    assert.ok(strikes.at(-1)!.pitches.length >= 3, `${where}: a thin final chord`);
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
    for (const chart of LIBRARY) {
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

test("blues: the piano comps on beats and their offbeats only, and a quiet band's piano is sparser than a loud one's", () => {
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
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(perBar.low.length > 100 && perBar.high.length > 100, "both levels are heard");
  assert.ok(
    mean(perBar.low) < mean(perBar.high),
    `quiet ${mean(perBar.low).toFixed(2)} strikes a bar, loud ${mean(perBar.high).toFixed(2)}`,
  );
});

test("a section keeps its figure: every phrase opens on the same rhythm each time the section comes round at the same level", () => {
  let compared = 0;
  for (const { chart, options, take } of takes((jam) => jam.chart.meter === "4/4")) {
    const byBar = strikesByBar(take);
    const openings = new Map<string, string>();
    for (const bar of take.plan.bars) {
      if (bar.kind !== "music" || bar.ending || bar.seats.chords === null) continue;
      if (bar.phrase.bar !== 0) continue;
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

function musicSeconds(roadmap: Plan): number {
  const ticks = roadmap.bars
    .filter((bar) => bar.kind === "music")
    .reduce((sum, bar) => sum + bar.ticks, 0);
  return (ticks / PPQ) * (60 / roadmap.tempo);
}
