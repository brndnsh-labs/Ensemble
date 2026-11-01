import type { BarSplit } from '@core/songbook/score-text';
import './bar-splits.css';

/**
 * The choice a bar of chords typed with no lengths asks for when they do not divide the bar onto
 * the grid (#1980): `C Dm G7` in 4/4 is 2+1+1, 1+2+1 or 1+1+2, none picked for the musician.
 * The first is highlighted, not applied: a click, or Enter in the field, applies the highlighted
 * one, and Up and Down (the field's keys, `chart-sheet.tsx`) move it. Presses keep the field's
 * focus (`mousedown` prevented, never `pointerdown`), so the keyboard stays up on a phone.
 */
export function BarSplits({
    choices,
    index,
    onApply,
    dock = false,
}: {
    choices: readonly BarSplit[];
    index: number;
    onApply: (choice: BarSplit) => void;
    dock?: boolean;
}) {
    return (
        <div className={`bar-splits${dock ? ' in-dock' : ''}`}>
            <span className="bar-splits-ask">How long is each chord?</span>
            <div className="bar-splits-choices" role="radiogroup" aria-label="Split the bar">
                {choices.map((choice, i) => (
                    <button
                        type="button"
                        // biome-ignore lint/a11y/useSemanticElements: a one-of-N choice drawn as buttons that must not take the field's focus; a native radio would.
                        role="radio"
                        aria-checked={i === index}
                        className="bar-split"
                        key={choice.label}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => {
                            event.stopPropagation();
                            onApply(choice);
                        }}
                    >
                        {choice.label}
                    </button>
                ))}
            </div>
            {!dock && <span className="bar-splits-hint">↑↓ choose · Enter applies</span>}
        </div>
    );
}
