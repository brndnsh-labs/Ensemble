// The editor: one of the player's charts as text on one side and as a page on
// the other, the page following the text as it is typed. The text is the
// player's own; nothing here changes it but their typing, the Format button,
// and the arrangement grid, which writes its block and nothing else.

import { parse, print } from "@ensemble/engine";
import { STYLES, styleById } from "@ensemble/styles";
import type { CSSProperties } from "react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Back } from "../Back.tsx";
import { deleteChart, keptOnDevice, saveChart } from "../charts.ts";
import { download, fileName } from "../download.ts";
import type { LibraryChart } from "../library.ts";
import { ChartView } from "../play/ChartView.tsx";
import type { Reading } from "../play/ChordSymbol.tsx";
import { ArrangementGrid } from "./ArrangementGrid.tsx";
import { Source } from "./Source.tsx";
import { useVisibleArea } from "./viewport.ts";

interface Props {
  /** One of the player's own charts. */
  readonly entry: LibraryChart;
  readonly reading: Reading;
  /** The style chosen for this chart on the play screen, if one was. */
  readonly style: string | undefined;
}

type Side = "chords" | "arrangement";
const SIDES: readonly [Side, string][] = [
  ["chords", "Chords"],
  ["arrangement", "Arrangement"],
];

/** How long typing must pause before the text is written to storage. Leaving the screen writes it at once. */
const SAVE_AFTER_MS = 400;

export function EditView({ entry, reading, style: chosen }: Props) {
  const [text, setText] = useState(entry.text);
  const [side, setSide] = useState<Side>("chords");
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
        <Back />
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
          {side === "chords" ? (
            <Source
              text={text}
              diagnostics={diagnostics}
              change={change}
              typing={setTyping}
              area={area}
            />
          ) : (
            <ArrangementGrid
              text={text}
              chart={chart}
              diagnostics={diagnostics}
              change={change}
              // The style play would use, so a section left to it is drawn at the level it will be played.
              style={styleById(chosen ?? chart.styleId ?? "") ?? STYLES[0]!}
              showText={() => setSide("chords")}
            />
          )}
        </div>
      </div>
    </main>
  );
}
