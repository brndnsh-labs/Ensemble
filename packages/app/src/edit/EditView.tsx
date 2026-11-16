// The editor: one of the player's charts, edited on the chart itself. A bar is
// pressed and its chords typed; a section's name is pressed for what can be
// done with the section. The chart's text is still the chart: every change
// made by tapping is a rewrite of it (`rewrite.ts`), the text can be typed in
// directly on the Text side, and the arrangement grid writes its block. A
// change made any of those ways shows at once in the others.

import type { Chart, Diagnostic } from "@ensemble/engine";
import { parse, print } from "@ensemble/engine";
import { STYLES, styleById } from "@ensemble/styles";
import type { CSSProperties } from "react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { deleteChart, keptOnDevice, retitled, saveChart } from "../charts.ts";
import { download, fileName } from "../download.ts";
import type { LibraryChart } from "../library.ts";
import type { Editing } from "../play/ChartView.tsx";
import { ChartView } from "../play/ChartView.tsx";
import type { Reading } from "../play/ChordSymbol.tsx";
import { barId } from "../play/page.ts";
import { placeOf, Trail } from "../Trail.tsx";
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
import { useTouchScreen, useVisibleArea } from "./viewport.ts";

interface Props {
  /** One of the player's own charts. */
  readonly entry: LibraryChart;
  readonly reading: Reading;
  /** The style chosen for this chart on the play screen, if one was. */
  readonly style: string | undefined;
}

type Side = "chart" | "text" | "arrangement";
const SIDES: readonly [Side, string][] = [
  ["chart", "Chart"],
  ["text", "Text"],
  ["arrangement", "Arrangement"],
];

/** How long typing must pause before the text is written to storage. Leaving the screen writes it at once. */
const SAVE_AFTER_MS = 400;
/** How many changes can be taken back. */
const STEPS = 200;

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

