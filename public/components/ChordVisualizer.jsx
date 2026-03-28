import React, { memo } from 'preact/compat';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { TIME_SIGNATURES } from '../config.js';
import {
    buildLeadSheetRows,
    buildLeadSheetSections,
    getLeadSheetLayoutProfile,
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
                <span className="chord-symbol">
                    <span className="root">{formatUnicodeSymbols(disp.root)}</span>
                    <span className="suffix">{formatUnicodeSymbols(disp.suffix)}</span>
                    {disp.bass && (
                        <span className="bass-note">/{formatUnicodeSymbols(disp.bass)}</span>
                    )}
                </span>
            ) : (
                <span className="chord-symbol">{formatUnicodeSymbols(chord.absName) || '...'}</span>
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
 * @returns {{ width: number, height: number }}
 */
function getViewportSize() {
    if (typeof window === 'undefined') {
        return { width: 1280, height: 800 };
    }

    return {
        width: window.innerWidth || 1280,
        height: window.innerHeight || 800,
    };
}

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
    const [viewportSize, setViewportSize] = useState(getViewportSize);
    const timeSignatureConfig =
        /** @type {any} */ (TIME_SIGNATURES)[timeSignature] || TIME_SIGNATURES['4/4'];

    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const handleResize = () => {
            setViewportSize((current) => {
                const next = getViewportSize();
                if (current.width === next.width && current.height === next.height) {
                    return current;
                }

                return next;
            });
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const sectionBlocks = useMemo(
        () => buildLeadSheetSections(progression, sectionsState, timeSignatureConfig),
        [progression, sectionsState, timeSignatureConfig],
    );

    const leadSheetRows = useMemo(() => buildLeadSheetRows(sectionBlocks), [sectionBlocks]);
    const rowIndexById = useMemo(
        () =>
            new Map(
                leadSheetRows.map((/** @type {any} */ row, index) => {
                    return [row.id, index];
                }),
            ),
        [leadSheetRows],
    );

    const totalMeasures = useMemo(
        () => leadSheetRows.reduce((total, row) => total + row.measures.length, 0),
        [leadSheetRows],
    );
    const activeRowIndex = leadSheetRows.findIndex((/** @type {any} */ row) =>
        row.measures.some((/** @type {any} */ measure) =>
            measure.chords.some(
                (/** @type {any} */ chord) => chord.globalIndex === lastActiveChordIndex,
            ),
        ),
    );
    const activeSectionId =
        leadSheetRows.find((/** @type {any} */ row) =>
            row.measures.some((/** @type {any} */ measure) =>
                measure.chords.some(
                    (/** @type {any} */ chord) => chord.globalIndex === lastActiveChordIndex,
                ),
            ),
        )?.sectionId ?? null;
    const leadSheetSectionGroups = useMemo(() => {
        /** @type {any[]} */
        const groups = [];

        leadSheetRows.forEach((row) => {
            const lastGroup = groups[groups.length - 1];
            if (lastGroup && lastGroup.sectionId === row.sectionId) {
                lastGroup.rows.push(row);
                return;
            }

            groups.push({
                id: `${row.sectionId}-section-${groups.length}`,
                sectionId: row.sectionId,
                rows: [row],
            });
        });

        return groups;
    }, [leadSheetRows]);

    const layoutProfile = useMemo(
        () =>
            getLeadSheetLayoutProfile({
                totalMeasures,
                rowCount: leadSheetRows.length,
                viewportWidth: viewportSize.width,
                viewportHeight: viewportSize.height,
                isMaximized,
            }),
        [isMaximized, leadSheetRows.length, totalMeasures, viewportSize.height, viewportSize.width],
    );
    const density = layoutProfile.density;
    const showSparkline = isMaximized && soloistStyle === 'lead_sheet' && totalMeasures <= 16;
    const containerStyle = {
        '--lead-content-distribution': layoutProfile.contentDistribution,
        '--lead-vertical-fill': layoutProfile.verticalFillScale.toFixed(2),
        '--lead-vertical-gap-fill': layoutProfile.verticalGapScale.toFixed(2),
        '--lead-vertical-type-fill': layoutProfile.verticalTypeScale.toFixed(2),
    };

    useEffect(() => {
        const container = containerRef.current;
        if (!container || activeRowIndex < 0) {
            return;
        }

        const rows = Array.from(container.querySelectorAll('.lead-sheet-row'));
        const activeRow = rows[activeRowIndex];
        if (!activeRow) {
            return;
        }

        const lookaheadIndex = Math.min(
            rows.length - 1,
            activeRowIndex + layoutProfile.lookaheadRows,
        );
        const lookaheadRow = rows[lookaheadIndex] || activeRow;
        const containerRect = container.getBoundingClientRect();
        const scrollPadding = layoutProfile.scrollMode === 'guided' ? 18 : 12;
        const getOffsetTop = (/** @type {Element} */ element) =>
            element.getBoundingClientRect().top - containerRect.top + container.scrollTop;
        const activeTop = getOffsetTop(activeRow);
        const lookaheadBottom = getOffsetTop(lookaheadRow) + lookaheadRow.clientHeight;
        const visibleTop = container.scrollTop + scrollPadding;
        const visibleBottom = container.scrollTop + container.clientHeight - scrollPadding;
        const shouldRevealAbove = activeTop < visibleTop;
        const shouldRevealAhead = lookaheadBottom > visibleBottom;

        if ((shouldRevealAbove || shouldRevealAhead) && typeof container.scrollTo === 'function') {
            const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
            const nextScrollTop = shouldRevealAbove
                ? Math.max(0, activeTop - scrollPadding)
                : Math.min(maxScrollTop, lookaheadBottom - container.clientHeight + scrollPadding);

            container.scrollTo({
                top: nextScrollTop,
                behavior: 'smooth',
            });
        }
    }, [
        activeRowIndex,
        lastActiveChordIndex,
        layoutProfile.lookaheadRows,
        layoutProfile.scrollMode,
    ]);

    return (
        <div
            className={`display-area lead-sheet lead-sheet--${density} lead-sheet--viewport-${layoutProfile.viewport} lead-sheet--scroll-${layoutProfile.scrollMode}`}
            id="chordVisualizer"
            ref={containerRef}
            style={containerStyle}
            data-measures-per-row={layoutProfile.measuresPerRow}
            data-row-count={leadSheetRows.length}
            data-scroll-mode={layoutProfile.scrollMode}
            data-total-measures={totalMeasures}
            data-density={density}
            data-viewport={layoutProfile.viewport}
            data-vertical-fill={layoutProfile.verticalFillMode}
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
            {leadSheetSectionGroups.map((/** @type {any} */ sectionGroup) => {
                const isActiveSection = activeSectionId === sectionGroup.sectionId;

                return (
                    <div
                        key={sectionGroup.id}
                        className={`lead-sheet-section-group${
                            isActiveSection ? ' lead-sheet-section-group--active' : ''
                        }`}
                        data-section-id={sectionGroup.sectionId}
                    >
                        {sectionGroup.rows.map((/** @type {any} */ row) => {
                            const rowIndex = rowIndexById.get(row.id) ?? -1;
                            const isActiveRow = row.measures.some((/** @type {any} */ measure) =>
                                measure.chords.some(
                                    (/** @type {any} */ chord) =>
                                        chord.globalIndex === lastActiveChordIndex,
                                ),
                            );
                            const hasSectionMarkers = row.measures.some(
                                (/** @type {any} */ measure) => measure.isSectionStart,
                            );
                            const isUpcomingRow =
                                activeRowIndex >= 0 &&
                                rowIndex > activeRowIndex &&
                                rowIndex <= activeRowIndex + layoutProfile.lookaheadRows;

                            return (
                                <div
                                    key={row.id}
                                    className={`lead-sheet-row${
                                        row.isSectionStart ? ' lead-sheet-row--section-start' : ''
                                    }${isActiveRow ? ' lead-sheet-row--active' : ''}${
                                        isUpcomingRow ? ' lead-sheet-row--upcoming' : ''
                                    }${hasSectionMarkers ? ' lead-sheet-row--with-markers' : ''}`}
                                    data-row-index={rowIndex}
                                    data-section-id={row.sectionId}
                                >
                                    {row.measures.map(
                                        (
                                            /** @type {any} */ measure,
                                            /** @type {any} */ measureIndex,
                                        ) =>
                                            measure.isSectionStart ? (
                                                <div
                                                    key={`${row.id}-marker-${measureIndex}`}
                                                    className={`lead-sheet-marker-slot${
                                                        activeSectionId &&
                                                        measure.sectionId === activeSectionId
                                                            ? ' lead-sheet-marker-slot--section-active'
                                                            : ''
                                                    }${
                                                        isActiveRow &&
                                                        activeSectionId &&
                                                        measure.sectionId === activeSectionId
                                                            ? ' lead-sheet-marker-slot--row-active'
                                                            : ''
                                                    }`}
                                                    style={{
                                                        gridColumn: `${measureIndex + 1}`,
                                                        gridRow: '1',
                                                    }}
                                                    aria-hidden="true"
                                                >
                                                    <span className="lead-sheet-row-marker">
                                                        {formatUnicodeSymbols(measure.sectionLabel)}
                                                    </span>
                                                </div>
                                            ) : null,
                                    )}
                                    {row.measures.map(
                                        (
                                            /** @type {any} */ measure,
                                            /** @type {any} */ measureIndex,
                                        ) => {
                                            const isActiveMeasure = measure.chords.some(
                                                (/** @type {any} */ chord) =>
                                                    chord.globalIndex === lastActiveChordIndex,
                                            );

                                            return (
                                                <div
                                                    key={`${row.id}-${measureIndex}`}
                                                    className={`measure-box${
                                                        isActiveMeasure
                                                            ? ' measure-box--active'
                                                            : ''
                                                    }`}
                                                    data-section-id={measure.sectionId}
                                                    style={{
                                                        gridColumn: `${measureIndex + 1}`,
                                                        gridRow: hasSectionMarkers ? '2' : '1',
                                                    }}
                                                    onClick={() =>
                                                        openSectionEditor(measure.sectionId)
                                                    }
                                                >
                                                    {measure.chords.map(
                                                        (/** @type {any} */ chord) => (
                                                            <ChordCard
                                                                key={chord.globalIndex}
                                                                chord={chord}
                                                                isActive={
                                                                    chord.globalIndex ===
                                                                    lastActiveChordIndex
                                                                }
                                                                notation={notation}
                                                                leadSheetMelody={leadSheetMelody}
                                                                showSparkline={showSparkline}
                                                            />
                                                        ),
                                                    )}
                                                </div>
                                            );
                                        },
                                    )}
                                </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}
