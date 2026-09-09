'use client';

import { useId } from 'react';
import type { FormDraft } from '../lib/form-editing';
import './form-controls.css';

interface FormControlsProps {
    value: FormDraft;
    onChange: (value: FormDraft) => void;
    disabled?: boolean;
}

/** No shadow drafts: the measure editor owns raw values through selection, Save and recovery. */
export function FormControls({ value, onChange, disabled = false }: FormControlsProps) {
    const id = useId();
    return (
        <details className="form-controls">
            <summary>Repeats and endings</summary>
            <fieldset disabled={disabled} aria-describedby={`${id}-help`}>
                <legend className="sr">Repeats and endings for this bar</legend>
                <label className="form-controls-toggle">
                    <input
                        type="checkbox"
                        checked={value.repeatStart}
                        onChange={(event) =>
                            onChange({ ...value, repeatStart: event.target.checked })
                        }
                    />
                    <span>Start repeat here</span>
                </label>
                <div className="form-controls-grid">
                    <div className="form-controls-field">
                        <label htmlFor={`${id}-repeat`}>Total repeat passes</label>
                        <input
                            id={`${id}-repeat`}
                            type="text"
                            inputMode="numeric"
                            value={value.repeatTimes}
                            placeholder="No repeat end"
                            autoComplete="off"
                            aria-describedby={`${id}-repeat-help`}
                            onChange={(event) =>
                                onChange({ ...value, repeatTimes: event.target.value })
                            }
                        />
                        <span id={`${id}-repeat-help`} className="form-controls-hint">
                            End the repeat here: 2 plays it twice. Leave blank for no repeat sign.
                        </span>
                    </div>
                    <div className="form-controls-field">
                        <label htmlFor={`${id}-ending`}>Ending passes</label>
                        <input
                            id={`${id}-ending`}
                            type="text"
                            value={value.endingPasses}
                            placeholder="1, 2"
                            autoComplete="off"
                            spellCheck={false}
                            aria-describedby={`${id}-ending-help`}
                            onChange={(event) =>
                                onChange({ ...value, endingPasses: event.target.value })
                            }
                        />
                        <span id={`${id}-ending-help`} className="form-controls-hint">
                            Start an ending for these passes. Leave blank for no ending start.
                        </span>
                    </div>
                </div>
                <label className="form-controls-toggle">
                    <input
                        type="checkbox"
                        checked={value.endingEnd}
                        onChange={(event) =>
                            onChange({ ...value, endingEnd: event.target.checked })
                        }
                    />
                    <span>End ending here</span>
                </label>
                <p id={`${id}-help`} className="form-controls-hint">
                    The repeat sign closes a first ending. Mark the end of the final ending
                    explicitly. Set every affected bar before updating the chart.
                </p>
            </fieldset>
        </details>
    );
}