export function EditView({ entry, reading, style: chosen }: Props) {
  const [text, setText] = useState(entry.text);
  const [side, setSide] = useState<Side>("chart");
  const [typing, setTyping] = useState(false);
  /** The bar open for typing, and what has been typed in it since it opened. */
  const [open, setOpen] = useState<BarPlace>();
  const [draft, setDraft] = useState<string>();
  /** The section whose actions are showing. */
  const [section, setSection] = useState<number>();
  /** The title while it is being typed. */
  const [titling, setTitling] = useState<string>();
  const touch = useTouchScreen();
  const area = useVisibleArea(typing || open !== undefined || section !== undefined);

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

  const latest = useRef(text);
  /** The text with the open bar applied, while it differs: what is kept if the screen is left mid-bar. */
  const pending = useRef<string>(undefined);
  pending.current = preview && preview.text !== text ? preview.text : undefined;
  /** A stretch of typing in the text box is under way: it is one step to take back. */
  const run = useRef(false);
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
  /**
   * What can be taken back, and what was. Kept beside the text, not in the screen's state:
   * every change to it comes with a change to the text, which draws the screen again.
   */
  const history = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
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

  // Nothing typed is lost to leaving the screen, closing the tab, or the phone putting the app away.
  useEffect(() => {
    const hidden = () => document.visibilityState === "hidden" && save();
    addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", hidden);
      save();
    };
  }, [save]);

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
    // On a narrow screen the chart shares the screen with the text: a bar pressed there is edited on the chart's own side.
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
    const frame = document.querySelector<HTMLElement>(".edit .chart-frame");
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
  }, [openId, section, area?.height, touch, side]);

  // Leaving a bar with Escape or Enter leaves the keyboard's focus on that bar, to go on from.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once the bar has closed
  useEffect(() => {
    const to = idOf(refocus.current);
    if (open || to === undefined) return;
    refocus.current = undefined;
    document
      .querySelector<HTMLElement>(`.edit [data-bar="${to}"] .bar-press`)
      ?.focus({ preventScroll: true });
  }, [open]);

  // Undo and redo from the keyboard, anywhere but in a field: there they are the browser's own, for what is typed in it.
  const steps = useRef({ undo, redo });
  steps.current = { undo, redo };
  useEffect(() => {
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
  }, []);

  // ── a section ─────────────────────────────────────────────────────────────

  const picked = section === undefined ? undefined : chart.sections[section];
  const pressSection = (index: number) => {
    apply();
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

  const titled = chart.header.some((item) => item.kind === "field" && item.name === "title");
  const retitle = () => {
    const title = titling?.replace(/\s+/g, " ").trim();
    setTitling(undefined);
    if (title && title !== chart.title) commit(retitled(latest.current, title));
  };

  const format = () => {
    commit(print(chart));
    save();
  };

  const remove = () => {
    if (!confirm(`Delete “${chart.title}”? This cannot be undone.`)) return;
    clearTimeout(timer.current);
    pending.current = undefined;
    deleteChart(entry.id);
    location.replace("#/");
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
  };

  const docked = touch && (open !== undefined || section !== undefined);
  const fitted = area && ({ top: area.top, height: area.height } as CSSProperties);
  return (
    <main
      className={`edit side-${side}${typing ? " typing" : ""}${docked ? " docked" : ""}`}
      // The ink of the style the chart will be played in: the editor's Play is printed in it.
      data-style={(styleById(chosen ?? chart.styleId ?? "") ?? STYLES[0]!).id}
      style={fitted}
    >
      <header className="bar-top">
        <Trail place={placeOf(chart)} />
        <h1 className="title" aria-label={chart.title}>
          <input
            aria-label="Title"
            value={titling ?? (titled ? chart.title : "")}
            placeholder="Untitled"
            enterKeyHint="done"
            spellCheck={false}
            autoComplete="off"
            onFocus={(event) => {
              setTitling(event.target.value);
              event.target.select();
            }}
            onChange={(event) => setTitling(event.target.value)}
            onBlur={retitle}
            onKeyDown={(event) => {
              if (event.key === "Escape") setTitling(undefined);
              if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
            }}
          />
        </h1>
        <div className="steps">
          {(
            [
              [
                "Undo",
                undo,
                history.current.past.length > 0 || pending.current !== undefined,
                "M9 5L4.5 9.5 9 14",
              ],
              ["Redo", redo, history.current.future.length > 0, "M13 5l4.5 4.5L13 14"],
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
        {/* Written first, so the play screen opens on what was just typed. */}
        <a className="to-play" href={`#/chart/${entry.id}`} onClick={save}>
          Play
        </a>
      </header>

      <fieldset className="sides" aria-label="Edit">
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

      <div className="panes">
        <div className="pane-chart">
          <ChartView
            chart={page.chart}
            reading={reading}
            playhead={undefined}
            focus={false}
            edit={edit}
          />
          {known.size === 0 ? (
            <p className="empty-page">
              <span>No bars yet.</span>
              <button type="button" onClick={() => commit(withFirstSection(latest.current))}>
                Add a line of bars
              </button>
            </p>
          ) : (
            <p className="chart-foot">
              <span>
                Press a bar to type its chords, or a section’s name to change the section.
              </span>
              {toFix > 0 && side === "chart" && (
                <button type="button" onClick={() => setSide("text")}>
                  {toFix} to fix in the text
                </button>
              )}
            </p>
          )}
        </div>
        {side !== "chart" && (
          <div className="pane-text">
            {!keptOnDevice() && (
              <p className="problem" role="alert">
                This browser is not keeping charts, so this one lasts until the page is closed.
                Export it to keep it.
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
                      download(
                        text,
                        "text/plain;charset=utf-8",
                        fileName(chart.title, "chart", ".chart"),
                      )
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
                  typing={(on) => {
                    setTyping(on);
                    // Leaving the box ends the stretch of typing that is one step to take back.
                    if (!on) run.current = false;
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
                // The style play would use, so a section left to it is drawn at the level it will be played.
                style={styleById(chosen ?? chart.styleId ?? "") ?? STYLES[0]!}
                showText={() => setSide("text")}
              />
            )}
          </div>
        )}
      </div>
      {touch && barEditor}
      {touch && sectionSheet}
    </main>
  );
}
