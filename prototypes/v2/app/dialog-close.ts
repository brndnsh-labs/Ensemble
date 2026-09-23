import type { SyntheticEvent } from 'react';

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
