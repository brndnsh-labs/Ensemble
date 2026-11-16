// The chart on the page: the whole form on one screen where that leaves it large enough to
// read from beside an instrument, and otherwise set large, four bars to a line, the page
// moving up a line at a time with the band.

import type { Chart } from "@ensemble/engine";
import { keyToString } from "@ensemble/engine";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Reading } from "./ChordSymbol.tsx";
import { ChordSymbol, Simile } from "./ChordSymbol.tsx";
import type { PageBar, PageChord, PageSection } from "./page.ts";
import { pageOf } from "./page.ts";

export interface Playhead {
  /** The bar being played. */
  readonly bar: string;
  /** The next change of chord: its bar, and where in the bar it falls (0 to 1). */
  readonly next?: { readonly bar: string; readonly at: number };
  /** The bars that follow, in the order they will be played: what focus mode shows next. */
  readonly coming: readonly string[];
  /**
   * A bar the band will not play as written, and what it plays there: on the
   * last pass the final bar resolves, and the page says so.
   */
  readonly landing?: { readonly bar: string; readonly chords: readonly PageChord[] };
}

/**
 * The chart as something pressed: the editor's. Every bar is a button and so is every
 * section's name, the page is set at the size it is wanted at and scrolls (so nothing on it
 * changes size when a phone's keyboard takes half the screen), and every section shows its name.
 */
export interface Editing {
  /** The bar open for typing. */
  readonly open: string | undefined;
  /** The section whose actions are showing, by its place in the chart. */
  readonly section: number | undefined;
  /** The bars that cannot be read, and what is written in each. */
  readonly wrong: ReadonlyMap<string, string>;
  /** A bar in words, for a screen reader. */
  readonly said: (bar: string) => string;
  readonly pressBar: (bar: string) => void;
  readonly pressSection: (index: number) => void;
  /** Where the chart is typed in place: what is drawn in the open bar, and under the chosen section's name. */
  readonly barSlot?: ReactNode;
  readonly sectionSlot?: ReactNode;
}

interface Props {
  readonly chart: Chart;
  readonly reading: Reading;
  readonly playhead: Playhead | undefined;
  /** Show only the line being played and the one after it, large. */
  readonly focus: boolean;
  readonly edit?: Editing;
}

/** Heights in units of the root's type size. */
const LINE = { names: 2, numerals: 2, both: 2.9 } as const;
const LABEL = 0.95;
const SECTION_GAP = 0.35;
/** The narrowest a bar may be, in the same units: room for a root and a short quality. */
const BAR_WIDTH = 2.8;
/**
 * The size of a chord's root, in pixels, the chart is wanted at: on a phone, which sits on a
 * music stand at arm's length, and on a wider screen, whose pixels are bigger and nearer.
 * A form that fits one screen at four fifths of this or more is left whole and still; a form
 * that does not is set at this size (or as large as the width allows), four bars to a line,
 * and scrolls. Brandon's eye, from pictures of both: "larger looks better".
 */
const WANTED = { phone: 34, wide: 24 } as const;
const NEAR_ENOUGH = 0.8;
/** How far the whole page is set smaller for its fullest bar, as a share of its size. */
const SMALLER = 0.72;
/** Under this many pixels across the chart is on a phone held upright. */
const PHONE = 560;
/** The chords' width as set, and as far as a crowded bar may squeeze them (the typeface's range). */
const WIDTH = 88;
const NARROWEST = 62;

