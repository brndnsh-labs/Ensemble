import { MAX_BPM, MIN_BPM } from '@core/config';
import { useEffect, useRef, useState } from 'react';
import { afterPress } from './after-press';

function clampTempo(bpm: number): number {
    return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));
}

/**
 * How far − and + move the tempo: one BPM a press, ten with Shift (#1996, DECISION 2026-11-04),
 * as the field's own Up and Down keys do. Five at a time skipped the tempo a player was after.
 */
function stepOf(direction: 1 | -1, shift: boolean): number {
    return direction * (shift ? 10 : 1);
}

/** Keep intermediate keystrokes local; changing the band is a committed user action. */
export function TempoControl({
    value,
    disabled,
    onCommit,
}: {
    value: number;
    disabled: boolean;
    onCommit: (value: number) => void;
}) {
    const [text, setText] = useState(String(value));
    const committed = useRef(value);
    useEffect(() => {
        // Only a tempo that changed from outside resets the text. On mount the text already
        // holds `value`, and this effect runs a task after the commit: setting it again then
        // overwrote whatever was typed in between (#1485, a song opened then typed into at once).
        if (committed.current === value) {
            return;
        }
        committed.current = value;
        setText(String(value));
    }, [value]);
    function commit(step = 0) {
        const number = text.trim() ? Number(text) : NaN;
        // What was typed is a tempo first (clamped), then the step moves it: `1` then Up is 41,
        // not 2 pulled up to 40 (#2069).
        const typed = clampTempo(Number.isFinite(number) ? number : value);
        const next = clampTempo(typed + step);
        setText(String(next));
        if (next !== committed.current) {
            committed.current = next;
            onCommit(next);
        }
    }
    return (
        <div>
            <label className="setting-label" htmlFor="tempo">
                Tempo
            </label>
            <div className="tempo-control">
                <button
                    className="step"
                    aria-label="Slower"
                    disabled={disabled}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={(event) => commit(stepOf(-1, event.shiftKey))}
                >
                    −
                </button>
                <input
                    id="tempo"
                    inputMode="numeric"
                    // Up and Down step it, so it says so (#2069): a spinbutton with its range.
                    role="spinbutton"
                    aria-valuemin={MIN_BPM}
                    aria-valuemax={MAX_BPM}
                    aria-valuenow={value}
                    value={text}
                    disabled={disabled}
                    onChange={(event) => setText(event.target.value)}
                    // A press that took the focus lands before the commit moves the page (#1733).
                    onBlur={() => afterPress(() => commit())}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            commit();
                        } else if (
                            (event.ctrlKey || event.metaKey) &&
                            event.key.toLowerCase() === 's'
                        ) {
                            // Ctrl/⌘+S saves (the stand's key): typed text is a tempo first, as
                            // a click on Save would have blurred and committed it (#1984).
                            commit();
                        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                            // The field is a number: up and down step it (Shift takes ten), as the
                            // − and + buttons do. Committed at once, like them, so the band follows.
                            event.preventDefault();
                            commit(stepOf(event.key === 'ArrowUp' ? 1 : -1, event.shiftKey));
                        } else if (event.key === 'Escape') {
                            event.preventDefault();
                            setText(String(value));
                        }
                    }}
                />
                <button
                    className="step"
                    aria-label="Faster"
                    disabled={disabled}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={(event) => commit(stepOf(1, event.shiftKey))}
                >
                    +
                </button>
            </div>
        </div>
    );
}
