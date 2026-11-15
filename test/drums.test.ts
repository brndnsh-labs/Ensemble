// Musical properties of the drummer in the styles after the blues: the funk two-bar beat,
// the disco floor and the jazz ride. (The blues drummer's are in band.test.ts.) See docs/TESTING.md, kind 2.
// Each test names its rule; none of them knows how the engine is built.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlanBar, Take } from "@ensemble/engine";
import { parse, plan, STEP, TIER_MID, tierOf } from "@ensemble/engine";
import { enough, type Jam, notesOf, only, ownCharts, STYLES, takes } from "./takes.ts";

const in44 = (id: string) => (jam: Pick<Jam, "style" | "chart">) =>
  jam.style.id === id && jam.chart.meter === "4/4";

/** A bar of the kit as written: for each piece, the sixteenths it strikes. */
type Kit = Map<string, Set<number>>;

/** Every bar the drummer plays, with what each piece strikes in it. */
function kitBars(take: Take): { bar: PlanBar; kit: Kit; energy: number }[] {
  const drums = notesOf(take, "drums");
  let at = 0;
  return take.plan.bars.flatMap((bar) => {
    const kit: Kit = new Map();
    while (at < drums.length && drums[at]!.tick < bar.start + bar.ticks) {
      const note = drums[at++]!;
      const steps = kit.get(note.voice ?? "") ?? new Set();
      steps.add((note.tick - bar.start) / STEP);
      kit.set(note.voice ?? "", steps);
    }
    const energy = bar.seats.drums;
    return bar.kind === "music" && energy !== null ? [{ bar, kit, energy }] : [];
  });
}

const strikes = (kit: Kit, voice: string, step: number) => kit.get(voice)?.has(step) === true;
const TOMS = ["highTom", "midTom", "lowTom"];

// ── funk ────────────────────────────────────────────────────────────────────

test(
  "funk: the kick is on the One of every bar and stays off 2 and 4, the snare cracks 2 and 4, and nobody goes near the toms or the ride",
  only("funk"),
  () => {
    let bars = 0;
    for (const { chart, options, take } of takes(in44("funk"))) {
      for (const { bar, kit } of kitBars(take)) {
        const where = `${chart.file} seed ${options.seed} bar ${bar.index}`;
        for (const voice of [...TOMS, "ride", "rideBell"]) {
          assert.ok(!kit.has(voice), `${where}: the ${voice}`);
        }
        // The last bar is one hit where the final chord lands, wherever that is.
        if (bar.ending) continue;
        bars++;
        assert.ok(strikes(kit, "kick", 0), `${where}: no kick on the One`);
        assert.ok(strikes(kit, "snare", 4), `${where}: no backbeat on 2`);
        assert.ok(!strikes(kit, "kick", 4), `${where}: a kick on 2`);
        // A fill is a beat long at most, and beat 4 is its to play.
        if (bar.fill) continue;
        assert.ok(strikes(kit, "snare", 12), `${where}: no backbeat on 4`);
        assert.ok(!strikes(kit, "kick", 12), `${where}: a kick on 4`);
      }
    }
    assert.ok(bars > enough(2000), `only ${bars} bars`);
  },
);

test(
  "funk: the beat is two bars long: in one time through a section, every second bar turns its back half round the same way, and is not the bar before it again",
  only("funk"),
  () => {
    let answers = 0;
    for (const { chart, options, take } of takes(in44("funk"))) {
      const played = kitBars(take);
      const backHalf = (kit: Kit) =>
        [...kit]
          .map(([voice, steps]) => `${voice}:${[...steps].filter((s) => s >= 8).sort()}`)
          .sort()
          .join(" ");
      const turns = new Map<string, string>();
      for (const [i, { bar, kit, energy }] of played.entries()) {
        const before = played[i - 1];
        if (bar.phrase.bar % 2 !== 1 || bar.fill || bar.ending || !before) continue;
        // The bar it answers: the bar before, in time, at the same level.
        if (before.bar.fill || before.bar.index !== bar.index - 1) continue;
        if (tierOf(before.energy) !== tierOf(energy)) continue;
        const where = `${chart.file} seed ${options.seed} bar ${bar.index}`;
        const turn = backHalf(kit);
        answers++;
        assert.notEqual(turn, backHalf(before.kit), `${where}: the bar before, again`);
        const key = `${bar.section.occurrence} ${tierOf(energy)}`;
        const known = turns.get(key);
        if (known === undefined) turns.set(key, turn);
        else assert.equal(turn, known, `${where}: the section turns round another way`);
      }
    }
    assert.ok(answers > enough(600), `only ${answers} answer bars`);
  },
);

