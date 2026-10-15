import type { MouseEvent, SyntheticEvent } from 'react';

/**
 * A `<dialog>`'s `close` event is QUEUED by `close()`, not fired inside it (HTML spec: "queue an
 * element task … to fire an event named close"). The shell drives every dialog's
 * `showModal()`/`close()` from its own state, so when an action closes one and the musician
 * reopens it before that task runs — Save a copy closes the song menu, "Song actions" is tapped
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

/**
 * A tap on the backdrop closes the dialog (#1700) — for the ones where nothing is lost by it:
 * the band's settings sheets and the song/row menus. A native modal `<dialog>` does not do this
 * by itself (`closedby="any"` is not in every engine yet). The backdrop is painted by the dialog
 * element, so a click there targets the dialog itself, at a point outside its own box; a click on
 * the dialog's padding also targets it, but inside the box. `close()` fires the ordinary `close`
 * event, so the shell hears it the same way it hears Escape.
 */
export function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    const dialog = event.currentTarget;
    if (event.target !== dialog) {
        return;
    }
    const box = dialog.getBoundingClientRect();
    const outside =
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom;
    if (outside) {
        dialog.close();
    }
}
