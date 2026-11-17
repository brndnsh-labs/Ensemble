// A sheet: a slip of paper laid over the screen for one thing to be changed,
// put away again with Done, Escape, or a press anywhere off it. It is the
// browser's own modal dialog, so the screen under it cannot be pressed or
// tabbed to while it is open and a screen reader is told it is a dialog; the
// focus goes back to whatever opened it.

import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { stageSheet } from "../motion.ts";

interface Props {
  readonly open: boolean;
  readonly close: () => void;
  /** What the sheet is for, at its top: also its name to a screen reader. */
  readonly title: ReactNode;
  /** A class of the sheet's own, for what is laid out inside it. */
  readonly kind?: string;
  readonly children: ReactNode;
}

export function Sheet({ open, close, title, kind, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const shut = useRef(close);
  shut.current = close;

  useEffect(() => {
    const sheet = dialog.current;
    if (!sheet || !open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheet.showModal();
    // The sheet itself takes the focus: the next Tab is its first control, and nothing is
    // ringed by a touch.
    sheet.focus({ preventScroll: true });
    stageSheet(sheet);
    return () => {
      sheet.close();
      opener?.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard's way out is Escape, handled as `cancel`
    <dialog
      ref={dialog}
      className={`sheet${kind ? ` ${kind}` : ""}`}
      aria-labelledby={heading}
      tabIndex={-1}
      // Escape: the page decides, so the sheet's state and the dialog's never disagree.
      onCancel={(event) => {
        event.preventDefault();
        shut.current();
      }}
      // A press on the dialog itself, not on anything in it, is a press on the dimmed screen round it.
      onClick={(event) => {
        if (event.target === event.currentTarget) shut.current();
      }}
    >
      {open && (
        <div className="sheet-in">
          <div className="sheet-head">
            <h2 id={heading}>{title}</h2>
            <button type="button" className="done" onClick={() => shut.current()}>
              Done
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
