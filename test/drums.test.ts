// Musical properties of the drummer in the styles after the blues: the funk two-bar beat,
// the disco floor and the jazz ride. (The blues drummer's are in band.test.ts.) See docs/TESTING.md, kind 2.
// Each test names its rule; none of them knows how the engine is built.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlanBar, Take } from "@ensemble/engine";
import {
  burstPhrases,
  isCompound,
  PPQ,
  parse,
  plan,
  pulseStarts,
  STEP,
  strongPulses,
  TIER_MID,
  tierOf,
} from "@ensemble/engine";
import { barAt, POCKET } from "./reading.ts";
import {
  enough,
  FULL,
  heldTakes,
  type Jam,
  LIBRARY,
  notesOf,
  only,
  ownCharts,
  STYLES,
  soloistTakes,
  takeOf,
  takes,
  WRITTEN,
  written,
} from "./takes.ts";

/** A style wherever it plays from its own parts: in 4/4, and in a meter it has written. */
const itsOwn = (id: string) => (jam: Pick<Jam, "style" | "chart">) =>
  jam.style.id === id && written(jam);

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

/** The meters funk has written besides four. */
const inSixOrTwelve = (meter: string) => meter === "6/8" || meter === "12/8";
const funk = STYLES.find((style) => style.id === "funk");
/** Funk where it plays its own parts, and funk in six and in twelve held at each of its levels. */
const funkPlayed = (): Jam[] => [
  ...takes(itsOwn("funk")),
  ...(funk
    ? [...heldTakes(funk, "6/8", false, true), ...heldTakes(funk, "12/8", false, true)]
    : []),
];

test(
  "funk: the kick is on the One of every bar and stays off the backbeat, the snare cracks the backbeat (2 and 4: quarter notes in four, dotted quarters in twelve; in six the second pulse), and nobody goes near the toms or the ride",
  only("funk"),
  () => {
    let bars = 0;
    let twelveOrSix = 0;
    for (const { chart, options, take } of funkPlayed()) {
      for (const { bar, kit } of kitBars(take)) {
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        for (const voice of [...TOMS, "ride", "rideBell"]) {
          assert.ok(!kit.has(voice), `${where}: the ${voice}`);
        }
        // The last bar is one hit where the final chord lands, wherever that is.
        if (bar.ending) continue;
        bars++;
        if (isCompound(bar.meter)) twelveOrSix++;
        const strong = strongPulses(bar.meter);
        const backbeats = pulseStarts(bar.meter).filter((tick) => !strong.includes(tick));
        assert.ok(strikes(kit, "kick", 0), `${where}: no kick on the One`);
        backbeats.forEach((tick, i) => {
          // A fill is a beat long at most, and the last backbeat is its to play.
          if (bar.fill && i === backbeats.length - 1) return;
          assert.ok(strikes(kit, "snare", tick / STEP), `${where}: no backbeat at ${tick}`);
          assert.ok(
            !strikes(kit, "kick", tick / STEP),
            `${where}: a kick on the backbeat at ${tick}`,
          );
        });
      }
    }
    assert.ok(bars > enough(2000), `only ${bars} bars`);
    if (LIBRARY.some((chart) => inSixOrTwelve(chart.meter)))
      assert.ok(twelveOrSix > 100, `only ${twelveOrSix} bars of six and twelve`);
  },
);

test(
  "funk: the beat is two bars long: in one time through a section, every second bar turns its back half round the same way, and is not the bar before it again",
  only("funk"),
  () => {
    let answers = 0;
    for (const { chart, options, take } of funkPlayed()) {
      const played = kitBars(take);
      const backHalf = (kit: Kit, bar: PlanBar) =>
        [...kit]
          .map(
            ([voice, steps]) =>
              `${voice}:${[...steps].filter((s) => s * STEP >= bar.ticks / 2).sort()}`,
          )
          .sort()
          .join(" ");
      const turns = new Map<string, string>();
      for (const [i, { bar, kit, energy }] of played.entries()) {
        const before = played[i - 1];
        if (bar.phrase.bar % 2 !== 1 || bar.fill || bar.ending || !before) continue;
        // The bar it answers: the bar before, in time, at the same level.
        if (before.bar.fill || before.bar.index !== bar.index - 1) continue;
        if (tierOf(before.energy) !== tierOf(energy)) continue;
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        const turn = backHalf(kit, bar);
        answers++;
        assert.notEqual(turn, backHalf(before.kit, before.bar), `${where}: the bar before, again`);
        const key = `${bar.section.occurrence} ${tierOf(energy)}`;
        const known = turns.get(key);
        if (known === undefined) turns.set(key, turn);
        else assert.equal(turn, known, `${where}: the section turns round another way`);
      }
    }
    assert.ok(answers > enough(600), `only ${answers} answer bars`);
  },
);

