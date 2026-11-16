// One bar, open for typing. On a touch screen it is a dock that sits on top of
// the keyboard: what the bar holds, the bar before and the bar after, Done,
// the format's characters and the chord endings the built-in charts use most.
// Under a mouse it is a field laid over the bar itself, with the bar's own
// actions under it and the keyboard doing the rest.

import type { KeyboardEvent, PointerEvent } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EMPTY_BAR } from "./rewrite.ts";
import { said } from "./Source.tsx";

/** The format's characters that go in a bar. A bar line spreads what is typed over the bars that follow. */
const KEYS = ["|", ".", "%", "#", "b", "/", EMPTY_BAR] as const;
/**
 * The chord endings worth a key: the twelve the built-in library uses most, most used
 * first (of its 610 chords: 7 135 times, m7 77, 9 46, m 39, m9 33, maj7 32, maj9 19,
 * 7b9 16, m7b5 12, 13 12, m6 7, dim7 5). A plain major chord, used 161 times, needs none.
 */
const ENDINGS = [
  "7",
  "m7",
  "9",
  "m",
  "m9",
  "maj7",
  "maj9",
  "7b9",
  "m7b5",
  "13",
  "m6",
  "dim7",
] as const;

/** How long a mistake must stand before it is put into words: a chord half typed is not one. */
const SAY_AFTER_MS = 700;

export type BarAction = "before" | "after" | "repeat" | "delete";

interface Props {
  /** On top of the keyboard, or laid over the bar. */
  readonly docked: boolean;
  /** Which bar this is, by its place: the field takes the focus whenever it changes. */
  readonly place: string;
  /** The same in words: `Verse, bar 3 of 8`. */
  readonly where: string;
  /** What the field shows: the bar as the format writes it, or what has been typed since. */
  readonly value: string;
  /** Nothing has been typed yet. */
  readonly untouched: boolean;
  /** Why the bar cannot be read, if it cannot. */
  readonly problems: readonly string[];
  readonly change: (typed: string) => void;
  /** Apply the bar and go to the one before or after. */
  readonly step: (by: -1 | 1) => void;
  readonly can: {
    readonly back: boolean;
    readonly on: boolean;
    readonly repeat: boolean;
    readonly remove: boolean;
  };
  /** Apply it and move on. */
  readonly enter: () => void;
  /** Apply it and close. */
  readonly done: () => void;
  /** Leave the bar as it was. */
  readonly leave: () => void;
  /** The field lost the focus to something outside: the keyboard was put away, or the press was elsewhere. */
  readonly blurred: () => void;
  readonly act: (action: BarAction) => void;
}

const ACTIONS: readonly [BarAction, string][] = [
  ["before", "Bar before"],
  ["after", "Bar after"],
  ["repeat", "Repeat %"],
  ["delete", "Delete bar"],
];

