import { Fragment } from 'preact';
import React, { memo } from 'preact/compat';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { TIME_SIGNATURES } from '../config.js';
import {
    buildLeadSheetRows,
    buildLeadSheetSections,
    getLeadSheetDensity,
} from '../lead-sheet-model.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { formatUnicodeSymbols } from '../utils.js';

/**
 * @typedef {Object} ChordCardProps
 * @property {any} chord
 * @property {boolean} isActive
 * @property {string} notation
 * @property {any[]} [leadSheetMelody]
 * @property {boolean} showSparkline
 */

/**
 * @param {ChordCardProps} props
 */
const ChordCardComponent = ({ chord, isActive, notation, leadSheetMelody, showSparkline }) => {
    const disp = chord.display ? chord.display[notation] : null;

    /** @type {import('preact/hooks').MutableRef<HTMLDivElement|null>} */
    const cardRef = useRef(null);

    useEffect(() => {
        if (!cardRef.current) {
            return;
        }

        const card = cardRef.current;
        const charCount = disp
            ? disp.root.length + disp.suffix.length + (disp.bass ? disp.bass.length + 1 : 0)
            : chord.absName?.length || 0;

        let scale = 1.0;
        if (charCount > 7) {
            scale *= 0.92;
        }
        if (charCount > 10) {
            scale *= 0.84;
        }
        if (charCount > 13) {
            scale *= 0.76;
        }

        if (scale < 1.0) {
            card.style.setProperty('--font-scale', scale.toFixed(2));
        } else {
            card.style.removeProperty('--font-scale');
        }
    }, [disp, chord.absName]);

    const handleClick = (/** @type {any} */ event) => {
        event.stopPropagation();
        if (/** @type {any} */ (window).previewChord) {
            /** @type {any} */ (window).previewChord(chord.globalIndex);
        }
    };

    const sparklineNotes = useMemo(() => {
        if (!showSparkline || !leadSheetMelody || leadSheetMelody.length === 0) {
            return [];
        }

        if (chord.start === undefined) {
            return [];
        }

        return leadSheetMelody.filter(
            (/** @type {any} */ note) =>
                note.globalStep >= chord.start && note.globalStep < chord.end,
        );
    }, [chord.end, chord.start, leadSheetMelody, showSparkline]);

    const classNames = [
        'chord-card',
        sparklineNotes.length > 0 ? 'chord-card--with-sparkline' : '',
        chord.isMinor ? 'minor' : '',
        chord.quality === 'aug' || chord.quality === 'augmaj7' ? 'aug' : '',
        isActive ? 'active' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className={classNames} ref={cardRef} onClick={handleClick}>
            {disp ? (
                <Fragment>
                    <span className="root">{formatUnicodeSymbols(disp.root)}</span>
                    <span className="suffix">{formatUnicodeSymbols(disp.suffix)}</span>
                    {disp.bass && (
                        <span className="bass-note">/{formatUnicodeSymbols(disp.bass)}</span>
                    )}
                </Fragment>
            ) : (
                formatUnicodeSymbols(chord.absName) || '...'
            )}

            {sparklineNotes.length > 0 && (
                <div className="sparkline-container">
                    {sparklineNotes.map((/** @type {any} */ note, /** @type {any} */ index) => {
                        const height = Math.min(100, Math.max(15, ((note.midi - 48) / 36) * 100));
                        return (
                            <div
                                key={index}
                                className="sparkline-bar"
                                style={`height: ${height}%`}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const ChordCard = memo(ChordCardComponent);

/**
 * @param {string} sectionId
 */
function openSectionEditor(sectionId) {
    const detail = { detail: { sectionId } };
    document.dispatchEvent(new CustomEvent('open-editor', detail));
}

export function ChordVisualizer() {
    const {
        progression,
        timeSignature,
        lastActiveChordIndex,
        sectionsState,
        notation,
        leadSheetMelody,
        soloistStyle,
        isMaximized,
    } = useEnsembleState((/** @type {import('../types.js').EnsembleState} */ state) => ({
        progression: state.arranger.progression,
        timeSignature: state.arranger.timeSignature,
        lastActiveChordIndex: state.chords.lastActiveChordIndex,
        sectionsState: state.arranger.sections,
        notation: state.arranger.notation || 'roman',
        leadSheetMelody: state.soloist.leadSheetMelody,
        soloistStyle: state.soloist.style || 'smart',
        isMaximized: state.vizState.isMaximized,
    }));

    /** @type {import('preact/hooks').MutableRef<HTMLDivElement|null>} */
    const containerRef = useRef(null);
    const timeSignatureConfig =
        /** @type {any} */ (TIME_SIGNATURES)[timeSignature] || TIME_SIGNATURES['4/4'];

    const sectionBlocks = useMemo(
        () => buildLeadSheetSections(progression, sectionsState, timeSignatureConfig),
        [progression, sectionsState, timeSignatureConfig],
    );

    const leadSheetRows = useMemo(() => buildLeadSheetRows(sectionBlocks), [sectionBlocks]);

    const totalMeasures = useMemo(
        () => leadSheetRows.reduce((total, row) => total + row.measures.length, 0),
        [leadSheetRows],
    );

    const density = getLeadSheetDensity(totalMeasures);
    const showSparkline = isMaximized && soloistStyle === 'lead_sheet' && totalMeasures <= 16;

    useEffect(() => {
        const container = containerRef.current;
        if (!container || isMaximized) {
            return;
        }

        const activeCard = container.querySelector('.chord-card.active');
        if (!activeCard) {
            return;
        }

        const containerRect = container.getBoundingClientRect();
        const cardRect = activeCard.getBoundingClientRect();
        const isFullyVisible =
            cardRect.top >= containerRect.top + 12 && cardRect.bottom <= containerRect.bottom - 12;

        if (!isFullyVisible) {
            activeCard.scrollIntoView({
                block: 'center',
                inline: 'nearest',
                behavior: 'smooth',
            });
        }
    }, [isMaximized, lastActiveChordIndex]);

    return (
        <div
            className={`display-area lead-sheet lead-sheet--${density}`}
            id="chordVisualizer"
            ref={containerRef}
            data-total-measures={totalMeasures}
            data-density={density}
        >
            {isMaximized && (
                <button
                    type="button"
                    className="chord-maximize-exit-btn"
                    aria-label="Exit maximize"
                    onClick={() => dispatch(ACTIONS.TOGGLE_MAXIMIZED_CHORDS, false)}
                >
                    ✕
                </button>
            )}
            {leadSheetRows.map((/** @type {any} */ row) => {
                const isActiveRow = row.measures.some((/** @type {any} */ measure) =>
                    measure.chords.some(
                        (/** @type {any} */ chord) => chord.globalIndex === lastActiveChordIndex,
                    ),
                );

                return (
                    <div
                        key={row.id}
                        className={`lead-sheet-row${row.isSectionStart ? ' lead-sheet-row--section-start' : ''}${
                            isActiveRow ? ' lead-sheet-row--active' : ''
                        }`}
                        data-section-id={row.sectionId}
                    >
                        {row.measures.map(
                            (/** @type {any} */ measure, /** @type {any} */ measureIndex) => {
                                const isActiveMeasure = measure.chords.some(
                                    (/** @type {any} */ chord) =>
                                        chord.globalIndex === lastActiveChordIndex,
                                );

                                return (
                                    <div
                                        key={`${row.id}-${measureIndex}`}
                                        className={`measure-box${
                                            measure.isSectionStart
                                                ? ' measure-box--section-start'
                                                : ''
                                        }${isActiveMeasure ? ' measure-box--active' : ''}`}
                                        data-section-id={measure.sectionId}
                                        onClick={() => openSectionEditor(measure.sectionId)}
                                    >
                                        {measure.isSectionStart && (
                                            <button
                                                type="button"
                                                className="lead-sheet-marker"
                                                aria-label={`Open section ${measure.sectionLabel} in editor`}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    openSectionEditor(measure.sectionId);
                                                }}
                                            >
                                                {formatUnicodeSymbols(measure.sectionLabel)}
                                            </button>
                                        )}
                                        {measure.chords.map((/** @type {any} */ chord) => (
                                            <ChordCard
                                                key={chord.globalIndex}
                                                chord={chord}
                                                isActive={
                                                    chord.globalIndex === lastActiveChordIndex
                                                }
                                                notation={notation}
                                                leadSheetMelody={leadSheetMelody}
                                                showSparkline={showSparkline}
                                            />
                                        ))}
                                    </div>
                                );
                            },
                        )}
                    </div>
                );
            })}
        </div>
    );
}