test(
  "funk: in six and twelve the hat keeps the eighths and the kick is off the pulse: from the working level up the hat is on every eighth of a bar of time, ghosts round the backbeat; quiet it is on each pulse and at most the eighth before the next, never the triplet's middle eighth, and no ghosts; and every bar has a kick on an eighth that is not a pulse",
  only("funk"),
  () => {
    let working = 0;
    let quiet = 0;
    const HATS = ["closedHat", "openHat"];
    for (const { chart, options, take } of funkPlayed()) {
      if (!inSixOrTwelve(chart.meter)) continue;
      for (const { bar, kit, energy } of kitBars(take)) {
        if (bar.ending || bar.fill || !isCompound(bar.meter)) continue;
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        const steps = bar.ticks / STEP;
        const hat = new Set(HATS.flatMap((voice) => [...(kit.get(voice) ?? [])]));
        const kicks = [...(kit.get("kick") ?? [])];
        assert.ok(
          kicks.some((step) => step % 6 !== 0),
          `${where}: every kick on a pulse (${kicks})`,
        );
        if (energy >= TIER_MID) {
          working++;
          for (let step = 0; step < steps; step += 2)
            assert.ok(
              hat.has(step) || (step === 0 && bar.crash),
              `${where}: no hat on eighth ${step / 2 + 1}`,
            );
          continue;
        }
        quiet++;
        assert.ok(!kit.has("ghostSnare"), `${where}: a ghost, quiet`);
        for (let pulse = 0; pulse < steps; pulse += 6) {
          assert.ok(
            hat.has(pulse) || (pulse === 0 && bar.crash),
            `${where}: no hat on the pulse at ${pulse}`,
          );
          assert.ok(!hat.has(pulse + 2), `${where}: the triplet's middle eighth, quiet`);
        }
      }
    }
    if (LIBRARY.some((chart) => inSixOrTwelve(chart.meter)))
      assert.ok(working > 100 && quiet > 50, `only ${working} bars working and ${quiet} quiet`);
  },
);

// ── disco ───────────────────────────────────────────────────────────────────

const disco = STYLES.find((style) => style.id === "disco");
/** Disco where it plays its own parts, and in six and in twelve held at each of its levels. */
const discoPlayed = (): Jam[] => [
  ...takes(itsOwn("disco")),
  ...(disco ? [...heldTakes(disco, "12/8"), ...heldTakes(disco, "6/8")] : []),
];

test(
  'disco: four on the floor: the kick is on every pulse of every bar at every level (every beat in four, each of the dotted quarters in six and twelve), straight through every fill; from the working level up the open hat barks on every "and" (in six and twelve each pulse\'s last eighth) wherever no fill takes the hand, and when the band is quiet it never opens',
  only("disco"),
  () => {
    let bars = 0;
    let fills = 0;
    const meters = new Map<string, number>();
    for (const { chart, options, take } of discoPlayed()) {
      for (const { bar, kit, energy } of kitBars(take)) {
        // The last bar is one hit where the final chord lands.
        if (bar.ending) continue;
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        bars++;
        meters.set(chart.meter, (meters.get(chart.meter) ?? 0) + 1);
        if (bar.fill) fills++;
        const pulses = pulseStarts(bar.meter).map((tick) => tick / STEP);
        for (const pulse of pulses) {
          assert.ok(strikes(kit, "kick", pulse), `${where}: no kick on the pulse at ${pulse}`);
        }
        if (energy < TIER_MID) {
          assert.ok(!kit.has("openHat"), `${where}: the hat opens when the band is quiet`);
        } else if (!bar.fill) {
          // The "and": the eighth before the next pulse, or before the barline.
          const steps = Math.round(bar.ticks / STEP);
          for (const and of [...pulses.slice(1), steps].map((next) => next - 2)) {
            assert.ok(strikes(kit, "openHat", and), `${where}: no open hat on step ${and}`);
          }
        }
      }
    }
    assert.ok(bars > enough(2000), `only ${bars} bars`);
    assert.ok(fills > enough(200), `only ${fills} bars with a fill`);
    for (const meter of ["12/8", "6/8"])
      if (LIBRARY.some((chart) => chart.meter === meter))
        assert.ok(
          (meters.get(meter) ?? 0) > 100,
          `only ${meters.get(meter) ?? 0} bars of ${meter}`,
        );
  },
);

