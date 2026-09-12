import { useEffect, useRef, useState } from 'react';

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
        committed.current = value;
        setText(String(value));
    }, [value]);
    function commit(step = 0) {
        const number = text.trim() ? Number(text) : NaN;
        const next = Math.max(
            40,
            Math.min(240, Math.round((Number.isFinite(number) ? number : value) + step)),
        );
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
                    onClick={() => commit(-5)}
                >
                    −
                </button>
                <input
                    id="tempo"
                    inputMode="numeric"
                    value={text}
                    disabled={disabled}
                    onChange={(event) => setText(event.target.value)}
                    onBlur={() => commit()}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            commit();
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
                    onClick={() => commit(5)}
                >
                    ＋
                </button>
            </div>
        </div>
    );
}
