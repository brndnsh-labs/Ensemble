import { memo } from 'preact/compat';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { TIME_SIGNATURES } from '../config.js';
import {
    buildLeadSheetRows,
    buildLeadSheetSections,
    getLeadSheetLayoutProfile,
} from '../lead-sheet-model.js';
import { useEnsembleState } from '../ui-bridge.js';
import { formatUnicodeSymbols } from '../utils.js';

interface ChordCardProps {
    chord: any;
    isActive: boolean;
    notation: string;
}

const ChordCardComponent = ({ chord, isActive, notation }: ChordCardProps) => {
    const disp = chord.display ? chord.display[notation] : null;

    const cardRef = useRef<HTMLDivElement | null>(null);

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

    const handleClick = (event: MouseEvent) => {
        event.stopPropagation();
        if ((window as any).previewChord) {
            (window as any).previewChord(chord.globalIndex);
        }
    };

    const classNames = [
        'chord-card',
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
        </div>
    );
};

const ChordCard = memo(ChordCardComponent);

function getViewportSize(): { width: number; height: number } {
    if (typeof window === 'undefined') {
        return { width: 1280, height: 800 };
    }

    return {
        width: window.innerWidth || 1280,
        height: window.innerHeight || 800,
    };
}

function openSectionEditor(sectionId: string) {
    const detail = { detail: { sectionId } };
    document.dispatchEvent(new CustomEvent('open-editor', detail));
}

export function ChordVisualizer() {
    const { progression, timeSignature, lastActiveChordIndex, sectionsState, notation } =
        useEnsembleState((state) => ({
            progression: state.arranger.progression,
            timeSignature: state.arranger.timeSignature,
            lastActiveChordIndex: state.chords.lastActiveChordIndex,
            sectionsState: state.arranger.sections,
            notation: state.arranger.notation || 'roman',
        }));

    const containerRef = useRef<HTMLDivElement | null>(null);
    const [viewportSize, setViewportSize] = useState(getViewportSize);
    const [containerSize, setContainerSize] = useState({ height: 0, width: 0 });
    const timeSignatureConfig = (TIME_SIGNATURES as any)[timeSignature] || TIME_SIGNATURES['4/4'];

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

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return undefined;
        }

        const updateContainerSize = () => {
            setContainerSize((current) => {
                const next = {
                    height: container.clientHeight || 0,
                    width: container.clientWidth || 0,
                };
                if (current.width === next.width && current.height === next.height) {
                    return current;
                }

                return next;
            });
        };

        updateContainerSize();

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateContainerSize);
            return () => window.removeEventListener('resize', updateContainerSize);
        }

        const observer = new ResizeObserver(updateContainerSize);
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    const sectionBlocks = useMemo(
        () => buildLeadSheetSections(progression, sectionsState, timeSignatureConfig),
        [progression, sectionsState, timeSignatureConfig],
    );

    const leadSheetRows = useMemo(() => buildLeadSheetRows(sectionBlocks), [sectionBlocks]);
    const rowIndexById = useMemo(
        () =>
            new Map(
                leadSheetRows.map((row: any, index: number) => {
                    return [row.id, index];
                }),
            ),
        [leadSheetRows],
    );

    const totalMeasures = useMemo(
        () => leadSheetRows.reduce((total: number, row: any) => total + row.measures.length, 0),
        [leadSheetRows],
    );
    const activeRowIndex = leadSheetRows.findIndex((row: any) =>
        row.measures.some((measure: any) =>
            measure.chords.some((chord: any) => chord.globalIndex === lastActiveChordIndex),
        ),
    );
    const activeSectionId =
        leadSheetRows.find((row: any) =>
            row.measures.some((measure: any) =>
                measure.chords.some((chord: any) => chord.globalIndex === lastActiveChordIndex),
            ),
        )?.sectionId ?? null;
    const leadSheetSectionGroups = useMemo(() => {
        const groups: any[] = [];

        leadSheetRows.forEach((row: any) => {
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
                containerWidth: containerSize.width || viewportSize.width,
                containerHeight: containerSize.height || viewportSize.height,
            }),
        [
            containerSize.height,
            containerSize.width,
            leadSheetRows.length,
            totalMeasures,
            viewportSize.height,
            viewportSize.width,
        ],
    );
    const density = layoutProfile.density;
    const containerStyle = {
        '--lead-row-width': `${layoutProfile.rowWidth}px`,
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
        const getOffsetTop = (element: Element) =>
            element.getBoundingClientRect().top - containerRect.top + container.scrollTop;
        const activeTop = getOffsetTop(activeRow);
        const lookaheadBottom =
            getOffsetTop(lookaheadRow) + (lookaheadRow as HTMLElement).clientHeight;
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
        layoutProfile.viewport,
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
            {leadSheetSectionGroups.map((sectionGroup: any) => {
                const isActiveSection = activeSectionId === sectionGroup.sectionId;

                return (
                    <div
                        key={sectionGroup.id}
                        className={`lead-sheet-section-group${
                            isActiveSection ? ' lead-sheet-section-group--active' : ''
                        }`}
                        data-section-id={sectionGroup.sectionId}
                    >
                        {sectionGroup.rows.map((row: any) => {
                            const rowIndex = rowIndexById.get(row.id) ?? -1;
                            const isActiveRow = row.measures.some((measure: any) =>
                                measure.chords.some(
                                    (chord: any) => chord.globalIndex === lastActiveChordIndex,
                                ),
                            );
                            const hasSectionMarkers = row.measures.some(
                                (measure: any) => measure.isSectionStart,
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
                                    {row.measures.map((measure: any, measureIndex: number) =>
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
                                    {row.measures.map((measure: any, measureIndex: number) => {
                                        const isActiveMeasure = measure.chords.some(
                                            (chord: any) =>
                                                chord.globalIndex === lastActiveChordIndex,
                                        );

                                        return (
                                            <div
                                                key={`${row.id}-${measureIndex}`}
                                                className={`measure-box${
                                                    isActiveMeasure ? ' measure-box--active' : ''
                                                }`}
                                                data-section-id={measure.sectionId}
                                                style={{
                                                    gridColumn: `${measureIndex + 1}`,
                                                    gridRow: hasSectionMarkers ? '2' : '1',
                                                }}
                                                onClick={() => openSectionEditor(measure.sectionId)}
                                            >
                                                {measure.chords.map((chord: any) => (
                                                    <ChordCard
                                                        key={chord.globalIndex}
                                                        chord={chord}
                                                        isActive={
                                                            chord.globalIndex ===
                                                            lastActiveChordIndex
                                                        }
                                                        notation={notation}
                                                    />
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}