test("disco: in six and twelve the hat is the triplet: from the working level up every eighth of every bar of time has the hat or the shaker on it (the closed hat on each pulse, the open hat on its last eighth, the middle eighth the closed hat or the shaker), unless a fill or a crash has the hand; and quiet, the closed hat alone, on each pulse and its last eighth, never the triplet's middle note", {
  skip: only("disco").skip || !LIBRARY.some((chart) => isCompound(parse(chart.text).chart.meter)),
}, () => {
  let working = 0;
  let quiet = 0;
  const CYMBALS = ["closedHat", "openHat", "crash"];
  for (const { chart, options, take } of discoPlayed()) {
    if (chart.meter !== "12/8" && chart.meter !== "6/8") continue;
    for (const { bar, kit, energy } of kitBars(take)) {
      if (bar.ending || bar.fill) continue;
      const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
      const steps = Math.round(bar.ticks / STEP);
      const cymbal = new Set(CYMBALS.flatMap((voice) => [...(kit.get(voice) ?? [])]));
      if (energy >= TIER_MID) {
        working++;
        const shaker = kit.get("shaker") ?? new Set();
        for (let step = 0; step < steps; step += 2)
          assert.ok(
            cymbal.has(step) || shaker.has(step),
            `${where}: nothing on eighth ${step / 2 + 1}`,
          );
        continue;
      }
      quiet++;
      assert.ok(!kit.has("shaker"), `${where}: the shaker, quiet`);
      // In sixteenths: a pulse is six, its eighths at 0, 2 and 4 into it.
      for (let pulse = 0; pulse < steps; pulse += 6) {
        assert.ok(cymbal.has(pulse), `${where}: no hat on pulse ${pulse / 6 + 1}`);
        assert.ok(cymbal.has(pulse + 4), `${where}: no hat on the last eighth of ${pulse / 6 + 1}`);
        assert.ok(!cymbal.has(pulse + 2), `${where}: the triplet's middle eighth, quiet`);
      }
    }
  }
  assert.ok(working > 100 && quiet > 50, `only ${working} bars working and ${quiet} quiet`);
});

// ── reggae ──────────────────────────────────────────────────────────────────

/** Reggae where it plays its own parts, and in six and twelve held at each level on its own charts. */
const reggae = STYLES.find((style) => style.id === "reggae");
const reggaePlayed = (): Jam[] => [
  ...takes(itsOwn("reggae")),
  ...(reggae
    ? [...heldTakes(reggae, "6/8", false, true), ...heldTakes(reggae, "12/8", false, true)]
    : []),
];

/**
 * Where the drop lands (ST-reggae-04): the bar's second strong pulse (beat 3 of four, pulse 3
 * of twelve), or in a bar with one strong pulse, the pulse after it (the second pulse of six).
 */
const dropOf = (bar: PlanBar) => strongPulses(bar.meter)[1] ?? pulseStarts(bar.meter)[1]!;

test(
  "reggae: the one drop: in every bar the kick lands on the drop (beat 3 in four, the third pulse in twelve, the second in six) with the cross-stick, or with the snare when the band is hot; below the hot level nothing kicks the One but an arrival crash, and hot the kick is back on it",
  only("reggae"),
  () => {
    let bars = 0;
    let hot = 0;
    let compound = 0;
    for (const { chart, options, take } of reggaePlayed()) {
      for (const { bar, kit, energy } of kitBars(take)) {
        // The last bar is the stop: the drop's own pair moved onto the One.
        if (bar.ending) continue;
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        bars++;
        if (isCompound(bar.meter)) compound++;
        const drop = dropOf(bar) / STEP;
        const high = tierOf(energy) === "high";
        assert.ok(strikes(kit, "kick", drop), `${where}: no kick on the drop`);
        assert.ok(
          strikes(kit, high ? "snare" : "crossStick", drop),
          `${where}: no ${high ? "snare" : "cross-stick"} on the drop`,
        );
        if (high) {
          hot++;
          assert.ok(strikes(kit, "kick", 0), `${where}: hot, and no kick on the One`);
        } else {
          assert.ok(!strikes(kit, "kick", 0) || bar.crash, `${where}: a kick on the empty One`);
        }
      }
    }
    assert.ok(bars > enough(2000) && hot > enough(200), `only ${bars} bars, ${hot} of them hot`);
    if (reggae && ownCharts(reggae).some((chart) => isCompound(parse(chart.text).chart.meter)))
      assert.ok(compound > 100, `only ${compound} bars of six and twelve`);
  },
);

// ── jazz ────────────────────────────────────────────────────────────────────

const jazz = STYLES.find((style) => style.id === "jazz");
/** Jazz where it plays its own parts, and its own charts in six and in twelve held at each level. */
const jazzPlayed = (): Jam[] => [
  ...takes(itsOwn("jazz")),
  ...(jazz
    ? [...heldTakes(jazz, "6/8", false, true), ...heldTakes(jazz, "12/8", false, true)]
    : []),
];

