// How busy the soloist is, by style: on each style's own charts (and, for jazz,
// the standards), at the chart's own tempo and with the band's own arc, as the app
// plays them, in a jam of four passes (the band, then a solo of three choruses).
// For each solo chorus (first, middle, last) and over the whole solo:
//
//   n/s     notes struck a second while the soloist has the lead
//   played  the share of its lead that some note of it is sounding
//   empty   the share of its lead bars in which nothing of it sounds
//   longest its longest silence inside a solo, in seconds
//
// Usage: node scripts/solo-density.ts [density=0..1] [fromtop=1] [seeds=6]
//        [styles=jazz,funk] [meters=compound|other|four] [json=out.json]

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import type {
  NoteEvent,
  PlanBar,
  StylePack,
  Take,
  TakeOptions,
} from "../packages/engine/src/index.ts";
import { isCompound, PPQ, parse, render } from "../packages/engine/src/index.ts";
import { STYLES } from "../packages/styles/src/index.ts";

/** Which of a style's charts: in compound time, in any meter but 4/4, or in 4/4. */
export type Meters = "compound" | "other" | "four";

export interface Measured {
  /** Seconds of lead, notes struck, seconds sounding, bars of lead, bars empty. */
  lead: number;
  notes: number;
  sounding: number;
  bars: number;
  empty: number;
  longest: number;
}

const blank = (): Measured => ({ lead: 0, notes: 0, sounding: 0, bars: 0, empty: 0, longest: 0 });

export function add(into: Measured, from: Measured): void {
  into.lead += from.lead;
  into.notes += from.notes;
  into.sounding += from.sounding;
  into.bars += from.bars;
  into.empty += from.empty;
  into.longest = Math.max(into.longest, from.longest);
}

/** A take's solos, each as its choruses measured: [first, middle, last] for one of three. */
export function measureTake(take: Take): Measured[][] {
  const seconds = (ticks: number) => (ticks / PPQ) * (60 / take.plan.quarters);
  const notes = take.events.filter(
    (event): event is NoteEvent => event.kind === "note" && event.seat === "solo",
  );
  // The solos: runs of lead bars, a new one wherever a chorus 0 starts again.
  const solos: PlanBar[][] = [];
  let current: PlanBar[] | null = null;
  for (const bar of take.plan.bars) {
    if (bar.kind !== "music" || !bar.solo) {
      current = null;
      continue;
    }
    if (!current || (bar.solo.chorus === 0 && current.at(-1)!.solo!.chorus !== 0)) {
      current = [];
      solos.push(current);
    }
    current.push(bar);
  }
  return solos.map((bars) => {
    const from = bars[0]!.start;
    const to = bars.at(-1)!.start + bars.at(-1)!.ticks;
    const mine = notes.filter((note) => note.tick >= from - PPQ && note.tick < to);
    const of = bars[0]!.solo!.of;
    return Array.from({ length: of }, (_, chorus) => {
      const own = bars.filter((bar) => bar.solo!.chorus === chorus);
      const m = blank();
      if (own.length === 0) return m;
      const start = own[0]!.start;
      const end = own.at(-1)!.start + own.at(-1)!.ticks;
      m.lead = seconds(end - start);
      m.bars = own.length;
      // Sounding: the union of the notes' spans, inside the chorus.
      let covered = 0;
      let reach = start;
      for (const note of mine) {
        const a = Math.max(start, note.tick, reach);
        const b = Math.min(end, note.tick + note.duration);
        if (b > a) covered += b - a;
        reach = Math.max(reach, Math.min(end, note.tick + note.duration));
        if (note.tick >= start && note.tick < end) m.notes++;
      }
      m.sounding = seconds(covered);
      for (const bar of own) {
        const a = bar.start;
        const b = bar.start + bar.ticks;
        if (!mine.some((note) => note.tick < b && note.tick + note.duration > a)) m.empty++;
      }
      // The longest silence that ends or starts in this chorus, between two notes of the solo.
      for (let i = 1; i < mine.length; i++) {
        const gapFrom = mine[i - 1]!.tick + mine[i - 1]!.duration;
        const gapTo = mine[i]!.tick;
        if (gapTo <= start || gapFrom >= end) continue;
        m.longest = Math.max(m.longest, seconds(gapTo - gapFrom));
      }
      return m;
    });
  });
}

export interface Row {
  readonly style: string;
  readonly charts: number;
  readonly solos: number;
  /** First, middle, last chorus, and the whole solo. */
  readonly chorus: readonly Measured[];
  readonly whole: Measured;
}

const library = new URL("../library/", import.meta.url);
export const CHARTS = readdirSync(library)
  .filter((file) => file.endsWith(".chart"))
  .sort()
  .map((file) => ({ file, text: readFileSync(new URL(file, library), "utf8") }));

/** A style's charts: its own, and the standards written for it. */
export function chartsOf(style: StylePack, meters?: Meters) {
  return CHARTS.filter((chart) => {
    const written = parse(chart.text).chart;
    const mine =
      chart.file.startsWith(`${style.id}-`) ||
      (chart.file.startsWith("standard-") && written.styleId === style.id);
    if (!mine) return false;
    const four = written.meter.beats === 4 && written.meter.unit === 4;
    if (meters === "compound") return isCompound(written.meter);
    if (meters === "other") return !four;
    if (meters === "four") return four;
    return true;
  });
}

export function measureStyle(
  style: StylePack,
  extra: Partial<TakeOptions>,
  seeds: number,
  meters?: Meters,
  files?: readonly string[],
): Row {
  const chorus = [blank(), blank(), blank()];
  const whole = blank();
  let solos = 0;
  const charts = chartsOf(style, meters).filter((chart) => !files || files.includes(chart.file));
  for (const chart of charts) {
    for (let seed = 1; seed <= seeds; seed++) {
      const take = render(chart.text, style, {
        mode: "jam",
        passes: 4,
        solo: true,
        seed,
        ...extra,
      });
      for (const solo of measureTake(take)) {
        if (solo.length !== 3) continue;
        solos++;
        solo.forEach((m, c) => {
          add(chorus[c]!, m);
          add(whole, m);
        });
      }
    }
  }
  return { style: style.id, charts: charts.length, solos, chorus, whole };
}

export const cell = (m: Measured): string =>
  `${(m.notes / m.lead).toFixed(2)} ${(m.sounding / m.lead).toFixed(2)} ${(m.empty / m.bars).toFixed(2)} ${m.longest.toFixed(1)}`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => arg.split("=") as [string, string]),
  );
  const extra: Partial<TakeOptions> = {
    ...(args.density === undefined ? {} : { soloDensity: Number(args.density) }),
    ...(args.fromtop === "1" ? { soloFromTop: true } : {}),
  };
  const seeds = Number(args.seeds ?? 6);
  const meters = args.meters as Meters | undefined;
  const styles = args.styles
    ? STYLES.filter((style) => args.styles!.split(",").includes(style.id))
    : STYLES;
  const rows = styles.map((style) => measureStyle(style, extra, seeds, meters));
  console.log(
    `style     charts solos | each: n/s played empty longest(s)\n` +
      `                       | first chorus          | middle chorus         | last chorus           | whole solo`,
  );
  for (const row of rows) {
    console.log(
      `${row.style.padEnd(9)} ${String(row.charts).padStart(6)} ${String(row.solos).padStart(5)} | ` +
        [...row.chorus, row.whole]
          .map(cell)
          .map((text) => text.padEnd(21))
          .join(" | "),
    );
  }
  if (args.json) writeFileSync(args.json, JSON.stringify(rows, null, 2));
}
