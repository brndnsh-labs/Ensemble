// The chart on the page: the whole form on one screen, sized to fit it.

import type { Chart } from "@ensemble/engine";
import { keyToString } from "@ensemble/engine";
import type { CSSProperties } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Reading } from "./ChordSymbol.tsx";
import { ChordSymbol, Simile } from "./ChordSymbol.tsx";
import type { PageBar, PageSection } from "./page.ts";
import { pageOf } from "./page.ts";

export interface Playhead {
  /** The bar being played. */
  readonly bar: string;
  /** The next change of chord: its bar, and where in the bar it falls (0 to 1). */
  readonly next?: { readonly bar: string; readonly at: number };
}

interface Props {
  readonly chart: Chart;
  readonly reading: Reading;
  readonly playhead: Playhead | undefined;
  /** Show only the line being played and the one after it, large. */
  readonly focus: boolean;
}

/** Heights in units of the root's type size. */
const LINE = { names: 2, numerals: 2, both: 2.9 } as const;
const LABEL = 0.95;
const SECTION_GAP = 0.35;
/** The narrowest a bar may be, in the same units: room for a root and a short quality. */
const BAR_WIDTH = 3.3;
/** The chords' width as set, and as far as a crowded bar may squeeze them (the typeface's range). */
const WIDTH = 88;
const NARROWEST = 62;

interface Layout {
  readonly sections: readonly PageSection[];
  /** The root's type size in pixels. */
  readonly size: number;
}

/** A section's label is shown unless the chart is one unnamed section. */
const labelled = (sections: readonly PageSection[]): boolean =>
  sections.length > 1 || (sections[0]?.label ?? "A") !== "A";

/** The height of a page in units of its type size. */
function unitsOf(sections: readonly PageSection[], reading: Reading): number {
  const lines = sections.reduce((sum, section) => sum + section.lines.length, 0);
  return (
    lines * LINE[reading] +
    (labelled(sections) ? sections.length * LABEL : 0) +
    (sections.length - 1) * SECTION_GAP
  );
}

function fit(sections: readonly PageSection[], reading: Reading, w: number, h: number): number {
  const columns = Math.max(1, ...sections.flatMap((s) => s.lines.map((line) => line.length)));
  return Math.max(8, Math.min(h / unitsOf(sections, reading), w / columns / BAR_WIDTH));
}

/** Just the line being played and the next one down the page. */
function focused(sections: readonly PageSection[], bar: string | undefined): PageSection[] {
  const lines = sections.flatMap((section) => section.lines.map((line) => ({ section, line })));
  const found = lines.findIndex(({ line }) => line.some((b) => b.id === bar));
  const shown = lines.slice(Math.max(0, found), Math.max(0, found) + 2);
  // Two lines of one section are one section; its label is not said twice.
  const [first, second] = shown;
  if (first && second && first.section === second.section)
    return [{ ...first.section, lines: [first.line, second.line] }];
  return shown.map(({ section, line }) => ({ ...section, lines: [line] }));
}

