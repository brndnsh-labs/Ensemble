// The chart's text as the player types it, with what the parser found wrong
// marked under the words themselves. A text box cannot colour its own letters,
// so the marks are drawn on a copy of the text behind it: the same letters in
// the same type at the same place, see-through except for the underlines.
// Lines never wrap, in either, so the two cannot fall out of step on a long
// line; bars line up in columns anyway, and a long line scrolls sideways.

import type { Diagnostic } from "@ensemble/engine";
import type { PointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Area } from "./viewport.ts";

type Severity = Diagnostic["severity"];

/** Errors first: they change what the band plays. */
const RANK: Readonly<Record<Severity, number>> = { error: 0, warning: 1, info: 2 };
const SAID: Readonly<Record<Severity, string>> = {
  error: "Error",
  warning: "Warning",
  info: "Note",
};
/** The format's own characters, which a phone's keyboard hides a page or two away. */
const KEYS = ["|", ".", "%", "#", "b", "/", ":", "[", "]"] as const;

interface Props {
  readonly text: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly change: (text: string) => void;
  /** Told when the text gains and loses the focus: the screen makes room for the keyboard. */
  readonly typing: (on: boolean) => void;
  /** The part of the screen the keyboard leaves, while it is up. */
  readonly area: Area | undefined;
}

/** A stretch of the text and the worst problem found in it. An empty one marks a place. */
interface Run {
  readonly start: number;
  readonly end: number;
  readonly severity: Severity | null;
}

/** Cut the text where problems start and end, so each stretch can be marked for the worst in it. */
function runsOf(text: string, diagnostics: readonly Diagnostic[]): Run[] {
  const clamp = (at: number) => Math.max(0, Math.min(text.length, at));
  const marks = diagnostics.map(({ range, severity }) => {
    const start = clamp(range.start);
    let end = clamp(range.end);
    // A problem at a place rather than over letters is marked on the letter there, when there is one.
    if (end <= start) end = start < text.length && text[start] !== "\n" ? start + 1 : start;
    return { start, end, severity };
  });
  const worst = (marked: readonly { severity: Severity }[]) =>
    marked.reduce<Severity | null>(
      (most, { severity }) => (most === null || RANK[severity] < RANK[most] ? severity : most),
      null,
    );
  const cuts = [...new Set([0, text.length, ...marks.flatMap((m) => [m.start, m.end])])].sort(
    (a, b) => a - b,
  );
  const runs: Run[] = [];
  cuts.forEach((at, i) => {
    const empty = worst(marks.filter((m) => m.start === at && m.end === at));
    if (empty) runs.push({ start: at, end: at, severity: empty });
    const next = cuts[i + 1];
    if (next === undefined) return;
    const severity = worst(marks.filter((m) => m.start <= at && m.end >= next && m.end > m.start));
    const last = runs.at(-1);
    if (last && last.end === at && last.end > last.start && last.severity === severity)
      runs[runs.length - 1] = { ...last, end: next };
    else runs.push({ start: at, end: next, severity });
  });
  return runs;
}

/** A message with its `quoted` chart text set as typed. */
function said(message: string): ReactNode[] {
  return (
    message
      .split("`")
      // biome-ignore lint/suspicious/noArrayIndexKey: the parts of a fixed message never reorder
      .map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part))
  );
}

const lineAt = (text: string, at: number): number => text.slice(0, at).split("\n").length;

