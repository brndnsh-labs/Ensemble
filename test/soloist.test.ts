// Musical properties of the soloist, and of the piano around the soloist. See
// docs/TESTING.md, kind 2. Each test names its rule; none of them knows how the engine is built.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlanBar, Seat, Take } from "@ensemble/engine";
import {
  chordFamily,
  chordScale,
  chordTones,
  contextOf,
  displacedPhrases,
  isCompound,
  MEASURES,
  onPulse,
  PPQ,
  parse,
  pitchClass,
  plan,
  pulseTicks,
  render,
  SOLO_INSTRUMENTS,
  swing,
  tierOf,
  timedNotes,
  toMidi,
} from "@ensemble/engine";
import { chordsUnder, harmonyOf, POCKET, strikesOf } from "./reading.ts";
import {
  enough,
  FULL,
  type Jam,
  type JamSpec,
  notesOf,
  only,
  ownCharts,
  readSmf,
  SEEDS,
  STYLES,
  soloistTakes,
  stressTakes,
  takes,
  written,
} from "./takes.ts";

// ── the soloist ─────────────────────────────────────────────────────────────

test("the soloist is off unless asked for; asked for, it rests through the intro and a written ending, lays out and returns, and never solos more than three choruses in a row", () => {
  for (const style of STYLES) {
    for (const chart of ownCharts(style)) {
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

test("the soloist from the top: asked for in a jam, it has the lead from the first pass in every style, and its solos are those of a jam a pass longer, moved up past the band's pass (an open jam made longer keeps them); a song, and a chart with a section written for the solo, are played as they are without it", () => {
  const turns = (bars: readonly PlanBar[]) => {
    const byPass = new Map<number, string>();
    for (const bar of bars) {
      if (bar.kind === "music" && bar.section.role === "body") {
        byPass.set(bar.pass, JSON.stringify(bar.solo));
      }
    }
    return [...byPass.values()];
  };
  const soloSection =
    "title: Solo\nkey: C\n\n[A]\n| C | F | G | C |\n\n[Solo]\n| C | F | G | C |\n";
  for (const style of STYLES) {
    for (const chart of ownCharts(style)) {
      const written = parse(chart.text).chart;
      for (const passes of [1, 2, 3, 4, 6, 9]) {
        const where = `${style.id}, ${chart.file}, ${passes} passes`;
        const top = plan(written, style, { mode: "jam", passes, solo: true, soloFromTop: true });
        const first = top.bars.filter((bar) => bar.kind === "music" && bar.pass === 0);
        assert.ok(
          first.filter((bar) => bar.section.role === "body").every((bar) => bar.solo !== null),
          `${where}: the first pass is not the soloist's`,
        );
        const longer = plan(written, style, { mode: "jam", passes: passes + 1, solo: true });
        assert.deepEqual(turns(top.bars), turns(longer.bars).slice(1), `${where}: the solos`);
        const open = (n: number) =>
          turns(
            plan(written, style, {
              mode: "jam",
              open: true,
              passes: n,
              solo: true,
              soloFromTop: true,
            }).bars,
          );
        assert.deepEqual(open(passes + 1).slice(0, passes), open(passes), `${where}: open`);
      }
      const song = { mode: "song", solo: true } as const;
      assert.deepEqual(
        plan(written, style, { ...song, soloFromTop: true }),
        plan(written, style, song),
        `${style.id}, ${chart.file}: as a song`,
      );
    }
    const sectioned = parse(soloSection).chart;
    const jam = { mode: "jam", passes: 4, solo: true } as const;
    assert.deepEqual(
      plan(sectioned, style, { ...jam, soloFromTop: true }),
      plan(sectioned, style, jam),
      `${style.id}: a chart with a Solo section`,
    );
  }
});

test("the band builds with the solo: it never comes down from one chorus of a solo to the next, and under the last of three it is louder than under the first", () => {
  for (const style of STYLES) {
    for (const chart of ownCharts(style)) {
      const written = parse(chart.text).chart;
      for (const passes of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20]) {
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
          // A band that takes its breath under the middle of a solo is pulling against it.
          if (solo.chorus > 0) {
            assert.ok(
              mean(pass) >= mean(pass - 1) - 1e-9,
              `${chart.file}, ${passes} passes: the band comes down under the solo at pass ${pass}`,
            );
          }
          if (solo.chorus !== 0 || solo.of === 1) continue;
          const last = pass + solo.of - 1;
          const where = `${chart.file}, ${passes} passes, the solo from pass ${pass}`;
          assert.ok(mean(last) >= mean(pass) - 1e-9, `${where}: ${mean(pass)} then ${mean(last)}`);
          // Louder by a fiftieth of the range at least, less for a style that plays its arc
          // shallower: reggae's builds are heard in dynamics only, at half depth (ST-reggae-34).
          if (solo.of === 3) {
            assert.ok(
              mean(last) > mean(pass) + 0.02 * style.arc.depth,
              `${where}: no build under the solo`,
            );
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
    // A pickup into the solo's first phrase may start in the later half of the bar before it.
    const before = take.plan.bars[solo.bars[0]!.index - 1];
    const reach = before ? before.ticks / 2 : 0;
    solo.notes = all.filter(
      (note) => note.tick >= from - reach && note.tick < last.start + last.ticks,
    );
  }
  return solos;
}

/** Takes with the soloist asked for. */
const solo = (jam: JamSpec) => jam.options.solo === true;

const soloTakes = () => [...takes(solo), ...stressTakes(solo), ...soloistTakes()];

test("the soloist plays only where it has the lead (a pickup may lead in from half the bar before, where the band plays it), stays on its instrument, and is one voice", () => {
  let notes = 0;
  for (const { chart, options, take } of soloTakes()) {
    const solo = notesOf(take, "solo");
    const where = `${chart.file} seed ${options.seed}`;
    solo.forEach((note, i) => {
      notes++;
      const bar = take.plan.bars.findLast((candidate) => candidate.start <= note.tick)!;
      const next = take.plan.bars[bar.index + 1];
      const leadsIn =
        next?.solo && bar.kind === "music" && (next.start - note.tick) * 2 <= bar.ticks;
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
  assert.ok(notes > enough(5000), `only ${notes} solo notes`);
});

test("the soloist lands the changes: a note struck where a chord arrives is a tone of that chord, and a note held across a change on a beat is a tone of the new chord", () => {
  let landings = 0;
  for (const { style, chart, options, take } of soloTakes()) {
    const solo = notesOf(take, "solo");
    // A soloist the style lays back is late everywhere, the change included, and the comp with
    // it: a note is held across a change by what it has left once that lay-back is set aside.
    const laidBack = (Math.max(0, style.feel.lean.solo) / 1000) * (take.plan.quarters / 60) * PPQ;
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
          note.tick + note.offset - laidBack + note.duration > arrival.tick + POCKET;
        if (!struck && !held) continue;
        landings++;
        assert.ok(
          tones.has(note.pitch % 12),
          `${where}: ${note.pitch} ${struck ? "struck" : "held"}`,
        );
      }
    }
  }
  // A reggae line enters after the One and rests on the drop (ST-reggae-25), so few of its
  // notes are struck where a chord arrives: about 300 on the full run, where funk's and
  // disco's are about 2,000 each. The floor is well under that, for a library that grows.
  assert.ok(landings > enough(200), `only ${landings} landings`);
});

test("a solo breathes and keeps going: no silence inside it reaches three bars (in six-eight, where a bar is two pulses, three bars of four pulses: the same stretch of time), and it has one top note, in its last chorus", () => {
  let solos = 0;
  for (const { chart, options, take } of soloTakes()) {
    for (const { bars, notes } of solosOf(take)) {
      const where = `${chart.file} seed ${options.seed}, the solo from bar ${bars[0]!.index}`;
      assert.ok(notes.length > 0, `${where}: a solo with no notes`);
      solos++;
      // A bar of dotted pulses shorter than four of them (6/8) is counted as a bar of four: at
      // disco's tempo a bar of six is a second long, and three of them are no silence at all.
      const barTicks = isCompound(bars[0]!.meter)
        ? Math.max(bars[0]!.ticks, 4 * 1.5 * PPQ)
        : bars[0]!.ticks;
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
  assert.ok(solos > enough(40), `only ${solos} solos`);
});

/**
 * How much of its lead a take's soloist plays: the seconds it has the lead, the notes it
 * strikes in them, and the seconds some note of it is sounding.
 */
function leadOf(take: Take): { lead: number; notes: number; sounding: number } {
  const seconds = (ticks: number) => (ticks / PPQ) * (60 / take.plan.quarters);
  const solo = notesOf(take, "solo");
  let [lead, notes, sounding] = [0, 0, 0];
  for (const bar of take.plan.bars) {
    if (bar.kind !== "music" || !bar.solo) continue;
    const [from, to] = [bar.start, bar.start + bar.ticks];
    lead += seconds(bar.ticks);
    let reach = from;
    for (const note of solo) {
      if (note.tick >= to) break;
      if (note.tick >= from) notes++;
      const [a, b] = [Math.max(reach, note.tick), Math.min(to, note.tick + note.duration)];
      if (b > a) sounding += seconds(b - a);
      reach = Math.max(reach, Math.min(to, note.tick + note.duration));
    }
  }
  return { lead, notes, sounding };
}

/**
 * The least a style's soloist plays of its lead, over its own charts at their own tempo
 * with the band's own arc (a jam of four passes: the band, then a solo of three choruses):
 * notes a second, and the share of its lead some note of it sounds. Set between what it
 * played when it was first written and what it plays now (`scripts/solo-density.ts`).
 */
const PLAYS: Readonly<Record<string, { readonly perSecond: number; readonly sounding: number }>> = {
  blues: { perSecond: 1.65, sounding: 0.695 },
  funk: { perSecond: 1.69, sounding: 0.37 },
  jazz: { perSecond: 2.45, sounding: 0.63 },
  rock: { perSecond: 1.77, sounding: 0.715 },
  disco: { perSecond: 2.23, sounding: 0.66 },
  neosoul: { perSecond: 1.14, sounding: 0.58 },
  reggae: { perSecond: 0.9, sounding: 0.557 },
  acoustic: { perSecond: 1.27, sounding: 0.648 },
};

test("the soloist is not sparse: over a style's own charts at their own tempo, with the band's own arc, it plays at least the style's notes a second while it has the lead, and some note of it sounds through at least the style's share of the lead", () => {
  for (const style of STYLES) {
    const floor = PLAYS[style.id];
    if (!floor) continue;
    const own = takes(
      (jam) =>
        jam.style === style &&
        jam.options.solo === true &&
        jam.options.passes === 4 &&
        jam.options.tempo === undefined &&
        jam.options.energy === undefined,
    );
    assert.ok(own.length >= 6, `${style.id}: only ${own.length} takes`);
    const sum = { lead: 0, notes: 0, sounding: 0 };
    for (const { take } of own) {
      const played = leadOf(take);
      sum.lead += played.lead;
      sum.notes += played.notes;
      sum.sounding += played.sounding;
    }
    const [perSecond, sounding] = [sum.notes / sum.lead, sum.sounding / sum.lead];
    assert.ok(
      perSecond >= floor.perSecond,
      `${style.id}: ${perSecond.toFixed(2)} notes a second, under ${floor.perSecond}`,
    );
    assert.ok(
      sounding >= floor.sounding,
      `${style.id}: sounding through ${sounding.toFixed(3)} of the lead, under ${floor.sounding}`,
    );
  }
});

// ── how busy, as the player sets it ─────────────────────────────────────────

/**
 * The player's setting for how busy the soloist is, at each quarter of its travel; on a
 * push, at its ends and its middle, which is where the suite's time goes (each setting is
 * fifteen takes a style).
 */
const SETTINGS: readonly number[] = FULL ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.5, 1];

/**
 * A style's own charts (five at most) as one solo of three choruses from the top, on three
 * seeds, at each setting: the bass and the soloist only, since the soloist hears the bass and nothing else
 * (what it plays is the same note for note with the band all there), which is a third of
 * what a whole take costs.
 */
const settled = new Map<string, Take[][]>();
function atSettings(style: Jam["style"]): Take[][] {
  let found = settled.get(style.id);
  if (!found) {
    found = ownCharts(style)
      .slice(0, 5)
      .flatMap((chart) =>
        [1, 2, 3].map((seed) =>
          SETTINGS.map((setting) =>
            render(chart.text, style, {
              mode: "jam",
              passes: 3,
              solo: true,
              soloFromTop: true,
              seed,
              without: ["drums", "chords"],
              ...(setting === 0.5 ? {} : { soloDensity: setting }),
            }),
          ),
        ),
      );
    settled.set(style.id, found);
  }
  return found;
}

test("the player's setting moves the soloist all the way along: over a style's own charts, notes a second and the share of the lead it sounds never go down from 0 to a quarter, a half, three quarters and 1 by more than a hundredth, and at 1 it plays a tenth more notes a second than at 0 or more", () => {
  for (const style of STYLES) {
    const sums = SETTINGS.map(() => ({ lead: 0, notes: 0, sounding: 0 }));
    for (const takes of atSettings(style)) {
      takes.forEach((take, i) => {
        const played = leadOf(take);
        sums[i]!.lead += played.lead;
        sums[i]!.notes += played.notes;
        sums[i]!.sounding += played.sounding;
      });
    }
    const perSecond = sums.map((sum) => sum.notes / sum.lead);
    const sounding = sums.map((sum) => sum.sounding / sum.lead);
    const said = `${style.id}: ${perSecond.map((n) => n.toFixed(2)).join(", ")} notes a second; sounding ${sounding.map((n) => n.toFixed(3)).join(", ")}`;
    for (let i = 1; i < SETTINGS.length; i++) {
      // A pickup lives in the room a phrase leaves, so a setting that gives up room gives up
      // some of the pickups in it: notes a second may fall by a hundredth of themselves at
      // most, and the share sounding by a hundredth of the lead.
      assert.ok(
        perSecond[i]! >= perSecond[i - 1]! * 0.99,
        `${said}: fewer notes at ${SETTINGS[i]}`,
      );
      assert.ok(
        sounding[i]! >= sounding[i - 1]! - 0.01,
        `${said}: less sounding at ${SETTINGS[i]}`,
      );
    }
    assert.ok(perSecond.at(-1)! >= perSecond[0]! * 1.1, `${said}: the ends are too close`);
  }
});

/** The first of a style's own charts and its first in another meter, the whole band, at the ends of the setting, in the middle, and with it left out. */
const banded = new Map<string, { chart: string; takes: Take[] }[]>();
function bandAt(style: Jam["style"]): { chart: string; takes: Take[] }[] {
  let found = banded.get(style.id);
  if (!found) {
    const own = ownCharts(style);
    const charts = [own.find((chart) => chart.meter === "4/4"), own.find((c) => c.meter !== "4/4")];
    found = charts
      .filter((chart) => chart !== undefined)
      .map((chart, c) => {
        const options = {
          mode: "jam",
          passes: 3,
          solo: true,
          soloFromTop: true,
          seed: 1 + c,
        } as const;
        return {
          chart: chart.file,
          takes: [undefined, 0, 0.5, 1].map((setting) =>
            render(
              chart.text,
              style,
              setting === undefined ? options : { ...options, soloDensity: setting },
            ),
          ),
        };
      });
    banded.set(style.id, found);
  }
  return found;
}

test("the setting at its middle is the style's own: a take with it at 0.5 is the take with it left out, note for note", () => {
  for (const style of STYLES) {
    for (const { chart, takes } of bandAt(style)) {
      assert.deepEqual(takes[2]!.events, takes[0]!.events, `${style.id}, ${chart}`);
    }
  }
});

test("the setting is the soloist's alone: at every setting the drums and the bass play the same notes, and so does a comp that does not listen to the soloist", () => {
  for (const style of STYLES) {
    const seats: Seat[] = [
      "drums",
      "bass",
      ...(style.chords.listening === null ? (["chords"] as const) : []),
    ];
    for (const { chart, takes } of bandAt(style)) {
      for (const seat of seats) {
        const band = takes.map((take) => notesOf(take, seat));
        for (let i = 1; i < band.length; i++) {
          assert.deepEqual(band[i], band[0], `${style.id}, ${chart}: the ${seat}`);
        }
      }
    }
  }
});

test("tempo is felt in the pulse: at the same pulse the soloist plays as many notes a pulse in six-eight, in three and in 6/4 as in four, nine tenths as many at least, at each style's working level", () => {
  const chart = (meter: string) =>
    `title: Pulse\nkey: C\ntempo: 70\nmeter: ${meter}\n\n[A]\n| C7 | F7 | C7 | C7 |\n| F7 | F7 | C7 | C7 |\n| G7 | F7 | C7 | G7 |\n`;
  for (const style of STYLES) {
    const perPulse = (meter: string) => {
      let [notes, pulses] = [0, 0];
      for (const seed of [1, 2]) {
        const take = render(chart(meter), style, {
          mode: "jam",
          passes: 3,
          solo: true,
          soloFromTop: true,
          energy: 0.55,
          seed,
          // The soloist hears the bass and nothing else: the rest of the band is not needed here.
          without: ["drums", "chords"],
        });
        const lead = take.plan.bars.filter((bar) => bar.kind === "music" && bar.solo);
        pulses += lead.reduce((sum, bar) => sum + pulseTicks(bar.meter).length, 0);
        const end = lead.at(-1)!.start + lead.at(-1)!.ticks;
        notes += notesOf(take, "solo").filter(
          (note) => note.tick >= lead[0]!.start && note.tick < end,
        ).length;
      }
      return notes / pulses;
    };
    const four = perPulse("4/4");
    // A bar of six beats is played from the style's own rhythms only where it has written them:
    // a rhythm of four in a bar of six leaves two beats of it empty, whatever the tempo.
    const meters = ["6/8", "3/4", ...(style.solo.meters?.["6/4"] ? ["6/4"] : [])];
    for (const meter of meters) {
      const here = perPulse(meter);
      assert.ok(
        here >= four * 0.9,
        `${style.id}: ${here.toFixed(2)} notes a pulse in ${meter}, ${four.toFixed(2)} in 4/4`,
      );
    }
  }
});

test("a three-chorus solo builds: its last chorus has more notes than its first, in nine solos in ten", () => {
  let built = 0;
  let solos = 0;
  for (const { style, take } of takes(solo)) {
    // A pickup is counted with the chorus it leads into.
    const leads = new Map<unknown, number>();
    for (const start of startsOf(take, style)) {
      for (const note of start.lead) leads.set(note, start.into.start);
    }
    for (const { bars, notes } of solosOf(take)) {
      if (bars[0]!.solo!.of !== 3) continue;
      const inChorus = (chorus: number) => {
        const own = bars.filter((bar) => bar.solo!.chorus === chorus);
        const from = own[0]!.start;
        const to = own.at(-1)!.start + own.at(-1)!.ticks;
        return notes.filter((note) => {
          const at = leads.get(note) ?? note.tick;
          return at >= from && at < to;
        }).length;
      };
      solos++;
      if (inChorus(2) > inChorus(0)) built++;
    }
  }
  assert.ok(solos > enough(30), `only ${solos} three-chorus solos`);
  assert.ok(built >= solos * 0.9, `${built} of ${solos} solos built`);
});

test("a solo that runs into the ending ends with the band: its last note is struck where the final chord lands (and once more with the band's button), on that chord's root, third or fifth", () => {
  let endings = 0;
  for (const { chart, options, take } of soloTakes()) {
    const last = take.plan.bars.findLast((bar) => bar.kind === "music")!;
    if (!last.ending || !last.solo) continue;
    const final = last.spans.findLast((span) => span.chord !== null)?.chord;
    const landing = last.start + last.ending.at;
    const landed = notesOf(take, "solo").filter((other) => other.tick >= landing);
    const note = landed.at(-1);
    const where = `${chart.file} seed ${options.seed}`;
    assert.ok(final && note, `${where}: no last note`);
    endings++;
    assert.equal(landed[0]!.tick, landing, `${where}: the last note is not on the final chord`);
    const allowed = last.ending.gesture.kind === "button" ? 2 : 1;
    assert.ok(landed.length <= allowed, `${where}: ${landed.length} notes on the final chord`);
    assert.equal(note.pitch, landed[0]!.pitch, `${where}: the button is not the last note again`);
    const resting = chordTones(final.quality)
      .filter((tone) => ["root", "third", "fifth"].includes(tone.role))
      .map((tone) => (pitchClass(final.root) + tone.interval) % 12);
    assert.ok(
      resting.includes(note.pitch % 12),
      `${where}: ends on ${note.pitch} over ${final.text}`,
    );
    // The top of a solo is the phrase before its last, not the note it goes home on (SO-05).
    const solo = solosOf(take).at(-1)!.notes;
    if (solo.length >= 12) {
      const highest = Math.max(...solo.map((other) => other.pitch));
      assert.ok(note.pitch < highest, `${where}: the solo ends on its top note`);
    }
  }
  // At least: on the full run funk meets exactly 80, since a sixth style's charts took its
  // borrowed charts from eleven to nine (`otherCharts` in takes.ts).
  assert.ok(endings >= enough(80), `only ${endings} endings with the soloist`);
});

test("the soloist plays no wrong note on a beat or held: nothing a half step over a chord tone unless the chord's scale has it, and no major seventh on a chord without one", () => {
  let judged = 0;
  for (const { chart, options, take } of soloTakes()) {
    const harmony = harmonyOf(take);
    const bars = take.plan.bars;
    let at = 0;
    let bar = 0;
    for (const note of notesOf(take, "solo")) {
      while (harmony[at + 1] && harmony[at + 1]!.tick <= note.tick) at++;
      while (bars[bar + 1] && bars[bar + 1]!.start <= note.tick) bar++;
      const measure = bars[bar]!;
      // A beat is the bar's pulse: a quarter note, or in six-eight and twelve-eight a dotted one.
      const onBeat = onPulse(measure.meter, note.tick - measure.start);
      if (!onBeat && note.duration < PPQ * 0.75) continue;
      // A note struck in the eighth before a change and held over it is the new chord's
      // (X-B-07); one struck where its own chord arrives is that chord's, however soon the
      // next one comes.
      const next = harmony[at + 1];
      const leans =
        next?.changed &&
        harmony[at]!.tick !== note.tick &&
        next.tick - note.tick <= PPQ / 2 &&
        // By more than swing lengthens an eighth on the beat: the change swings with it. A bar
        // of dotted pulses is not swung, so there any of it held over is held over: an A struck
        // an eighth before an F9 in six and held into it is the F9's third, not a B-flat nine's
        // major seventh.
        note.tick + note.duration > next.tick + (measure.meter.unit === 4 ? PPQ / 4 : 0);
      const arrival = leans ? next : harmony[at]!;
      const chord = arrival.chord;
      if (!chord) continue;
      judged++;
      const root = pitchClass(chord.root);
      const tones = chordTones(chord.quality).map((tone) => (root + tone.interval) % 12);
      const pc = note.pitch % 12;
      if (tones.includes(pc)) continue;
      const scale = chordScale(chord, contextOf(harmony, arrival));
      if (scale.intervals.some((interval) => (root + interval) % 12 === pc)) continue;
      const where = `${chart.file} seed ${options.seed} ${JSON.stringify(options)} bar ${measure.index}: ${note.pitch} over ${chord.text}`;
      assert.ok(!tones.includes((pc + 11) % 12), `${where}: a half step over a chord tone`);
      assert.notEqual(pc, (root + 11) % 12, `${where}: the major seventh`);
    }
  }
  assert.ok(judged > enough(5000), `only ${judged} notes judged`);
});

test("a phrase is followed by a breath: the soloist leaves the style's breath of air before the next phrase, a pickup into it included, at any tempo", () => {
  const breathes = MEASURES.find((measure) => measure.id === "solo.phrases-breathe")!;
  let joins = 0;
  for (const { style, chart, options, take } of soloTakes()) {
    const measured = breathes.of(take, style);
    if (!measured) continue;
    joins += measured.cases;
    assert.equal(
      measured.value,
      1,
      `${chart.file} ${JSON.stringify(options)}: ${Math.round((1 - measured.value) * measured.cases)} of ${measured.cases} phrases run into the next`,
    );
  }
  assert.ok(joins > enough(600), `only ${joins} phrase joins`);
});

// ── how a phrase starts ─────────────────────────────────────────────────────

/**
 * How a take's phrases start, read from its notes: a phrase is what the soloist plays after a
 * breath (the style's, less a tenth for the player's own timing, or a horn's own). It starts
 * before its barline (led in: struck in the later half of a bar and running on without a
 * breath into a note on the next downbeat, SO-36), on the barline, or after it. `into` is the
 * bar the phrase's line is in; `lead` the notes before its barline.
 */
interface Start {
  readonly kind: "before" | "on" | "after";
  readonly into: PlanBar;
  readonly lead: ReturnType<typeof notesOf>;
}
const startsRead = new WeakMap<Take, Start[]>();
function startsOf(take: Take, style: Jam["style"]): Start[] {
  const known = startsRead.get(take);
  if (known) return known;
  const notes = notesOf(take, "solo");
  const bars = take.plan.bars;
  const instrument = SOLO_INSTRUMENTS[notes[0]?.voice ?? ""];
  const perTick = 60 / take.plan.quarters / PPQ;
  const owed = (Math.max(style.solo.space.breath, instrument?.breath?.takes ?? 0) * 0.9) / perTick;
  const ends = (i: number) => notes[i]!.tick + notes[i]!.duration;
  const starts: Start[] = [];
  let b = 0;
  notes.forEach((note, i) => {
    while (bars[b + 1] && bars[b + 1]!.start <= note.tick) b++;
    if (i > 0 && note.tick - ends(i - 1) < owed) return;
    const bar = bars[b]!;
    const next = bars[b + 1];
    const inBar = note.tick - bar.start;
    if (inBar > 0 && inBar * 2 >= bar.ticks && next) {
      let j = i;
      while (notes[j + 1] && notes[j + 1]!.tick < next.start && notes[j + 1]!.tick - ends(j) < owed)
        j++;
      const onto = notes[j + 1];
      if (onto?.tick === next.start && onto.tick - ends(j) < owed) {
        starts.push({ kind: "before", into: next, lead: notes.slice(i, j + 1) });
        return;
      }
    }
    starts.push({ kind: inBar === 0 ? "on" : "after", into: bar, lead: [] });
  });
  const inLead = starts.filter((start) => start.into.solo !== null);
  startsRead.set(take, inLead);
  return inLead;
}

/**
 * The least share of a style's phrases started after a breath that are led in from before the
 * barline, over every take with the soloist (SO-39: jazz 20 to 30 percent, the blues 25 to 50;
 * a style where it is seldom still does it).
 */
const LED_IN: Readonly<Record<string, number>> = {
  jazz: 0.18,
  blues: 0.13,
  rock: 0.1,
  funk: 0.05,
  disco: 0.05,
  neosoul: 0.015,
  // A reggae line starts after the One (ST-reggae-25): it leads in, but seldom.
  reggae: 0,
  acoustic: 0.08,
};

test("the soloist leads phrases in: of the phrases it starts after a breath, at least the style's share start before their barline, from the end of the bar before", () => {
  for (const style of STYLES) {
    const floor = LED_IN[style.id];
    if (floor === undefined) continue;
    let [phrases, before] = [0, 0];
    for (const { take } of soloTakes().filter((jam) => jam.style === style)) {
      for (const start of startsOf(take, style)) {
        phrases++;
        if (start.kind === "before") before++;
      }
    }
    assert.ok(phrases > enough(300), `${style.id}: only ${phrases} phrases`);
    assert.ok(
      before >= Math.max(1, phrases * floor),
      `${style.id}: ${before} of ${phrases} phrases led in (${((100 * before) / phrases).toFixed(1)}%), under ${100 * floor}%`,
    );
  }
});

test("the top of a chorus, and of the solo, is led into some of the time: from the band's last bar, the soloist's chorus before or the turnaround, wherever the band plays that bar; never from a count-in, and never by more than half a bar", () => {
  for (const style of STYLES) {
    let [allowed, tops, led, firsts, firstsLed] = [0, 0, 0, 0, 0];
    for (const { take } of soloTakes().filter((jam) => jam.style === style)) {
      const into = new Map(startsOf(take, style).map((start) => [start.into.index, start]));
      for (const bar of take.plan.bars) {
        const before = take.plan.bars[bar.index - 1];
        if (!bar.solo || (before?.solo && before.solo.chorus === bar.solo.chorus)) continue;
        if (before?.kind !== "music" || before.ending) continue;
        allowed++;
        const start = into.get(bar.index);
        if (start?.kind !== "before" && start?.kind !== "on") continue;
        tops++;
        if (start.kind === "before") led++;
        if (!before.solo) {
          firsts++;
          if (start.kind === "before") firstsLed++;
        }
      }
      for (const start of startsOf(take, style)) {
        if (start.kind !== "before") continue;
        const from = start.into.start - start.lead[0]!.tick;
        assert.ok(
          from * 2 <= take.plan.bars[start.into.index - 1]!.ticks,
          `${style.id}: a pickup of ${from / PPQ} beats`,
        );
      }
    }
    // A pickup into a phrase is drawn as often as the style leads in at all; at a chorus's top
    // it needs only the air the bar before has, which is most of the time. A reggae line
    // starts after the One (ST-reggae-25), so few of its tops are entered on the bar or before.
    const floor = (LED_IN[style.id] ?? 0) / 2;
    assert.ok(
      led >= Math.floor(tops * floor),
      `${style.id}: ${led} of ${tops} chorus tops led into`,
    );
    // Asked of a style that leads in as a habit: reggae's floor is none, here as above.
    if (floor > 0 && firsts >= enough(12)) {
      assert.ok(firstsLed > 0, `${style.id}: none of ${firsts} solos led into`);
    }
    assert.ok(allowed > enough(60), `${style.id}: only ${allowed} chorus tops`);
  }
  // From the top of a jam the bar before the solo is the count-in: nothing is played there.
  for (const style of STYLES) {
    for (const takes of atSettings(style)) {
      for (const take of takes) {
        const counted = take.plan.bars.filter((bar) => bar.kind === "count-in");
        for (const bar of counted) {
          const inIt = notesOf(take, "solo").filter(
            (note) => note.tick >= bar.start && note.tick < bar.start + bar.ticks,
          );
          assert.equal(inIt.length, 0, `${style.id}: ${inIt.length} solo notes in the count-in`);
        }
      }
    }
  }
});

test("a pickup spells the chord it is played over: each note of a pickup into a phrase of the form on a beat, or held, is a tone of that chord (the bar before's, not the phrase's), or of the chord it is held into", () => {
  let judged = 0;
  for (const { style, chart, options, take } of soloTakes()) {
    const harmony = harmonyOf(take);
    for (const start of startsOf(take, style)) {
      // Into the first bar of a phrase of the form, where the bar before is a phrase's last,
      // which ends on a long note and a breath: what starts late in it and runs into the
      // downbeat is a pickup, not a line that started late.
      if (start.kind !== "before" || start.into.phrase.bar !== 0) continue;
      for (const note of start.lead) {
        const bar = take.plan.bars[start.into.index - 1]!;
        const onBeat = onPulse(bar.meter, note.tick - bar.start);
        if (!onBeat && note.duration < PPQ * 0.75) continue;
        const at = harmony.findLastIndex((arrival) => arrival.tick <= note.tick);
        const next = harmony[at + 1];
        const leans =
          next?.changed &&
          harmony[at]!.tick !== note.tick &&
          next.tick - note.tick <= PPQ / 2 &&
          note.tick + note.duration > next.tick;
        const chord = (leans ? next : harmony[at])?.chord;
        if (!chord) continue;
        judged++;
        const tones = chordTones(chord.quality).map(
          (tone) => (pitchClass(chord.root) + tone.interval) % 12,
        );
        assert.ok(
          tones.includes(note.pitch % 12),
          `${chart.file} ${JSON.stringify(options)} bar ${bar.index}: a pickup's ${note.pitch} over ${chord.text}`,
        );
      }
    }
  }
  // Neo-soul's pickups are all on the "e"s and "a"s, and reggae seldom leads in: in those
  // there is little or nothing on a beat to judge.
  const judging = STYLES.filter((style) => !["neosoul", "reggae"].includes(style.id)).length;
  assert.ok(judged >= enough(5) * judging, `only ${judged} pickup notes on a beat or held`);
});

// ── an idea said again a beat early or late ─────────────────────────────────

/**
 * The least share of a style's phrases (of three notes or more, after a solo's first) that
 * say an earlier idea of the solo again a pulse early or late, over every take with the
 * soloist: each style does it, the ones whose line is built on a riff or a call seldom.
 */
const DISPLACED: Readonly<Record<string, number>> = {
  jazz: 0.02,
  blues: 0.015,
  rock: 0.01,
  funk: 0.02,
  disco: 0.006,
  neosoul: 0.02,
  reggae: 0.015,
  acoustic: 0.003,
};

test("an idea comes back a beat early or late: in every style some phrases say an earlier one of the solo again, the same rhythm and contour moved by one of the bar's pulses; only at the levels the style says; never the top of a chorus, the solo's first or last phrase, nor the tune's last; and the idea so moved stays inside its own phrase's bars and the tune, led in by no pickup", () => {
  for (const style of STYLES) {
    const floor = DISPLACED[style.id];
    if (floor === undefined) continue;
    let [phrases, moved] = [0, 0];
    for (const { chart, options, take } of soloTakes().filter((jam) => jam.style === style)) {
      const counted = MEASURES.find((measure) => measure.id === "solo.displaced")!.of(take, style);
      if (!counted) continue;
      phrases += counted.cases;
      const end = take.plan.bars.findLast((bar) => bar.kind === "music")!;
      for (const { phrase, of, by } of displacedPhrases(take, style)) {
        moved++;
        const { slot, notes } = phrase;
        const where = `${style.id}, ${chart.file} ${JSON.stringify(options)}, bar ${slot.bars[0]!.index}`;
        assert.ok(of && by, `${where}: a displaced phrase with nothing it repeats`);
        const levels = style.solo.habits.displace.levels;
        assert.ok(
          !levels || levels.includes(slot.level.name),
          `${where}: displaced at the ${slot.level.name} level`,
        );
        assert.notEqual(slot.index, 0, `${where}: the top of a chorus moved`);
        assert.ok(!slot.first && !slot.last, `${where}: the solo's first or last phrase moved`);
        const lastBar = slot.bars.at(-1)!;
        assert.equal(lastBar.ending, null, `${where}: the tune's last phrase moved`);
        assert.ok(
          notes.every((note) => note.tick >= slot.bars[0]!.start),
          `${where}: led into before its barline`,
        );
        const stops = Math.min(lastBar.start + lastBar.ticks, end.start + end.ticks);
        assert.ok(
          notes.every((note) => note.ends <= stops),
          `${where}: a note past the end of its phrase`,
        );
      }
    }
    assert.ok(phrases > enough(300), `${style.id}: only ${phrases} phrases`);
    assert.ok(
      moved >= Math.max(1, phrases * floor),
      `${style.id}: ${moved} of ${phrases} phrases an idea displaced (${((100 * moved) / phrases).toFixed(1)}%), under ${100 * floor}%`,
    );
  }
});

test("a horn breathes: the alto never plays eight seconds without half a second of air, as heard", () => {
  const horn = (take: Take, tempo: number, where: string) => {
    const perTick = 60 / tempo / PPQ;
    const notes = notesOf(take, "solo");
    assert.ok(notes.length > 0 && notes.every((note) => note.voice === "alto-sax"), where);
    let since = notes[0]!.tick;
    for (let i = 1; i < notes.length; i++) {
      const before = notes[i - 1]!;
      // As heard: where each note really starts and stops, swing and all.
      const starts = notes[i]!.tick + notes[i]!.offset;
      const air = (starts - (before.tick + before.offset + before.duration)) * perTick;
      // A tenth of the breath is the player's own timing.
      if (air >= 0.45) since = starts;
      const blown = (starts + notes[i]!.duration - since) * perTick;
      assert.ok(blown <= 8.5, `${where}: ${blown.toFixed(1)} s on one breath`);
    }
  };
  for (const style of STYLES) {
    for (const [c, chart] of ownCharts(style).entries()) {
      // On a push, slow and medium by turns.
      for (const tempo of [66, 120].filter((_, t) => FULL || (c + t) % 2 === 0)) {
        const take = render(chart.text, style, {
          mode: "jam",
          passes: 4,
          seed: 3,
          solo: true,
          tempo,
          soloInstrument: "alto-sax",
        });
        horn(take, take.plan.quarters, `${chart.file} at ${tempo}`);
      }
    }
  }
  for (const { chart, options, take } of soloistTakes()) {
    if (options.soloInstrument !== "alto-sax") continue;
    horn(take, take.plan.quarters, `${chart.file} ${JSON.stringify(options)}`);
  }
  // Very slow, over eight chords a bar: a note cut at a change of chord on an "and" leaves a
  // breath on paper that swing takes back.
  const { style, chart } = stressTakes().find((jam) => jam.chart.file === "awkward.chart")!;
  for (const seed of [1, 5]) {
    const take = render(chart.text, style, {
      mode: "jam",
      passes: 4,
      seed,
      solo: true,
      tempo: 50,
      soloInstrument: "alto-sax",
    });
    horn(take, 50, `${chart.file} at 50, seed ${seed}`);
  }
});

const bendsIn = ({ solo }: Jam["style"]) =>
  solo.habits.bend.third + solo.habits.bend.rootOrFifth > 0;

/**
 * Every instrument whose hand can move a pitch, in a style where it is not the soloist
 * already: the takes the other properties read are on each style's own soloist and the
 * horn. On a push, each chart on one seed where the style bends, and every other chart
 * where it only shakes. Rendered once, for every property of a guitar's hand.
 */
let handedCache: Jam[] | undefined;
function handedTakes(): Jam[] {
  const moving = Object.entries(SOLO_INSTRUMENTS).filter(([, hand]) => hand.bend || hand.shake);
  handedCache ??= STYLES.flatMap((style) =>
    moving
      .filter(([soloInstrument]) => soloInstrument !== style.solo.instrument)
      .flatMap(([soloInstrument]) =>
        ownCharts(style).flatMap((chart, c) =>
          SEEDS.filter((_, s) => FULL || (s === c % 2 && (bendsIn(style) || c % 4 < 2))).map(
            (seed): Jam => {
              const options = { mode: "jam", passes: 4, seed, solo: true, soloInstrument } as const;
              return { style, chart, options, take: render(chart.text, style, options) };
            },
          ),
        ),
      ),
  );
  return handedCache;
}

/** A glide that stands on frets and jumps between them: a slide. A bend, a scoop and a fall are two points. */
const stepped = (glide: readonly { at: number; semitones: number }[] | undefined) =>
  glide !== undefined && glide.length > 2;

test("a guitar bends only into a note a phrase lands on (one struck where the chord changes, or the last before a breath), of an eighth or longer and never in the bar the band ends on: a half step up into a major third, or a whole step up into a root or a fifth of a quarter or longer (the solo's top note from the scale note under it, whatever tone it is, in two solos in three at least), in a tenth of a second; it shakes only a note held as long as the style asks; a style that does not bend does not; and a vibraphone does neither (the horn has its own)", () => {
  const PLAIN = ["vibraphone"];
  let [bent, shaken, plain] = [0, 0, 0];
  // Solos on a hand that bends in a style that does, and how many push up into their top note.
  let [solos, topped] = [0, 0];
  for (const { style, chart, options, take } of [...soloTakes(), ...handedTakes()]) {
    const harmony = harmonyOf(take);
    const notes = notesOf(take, "solo");
    const bars = take.plan.bars;
    const perSecond = (take.plan.quarters * PPQ) / 60;
    const { habits, space, touch } = style.solo;
    let [at, b] = [0, 0];
    const top = Math.max(...notes.map((note) => note.pitch));
    if (bendsIn(style) && notes.some((note) => SOLO_INSTRUMENTS[note.voice ?? ""]?.bend)) {
      solos++;
      if (notes.some((note) => note.pitch === top && note.move?.glide && !stepped(note.move.glide)))
        topped++;
    }
    notes.forEach((note, i) => {
      const hand = SOLO_INSTRUMENTS[note.voice ?? ""]!;
      // A horn's pitch moves its own way: the property after this one.
      if (hand.shake?.on === "last") return;
      const where = `${chart.file} ${JSON.stringify(options)} at tick ${note.tick}: ${note.pitch}`;
      const { vibrato } = note.move ?? {};
      // A slide has a property of its own, after this one.
      const glide = stepped(note.move?.glide) ? undefined : note.move?.glide;
      if (PLAIN.includes(note.voice ?? "")) {
        plain++;
        assert.equal(note.move, undefined, `${where}: the pitch of a ${hand.name} moved`);
      }
      if (!glide && !vibrato) return;
      while (harmony[at + 1] && harmony[at + 1]!.tick <= note.tick) at++;
      while (bars[b + 1] && bars[b + 1]!.start <= note.tick) b++;
      const bar = bars[b]!;
      // How long a note of some length in the rhythm sounds from here, played legato and swung.
      const within = note.tick - bar.start;
      const swung = (tick: number) => (bar.meter.unit === 4 ? swing(tick, style.feel) : tick);
      const sounds = (ticks: number) =>
        Math.round(swung(within + ticks * touch.legato) - swung(within)) - 1;

      if (glide) {
        bent++;
        assert.ok(hand.bend, `${where}: a bend on the ${hand.name}`);
        assert.ok(
          habits.bend.third > 0 || habits.bend.rootOrFifth > 0,
          `${where}: a bend in a style that does not bend`,
        );
        // Struck flat and pushed up to the note, and nothing else: no release.
        const [from, to] = glide;
        assert.ok(glide.length === 2 && from!.at === 0 && to!.semitones === 0, `${where}: a glide`);
        assert.ok(
          Math.abs(to!.at / perSecond - hand.bend.takes) < 1e-6,
          `${where}: a bend that takes ${(to!.at / perSecond).toFixed(3)} s`,
        );
        const up = -from!.semitones;
        assert.ok(up === 1 || up === 2, `${where}: bent up ${up} semitones`);

        // The chord it is struck over, or the one it leans into from the eighth before.
        const next = harmony[at + 1];
        const leans =
          next?.changed &&
          next.tick - note.tick <= PPQ / 2 &&
          note.tick + note.duration > next.tick;
        const roles = [harmony[at], next?.changed && next.tick - note.tick <= PPQ / 2 ? next : null]
          .flatMap((arrival) => (arrival?.chord ? [arrival.chord] : []))
          .flatMap((chord) =>
            chordTones(chord.quality)
              .filter((tone) => (pitchClass(chord.root) + tone.interval) % 12 === note.pitch % 12)
              .map((tone) => `${tone.role} ${tone.interval % 12}`),
          );
        // The solo's top note is pushed up from the scale note under it, whatever tone it is.
        assert.ok(
          note.pitch === top ||
            (up === 1
              ? roles.includes("third 4")
              : roles.includes("root 0") || roles.includes("fifth 7")),
          `${where}: bent up ${up} into ${roles.join(", ") || "no chord tone"}`,
        );

        const after = notes[i + 1];
        const air = (after ? after.tick : Infinity) - (note.tick + note.duration);
        const breath = Math.min(PPQ - PPQ / 6, space.breath * 0.9 * perSecond);
        assert.ok(
          (harmony[at]!.tick === note.tick && harmony[at]!.changed) || leans || air >= breath,
          `${where}: a bend into a passing note`,
        );
        assert.ok(
          note.duration >= sounds(up === 1 ? PPQ / 2 : PPQ),
          `${where}: bent up ${up} into a note ${note.duration} ticks long`,
        );
        assert.equal(bar.ending, null, `${where}: a bend in the bar the band ends on`);
      }

      if (vibrato) {
        shaken++;
        assert.ok(hand.shake, `${where}: a shake on the ${hand.name}`);
        assert.deepEqual(
          [vibrato.depth, vibrato.rate, vibrato.upward === true],
          [hand.shake.depth, hand.shake.rate, hand.shake.upward],
          `${where}: not the instrument's shake`,
        );
        assert.ok(
          note.duration >= sounds(habits.shake * PPQ) || bar.ending !== null,
          `${where}: a shake on a note ${note.duration} ticks long`,
        );
        // The last note of the tune is held as long as the band holds it.
        if (bar.ending) assert.ok(note.duration >= habits.shake * PPQ - POCKET, where);
      }
    });
  }
  const bends = STYLES.some(bendsIn);
  // Where the style's hand bends, both are heard often enough to have been judged: bends as
  // often as the style's chances of one say (disco's are half the blues' and rock's, ST-disco-25).
  const chances = Math.min(
    1,
    ...STYLES.filter(bendsIn).map(
      ({ solo }) => solo.habits.bend.third + solo.habits.bend.rootOrFifth,
    ),
  );
  assert.ok(!bends || bent >= enough(60 * chances), `only ${bent} bent notes`);
  assert.ok(!bends || shaken > enough(300), `only ${shaken} shaken notes`);
  // The top note is always pushed up into where the hand can (SO-53): not in a song's one
  // short solo, which has no climb, nor over a chord that leaves no note under it to start on.
  assert.ok(topped * 3 >= solos * 2, `only ${topped} of ${solos} solos bend into their top note`);
  const vibes = STYLES.some((style) => style.solo.instrument === "vibraphone");
  assert.ok(!vibes || plain > enough(2000), `only ${plain} notes on the vibraphone`);
});

/**
 * Where a slide may come from (SO-56, within two frets): the start's distance from the root,
 * by the landing's, as `start→landing`. From below: the flat 7th up to the root, the 4th up to
 * the 5th, the 2nd up to a major 3rd, and the one slide of one fret, the minor 3rd up to the
 * major. From above: the 2nd down to the root, the 6th to the 5th, the 4th to a minor 3rd, the
 * root to the flat 7th.
 */
const SLIDES_FROM: Readonly<Record<string, string>> = {
  "10→0": "root",
  "5→7": "fifth",
  "2→4": "third",
  "3→4": "third",
  "2→0": "root",
  "9→7": "fifth",
  "5→3": "third",
  "0→10": "seventh",
};

test("a guitar slides into a landing from a fret or two away, stepping: struck on its beat at the start, standing on each fret and jumping to the next, on pitch in the instrument's time; only into a note of an eighth or longer struck where the chord changes, not bent, never in the bar the band ends on, from a tone of the chord's scale SO-56 names (or the minor third up into the major); one at most a phrase, some in every style whose chance is not none, no more than the style bends, and none on an instrument or in a style that does not slide", () => {
  const counts = new Map<string, { slides: number; bends: number; phrases: number }>();
  for (const { style, chart, options, take } of [...soloTakes(), ...handedTakes()]) {
    const notes = notesOf(take, "solo");
    const hand = SOLO_INSTRUMENTS[notes[0]?.voice ?? ""];
    if (!hand) continue;
    const harmony = harmonyOf(take);
    const bars = take.plan.bars;
    const perSecond = (take.plan.quarters * PPQ) / 60;
    const { habits, space, touch } = style.solo;
    const chance = habits.slide?.chance ?? 0;
    const owed = space.breath * 0.9 * perSecond;
    const count = counts.get(style.id) ?? { slides: 0, bends: 0, phrases: 0 };
    counts.set(style.id, count);
    // Bends and slides are counted side by side on a hand that does both.
    const slides = hand.slide !== null;
    const both = hand.bend !== null && slides;
    let [at, b, inPhrase] = [0, 0, 0];
    notes.forEach((note, i) => {
      while (harmony[at + 1] && harmony[at + 1]!.tick <= note.tick) at++;
      while (bars[b + 1] && bars[b + 1]!.start <= note.tick) b++;
      const bar = bars[b]!;
      const before = notes[i - 1];
      if (!before || note.tick - (before.tick + before.duration) >= owed) {
        if (slides) count.phrases++;
        inPhrase = 0;
      }
      const glide = note.move?.glide;
      if (both && glide && !stepped(glide) && glide[0]!.at === 0) count.bends++;
      if (!stepped(glide)) return;
      const where = `${style.id} ${chart.file} ${JSON.stringify(options)} bar ${bar.index} tick ${note.tick}: ${note.pitch}`;
      if (slides) count.slides++;
      inPhrase++;
      assert.ok(hand.slide, `${where}: a slide on the ${hand.name}`);
      assert.ok(chance > 0, `${where}: a slide in a style that does not slide`);
      assert.ok(inPhrase <= 1, `${where}: a second slide in a phrase`);

      // Struck at the start on the note's beat, standing on whole frets, a jump of one fret
      // at a time toward the note, and on it at the end: one or two frets, from below, or
      // two from above.
      const points = glide!;
      const from = points[0]!.semitones;
      assert.ok(points[0]!.at === 0, `${where}: a slide not struck at its start`);
      assert.ok([-2, -1, 2].includes(from), `${where}: a slide from ${from} semitones`);
      assert.equal(points.at(-1)!.semitones, 0, `${where}: a slide that does not arrive`);
      const jump = 0.002 * perSecond;
      for (let p = 1; p < points.length; p++) {
        const [was, is] = [points[p - 1]!, points[p]!];
        assert.ok(Number.isInteger(is.semitones), `${where}: a slide between frets`);
        if (was.semitones === is.semitones) continue;
        assert.ok(
          is.semitones - was.semitones === Math.sign(-from) && is.at - was.at <= jump,
          `${where}: a slide that does not step a fret at a time`,
        );
      }
      const frets = Math.abs(from);
      const arrives = points.at(-1)!.at / perSecond;
      const takes = frets === 1 ? hand.slide!.oneFret : 2 * hand.slide!.fret;
      assert.ok(
        Math.abs(arrives - takes) < 0.002,
        `${where}: ${frets} frets in ${arrives.toFixed(3)} s`,
      );
      // Not both a bend and a slide: the note has the one glide, so it is not bent too.

      // Into what: a landing struck where the chord changes, an eighth or longer.
      const arrival = harmony[at]!;
      assert.ok(
        arrival.tick === note.tick && arrival.changed && arrival.chord,
        `${where}: a slide into a note not struck where the chord changes`,
      );
      assert.equal(bar.ending, null, `${where}: a slide in the bar the band ends on`);
      const within = note.tick - bar.start;
      const swung = (tick: number) => (bar.meter.unit === 4 ? swing(tick, style.feel) : tick);
      const eighth = Math.round(swung(within + (PPQ / 2) * touch.legato) - swung(within)) - 1;
      assert.ok(note.duration >= eighth, `${where}: a slide into a note ${note.duration} long`);
      // From where: SO-56's starts, a tone of the style's notes over the chord (the chord, its
      // scale, the notes the style plays over a chord of its family, the key's notes; never a
      // chromatic note chosen by distance, SU-B-17), or the minor third a fret under the major.
      const chord = arrival.chord!;
      const root = pitchClass(chord.root);
      const into = (note.pitch - root + 120) % 12;
      const start = (note.pitch + from - root + 120) % 12;
      const role = SLIDES_FROM[`${start}→${into}`];
      assert.ok(
        role && chordTones(chord.quality).some((t) => t.role === role && t.interval % 12 === into),
        `${where}: a slide from ${start} into ${into} over ${chord.root}${chord.quality}`,
      );
      if (from !== -1) {
        const scale = chordScale(chord, contextOf(harmony, arrival));
        const tones = chordTones(chord.quality).map((t) => t.interval % 12);
        const { notes: written } = style.solo;
        const fromKey = (start + root - pitchClass(arrival.key.tonic) + 120) % 12;
        assert.ok(
          scale.intervals.some((interval) => interval % 12 === start) ||
            tones.includes(start) ||
            (written.overRoot?.[chordFamily(chord.quality)] ?? []).includes(start) ||
            written.key[arrival.key.mode].includes(fromKey),
          `${where}: a slide from ${start}, outside the style's notes over the chord`,
        );
      }
      if (habits.slide?.into === "third") {
        assert.ok(from === -1 && into === 4, `${where}: a style that slides only into a third`);
      }
    });
  }
  for (const style of STYLES) {
    const { slides, bends, phrases } = counts.get(style.id) ?? { slides: 0, bends: 0, phrases: 0 };
    const slide = style.solo.habits.slide;
    // (A style that names no chance has not said it does not slide.)
    const chance = slide?.chance;
    const where = `${style.id}: ${slides} slides and ${bends} bends in ${phrases} phrases`;
    assert.ok(chance === 0 ? slides === 0 : slides > 0, `${where}, against a chance of ${chance}`);
    assert.ok(slides <= phrases * (chance ?? 0), `${where}: more than the chance a phrase`);
    // Rarer than a bend where the style bends; neo-soul's move into the third is a slide where
    // it was a bend, and is held by its chance alone.
    if (bendsIn(style) && slide?.into !== "third") {
      assert.ok(slides <= bends, `${where}: more slides than bends`);
    }
  }
});

test("a guitar hammers on and pulls off as one struck string: inside a phrase, a note of an eighth or shorter, no longer than the next, that steps a fret or two to it, neither bent nor slid nor struck where the chord changes, not the phrase's first, may leave the next unstruck; then it is heard as one attack, at the first note's time and level, its pitch jumping to the second's at the second's time and sounding to the second's end, in the sounds and in the MIDI file; one hammer-on and one pull-off a phrase at most and never two pairs running; some in every style whose chance is not none, and none on an instrument or in a style that does not", () => {
  const counts = new Map<string, { hammers: number; pulls: number; phrases: number }>();
  const filed = new Set<string>();
  for (const { style, chart, options, take } of [...soloTakes(), ...handedTakes()]) {
    const notes = notesOf(take, "solo");
    const hand = SOLO_INSTRUMENTS[notes[0]?.voice ?? ""];
    if (!hand) continue;
    const harmony = harmonyOf(take);
    const bars = take.plan.bars;
    const perSecond = (take.plan.quarters * PPQ) / 60;
    const { habits, space, touch } = style.solo;
    const owed = space.breath * 0.9 * perSecond;
    const count = counts.get(style.id) ?? { hammers: 0, pulls: 0, phrases: 0 };
    counts.set(style.id, count);
    const hammers = hand.hammers !== false;
    const changes = (tick: number) =>
      harmony.some((arrival) => arrival.tick === tick && arrival.changed && arrival.chord);
    const barOf = (tick: number) => bars.findLast((bar) => bar.start <= tick)!;
    const gapBefore = (i: number) => notes[i]!.tick - (notes[i - 1]!.tick + notes[i - 1]!.duration);
    const starts = (i: number) => i === 0 || gapBefore(i) >= owed;
    // Surely after a breath, as heard: the breath itself, and the pocket's slack.
    const breathed = (i: number) => i === 0 || gapBefore(i) >= space.breath * perSecond + POCKET;
    let [up, down, slurs] = [0, 0, 0];
    notes.forEach((note, i) => {
      if (starts(i)) {
        if (hammers) count.phrases++;
        [up, down] = [0, 0];
      }
      if (!note.slur) return;
      slurs++;
      const where = `${style.id} ${chart.file} ${JSON.stringify(options)} tick ${note.tick}: ${note.pitch}`;
      const before = notes[i - 1];
      assert.ok(before && !breathed(i), `${where}: not struck, after a breath or nothing`);
      const step = note.pitch - before.pitch;
      const hammer = step > 0;
      if (hammers) count[hammer ? "hammers" : "pulls"]++;
      assert.ok(hand.hammers, `${where}: not struck on the ${hand.name}`);
      assert.ok(
        ((hammer ? habits.hammerOn : habits.pullOff) ?? 0) > 0,
        `${where}: a ${hammer ? "hammer-on" : "pull-off"} in a style that does not`,
      );
      assert.ok(Math.abs(step) === 1 || Math.abs(step) === 2, `${where}: a slur of ${step}`);
      // The first an eighth or shorter, held into the second, and no longer than it.
      const span = note.tick - before.tick;
      assert.ok(span > 0 && span <= PPQ / 2, `${where}: hammered from a note ${span} long`);
      const gap = note.tick + note.offset - (before.tick + before.offset + before.duration);
      assert.ok(gap <= span * (1 - touch.legato) + POCKET, `${where}: a slur across a rest`);
      const after = notes[i + 1];
      assert.ok(
        Math.max(note.duration + POCKET, (after?.tick ?? 0) - note.tick) >= span * touch.legato,
        `${where}: a slur into a shorter note`,
      );
      // Neither moved, nor a landing, nor the phrase's first; nothing in the band's last bar.
      assert.ok(!before.move?.glide && !note.move?.glide, `${where}: a slur with a bend or slide`);
      assert.ok(!changes(before.tick) && !changes(note.tick), `${where}: a slur on a landing`);
      assert.ok(!breathed(i - 1), `${where}: hammered from a phrase's first note`);
      assert.ok(!before.slur && !notes[i - 2]?.slur, `${where}: two slurs running`);
      assert.equal(barOf(note.tick).ending, null, `${where}: a slur in the bar the band ends on`);
      if (hammer) up++;
      else down++;
      assert.ok(
        up <= 1 && down <= 1,
        `${where}: a second ${hammer ? "hammer-on" : "pull-off"} in a phrase`,
      );
    });
    if (slurs === 0) continue;
    // One attack: the sounds and the MIDI file strike the pair once, from the first note.
    const sounds = timedNotes(take.plan, take.events).filter((sound) => sound.seat === "solo");
    assert.equal(sounds.length, notes.length - slurs, `${chart.file}: a slurred note struck`);
    const secondsAt = (tick: number) => (tick / PPQ) * (60 / take.plan.quarters);
    notes.forEach((note, i) => {
      if (!note.slur) return;
      const before = notes[i - 1]!;
      const at = Math.max(0, secondsAt(before.tick + before.offset));
      const sound = sounds.find((s) => Math.abs(s.at - at) < 1e-9);
      const where = `${style.id} ${chart.file} tick ${note.tick}`;
      assert.ok(
        sound && sound.pitch === note.pitch,
        `${where}: the pair is not one sound at its pitch`,
      );
      assert.equal(sound.velocity, before.velocity, `${where}: struck at another level`);
      const ends = secondsAt(note.tick + note.offset + note.duration);
      assert.ok(
        Math.abs(sound.at + sound.length - ends) < 1e-6,
        `${where}: not to the second's end`,
      );
      const cents = sound.bend?.cents ?? [];
      const jump = Math.floor((secondsAt(note.tick + note.offset) - at) / sound.bend!.step);
      assert.ok(
        cents[0] === (before.pitch - note.pitch) * 100 &&
          cents[Math.max(0, jump - 1)] === cents[0] &&
          Math.abs(cents[jump + 2]!) < 5,
        `${where}: the pitch does not stand on the first note and jump to the second`,
      );
    });
    if (!filed.has(style.id)) {
      filed.add(style.id);
      const solo = readSmf(toMidi(take.plan, take.events, style)).tracks.find(
        (track) => track.name === "Solo",
      )!;
      assert.equal(solo.noteOns, notes.length - slurs, `${chart.file}: the file strikes a slur`);
    }
  }
  for (const style of STYLES) {
    const { hammers, pulls, phrases } = counts.get(style.id) ?? {
      hammers: 0,
      pulls: 0,
      phrases: 0,
    };
    const { hammerOn, pullOff } = style.solo.habits;
    const where = `${style.id}: ${hammers} hammer-ons and ${pulls} pull-offs in ${phrases} phrases`;
    // (A style that names no chance has not said it does not.)
    assert.ok(hammerOn === 0 ? hammers === 0 : hammers > 0, `${where}, against ${hammerOn}`);
    assert.ok(pullOff === 0 ? pulls === 0 : pulls > 0, `${where}, against ${pullOff}`);
    assert.ok(hammers <= phrases * (hammerOn ?? 0), `${where}: more hammer-ons than the chance`);
    assert.ok(pulls <= phrases * (pullOff ?? 0), `${where}: more pull-offs than the chance`);
  }
});

/**
 * The least a style's horn does over the takes its properties read, and the most: shaken
 * phrase endings as a share of them, and scoops and falls present wherever the style's chances
 * give them, under ceilings taken from those chances. A scoop is drawn once a phrase, and only
 * a phrase with a note it may go into can take one: half the chance, over the phrases heard, is
 * more than that gives (a third of it or less in every style), and a style scooping every phrase
 * it could would go past it. A fall is drawn only on a phrase ending it may be drawn on, which is
 * one in ten or fewer: three twentieths of the chance, over every ending, is past what that gives
 * (a tenth of it or less), and a style falling ten times as often goes past it.
 */
test("a horn moves a note's pitch as a player does, and seldom: the alto shakes the last note before a breath and no other, 30 cents either side from 0.4 s; it scoops at most one note a phrase, a half step up in 0.06 s into a note of a quarter or longer it arrives on in the line, on a strong beat, from below or by a leap; it falls rarely, off a phrase's last note of a half or longer once it has sounded its length, 6 semitones in half a second, dying away as it drops, never into the next note, a pickup included, nor into the bar the band ends on; and no other note of any seat dies away", () => {
  const alto = SOLO_INSTRUMENTS["alto-sax"]!;
  const shake = alto.shake!;
  const [scoop, fall] = [alto.scoop!, alto.fall!];
  const near = (a: number, b: number) => Math.abs(a - b) <= 1;
  for (const style of STYLES) {
    let [ends, shaken, scoops, falls, phrases] = [0, 0, 0, 0, 0];
    for (const { chart, options, take } of soloTakes().filter((jam) => jam.style === style)) {
      for (const note of notesOf(take)) {
        if (note.fade === undefined) continue;
        assert.ok(
          note.voice === "alto-sax" && note.move?.glide?.at(-1)?.semitones === -fall.semitones,
          `${chart.file}: a ${note.seat} note dies away and does not fall`,
        );
      }
      const notes = notesOf(take, "solo");
      if (notes[0]?.voice !== "alto-sax") continue;
      const perSecond = (take.plan.quarters * PPQ) / 60;
      const owed = Math.max(style.solo.space.breath, alto.breath!.takes) * 0.9 * perSecond;
      const bars = take.plan.bars;
      let [b, inPhrase] = [0, 0];
      notes.forEach((note, i) => {
        while (bars[b + 1] && bars[b + 1]!.start <= note.tick) b++;
        const bar = bars[b]!;
        const where = `${style.id} ${chart.file} ${JSON.stringify(options)} bar ${bar.index} tick ${note.tick}`;
        const before = notes[i - 1];
        const after = notes[i + 1];
        const breathes = !after || after.tick - (note.tick + note.duration) >= owed;
        if (!before || note.tick - (before.tick + before.duration) >= owed) {
          phrases++;
          inPhrase = 0;
        }
        if (breathes) ends++;
        const { glide, vibrato } = note.move ?? {};
        if (vibrato) {
          shaken++;
          assert.ok(breathes, `${where}: a shake on a note that is not a phrase's last`);
          assert.deepEqual(
            [vibrato.depth, vibrato.rate, vibrato.upward ?? false],
            [shake.depth, shake.rate, false],
            `${where}: not the alto's shake`,
          );
          assert.ok(
            near(vibrato.from, shake.after * perSecond) &&
              near(vibrato.grow, shake.grows * perSecond),
            `${where}: a shake from ${(vibrato.from / perSecond).toFixed(2)} s`,
          );
          assert.ok(
            note.duration >= shake.shortest! * perSecond - POCKET,
            `${where}: a shake on a note of ${(note.duration / perSecond).toFixed(2)} s`,
          );
        }
        if (!glide) return;
        const [from, to] = [glide[0]!, glide[1]!];
        assert.equal(glide.length, 2, `${where}: a glide of ${glide.length} points`);
        assert.equal(bar.ending, null, `${where}: a scoop or a fall in the bar the band ends on`);
        if (from.at === 0) {
          scoops++;
          inPhrase++;
          assert.ok(inPhrase <= 1, `${where}: a second scoop in a phrase`);
          assert.ok(
            from.semitones === -scoop.below &&
              to.semitones === 0 &&
              near(to.at, scoop.takes * perSecond),
            `${where}: a scoop from ${from.semitones} over ${(to.at / perSecond).toFixed(3)} s`,
          );
          assert.ok(!vibrato && note.fade === undefined, `${where}: a scooped note is not plain`);
          assert.ok(
            before && note.tick - (before.tick + before.duration) < owed,
            `${where}: a scoop after a breath`,
          );
          const by = note.pitch - before.pitch;
          assert.ok(by > 0 || by <= -3, `${where}: scooped after a step down`);
          const inBar = note.tick - bar.start;
          assert.ok(
            inBar === 0 || inBar * 2 === bar.ticks,
            `${where}: a scoop off the strong beats`,
          );
          assert.ok(
            note.duration >= PPQ * style.solo.touch.legato * 0.5,
            `${where}: a scoop into a short note`,
          );
          return;
        }
        falls++;
        // Where it sounds: into air, never into the next note or the band's last chord.
        const drop = to.at - from.at;
        const gone = note.tick + note.offset + note.duration + drop;
        if (after) {
          assert.ok(gone <= after.tick + after.offset, `${where}: a fall into the next note`);
        }
        assert.ok(
          take.plan.open || gone <= take.plan.ticks,
          `${where}: a fall past the take's end`,
        );
        const into = bars.findLast((other) => other.start <= gone)!;
        assert.equal(into.ending, null, `${where}: a fall into the band's last chord`);
        // What it is: off a phrase's long last note once it has sounded, the alto's drop.
        assert.ok(breathes, `${where}: a fall off a note inside a phrase`);
        assert.ok(
          note.duration >= 1.5 * PPQ - POCKET,
          `${where}: a fall off a note of ${note.duration} ticks`,
        );
        assert.ok(
          near(from.at, note.duration) && from.semitones === 0 && to.semitones === -fall.semitones,
          `${where}: a fall from ${from.at} into a note of ${note.duration}`,
        );
        assert.ok(
          near(drop, fall.takes * perSecond),
          `${where}: a fall of ${(drop / perSecond).toFixed(2)} s`,
        );
        assert.equal(note.fade, drop, `${where}: a fall that does not die away over its drop`);
      });
    }
    const { scoop: scoopChance, fall: fallChance } = style.solo.habits;
    const where = `${style.id}: ${shaken} of ${ends} phrase endings shaken, ${scoops} scoops in ${phrases} phrases, ${falls} falls`;
    assert.ok(ends > enough(300), `${where}: too few to judge`);
    assert.ok(shaken >= ends / 5, where);
    assert.ok(scoops <= phrases * scoopChance * 0.5, `${where}: too many scoops`);
    assert.ok(falls <= ends * fallChance * 0.15, `${where}: too many falls`);
    assert.ok(
      scoopChance === 0 ? scoops === 0 : scoops > 0,
      `${where}: scoops against a chance of ${scoopChance}`,
    );
    assert.ok(
      fallChance === 0 ? falls === 0 : falls > 0,
      `${where}: falls against a chance of ${fallChance}`,
    );
  }
});

// ── the piano around the soloist ────────────────────────────────────────────

/** The same band with a piano that cannot hear the soloist: the baseline the stage is measured against. */
const deaf = (style: Jam["style"]): Jam["style"] => ({
  ...style,
  chords: { ...style.chords, listening: null },
  critic: {
    ...style.critic,
    weights: {
      ...style.critic.weights,
      comping: { ...style.critic.weights.comping, "under-the-soloist": 0 },
    },
  },
});

/** Where the piano and the soloist meet in a take: strikes under a sounding note, and voices on that note. */
function meetings(take: Take): { strikes: number; under: number; onNote: number } {
  const solo = notesOf(take, "solo");
  const bars = take.plan.bars;
  let [strikes, under, onNote, at] = [0, 0, 0, 0];
  for (const strike of strikesOf(take)) {
    const bar = bars.findLast((candidate) => candidate.start <= strike.tick);
    if (!bar?.solo) continue;
    strikes++;
    while (solo[at] && solo[at]!.tick + solo[at]!.duration <= strike.tick) at++;
    const sounding = solo
      .slice(at, at + 4)
      .filter((note) => note.tick <= strike.tick && strike.tick < note.tick + note.duration);
    if (sounding.length === 0) continue;
    under++;
    if (sounding.some((note) => strike.pitches.includes(note.pitch))) onNote++;
  }
  return { strikes, under, onNote };
}

const listens = STYLES.some((style) => style.chords.listening !== null);

test("a comp that listens makes room: hearing the soloist, fewer of its strikes come down under the line and far fewer sit on the soloist's note than when it cannot hear", {
  skip: !listens,
}, () => {
  const sum = { strikes: 0, under: 0, onNote: 0 };
  const deafSum = { strikes: 0, under: 0, onNote: 0 };
  let lower = 0;
  let compared = 0;
  for (const { style, chart, options, take } of takes(
    (jam) =>
      jam.style.chords.listening !== null &&
      jam.options.solo === true &&
      jam.chart.meter === "4/4" &&
      Number(jam.options.seed) <= 4,
  )) {
    const heard = meetings(take);
    const unheard = meetings(render(chart.text, deaf(style), options));
    for (const key of ["strikes", "under", "onNote"] as const) {
      sum[key] += heard[key];
      deafSum[key] += unheard[key];
    }
    compared++;
    if (heard.under / heard.strikes <= unheard.under / unheard.strikes) lower++;
  }
  assert.ok(compared >= enough(24), `only ${compared} takes compared`);
  const overlap = sum.under / sum.strikes;
  const deafOverlap = deafSum.under / deafSum.strikes;
  assert.ok(
    overlap < deafOverlap - 0.01,
    `strikes under the line: ${overlap.toFixed(3)} hearing, ${deafOverlap.toFixed(3)} deaf`,
  );
  assert.ok(lower >= compared * 0.75, `lower in only ${lower} of ${compared} takes`);
  const [on, deafOn] = [sum.onNote / sum.under, deafSum.onNote / deafSum.under];
  assert.ok(
    on < deafOn / 2,
    `on the soloist's note: ${on.toFixed(3)} hearing, ${deafOn.toFixed(3)} deaf`,
  );
});

test(
  "blues: under a solo the piano does not get busier as the band gets louder: where the soloist has the lead it never hammers a bar, and at the band's hot level it averages under three strikes a bar",
  only("blues"),
  () => {
    let hot = 0;
    let strikes = 0;
    for (const { style, chart, options, take } of soloTakes()) {
      if (style.id !== "blues" || chart.meter !== "4/4") continue;
      const perBar = new Map<number, number>();
      const bars = take.plan.bars;
      for (const strike of strikesOf(take)) {
        const bar = bars.findLast((candidate) => candidate.start <= strike.tick)!;
        perBar.set(bar.index, (perBar.get(bar.index) ?? 0) + 1);
      }
      for (const bar of bars) {
        if (bar.kind !== "music" || !bar.solo || bar.ending || bar.seats.chords === null) continue;
        const count = perBar.get(bar.index) ?? 0;
        // A chord gets its strike however many the bar has, so only bars of one or two chords
        // say anything about how busy the hand chose to be.
        const chords = bar.spans.filter((span) => !span.tied && span.chord !== null).length;
        if (chords <= 2) {
          assert.ok(
            count <= 5,
            `${chart.file} ${JSON.stringify(options)} bar ${bar.index}: ${count} strikes under the solo`,
          );
        }
        if (tierOf(bar.energy) === "high" && chords <= 1) {
          hot++;
          strikes += count;
        }
      }
    }
    assert.ok(hot > enough(300), `only ${hot} hot bars under a solo`);
    assert.ok(strikes / hot < 3, `${(strikes / hot).toFixed(2)} strikes a bar under a hot solo`);
  },
);

test("with nobody soloing, a piano that listens plays exactly what a deaf one plays", () => {
  for (const style of STYLES) {
    for (const [c, chart] of ownCharts(style).entries()) {
      const options = { mode: "jam", passes: 2, seed: c + 1 } as const;
      assert.deepEqual(
        render(chart.text, style, options).events,
        render(chart.text, deaf(style), options).events,
        chart.file,
      );
    }
  }
});

test("under a solo the piano leaves the soloist its note: a voice held on the soloist's own pitch for more than a beat is the bottom of the hand or a tone the chord is heard by", () => {
  let under = 0;
  for (const { style, chart, options, take } of soloTakes()) {
    const solo = notesOf(take, "solo");
    const strikes = strikesOf(take);
    const bars = take.plan.bars;
    strikes.forEach((strike, i) => {
      const bar = bars.findLast((candidate) => candidate.start <= strike.tick);
      if (!bar?.solo || strike.pitches.length <= 2) return;
      // A comp that does not listen plays as if nobody were soloing, by design (a strummed
      // groove, CH-60, CH-68): its strokes are short, so it holds nothing under the line
      // until the last chord, and there its grip may have the note the soloist ends on.
      if (style.chords.listening === null && bar.ending) return;
      // One hand: a strike sounds until the next one, and is judged inside its own bar.
      const ends = Math.min(strike.ends, strikes[i + 1]?.sounds ?? Infinity, bar.start + bar.ticks);
      under++;
      for (const pitch of strike.pitches.slice(1)) {
        const shared = solo
          .filter((note) => note.pitch === pitch)
          .reduce((sum, note) => {
            const from = Math.max(strike.sounds, note.tick + note.offset);
            const to = Math.min(ends, note.tick + note.offset + note.duration);
            return sum + Math.max(0, to - from);
          }, 0);
        // A beat on paper (the bar's pulse: a dotted quarter in twelve-eight); the feel moves
        // both ends of both notes, so a quarter more as heard.
        if (shared < pulseTicks(bar.meter)[0]! * 1.25) continue;
        const needed = chordsUnder(take, strike).some(({ chord }) => {
          const interval = (pitch - pitchClass(chord.root) + 120) % 12;
          const altered = { b5: 6, "#5": 8, b9: 1, "#9": 3, "#11": 6, b13: 8 } as const;
          return (
            chordTones(chord.quality).some(
              (tone) =>
                ["third", "sus", "seventh", "sixth"].includes(tone.role) &&
                tone.interval % 12 === interval,
            ) || chord.quality.alterations.some((alteration) => altered[alteration] === interval)
          );
        });
        assert.ok(
          needed,
          `${chart.file} ${JSON.stringify(options)} at tick ${strike.tick}: ${strike.pitches} sits on the soloist's ${pitch}`,
        );
      }
    });
  }
  assert.ok(under > enough(3000), `only ${under} strikes under a solo`);
});

// ── the jazz soloist ────────────────────────────────────────────────────────

test(
  "jazz: a note from outside the chord's scale is on its way somewhere: it is off the beat, and the next note follows straight on, a half step from it",
  only("jazz"),
  () => {
    let chromatic = 0;
    // Where jazz has written its soloist (4/4, 6/4, 6/8, 12/8) and in three, where its line is
    // a 4/4 rhythm cut to the bar.
    const own = (jam: Parameters<typeof written>[0]) =>
      written(jam) || !isCompound(parse(jam.chart.text).chart.meter);
    for (const { chart, options, take } of soloTakes().filter(own)) {
      const harmony = harmonyOf(take);
      const solo = notesOf(take, "solo");
      const has = (arrival: (typeof harmony)[number] | undefined, pitch: number) => {
        if (!arrival?.chord) return true;
        const root = pitchClass(arrival.chord.root);
        const scale = chordScale(arrival.chord, contextOf(harmony, arrival));
        return [...scale.intervals, ...chordTones(arrival.chord.quality).map((t) => t.interval)]
          .map((interval) => (root + interval) % 12)
          .includes(pitch % 12);
      };
      let at = 0;
      solo.forEach((note, i) => {
        while (harmony[at + 1] && harmony[at + 1]!.tick <= note.tick) at++;
        if (has(harmony[at], note.pitch)) return;
        // Struck in the eighth before a change, it may be the chord coming (X-B-07).
        const coming = harmony[at + 1];
        if (coming && coming.tick - note.tick <= PPQ / 2 && has(coming, note.pitch)) return;
        const bar = take.plan.bars.findLast((candidate) => candidate.start <= note.tick)!;
        chromatic++;
        const where = `${chart.file} seed ${options.seed} bar ${bar.index}: ${note.pitch} over ${harmony[at]!.chord!.text}`;
        assert.ok(!onPulse(bar.meter, note.tick - bar.start), `${where}: on a beat`);
        const next = solo[i + 1];
        assert.ok(
          next && next.tick - note.tick <= PPQ / 2,
          `${where}: left hanging, nothing follows it`,
        );
        assert.equal(Math.abs(next.pitch - note.pitch), 1, `${where}: left for ${next.pitch}`);
      });
    }
    assert.ok(chromatic > enough(300), `only ${chromatic} notes outside the scale`);
  },
);
