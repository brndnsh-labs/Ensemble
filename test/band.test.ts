// Musical properties of the band: determinism, MIDI, the planner, blues, and the drummer
// (the bass line is in bass.test.ts). See docs/TESTING.md, kind 2. Each test names its
// rule; none of them knows how the engine is built.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Plan, PlanBar, PlanOptions, Take } from "@ensemble/engine";
import {
  arrangedLines,
  isCompound,
  PPQ,
  parse,
  pitchClass,
  plan,
  pulseStarts,
  render,
  seconds,
  strongPulses,
  tierOf,
  toMidi,
  validateStyle,
  withArrangement,
} from "@ensemble/engine";
import { styleIds } from "@ensemble/styles";
import { corpus } from "./corpus.ts";
import { bluesWritten, POCKET } from "./reading.ts";
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
          const asPlanned = render(chart.text, style, { ...options, seed, solo });
          const told = render(chart.text, style, { ...options, seed, solo, endAfter });
          const where = `${chart.file} seed ${seed}, told on pass ${endAfter}`;

          const top = told.plan.bars.find((bar) => bar.kind === "music" && bar.pass === endAfter)!;
          // The pass markers say "1/2" once the band knows how many there are; nothing else may differ.
          const before = (take: Take) =>
            take.events.filter(
              (event) =>
                event.tick < top.start && !(event.kind === "marker" && event.marker === "pass"),
            );
          assert.deepEqual(before(told), before(asPlanned), where);

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
        assert.equal(
          played("solo", section).length > 0,
          leads,
          `the soloist in section ${section + 1}`,
        );
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
  'blues: the offbeat eighth is the last note of a triplet, for everyone: in four the written "and" is swung there, and in twelve it is the pulse\'s last eighth and is played where it is written',
  only("blues"),
  () => {
    for (const { chart, take } of takes(bluesWritten)) {
      const twelve = chart.meter !== "4/4";
      for (const note of notesOf(take)) {
        if (twelve) {
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
  "blues: the time is a kick on the bar's two strong pulses and a backbeat on the pulses between them (1 and 3, 2 and 4: quarter notes in four, dotted quarters in twelve), in every bar the drummer plays time",
  only("blues"),
  () => {
    let twelve = 0;
    for (const { chart, options, take } of takes(bluesWritten)) {
      const drums = notesOf(take, "drums");
      for (const bar of take.plan.bars) {
        // A bar the arrangement lays the drummer out of is not a bar he plays time in.
        if (bar.kind !== "music" || bar.ending || bar.seats.drums === null) continue;
        if (chart.meter !== "4/4") twelve++;
        const at = (tick: number, ...voices: string[]) =>
          drums.some((note) => note.tick === bar.start + tick && voices.includes(note.voice ?? ""));
        const where = `${chart.file} seed ${options.seed} bar ${bar.index}`;
        const strong = strongPulses(bar.meter);
        const between = pulseStarts(bar.meter).filter((tick) => !strong.includes(tick));
        for (const tick of strong) assert.ok(at(tick, "kick"), `${where}: no kick at ${tick}`);
        assert.ok(at(between[0]!, "snare", "crossStick"), `${where}: no backbeat on 2`);
        // A long fill takes the hands off the backbeat on 4; a short one never does.
        if (!bar.fill)
          assert.ok(at(between[1]!, "snare", "crossStick"), `${where}: no backbeat on 4`);
      }
    }
    if (LIBRARY.some((chart) => chart.meter === "12/8"))
      assert.ok(twelve > enough(300), `only ${twelve} bars of twelve`);
  },
);

test(
  "blues: nothing is ever played between the notes of the triplet, where it would flam: in four nothing on the last sixteenth of a beat, and in twelve nothing off the eighths",
  only("blues"),
  () => {
    for (const { chart, take } of takes(bluesWritten)) {
      for (const note of notesOf(take)) {
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
  "blues: in twelve the cymbal plays the triplets: from the working level up, all three eighths of every pulse in every bar of time, unless a fill or a crash has that hand; and when the band is quiet it plays the pulses and leaves the triplet's middle note out",
  only("blues"),
  () => {
    let working = 0;
    let quiet = 0;
    const blues = STYLES.find((style) => style.id === "blues")!;
    const twelve = LIBRARY.filter((chart) => chart.meter === "12/8");
    // Every take of the library's, and the same charts held quiet, working and hot.
    const played = [
      ...takes((jam) => jam.style.id === "blues" && jam.chart.meter === "12/8"),
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
        if (tierOf(bar.seats.drums) === "low") {
          quiet++;
          for (const pulse of [0, 3, 6, 9]) {
            assert.ok(cymbal.has(pulse), `${where}: no cymbal on pulse ${pulse / 3 + 1}`);
            assert.ok(!cymbal.has(pulse + 1), `${where}: the triplet's middle note, quiet`);
          }
        } else {
          working++;
          for (let eighth = 0; eighth < 12; eighth++) {
            assert.ok(cymbal.has(eighth), `${where}: no cymbal on eighth ${eighth + 1}`);
          }
        }
      }
    }
    if (twelve.length > 0)
      assert.ok(working > 100 && quiet > 10, `only ${working} bars working and ${quiet} quiet`);
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

test("rock: in twelve the whole band is on the triplet's eighths: no note of the drums (their fills too), the bass, the piano or the lead guitar falls between them, so the soloist's rhythms are eighths and longer", {
  skip: only("rock").skip || !LIBRARY.some((chart) => chart.meter === "12/8"),
}, () => {
  const rock = STYLES.find((style) => style.id === "rock")!;
  const twelve = (jam: { style: { id: string }; chart: { meter: string } }) =>
    jam.style.id === "rock" && jam.chart.meter === "12/8";
  const played = [
    ...takes(twelve),
    ...soloistTakes().filter(twelve),
    ...heldTakes(rock, "12/8"),
    ...heldTakes(rock, "12/8", true),
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

// ── acoustic ────────────────────────────────────────────────────────────────

test(
  "acoustic: in six the eighths are the band's smallest note, for everyone: nothing is played between them, and nothing bends them (a pulse of three eighths is not swung)",
  only("acoustic"),
  () => {
    let notes = 0;
    const six = (jam: { style: { id: string }; chart: { meter: string } }) =>
      jam.style.id === "acoustic" && jam.chart.meter === "6/8";
    for (const { chart, options, take } of [...takes(six), ...soloistTakes().filter(six)]) {
      for (const note of notesOf(take)) {
        notes++;
        const where = `${chart.file} seed ${options.seed}: the ${note.seat} (${note.voice ?? ""}) at ${note.tick}`;
        assert.equal(note.tick % (PPQ / 2), 0, `${where}, between the eighths`);
        assert.ok(Math.abs(note.offset) <= POCKET, `${where}, moved ${note.offset}`);
      }
    }
    if (LIBRARY.some((chart) => chart.meter === "6/8"))
      assert.ok(notes > enough(30000), `only ${notes} notes in six`);
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