test(
  'jazz: the whole band plays eighths only: in a bar of quarter-note beats nothing between a beat and its swung "and"; in a bar of dotted pulses, its own triplet, nothing between the eighths and nothing swings them, the fills and the soloist too (but for runs in double time in a solo, held to a property of their own)',
  only("jazz"),
  () => {
    let compoundNotes = 0;
    const isJazz = (jam: { style: { id: string } }) => jam.style.id === "jazz";
    const compoundOwn = (jam: { style: { id: string }; chart: { meter: string } }) =>
      isJazz(jam) && (jam.chart.meter === "6/8" || jam.chart.meter === "12/8");
    for (const { chart, options, take } of [
      ...takes(isJazz),
      ...soloistTakes().filter(compoundOwn),
      ...jazzPlayed().filter(compoundOwn),
    ]) {
      const doubled = new Set(
        (jazz ? burstPhrases(take, jazz) : []).flatMap(({ burst }) =>
          burst.notes.map((note) => note.tick),
        ),
      );
      for (const note of (["drums", "bass", "chords", "solo"] as const).flatMap((seat) =>
        notesOf(take, seat),
      )) {
        const bar = barAt(take.plan.bars, note.tick)!;
        if (bar.kind !== "music" || (bar.meter.unit !== 4 && !isCompound(bar.meter))) continue;
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}: the ${note.seat} (${note.voice})`;
        const run = note.seat === "solo" && doubled.has(note.tick);
        if (!run) {
          assert.equal((note.tick - bar.start) % (2 * STEP), 0, `${where} between the eighths`);
        }
        if (!isCompound(bar.meter)) continue;
        compoundNotes++;
        assert.ok(Math.abs(note.offset) <= POCKET, `${where} moved ${note.offset}`);
      }
    }
    if (jazz && ownCharts(jazz).some((chart) => isCompound(parse(chart.text).chart.meter)))
      assert.ok(compoundNotes > enough(20000), `only ${compoundNotes} notes in six and twelve`);
  },
);

test(
  "jazz: once the band has opened up the ride is on every pulse, through the fills too, unless a crash takes the One or the stick goes round the toms; the hat foot closes on the pulse after each strong one (2 and 4 in four and in twelve; in 6/4, 2 and 5; in six-eight the second pulse; in a waltz, 3/4, on 2 and 3, the variant a source names, since the drums in three are the fit and not written) and on no other; the snare stays off the One and off the foot's pulses",
  only("jazz"),
  () => {
    let bars = 0;
    const meters = new Map<string, number>();
    for (const { chart, options, take } of jazzPlayed()) {
      for (const { bar, kit, energy } of kitBars(take)) {
        if (bar.ending || energy < TIER_MID) continue;
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        bars++;
        meters.set(chart.meter, (meters.get(chart.meter) ?? 0) + 1);
        const pulses = pulseStarts(bar.meter);
        const beats = pulses.map((tick) => tick / STEP);
        // The second pulse of each half: the pulse after each strong one. In a waltz, every
        // pulse after the One (the study's D3: "the hi-hat on 'two' and 'three'", S6).
        const waltz = bar.meter.beats === 3 && bar.meter.unit === 4;
        const foot = waltz
          ? beats.slice(1)
          : strongPulses(bar.meter).map((tick) => pulses[pulses.indexOf(tick) + 1]! / STEP);
        const toms = TOMS.some((voice) => kit.has(voice));
        for (const beat of beats) {
          if (toms && beat >= beats.at(-2)!) continue;
          assert.ok(
            strikes(kit, "ride", beat) || (beat === 0 && strikes(kit, "crash", 0)),
            `${where}: no ride on pulse ${beats.indexOf(beat) + 1}`,
          );
          assert.equal(
            strikes(kit, "pedalHat", beat),
            foot.includes(beat),
            `${where}: the hat foot on pulse ${beats.indexOf(beat) + 1}`,
          );
        }
        if (bar.fill) continue;
        for (const beat of [0, ...foot]) {
          for (const voice of ["snare", "ghostSnare"]) {
            assert.ok(
              !strikes(kit, voice, beat),
              `${where}: the snare on pulse ${beats.indexOf(beat) + 1}`,
            );
          }
        }
      }
    }
    assert.ok(bars > enough(2000), `only ${bars} bars`);
    for (const meter of WRITTEN.jazz ?? [])
      if (LIBRARY.some((chart) => chart.meter === meter))
        assert.ok(
          (meters.get(meter) ?? 0) > (meter === "6/4" ? enough(300) : 50),
          `only ${meters.get(meter) ?? 0} bars of ${meter}`,
        );
  },
);

test(
  "jazz: the band states the tune before it opens up: the first chorus of a jam is played a level down, on the closed hat (on its second pulse, in every meter) with no bass drum, all but its bridge, and the second chorus is on the ride",
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
    for (const { style, chart, options, take } of takes(itsOwn("jazz"))) {
      if (options.mode !== "jam" || options.energy !== undefined || take.plan.passes < 2) continue;
      for (const { bar, kit, energy } of kitBars(take)) {
        if (bar.pass !== 0 || bar.section.role !== "body" || bar.ending) continue;
        if (tierOf(energy) !== "low") continue;
        // A section the tune itself calls quieter than its choruses (a breakdown) is not the
        // head: down there the drummer is on the soft ride of a ballad.
        if (bar.level < style.arc.defaultLevel) continue;
        const where = `${chart.file} seed ${options.seed} bar ${bar.index}`;
        heads++;
        const second = pulseStarts(bar.meter)[1]! / STEP;
        assert.ok(strikes(kit, "closedHat", second), `${where}: the head is not on the hat`);
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

test("jazz: in six and twelve the cymbal's skip is the pulse's last eighth, never its middle (AU-92): from the working level, in six-eight the ride on each pulse and the eighth before the next and nowhere else, in twelve-eight the ballad's triplets, every eighth; quiet, the time (the head's closed hat or a ballad's soft ride) on each pulse and at most its last eighth, never the middle one", {
  skip:
    only("jazz").skip || !LIBRARY.some((chart) => chart.meter === "6/8" || chart.meter === "12/8"),
}, () => {
  const counted = { quiet: 0, six: 0, twelve: 0 };
  for (const { chart, options, take } of jazzPlayed()) {
    if (chart.meter !== "6/8" && chart.meter !== "12/8") continue;
    for (const { bar, kit, energy } of kitBars(take)) {
      if (bar.ending || bar.fill) continue;
      const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
      const steps = Math.round(bar.ticks / STEP);
      // An arrival crash takes the cymbal's stroke on the One.
      const time = (voice: string) =>
        new Set([...(kit.get(voice) ?? [])].filter((step) => step !== 0 || !bar.crash));
      if (energy >= TIER_MID) {
        const ride = time("ride");
        for (let step = 0; step < steps; step += 2) {
          if (step === 0 && bar.crash) continue;
          // In sixteenths a pulse is six: its eighths are 0, 2 and 4 into it.
          const wanted: boolean = chart.meter === "12/8" || step % 6 !== 2;
          assert.equal(ride.has(step), wanted, `${where}: the ride at ${step}`);
        }
        counted[chart.meter === "12/8" ? "twelve" : "six"]++;
        continue;
      }
      counted.quiet++;
      const cymbal = new Set([...time("ride"), ...time("closedHat")]);
      for (let pulse = 0; pulse < steps; pulse += 6) {
        if (pulse > 0 || !bar.crash)
          assert.ok(cymbal.has(pulse), `${where}: no cymbal on pulse ${pulse / 6 + 1}`);
        assert.ok(!cymbal.has(pulse + 2), `${where}: the triplet's middle eighth, quiet`);
      }
    }
  }
  assert.ok(
    counted.quiet > 30 && counted.six > 30 && counted.twelve > 30,
    `only ${counted.quiet} quiet bars, ${counted.six} of six and ${counted.twelve} of twelve working`,
  );
});

