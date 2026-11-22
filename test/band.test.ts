// Musical properties of the band: determinism, MIDI, the planner, blues, and the drummer
// (the bass line is in bass.test.ts). See docs/TESTING.md, kind 2. Each test names its
// rule; none of them knows how the engine is built.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Plan, PlanBar, PlanOptions, StylePack, Take, TakeOptions } from "@ensemble/engine";
import {
  arrangedLines,
  BREATHE_MOST,
  breatheAmount,
  burstPhrases,
  isCompound,
  PPQ,
  parse,
  pitchClass,
  plan,
  pulseStarts,
  render,
  seconds,
  secondsAt,
  strongPulses,
  TEMPO_STEP,
  tempoRange,
  tickAt,
  tierOf,
  timedNotes,
  toMidi,
  validateStyle,
  withArrangement,
} from "@ensemble/engine";
import { styleIds } from "@ensemble/styles";
import { corpus } from "./corpus.ts";
import { bluesWritten, POCKET } from "./reading.ts";
import type { Jam } from "./takes.ts";
import {
  enough,
  FULL,
  heldTakes,
  LIBRARY,
  notesOf,
  only,
  ownCharts,
  readSmf,
  SEEDS,
  STYLES,
  soloistTakes,
  takes,
} from "./takes.ts";

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
          // Half the charts with the tempo breathing: a bar's tempo may not depend on the jam's length either.
          const breathe = c % 2 === 0;
          const jam = (n: number) =>
            // Half with the soloist asked for: its solo may not depend on the jam's length.
            render(chart.text, style, {
              mode: "jam",
              open: true,
              passes: n,
              seed,
              solo: seed % 2 === 0,
              breathe,
            });
          const shorter = jam(passes);
          const longer = jam(passes + 1);
          const where = `${chart.file} seed ${seed} at ${passes}`;
          const before = (take: Take) =>
            take.events.filter((event) => event.tick < shorter.plan.ticks);
          assert.deepEqual(before(longer), shorter.events, where);
          // The pass it was only looking ahead to is timed as it is then played.
          const known = [...shorter.plan.bars, ...shorter.plan.lookahead];
          const played = [...longer.plan.bars, ...longer.plan.lookahead];
          // Each bar's tempo is what its seconds are made of (held by the property on breathing).
          assert.deepEqual(
            played.slice(0, known.length).map((bar) => bar.quarters),
            known.map((bar) => bar.quarters),
            `${where}: the tempo of a bar already planned`,
          );
        }
      }
    }
  }
});