export function BarEditor(props: Props) {
  const { docked, place, where, value, untouched, problems, change, step, can } = props;
  const field = useRef<HTMLInputElement>(null);
  /** Where the caret goes once a key from the dock has been typed. */
  const caretTo = useRef<number>(undefined);
  /** A press is under way inside the editor: the field losing the focus to it is not the bar being left. */
  const pressing = useRef(false);
  /** The dock shows the bar's actions in place of the chord endings. */
  const [acting, setActing] = useState(false);

  // A mistake is put into words once the typing has paused, and unsaid at once when it is put right.
  const mistakes = problems.join("\n");
  const [spoken, setSpoken] = useState(mistakes);
  useEffect(() => {
    if (mistakes === "" || untouched) {
      setSpoken(mistakes);
      return;
    }
    const timer = setTimeout(() => setSpoken(mistakes), SAY_AFTER_MS);
    return () => clearTimeout(timer);
  }, [mistakes, untouched]);
  const words = mistakes === "" ? [] : spoken === "" ? [] : spoken.split("\n");

  // The bar that opens takes the focus, inside the press that opened it, so a phone brings its keyboard up.
  // biome-ignore lint/correctness/useExhaustiveDependencies: when the bar changes, not at every letter
  useLayoutEffect(() => {
    const element = field.current!;
    element.focus({ preventScroll: true });
    // Under a mouse the whole bar is selected, as a cell is: typing replaces it. On a phone the
    // caret goes to the end, where a key from the dock adds to the chord; a lone `%` is selected
    // on both, since nothing is ever added to it.
    if (!docked || value === "%") element.select();
    else element.setSelectionRange(value.length, value.length);
    setActing(false);
  }, [place]);

  useLayoutEffect(() => {
    if (caretTo.current === undefined) return;
    field.current!.setSelectionRange(caretTo.current, caretTo.current);
    caretTo.current = undefined;
  });

  /** Type a key from the dock at the caret, in place of whatever is selected. */
  const type = (key: string) => {
    const element = field.current!;
    const start = element.selectionStart ?? value.length;
    const end = element.selectionEnd ?? start;
    caretTo.current = start + key.length;
    change(value.slice(0, start) + key + value.slice(end));
  };

  const keyed = (event: KeyboardEvent<HTMLInputElement>) => {
    const { selectionStart, selectionEnd } = event.currentTarget;
    const plain = !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
    const caret = selectionStart === selectionEnd ? selectionStart : null;
    if (event.key === "Enter") {
      event.preventDefault();
      props.enter();
    } else if (event.key === "Escape") {
      event.preventDefault();
      props.leave();
    } else if (event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey) {
      // At either end of the chart Tab is the browser's again, and leaving the field applies the bar.
      if (event.shiftKey ? !can.back : !can.on) return;
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    } else if (event.key === "ArrowLeft" && plain && caret === 0 && can.back) {
      event.preventDefault();
      step(-1);
    } else if (event.key === "ArrowRight" && plain && caret === value.length && can.on) {
      event.preventDefault();
      step(1);
    }
  };

  // A press on anything here but the field leaves the focus in the field, and the keyboard up.
  const pressed = (event: PointerEvent) => {
    if (event.target === field.current) return;
    event.preventDefault();
    pressing.current = true;
    const over = () => {
      pressing.current = false;
      removeEventListener("pointerup", over);
      removeEventListener("pointercancel", over);
      // Where a browser moved the focus anyway, it comes back.
      if (field.current && document.activeElement !== field.current)
        field.current.focus({ preventScroll: true });
    };
    addEventListener("pointerup", over);
    addEventListener("pointercancel", over);
  };

  const input = (
    <input
      ref={field}
      className="bar-field"
      aria-label={`The chords of ${where}`}
      value={value}
      placeholder={EMPTY_BAR}
      enterKeyHint="next"
      spellCheck={false}
      autoCorrect="off"
      // A chord starts with a capital and goes on without one: a phone's keyboard can do the first for us.
      autoCapitalize="words"
      autoComplete="off"
      onChange={(event) => change(event.target.value)}
      onKeyDown={keyed}
      onBlur={() => pressing.current || props.blurred()}
    />
  );

  const says = (
    <p className={`dock-says${words.length > 0 ? " wrong" : ""}`} aria-live="polite">
      {words.length > 0 ? said(words.join(" ")) : where}
    </p>
  );

  const actions = (
    <div className="dock-acts">
      {ACTIONS.map(([action, name]) => {
        const off =
          (action === "repeat" && !can.repeat) || (action === "delete" && !can.remove) || undefined;
        return (
          <button
            key={action}
            type="button"
            tabIndex={-1}
            className={action === "delete" ? "danger" : undefined}
            // Not `disabled`: a press on a disabled button would take the focus from the field.
            aria-disabled={off}
            onClick={() => off || props.act(action)}
          >
            {name}
          </button>
        );
      })}
    </div>
  );

  if (!docked)
    return (
      <div className="bar-edit" onPointerDown={pressed}>
        {input}
        <div className="bar-panel">
          {says}
          {actions}
          <p className="bar-hint">
            <kbd>Tab</kbd> next bar <kbd>Enter</kbd> apply <kbd>Esc</kbd> cancel <kbd>|</kbd> starts
            another bar
          </p>
        </div>
      </div>
    );

  return (
    <fieldset className="dock" aria-label={where} onPointerDown={pressed}>
      {says}
      <div className="dock-type">
        <button
          type="button"
          tabIndex={-1}
          className="dock-step"
          aria-label="The bar before"
          aria-disabled={!can.back || undefined}
          onClick={() => can.back && step(-1)}
        >
          <svg viewBox="0 0 22 22" aria-hidden="true">
            <path d="M13.5 4.5L7 11l6.5 6.5" />
          </svg>
        </button>
        {input}
        <button
          type="button"
          tabIndex={-1}
          className="dock-step"
          aria-label="The bar after"
          aria-disabled={!can.on || undefined}
          onClick={() => can.on && step(1)}
        >
          <svg viewBox="0 0 22 22" aria-hidden="true">
            <path d="M8.5 4.5L15 11l-6.5 6.5" />
          </svg>
        </button>
        <button type="button" tabIndex={-1} className="dock-done" onClick={props.done}>
          Done
        </button>
      </div>
      <div className="dock-keys">
        {KEYS.map((key) => (
          <button key={key} type="button" tabIndex={-1} onClick={() => type(key)}>
            {key}
          </button>
        ))}
        <button
          type="button"
          tabIndex={-1}
          className="dock-more"
          aria-pressed={acting}
          aria-label="This bar: add one beside it, repeat the bar before, delete it"
          onClick={() => setActing(!acting)}
        >
          Bar
        </button>
      </div>
      {acting ? (
        actions
      ) : (
        <div className="dock-keys endings">
          {ENDINGS.map((ending) => (
            <button key={ending} type="button" tabIndex={-1} onClick={() => type(ending)}>
              {ending}
            </button>
          ))}
        </div>
      )}
    </fieldset>
  );
}
