/**
 * A leave set off by a press lands only once that press has (#1733).
 *
 * A press outside an open bar takes the field's focus on its way down — its `mousedown`, or the
 * bar menu's outside `pointerdown` — and leaving the bar applies it: the chart changes, the header
 * says "Unsaved changes", the field becomes chords. Done right there, that re-lays the page out
 * between the press's down and its up, and the up lands somewhere else: the browser then sends
 * the click to whatever holds both points, not to the button pressed. On a CI WebKit the status
 * line under the title grew a line and moved Play 22px down from under the pointer, so pressing
 * Play with a bar open left the bar and never played.
 *
 * So a leave asked for during a press waits for that press to land: its click (in the capture
 * phase, before any handler of the page — the click's target is already decided by then, so the
 * page can change under it, and the press's own action reads the bar as applied, as it always
 * has), or, with no click, the press's end. Anything after it — a key, a choice in a select, the
 * next press — runs it first, so a later action never runs before an earlier leave, and a leave
 * can never apply (and stop) a band that a later action started. A leave asked for outside a
 * press (Tab, a click's own handler, focus moving away by itself) runs at once.
 */

type Task = () => void;

let pressing = false;
const waiting: Task[] = [];
let ending: ReturnType<typeof setTimeout> | null = null;

/** Runs `task` now, or once the press in progress has landed. */
export function afterPress(task: Task): void {
    if (pressing) {
        waiting.push(task);
        return;
    }
    task();
}

/** Run what waits, in order. `released`: the press is over too. */
function flush(released: boolean): void {
    if (released) {
        pressing = false;
        if (ending !== null) {
            clearTimeout(ending);
            ending = null;
        }
    }
    for (const task of waiting.splice(0)) {
        task();
    }
}

function begin(): void {
    // The press before it, if it never landed, lands now: in order.
    flush(true);
    pressing = true;
}

if (typeof window !== 'undefined') {
    // Capture on the window: before the page's own listeners (the bar menu's outside press is a
    // capture listener on the document) and before the default action that moves focus.
    window.addEventListener('pointerdown', begin, true);
    // A touch's compatibility mouse events come after its pointerup: its mousedown (which moves
    // focus) is a press of its own. A mouse's mousedown follows its pointerdown in the same press.
    window.addEventListener(
        'mousedown',
        () => {
            if (!pressing) {
                begin();
            }
        },
        true,
    );
    window.addEventListener('click', () => flush(true), true);
    // No click (a press dragged off, or one the page took for something else): the press is over
    // once its up has been handled, and a click, if one comes, comes before that.
    const released = () => {
        if (pressing && ending === null) {
            ending = setTimeout(() => flush(true), 0);
        }
    };
    window.addEventListener('mouseup', released, true);
    window.addEventListener('pointerup', released, true);
    window.addEventListener('pointercancel', () => flush(true), true);
    window.addEventListener('keydown', () => flush(true), true);
    // A select's choice (its popup may swallow the up): what waits goes first, the press goes on.
    // Not the end of the press — a text field's own change fires on the very blur being waited on.
    window.addEventListener('change', () => flush(false), true);
}
