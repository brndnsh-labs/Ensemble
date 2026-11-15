// The editor: one of the player's charts as text on one side and as a page on
// the other, the page following the text as it is typed. The text is the
// player's own; nothing here changes it but their typing and the Format
// button.

import { parse, print } from "@ensemble/engine";
import type { CSSProperties } from "react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { deleteChart, keptOnDevice, saveChart } from "../charts.ts";
import type { LibraryChart } from "../library.ts";
import { ChartView } from "../play/ChartView.tsx";
import type { Reading } from "../play/ChordSymbol.tsx";
import { Source } from "./Source.tsx";
import { useVisibleArea } from "./viewport.ts";

interface Props {
  /** One of the player's own charts. */
  readonly entry: LibraryChart;
  readonly reading: Reading;
}

/** How long typing must pause before the text is written to storage. Leaving the screen writes it at once. */
const SAVE_AFTER_MS = 400;

/** A file name for a chart: its title, without the characters some systems refuse in one. */
const fileName = (title: string): string =>
  `${title.replace(/[\\/:*?"<>|]+/g, "-").trim() || "chart"}.chart`;

export function EditView({ entry, reading }: Props) {
  const [text, setText] = useState(entry.text);
  const [typing, setTyping] = useState(false);
  const area = useVisibleArea(typing);
  const { chart, diagnostics } = useMemo(() => parse(text), [text]);
  // The page can lag a keystroke behind on a slow phone; the marks under the text cannot.
  const page = useDeferredValue(chart);

  const latest = useRef(text);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const save = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    saveChart(entry.id, latest.current);
  }, [entry.id]);
  const change = (next: string) => {
    latest.current = next;
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_AFTER_MS);
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

  const format = () => {
    const next = print(chart);
    if (next === text) return;
    change(next);
    save();
  };

  const download = () => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    link.download = fileName(chart.title);
    link.click();
    // Some browsers read the file after the click has returned.
    setTimeout(() => URL.revokeObjectURL(link.href), 30_000);
  };

  const remove = () => {
    if (!confirm(`Delete “${chart.title}”? This cannot be undone.`)) return;
    clearTimeout(timer.current);
    deleteChart(entry.id);
    location.replace("#/");
  };

  const fitted = area && ({ top: area.top, height: area.height } as CSSProperties);
  return (
    <main className={`edit${typing ? " typing" : ""}`} style={fitted}>
      <header className="bar-top">
        <a className="back" href="#/" aria-label="Back to the charts">
          ‹<span>Charts</span>
        </a>
        <h1>{chart.title}</h1>
        {/* Written first, so the play screen opens on what was just typed. */}
        <a className="to-play" href={`#/chart/${entry.id}`} onClick={save}>
          Play
        </a>
      </header>

      <div className="panes">
        <div className="pane-chart">
          <ChartView chart={page} reading={reading} playhead={undefined} focus={false} />
          {page.sections.length === 0 && <p className="empty-page">The bars appear here.</p>}
        </div>
        <div className="pane-text">
          <div className="tools">
            <button type="button" onClick={format}>
              Format
            </button>
            <button type="button" onClick={download}>
              Export
            </button>
            <button type="button" onClick={remove}>
              Delete
            </button>
          </div>
          {!keptOnDevice() && (
            <p className="problem" role="alert">
              This browser is not keeping charts, so this one lasts until the page is closed. Export
              it to keep it.
            </p>
          )}
          <Source
            text={text}
            diagnostics={diagnostics}
            change={change}
            typing={setTyping}
            area={area}
          />
        </div>
      </div>
    </main>
  );
}
