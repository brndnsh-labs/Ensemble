import { Fragment } from 'preact';
import React, { memo } from 'preact/compat';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { TIME_SIGNATURES } from '../config.js';
import { useEnsembleState } from '../ui-bridge.js';
import { formatUnicodeSymbols } from '../utils.js';

/**
 * @typedef {Object} ChordCardProps
 * @property {any} chord
 * @property {boolean} isActive
 * @property {number} totalMeasures
 * @property {boolean} isMaximized
 * @property {string} notation
 * @property {any[]} [leadSheetMelody]
 * @property {string} soloistStyle
 */
/**
 * @param {ChordCardProps} props
 */
const ChordCardComponent = ({
    chord,
    isActive,
    totalMeasures,
    isMaximized,
    notation,
    leadSheetMelody,
    soloistStyle,
}) => {
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
        if (isMaximized) {
            if (totalMeasures > 24) {
                scale *= 0.9;
            }
            if (totalMeasures > 32) {
                scale *= 0.8;
            }
            if (totalMeasures > 48) {
                scale *= 0.7;
            }
        }
        if (charCount > 7) {
            scale *= 0.9;
        }
        if (charCount > 10) {
            scale *= 0.8;
        }

        // Note: measure chord count scaling is harder without measure context here,
        // but we can pass it if needed.

        if (scale < 1.0) {
            card.style.setProperty('--font-scale', scale.toFixed(2));
        } else {
            card.style.removeProperty('--font-scale');
        }
    }, [disp, chord.absName, isMaximized, totalMeasures]);

    const handleClick = (/** @type {any} */ e) => {
        e.stopPropagation();
        if (/** @type {any} */ (window).previewChord) {
            /** @type {any} */ (window).previewChord(chord.globalIndex);
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

    // --- Melody Sparkline Logic ---
    const sparklineNotes = useMemo(() => {
        if (
            soloistStyle !== 'lead_sheet' ||
            !leadSheetMelody ||
            leadSheetMelody.length === 0 ||
            chord.start === undefined
        ) {
            return [];
        }

        // Filter notes for this specific chord's step range
        return leadSheetMelody.filter(
            (/** @type {any} */ n) => n.globalStep >= chord.start && n.globalStep < chord.end,
        );
    }, [leadSheetMelody, soloistStyle, chord.start, chord.end]);

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
                    {sparklineNotes.map((/** @type {any} */ n, /** @type {any} */ i) => {
                        // Normalize MIDI 48-84 to 0-100% height
                        const height = Math.min(100, Math.max(15, ((n.midi - 48) / 36) * 100));
                        return (
                            <div key={i} className="sparkline-bar" style={`height: ${height}%`} />
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const ChordCard = memo(ChordCardComponent);

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
    } = useEnsembleState((/** @type {import('../types.js').EnsembleState} */ s) => ({
        progression: s.arranger.progression,
        timeSignature: s.arranger.timeSignature,
        lastActiveChordIndex: s.chords.lastActiveChordIndex,
        sectionsState: s.arranger.sections,
        notation: s.arranger.notation || 'roman',
        leadSheetMelody: s.soloist.leadSheetMelody,
        soloistStyle: s.soloist.style || 'smart',
        isMaximized: s.vizState.isMaximized,
    }));

    /** @type {import('preact/hooks').MutableRef<HTMLDivElement|null>} */
    const containerRef = useRef(null);
    const ts = /** @type {any} */ (TIME_SIGNATURES)[timeSignature] || TIME_SIGNATURES['4/4'];

    const groupedSections = useMemo(() => {
        /** @type {any[]} */
        const blocks = [];
        /** @type {any} */
        let currentBlock = null;
        /** @type {any} */
        let currentMeasure = null;
        let currentMeasureBeats = 0;
        let currentStep = 0;

        progression.forEach((/** @type {any} */ chord, /** @type {any} */ i) => {
            const sectionData = sectionsState.find(
                (/** @type {any} */ s) => s.id === chord.sectionId,
            );
            const isSeamless = sectionData?.seamless;
            const isNewSection = !currentBlock || currentBlock.lastSectionId !== chord.sectionId;

            if (isNewSection) {
                if (!currentBlock || !isSeamless) {
                    currentBlock = {
                        id: chord.sectionId,
                        label: chord.sectionLabel,
                        measures: [],
                        lastSectionId: chord.sectionId,
                    };
                    blocks.push(currentBlock);
                    currentMeasure = null;
                    currentMeasureBeats = 0;
                } else {
                    currentBlock.lastSectionId = chord.sectionId;
                }
            }

            // Force new measure if section changes?
            // Usually nice for visual clarity, unless it's a mid-bar modulation.
            // Let's force new measure for section change to keep labels clean for now.
            if (isNewSection && currentMeasureBeats > 0) {
                currentMeasure = null;
                currentMeasureBeats = 0;
            }

            if (!currentMeasure || currentMeasureBeats >= ts.beats) {
                currentMeasure = {
                    chords: [],
                    // Tag measure if it starts a seamless section
                    sectionLabel: isNewSection && isSeamless ? chord.sectionLabel : null,
                };
                currentBlock.measures.push(currentMeasure);
                currentMeasureBeats = 0;
            }

            const durationSteps = Math.round(chord.beats * ts.stepsPerBeat);
            currentMeasure.chords.push({
                ...chord,
                globalIndex: i,
                start: currentStep,
                end: currentStep + durationSteps,
            });
            currentStep += durationSteps;
            currentMeasureBeats += chord.beats;
        });
        return blocks;
    }, [progression, ts, sectionsState]);

    const totalMeasures = useMemo(
        () => groupedSections.reduce((acc, s) => acc + s.measures.length, 0),
        [groupedSections],
    );

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        if (isMaximized) {
            return;
        }

        const activeCard = container.querySelector('.chord-card.active');
        if (!activeCard) {
            return;
        }

        const containerRect = container.getBoundingClientRect();
        const cardRect = activeCard.getBoundingClientRect();
        const scrollThreshold = containerRect.top + containerRect.height * 0.7;

        if (cardRect.bottom > scrollThreshold || cardRect.top < containerRect.top) {
            const targetScrollTop =
                container.scrollTop +
                (cardRect.top - containerRect.top) -
                containerRect.height * 0.2;
            container.scrollTo({
                top: targetScrollTop,
                behavior: 'smooth',
            });
        }
    }, [lastActiveChordIndex, isMaximized, totalMeasures]);

    return (
        <div
            className="display-area"
            id="chordVisualizer"
            ref={containerRef}
            data-total-measures={totalMeasures}
        >
            {groupedSections.map((/** @type {any} */ section) => (
                <div
                    key={section.id}
                    className="section-block"
                    onClick={() => {
                        const detail = { detail: { sectionId: section.id } };
                        document.dispatchEvent(new CustomEvent('open-editor', detail));
                    }}
                >
                    <div className="section-block-header">
                        {formatUnicodeSymbols(section.label)}
                    </div>
                    <div className="section-block-content">
                        {section.measures.map(
                            (/** @type {any} */ measure, /** @type {any} */ mIdx) => (
                                <div key={mIdx} className="measure-box">
                                    {measure.sectionLabel && (
                                        <div className="key-label">
                                            {formatUnicodeSymbols(measure.sectionLabel)}
                                        </div>
                                    )}
                                    {measure.chords.map((/** @type {any} */ chord) => (
                                        <ChordCard
                                            key={chord.globalIndex}
                                            chord={chord}
                                            isActive={chord.globalIndex === lastActiveChordIndex}
                                            totalMeasures={totalMeasures}
                                            isMaximized={isMaximized}
                                            notation={notation}
                                            leadSheetMelody={leadSheetMelody}
                                            soloistStyle={soloistStyle}
                                        />
                                    ))}
                                </div>
                            ),
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
