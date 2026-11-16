// The editor: one of the player's charts, edited on the chart itself, as a
// mode of the chart's own screen (the same page, with a pencil). A bar is
// pressed and its chords typed; a section's name is pressed for what can be
// done with the section. The chart's text is still the chart: every change
// made by tapping is a rewrite of it (`rewrite.ts`), the text can be typed in
// directly on the Text side, and the arrangement grid writes its block. A
// change made any of those ways shows at once in the others.
//
// It is a hook of the chart's screen, not a screen of its own, so that a bar
// pressed is drawn open inside the press: the field takes the focus there,
// which is what brings a phone's keyboard up. The screen places what it hands
// back: the chart to press, the text or the grid, the dock's words and
// controls, and the dock that sits on a phone's keyboard.

import type { Chart, Diagnostic, StylePack } from "@ensemble/engine";
import { parse, print } from "@ensemble/engine";
import type { ReactNode } from "react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { keptOnDevice, retitled, saveChart } from "../charts.ts";
import { download, fileName } from "../download.ts";
import type { LibraryChart } from "../library.ts";
import type { Editing } from "../play/ChartView.tsx";
import { barId } from "../play/page.ts";
import { ArrangementGrid } from "./ArrangementGrid.tsx";
import type { BarAction } from "./BarEditor.tsx";
import { BarEditor } from "./BarEditor.tsx";
import type { BarPlace } from "./rewrite.ts";
import {
  barsOf,
  barText,
  duplicated,
  EMPTY_BAR,
  labelOf,
  labelTaken,
  playedSections,
  renamed,
  retyped,
  sourceOf,
  withBar,
  withFirstSection,
  withoutBar,
  withoutSection,
  withSection,
} from "./rewrite.ts";
import { SectionSheet } from "./SectionSheet.tsx";
import { Source } from "./Source.tsx";
import type { Area } from "./viewport.ts";
import { useTouchScreen, useVisibleArea } from "./viewport.ts";

export type Side = "chart" | "text" | "arrangement";
const SIDES: readonly [Side, string][] = [
  ["chart", "Chart"],
  ["text", "Text"],
  ["arrangement", "Arrangement"],
];

/** How long typing must pause before the text is written to storage. Leaving the mode writes it at once. */
const SAVE_AFTER_MS = 400;
/** How many changes can be taken back. */
const STEPS = 200;

interface Options {
  /** One of the player's own charts. */
  readonly entry: LibraryChart;
  /** The pencil is down: the screen is in the mode. Off, the hook holds nothing anyone sees. */
  readonly on: boolean;
  /** The style the chart will be played in: the grid draws a section left to it at the level it will be played. */
  readonly style: StylePack;
  /** The chart is a copy of a built-in, just made: the dock says so, once. */
  readonly copied: boolean;
  /** Delete the chart (asked first) and leave its screen. */
  readonly remove: () => void;
}

/** The editor, in parts, for the chart's screen to place. */
export interface Editor {
  /** The text as it stands. */
  readonly text: string;
  /** The chart as the page draws it: with the bar being typed applied. */
  readonly chart: Chart;
  /** Its title, as the text says it. */
  readonly title: string;
  /** What the page is pressed for. */
  readonly edit: Editing;
  readonly side: Side;
  /** The text box has the focus. */
  readonly typing: boolean;
  /** On a touch screen, a bar or a section is open in the dock at the foot of the screen. */
  readonly docked: boolean;
  /** On a touch screen, a bar or the text is being typed: the keyboard is up. */
  readonly keyboard: boolean;
  /** The part of the screen a phone's keyboard leaves, while it is up. */
  readonly area: Area | undefined;
  /** Over the chart: the way to a first line, where it has no bars. */
  readonly over: ReactNode;
  /** The text or the grid, when one of them is open. */
  readonly pane: ReactNode;
  /** The dock's words and controls, in the band's place. */
  readonly dock: ReactNode;
  /** On a touch screen, the bar or the section being changed, on top of the keyboard. */
  readonly keyDock: ReactNode;
  /** Write the bar being typed and everything else to storage, now: the mode is being left. */
  readonly finish: () => void;
  /** Give the chart another title: a step that can be taken back. */
  readonly rename: (title: string) => void;
  /** Drop what is waiting to be written: the chart is being deleted. */
  readonly forget: () => void;
}

