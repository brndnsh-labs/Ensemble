'use client';

import { durationToSteps, scoreDuration, scoreMeter } from '@engine/songbook/score-duration';
import { parseChordBar } from '@engine/songbook/score-text';
import type { SemanticScore } from '@engine/songbook/score-types';
import { type Ref, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { BarContextFields } from './bar-context-fields';
import { FormControls } from './form-controls';
import { GuidedForm } from './guided-form';
import './measure-editor.css';
import {
    type BarDraft,
    BarDraftError,
    type BarDrafts,
    barField,
    commitBarDrafts,
    draftChange,
    entriesFor,
} from './use-bar-drafts';

export interface MeasureEditorHandle {
    /** Validate every pending bar. The parent must apply the result before drafts are cleared. */
    commit(): SemanticScore;
    /** Clear buffers only after successful adoption, or an explicit Revert. */
    reset(): void;
}

interface MeasureEditorProps {
    score: SemanticScore;
    /** The pending bars, owned by the shell and shared with the chart's in-bar field (#1723). */
    barDrafts: BarDrafts;
    selectedMeasureId: string;
    onSelect: (id: string) => void;
    onApply: (score: SemanticScore) => void;
    onApplyForm: (score: SemanticScore) => void;
    disabled?: boolean;
    ref?: Ref<MeasureEditorHandle>;
}

function countText(numerator: number, denominator: number): string {
    const [n, d] = scoreDuration(numerator, denominator);
    return d === 1 ? String(n) : `${n}/${d}`;
}

/** Keep controls available while an intermediate length edit does not yet fill the bar. */
function lengthRows(text: string, meter: string): { symbol: string; counts: string }[] {
    const tokens = text.trim().split(/\s+/);
    if (!text.trim() || tokens.length > 64) {
        return [];
    }
    const explicit = tokens.some((token) => token.includes(':'));
    const rows = tokens.map((token) => {
        const parts = token.split(':');
        if (parts.length !== (explicit ? 2 : 1)) {
            return null;
        }
        if (parseChordBar(parts[0], meter).kind !== 'ok') {
            return null;
        }
        const counts = explicit ? parts[1] : countText(scoreMeter(meter).counts, tokens.length);
        if (!/^\d+(?:\.\d+|\/\d+)?$/.test(counts)) {
            return null;
        }
        return { symbol: parts[0], counts };
    });
    return rows.every((row) => row !== null) ? rows : [];
}

/** Mount with key={document.id}. The pending bars live in the shell's `barDrafts` (#1723), so
 * this panel and the chart's in-bar field edit one draft per bar. */
export function MeasureEditor({
    score,
    barDrafts,
    selectedMeasureId,
    onSelect,
    onApply,
    onApplyForm,
    disabled = false,
    ref,
}: MeasureEditorProps) {
    const drafts = barDrafts.drafts;
    const acceptedCandidate = useRef<string | null>(null);
    const [error, setError] = useState('');
    const [formScore, setFormScore] = useState<SemanticScore | null>(null);
    const id = useId();
    const entries = entriesFor(score, drafts);
    const selected = entries.find((entry) => entry.measure.id === selectedMeasureId) ?? entries[0];
    const field = selected ? barField(score, drafts, selected.measure.id) : null;
    const original = field?.original;
    const draft = field?.draft ?? null;
    const readOnly = field?.text === null;
    const meter = selected?.effective.meter ?? score.meter;
    const counts = scoreMeter(meter).counts;
    const rows = draft && !readOnly ? lengthRows(draft.text, meter) : [];
    const parsed = draft && !readOnly ? parseChordBar(draft.text, meter) : null;
    const offGrid =
        parsed?.kind === 'ok' &&
        parsed.value.some((event) => durationToSteps(event.duration) === null);
    const { retire } = barDrafts;

    useEffect(() => {
        if (acceptedCandidate.current !== JSON.stringify(score)) {
            return;
        }
        acceptedCandidate.current = null;
        retire();
    }, [score, retire]);

    function updateDraft(next: BarDraft) {
        if (!selected || !original || disabled || readOnly) {
            return;
        }
        acceptedCandidate.current = null;
        // The store notifies the shell synchronously, so a same-turn Save sees unfinished work.
        barDrafts.put(selected.measure.id, draftChange(original, next));
        setError('');
    }

    function commit(): SemanticScore {
        try {
            const validated = commitBarDrafts(score, barDrafts.latest());
            acceptedCandidate.current = JSON.stringify(validated);
            setError('');
            return validated;
        } catch (reason) {
            if (reason instanceof BarDraftError && reason.measureId) {
                onSelect(reason.measureId);
            }
            setError(reason instanceof Error ? reason.message : String(reason));
            throw reason;
        }
    }

    useImperativeHandle(ref, () => ({
        commit,
        reset() {
            setFormScore(null);
            acceptedCandidate.current = null;
            barDrafts.retire();
            setError('');
        },
    }));

    if (!selected || !draft) {
        return <p>No bars to edit.</p>;
    }
    const selectedIndex = entries.indexOf(selected);
    const lengthChoices = Array.from({ length: counts * 2 }, (_, index) => countText(index + 1, 2));
    return (
        <div className="measure-editor">
            <div className="measure-editor-navigation">
                <button
                    type="button"
                    className="btn"
                    aria-label="Previous bar"
                    disabled={disabled || selectedIndex === 0}
                    onClick={() => onSelect(entries[selectedIndex - 1].measure.id)}
                >
                    ←
                </button>
                <label>
                    <span className="sr">Bar to edit</span>
                    <select
                        aria-label="Bar to edit"
                        value={selected.measure.id}
                        disabled={disabled}
                        onChange={(event) => onSelect(event.target.value)}
                    >
                        {entries.map((entry) => (
                            <option key={entry.measure.id} value={entry.measure.id}>
                                {entry.label}
                                {drafts.has(entry.measure.id) ? ' · edited' : ''}
                            </option>
                        ))}
                    </select>
                </label>
                <button
                    type="button"
                    className="btn"
                    aria-label="Next bar"
                    disabled={disabled || selectedIndex === entries.length - 1}
                    onClick={() => onSelect(entries[selectedIndex + 1].measure.id)}
                >
                    →
                </button>
            </div>
            <p className="measure-editor-context">
                {selected.effective.key} {selected.effective.isMinor ? 'minor' : 'major'} · {meter}
            </p>
            <button
                type="button"
                className="btn"
                disabled={disabled}
                onClick={() => {
                    try {
                        const candidate = commit();
                        // Reviewing a form does not adopt or retire the pending chord buffers.
                        acceptedCandidate.current = null;
                        setFormScore(candidate);
                    } catch {
                        // commit reports the exact pending bar that needs correction.
                    }
                }}
            >
                Repeats and endings
            </button>
            {formScore && (
                <GuidedForm
                    score={formScore}
                    selectedMeasureId={selected.measure.id}
                    onClose={() => setFormScore(null)}
                    onApply={onApplyForm}
                />
            )}
            {readOnly ? (
                <p className="measure-editor-notice">
                    This bar contains a measure repeat or fermata that this quick editor cannot
                    change yet. Its notation is preserved; you can still edit other bars.
                </p>
            ) : (
                <>
                    <label className="panel-label" htmlFor={`${id}-chords`}>
                        Chords in this bar
                    </label>
                    <textarea
                        id={`${id}-chords`}
                        rows={2}
                        maxLength={4000}
                        value={draft.text}
                        disabled={disabled}
                        spellCheck={false}
                        autoCapitalize="off"
                        autoCorrect="off"
                        aria-describedby={`${id}-help`}
                        onChange={(event) => updateDraft({ ...draft, text: event.target.value })}
                    />
                    <p id={`${id}-help`} className="measure-editor-hint">
                        Type chords separated by spaces, like C Dm G7. They share the bar equally;
                        set different lengths below.
                    </p>
                    {/* The band holds a fermata's chord through a stretched span with the drums
                        crashing (docs/design/band-engine.md). */}
                    <label className="measure-editor-toggle">
                        <input
                            type="checkbox"
                            checked={draft.fermata}
                            disabled={disabled}
                            onChange={(event) =>
                                updateDraft({ ...draft, fermata: event.target.checked })
                            }
                        />
                        <span>Fermata (hold the last chord)</span>
                    </label>
                    {rows.length > 0 && (
                        <fieldset className="measure-editor-lengths" disabled={disabled}>
                            <legend>
                                Chord lengths · {counts} {meter.endsWith('/4') ? 'beats' : 'counts'}{' '}
                                per bar
                            </legend>
                            <div className="measure-editor-length-grid">
                                {rows.map((row, index) => (
                                    // biome-ignore lint/suspicious/noArrayIndexKey: these controlled length slots have positional meaning and no local state.
                                    <label key={`${selected.measure.id}-${index}`}>
                                        <span>{row.symbol}</span>
                                        <select
                                            aria-label={`Length of chord ${index + 1} (${row.symbol})`}
                                            value={row.counts}
                                            onChange={(event) =>
                                                updateDraft({
                                                    ...draft,
                                                    text: rows
                                                        .map(
                                                            (item, at) =>
                                                                `${item.symbol}:${at === index ? event.target.value : item.counts}`,
                                                        )
                                                        .join(' '),
                                                })
                                            }
                                        >
                                            {[...new Set([row.counts, ...lengthChoices])].map(
                                                (length) => (
                                                    <option key={length} value={length}>
                                                        {length}
                                                    </option>
                                                ),
                                            )}
                                        </select>
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                    )}
                    {parsed?.kind === 'invalid' && (
                        <p className="measure-editor-hint" aria-live="polite">
                            {parsed.issues[0].message}
                        </p>
                    )}
                    {offGrid && (
                        <p className="measure-editor-hint">
                            These equal lengths fall between playback steps. Choose lengths that fit
                            the beat, such as 2, 1, 1 in 4/4.
                        </p>
                    )}
                    <details className="measure-editor-settings">
                        <summary>Key or meter change</summary>
                        <p className="measure-editor-hint">
                            Changes start at this bar and continue through this section until
                            changed again. Chord names are not transposed.
                        </p>
                        <BarContextFields
                            className="measure-editor-settings-grid"
                            context={draft.context}
                            inherited={selected.inherited}
                            meter={meter}
                            disabled={disabled}
                            onChange={(context) => updateDraft({ ...draft, context })}
                        />
                        <p className="measure-editor-hint">
                            A meter change resets custom beat grouping. Every affected bar must
                            still fit its meter before you update the chart.
                        </p>
                    </details>
                    {draft.form ? (
                        <FormControls
                            value={draft.form}
                            onChange={(form) => updateDraft({ ...draft, form })}
                            disabled={disabled}
                        />
                    ) : (
                        <p className="measure-editor-hint">
                            This bar has repeat boundaries these compact controls cannot edit. Its
                            notation is preserved.
                        </p>
                    )}
                </>
            )}
            {error && (
                <p role="alert" className="measure-editor-error">
                    {error}
                </p>
            )}
            <div className="measure-editor-footer">
                <button
                    type="button"
                    className="btn primary"
                    disabled={disabled || drafts.size === 0}
                    onClick={() => {
                        try {
                            onApply(commit());
                        } catch (reason) {
                            setError(
                                reason instanceof Error
                                    ? reason.message
                                    : 'Could not update the chart. Your typing is still here.',
                            );
                        }
                    }}
                >
                    Update chart
                </button>
                <span className="measure-editor-hint">
                    {drafts.size
                        ? `${drafts.size} edited ${drafts.size === 1 ? 'bar' : 'bars'} · Save also applies these edits`
                        : 'Saved song changes only when you Save.'}
                </span>
            </div>
        </div>
    );
}