test("a jam told to finish plays everything before its last pass as it would have, and that pass is a last pass like any other: marked, and landed", () => {
  for (const style of STYLES) {
    for (const [c, chart] of ownCharts(style).entries()) {
      for (const seed of SEEDS.slice(0, 4).filter((s) => FULL || (s + c) % 2 === 0)) {
        // An open jam and a timed one, each told to finish on one pass or another.
        // Never on the first pass, which has nothing before it to keep.
        const turn = seed + (c >> 1);
        const cases: [PlanOptions, number][] = [
          [{ mode: "jam", open: true, passes: 3 }, 1 + (turn % 2)],
          [{ mode: "jam", passes: 6 }, 2 + (turn % 3)],
        ];
        // On a push each chart meets one of the two, by turns.
        for (const [options, endAfter] of cases.filter(
          (_, i) => FULL || (i + (c >> 1)) % 2 === 0,
        )) {
          // Half with the soloist: its solo is cut short, and the band's peak is placed by it.
          const solo = (seed + c) % 4 < 2;
          // Half the charts with the tempo breathing: the band keeps the time of what was played.
          const breathe = c % 2 === 0;
          const asPlanned = render(chart.text, style, { ...options, seed, solo, breathe });
          const told = render(chart.text, style, { ...options, seed, solo, breathe, endAfter });
          const where = `${chart.file} seed ${seed}, told on pass ${endAfter}`;

          const top = told.plan.bars.find((bar) => bar.kind === "music" && bar.pass === endAfter)!;
          // The pass markers say "1/2" once the band knows how many there are; nothing else may differ.
          const before = (take: Take) =>
            take.events.filter(
              (event) =>
                event.tick < top.start && !(event.kind === "marker" && event.marker === "pass"),
            );
          assert.deepEqual(before(told), before(asPlanned), where);
          // The band may be told at any phrase top of the pass it turns on (the app tells it where
          // it can), so the whole of that pass keeps the time it was going to be played in.
          const turned = told.plan.bars.filter(
            (bar) => bar.kind === "music" && bar.pass <= endAfter && bar.section.role === "body",
          );
          assert.deepEqual(
            turned.map((bar) => bar.quarters),
            turned.map((bar) => asPlanned.plan.bars[bar.index]!.quarters),
            `${where}: the time of the pass it turns on`,
          );

          assert.equal(told.plan.open, false, where);
          assert.equal(told.plan.passes, endAfter + 1, where);
          const music = told.plan.bars.filter((bar) => bar.kind === "music");
          for (const bar of music) assert.equal(bar.lastPass, bar.pass === endAfter, where);
          const last = music.at(-1)!;
          assert.ok(last.ending !== null || last.spans.every((s) => s.chord === null), where);
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
    // A dotted pulse can make the quarter notes a half (95 a minute in 12/8 is 142.5): the file
    // holds it as microseconds, so it is read back to within one of the figure.
    assert.ok(
      Math.abs(file.tracks[0]!.tempos[0]! - take.plan.quarters) < 1,
      `${chart.file}: ${file.tracks[0]!.tempos[0]} in the file, ${take.plan.quarters} played`,
    );
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

test("where a chord is written the bass plays a tone of that chord, and at a change of chord it is the chord's bass note: struck where the chord lands, or, at a barline in a line that keeps its hole on the One, the first note it plays under the chord", () => {
  for (const { chart, options, style, take } of takes()) {
    const bass = notesOf(take, "bass");
    let previous = "";
    for (const bar of take.plan.bars) {
      if (bar.kind !== "music") continue;
      // A bar the arrangement lays the bass out of has nothing to say; the next chord the
      // bass plays is a change for it.
      if (bar.seats.bass === null) {
        previous = "";
        continue;
      }
      for (const span of bar.spans) {
        const chord = span.chord;
        if (!chord || span.tied) {
          if (!span.tied) previous = "";
          continue;
        }
        const at = bar.start + span.start;
        // A riff with a hole on the One keeps it across a change at the barline (ST-reggae-14):
        // the chord is stated by the first note under it, wherever in its span that falls.
        const hole: boolean =
          span.start === 0 && style.bass.lines[tierOf(bar.seats.bass)].keepsHole === true;
        const struck: (typeof bass)[number] | undefined = hole
          ? bass.find((note) => note.tick >= at && note.tick < at + span.duration)
          : bass.find((note) => note.tick === at);
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
      // The roadmap alone answers this: nobody needs to play it.
      const roadmap = plan(parse(LIBRARY[0]!.text).chart, style, { mode: "jam", passes, seed: 1 });
      const body = roadmap.bars.filter(
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
      // The roadmap alone answers this too.
      const roadmap = plan(parse(LIBRARY[0]!.text).chart, style, {
        mode: "jam",
        passes: 5,
        seed: 1,
        energy,
      });
      const body = roadmap.bars.filter(
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

const SONG = `key: C

[Intro]
| C | F |
[Verse]
| C | F | G | C |
[Chorus]
| F | G | C | Am |
[Verse 2]
| C | F | G | C |
[Solo]
| Am | F | G | C |
[Chorus]
[Outro]
| F | C |
`;

test("a song is played as it is arranged: a player laid out in a section plays nothing in it, the soloist plays only where it has the lead, a section called at 4 is the band's high playing and one called at 1 its low whatever the section is named, and a player given a level of its own is at it", () => {
  const arranged = `${SONG}
--- arrangement
Intro    4 . - - .
Verse    2 - - - .
Chorus   1 - - - .
Verse 2  2 - . - .
Solo     3 - - - -
Chorus   4 - - - -
Outro    2 1 - - .
`;
  for (const style of STYLES) {
    for (const seed of SEEDS) {
      const take = render(arranged, style, { mode: "song", solo: true, seed });
      assert.deepEqual(take.diagnostics, []);
      const music = take.plan.bars.filter((bar) => bar.kind === "music");
      /** The notes a seat starts in the section played at a place in the song, from 0. */
      const played = (seat: "drums" | "bass" | "solo", section: number) =>
        notesOf(take, seat).filter((note) =>
          music.some(
            (bar) =>
              bar.section.occurrence === section &&
              note.tick >= bar.start &&
              note.tick < bar.start + bar.ticks,
          ),
        );
      assert.equal(played("drums", 0).length, 0, "the drummer is out of the intro");
      assert.ok(played("drums", 1).length > 0, "and in from the verse");
      assert.equal(played("bass", 3).length, 0, "the bass is out of the second verse");
      for (let section = 0; section < 7; section++) {
        const leads = section === 4 || section === 5;
        // A pickup into the solo is played in the later half of the bar before it.
        const own = played("solo", section).filter((note) => {
          const bar = music.findLast((other) => other.start <= note.tick)!;
          const next = take.plan.bars[bar.index + 1];
          return !(next?.solo && (note.tick - bar.start) * 2 >= bar.ticks);
        });
        assert.equal(own.length > 0, leads, `the soloist in section ${section + 1}`);
      }
      for (const bar of music) {
        const { occurrence } = bar.section;
        if (occurrence === 0) assert.equal(tierOf(bar.energy), "high", "the intro, called at 4");
        if (occurrence === 2) assert.equal(tierOf(bar.energy), "low", "a chorus called at 1");
        if (occurrence === 5) assert.equal(tierOf(bar.energy), "high", "a chorus called at 4");
        if (occurrence === 6 && !bar.ending) {
          assert.equal(
            tierOf(bar.seats.drums ?? 1),
            "low",
            "the drummer, called at 1 in the outro",
          );
          assert.equal(tierOf(bar.seats.bass ?? 0), "mid", "under a band called at 2");
        }
      }
    }

    // Nothing but `-`, and the soloist out: the song as the style plays it by itself.
    const plain = withArrangement(
      SONG,
      arrangedLines(parse(SONG).chart).map((line) => ({
        ...line,
        seats: { ...line.seats, solo: "out" as const },
      })),
    );
    assert.deepEqual(
      render(plain, style, { mode: "song", seed: 3 }).events,
      render(SONG, style, { mode: "song", seed: 3 }).events,
      "an arrangement that asks for nothing changes nothing",
    );
  }
});

// ── blues ───────────────────────────────────────────────────────────────────

test(
  'blues: the offbeat eighth is the last note of a triplet, for everyone: in four the written "and" is swung there, and in six and twelve it is the pulse\'s last eighth and is played where it is written',
  only("blues"),
  () => {
    for (const { chart, take } of takes(bluesWritten)) {
      const compound = chart.meter !== "4/4";
      for (const note of notesOf(take)) {
        if (compound) {
          // A dotted pulse is its own triplet: nothing bends it.
          assert.ok(
            Math.abs(note.offset) <= POCKET,
            `${chart.file}: an eighth moved ${note.offset}`,
          );
          continue;
        }
        const inBeat = note.tick % PPQ;
        if (inBeat !== PPQ / 2) continue;
        // Written on the "and", it sounds two thirds of the way through the beat.
        const lands = inBeat + note.offset;
        assert.ok(Math.abs(lands - (PPQ * 2) / 3) <= POCKET, `${chart.file}: an "and" at ${lands}`);
      }
    }
  },
);

test(
  "blues: the time is a kick on the bar's strong pulses and a backbeat on the pulses between them (1 and 3, 2 and 4: quarter notes in four, dotted quarters in twelve; in six the One and the second pulse), in every bar the drummer plays time; a fill of two beats may take the last backbeat, and in six, where no fill is longer than a pulse, every bar keeps its own",
  only("blues"),
  () => {
    const bars = new Map<string, number>();
    for (const { chart, options, take } of takes(bluesWritten)) {
      const drums = notesOf(take, "drums");
      for (const bar of take.plan.bars) {
        // A bar the arrangement lays the drummer out of is not a bar he plays time in.
        if (bar.kind !== "music" || bar.ending || bar.seats.drums === null) continue;
        bars.set(chart.meter, (bars.get(chart.meter) ?? 0) + 1);
        const at = (tick: number, ...voices: string[]) =>
          drums.some((note) => note.tick === bar.start + tick && voices.includes(note.voice ?? ""));
        const where = `${chart.file} seed ${options.seed} bar ${bar.index}`;
        const strong = strongPulses(bar.meter);
        const between = pulseStarts(bar.meter).filter((tick) => !strong.includes(tick));
        for (const tick of strong) assert.ok(at(tick, "kick"), `${where}: no kick at ${tick}`);
        for (const tick of between.slice(0, -1))
          assert.ok(at(tick, "snare", "crossStick"), `${where}: no backbeat at ${tick}`);
        // A long fill takes the hands off the last backbeat; a short one never does. A bar of
        // six has no room for a long one: a fill of a pulse starts on its backbeat.
        if (!bar.fill || bar.ticks < 4 * PPQ)
          assert.ok(
            at(between.at(-1)!, "snare", "crossStick"),
            `${where}: no backbeat at ${between.at(-1)}`,
          );
      }
    }
    for (const meter of ["12/8", "6/8"])
      if (LIBRARY.some((chart) => chart.meter === meter))
        assert.ok(
          (bars.get(meter) ?? 0) > enough(300),
          `only ${bars.get(meter) ?? 0} bars of ${meter}`,
        );
  },
);

test(
  "blues: nothing is ever played between the notes of the triplet, where it would flam: in four nothing on the last sixteenth of a beat, and in six and twelve nothing off the eighths (but for a run in double time in a solo, six to the beat and so twice the triplet, which has a property of its own)",
  only("blues"),
  () => {
    const blues = STYLES.find((style) => style.id === "blues");
    for (const { chart, take } of takes(bluesWritten)) {
      const doubled = new Set(
        (blues ? burstPhrases(take, blues) : []).flatMap(({ burst }) =>
          burst.notes.map((note) => note.tick),
        ),
      );
      for (const note of notesOf(take)) {
        if (note.seat === "solo" && doubled.has(note.tick)) continue;
        if (chart.meter === "4/4")
          assert.notEqual(note.tick % PPQ, (PPQ * 3) / 4, `${chart.file}: ${note.seat} on an "a"`);
        else
          assert.equal(
            note.tick % (PPQ / 2),
            0,
            `${chart.file}: ${note.seat} (${note.voice}) between the eighths at ${note.tick}`,
          );
      }
    }
  },
);

test(
  "blues: in six and twelve the cymbal plays the triplets: from the working level up, all three eighths of every pulse in every bar of time, unless a fill or a crash has that hand; and when the band is quiet it plays the pulses and leaves the triplet's middle note out",
  only("blues"),
  () => {
    let working = 0;
    let quiet = 0;
    const blues = STYLES.find((style) => style.id === "blues")!;
    const compound = (meter: string) => meter === "12/8" || meter === "6/8";
    const twelve = LIBRARY.filter((chart) => compound(chart.meter));
    const meters = new Set<string>();
    // Every take of the library's, and the same charts held quiet, working and hot.
    const played = [
      ...takes((jam) => jam.style.id === "blues" && compound(jam.chart.meter)),
      ...twelve.flatMap((chart) =>
        [0.3, 0.55, 0.85].map((energy) => {
          const options = { mode: "jam", passes: 2, energy, seed: 2 } as const;
          return { chart, options, take: render(chart.text, blues, options) };
        }),
      ),
    ];
    for (const { chart, options, take } of played) {
      const drums = notesOf(take, "drums");
      for (const bar of take.plan.bars) {
        if (bar.kind !== "music" || bar.ending || bar.seats.drums === null || bar.fill) continue;
        const cymbal = new Set(
          drums
            .filter(
              (note) =>
                note.tick >= bar.start &&
                note.tick < bar.start + bar.ticks &&
                ["closedHat", "ride", "openHat", "crash"].includes(note.voice ?? ""),
            )
            .map((note) => (note.tick - bar.start) / (PPQ / 2)),
        );
        const where = `${chart.file} seed ${options.seed} bar ${bar.index}`;
        const eighths = bar.ticks / (PPQ / 2);
        meters.add(chart.meter);
        if (tierOf(bar.seats.drums) === "low") {
          quiet++;
          for (let pulse = 0; pulse < eighths; pulse += 3) {
            assert.ok(cymbal.has(pulse), `${where}: no cymbal on pulse ${pulse / 3 + 1}`);
            assert.ok(!cymbal.has(pulse + 1), `${where}: the triplet's middle note, quiet`);
          }
        } else {
          working++;
          for (let eighth = 0; eighth < eighths; eighth++) {
            assert.ok(cymbal.has(eighth), `${where}: no cymbal on eighth ${eighth + 1}`);
          }
        }
      }
    }
    if (twelve.length > 0)
      assert.ok(working > 100 && quiet > 10, `only ${working} bars working and ${quiet} quiet`);
    for (const chart of twelve)
      assert.ok(meters.has(chart.meter), `no bar of ${chart.meter} heard`);
  },
);

// ── funk ────────────────────────────────────────────────────────────────────

test(
  "funk: in six and twelve the eighths are the band's smallest note, for everyone, the fills and the soloist too: nothing is struck between them, and the trace of swing that funk puts on its sixteenths does not move them (a pulse of three eighths is not swung)",
  only("funk"),
  () => {
    const funk = STYLES.find((style) => style.id === "funk")!;
    const compound = (jam: { style: { id: string }; chart: { meter: string } }) =>
      jam.style.id === "funk" && (jam.chart.meter === "6/8" || jam.chart.meter === "12/8");
    const played = [
      ...takes(compound),
      ...soloistTakes().filter(compound),
      ...heldTakes(funk, "6/8", false, true),
      ...heldTakes(funk, "12/8", false, true),
    ];
    const seats = new Set<string>();
    for (const { chart, options, take } of played) {
      for (const note of notesOf(take)) {
        seats.add(note.seat);
        const where = `${chart.file} ${JSON.stringify(options)}: the ${note.seat} (${note.voice ?? ""}) at ${note.tick}`;
        assert.equal(note.tick % (PPQ / 2), 0, `${where}, between the eighths`);
        assert.ok(Math.abs(note.offset) <= POCKET, `${where}, moved ${note.offset}`);
      }
    }
    if (LIBRARY.some((chart) => chart.meter === "6/8" || chart.meter === "12/8"))
      assert.equal(seats.size, 4, `only ${[...seats].join(", ")} heard`);
  },
);

// ── reggae ──────────────────────────────────────────────────────────────────

test(
  "reggae: in six and twelve the eighths are the band's smallest note, for everyone, the fills and the soloist too: nothing is struck between them, and the trace of swing that reggae puts on its sixteenths does not move them (a pulse of three eighths is its own shuffle)",
  only("reggae"),
  () => {
    const reggae = STYLES.find((style) => style.id === "reggae")!;
    const compound = (jam: { style: { id: string }; chart: { meter: string } }) =>
      jam.style.id === "reggae" && (jam.chart.meter === "6/8" || jam.chart.meter === "12/8");
    const played = [
      ...takes(compound),
      ...soloistTakes().filter(compound),
      ...heldTakes(reggae, "6/8", false, true),
      ...heldTakes(reggae, "12/8", false, true),
    ];
    const seats = new Set<string>();
    for (const { chart, options, take } of played) {
      for (const note of notesOf(take)) {
        seats.add(note.seat);
        const where = `${chart.file} ${JSON.stringify(options)}: the ${note.seat} (${note.voice ?? ""}) at ${note.tick}`;
        assert.equal(note.tick % (PPQ / 2), 0, `${where}, between the eighths`);
        assert.ok(Math.abs(note.offset) <= POCKET, `${where}, moved ${note.offset}`);
      }
    }
    if (LIBRARY.some((chart) => chart.meter === "6/8" || chart.meter === "12/8"))
      assert.equal(seats.size, 4, `only ${[...seats].join(", ")} heard`);
  },
);

// ── rock ────────────────────────────────────────────────────────────────────

test("rock: in six and twelve the whole band is on the triplet's eighths: no note of the drums (their fills too), the bass, the piano or the lead guitar falls between them, so the soloist's rhythms are eighths and longer", {
  skip:
    only("rock").skip || !LIBRARY.some((chart) => chart.meter === "12/8" || chart.meter === "6/8"),
}, () => {
  const rock = STYLES.find((style) => style.id === "rock")!;
  const twelve = (jam: { style: { id: string }; chart: { meter: string } }) =>
    jam.style.id === "rock" && (jam.chart.meter === "12/8" || jam.chart.meter === "6/8");
  const played = [
    ...takes(twelve),
    ...soloistTakes().filter(twelve),
    ...heldTakes(rock, "12/8"),
    ...heldTakes(rock, "12/8", true),
    ...heldTakes(rock, "6/8"),
    ...heldTakes(rock, "6/8", true),
  ];
  const seats = new Set<string>();
  for (const { chart, options, take } of played) {
    for (const note of notesOf(take)) {
      seats.add(note.seat);
      assert.equal(
        note.tick % (PPQ / 2),
        0,
        `${chart.file} ${JSON.stringify(options)}: the ${note.seat} (${note.voice}) between the eighths at ${note.tick}`,
      );
    }
  }
  assert.equal(seats.size, 4, `only ${[...seats].join(", ")} heard`);
});
// ── neo-soul ────────────────────────────────────────────────────────────────

test("neo-soul: in six and twelve the whole band is on the triplet's eighths, the drummer's fills and the soloist too, and nothing swings them; the notes between them are the bass's lazy pickup, the sixteenth before a chord it leads into (ST-neosoul-17), and the late four, the last backbeat a sixteenth after its pulse (ST-neosoul-08)", {
  skip:
    only("neosoul").skip ||
    !LIBRARY.some((chart) => chart.meter === "12/8" || chart.meter === "6/8"),
}, () => {
  const neosoul = STYLES.find((style) => style.id === "neosoul")!;
  const compound = (jam: { style: { id: string }; chart: { meter: string } }) =>
    jam.style.id === "neosoul" && (jam.chart.meter === "12/8" || jam.chart.meter === "6/8");
  const played = [
    ...takes(compound),
    ...soloistTakes().filter(compound),
    ...heldTakes(neosoul, "12/8"),
    ...heldTakes(neosoul, "12/8", true),
    ...heldTakes(neosoul, "6/8"),
    ...heldTakes(neosoul, "6/8", true),
  ];
  const seats = new Set<string>();
  let pickups = 0;
  for (const { chart, options, take } of played) {
    // Where a chord arrives, and where an open jam goes round again past what is planned.
    const last = take.plan.bars.at(-1)!;
    const arrivals = new Set([
      ...take.plan.bars.flatMap((bar) =>
        bar.kind === "music"
          ? bar.spans.filter((span) => span.chord !== null).map((span) => bar.start + span.start)
          : [],
      ),
      ...(options.open ? [last.start + last.ticks] : []),
    ]);
    for (const note of notesOf(take)) {
      const bar = take.plan.bars.findLast((candidate) => candidate.start <= note.tick)!;
      if (bar.kind !== "music" || !isCompound(bar.meter)) continue;
      seats.add(note.seat);
      const where = `${chart.file} ${JSON.stringify(options)}: the ${note.seat} (${note.voice ?? ""}) at ${note.tick}`;
      assert.ok(Math.abs(note.offset) <= POCKET, `${where}, moved ${note.offset}`);
      if ((note.tick - bar.start) % (PPQ / 2) === 0) continue;
      // The late four: the snare a sixteenth after the bar's last pulse.
      const lastPulse = pulseStarts(bar.meter).at(-1)!;
      if (
        note.seat === "drums" &&
        note.voice === "snare" &&
        note.tick - bar.start === lastPulse + PPQ / 4
      )
        continue;
      assert.ok(
        note.seat === "bass" && arrivals.has(note.tick + PPQ / 4),
        `${where}, between the eighths`,
      );
      pickups++;
    }
  }
  assert.equal(seats.size, 4, `only ${[...seats].join(", ")} heard`);
  assert.ok(pickups > 20, `only ${pickups} pickups on the sixteenth`);
});

// ── disco ───────────────────────────────────────────────────────────────────

test("disco: in six and twelve the whole band is on the triplet's eighths, the drummer's fills and the soloist too, and nothing swings them: the hand that never stops and the pump keep to the eighths the floor is made of", {
  skip:
    only("disco").skip || !LIBRARY.some((chart) => chart.meter === "12/8" || chart.meter === "6/8"),
}, () => {
  const disco = STYLES.find((style) => style.id === "disco")!;
  const compound = (jam: { style: { id: string }; chart: { meter: string } }) =>
    jam.style.id === "disco" && (jam.chart.meter === "12/8" || jam.chart.meter === "6/8");
  const played = [
    ...takes(compound),
    ...soloistTakes().filter(compound),
    ...heldTakes(disco, "12/8"),
    ...heldTakes(disco, "6/8"),
  ];
  const seats = new Set<string>();
  for (const { chart, options, take } of played) {
    for (const note of notesOf(take)) {
      const bar = take.plan.bars.findLast((candidate) => candidate.start <= note.tick)!;
      if (bar.kind !== "music" || !isCompound(bar.meter)) continue;
      seats.add(note.seat);
      const where = `${chart.file} ${JSON.stringify(options)}: the ${note.seat} (${note.voice ?? ""}) at ${note.tick}`;
      assert.ok(Math.abs(note.offset) <= POCKET, `${where}, moved ${note.offset}`);
      assert.equal((note.tick - bar.start) % (PPQ / 2), 0, `${where}, between the eighths`);
    }
  }
  assert.equal(seats.size, 4, `only ${[...seats].join(", ")} heard`);
});

// ── acoustic ────────────────────────────────────────────────────────────────

test(
  "acoustic: in six and twelve the eighths are the band's smallest note, for everyone: nothing is played between them, and nothing bends them (a pulse of three eighths is not swung)",
  only("acoustic"),
  () => {
    let notes = 0;
    let twelve = 0;
    const six = (jam: { style: { id: string }; chart: { meter: string } }) =>
      jam.style.id === "acoustic" && (jam.chart.meter === "6/8" || jam.chart.meter === "12/8");
    for (const { chart, options, take } of [...takes(six), ...soloistTakes().filter(six)]) {
      for (const note of notesOf(take)) {
        notes++;
        if (chart.meter === "12/8") twelve++;
        const where = `${chart.file} seed ${options.seed}: the ${note.seat} (${note.voice ?? ""}) at ${note.tick}`;
        assert.equal(note.tick % (PPQ / 2), 0, `${where}, between the eighths`);
        assert.ok(Math.abs(note.offset) <= POCKET, `${where}, moved ${note.offset}`);
      }
    }
    if (LIBRARY.some((chart) => chart.meter === "6/8"))
      assert.ok(notes > enough(30000), `only ${notes} notes in six and twelve`);
    if (LIBRARY.some((chart) => chart.meter === "12/8" && chart.file.startsWith("acoustic-")))
      assert.ok(twelve > enough(120000), `only ${twelve} notes in twelve`);
  },
);

// ── tempo ───────────────────────────────────────────────────────────────────

test("the tempo counts the pulse: at 60 a bar of 4/4 lasts four seconds and so does a bar of 12/8 (four dotted quarters), a bar of 6/8 two, a bar of 6/4 six, and a bar of 7/8 three and a half (its quarter is counted); the MIDI file says the same speed in quarter notes", () => {
  const style = STYLES[0]!;
  for (const [meter, barSeconds] of [
    ["4/4", 4],
    ["3/4", 3],
    ["12/8", 4],
    ["6/8", 2],
    ["9/8", 3],
    ["6/4", 6],
    ["7/8", 3.5],
    ["2/2", 4],
  ] as const) {
    const text = `key: C\ntempo: 60\nmeter: ${meter}\n| C | F | G | C |\n`;
    const options = { mode: "song", countIn: false } as const;
    const roadmap = plan(parse(text).chart, style, options);
    // Four bars, and the bar the last chord rings in.
    const bars = roadmap.bars.length;
    assert.equal(roadmap.tempo, 60, `${meter}: the figure is the chart's`);
    assert.ok(
      Math.abs(seconds(roadmap) - bars * barSeconds) < 1e-9,
      `${meter}: ${bars} bars last ${seconds(roadmap)} s, not ${bars * barSeconds}`,
    );
    const take = render(text, style, { ...options, seed: 1 });
    const file = readSmf(toMidi(take.plan, take.events, style));
    const pulse = isCompound(parse(text).chart.meter) ? 1.5 : 1;
    assert.equal(file.tracks[0]!.tempos[0], 60 * pulse, `${meter}: the file's quarter notes`);
  }
});

test("an arrival is one crash with a kick under it, and the cymbal that keeps time gives way to it (in a bar the drummer plays)", () => {
  for (const { chart, options, take } of takes()) {
    const drums = notesOf(take, "drums");
    for (const bar of take.plan.bars) {
      // A section the arrangement lays the drummer out of arrives with no crash: nobody is
      // there to play it.
      if (bar.kind !== "music" || bar.ending || bar.seats.drums === null) continue;
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

test("a bridge is a bridge whatever it is called: the second-to-last section of a chorus of three or more, unlike both its first and its last, is played at the level of a section labelled Bridge; a tune in two parts and an ABAC tune have none", () => {
  const a = "| C | Am7 | Dm7 | G7 | C | Am7 | Dm7 | G7 |";
  const b = "| E7 | % | A7 | % | D7 | % | G7 | % |";
  const c = "| F | Fm | C | A7 | Dm7 | G7 | C | G7 |";
  const d = "| Am7 | D7 | Gmaj7 | % | Gm7 | C7 | F | G7 |";
  const tune = (...sections: [label: string, bars: string][]) =>
    `key: C\n${sections.map(([label, bars]) => `[${label}]\n${bars}`).join("\n")}`;
  const called = (name: string) => [
    tune(["A", a], ["A2", a], [name, b], ["A3", a]),
    tune(["A", a], ["B", c], [name, b], ["D", d]),
  ];
  const levels = (text: string, style: (typeof STYLES)[number], options: PlanOptions) =>
    plan(parse(text).chart, style, options).bars.map((bar) => bar.energy);
  for (const style of STYLES) {
    called("Bridge").forEach((labelled, i) => {
      const lettered = called("X")[i]!;
      for (const options of [
        { mode: "jam", passes: 3 },
        { mode: "jam", minutes: 3 },
        { mode: "song" },
      ] as const) {
        const where = `${style.id}, tune ${i}, ${JSON.stringify(options)}`;
        assert.deepEqual(levels(lettered, style, options), levels(labelled, style, options), where);
      }
      // And the bridge is not at the level of the rest, when the style gives a bridge its own.
      const song = plan(parse(lettered).chart, style, { mode: "song" }).bars;
      const at = (label: string) => song.find((bar) => bar.section.label === label)!.energy;
      assert.notEqual(at("X"), at("A"), `${style.id}, tune ${i}: the bridge at the tune's level`);
    });
    // Played once as written, a tune with no bridge is at one level all through.
    for (const text of [tune(["A", a], ["B", b]), tune(["A", a], ["B", b], ["A", ""], ["C", c])]) {
      const levels = plan(parse(text).chart, style, { mode: "song" })
        .bars.filter((bar) => bar.kind === "music" && !bar.ending)
        .map((bar) => bar.energy);
      assert.ok(Math.max(...levels) - Math.min(...levels) < 0.001, `${style.id}: ${levels}`);
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
  // Whether the band stepped up a level anywhere: a style that plays its arc inside one level
  // (reggae, ST-reggae-33 and ST-reggae-34) has no step to keep the biggest fill for.
  let stepped = false;
  for (const { chart, take } of takes((jam) => jam.options.mode === "jam")) {
    const body = take.plan.bars.filter(
      (bar) => bar.kind === "music" && bar.section.role === "body",
    );
    if (new Set(body.map((bar) => bar.section.identity)).size !== 1) continue;
    for (let i = 0; i + 1 < body.length; i++) {
      const bar = body[i]!;
      const next = body[i + 1]!;
      if (rank(next.energy) > rank(bar.energy)) stepped = true;
      if (next.pass === bar.pass || next.ending) continue;
      assert.ok(bar.fill, `${chart.file}: a chorus ends without a fill`);
      const stepsUp = rank(next.energy) > rank(bar.energy);
      assert.equal(bar.fill.top, stepsUp, `${chart.file} bar ${bar.index}: top fill`);
      if (stepsUp) tops++;
      else plain++;
    }
  }
  assert.ok((tops > 0 || !stepped) && plain > 0, `${tops} tops and ${plain} ordinary chorus ends`);
});

function musicSeconds(roadmap: Plan): number {
  const ticks = roadmap.bars
    .filter((bar) => bar.kind === "music")
    .reduce((sum, bar) => sum + bar.ticks, 0);
  return (ticks / PPQ) * (60 / roadmap.quarters);
}

// ── the tempo, breathing ────────────────────────────────────────────────────

/** The kinds of plan the breathing tempo is held to: every way a jam is shaped, and the two that keep no arc. */
const BREATHING_KINDS: readonly PlanOptions[] = [
  { mode: "jam", passes: 2 },
  { mode: "jam", minutes: 2.5 },
  { mode: "jam", minutes: 6, solo: true },
  { mode: "jam", passes: 4, solo: true },
  { mode: "jam", passes: 4, solo: true, soloFromTop: true },
  { mode: "jam", open: true, passes: 5 },
  { mode: "jam", passes: 6, endAfter: 3 },
  { mode: "jam", passes: 3, energy: 0.6 },
  { mode: "song" },
];

/**
 * How far a take's mean tempo may sit from the tempo set, as a share of the style's amount: the
 * tempo follows the arc's level, and a jam spends most of its time above its opening pass. The
 * most seen on the library is 0.70 of the amount in a timed jam (jazz, Night and Day, sixteen
 * passes) and 0.91 in an open one, whose lift holds at its cap.
 */
const MEAN_TIMED = 0.75;
const MEAN_OPEN = 0.95;

/**
 * A style that breathes as it ships; one at nought as if it breathed a percent, the most any
 * style ships with, so every arc is held to the rules at some amount (and a style at nought is
 * held steady by the property on takes that do not ask, and by the one on its bytes). At the
 * most any style may (2%) a short pass can end before the tempo has walked to its peak, and the
 * pass after it can be the quicker on average.
 */
const breathingAs = (style: StylePack): StylePack[] =>
  style.feel.breathe > 0 ? [style] : [{ ...style, feel: { ...style.feel, breathe: 0.01 } }];

test("a take that does not ask to breathe keeps the tempo as set in every bar", () => {
  for (const { chart, take } of takes()) {
    for (const bar of [...take.plan.bars, ...take.plan.lookahead]) {
      assert.equal(bar.quarters, take.plan.quarters, `${chart.file} bar ${bar.index}`);
    }
  }
});

test("a breathing tempo is small and slow: within the style's amount of the tempo as set (never more than 2%), one tempo a bar, never moving more than a quarter of a percent from one bar to the next; the whole opening pass (the count-in and an intro too) is the tempo as set, and so is every bar of a song or of a level the player holds; the pass the arc peaks on is the quickest, and a take's mean is within three quarters of the style's amount of the tempo set (an open jam's within 0.95)", () => {
  for (const shipped of STYLES) {
    for (const style of breathingAs(shipped)) {
      let moved = 0;
      for (const chart of ownCharts(style)) {
        const written = parse(chart.text).chart;
        for (const kind of BREATHING_KINDS) {
          const steady = plan(written, style, kind);
          const breathing = plan(written, style, { ...kind, breathe: true });
          const where = `${style.id} at ${style.feel.breathe}, ${chart.file} ${JSON.stringify(kind)}`;
          const set = breathing.quarters;
          assert.equal(set, steady.quarters, `${where}: the tempo as set`);
          const amount = breatheAmount(style, written.meter, breathing.tempo);
          assert.ok(amount <= style.feel.breathe && amount <= BREATHE_MOST, where);
          const bars = [...breathing.bars, ...breathing.lookahead];
          // A whole microsecond a quarter note is as near as a bar's tempo is said.
          const hair = 1e-5;
          bars.forEach((bar, i) => {
            const share = bar.quarters / set - 1;
            assert.ok(Math.abs(share) <= amount + hair, `${where} bar ${bar.index}: ${share}`);
            const step = i === 0 ? 0 : Math.abs(bar.quarters - bars[i - 1]!.quarters) / set;
            assert.ok(step <= TEMPO_STEP + hair, `${where} bar ${bar.index}: a step of ${step}`);
            // One tempo for the whole bar: its seconds are its ticks at its own tempo.
            const lasts =
              secondsAt(breathing, bar.start + bar.ticks) - secondsAt(breathing, bar.start);
            const own = (bar.ticks / PPQ) * (60 / bar.quarters);
            assert.ok(
              Math.abs(lasts - own) < 1e-9,
              `${where} bar ${bar.index}: ${lasts} s, not ${own}`,
            );
            const middle = bar.start + bar.ticks / 2;
            assert.ok(
              Math.abs(tickAt(breathing, secondsAt(breathing, middle)) - middle) < 1e-6,
              where,
            );
            if (share !== 0) moved++;
          });
          assert.equal(breathing.bars[0]!.quarters, set, `${where}: the count-in`);
          for (const bar of breathing.bars.filter((b) => b.kind === "music" && b.pass === 0)) {
            assert.equal(bar.quarters, set, `${where} bar ${bar.index}: the opening pass`);
          }
          // Where one pass of the arc is the highest (the energy the arc adds, over the pass's
          // body), no pass is quicker on average than it.
          const passes = Map.groupBy(
            breathing.bars.filter((b) => b.kind === "music" && b.section.role === "body"),
            (b) => b.pass,
          );
          const average = (list: readonly number[]) =>
            list.reduce((sum, n) => sum + n, 0) / list.length;
          const arcOf = [...passes].map(([pass, list]) => ({
            pass,
            arc: average(list.map((b) => b.energy - b.level)),
            tempo: average(list.map((b) => b.quarters)),
          }));
          const byArc = arcOf.toSorted((a, b) => b.arc - a.arc);
          if (byArc.length > 1 && byArc[0]!.arc > byArc[1]!.arc + 0.01) {
            const peak = byArc[0]!;
            for (const other of arcOf) {
              assert.ok(
                other.tempo <= peak.tempo + 1e-9,
                `${where}: pass ${other.pass + 1} is quicker than the peak, pass ${peak.pass + 1}`,
              );
            }
          }
          if (kind.mode === "song" || kind.energy !== undefined || amount === 0) {
            for (const bar of bars) assert.equal(bar.quarters, set, `${where}: a flat arc`);
          }
          // The mean as played: the pulses of the music over the seconds they took.
          const music = breathing.bars.filter((b) => b.kind === "music");
          if (music.length > 0 && amount > 0) {
            const from = music[0]!.start;
            const to = music.at(-1)!.start + music.at(-1)!.ticks;
            const heard = ((to - from) / PPQ) * 60;
            const mean = heard / (secondsAt(breathing, to) - secondsAt(breathing, from)) / set - 1;
            const within = (kind.open ? MEAN_OPEN : MEAN_TIMED) * amount;
            assert.ok(
              Math.abs(mean) <= within,
              `${where}: a mean ${(mean * 100).toFixed(2)}% off the tempo set`,
            );
          }
        }
        // At the top of the style's range there is no push left: the band keeps the tempo set.
        const top = tempoRange(style, written.meter).max;
        const atTop = plan(written, style, { mode: "jam", passes: 4, tempo: top, breathe: true });
        for (const bar of atTop.bars)
          assert.equal(bar.quarters, atTop.quarters, `${chart.file} at ${top}`);
      }
      // A style that breathes does breathe somewhere in its own charts.
      if (style.feel.breathe > 0) assert.ok(moved > 0, `${style.id}: the tempo never moved`);
    }
  }
});

test("asked to breathe, the band plays the same notes; a style that does not breathe is the steady take to the byte, and one that does is the same take again, to the second, and its MIDI file's tempo map is the plan's: each bar's tempo where it changes, to a whole microsecond a quarter note", () => {
  for (const style of STYLES) {
    // The band, then a solo that runs into the ending: a take the suite has already played steady.
    const [{ chart, options, take: steady }] = takes(
      (jam) =>
        jam.style === style &&
        jam.chart === ownCharts(style)[0] &&
        jam.options.passes === 4 &&
        jam.options.solo === true &&
        jam.options.seed === SEEDS[0],
    ) as [Jam];
    const breathing = render(chart.text, style, { ...options, breathe: true });
    // The notes are the steady take's, so the same take again is its plan again.
    const again = plan(parse(chart.text).chart, style, { ...options, breathe: true });
    const where = `${style.id}, ${chart.file}`;
    assert.deepEqual(breathing.events, steady.events, `${where}: the notes`);
    assert.deepEqual(
      timedNotes(again, breathing.events),
      timedNotes(breathing.plan, breathing.events),
      `${where}: the same take, the same seconds`,
    );
    const file = toMidi(breathing.plan, breathing.events, style);
    assert.deepEqual(toMidi(again, breathing.events, style), file, `${where}: the same bytes`);
    if (style.feel.breathe === 0) {
      assert.deepEqual(file, toMidi(steady.plan, steady.events, style), `${where}: the bytes`);
      assert.deepEqual(
        timedNotes(breathing.plan, breathing.events),
        timedNotes(steady.plan, steady.events),
        `${where}: the seconds`,
      );
    }
    const said = readSmf(file).tracks[0]!.tempoMap;
    const played = breathing.plan.bars
      .filter((bar, i, bars) => i === 0 || bar.quarters !== bars[i - 1]!.quarters)
      .map((bar) => ({ tick: bar.start, micros: Math.round(60_000_000 / bar.quarters) }));
    assert.deepEqual(said, played, `${where}: the tempo map`);
    for (const bar of breathing.plan.bars) {
      // Held to a whole microsecond, a bar off the tempo set is exactly what the file says.
      if (bar.quarters === breathing.plan.quarters) continue;
      const micros = 60_000_000 / bar.quarters;
      assert.ok(
        Math.abs(micros - Math.round(micros)) < 1e-6,
        `${where} bar ${bar.index}: ${micros}`,
      );
    }
    if (style.feel.breathe > 0) assert.ok(said.length > 1, `${where}: one tempo only`);
  }
});

// ── who is in ───────────────────────────────────────────────────────────────

/** The seats of the band, the soloist apart: the planner may lay one of them out of a jam. */
const BAND = ["drums", "bass", "chords"] as const;

/**
 * The band seats a bar of a jam is without while the band plays on: each null in it that plays
 * in some other bar (a seat the player left out plays in none), in a bar some of the band plays.
 */
function laidOut(roadmap: Plan): Map<PlanBar, string[]> {
  const music = [...roadmap.bars, ...roadmap.lookahead].filter((bar) => bar.kind === "music");
  const present = BAND.filter((seat) => music.some((bar) => bar.seats[seat] !== null));
  const outs = new Map<PlanBar, string[]>();
  for (const bar of music) {
    const out = present.filter((seat) => bar.seats[seat] === null);
    if (out.length > 0 && out.length < present.length) outs.set(bar, out);
  }
  return outs;
}

/** The kinds of jam who is in is held in: planned only, so many seeds cost little. */
const WHO_KINDS: readonly PlanOptions[] = [
  { mode: "jam", passes: 3 },
  { mode: "jam", passes: 4 },
  { mode: "jam", passes: 8 },
  { mode: "jam", passes: 8, solo: true },
  { mode: "jam", open: true, passes: 9 },
  { mode: "jam", open: true, passes: 16, solo: true },
  // The full run: long jams, solos after the peak and solos into the ending.
  ...(FULL
    ? ([
        { mode: "jam", passes: 12, solo: true },
        { mode: "jam", minutes: 6 },
        { mode: "jam", open: true, passes: 24 },
      ] as const)
    : []),
];
const WHO_SEEDS = Array.from({ length: FULL ? 24 : 4 }, (_, i) => i + 1);

/**
 * The kinds a push plans for a style: a jam too short to thin, one of eight passes and an open
 * one, each with the soloist where the style thins under one and without where it thins alone,
 * so that every clause meets a take that thins. The full run plans every kind for every style.
 */
const whoKinds = (style: StylePack): readonly PlanOptions[] => {
  if (FULL) return WHO_KINDS;
  const solo = style.arc.layOut?.under === "solo";
  return WHO_KINDS.filter(
    (kind) =>
      kind.passes === 3 ||
      (kind.passes === 8 && (kind.solo === true) === solo) ||
      (kind.open === true && (kind.solo === true) === solo),
  );
};

/** A take's lay-outs, in order: the seat, and the first and last bar out, counted in bars of music. */
function stretchesOf(
  roadmap: Plan,
): { seat: string; from: PlanBar; to: PlanBar; at: number; end: number }[] {
  const music = [...roadmap.bars, ...roadmap.lookahead].filter((bar) => bar.kind === "music");
  const outs = laidOut(roadmap);
  const found: { seat: string; from: PlanBar; to: PlanBar; at: number; end: number }[] = [];
  music.forEach((bar, at) => {
    for (const seat of outs.get(bar) ?? []) {
      const open = found.findLast((s) => s.seat === seat && s.end === at - 1);
      if (open) {
        open.to = bar;
        open.end = at;
      } else found.push({ seat, from: bar, to: bar, at, end: at });
    }
  });
  return found;
}

test("who is in: now and then a jam lays one seat out, by its style's say, for a whole section or pass and never mid-phrase; never the drums or the bass, never two seats at once, never in the first two passes or the first 16 bars, the last pass, the peak, or the last chorus of a solo; after one, everyone in for three whole passes and 64 bars at least; never in a jam planned shorter than four passes; a style with no say, a band of two, a level the player holds, a song and a chart with an arrangement of its own keep everyone in; a jam made longer keeps every lay-out it had, and one told to finish too, with everyone in from where it was told: its plan says who played each bar as its notes do", () => {
  for (const style of STYLES) {
    const data = style.arc.layOut;
    const { layOut: _, ...steady } = style.arc;
    const none: StylePack = { ...style, arc: steady };
    let seen = 0;
    let rendered = false;
    let shortest:
      | {
          text: string;
          where: string;
          at: PlanBar;
          open: boolean;
          seconds: number;
          options: TakeOptions;
        }
      | undefined;
    for (const file of ownCharts(style)) {
      const chart = parse(file.text).chart;
      const arranged = chart.arrangement?.lines != null;
      for (const seed of WHO_SEEDS) {
        for (const kind of whoKinds(style)) {
          const options = { ...kind, seed };
          const where = `${file.file} seed ${seed} ${JSON.stringify(kind)}`;
          if (!data) {
            // A style with no say lays nobody out of any jam.
            if (seed === 1) assert.equal(laidOut(plan(chart, style, options)).size, 0, where);
            continue;
          }
          if (arranged) {
            // Nobody is laid out by the band itself: the plan the band had before it could be.
            if (seed > 1) continue;
            const asBefore = plan(chart, none, options);
            assert.deepEqual(plan(chart, style, options), asBefore, `${where}: as arranged`);
            continue;
          }
          const roadmap = plan(chart, style, options);
          const outs = laidOut(roadmap);
          seen += outs.size;
          const music = [...roadmap.bars, ...roadmap.lookahead].filter(
            (bar) => bar.kind === "music",
          );
          const body = music.filter((bar) => bar.section.role === "body");
          const mean = (pass: number) => {
            const bars = body.filter((bar) => bar.pass === pass);
            return bars.reduce((sum, bar) => sum + bar.energy, 0) / bars.length;
          };
          const passes = [...new Set(body.map((bar) => bar.pass))];
          const peak = Math.max(...passes.map(mean));
          for (const [bar, out] of outs) {
            assert.equal(out.length, 1, `${where} bar ${bar.index}: two seats out`);
            assert.ok(
              data.seats.includes(out[0] as never),
              `${where}: ${out[0]} is not the style's to lay out`,
            );
            assert.ok(bar.pass >= 2 && !bar.lastPass, `${where}: out on pass ${bar.pass}`);
            if (!roadmap.open) assert.ok(mean(bar.pass) < peak, `${where}: out at the peak`);
            const soloing = bar.solo !== null;
            assert.equal(soloing, data.under === "solo", `${where}: under the soloist or not`);
            if (bar.solo) {
              assert.ok(
                bar.solo.chorus < bar.solo.of - 1,
                `${where} bar ${bar.index}: out under the last chorus of a solo`,
              );
            }
          }
          // Out and back in at the top of a section, never inside one.
          for (const [i, bar] of music.entries()) {
            const before = music[i - 1];
            if (!before || before.index !== bar.index - 1) continue;
            const was = (outs.get(before) ?? []).join();
            if (was !== (outs.get(bar) ?? []).join()) {
              assert.equal(bar.barInSection, 0, `${where} bar ${bar.index}: in or out mid-section`);
            }
          }
          // Spaced by the music, not by passes alone: a pass is four bars of one chart and
          // thirty-two of another.
          const stretches = stretchesOf(roadmap);
          if (stretches[0]) assert.ok(stretches[0].at >= 16, `${where}: out in the first 16 bars`);
          for (const [i, next] of stretches.entries()) {
            const last = stretches[i - 1];
            if (!last) continue;
            assert.ok(
              next.at - last.end - 1 >= 64 && next.from.pass - last.to.pass - 1 >= 3,
              `${where}: in for ${next.at - last.end - 1} bars between bars ${last.to.index} and ${next.from.index}`,
            );
          }
          if (!roadmap.open && roadmap.passes < 4)
            assert.equal(outs.size, 0, `${where}: too short`);
          if (kind.open && (FULL || seed === 1)) {
            // One pass more changes nobody's place in what was planned.
            const longer = plan(chart, style, { ...options, passes: kind.passes! + 1 });
            const known = [...roadmap.bars, ...roadmap.lookahead].map((bar) => bar.seats);
            const again = [...longer.bars, ...longer.lookahead].slice(0, known.length);
            assert.deepEqual(
              again.map((bar) => bar.seats),
              known,
              `${where}: made longer`,
            );
          }
          const first = stretches[0];
          if (first) {
            // Told to finish on a pass a seat sits out of: everything before it as it was, and
            // that pass, the last, with everyone in.
            const endAfter = first.from.pass;
            const told = plan(chart, style, { ...options, endAfter });
            const kept = (p: Plan) =>
              p.bars
                .filter((bar) => bar.kind === "music" && bar.pass < endAfter)
                .map((bar) => bar.seats);
            assert.deepEqual(kept(told), kept(roadmap), `${where}: told on ${endAfter}`);
            for (const [bar] of laidOut(told)) {
              assert.ok(bar.pass < endAfter, `${where}: out of the last pass at bar ${bar.index}`);
            }
          }
          if (first && !rendered) {
            rendered = true;
            // The first take that thins: a band of two keeps both, and a level the player holds
            // has no low point to thin at.
            const two = plan(chart, style, { ...options, without: ["bass"] });
            assert.equal(laidOut(two).size, 0, `${where}: a band of two`);
            const held = plan(chart, style, { ...options, energy: 0.5 });
            assert.equal(laidOut(held).size, 0, `${where}: a level held`);
          }
          // The shortest take that thins with a phrase top inside its first lay-out, to be told
          // to finish there and played (below).
          const at = first
            ? music.find(
                (bar) =>
                  bar.pass === first.from.pass &&
                  bar.index > first.from.index &&
                  bar.index <= first.to.index &&
                  bar.phrase.bar === 0,
              )
            : undefined;
          // Open, so that the jam as it was is played only as far as the word (an open jam made
          // longer plays what it played), and the shortest such, so that playing it costs little.
          // A timed one only where no open one thins.
          const open = kind.open === true;
          const better =
            shortest === undefined ||
            (open && !shortest.open) ||
            (open === shortest.open &&
              at !== undefined &&
              secondsAt(roadmap, at.start) < shortest.seconds);
          if (first && at && better) {
            shortest = {
              text: file.text,
              where,
              at,
              open,
              seconds: secondsAt(roadmap, at.start),
              options: {
                ...options,
                ...(open ? { passes: first.from.pass + 1 } : {}),
                endAfter: first.from.pass,
                toldAt: at.start,
              },
            };
          }
        }
        if (seed === 1 && data) {
          const song = { mode: "song" as const, solo: true, seed };
          assert.deepEqual(
            plan(chart, style, song),
            plan(chart, none, song),
            `${file.file}: a song`,
          );
        }
      }
    }
    if (data) {
      // The quickest open jam, over more seeds, planned only, to tell to finish and play.
      const opens = WHO_KINDS.filter(
        (kind) => kind.open === true && (kind.solo === true) === (data.under === "solo"),
      );
      for (const file of ownCharts(style)) {
        const chart = parse(file.text).chart;
        if (chart.arrangement?.lines != null) continue;
        for (let seed = 1; seed <= (FULL ? 12 : 6); seed++) {
          for (const kind of opens) {
            const roadmap = plan(chart, style, { ...kind, seed });
            const first = stretchesOf(roadmap)[0];
            if (!first) continue;
            const at = [...roadmap.bars, ...roadmap.lookahead].find(
              (bar) =>
                bar.kind === "music" &&
                bar.index > first.from.index &&
                bar.index <= first.to.index &&
                bar.phrase.bar === 0,
            );
            if (!at) continue;
            const seconds = secondsAt(roadmap, at.start);
            if (shortest?.open && shortest.seconds <= seconds) continue;
            shortest = {
              text: file.text,
              where: `${file.file} seed ${seed} ${JSON.stringify(kind)}`,
              at,
              open: true,
              seconds,
              options: {
                ...kind,
                seed,
                passes: first.from.pass + 1,
                endAfter: first.from.pass,
                toldAt: at.start,
              },
            };
          }
        }
      }
      assert.ok(seen > 0, `${style.id}: nobody ever sat out`);
      assert.ok(shortest, `${style.id}: no take that thins was played`);
      // Told to finish as the app tells it, at a phrase top inside the lay-out: up to there the
      // seat is out, from there everyone is in, and the plan says so of each bar as the notes
      // do: up to the word its seats are the jam's as it was going to be, a seat it marks out is
      // silent, and one it marks in for a whole phrase plays in it.
      const { text, where, at, options } = shortest!;
      const take = render(text, style, options);
      // Up to the word, who is in is the jam's as it was going to be.
      const { toldAt: _word, endAfter: _last, ...going } = options;
      const was = plan(parse(text).chart, style, going);
      for (const bar of take.plan.bars) {
        if (bar.start >= at.start) break;
        assert.deepEqual(bar.seats, was.bars[bar.index]!.seats, `${where}, told: bar ${bar.index}`);
      }
      const toldOuts = laidOut(take.plan);
      assert.ok(toldOuts.size > 0, `${where}: told, the lay-out before it is gone`);
      const inBar = (t: Take, seat: string, bar: PlanBar) =>
        notesOf(t, seat as "chords").filter(
          (note) => note.tick >= bar.start && note.tick < bar.start + bar.ticks,
        ).length;
      const phrases = Map.groupBy(
        take.plan.bars.filter((bar) => bar.kind === "music"),
        (bar) => `${bar.section.occurrence}:${bar.phrase.index}`,
      );
      for (const bars of phrases.values()) {
        for (const seat of BAND) {
          for (const bar of bars) {
            if (toldOuts.get(bar)?.includes(seat)) {
              assert.equal(
                inBar(take, seat, bar),
                0,
                `${where}, told: ${seat} out of bar ${bar.index} plays`,
              );
              assert.ok(
                bar.start < at.start,
                `${where}, told: ${seat} out after the word, bar ${bar.index}`,
              );
            }
          }
          const marked = bars.every((bar) => bar.seats[seat] !== null);
          const played = (t: Take) => bars.reduce((n, bar) => n + inBar(t, seat, bar), 0);
          if (marked) {
            assert.ok(
              played(take) > 0,
              `${where}, told: ${seat} marked in and silent from bar ${bars[0]!.index}`,
            );
          }
        }
      }
    }
  }
});

test("a seat laid out of a jam is silent: none of its notes starts in a bar it sits out, and none rings into one from the bar before", () => {
  for (const { chart, options, take } of takes((jam) => jam.options.mode === "jam")) {
    // Each seat's time out, as stretches of ticks: a section or a pass at a time.
    const away = new Map<string, [number, number][]>();
    for (const [bar, out] of laidOut(take.plan)) {
      for (const seat of out) {
        const stretches = away.get(seat) ?? [];
        const last = stretches.at(-1);
        if (last && last[1] === bar.start) last[1] += bar.ticks;
        else stretches.push([bar.start, bar.start + bar.ticks]);
        away.set(seat, stretches);
      }
    }
    for (const [seat, stretches] of away) {
      for (const note of notesOf(take, seat as "chords")) {
        const end = note.tick + note.offset + note.duration;
        for (const [from, to] of stretches) {
          const sounds = note.tick < to && (note.tick >= from || end > from);
          assert.ok(!sounds, `${chart.file} seed ${options.seed}: ${seat} at ${note.tick}`);
        }
      }
    }
  }
});