// ── rock ────────────────────────────────────────────────────────────────────

const rock = STYLES.find((style) => style.id === "rock");
/** Rock where it plays its own parts, and rock in twelve and in six held at each of its levels. */
const rockPlayed = (): Jam[] => [
  ...takes(itsOwn("rock")),
  ...(rock ? [...heldTakes(rock, "12/8"), ...heldTakes(rock, "6/8")] : []),
];

test(
  "rock: the time is a kick on the bar's strong pulses and a backbeat on the pulses between them (1 and 3, 2 and 4: quarter notes in four, dotted quarters in twelve; in six the One and the second pulse), in every bar the drummer plays time; a fill may take the last backbeat",
  only("rock"),
  () => {
    let bars = 0;
    const meters = new Map<string, number>();
    for (const { chart, options, take } of rockPlayed()) {
      for (const { bar, kit } of kitBars(take)) {
        if (bar.ending) continue;
        bars++;
        meters.set(chart.meter, (meters.get(chart.meter) ?? 0) + 1);
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        const strong = strongPulses(bar.meter);
        const between = pulseStarts(bar.meter).filter((tick) => !strong.includes(tick));
        for (const tick of strong)
          assert.ok(strikes(kit, "kick", tick / STEP), `${where}: no kick at ${tick}`);
        const backbeat = (tick: number) =>
          strikes(kit, "snare", tick / STEP) || strikes(kit, "crossStick", tick / STEP);
        for (const tick of between.slice(0, -1))
          assert.ok(backbeat(tick), `${where}: no backbeat at ${tick}`);
        // A fill takes the hands off the last backbeat (on 4; in six, the second pulse).
        if (!bar.fill)
          assert.ok(backbeat(between.at(-1)!), `${where}: no backbeat at ${between.at(-1)}`);
      }
    }
    assert.ok(bars > enough(2000), `only ${bars} bars`);
    for (const meter of ["12/8", "6/8"])
      if (LIBRARY.some((chart) => chart.meter === meter))
        assert.ok(
          (meters.get(meter) ?? 0) > enough(300),
          `only ${meters.get(meter) ?? 0} bars of ${meter}`,
        );
  },
);

