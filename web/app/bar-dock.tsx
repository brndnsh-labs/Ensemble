import {
    type ChangeEvent,
    type FocusEvent as ReactFocusEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type ReactNode,
    type Ref,
    useLayoutEffect,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';
import './bar-dock.css';

/** The app's phone width: `style.css`'s `max-width: 760px`, where a bar is typed in the dock
 * (#1724). */
const PHONE_WIDTH = '(max-width: 760px)';

function subscribePhoneWidth(onChange: () => void): () => void {
    const query = window.matchMedia?.(PHONE_WIDTH);
    query?.addEventListener('change', onChange);
    return () => query?.removeEventListener('change', onChange);
}

/** At phone width a bar is typed in the docked field (#1724), not in the bar itself. */
export function usePhoneWidth(): boolean {
    return useSyncExternalStore(
        subscribePhoneWidth,
        () => window.matchMedia?.(PHONE_WIDTH).matches ?? false,
        () => false,
    );
}

/**
 * The chord-ending keys (#1724): what the iPhone keyboard keeps on its second and third layers.
 * Each is printed as a chart prints it and inserts the ASCII spelling the score parser reads
 * (`isScoreChord`), so every one appended to a root is a chord: Dm7b5, D7b9, D#11 ("D♯11").
 */
const ENDINGS: ReadonlyArray<readonly [label: string, text: string]> = [
    ['m7', 'm7'],
    ['7', '7'],
    ['maj7', 'maj7'],
    ['m7♭5', 'm7b5'],
    ['♭9', 'b9'],
    ['9', '9'],
    ['13', '13'],
    ['♯11', '#11'],
    ['dim7', 'dim7'],
    ['sus4', 'sus4'],
    ['6', '6'],
    ['alt', 'alt'],
];

/**
 * A key's text into the field at its caret. An ending adds to the chord, so with the bar's whole
 * text selected (as › leaves it) it goes on the end rather than replacing the bar; anything else
 * selected it replaces. `/` is a beat's hold, its own word, spaced from the chords beside it.
 */
function insertKey(node: HTMLInputElement, key: string): string {
    const value = node.value;
    let start = node.selectionStart ?? value.length;
    let end = node.selectionEnd ?? value.length;
    if (value.length > 0 && start === 0 && end === value.length) {
        // The whole bar selected (after ‹ ›) is a bar to add to, for an ending and a hold alike:
        // a key never wipes a bar's chords (#1724 review).
        start = value.length;
        end = value.length;
    }
    let text = key;
    if (key === '/') {
        const before = value.slice(0, start);
        const after = value.slice(end);
        text = `${before && !/\s$/.test(before) ? ' ' : ''}/${after && !/^\s/.test(after) ? ' ' : ''}`;
    }
    return replaceRange(node, text, start, end, start + text.length);
}

/**
 * Write into the field through its `value` setter, never by range: React tracks the last value
 * it saw through that setter, and a value changed around it leaves the tracker stale, so the
 * next keystroke that lands back on the stale string fires no change at all (#1724 review P1: a
 * 9 tapped by mistake, then Backspace, kept "D79" as the draft while the field said "D7").
 */
function replaceRange(
    node: HTMLInputElement,
    text: string,
    start: number,
    end: number,
    caret: number | null,
): string {
    const selection = [node.selectionStart, node.selectionEnd] as const;
    const next = node.value.slice(0, start) + text + node.value.slice(end);
    node.value = next;
    if (caret === null) {
        node.setSelectionRange(selection[0], selection[1]);
    } else {
        node.setSelectionRange(caret, caret);
    }
    return next;
}

/** A press that must not take focus from the field: the keyboard stays up, the caret put. On the
 * mouse event, which a tap raises too: cancelling the pointer event would cancel the tap's click
 * in WebKit. */
function keepFocus(event: ReactMouseEvent) {
    event.preventDefault();
}

interface BarDockProps {
    /** The bar's number on the chart, for "Bar N". */
    bar: number;
    value: string;
    invalid: boolean;
    busy: boolean;
    inputRef: Ref<HTMLInputElement>;
    canPrevious: boolean;
    canNext: boolean;
    onText: (text: string) => void;
    onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
    onBlur: (event: ReactFocusEvent<HTMLInputElement>) => void;
    /** ‹ and ›: leave the bar for the one before or after, as Shift-Tab and Tab do. */
    onStep: (step: -1 | 1) => void;
    /** Done: leave the bar, and close the field and the keyboard. */
    onDone: () => void;
    /** Put the bar being typed back in view: the keyboard came up or went down under the dock. */
    onReveal: () => void;
    /** ⋯: the bar menu (#1725), as a sheet over the dock. */
    onMenu: () => void;
    menuOpen: boolean;
    /** The split choice (#1980) for chords that do not divide the bar, above the field. */
    splits?: ReactNode;
}

/**
 * The phone's bar field (#1724), docked on top of the on-screen keyboard. An 85px bar is too
 * narrow to type in, so its chords are typed here while the bar above shows them live. One field
 * for every bar: ‹ › move it, the row under it holds the chord endings, and the root of a chord
 * capitalises itself, so typing never needs Shift.
 */
export function BarDock({
    bar,
    value,
    invalid,
    busy,
    inputRef,
    canPrevious,
    canNext,
    onText,
    onKeyDown,
    onBlur,
    onStep,
    onDone,
    onReveal,
    onMenu,
    menuOpen,
    splits,
}: BarDockProps) {
    const dock = useRef<HTMLDivElement>(null);
    const field = useRef<HTMLInputElement | null>(null);
    const reveal = useRef(onReveal);
    reveal.current = onReveal;
    // How far the on-screen keyboard reaches up the layout viewport. iOS overlays its keyboard,
    // shrinking only the visual viewport (and may pan it, `offsetTop`), so a `position: fixed`
    // dock at `bottom: 0` would sit behind it. Without `visualViewport`, or with no keyboard
    // (a desktop browser, Playwright's WebKit), it is 0 and the dock sits at the screen's foot.
    const [keyboard, setKeyboard] = useState(0);
    useLayoutEffect(() => {
        const viewport = window.visualViewport;
        if (!viewport) {
            return;
        }
        const update = () =>
            setKeyboard(
                Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)),
            );
        update();
        viewport.addEventListener('resize', update);
        viewport.addEventListener('scroll', update);
        return () => {
            viewport.removeEventListener('resize', update);
            viewport.removeEventListener('scroll', update);
        };
    }, []);
    // What the dock and keyboard cover of the chart, as `--bar-dock-space`: the chart's bottom
    // padding and scroll padding (`style.css`), so its last bar scrolls clear of them and
    // `scrollIntoView` keeps the bar being typed above them. Removed when the dock closes.
    useLayoutEffect(() => {
        const node = dock.current;
        if (!node) {
            return;
        }
        const root = document.documentElement.style;
        const publish = () =>
            root.setProperty('--bar-dock-space', `${node.offsetHeight + keyboard}px`);
        publish();
        reveal.current();
        const observer = new ResizeObserver(publish);
        observer.observe(node);
        return () => {
            observer.disconnect();
            root.removeProperty('--bar-dock-space');
        };
    }, [keyboard]);
    // The index of the root this field last capitalised, so a flat numeral's `b` it took for a
    // root ("bVII") can go back to lowercase when the numeral follows.
    const capitalised = useRef<number | null>(null);
    function change(event: ChangeEvent<HTMLInputElement>) {
        const node = event.target;
        const input = event.nativeEvent as InputEvent;
        const at = node.selectionStart ?? 0;
        const typed = input.inputType === 'insertText' && input.data?.length === 1;
        const lastCap = capitalised.current;
        capitalised.current = null;
        if (typed && at > 0 && at === node.selectionEnd && node.value[at - 1] === input.data) {
            const before = node.value.slice(0, at - 1);
            if (/^[a-g]$/.test(input.data ?? '') && (!before || /[\s/]$/.test(before))) {
                // A chord's root, typed lowercase at a chord's start or after a slash: a → A.
                // Only the letter just typed: a capital typed, or a letter edited later, stays.
                replaceRange(node, (input.data ?? '').toUpperCase(), at - 1, at, at);
                capitalised.current = at - 1;
            } else if (
                lastCap === at - 2 &&
                node.value[lastCap] === 'B' &&
                /^[IViv]$/.test(input.data ?? '')
            ) {
                replaceRange(node, 'b', lastCap, lastCap + 1, null);
            }
        }
        onText(node.value);
    }
    function pressKey(text: string) {
        const node = field.current;
        if (!node || busy) {
            return;
        }
        capitalised.current = null;
        onText(insertKey(node, text));
    }
    function setRefs(node: HTMLInputElement | null) {
        field.current = node;
        if (typeof inputRef === 'function') {
            inputRef(node);
        } else if (inputRef) {
            inputRef.current = node;
        }
    }
    return (
        // A swipe along the endings is the row's, not the chart's: `.chart-scroll`, an ancestor,
        // takes a touch move as browsing away from Following.
        <div
            className="bar-dock"
            ref={dock}
            style={{ bottom: keyboard }}
            data-keyboard={keyboard > 0 ? 'up' : undefined}
            onTouchMove={(event) => event.stopPropagation()}
            // A press anywhere on the dock but the field itself keeps the field's focus: the
            // dock sits inside the focusable chart, which Chromium would otherwise focus on a
            // tap of the dock's padding, closing it (#1724 review).
            onMouseDown={(event) => {
                if (event.target !== field.current) {
                    event.preventDefault();
                }
            }}
        >
            {splits}
            <div className="bar-dock-row">
                <button
                    type="button"
                    className="bar-dock-button"
                    aria-label="Previous bar"
                    // `aria-disabled`, not `disabled`: a press on a disabled button still
                    // takes focus from the field, and with it the keyboard.
                    aria-disabled={busy || !canPrevious}
                    onMouseDown={keepFocus}
                    onClick={() => !busy && canPrevious && onStep(-1)}
                >
                    ‹
                </button>
                <label className={`bar-dock-field${invalid ? ' invalid' : ''}`}>
                    <span className="bar-dock-bar" aria-hidden="true">
                        Bar {bar}
                    </span>
                    <input
                        ref={setRefs}
                        className="bar-dock-input"
                        aria-label={`Chords in bar ${bar}`}
                        aria-invalid={invalid ? true : undefined}
                        value={value}
                        maxLength={4000}
                        readOnly={busy}
                        spellCheck={false}
                        autoCapitalize="off"
                        autoCorrect="off"
                        autoComplete="off"
                        enterKeyHint="next"
                        onChange={change}
                        onKeyDown={onKeyDown}
                        onBlur={onBlur}
                    />
                </label>
                <button
                    type="button"
                    className="bar-dock-button"
                    aria-label="Next bar"
                    aria-disabled={busy || !canNext}
                    onMouseDown={keepFocus}
                    onClick={() => !busy && canNext && onStep(1)}
                >
                    ›
                </button>
                {/* The bar menu (#1725). Its press keeps the field's focus like every dock key,
                    so the bar stays open; the sheet then takes focus itself, and the keyboard
                    goes down for it. */}
                <button
                    type="button"
                    className="bar-dock-button"
                    aria-label="Bar menu"
                    aria-haspopup="dialog"
                    aria-expanded={menuOpen}
                    aria-disabled={busy || undefined}
                    data-bar-menu-trigger=""
                    onMouseDown={keepFocus}
                    onClick={() => !busy && onMenu()}
                >
                    ⋯
                </button>
                <button
                    type="button"
                    className="bar-dock-button bar-dock-done"
                    onMouseDown={keepFocus}
                    onClick={onDone}
                >
                    Done
                </button>
            </div>
            <div className="bar-dock-keys" role="group" aria-label="Chord endings">
                {ENDINGS.map(([label, text]) => (
                    <button
                        type="button"
                        className="bar-dock-key"
                        key={text}
                        aria-disabled={busy}
                        onMouseDown={keepFocus}
                        onClick={() => pressKey(text)}
                    >
                        {label}
                    </button>
                ))}
                <button
                    type="button"
                    className="bar-dock-key"
                    aria-label="Hold a beat"
                    title="Hold a beat"
                    aria-disabled={busy}
                    onMouseDown={keepFocus}
                    onClick={() => pressKey('/')}
                >
                    /
                </button>
            </div>
        </div>
    );
}
