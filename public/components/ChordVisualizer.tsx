import { memo } from 'preact/compat';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { replaceChordInSection } from '../arranger-controller.js';
import { TIME_SIGNATURES } from '../config.js';
import {
    buildLeadSheetRows,
    buildLeadSheetSections,
    getLeadSheetLayoutProfile,
    type LeadSheetChord,
    type LeadSheetRow,
    type LeadSheetRowMeasure,
} from '../lead-sheet-model.js';
import type { Section } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { formatUnicodeSymbols } from '../utils.js';
import { ChordPicker } from './editor/ChordPicker.jsx';
import { SectionHeaderStrip } from './editor/SectionHeaderStrip.jsx';

/**
 * Bucket a chord's granular quality string (from chords-engine) into one of the
 * seven harmonic families the chart colors by. Order matters: the major-7
 * family (maj…) is matched before the generic minor `m…` prefix.
 */
function qualityBucket(quality: string, isMinor: boolean): string {
    const q = quality || '';
    if (q === 'dim') {
        return 'dim';
    }
    if (q === 'halfdim') {
        return 'halfdim';
    }
    if (q === 'aug' || q === 'augmaj7') {
        return 'aug';
    }
    if (q === 'sus2' || q === 'sus4') {
        return 'sus';
    }
    if (q.startsWith('maj') || q === 'major' || q === '6' || q === '5' || q === 'add9') {
        return 'major';
    }
    if (q.startsWith('7') || q === '9' || q === '11' || q === '13') {
        return 'dominant';
    }
    if (isMinor || q.startsWith('m')) {
        return 'minor';
    }
    return 'major';
}

interface ChordCardProps {
    chord: LeadSheetChord;
    isActive: boolean;
    notation: string;
    /**
     * When set (locked mode), clicks bubble up the chord + the card's bounding
     * rect so the parent can anchor a chord-picker popover. When undefined,
     * falls back to the legacy preview-on-click behavior.
     */
    onPick?: (chord: LeadSheetChord, rect: DOMRect) => void;
}

const ChordCardComponent = ({ chord, isActive, notation, onPick }: ChordCardProps) => {
    // `notation` is the persisted arranger notation ('roman' | 'name' | 'nns');
    // it always keys one of the three FormattedChordNames slots at runtime.
    const disp = chord.display ? chord.display[notation as keyof typeof chord.display] : null;

    const cardRef = useRef<HTMLButtonElement | null>(null);

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
        if (onPick && cardRef.current) {
            onPick(chord, cardRef.current.getBoundingClientRect());
            return;
        }
        if (window.previewChord) {
            window.previewChord(chord.globalIndex);
        }
    };

    const classNames = [
        'chord-card',
        `q-${qualityBucket(chord.quality, chord.isMinor)}`,
        isActive ? 'active' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <button type="button" class={classNames} ref={cardRef} onClick={handleClick}>
            {disp ? (
                <span class="chord-symbol">
                    <span class="root">{formatUnicodeSymbols(disp.root)}</span>
                    <span class="suffix">{formatUnicodeSymbols(disp.suffix)}</span>
                    {disp.bass && <span class="bass-note">/{formatUnicodeSymbols(disp.bass)}</span>}
                </span>
            ) : (
                <span class="chord-symbol">{formatUnicodeSymbols(chord.absName) || '...'}</span>
            )}
        </button>
    );
};

const ChordCard = memo(ChordCardComponent);

/** A contiguous run of rows that share a section — built locally for rendering. */
interface LeadSheetSectionGroup {
    id: string;
    sectionId?: string;
    rows: LeadSheetRow[];
}

function getViewportSize(): { width: number; height: number } {
    if (typeof window === 'undefined') {
        return { width: 1280, height: 800 };
    }

    return {
        width: window.innerWidth || 1280,
        height: window.innerHeight || 800,
    };
}

