import { type RefObject, useEffect, useRef } from 'react';
import { closeDialog } from './dialog-close';

/**
 * A modal `<dialog>` driven from the shell's state (#1894): open while `open` is true, shut when it
 * turns false. Returns the ref to hand the dialog (`ref={…}` or a `dialogRef` prop).
 *
 * The close goes through `closeDialog`, never a bare `close()`, so a `busy` dialog's `dialogRule`
 * knows the shell asked for it and does not re-open it. The effect runs only when `open` flips:
 * `showModal()` on a dialog that is already modal does nothing, so a state that swaps one target
 * for another while open (`T | null` read as `!== null`) has nothing to re-run for.
 *
 * It takes no `onOpen` callback. The one site with work to do on each open (the Band sheet's
 * feel refresh) keeps it as its own effect in the shell: a callback here would be a fresh
 * function every render, and keeping the effect keyed on `open` alone would then need a
 * latest-value ref — more machinery than that one effect.
 */
export function useModalDialog(open: boolean): RefObject<HTMLDialogElement | null> {
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        if (open) {
            dialog.current?.showModal();
        } else {
            closeDialog(dialog.current);
        }
    }, [open]);
    return dialog;
}