export function ChartView({ chart, reading, playhead, focus }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const element = frame.current!;
    const measure = () => setBox({ w: element.clientWidth, h: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Wider lines when that makes the type bigger: a long form on a laptop reads better eight bars across.
  const layout = useMemo((): Layout => {
    const narrow = box.w < 560;
    const widths = focus ? [narrow ? 0.5 : 1] : [1, 2];
    let best: Layout | undefined;
    for (const widen of widths) {
      const sections = pageOf(chart, widen);
      const size = fit(focus ? sections.slice(0, 2) : sections, reading, box.w, box.h);
      if (!best || size > best.size * 1.15) best = { sections, size };
    }
    return best!;
  }, [chart, reading, focus, box]);

  const sections = focus ? focused(layout.sections, playhead?.bar) : layout.sections;
  const size = focus ? fit(sections, reading, box.w, box.h) : layout.size;
  // When the width is what limits the type, the height left over opens the lines up, to a point.
  const lines = sections.reduce((sum, section) => sum + section.lines.length, 0);
  const spare = box.h / size - unitsOf(sections, reading);
  const line =
    LINE[reading] + Math.max(0, Math.min(spare / Math.max(1, lines), LINE[reading] * 0.5));
  const showLabels = labelled(layout.sections);
  const columns = Math.max(1, ...sections.flatMap((s) => s.lines.map((line) => line.length)));

  // Squeeze a chord that is too wide for its share of the bar: narrower letters first, then smaller.
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again whenever what is drawn changes
  useLayoutEffect(() => {
    const squeeze = () => {
      const slots = [...frame.current!.querySelectorAll<HTMLElement>(".slot")];
      for (const slot of slots) {
        const chord = slot.firstElementChild as HTMLElement | null;
        if (chord) chord.style.cssText = "";
      }
      const room = (slot: HTMLElement) =>
        slot.clientWidth - Number.parseFloat(getComputedStyle(slot).paddingRight);
      const ratios = slots.map((slot) => {
        const chord = slot.firstElementChild as HTMLElement | null;
        return chord ? room(slot) / chord.getBoundingClientRect().width : 1;
      });
      slots.forEach((slot, i) => {
        if (ratios[i]! >= 1) return;
        const chord = slot.firstElementChild as HTMLElement;
        chord.style.fontStretch = `${Math.max(NARROWEST, WIDTH * ratios[i]!)}%`;
      });
      // Narrower letters do not narrow a chord in exact proportion, and have a limit: what is left is made up in size.
      const left = slots.map((slot, i) => {
        const chord = slot.firstElementChild as HTMLElement | null;
        return chord && ratios[i]! < 1 ? room(slot) / chord.getBoundingClientRect().width : 1;
      });
      slots.forEach((slot, i) => {
        if (left[i]! >= 1) return;
        (slot.firstElementChild as HTMLElement).style.fontSize = `${left[i]! * 0.98}em`;
      });
    };
    squeeze();
    // The type's own letters arrive after the first drawing, and are a different width.
    let current = true;
    void document.fonts.ready.then(() => current && squeeze());
    return () => {
      current = false;
    };
  }, [sections, size, reading]);

  return (
    <div className="chart-frame" ref={frame}>
      <div
        className={`chart${focus ? " focus" : ""}`}
        style={{ "--size": `${size}px`, "--line": line, "--columns": columns } as CSSProperties}
      >
        {sections.map((section, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: in focus the same section can be shown twice
          <section key={i} className="section">
            {showLabels && (
              <header className="label">
                {section.label && <span className="mark">{section.label}</span>}
                {section.key && <span className="aside">in {keyToString(section.key)}</span>}
                {section.meter && (
                  <span className="aside">
                    {section.meter.beats}/{section.meter.unit}
                  </span>
                )}
              </header>
            )}
            {section.lines.map((line) => (
              <div key={line[0]!.id} className="line">
                {line.map((bar) => (
                  <Bar key={bar.id} bar={bar} reading={reading} playhead={playhead} />
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function Bar({
  bar,
  reading,
  playhead,
}: {
  bar: PageBar;
  reading: Reading;
  playhead: Playhead | undefined;
}) {
  const now = playhead?.bar === bar.id;
  const next = playhead?.next?.bar === bar.id ? playhead.next.at : undefined;
  const lead = bar.chords[0]?.at ?? 0;
  return (
    <div
      className={`bar${now ? " now" : ""}${bar.repeatOpens ? " opens" : ""}${bar.repeatCloses ? " closes" : ""}`}
      aria-current={now ? "true" : undefined}
    >
      {bar.ending !== null && <span className="ending">{bar.ending}.</span>}
      {bar.repeatOpens && <RepeatSign side="opens" />}
      {bar.simile ? (
        <span className={`slot again${next !== undefined ? " next" : ""}`} style={{ flexGrow: 1 }}>
          <Simile />
        </span>
      ) : (
        <>
          {lead > 0 && <span style={{ flexGrow: lead }} />}
          {bar.chords.map((chord) => (
            <span
              key={chord.at}
              className={`slot${next !== undefined && Math.abs(chord.at - next) < 1e-6 ? " next" : ""}`}
              style={{ flexGrow: chord.span }}
            >
              <ChordSymbol chord={chord.chord} reading={reading} />
            </span>
          ))}
        </>
      )}
      {bar.repeatCloses && <RepeatSign side="closes" />}
      {bar.repeatCloses?.times && <span className="times">×{bar.repeatCloses.times}</span>}
    </div>
  );
}

/** A repeat sign: two dots beside a thin and a thick line. Which way round it faces is the stylesheet's. */
function RepeatSign({ side }: { side: "opens" | "closes" }) {
  return (
    <span className={`repeat ${side}`} aria-hidden="true">
      <i />
      <i />
    </span>
  );
}
