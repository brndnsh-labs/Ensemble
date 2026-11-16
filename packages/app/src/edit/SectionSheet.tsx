// A section's own actions, reached from its name on the chart: rename it,
// duplicate it, add a section after it, delete it. On a touch screen it is a
// dock at the foot of the screen, where the bar's is; under a mouse it opens
// under the name.

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

interface Props {
  readonly docked: boolean;
  readonly label: string;
  /** How many bars it has, and how many times the song plays it (once, unless it is played again by name). */
  readonly bars: number;
  readonly times: number;
  /** False for the chart's last section: a chart keeps one. */
  readonly canDelete: boolean;
  /** Why a name cannot be given to it, if it cannot. */
  readonly refuses: (name: string) => string | undefined;
  readonly rename: (name: string) => void;
  readonly duplicate: () => void;
  readonly add: () => void;
  readonly remove: () => void;
  readonly close: () => void;
}

export function SectionSheet(props: Props) {
  const { docked, label, bars, times, canDelete } = props;
  const sheet = useRef<HTMLFieldSetElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string>();
  const refused = name === undefined ? undefined : props.refuses(name);

  // Another section's name pressed while this one's was being typed: the typing is dropped.
  // biome-ignore lint/correctness/useExhaustiveDependencies: when the section changes
  useEffect(() => setName(undefined), [label]);

  // A press anywhere else, or Escape, puts it away. (The name on the chart closes it itself.)
  const { close } = props;
  useEffect(() => {
    const pressed = (event: PointerEvent) => {
      const at = event.target as Element | null;
      if (!sheet.current?.contains(at) && !at?.closest(".label.chosen .mark")) close();
    };
    const keyed = (event: KeyboardEvent) => event.key === "Escape" && close();
    addEventListener("pointerdown", pressed);
    addEventListener("keydown", keyed);
    return () => {
      removeEventListener("pointerdown", pressed);
      removeEventListener("keydown", keyed);
    };
  }, [close]);

  const startRenaming = () => {
    // Drawn at once, so the field takes the focus inside the press and a phone's keyboard comes up.
    flushSync(() => setName(label));
    field.current?.focus({ preventScroll: true });
    field.current?.select();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name === undefined || refused) return;
    props.rename(name);
    setName(undefined);
  };

  return (
    <fieldset
      ref={sheet}
      className={docked ? "dock" : "section-panel"}
      aria-label={`Section ${label || "with no name"}`}
    >
      <p className={`dock-says${refused ? " wrong" : ""}`} aria-live="polite">
        {refused ?? (
          <>
            <strong>{label || "No name"}</strong>, {bars} {bars === 1 ? "bar" : "bars"}
            {times > 1 && `, in the song ${times} times`}
          </>
        )}
      </p>
      {name !== undefined ? (
        <form className="dock-type" onSubmit={submit}>
          <input
            ref={field}
            className="bar-field"
            aria-label="The section's name"
            value={name}
            enterKeyHint="done"
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.stopPropagation();
              setName(undefined);
            }}
          />
          <button type="submit" className="dock-done" aria-disabled={refused ? true : undefined}>
            Rename
          </button>
          <button type="button" className="dock-step wide" onClick={() => setName(undefined)}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="dock-acts">
          <button type="button" onClick={startRenaming}>
            Rename
          </button>
          <button type="button" onClick={props.duplicate}>
            Duplicate
          </button>
          <button type="button" onClick={props.add}>
            Add after
          </button>
          <button
            type="button"
            className="danger"
            disabled={!canDelete}
            title={canDelete ? undefined : "A chart keeps one section"}
            onClick={props.remove}
          >
            Delete
          </button>
          {docked && (
            <button type="button" className="dock-done" onClick={close}>
              Done
            </button>
          )}
        </div>
      )}
    </fieldset>
  );
}
