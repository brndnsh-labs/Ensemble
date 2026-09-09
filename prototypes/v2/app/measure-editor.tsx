'use client';

import { TIME_SIGNATURES } from '@engine/config';
import { validateSemanticScore } from '@engine/songbook/score-codec';
import { resolveScoreContext } from '@engine/songbook/score-context';
import { durationToSteps, scoreDuration, scoreMeter } from '@engine/songbook/score-duration';
import { parseChordBar, printChordBar } from '@engine/songbook/score-text';
import type { ScoreContext, ScoreMeasure, SemanticScore } from '@engine/songbook/score-types';
import { type Ref, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import './measure-editor.css';

export interface MeasureEditorHandle {
    /** Validate every pending bar. The parent must apply the result before drafts are cleared. */
    commit(): SemanticScore;
    /** Clear buffers only after successful adoption, or an explicit Revert. */
    reset(): void;
}

interface MeasureEditorProps {
    score: SemanticScore;
    selectedMeasureId: string;
    onSelect: (id: string) => void;
    onApply: (score: SemanticScore) => void;
    onPendingChange: (pending: boolean) => void;
    disabled?: boolean;
    ref?: Ref<MeasureEditorHandle>;
}

interface BarDraft {
    text: string;
    context: ScoreContext;
}

type EffectiveContext = ReturnType<typeof resolveScoreContext>;
interface BarEntry {
    measure: ScoreMeasure;
    label: string;
    inherited: EffectiveContext;
    effective: EffectiveContext;
}

function writtenContext(measure: ScoreMeasure): ScoreContext {
    const context: ScoreContext = {};
    if (measure.key !== undefined) {
        context.key = measure.key;
    }
    if (measure.isMinor !== undefined) {
        context.isMinor = measure.isMinor;
    }
    if (measure.meter !== undefined) {
        context.meter = measure.meter;
    }
    if (measure.grouping !== undefined) {
        context.grouping = measure.grouping;
    }
    return context;
}

function entriesFor(score: SemanticScore, drafts: Map<string, BarDraft>): BarEntry[] {
    return score.sections.flatMap((section) => {
        let inherited = resolveScoreContext(score, section);
        return section.measures.map((measure, index) => {
            const effective = resolveScoreContext(
                inherited,
                drafts.get(measure.id)?.context ?? measure,
            );
            const entry = {
                measure,
                label: `${section.label} · bar ${index + 1}`,
                inherited,
                effective,
            };
            inherited = effective;
            return entry;
        });
    });
}

function editableText(measure: ScoreMeasure, meter: string): string | null {
    if (measure.content.kind !== 'events') {
        return null;
    }
    try {
        const printed = printChordBar(measure.content.events, meter);
        const durations = measure.content.events.map((event) => event.duration.join('/'));
        // Most bars need no duration syntax. Unequal lengths remain visible and lossless.
        return new Set(durations).size === 1 ? printed.replace(/:[^\s]+/g, '') : printed;
    } catch {
        return null;
    }
}

function initialDraft(entry: BarEntry): BarDraft {
    return {
        text: editableText(entry.measure, entry.effective.meter) ?? '',
        context: writtenContext(entry.measure),
    };
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

/** Mount with key={document.id}; keep mounted (hidden is fine) while raw drafts exist. */
export function MeasureEditor({
    score,
    selectedMeasureId,
    onSelect,
    onApply,
    onPendingChange,
    disabled = false,
    ref,
}: MeasureEditorProps) {
    const [drafts, setDrafts] = useState(new Map<string, BarDraft>());
    const draftRef = useRef(drafts);
    const acceptedCandidate = useRef<string | null>(null);
    const [error, setError] = useState('');
    const id = useId();
    const entries = entriesFor(score, drafts);
    const selected = entries.find((entry) => entry.measure.id === selectedMeasureId) ?? entries[0];
    const originalEntries = entriesFor(score, new Map());
    const original = originalEntries.find((entry) => entry.measure.id === selected?.measure.id);
    const draft = selected
        ? (drafts.get(selected.measure.id) ?? initialDraft(original ?? selected))
        : null;
    const originalText = original ? editableText(original.measure, original.effective.meter) : null;
    const readOnly = originalText === null;
    const meter = selected?.effective.meter ?? score.meter;
    const counts = scoreMeter(meter).counts;
    const rows = draft && !readOnly ? lengthRows(draft.text, meter) : [];
    const parsed = draft && !readOnly ? parseChordBar(draft.text, meter) : null;
    const offGrid =
        parsed?.kind === 'ok' &&
        parsed.value.some((event) => durationToSteps(event.duration) === null);

    useEffect(() => {
        if (acceptedCandidate.current !== JSON.stringify(score)) {
            return;
        }
        acceptedCandidate.current = null;
        draftRef.current = new Map();
        setDrafts(draftRef.current);
        onPendingChange(false);
    }, [score, onPendingChange]);

    function updateDraft(next: BarDraft) {
        if (!selected || !original || disabled || readOnly) {
            return;
        }
        const pending = new Map(draftRef.current);
        if (JSON.stringify(next) === JSON.stringify(initialDraft(original))) {
            pending.delete(selected.measure.id);
        } else {
            pending.set(selected.measure.id, next);
        }
        acceptedCandidate.current = null;
        draftRef.current = pending;
        setDrafts(pending);
        setError('');
        // Notify synchronously so a same-turn Save/navigation sees unfinished work.
        onPendingChange(pending.size > 0);
    }

    function fail(message: string, measureId?: string): never {
        if (measureId) {
            onSelect(measureId);
        }
        setError(message);
        throw new Error(message);
    }

    function commit(): SemanticScore {
        const pending = draftRef.current;
        const resolved = new Map(
            entriesFor(score, pending).map((entry) => [entry.measure.id, entry]),
        );
        const candidate: SemanticScore = {
            ...score,
            sections: score.sections.map((section) => ({
                ...section,
                measures: section.measures.map((measure) => {
                    const buffer = pending.get(measure.id);
                    if (!buffer) {
                        return measure;
                    }
                    const entry = resolved.get(measure.id)!;
                    const parsedBar = parseChordBar(buffer.text, entry.effective.meter);
                    if (parsedBar.kind !== 'ok') {
                        return fail(
                            `${entry.label}: ${parsedBar.kind === 'invalid' ? parsedBar.issues[0].message : 'Cannot read this bar.'}`,
                            measure.id,
                        );
                    }
                    const next = { ...measure };
                    delete next.key;
                    delete next.isMinor;
                    delete next.meter;
                    delete next.grouping;
                    return {
                        ...next,
                        ...buffer.context,
                        content: { kind: 'events' as const, events: parsedBar.value },
                    };
                }),
            })),
        };
        const validated = validateSemanticScore(candidate);
        if (validated.kind !== 'ok') {
            const issue = validated.kind === 'invalid' ? validated.issues[0] : null;
            const location = issue?.path.match(/sections\[(\d+)\]\.measures\[(\d+)\]/);
            const section = location ? candidate.sections[Number(location[1])] : null;
            const measure = section?.measures[Number(location?.[2])];
            const label =
                section && location ? `${section.label} · bar ${Number(location[2]) + 1}: ` : '';
            return fail(
                `${label}${issue?.message ?? 'Cannot apply this chart.'} Check later bars after a meter change.`,
                measure?.id,
            );
        }
        acceptedCandidate.current = JSON.stringify(validated.value);
        setError('');
        return validated.value;
    }

    useImperativeHandle(ref, () => ({
        commit,
        reset() {
            acceptedCandidate.current = null;
            draftRef.current = new Map();
            setDrafts(draftRef.current);
            setError('');
            onPendingChange(false);
        },
    }));

    if (!selected || !draft) {
        return <p>No bars to edit.</p>;
    }
    const selectedIndex = entries.indexOf(selected);
    const lengthChoices = Array.from({ length: counts * 2 }, (_, index) => countText(index + 1, 2));
    const keys = [
        ...new Set(
            [
                'C',
                'Db',
                'D',
                'Eb',
                'E',
                'F',
                'F#',
                'G',
                'Ab',
                'A',
                'Bb',
                'B',
                draft.context.key,
            ].filter((key): key is string => Boolean(key)),
        ),
    ];
    const meters = [...new Set([...Object.keys(TIME_SIGNATURES), meter])];

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
                        <div className="measure-editor-settings-grid">
                            <label>
                                Key from this bar
                                <select
                                    aria-label="Key from this bar"
                                    value={draft.context.key ?? ''}
                                    disabled={disabled}
                                    onChange={(event) => {
                                        const context = { ...draft.context };
                                        if (event.target.value) {
                                            context.key = event.target.value;
                                        } else {
                                            delete context.key;
                                        }
                                        updateDraft({ ...draft, context });
                                    }}
                                >
                                    <option value="">Continue ({selected.inherited.key})</option>
                                    {keys.map((key) => (
                                        <option key={key}>{key}</option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                Mode from this bar
                                <select
                                    aria-label="Mode from this bar"
                                    value={
                                        draft.context.isMinor === undefined
                                            ? ''
                                            : draft.context.isMinor
                                              ? 'minor'
                                              : 'major'
                                    }
                                    disabled={disabled}
                                    onChange={(event) => {
                                        const context = { ...draft.context };
                                        if (event.target.value) {
                                            context.isMinor = event.target.value === 'minor';
                                        } else {
                                            delete context.isMinor;
                                        }
                                        updateDraft({ ...draft, context });
                                    }}
                                >
                                    <option value="">
                                        Continue ({selected.inherited.isMinor ? 'minor' : 'major'})
                                    </option>
                                    <option value="major">Major</option>
                                    <option value="minor">Minor</option>
                                </select>
                            </label>
                            <label>
                                Meter from this bar
                                <select
                                    aria-label="Meter from this bar"
                                    value={draft.context.meter ?? ''}
                                    disabled={disabled}
                                    onChange={(event) => {
                                        const context = { ...draft.context };
                                        if (event.target.value) {
                                            context.meter = event.target.value;
                                        } else {
                                            delete context.meter;
                                        }
                                        delete context.grouping;
                                        updateDraft({ ...draft, context });
                                    }}
                                >
                                    <option value="">Continue ({selected.inherited.meter})</option>
                                    {meters.map((value) => (
                                        <option key={value}>{value}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <p className="measure-editor-hint">
                            A meter change resets custom beat grouping. Every affected bar must
                            still fit its meter before you update the chart.
                        </p>
                    </details>
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