// ── disco ───────────────────────────────────────────────────────────────────

test(
  'disco: four on the floor: the kick is on every beat of every bar at every level, straight through every fill; from the working level up the open hat barks on every "and" wherever no fill takes the hand, and when the band is quiet it never opens',
  only("disco"),
  () => {
    let bars = 0;
    let fills = 0;
    for (const { chart, options, take } of takes(in44("disco"))) {
      for (const { bar, kit, energy } of kitBars(take)) {
        // The last bar is one hit where the final chord lands.
        if (bar.ending) continue;
        const where = `${chart.file} seed ${options.seed} bar ${bar.index}`;
        bars++;
        if (bar.fill) fills++;
        for (const beat of [0, 4, 8, 12]) {
          assert.ok(strikes(kit, "kick", beat), `${where}: no kick on beat ${beat / 4 + 1}`);
        }
        if (energy < TIER_MID) {
          assert.ok(!kit.has("openHat"), `${where}: the hat opens when the band is quiet`);
        } else if (!bar.fill) {
          for (const and of [2, 6, 10, 14]) {
            assert.ok(strikes(kit, "openHat", and), `${where}: no open hat on step ${and}`);
          }
        }
      }
    }
    assert.ok(bars > enough(2000), `only ${bars} bars`);
    assert.ok(fills > enough(200), `only ${fills} bars with a fill`);
  },
);

// ── jazz ────────────────────────────────────────────────────────────────────

test(
  'jazz: the whole band plays swung eighths only: nothing between a beat and its "and"',
  only("jazz"),
  () => {
    for (const { chart, options, take } of takes((jam) => jam.style.id === "jazz")) {
      for (const note of (["drums", "bass", "chords", "solo"] as const).flatMap((seat) =>
        notesOf(take, seat),
      )) {
        const bar = take.plan.bars.findLast((candidate) => candidate.start <= note.tick)!;
        if (bar.kind !== "music" || bar.meter.unit !== 4) continue;
        assert.equal(
          (note.tick - bar.start) % (2 * STEP),
          0,
          `${chart.file} seed ${options.seed} bar ${bar.index}: the ${note.seat} (${note.voice}) between the eighths`,
        );
      }
    }
  },
);

test(
  "jazz: once the band has opened up the ride is on every beat, through the fills too, unless a crash takes the One or the stick goes round the toms; the hat foot is on 2 and 4; the snare stays off 1, 2 and 4",
  only("jazz"),
  () => {
    let bars = 0;
    for (const { chart, options, take } of takes(in44("jazz"))) {
      for (const { bar, kit, energy } of kitBars(take)) {
        if (bar.ending || energy < TIER_MID) continue;
        const where = `${chart.file} seed ${options.seed} bar ${bar.index}`;
        bars++;
        const toms = TOMS.some((voice) => kit.has(voice));
        for (const beat of [0, 4, 8, 12]) {
          if (toms && beat >= 8) continue;
          assert.ok(
            strikes(kit, "ride", beat) || (beat === 0 && strikes(kit, "crash", 0)),
            `${where}: no ride on beat ${beat / 4 + 1}`,
          );
        }
        assert.ok(
          strikes(kit, "pedalHat", 4) && strikes(kit, "pedalHat", 12),
          `${where}: the hat foot`,
        );
        if (bar.fill) continue;
        for (const beat of [0, 4, 12]) {
          for (const voice of ["snare", "ghostSnare"]) {
            assert.ok(!strikes(kit, voice, beat), `${where}: the snare on beat ${beat / 4 + 1}`);
          }
        }
      }
    }
    assert.ok(bars > enough(2000), `only ${bars} bars`);
  },
);