/** A bar on the page, as the editor knows it. */
interface Known extends BarPlace {
  /** The bar as the format writes it. */
  readonly text: string;
  /** Its section's name, how many bars the section has, and why the bar cannot be read, if it cannot. */
  readonly label: string;
  readonly of: number;
  readonly errors: readonly string[];
}

const keyOf = (place: BarPlace): string => `${place.section}:${place.bar}`;

/** Every bar the page draws, in the order it draws them, by the name the page gives it. */
function knownBars(chart: Chart, diagnostics: readonly Diagnostic[]): Map<string, Known> {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const known = new Map<string, Known>();
  chart.sections.forEach((section, index) => {
    const source = sourceOf(chart, index);
    const bars = source ? barsOf(source.items) : [];
    bars.forEach((bar, at) => {
      known.set(barId(index, bar.range.start), {
        section: index,
        bar: at,
        text: barText(bar),
        label: section.label,
        of: bars.length,
        errors: errors
          .filter(({ range }) => range.start >= bar.range.start && range.start < bar.range.end)
          .map((diagnostic) => diagnostic.message),
      });
    });
  });
  return known;
}

export function useEditor({ entry, on, style, copied, remove }: Options): Editor {
  const [text, setText] = useState(entry.text);
  const [side, setSide] = useState<Side>("chart");
  const [typing, setTyping] = useState(false);
  /** The bar open for typing, and what has been typed in it since it opened. */
  const [open, setOpen] = useState<BarPlace>();
  const [draft, setDraft] = useState<string>();
  /** The section whose actions are showing. */
  const [section, setSection] = useState<number>();
  /** The dock still says that this is a copy: until the first press on the chart. */
  const [fresh, setFresh] = useState(copied);
  const touch = useTouchScreen();
  const area = useVisibleArea(on && (typing || open !== undefined || section !== undefined));

  const latest = useRef(text);
  /**
   * What can be taken back, and what was. Kept beside the text, not in the screen's state:
   * every change to it comes with a change to the text, which draws the screen again.
   */
  const history = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  /** A stretch of typing in the text box is under way: it is one step to take back. */
  const run = useRef(false);

  // The pencil put down and taken up again starts from the chart as it was saved, on the
  // chart's own side, with nothing to take back: the steps last as long as the mode is open.
  const [was, setWas] = useState(on);
  if (was !== on) {
    setWas(on);
    if (on) {
      setText(entry.text);
      setSide("chart");
      setTyping(false);
      setOpen(undefined);
      setDraft(undefined);
      setSection(undefined);
      setFresh(copied);
      latest.current = entry.text;
      history.current = { past: [], future: [] };
      run.current = false;
    }
  }

  // The chart as it stands, and as it would stand with the open bar applied: the page shows
  // the second, so a bar is drawn as it is typed, and leaving it as it was is forgetting the draft.
  const stands = useMemo(() => parse(text), [text]);
  const preview = useMemo(
    () => (open && draft !== undefined ? retyped(text, open, draft) : undefined),
    [text, open, draft],
  );
  const drawn = useMemo(
    () => (preview && preview.text !== text ? parse(preview.text) : stands),
    [preview, text, stands],
  );
  const { chart, diagnostics } = stands;
  // The page can lag a keystroke behind on a slow phone; the marks under the text cannot.
  const page = useDeferredValue(drawn);
  const known = useMemo(() => knownBars(page.chart, page.diagnostics), [page]);
  const order = useMemo(() => [...known.values()], [known]);
  const idOf = useCallback(
    (place: BarPlace | undefined) => {
      if (!place) return undefined;
      for (const [id, bar] of known) if (keyOf(bar) === keyOf(place)) return id;
      return undefined;
    },
    [known],
  );
  const openId = idOf(open);
  const here = openId === undefined ? undefined : known.get(openId);
  /** The open bar as the text has it, whatever has been typed since. */
  const written = useMemo(() => {
    if (!open) return undefined;
    const source = sourceOf(chart, open.section);
    const bar = source && barsOf(source.items)[open.bar];
    return bar && barText(bar);
  }, [chart, open]);

  // ── the text, kept and taken back ─────────────────────────────────────────

  /** The text with the open bar applied, while it differs: what is kept if the mode is left mid-bar. */
  const pending = useRef<string>(undefined);
  pending.current = preview && preview.text !== text ? preview.text : undefined;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const save = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    saveChart(entry.id, pending.current ?? latest.current);
  }, [entry.id]);
  const write = (next: string) => {
    latest.current = next;
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_AFTER_MS);
  };
  const remember = () => {
    const steps = history.current;
    steps.past.push(latest.current);
    if (steps.past.length > STEPS) steps.past.shift();
    steps.future = [];
  };
  /** A change made by tapping: a step that can be taken back. */
  const commit = (next: string) => {
    if (next === latest.current) return;
    remember();
    run.current = false;
    write(next);
  };
  /** A change typed in the text box: the stretch of typing, from the first letter to leaving the box, is one step. */
  const typed = (next: string) => {
    if (!run.current) remember();
    run.current = true;
    write(next);
  };

  /** Write the open bar as typed. Says how many bars that was: a bar line spreads it over the ones that follow. */
  const apply = (): number => {
    if (!open || draft === undefined) return 1;
    const result = retyped(latest.current, open, draft);
    setDraft(undefined);
    commit(result.text);
    return result.written;
  };

  /** Take a step from one pile and leave where we were on the other. */
  const step = (from: string[], to: string[]) => {
    const next = from.pop();
    if (next === undefined) return;
    to.push(latest.current);
    run.current = false;
    write(next);
  };
  const undo = () => {
    // What is being typed in a bar is the latest change: it is applied, then taken back, and can be done again.
    apply();
    setDraft(undefined);
    step(history.current.past, history.current.future);
  };
  const redo = () => {
    setDraft(undefined);
    step(history.current.future, history.current.past);
  };

  // Nothing typed is lost to leaving the mode or the screen, closing the tab, or the phone putting the app away.
  useEffect(() => {
    if (!on) return;
    const hidden = () => document.visibilityState === "hidden" && save();
    addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", hidden);
      save();
    };
  }, [on, save]);

  // ── a bar ─────────────────────────────────────────────────────────────────

  /** The bar the keyboard's focus goes back to when the one being typed is closed. */
  const refocus = useRef<BarPlace>(undefined);
  const opened = useRef(open);
  opened.current = open;

  /** Close the open bar, written as typed or left as it was. From the keyboard, the focus stays on the bar. */
  const close = (keep: boolean, keyed = false) => {
    if (keep) apply();
    else setDraft(undefined);
    refocus.current = keyed && !touch ? open : undefined;
    setOpen(undefined);
  };
  const go = (to: BarPlace | undefined) => {
    setDraft(undefined);
    setSection(undefined);
    setOpen(to);
  };
  /** Apply the open bar and move: back one, or on past the bars it was spread over. */
  const move = (by: -1 | 1) => {
    if (!open) return;
    // The bars as they are with this one applied: spreading past the end has added some.
    const bars = [...knownBars(drawn.chart, []).values()];
    const at = bars.findIndex((bar) => keyOf(bar) === keyOf(open));
    const spread = apply();
    const to = bars[at + (by === 1 ? spread : -1)];
    if (to) go({ section: to.section, bar: to.bar });
    else close(true, true);
  };
  const pressBar = (id: string) => {
    const bar = known.get(id);
    if (!bar) return;
    apply();
    setFresh(false);
    // On a narrow screen the chart has the place the text would take: a bar pressed is edited on the chart's own side.
    if (!matchMedia("(min-width: 700px)").matches) setSide("chart");
    // Drawn at once: the field takes the focus inside this press, which is what brings a phone's keyboard up.
    flushSync(() => go({ section: bar.section, bar: bar.bar }));
  };
  const act = (action: BarAction) => {
    if (!open || !here) return;
    if (action === "repeat") {
      commit(retyped(latest.current, open, "%").text);
      setDraft(undefined);
      return;
    }
    if (action === "delete") {
      setDraft(undefined);
      commit(withoutBar(latest.current, open));
      go({ section: open.section, bar: Math.min(open.bar, here.of - 2) });
      return;
    }
    apply();
    commit(withBar(latest.current, open, action));
    go({ section: open.section, bar: open.bar + (action === "after" ? 1 : 0) });
  };

  // A bar that is no longer there (its section was deleted, the change that made it was taken back) is closed.
  useEffect(() => {
    if (open && here === undefined && page === drawn) setOpen(undefined);
  }, [open, here, page, drawn]);

  // The bar being typed stays in view: above the dock when a phone's keyboard comes up, and with
  // its actions under it where it is typed in place. So does a section whose actions are showing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: whenever the bar, the section or the room changes
  useEffect(() => {
    if (!on) return;
    const frame = document.querySelector<HTMLElement>(".play .chart-frame");
    const at =
      frame?.querySelector<HTMLElement>(".bar.open") ??
      frame?.querySelector<HTMLElement>(".label.chosen")?.closest<HTMLElement>(".section");
    if (!frame || !at) return;
    const panel = at.querySelector<HTMLElement>(".bar-panel, .section-panel");
    const box = frame.getBoundingClientRect();
    const bar = at.classList.contains("bar");
    // A bar keeps its section's name over it where it can, and clears the fade at the foot of the page.
    const top = at.getBoundingClientRect().top - box.top - (bar ? 26 : 4);
    const bottom =
      Math.max(at.getBoundingClientRect().bottom, panel?.getBoundingClientRect().bottom ?? 0) -
      box.top +
      34;
    // The top wins where both will not fit: a section longer than the screen shows its name and first lines.
    if (top < 0) frame.scrollTop += top;
    else if (bottom > frame.clientHeight)
      frame.scrollTop += Math.min(top, bottom - frame.clientHeight);
  }, [on, openId, section, area?.height, touch, side]);

  // Leaving a bar with Escape or Enter leaves the keyboard's focus on that bar, to go on from.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once the bar has closed
  useEffect(() => {
    const to = idOf(refocus.current);
    if (open || to === undefined) return;
    refocus.current = undefined;
    document
      .querySelector<HTMLElement>(`.play [data-bar="${to}"] .bar-press`)
      ?.focus({ preventScroll: true });
  }, [open]);

  // Undo and redo from the keyboard, anywhere but in a field: there they are the browser's own, for what is typed in it.
  const steps = useRef({ undo, redo });
  steps.current = { undo, redo };
  useEffect(() => {
    if (!on) return;
    const keyed = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if ((event.target as Element).closest?.("input, textarea")) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      event.preventDefault();
      if (key === "y" || event.shiftKey) steps.current.redo();
      else steps.current.undo();
    };
    addEventListener("keydown", keyed);
    return () => removeEventListener("keydown", keyed);
  }, [on]);

  // ── a section ─────────────────────────────────────────────────────────────

  const picked = section === undefined ? undefined : chart.sections[section];
  const pressSection = (index: number) => {
    apply();
    setFresh(false);
    setOpen(undefined);
    setSection(section === index ? undefined : index);
  };
  const closeSection = useCallback(() => setSection(undefined), []);
  const removeSection = () => {
    if (section === undefined || !picked) return;
    const bars = picked.barsFrom === section ? barsOf(picked.items).length : 0;
    const name = picked.label ? `“${picked.label}”` : "this section";
    // Its bars go with it, unless the song plays it again further down: then that one keeps them.
    const again = chart.sections.some((each, i) => i > section && each.barsFrom === section);
    const ask = again
      ? `Delete ${name} here? Where the song plays it again, it keeps its bars.`
      : `Delete ${name} and its ${bars} ${bars === 1 ? "bar" : "bars"}?`;
    if (bars > 0 && !confirm(ask)) return;
    commit(withoutSection(latest.current, section));
    setSection(undefined);
  };

  // ── the chart's own ───────────────────────────────────────────────────────

  const format = () => {
    commit(print(chart));
    save();
  };

  const wrong = useMemo(
    () =>
      new Map(
        [...known].filter(([, bar]) => bar.errors.length > 0).map(([id, bar]) => [id, bar.text]),
      ),
    [known],
  );
  // Mistakes in a bar are marked on the bar. The rest (a header line, a label, a repeat sign) are marked in the text.
  const toFix = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const where = here ? `${here.label || "The chart"}, bar ${here.bar + 1} of ${here.of}` : "";
  const at = here ? order.indexOf(here) : -1;

  const barEditor = open && here && (
    <BarEditor
      docked={touch}
      place={keyOf(open)}
      where={where}
      // A bar of no chord is an empty bar: it opens with nothing in it to clear away.
      value={draft ?? (written === EMPTY_BAR ? "" : (written ?? ""))}
      untouched={draft === undefined}
      problems={here.errors}
      change={setDraft}
      step={move}
      can={{
        back: at > 0,
        on: at >= 0 && at < order.length - 1,
        repeat: here.bar > 0,
        remove: here.of > 1,
      }}
      enter={() => move(1)}
      done={() => close(true)}
      leave={() => close(false, true)}
      // (A field taken off the page as the next bar opens may still say it lost the focus: that is not this bar being left.)
      blurred={() => opened.current && keyOf(opened.current) === keyOf(open) && close(true)}
      act={act}
    />
  );

  const sectionSheet = section !== undefined && picked && (
    <SectionSheet
      docked={touch}
      label={picked.label}
      bars={barsOf(sourceOf(chart, section)?.items ?? []).length}
      times={
        picked.barsFrom === null
          ? 1
          : chart.sections.filter((each) => each.barsFrom === picked.barsFrom).length
      }
      canDelete={picked.barsFrom === null || playedSections(chart) > 1}
      refuses={(name) => {
        const label = labelOf(name);
        if (label === "") return "A section needs a name.";
        return labelTaken(chart, label, picked.label)
          ? `Another section is called ${label}. The same name again would be that section again.`
          : undefined;
      }}
      rename={(name) => commit(renamed(latest.current, section, name))}
      duplicate={() => {
        const made = duplicated(latest.current, section);
        commit(made.text);
        setSection(made.section);
      }}
      add={() => {
        const made = withSection(latest.current, section);
        commit(made.text);
        setSection(made.section);
      }}
      remove={removeSection}
      close={closeSection}
    />
  );

  const docked = on && touch && (open !== undefined || section !== undefined);

  const edit: Editing = {
    open: openId,
    section,
    wrong,
    said: (id) => {
      const bar = known.get(id);
      return bar ? `Bar ${bar.bar + 1} of ${bar.label || "the chart"}: ${bar.text}` : "Bar";
    },
    pressBar,
    pressSection,
    barSlot: touch ? undefined : barEditor,
    sectionSlot: touch ? undefined : sectionSheet,
    // While a phone's keyboard or the dock on it has the room, the page keeps the size it was set at and scrolls.
    held: touch && (docked || typing),
  };

  const canUndo = history.current.past.length > 0 || pending.current !== undefined;
  const canRedo = history.current.future.length > 0;

  const dock = (
    <>
      <p className="edit-says" aria-live="polite">
        <span>
          {fresh
            ? "This is your copy. The built-in chart is unchanged."
            : where || "Press a bar to change it."}
        </span>
        {toFix > 0 && side !== "text" && (
          <button type="button" className="to-fix" onClick={() => setSide("text")}>
            {toFix} to fix
          </button>
        )}
      </p>
      <div className="edit-row">
        <div className="steps">
          {(
            [
              ["Undo", undo, canUndo, "M9 5L4.5 9.5 9 14"],
              ["Redo", redo, canRedo, "M13 5l4.5 4.5L13 14"],
            ] as const
          ).map(([name, press, can, arrow]) => (
            <button
              key={name}
              type="button"
              aria-label={name}
              title={name}
              // Not `disabled`, and nothing done on the way down: a press here leaves the bar being typed its keyboard.
              aria-disabled={!can || undefined}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => can && press()}
            >
              <svg viewBox="0 0 22 22" aria-hidden="true">
                <path d={arrow} />
                <path
                  d={
                    name === "Undo"
                      ? "M5 9.5h7.5a4.5 4.5 0 010 9H9"
                      : "M17 9.5H9.5a4.5 4.5 0 000 9H13"
                  }
                />
              </svg>
            </button>
          ))}
        </div>
        <fieldset className="sides" aria-label="Edit the chart as">
          {SIDES.map(([way, name]) => (
            <button
              key={way}
              type="button"
              className="side"
              aria-pressed={side === way}
              onClick={() => setSide(way)}
            >
              {name}
            </button>
          ))}
        </fieldset>
      </div>
    </>
  );

  const over =
    known.size === 0 ? (
      <p className="empty-page">
        <span>No bars yet.</span>
        <button type="button" onClick={() => commit(withFirstSection(latest.current))}>
          Add a line of bars
        </button>
      </p>
    ) : undefined;

  const pane = side !== "chart" && (
    <div className="pane-text">
      {!keptOnDevice() && (
        <p className="problem" role="alert">
          This browser is not keeping charts, so this one lasts until the page is closed. Export it
          to keep it.
        </p>
      )}
      {side === "text" ? (
        <>
          <div className="tools">
            <button type="button" onClick={format}>
              Format
            </button>
            <button
              type="button"
              onClick={() =>
                download(text, "text/plain;charset=utf-8", fileName(chart.title, "chart", ".chart"))
              }
            >
              Export
            </button>
            <button type="button" className="danger" onClick={remove}>
              Delete
            </button>
          </div>
          <Source
            text={text}
            diagnostics={diagnostics}
            change={typed}
            typing={(typingNow) => {
              setTyping(typingNow);
              // Leaving the box ends the stretch of typing that is one step to take back.
              if (!typingNow) run.current = false;
            }}
            area={area}
          />
        </>
      ) : (
        <ArrangementGrid
          text={text}
          chart={chart}
          diagnostics={diagnostics}
          change={commit}
          style={style}
          showText={() => setSide("text")}
        />
      )}
    </div>
  );

  return {
    text,
    chart: page.chart,
    title: chart.title,
    edit,
    side,
    typing,
    docked,
    keyboard: on && touch && (open !== undefined || typing),
    area,
    over,
    pane,
    dock,
    keyDock: touch && (barEditor || sectionSheet),
    finish: () => {
      apply();
      save();
    },
    rename: (title) => {
      const clean = title.replace(/\s+/g, " ").trim();
      if (clean && clean !== chart.title) commit(retitled(latest.current, clean));
    },
    forget: () => {
      clearTimeout(timer.current);
      timer.current = undefined;
      pending.current = undefined;
      latest.current = entry.text;
    },
  };
}
