import { type SyntheticEvent, useEffect, useRef } from 'react';

/**
 * When a range input's edit is committed: once per gesture, never on every `input` event a
 * drag fires, so a drag makes one undo step.
 *
 * The input's own `change` event is the commit — a browser fires it when the edit is final: a
 * drag released (wherever the pointer ends up), or a step made by assistive technology, which
 * sends no pointer or key events at all. A held arrow key fires it on every repeat, so while a
 * key is down the commit waits for the key to come up. Pointer-up, pointer-cancel and focus
 * leaving commit too, for a gesture that ends some other way; each is a no-op unless an edit
 * is still pending.
 *
 * Spread `handlers` on the input, pass it `ref`, and call `edited()` from its `onChange`.
 */
export function useRangeCommit(commit: (displayed: number) => void) {
    const ref = useRef<HTMLInputElement>(null);
    const keyHeld = useRef(false);
    const pending = useRef(false);
    const latest = useRef(commit);
    latest.current = commit;

    function flush(element: HTMLInputElement) {
        if (pending.current) {
            pending.current = false;
            latest.current(Number(element.value));
        }
    }

    useEffect(() => {
        const element = ref.current;
        if (!element) {
            return;
        }
        // React's `onChange` is the `input` event; the native `change` has no prop of its own.
        const onChange = () => {
            if (!keyHeld.current) {
                flush(element);
            }
        };
        element.addEventListener('change', onChange);
        return () => element.removeEventListener('change', onChange);
    });

    const end = (event: SyntheticEvent<HTMLInputElement>) => {
        keyHeld.current = false;
        flush(event.currentTarget);
    };
    return {
        ref,
        edited: () => {
            pending.current = true;
        },
        handlers: {
            onKeyDown: () => {
                keyHeld.current = true;
            },
            onKeyUp: end,
            onPointerUp: end,
            onPointerCancel: end,
            onBlur: end,
        },
    };
}
