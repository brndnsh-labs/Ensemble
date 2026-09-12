'use client';

import { prepareScorePlayback } from '@engine/songbook/score-playback';
import type { SemanticScore } from '@engine/songbook/score-types';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
    type BarRange,
    changeGuidedForm,
    type GuidedGroup,
    groupEnd,
    guidedGroups,
    guidedRoute,
} from '../lib/guided-form';
import './guided-form.css';

type RangeName = 'body' | 'first' | 'second';
const RANGE_LABELS = { body: 'Repeated body', first: 'First ending', second: 'Second ending' };

export function GuidedForm({
    score,
    selectedMeasureId,
    onApply,
    onClose,
}: {
    score: SemanticScore;
    selectedMeasureId: string;
    onApply: (candidate: SemanticScore) => void;
    onClose: () => void;
}) {
    const initialSection =
        score.sections.find((section) =>
            section.measures.some((bar) => bar.id === selectedMeasureId),
        ) ?? score.sections[0];
    const [sectionId, setSectionId] = useState(initialSection.id);
    const section = score.sections.find((entry) => entry.id === sectionId)!;
    const groups = useMemo(() => guidedGroups(section), [section]);
    const initialBar = Math.max(
        0,
        initialSection.measures.findIndex((bar) => bar.id === selectedMeasureId),
    );
    const [group, setGroup] = useState<GuidedGroup>({
        body: { start: initialBar, end: initialBar },
        times: 2,
    });
    const [previous, setPrevious] = useState<GuidedGroup>();
    const [active, setActive] = useState<RangeName>('body');
    const [anchor, setAnchor] = useState<number | null>(null);
    const [remove, setRemove] = useState(false);
    const [error, setError] = useState('');
    const dialog = useRef<HTMLDialogElement>(null);
    const id = useId();

    useEffect(() => {
        const element = dialog.current!;
        element.showModal();
        return () => element.close();
    }, []);

    const preview = useMemo(() => {
        try {
            const candidate = changeGuidedForm(score, sectionId, remove ? null : group, previous);
            // The route alone cannot establish supported chord/timing/reference playback.
            prepareScorePlayback(candidate);
            return { candidate, route: guidedRoute(candidate), error: '' };
        } catch (reason) {
            return {
                candidate: null,
                route: '',
                error: reason instanceof Error ? reason.message : 'Check the selected bars.',
            };
        }
    }, [score, sectionId, group, previous, remove]);

    function updateRange(name: RangeName, range: BarRange) {
        setGroup({ ...group, [name]: range });
        setRemove(false);
        setError('');
    }
    function chooseBar(index: number) {
        if (anchor === null) {
            updateRange(active, { start: index, end: index });
            setAnchor(index);
        } else {
            updateRange(active, { start: Math.min(anchor, index), end: Math.max(anchor, index) });
            setAnchor(null);
        }
    }
    function edit(existing?: GuidedGroup) {
        setPrevious(existing);
        setGroup(existing ?? { body: { start: 0, end: 0 }, times: 2 });
        setActive('body');
        setAnchor(null);
        setRemove(false);
        setError('');
    }
    function endings() {
        const start = Math.min(group.body.start, section.measures.length - 3);
        const end = Math.min(Math.max(start, group.body.end), section.measures.length - 3);
        setGroup({
            body: { start, end },
            times: 2,
            first: { start: end + 1, end: end + 1 },
            second: { start: end + 2, end: end + 2 },
        });
        setActive('body');
        setAnchor(null);
        setRemove(false);
    }
    const activeRange = group[active] ?? group.body;

    return (
        <dialog
            ref={dialog}
            className="guided-form"
            aria-labelledby={`${id}-title`}
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
        >
            <h2 id={`${id}-title`}>Repeats and endings</h2>
            <p>
                Choose existing bars, check how they play, then Apply. Save keeps the result in your
                songbook.
            </p>
            <label className="guided-field">
                Section
                <select
                    value={sectionId}
                    onChange={(event) => {
                        setSectionId(event.target.value);
                        edit();
                    }}
                >
                    {score.sections.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                            {entry.label}
                        </option>
                    ))}
                </select>
            </label>
            {groups?.length ? (
                <div className="guided-groups" aria-label="Existing repeat groups">
                    {groups.map((existing) => (
                        <button
                            type="button"
                            className="btn"
                            key={existing.body.start}
                            onClick={() => edit(existing)}
                        >
                            Edit {existing.first ? 'endings' : 'repeat'} · bars{' '}
                            {existing.body.start + 1}–{groupEnd(existing) + 1}
                        </button>
                    ))}
                    <button type="button" className="btn" onClick={() => edit()}>
                        New repeat group
                    </button>
                </div>
            ) : null}
            {!groups ? (
                <p role="alert">
                    This section has a nested or nonstandard form. Its notation is preserved. Close
                    this guide and use Advanced for per-bar controls.
                </p>
            ) : (
                <>
                    <div className="guided-actions">
                        <button
                            type="button"
                            className="btn"
                            aria-pressed={!group.first}
                            onClick={() => {
                                setGroup({ body: group.body, times: group.times });
                                setActive('body');
                                setAnchor(null);
                                setRemove(false);
                            }}
                        >
                            Repeat these bars
                        </button>
                        <button
                            type="button"
                            className="btn"
                            aria-pressed={!!group.first}
                            disabled={section.measures.length < 3}
                            onClick={endings}
                        >
                            Add first and second endings
                        </button>
                    </div>
                    {section.measures.length < 3 && (
                        <p>
                            First and second endings need at least three existing bars: a body and
                            two endings.
                        </p>
                    )}
                    <label className="guided-field">
                        Play times total
                        <input
                            type="number"
                            min="1"
                            max="64"
                            step="1"
                            value={Number.isNaN(group.times) ? '' : group.times}
                            disabled={!!group.first}
                            onChange={(event) => {
                                setGroup({ ...group, times: event.target.valueAsNumber });
                                setRemove(false);
                            }}
                        />
                        <span>
                            {group.first
                                ? 'First ending on pass 1; second ending on pass 2.'
                                : '2 means play twice, including the first time.'}
                        </span>
                    </label>
                    <div className="guided-ranges">
                        {(['body', 'first', 'second'] as const).map((name) => {
                            const range = group[name];
                            if (!range) {
                                return null;
                            }
                            return (
                                <fieldset key={name}>
                                    <legend>{RANGE_LABELS[name]}</legend>
                                    <button
                                        type="button"
                                        className="btn"
                                        aria-pressed={active === name}
                                        onClick={() => {
                                            setActive(name);
                                            setAnchor(null);
                                        }}
                                    >
                                        Select {RANGE_LABELS[name].toLowerCase()} bars
                                    </button>
                                    <div className="guided-range-fields">
                                        {(['start', 'end'] as const).map((edge) => (
                                            <label key={edge}>
                                                {edge === 'start' ? 'From bar' : 'Through bar'}
                                                <select
                                                    aria-label={`${RANGE_LABELS[name]} ${edge} bar`}
                                                    value={range[edge]}
                                                    onChange={(event) => {
                                                        updateRange(name, {
                                                            ...range,
                                                            [edge]: Number(event.target.value),
                                                        });
                                                        setAnchor(null);
                                                    }}
                                                >
                                                    {section.measures.map((bar, index) => (
                                                        <option key={bar.id} value={index}>
                                                            {index + 1}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                            );
                        })}
                    </div>
                    <p id={`${id}-selection`} aria-live="polite">
                        Selecting {RANGE_LABELS[active].toLowerCase()}: bars {activeRange.start + 1}
                        –{activeRange.end + 1}.{' '}
                        {anchor === null
                            ? 'Choose a first bar, then a last bar.'
                            : `First bar ${anchor + 1} chosen. Choose the last bar.`}{' '}
                        Tap or use Tab and Enter. The From/Through fields also work with the
                        keyboard.
                    </p>
                    <div
                        className="guided-bars"
                        role="group"
                        aria-label="Choose bar range"
                        aria-describedby={`${id}-selection`}
                    >
                        {section.measures.map((bar, index) => (
                            <button
                                type="button"
                                className="guided-bar"
                                key={bar.id}
                                aria-label={`Select bar ${index + 1}`}
                                aria-pressed={
                                    index >= activeRange.start && index <= activeRange.end
                                }
                                onClick={() => chooseBar(index)}
                            >
                                <span>Bar {index + 1}</span>
                                <strong>
                                    {bar.content.kind === 'events'
                                        ? bar.content.events
                                              .map((event) =>
                                                  event.kind === 'chord'
                                                      ? event.symbol
                                                      : event.kind,
                                              )
                                              .join(' ')
                                        : 'Measure repeat'}
                                </strong>
                            </button>
                        ))}
                    </div>
                    <section
                        className="guided-preview"
                        aria-label="Form preview"
                        aria-live="polite"
                    >
                        <h3>{remove ? 'After removing this group' : 'Written brackets'}</h3>
                        {remove ? (
                            <p>
                                Remove only this group’s repeat and ending markers. All chords and
                                bars stay.
                            </p>
                        ) : (
                            <div className="guided-brackets">
                                <span>
                                    𝄆 Bars {group.body.start + 1}–
                                    {group.first ? group.first.end + 1 : group.body.end + 1} 𝄇 ·{' '}
                                    {group.times || '?'} total plays
                                </span>
                                {group.first && group.second && (
                                    <>
                                        <span className="guided-ending">
                                            1. Bars {group.first.start + 1}–{group.first.end + 1}
                                        </span>
                                        <span className="guided-ending">
                                            2. Bars {group.second.start + 1}–{group.second.end + 1}
                                        </span>
                                    </>
                                )}
                            </div>
                        )}
                        {preview.error ? (
                            <p role="alert">{preview.error}</p>
                        ) : (
                            <>
                                <h3>Playback route · whole chart</h3>
                                <p className="guided-route" data-testid="guided-playback-route">
                                    {preview.route}
                                </p>
                            </>
                        )}
                    </section>
                </>
            )}
            {error && <p role="alert">{error}</p>}
            <div className="dialog-actions">
                <button type="button" className="btn" onClick={onClose}>
                    Cancel
                </button>
                {previous && (
                    <button
                        type="button"
                        className="btn"
                        onClick={() => {
                            setRemove(true);
                            setError('');
                        }}
                    >
                        Remove form markers
                    </button>
                )}
                <button
                    type="button"
                    className="btn primary"
                    disabled={!groups || !preview.candidate}
                    onClick={() => {
                        if (!preview.candidate) {
                            return;
                        }
                        try {
                            onApply(preview.candidate);
                            onClose();
                        } catch (reason) {
                            setError(
                                reason instanceof Error
                                    ? reason.message
                                    : 'Could not apply. Your chart and typing are still here.',
                            );
                        }
                    }}
                >
                    Apply
                </button>
            </div>
        </dialog>
    );
}
