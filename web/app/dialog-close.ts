import type { MouseEvent, SyntheticEvent } from 'react';

/** Dialogs whose current press began on the backdrop — not inside the box. */
const pressedOnBackdrop = new WeakSet<HTMLDialogElement>();

function onBackdrop(dialog: HTMLDialogElement, event: MouseEvent<HTMLDialogElement>): boolean {
    if (event.target !== dialog) {
        return false;
    }
    const box = dialog.getBoundingClientRect();
    return (
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom
    );
}

/**
 * Dialogs the app itself is closing (`closeDialog`), so a `dialogRule` that holds them open
 * against the browser lets this close through.
 */
const closedOnPurpose = new WeakSet<HTMLDialogElement>();

/**
 * Close a dialog on purpose — the shell's state saying it should be shut, or a dialog's own
 * button. Every programmatic `close()` goes through here: a `busy` dialog re-opens on any close
 * it did not ask for (`dialogRule`), and this is how it tells the two apart.
 */
export function closeDialog(dialog: HTMLDialogElement | null | undefined): void {
    if (dialog?.open) {
        closedOnPurpose.add(dialog);
        dialog.close();
    }
}

/** What a dialog would lose by closing, which decides how it may be closed (#1760). */
export interface DialogRule {
    /** The dialog's own close: the shell's state for whether it is open. */
    onClose: () => void;
    /**
     * Only the dialog's own buttons close it: an action is running whose answer it shows (a
     * delete, a sign-out, a write, an audio render), or it shows a recovery code that is never
     * shown again. Esc and the backdrop are refused, and a close that gets past the refusal
     * anyway re-opens it at once: a browser honours a refused `cancel` only with fresh user
     * activation, so a repeated Esc or Android's Back does close a dialog.
     */
    busy?: boolean;
    /**
     * Something here would be lost by a stray tap: typed input not yet saved, a choice not yet
     * applied, or a step still running that Esc may abandon. The backdrop is refused; Esc and the
     * dialog's own buttons still close it, since those are asked for on purpose.
     */
    keep?: boolean;
}

/**
 * The one rule set every `<dialog>` closes by (#1760). Spread onto the dialog:
 * `<dialog {...dialogRule({ onClose, busy, keep })}>`, and close it from code with `closeDialog`.
 *
 * - **Esc** (the `cancel` event, which the shell's Back also sends) closes it, unless `busy`.
 * - **A tap on the backdrop** closes it only when there is nothing to lose: neither `busy` nor
 *   `keep`. A native modal `<dialog>` does not do this by itself (`closedby="any"` is not in
 *   every engine yet). The backdrop is painted by the dialog element, so a press there targets
 *   the dialog itself at a point outside its own box. BOTH ends of the tap must be there: a drag
 *   that starts inside (selecting a typed name) and is released over the backdrop also reports a
 *   click on the dialog, outside its box, and must not close it. The tap closes on `click`, never
 *   on the way down (WebKit would hand that tap's click to whatever lay beneath), and the press's
 *   start is read from `mousedown`, never `pointerdown` (web/CLAUDE.md's WebKit rules).
 * - **`close`** reaches `onClose` only from a dialog that is really closed, and a
 *   `busy` dialog the browser closed without `closeDialog` is shown again instead.
 *
 * The unmounted dialogs (import, the Repeats and endings guide) keep their own Esc, put after the
 * spread.
 */
export function dialogRule({ onClose, busy = false, keep = false }: DialogRule) {
    return {
        onCancel(event: SyntheticEvent<HTMLDialogElement>) {
            if (busy) {
                event.preventDefault();
                return;
            }
            onClose();
        },
        onClose(event: SyntheticEvent<HTMLDialogElement>) {
            const dialog = event.currentTarget;
            const asked = closedOnPurpose.has(dialog);
            closedOnPurpose.delete(dialog);
            // A `<dialog>`'s `close` event is QUEUED by `close()`, not fired inside it (HTML spec:
            // "queue an element task … to fire an event named close"). The shell drives every
            // dialog from its own state, so when an action closes one and the musician reopens it
            // before that task runs — Duplicate closes the song menu, "Song actions" is tapped
            // again at once — the stale event reaches a dialog that is OPEN again, and shutting
            // it would close it under them (#1402). Only a dialog that is closed reports a close.
            if (dialog.open) {
                return;
            }
            if (busy && !asked) {
                dialog.showModal();
                return;
            }
            onClose();
        },
        onMouseDown(event: MouseEvent<HTMLDialogElement>) {
            const dialog = event.currentTarget;
            if (onBackdrop(dialog, event)) {
                pressedOnBackdrop.add(dialog);
            } else {
                pressedOnBackdrop.delete(dialog);
            }
        },
        onClick(event: MouseEvent<HTMLDialogElement>) {
            const dialog = event.currentTarget;
            const started = pressedOnBackdrop.has(dialog);
            pressedOnBackdrop.delete(dialog);
            if (started && !busy && !keep && onBackdrop(dialog, event)) {
                closeDialog(dialog);
            }
        },
    };
}