test("rock: in six and twelve the cymbal is on every eighth from the working level up, all of them in every bar of time unless a fill has the hand; and a quiet bar is thinner: the cymbal on each pulse and at most the eighth before the next, never the triplet's middle eighth, the kick on the strong pulses (1 and 3; in six the One) and at most the eighth before a pulse, and the snare on the pulses between them alone", {
  skip: only("rock").skip || !LIBRARY.some((chart) => isCompound(parse(chart.text).chart.meter)),
}, () => {
  const counted = new Map<string, number>();
  const CYMBALS = ["closedHat", "ride", "openHat", "crash"];
  for (const { chart, options, take } of rockPlayed()) {
    if (chart.meter !== "12/8" && chart.meter !== "6/8") continue;
    for (const { bar, kit, energy } of kitBars(take)) {
      if (bar.ending || bar.fill) continue;
      const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
      const steps = Math.round(bar.ticks / STEP);
      const strong = strongPulses(bar.meter).map((tick) => tick / STEP);
      const between = pulseStarts(bar.meter)
        .map((tick) => tick / STEP)
        .filter((step) => !strong.includes(step));
      const cymbal = new Set(CYMBALS.flatMap((voice) => [...(kit.get(voice) ?? [])]));
      const key = `${chart.meter} ${energy >= TIER_MID ? "working" : "quiet"}`;
      counted.set(key, (counted.get(key) ?? 0) + 1);
      if (energy >= TIER_MID) {
        for (let step = 0; step < steps; step += 2)
          assert.ok(cymbal.has(step), `${where}: no cymbal on eighth ${step / 2 + 1}`);
        continue;
      }
      // In sixteenths: a pulse is six, its eighths at 0, 2 and 4 into it.
      for (let pulse = 0; pulse < steps; pulse += 6) {
        assert.ok(cymbal.has(pulse), `${where}: no cymbal on pulse ${pulse / 6 + 1}`);
        assert.ok(!cymbal.has(pulse + 2), `${where}: the triplet's middle eighth, quiet`);
      }
      for (const step of kit.get("kick") ?? [])
        assert.ok(strong.includes(step) || step % 6 === 4, `${where}: a kick at ${step}`);
      for (const voice of ["snare", "crossStick"])
        for (const step of kit.get(voice) ?? [])
          assert.ok(between.includes(step), `${where}: the ${voice} at ${step}`);
    }
  }
  // Twelve as it was asked before six was written; six has one chart, half as long.
  for (const [meter, working, quiet] of [
    ["12/8", 100, 50],
    ["6/8", 50, 20],
  ] as const)
    if (LIBRARY.some((chart) => chart.meter === meter))
      assert.ok(
        (counted.get(`${meter} working`) ?? 0) > working &&
          (counted.get(`${meter} quiet`) ?? 0) > quiet,
        `only ${counted.get(`${meter} working`) ?? 0} bars of ${meter} working and ${counted.get(`${meter} quiet`) ?? 0} quiet`,
      );
});

// ── neo-soul ────────────────────────────────────────────────────────────────

const neosoul = STYLES.find((style) => style.id === "neosoul");
/** Neo-soul where it plays its own parts, and in six and in twelve held at each of its levels. */
const neosoulPlayed = (): Jam[] => [
  ...takes(itsOwn("neosoul")),
  ...(neosoul ? [...heldTakes(neosoul, "12/8"), ...heldTakes(neosoul, "6/8")] : []),
];

test(
  "neo-soul: the loop's time is the kick on the One and a backbeat on every pulse between the strong ones (2 and 4 in four and in twelve, the second pulse in six), on the snare or, very quiet, the cross-stick; the last of them may come one step of the grid late in the second bar of a pair (a sixteenth, in four and in six and twelve alike: as late in time, since the tempo counts the pulse), and a fill may take it",
  only("neosoul"),
  () => {
    let bars = 0;
    const meters = new Map<string, number>();
    for (const { chart, options, take } of neosoulPlayed()) {
      for (const { bar, kit } of kitBars(take)) {
        if (bar.ending) continue;
        bars++;
        meters.set(chart.meter, (meters.get(chart.meter) ?? 0) + 1);
        const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
        assert.ok(strikes(kit, "kick", 0), `${where}: no kick on the One`);
        const strong = strongPulses(bar.meter);
        const between = pulseStarts(bar.meter)
          .filter((tick) => !strong.includes(tick))
          .map((tick) => tick / STEP);
        const backbeat = (step: number) =>
          strikes(kit, "snare", step) || strikes(kit, "crossStick", step);
        for (const step of between.slice(0, -1))
          assert.ok(backbeat(step), `${where}: no backbeat at ${step}`);
        if (bar.fill) continue;
        const last = between.at(-1)!;
        const late = last + 1;
        assert.ok(
          backbeat(last) || (bar.phrase.bar % 2 === 1 && backbeat(late)),
          `${where}: no backbeat at ${last}`,
        );
      }
    }
    assert.ok(bars > enough(2000), `only ${bars} bars`);
    for (const meter of ["12/8", "6/8"])
      if (LIBRARY.some((chart) => chart.meter === meter))
        assert.ok(
          (meters.get(meter) ?? 0) > 100,
          `only ${meters.get(meter) ?? 0} bars of ${meter}`,
        );
  },
);