test(
  "jazz: the band states the tune before it opens up: the first chorus of a jam is played a level down, on the closed hat with no bass drum, all but its bridge, and the second chorus is on the ride",
  only("jazz"),
  () => {
    for (const style of STYLES.filter((candidate) => candidate.id === "jazz")) {
      for (const chart of ownCharts(style)) {
        // The roadmap says who opens up when; nobody needs to play it.
        const written = parse(chart.text).chart;
        for (const options of [
          { mode: "jam", passes: 4 },
          { mode: "jam", minutes: 4 },
          { mode: "jam", open: true, passes: 3 },
        ] as const) {
          const roadmap = plan(written, style, options);
          if (roadmap.passes < 2) continue;
          const body = roadmap.bars.filter((bar) => bar.section.role === "body");
          const first = body.find((bar) => bar.pass === 0)!;
          const second = body.find((bar) => bar.pass === 1)!;
          const where = `${chart.file} ${JSON.stringify(options)}`;
          assert.equal(tierOf(first.energy), "low", `${where}: the head at ${first.energy}`);
          assert.notEqual(tierOf(second.energy), "low", `${where}: the second chorus`);
        }
      }
    }
    // The head's bridge opens up for contrast: it is on the ride, and the bass walks (ST-jazz-20).
    const aaba = parse(
      "key: Bb\n[A]\n| Bb6 | Cm7 F7 | Bb6 | Cm7 F7 |\n[A2]\n| Bb6 | Cm7 F7 | Bb6 | % |\n[Bridge]\n| D7 | G7 | C7 | F7 |\n[A3]\n| Bb6 | Cm7 F7 | Bb6 | % |",
    ).chart;
    for (const style of STYLES.filter((candidate) => candidate.id === "jazz")) {
      for (const options of [
        { mode: "jam", passes: 4 },
        { mode: "jam", minutes: 4 },
        { mode: "jam", open: true, passes: 3 },
      ] as const) {
        for (const bar of plan(aaba, style, options).bars) {
          if (bar.kind !== "music" || bar.pass !== 0 || bar.ending) continue;
          const bridge = bar.section.label === "Bridge";
          // The bar before a step up already plays where it is going, and builds into it.
          if (!bridge && bar.barInSection === 3) continue;
          assert.equal(
            tierOf(bar.energy) === "low",
            !bridge,
            `${JSON.stringify(options)} ${bar.section.label} bar ${bar.index} at ${bar.energy}`,
          );
        }
      }
    }
    let heads = 0;
    for (const { chart, options, take } of takes(in44("jazz"))) {
      if (options.mode !== "jam" || options.energy !== undefined || take.plan.passes < 2) continue;
      for (const { bar, kit, energy } of kitBars(take)) {
        if (bar.pass !== 0 || bar.section.role !== "body" || bar.ending) continue;
        if (tierOf(energy) !== "low") continue;
        const where = `${chart.file} seed ${options.seed} bar ${bar.index}`;
        heads++;
        assert.ok(strikes(kit, "closedHat", 4), `${where}: the head is not on the hat`);
        assert.ok(!kit.has("ride"), `${where}: the ride in the head`);
        // A set-up into the next chorus may have a bass drum under it, and an arrival is a
        // crash with a kick (DR-20); the time has none.
        if (!bar.fill && !bar.crash)
          assert.ok(!kit.has("kick"), `${where}: a bass drum in the head`);
      }
    }
    assert.ok(heads > enough(500), `only ${heads} bars of head`);
  },
);

const buttons = STYLES.some((style) => style.ending.gesture.kind === "button");

test("a button ending is the whole band's: where the bass plays the short last hit, the drummer plays it too", {
  skip: !buttons,
}, () => {
  let played = 0;
  for (const { style, chart, options, take } of takes((jam) => !jam.options.open)) {
    const last = take.plan.bars.findLast((bar) => bar.kind === "music")!;
    if (last.ending?.gesture.kind !== "button" || last.seats.drums === null) continue;
    const landing = last.start + last.ending.at;
    const bass = notesOf(take, "bass").filter((note) => note.tick >= landing);
    if (bass.length < 2) continue;
    played++;
    const drums = notesOf(take, "drums").filter((note) => note.tick === bass.at(-1)!.tick);
    assert.ok(
      drums.length > 0,
      `${style.id} ${chart.file} seed ${options.seed}: the band buttons without the drummer`,
    );
  }
  assert.ok(played > enough(20), `only ${played} buttons`);
});