interface Layout {
  readonly sections: readonly PageSection[];
  /** The root's type size in pixels. */
  readonly size: number;
  /** The form is longer than the screen at this size: the page moves with the band. */
  readonly scrolls: boolean;
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

/** The most bars any line has. */
const columnsOf = (sections: readonly PageSection[]): number =>
  Math.max(1, ...sections.flatMap((section) => section.lines.map((line) => line.length)));

/** The largest type at which a page of so many units and columns fits a box. */
const fit = (units: number, columns: number, w: number, h: number): number =>
  Math.min(h / units, w / columns / BAR_WIDTH);

/** Type is never set smaller than this, in pixels: under it nothing is read, whether it fits or not. */
const SMALLEST = 8;

/**
 * Focus: the line being played and the line that comes after it, which at the
 * bottom of the form is its top again. Before the band starts, the first two.
 */
function focused(sections: readonly PageSection[], playhead: Playhead | undefined): PageSection[] {
  const lines = sections.flatMap((section) => section.lines.map((line) => ({ section, line })));
  const holds = (id: string) => lines.find(({ line }) => line.some((bar) => bar.id === id));
  const first = (playhead && holds(playhead.bar)) ?? lines[0];
  if (!first) return [];
  const after = playhead?.coming.find((id) => !first.line.some((bar) => bar.id === id));
  const second = playhead ? after && holds(after) : lines[1];
  if (!second) return [{ ...first.section, lines: [first.line] }];
  // Two lines of one section are one section; its label is not said twice.
  if (first.section === second.section)
    return [{ ...first.section, lines: [first.line, second.line] }];
  return [first, second].map(({ section, line }) => ({ ...section, lines: [line] }));
}

export function ChartView({ chart, reading, playhead, focus, edit }: Props) {
  const editing = edit !== undefined;
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
    if (focus) return { sections: pageOf(chart, box.w < PHONE ? 0.5 : 1), size: 0, scrolls: false };
    if (editing) {
      // As written, at the size it is wanted at, whatever the height: the page scrolls.
      const written = pageOf(chart, 1);
      const wanted = Math.min(
        box.w / columnsOf(written) / BAR_WIDTH,
        box.w < PHONE ? WANTED.phone : WANTED.wide,
      );
      return { sections: written, size: Math.max(SMALLEST, wanted), scrolls: true };
    }
    let best: Layout | undefined;
    for (const widen of [1, 2]) {
      const sections = pageOf(chart, widen);
      const size = fit(unitsOf(sections, reading), columnsOf(sections), box.w, box.h);
      // Compared before the floor is applied: of two layouts both too small to read as they
      // stand, the one that fits the screen is still the one to take.
      if (!best || size > best.size * 1.15) best = { sections, size, scrolls: false };
    }
    const whole = best as Layout;
    // As written, four bars to a line, at the size it is wanted at or as near as the width allows.
    const written = pageOf(chart, 1);
    const wanted = Math.min(
      box.w / columnsOf(written) / BAR_WIDTH,
      box.w < PHONE ? WANTED.phone : WANTED.wide,
    );
    if (box.w === 0 || whole.size >= wanted * NEAR_ENOUGH)
      return { sections: whole.sections, size: Math.max(SMALLEST, whole.size), scrolls: false };
    return { sections: written, size: wanted, scrolls: true };
  }, [chart, reading, focus, editing, box]);

  // A section's name is where its actions are, so the editor shows every one.
  const showLabels = editing || labelled(layout.sections);
  const sections = focus ? focused(layout.sections, playhead) : layout.sections;
  const columns = columnsOf(layout.sections);
  // In focus the type is one size for the whole tune: sized for the tallest pair of lines there
  // can be (two sections, each with its label), so it does not jump as the lines change.
  const units = focus
    ? 2 * LINE[reading] + (showLabels ? 2 * LABEL : 0) + SECTION_GAP
    : unitsOf(sections, reading);
  const size = focus ? Math.max(SMALLEST, fit(units, columns, box.w, box.h)) : layout.size;
  // When the width is what limits the type, the height left over opens the lines up, to a point.
  const lines = focus ? 2 : sections.reduce((sum, section) => sum + section.lines.length, 0);
  // (Not in the editor, where the height is the keyboard's to take and the page must not move for it.)
  const spare = editing ? 0 : box.h / size - units;
  const line =
    LINE[reading] + Math.max(0, Math.min(spare / Math.max(1, lines), LINE[reading] * 0.5));

  // Make room in the bars that are too full. Narrower letters first, bar by bar, and every
  // chord of a bar by the same amount. Where that is not enough the whole page is set a
  // little smaller, so that every chord on it is one size; only past a point (one very long
  // symbol should not shrink a whole tune) is the bar itself set smaller than its neighbours.
  // (A chord too wide for its own share of a bar that has room borrows it: see `.slot`.)
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again whenever what is drawn changes
  useLayoutEffect(() => {
    const squeeze = () => {
      const page = frame.current!.querySelector<HTMLElement>(".chart")!;
      const bars = [...page.querySelectorAll<HTMLElement>(".bar")].map((bar) => {
        // (What is shown as typed, in the editor, is cut short where it does not fit, not made smaller.)
        const slots = [...bar.querySelectorAll<HTMLElement>(".slot:not(.typed)")];
        const chords = slots
          .map((slot) => slot.firstElementChild as HTMLElement | null)
          .filter((chord): chord is HTMLElement => chord !== null);
        // How much of what the chords need the bar has: the slots shrink to the bar, the chords do not.
        const share = () => {
          const room = slots.reduce(
            (sum, slot) =>
              sum + slot.clientWidth - Number.parseFloat(getComputedStyle(slot).paddingRight),
            0,
          );
          const needed = chords.reduce(
            (sum, chord) => sum + chord.getBoundingClientRect().width,
            0,
          );
          return needed > 0 ? room / needed : 1;
        };
        return { chords, share };
      });
      /** Narrow each full bar's letters; say how much the fullest still lacks. */
      const narrow = (): number => {
        let least = 1;
        for (const { chords, share } of bars) {
          for (const chord of chords) chord.style.cssText = "";
          const first = share();
          if (first >= 1) continue;
          for (const chord of chords) {
            chord.style.fontStretch = `${Math.max(NARROWEST, WIDTH * first)}%`;
          }
          least = Math.min(least, share());
        }
        return least;
      };
      /** Set the page in a size, its lines opened up by whatever height that leaves over. */
      const set = (px: number) => {
        const spare = editing ? 0 : box.h / px - units;
        const open = Math.max(0, Math.min(spare / Math.max(1, lines), LINE[reading] * 0.5));
        page.style.setProperty("--size", `${px}px`);
        page.style.setProperty("--line", String(LINE[reading] + open));
      };
      set(size);
      const least = narrow();
      if (least >= 1) return;
      // A bar holds in proportion more of smaller type: the size at which the fullest bar fits.
      set(size * Math.max(SMALLER, least * 0.98));
      if (narrow() >= 1) return;
      for (const { chords, share } of bars) {
        const left = share();
        if (left >= 1) continue;
        for (const chord of chords) chord.style.fontSize = `${left * 0.98}em`;
      }
    };
    squeeze();
    // The type's own letters arrive after the first drawing, and are a different width.
    let current = true;
    void document.fonts.ready.then(() => current && squeeze());
    return () => {
      current = false;
    };
  }, [sections, size, reading, box.h, units, lines, editing, edit?.wrong]);

  // The page follows the band: when the bar being played is on another line, that line comes
  // to the top of the screen (its section's name with it), so what is coming is always under
  // it. It moves between lines and never inside one. Stopped, the page is the reader's to move.
  const scrolls = !focus && layout.scrolls;
  const playing = playhead?.bar;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the size changes where the lines are
  useEffect(() => {
    const element = frame.current!;
    if (!scrolls || playing === undefined) return;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const to = (top: number) => {
      if (Math.abs(top - element.scrollTop) < 2) return;
      element.scrollTo({ top, behavior: calm ? "auto" : "smooth" });
    };
    const line = element.querySelector('.bar[aria-current="true"]')?.closest<HTMLElement>(".line");
    // The count-in, before any bar is played: from the top.
    if (!line) return to(0);
    const label = line.previousElementSibling;
    const first = label?.classList.contains("label") ? (label as HTMLElement) : line;
    to(first.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop);
  }, [scrolls, playing, size]);

  return (
    <div className={`chart-frame${scrolls ? " scrolls" : ""}`} ref={frame}>
      <div
        className={`chart${focus ? " focus" : ""}${editing ? " editing" : ""}`}
        style={{ "--size": `${size}px`, "--line": line, "--columns": columns } as CSSProperties}
      >
        {sections.map((section, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: in focus the same section can be shown twice
          <section key={i} className="section">
            {showLabels && (
              <header className={`label${edit?.section === section.index ? " chosen" : ""}`}>
                {edit ? (
                  <button
                    type="button"
                    className={`mark${section.label ? "" : " unnamed"}`}
                    aria-expanded={edit.section === section.index}
                    aria-label={`Section ${section.label || "with no name"}: rename, copy, add or delete`}
                    onClick={() => edit.pressSection(section.index)}
                  >
                    {section.label || "no name"}
                  </button>
                ) : (
                  section.label && <span className="mark">{section.label}</span>
                )}
                {section.key && <span className="aside">in {keyToString(section.key)}</span>}
                {section.meter && (
                  <span className="aside">
                    {section.meter.beats}/{section.meter.unit}
                  </span>
                )}
                {edit?.section === section.index && edit.sectionSlot}
              </header>
            )}
            {section.lines.map((line, l) => (
              // A bar's name is its place in the text, which every edit above it moves. While
              // editing, a bar is known by its place on the page, so it is the same button
              // before and after the change that a press on it brings about.
              <div key={edit ? l : line[0]!.id} className="line">
                {line.map((bar, b) => (
                  <Bar
                    key={edit ? b : bar.id}
                    bar={bar}
                    reading={reading}
                    playhead={playhead}
                    edit={edit}
                    late={b >= line.length / 2 && b > 0}
                  />
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
  edit,
  late,
}: {
  bar: PageBar;
  reading: Reading;
  playhead: Playhead | undefined;
  edit: Editing | undefined;
  /** In the right half of its line: what opens from it opens leftward. */
  late: boolean;
}) {
  const now = playhead?.bar === bar.id;
  const next = playhead?.next?.bar === bar.id ? playhead.next.at : undefined;
  const landing = playhead?.landing?.bar === bar.id ? playhead.landing.chords : undefined;
  const chords = landing ?? bar.chords;
  const lead = chords[0]?.at ?? 0;
  const open = edit?.open === bar.id;
  const wrong = edit?.wrong.get(bar.id);
  return (
    <div
      className={`bar${now ? " now" : ""}${bar.repeatOpens ? " opens" : ""}${bar.repeatCloses ? " closes" : ""}${open ? " open" : ""}${wrong !== undefined ? " wrong" : ""}${edit && late ? " late" : ""}`}
      aria-current={now ? "true" : undefined}
      data-bar={edit ? bar.id : undefined}
    >
      {bar.ending !== null && <span className="ending">{bar.ending}.</span>}
      {bar.repeatOpens && <RepeatSign side="opens" />}
      {wrong !== undefined ? (
        // What cannot be read is shown as it was typed, in the pencil that marks what is wrong.
        <span className="slot typed" style={{ flexGrow: 1 }}>
          <span>{wrong}</span>
        </span>
      ) : bar.simile && !landing ? (
        <span className={`slot again${next !== undefined ? " next" : ""}`} style={{ flexGrow: 1 }}>
          <Simile />
        </span>
      ) : (
        <>
          {lead > 0 && <span style={{ flexGrow: lead }} />}
          {chords.map((chord) => (
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
      {edit && !(open && edit.barSlot) && (
        <button
          type="button"
          className="bar-press"
          aria-label={edit.said(bar.id)}
          // Pressing another bar does not take the keyboard away from the one being typed: the press moves it.
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => edit.pressBar(bar.id)}
        />
      )}
      {open && edit?.barSlot}
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