export function Source({ text, diagnostics, change, typing, area }: Props) {
  const box = useRef<HTMLTextAreaElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  /** Where the caret goes once a key from the row has been typed. */
  const caretTo = useRef<number>(undefined);
  const [caretLine, setCaretLine] = useState(1);
  const [open, setOpen] = useState(false);

  const runs = useMemo(() => runsOf(text, diagnostics), [text, diagnostics]);
  const listed = useMemo(
    () =>
      [...diagnostics].sort(
        (a, b) => RANK[a.severity] - RANK[b.severity] || a.range.start - b.range.start,
      ),
    [diagnostics],
  );
  // The one a phone has room for: the problem on the caret's line, or the first.
  const current = listed.find((d) => d.range.line === caretLine) ?? listed[0];

  /** Keep the marked copy where the text is, however far it has been scrolled. */
  const follow = useCallback(() => {
    const element = box.current;
    if (element && copy.current)
      copy.current.style.transform = `translate(${-element.scrollLeft}px, ${-element.scrollTop}px)`;
  }, []);
  useLayoutEffect(() => {
    const element = box.current!;
    if (caretTo.current !== undefined) {
      element.setSelectionRange(caretTo.current, caretTo.current);
      caretTo.current = undefined;
    }
    follow();
  });
  useEffect(() => {
    const observer = new ResizeObserver(follow);
    observer.observe(box.current!);
    return () => observer.disconnect();
  }, [follow]);

  /** Scroll the text, if it must, so that a stretch of it is well inside the box. */
  const reveal = (top: number, left: number, height: number) => {
    const element = box.current!;
    if (top < element.scrollTop || top + height > element.scrollTop + element.clientHeight)
      element.scrollTop = top - element.clientHeight / 3;
    if (left < element.scrollLeft || left > element.scrollLeft + element.clientWidth - 40)
      element.scrollLeft = left - element.clientWidth / 3;
    follow();
  };

  // When the keyboard comes up the box gets shorter: keep the line being typed above it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the room changes
  useLayoutEffect(() => {
    const element = box.current!;
    if (!area || document.activeElement !== element) return;
    const style = getComputedStyle(element);
    const height = Number.parseFloat(style.lineHeight);
    const top =
      (lineAt(text, element.selectionStart) - 1) * height + Number.parseFloat(style.paddingTop);
    if (top < element.scrollTop || top + height > element.scrollTop + element.clientHeight)
      element.scrollTop = top + height - element.clientHeight + height;
    follow();
  }, [area?.height]);

  /** Put the caret on a problem and bring it into view. */
  const choose = (diagnostic: Diagnostic) => {
    const element = box.current!;
    const { start, end } = diagnostic.range;
    element.focus({ preventScroll: true });
    element.setSelectionRange(start, Math.max(start, end));
    setCaretLine(diagnostic.range.line);
    const mark = [...copy.current!.querySelectorAll<HTMLElement>("mark")].find((m) => {
      const from = Number(m.dataset.start);
      const to = Number(m.dataset.end);
      return from <= start && (start < to || from === to);
    });
    if (mark) reveal(mark.offsetTop, mark.offsetLeft, mark.offsetHeight);
  };

  /** Type a key from the row at the caret, in place of whatever is selected, keeping the keyboard up. */
  const press = (key: string) => (event: PointerEvent) => {
    event.preventDefault();
    const element = box.current!;
    const { selectionStart, selectionEnd } = element;
    caretTo.current = selectionStart + key.length;
    change(text.slice(0, selectionStart) + key + text.slice(selectionEnd));
  };

  const others = listed.length - 1;
  return (
    <>
      <div className="source">
        <div className="source-copy" aria-hidden="true">
          <div ref={copy}>
            {runs.map((run) =>
              run.severity === null ? (
                text.slice(run.start, run.end)
              ) : (
                <mark
                  key={`${run.start}-${run.end}`}
                  className={`${run.severity}${run.start === run.end ? " empty" : ""}`}
                  data-start={run.start}
                  data-end={run.end}
                >
                  {text.slice(run.start, run.end)}
                </mark>
              ),
            )}
            {/* A last empty line still has its height. */}
            {"​"}
          </div>
        </div>
        <textarea
          ref={box}
          value={text}
          aria-label="The chart's text"
          wrap="off"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          onChange={(e) => change(e.target.value)}
          onScroll={follow}
          onSelect={(e) =>
            setCaretLine(lineAt(e.currentTarget.value, e.currentTarget.selectionStart))
          }
          onFocus={() => typing(true)}
          onBlur={() => typing(false)}
        />
      </div>

      <div className={`problems${open ? " open" : ""}`}>
        {listed.length === 0 ? (
          <p className="clean">Nothing to fix.</p>
        ) : (
          <ol>
            {listed.map((diagnostic, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: two problems can share a place and a message
                key={i}
                className={diagnostic === current ? "current" : undefined}
              >
                <button type="button" onClick={() => choose(diagnostic)}>
                  <span className={`where ${diagnostic.severity}`}>
                    <span className="said">{SAID[diagnostic.severity]}, </span>
                    line {diagnostic.range.line}
                  </span>
                  <span className="what">{said(diagnostic.message)}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
        {others > 0 && (
          <button type="button" className="more" onClick={() => setOpen(!open)}>
            {open ? "Fewer" : `${others} more`}
          </button>
        )}
      </div>

      <div className="keys" role="toolbar" aria-label="The chart's characters">
        {KEYS.map((key) => (
          <button key={key} type="button" tabIndex={-1} onPointerDown={press(key)}>
            {key}
          </button>
        ))}
      </div>
    </>
  );
}