test("neo-soul: in six and twelve the hat plays the soul ballad's triplets: from the working level up on every eighth of every bar of time (where it breathes open, the open hat), unless a fill or a crash has the hand, with a ghost on the snare in every bar; and quiet, on each pulse and at most its last eighth, never the triplet's middle note, and no ghost", {
  skip: only("neosoul").skip || !LIBRARY.some((chart) => isCompound(parse(chart.text).chart.meter)),
}, () => {
  let working = 0;
  let quiet = 0;
  const CYMBALS = ["closedHat", "openHat", "crash"];
  for (const { chart, options, take } of neosoulPlayed()) {
    if (chart.meter !== "12/8" && chart.meter !== "6/8") continue;
    for (const { bar, kit, energy } of kitBars(take)) {
      if (bar.ending || bar.fill) continue;
      const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
      const steps = Math.round(bar.ticks / STEP);
      const cymbal = new Set(CYMBALS.flatMap((voice) => [...(kit.get(voice) ?? [])]));
      const ghosts = kit.get("ghostSnare")?.size ?? 0;
      if (energy >= TIER_MID) {
        working++;
        for (let step = 0; step < steps; step += 2)
          assert.ok(cymbal.has(step), `${where}: no hat on eighth ${step / 2 + 1}`);
        assert.ok(ghosts > 0, `${where}: no ghost on the snare`);
        continue;
      }
      quiet++;
      // In sixteenths: a pulse is six, its eighths at 0, 2 and 4 into it.
      for (let pulse = 0; pulse < steps; pulse += 6) {
        assert.ok(cymbal.has(pulse), `${where}: no hat on pulse ${pulse / 6 + 1}`);
        assert.ok(!cymbal.has(pulse + 2), `${where}: the triplet's middle eighth, quiet`);
      }
      assert.equal(ghosts, 0, `${where}: a ghost, quiet`);
    }
  }
  assert.ok(working > 100 && quiet > 50, `only ${working} bars working and ${quiet} quiet`);
});

// ── six and twelve ──────────────────────────────────────────────────────────

const compound = (jam: Pick<Jam, "chart">) => isCompound(parse(jam.chart.text).chart.meter);
const anyCompound = LIBRARY.some((chart) => compound({ chart }));

/**
 * The bars of dotted pulses a style plays time in: every take of the library's in six-eight
 * or twelve-eight that it is handed, and each such chart held quiet and held loud (on a push, the
 * style's own). Read once, for both the properties of six and twelve below.
 */
type CompoundBar = { where: string; bar: PlanBar; kit: Kit; held: number | undefined };
let compoundRead: CompoundBar[] | undefined;
function compoundBars(): CompoundBar[] {
  compoundRead ??= readCompound();
  return compoundRead;
}
function readCompound(): CompoundBar[] {
  const played = [
    ...takes(compound).map(({ style, chart, options, take }) => ({
      where: `${style.id} ${chart.file} seed ${options.seed}`,
      take,
      held: undefined,
    })),
    // On a push only the style's own charts are held (it is handed the rest among the
    // library's takes above); the full run holds every one. A style with none of its own in
    // six or twelve holds the library's on a push too: it is still handed them, and both
    // levels have to be heard from it.
    ...STYLES.flatMap((style) =>
      (FULL || !ownCharts(style).some((chart) => compound({ chart })) ? LIBRARY : ownCharts(style))
        .filter((chart) => compound({ chart }))
        .flatMap((chart) =>
          [0.3, 0.85].map((held) => ({
            where: `${style.id} ${chart.file} at ${held}`,
            take: takeOf({
              style,
              chart,
              options: { mode: "jam", passes: 2, energy: held, seed: 1 },
            }).take,
            held,
          })),
        ),
    ),
  ];
  return played.flatMap(({ where, take, held }) =>
    kitBars(take)
      .filter(({ bar }) => !bar.fill && !bar.ending && isCompound(bar.meter))
      .map(({ bar, kit }) => ({ where: `${where} bar ${bar.index}`, bar, kit, held })),
  );
}