function openSectionEditor(sectionId: string | undefined) {
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
        chartLocked,
        keyName,
        keyIsMinor,
        qualityColors,
    } = useEnsembleState((state) => ({
        progression: state.arranger.progression,
        timeSignature: state.arranger.timeSignature,
        lastActiveChordIndex: state.chords.lastActiveChordIndex,
        sectionsState: state.arranger.sections,
        notation: state.arranger.notation || 'roman',
        chartLocked: state.playback?.chartLocked ?? true,
        keyName: state.arranger.key,
        keyIsMinor: state.arranger.isMinor,
        qualityColors: state.playback?.qualityColors ?? true,
    }));
    const sectionById = useMemo(
        () =>
            new Map<string | undefined, Section>(
                (sectionsState || []).map((s: Section) => [s.id, s] as const),
            ),
        [sectionsState],
    );
    const [openPick, setOpenPick] = useState<{
        chord: LeadSheetChord;
        rect: DOMRect;
    } | null>(null);
    const handleChordPick = (chord: LeadSheetChord, rect: DOMRect) => {
        setOpenPick({ chord, rect });
    };

    const containerRef = useRef<HTMLDivElement | null>(null);
    const [viewportSize, setViewportSize] = useState(getViewportSize);
    const [containerSize, setContainerSize] = useState({ height: 0, width: 0 });
    const timeSignatureConfig = TIME_SIGNATURES[timeSignature] || TIME_SIGNATURES['4/4'];

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
                leadSheetRows.map((row: LeadSheetRow, index: number) => {
                    return [row.id, index];
                }),
            ),
        [leadSheetRows],
    );

    const totalMeasures = useMemo(
        () =>
            leadSheetRows.reduce(
                (total: number, row: LeadSheetRow) => total + row.measures.length,
                0,
            ),
        [leadSheetRows],
    );
    const activeRowIndex = leadSheetRows.findIndex((row: LeadSheetRow) =>
        row.measures.some((measure: LeadSheetRowMeasure) =>
            measure.chords.some(
                (chord: LeadSheetChord) => chord.globalIndex === lastActiveChordIndex,
            ),
        ),
    );
    const activeSectionId =
        leadSheetRows.find((row: LeadSheetRow) =>
            row.measures.some((measure: LeadSheetRowMeasure) =>
                measure.chords.some(
                    (chord: LeadSheetChord) => chord.globalIndex === lastActiveChordIndex,
                ),
            ),
        )?.sectionId ?? null;
    const leadSheetSectionGroups = useMemo(() => {
        const groups: LeadSheetSectionGroup[] = [];

        leadSheetRows.forEach((row: LeadSheetRow) => {
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

    const pickerInitial = openPick ? parseChordToPickerState(openPick.chord) : null;

    return (
        <>
            <div
                class={`display-area lead-sheet lead-sheet--${density} lead-sheet--viewport-${layoutProfile.viewport} lead-sheet--scroll-${layoutProfile.scrollMode}${qualityColors ? ' lead-sheet--quality-colors' : ''}`}
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
                {leadSheetSectionGroups.map((sectionGroup: LeadSheetSectionGroup) => {
                    const isActiveSection = activeSectionId === sectionGroup.sectionId;
                    const sectionModel = sectionById.get(sectionGroup.sectionId);

                    return (
                        <div
                            key={sectionGroup.id}
                            class={`lead-sheet-section-group${
                                isActiveSection ? ' lead-sheet-section-group--active' : ''
                            }`}
                            data-section-id={sectionGroup.sectionId}
                        >
                            {sectionModel && (
                                <SectionHeaderStrip section={sectionModel} compact={true} />
                            )}
                            {sectionGroup.rows.map((row: LeadSheetRow) => {
                                const rowIndex = rowIndexById.get(row.id) ?? -1;
                                const isActiveRow = row.measures.some(
                                    (measure: LeadSheetRowMeasure) =>
                                        measure.chords.some(
                                            (chord: LeadSheetChord) =>
                                                chord.globalIndex === lastActiveChordIndex,
                                        ),
                                );
                                const isUpcomingRow =
                                    activeRowIndex >= 0 &&
                                    rowIndex > activeRowIndex &&
                                    rowIndex <= activeRowIndex + layoutProfile.lookaheadRows;

                                return (
                                    <div
                                        key={row.id}
                                        class={`lead-sheet-row${
                                            row.isSectionStart
                                                ? ' lead-sheet-row--section-start'
                                                : ''
                                        }${isActiveRow ? ' lead-sheet-row--active' : ''}${
                                            isUpcomingRow ? ' lead-sheet-row--upcoming' : ''
                                        }`}
                                        data-row-index={rowIndex}
                                        data-section-id={row.sectionId}
                                    >
                                        {row.measures.map(
                                            (
                                                measure: LeadSheetRowMeasure,
                                                measureIndex: number,
                                            ) => {
                                                const isActiveMeasure = measure.chords.some(
                                                    (chord: LeadSheetChord) =>
                                                        chord.globalIndex === lastActiveChordIndex,
                                                );

                                                return (
                                                    <div
                                                        key={`${row.id}-${measureIndex}`}
                                                        class={`measure-box${
                                                            isActiveMeasure
                                                                ? ' measure-box--active'
                                                                : ''
                                                        }`}
                                                        data-section-id={measure.sectionId}
                                                        style={{
                                                            gridColumn: `${measureIndex + 1}`,
                                                            gridRow: '1',
                                                        }}
                                                        onClick={() =>
                                                            openSectionEditor(measure.sectionId)
                                                        }
                                                    >
                                                        {measure.chords.map(
                                                            (chord: LeadSheetChord) => (
                                                                <ChordCard
                                                                    key={chord.globalIndex}
                                                                    chord={chord}
                                                                    isActive={
                                                                        chord.globalIndex ===
                                                                        lastActiveChordIndex
                                                                    }
                                                                    notation={notation}
                                                                    onPick={
                                                                        chartLocked
                                                                            ? handleChordPick
                                                                            : undefined
                                                                    }
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
            {openPick && pickerInitial && (
                <ChordPicker
                    initialDegree={pickerInitial.degree}
                    initialAccidental={pickerInitial.accidental}
                    initialQualityId={pickerInitial.qualityId}
                    notation={notation as any}
                    keyName={keyName || 'C'}
                    keyIsMinor={!!keyIsMinor}
                    anchorRect={openPick.rect}
                    onSelect={(newText) => {
                        // A placed chord always carries section context (tagged on
                        // by validateProgression), so these are present here even
                        // though the Chord type marks them optional. Non-null
                        // assertions keep the prior (any-typed) runtime exactly.
                        replaceChordInSection(
                            openPick.chord.sectionId!,
                            openPick.chord.localIndex!,
                            newText,
                        );
                    }}
                    onClose={() => setOpenPick(null)}
                />
            )}
        </>
    );
}

const ROMAN_PARSE = /^([#b])?(I{1,3}|IV|V?I{0,3}|VII|i{1,3}|iv|v?i{0,3}|vii)/;
const ROMAN_TO_DEGREE: Record<string, number> = {
    i: 1,
    ii: 2,
    iii: 3,
    iv: 4,
    v: 5,
    vi: 6,
    vii: 7,
};

const QUALITY_TO_ID: Record<string, string> = {
    major: 'maj',
    minor: 'min',
    '7': '7',
    dom7: '7',
    maj7: 'maj7',
    m7: 'm7',
    min7: 'm7',
    dim: 'dim',
    m7b5: 'm7',
    halfdim: 'm7',
    dim7: 'dim',
    aug: 'aug',
    augmaj7: 'aug',
    sus2: 'sus4',
    sus4: 'sus4',
};

function parseChordToPickerState(chord: LeadSheetChord): {
    degree: number;
    accidental: '' | 'b' | '#';
    qualityId: string;
} {
    // Roman is the most robust anchor — case-aware AND notation-independent of key.
    const roman = (chord?.romanName as string) || '';
    const match = roman.match(ROMAN_PARSE);
    let degree = 1;
    let accidental: '' | 'b' | '#' = '';
    if (match) {
        accidental = (match[1] as '' | 'b' | '#') || '';
        const num = match[2].toLowerCase();
        degree = ROMAN_TO_DEGREE[num] ?? 1;
    }
    const qualityId = QUALITY_TO_ID[chord?.quality as string] || 'maj';
    return { degree, accidental, qualityId };
}
