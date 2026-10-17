import type { MouseEvent, SyntheticEvent } from 'react';

/**
 * A `<dialog>`'s `close` event is QUEUED by `close()`, not fired inside it (HTML spec: "queue an
 * element task … to fire an event named close"). The shell drives every dialog's
 * `showModal()`/`close()` from its own state, so when an action closes one and the musician
 * reopens it before that task runs — Duplicate closes the song menu, "Song actions" is tapped
 * again at once — the stale event reaches a dialog that is OPEN again, and a plain
 * `onClose={() => setOpen(false)}` shuts it under them (#1402). Only a dialog that is actually
 * closed reports a close.
 */
export function whenClosed(onClose: () => void) {
    return (event: SyntheticEvent<HTMLDialogElement>) => {
        if (!event.currentTarget.open) {
            onClose();
        }
    };
}

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
 * A tap on the backdrop closes the dialog (#1700) — for the ones where nothing is lost by it:
 * the band's settings sheets and the song/row menus. A native modal `<dialog>` does not do this
 * by itself (`closedby="any"` is not in every engine yet). The backdrop is painted by the dialog
 * element, so a press there targets the dialog itself at a point outside its own box. BOTH ends
 * of the tap must be there: a drag that starts inside (selecting a typed name) and is released
 * over the backdrop also reports a click on the dialog, outside its box, and must not close it.
 * `close()` fires the ordinary `close` event, so the shell hears it the same way it hears Escape.
 * Spread onto the dialog: `<dialog {...backdropDismiss}>`.
 */
export const backdropDismiss = {
    onPointerDown(event: MouseEvent<HTMLDialogElement>) {
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
        if (started && onBackdrop(dialog, event)) {
            dialog.close();
        }
    },
};