test("in a bar of dotted pulses the drummer's time is on the eighths: no stroke of it falls between them, so a cymbal's skip note is the pulse's last eighth and never its last sixteenth (a fill is its own figure, and a backbeat a style writes a sixteenth late is the snare a sixteenth after a pulse, nowhere else)", {
  skip: !anyCompound,
}, () => {
  let strokes = 0;
  for (const { where, kit } of compoundBars()) {
    for (const [voice, steps] of kit) {
      for (const step of steps) {
        strokes++;
        // A displaced backbeat (neo-soul's late four) is late by a sixteenth, as it is in four.
        if (voice === "snare" && step % 6 === 1) continue;
        assert.equal(step % 2, 0, `${where}: the ${voice} between the eighths`);
      }
    }
  }
  assert.ok(strokes > 300, `only ${strokes} strokes`);
});

test("in six and twelve the drums thin out as the band gets quiet and are never busy: in a bar of dotted pulses the kick and the snare between them (ghosts aside) are on no more than half the bar's eighths, in any style at any level, and a style's quiet bars have no more strokes than its loud ones", {
  skip: !anyCompound,
}, () => {
  const perBar = { quiet: [] as number[], loud: [] as number[] };
  for (const { where, bar, kit, held } of compoundBars()) {
    const eighths = bar.ticks / (PPQ / 2);
    const struck = new Set([...(kit.get("kick") ?? []), ...(kit.get("snare") ?? [])]);
    assert.ok(
      struck.size <= eighths / 2,
      `${where}: kick and snare on ${struck.size} of ${eighths} eighths`,
    );
    if (held === undefined) continue;
    perBar[held < TIER_MID ? "quiet" : "loud"].push(
      [...kit.values()].reduce((sum, steps) => sum + steps.size, 0),
    );
  }
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(perBar.quiet.length > 10 && perBar.loud.length > 10, "both levels are heard");
  assert.ok(
    mean(perBar.quiet) <= mean(perBar.loud),
    `quiet ${mean(perBar.quiet).toFixed(2)} strokes a bar, loud ${mean(perBar.loud).toFixed(2)}`,
  );
});

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

// ── acoustic ────────────────────────────────────────────────────────────────

const acoustic = STYLES.find((style) => style.id === "acoustic");

test("acoustic: in six and twelve the kit is restraint said in pulses: in every bar of time the kick is on the One and elsewhere only on the bar's other strong pulse (3, in twelve) or a pulse's last eighth; the snare and the cross-stick never on the One and never on a pulse's middle eighth, and no snare at all when the band is quiet; and wherever the hat or the shaker keeps time, they keep every eighth of the bar", {
  skip:
    only("acoustic").skip || !LIBRARY.some((chart) => isCompound(parse(chart.text).chart.meter)),
}, () => {
  const counted = new Map<string, number>();
  const KEEPERS = ["closedHat", "openHat", "shaker", "ride"];
  const played = [
    ...takes(itsOwn("acoustic")),
    ...(acoustic ? [...heldTakes(acoustic, "6/8"), ...heldTakes(acoustic, "12/8")] : []),
  ];
  for (const { chart, options, take } of played) {
    if (chart.meter !== "12/8" && chart.meter !== "6/8") continue;
    for (const { bar, kit, energy } of kitBars(take)) {
      if (bar.ending || bar.fill || bar.crash) continue;
      const where = `${chart.file} ${JSON.stringify(options)} bar ${bar.index}`;
      const steps = Math.round(bar.ticks / STEP);
      const strong = strongPulses(bar.meter).map((tick) => tick / STEP);
      const key = `${chart.meter} ${tierOf(energy)}`;
      counted.set(key, (counted.get(key) ?? 0) + 1);
      assert.ok(strikes(kit, "kick", 0), `${where}: no kick on the One`);
      for (const step of kit.get("kick") ?? [])
        assert.ok(strong.includes(step) || step % 6 === 4, `${where}: a kick at ${step}`);
      for (const voice of ["snare", "crossStick"])
        for (const step of kit.get(voice) ?? []) {
          assert.ok(step !== 0 && step % 6 !== 2, `${where}: the ${voice} at ${step}`);
          if (voice === "snare")
            assert.notEqual(tierOf(energy), "low", `${where}: a snare when quiet`);
        }
      const kept = new Set(KEEPERS.flatMap((voice) => [...(kit.get(voice) ?? [])]));
      if (kept.size === 0) continue;
      for (let step = 0; step < steps; step += 2)
        assert.ok(kept.has(step), `${where}: the time not kept on eighth ${step / 2 + 1}`);
    }
  }
  for (const meter of ["6/8", "12/8"])
    if (LIBRARY.some((chart) => chart.meter === meter && chart.file.startsWith("acoustic-")))
      for (const tier of ["low", "mid", "high"])
        assert.ok(
          (counted.get(`${meter} ${tier}`) ?? 0) > 20,
          `only ${counted.get(`${meter} ${tier}`) ?? 0} bars of ${meter} at ${tier}`,
        );
});
