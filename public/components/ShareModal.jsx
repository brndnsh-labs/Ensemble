import { h } from 'preact';
import React from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { exportToMidi } from '../midi-export.js';
import { generateShareUrl } from '../sharing.js';
import { dispatch, getState } from '../state.js';
import { ACTIONS } from '../types.js';
import { useDispatch, useEnsembleState } from '../ui-bridge.js';
import { SettingGroup, SettingRow, Stepper, Toggle } from './UIControls.jsx';

/**
 * @param {Object} props
 */
export function ShareModal() {
    const isOpen = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => s.playback.modals.share,
    );
    const [isExporting, setIsExporting] = useState(false);

    // --- Content Scope State ---
    const [includeSolo, setIncludeSolo] = useState(true);
    const [includeBass, setIncludeBass] = useState(true);
    const [includeChords, setIncludeChords] = useState(true);
    const [includeHarmony, setIncludeHarmony] = useState(true);
    const [includeDrums, setIncludeDrums] = useState(true);

    // --- Duration State ---
    const [numLoops, setNumLoops] = useState(1);
    const [addEnding, setAddEnding] = useState(true);

    // --- Export State ---
    const [filename, setFilename] = useState('My Song');

    const overlayRef = useRef(null);
    const dispatchAction = useDispatch();

    // Calculate total duration based on current state
    const { playback, arranger } = getState();
    const measures = arranger.progression.length;
    const bpm = playback.bpm;
    // Estimate arrangement length: (measures * 4 beats) / (bpm / 60)
    const totalSeconds = (numLoops * measures * 4 * 60) / bpm;
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const durationDisplay = `~${mins}:${secs.toString().padStart(2, '0')}`;

    useEffect(() => {
        if (isOpen && overlayRef.current) {
            const focusable = overlayRef.current.querySelector(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            );
            if (focusable) {
                setTimeout(() => focusable.focus(), 50);
            }
        }
    }, [isOpen]);

    const closeModal = () => {
        dispatchAction(ACTIONS.SET_MODAL_OPEN, { modal: 'share', open: false });
    };

    const getExportOptions = () => ({
        includeSolo,
        includeBass,
        includeChords,
        includeHarmony,
        includeDrums,
        numLoops,
        addEnding,
        filename: filename.replace(/[^a-zA-Z0-9\s\-_()]/g, '').trim() || 'My Song',
    });

    const handleCopyLink = () => {
        try {
            const url = generateShareUrl(getExportOptions());
            navigator.clipboard
                .writeText(url)
                .then(() => {
                    dispatch(ACTIONS.NOTIFY, {
                        message: 'Share link copied to clipboard!',
                        type: 'success',
                    });
                })
                .catch(() => {
                    dispatch(ACTIONS.NOTIFY, {
                        message: 'Failed to copy link. Try long-pressing the URL bar.',
                        type: 'error',
                    });
                });
        } catch (e) {
            console.error('Link generation failed:', e);
        }
    };

    const handleNativeShare = async () => {
        const url = generateShareUrl(getExportOptions());
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Ensemble Arrangement',
                    text: 'Check out this arrangement I made in Ensemble!',
                    url: url,
                });
            } catch (err) {
                console.log('Share failed or cancelled:', err);
            }
        } else {
            handleCopyLink();
        }
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const options = getExportOptions();
            await exportToMidi(options);
            dispatch(ACTIONS.NOTIFY, {
                message: 'MIDI Export complete!',
                type: 'success',
            });
            closeModal();
        } catch (err) {
            console.error('Export failed:', err);
            dispatch(ACTIONS.NOTIFY, {
                message: 'Export failed.',
                type: 'error',
            });
        } finally {
            setIsExporting(false);
        }
    };

    if (!isOpen) {
        return null;
    }

    const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

    return (
        <div
            id="shareOverlay"
            ref={overlayRef}
            class={`modal-overlay ${isOpen ? 'active' : ''}`}
            onClick={(e) => {
                if (e.target.id === 'shareOverlay') {
                    closeModal();
                }
            }}
        >
            <div class="modal-content settings-content" onClick={(e) => e.stopPropagation()}>
                <div class="modal-header-shared">
                    <h2>Share & Export</h2>
                    <button
                        id="closeShareBtn"
                        class="close-btn"
                        aria-label="Close"
                        onClick={closeModal}
                    >
                        &times;
                    </button>
                </div>

                <div class="modal-body" style="padding: 1.5rem;">
                    {/* --- SECTION 1: CONFIGURE CONTENT --- */}
                    <SettingGroup title="1. Configure Content">
                        <div class="instrument-selection-grid">
                            <div
                                class="flex-row"
                                style="gap: 0.75rem; cursor: pointer; align-items: center;"
                            >
                                <div style="flex-shrink: 0; display: flex;">
                                    <Toggle checked={includeSolo} onChange={setIncludeSolo} />
                                </div>
                                <span style="font-weight: 500; white-space: nowrap;">
                                    🎺 Soloist
                                </span>
                            </div>
                            <div
                                class="flex-row"
                                style="gap: 0.75rem; cursor: pointer; align-items: center;"
                            >
                                <div style="flex-shrink: 0; display: flex;">
                                    <Toggle checked={includeBass} onChange={setIncludeBass} />
                                </div>
                                <span style="font-weight: 500; white-space: nowrap;">🎸 Bass</span>
                            </div>
                            <div
                                class="flex-row"
                                style="gap: 0.75rem; cursor: pointer; align-items: center;"
                            >
                                <div style="flex-shrink: 0; display: flex;">
                                    <Toggle checked={includeChords} onChange={setIncludeChords} />
                                </div>
                                <span style="font-weight: 500; white-space: nowrap;">
                                    🎹 Chords
                                </span>
                            </div>
                            <div
                                class="flex-row"
                                style="gap: 0.75rem; cursor: pointer; align-items: center;"
                            >
                                <div style="flex-shrink: 0; display: flex;">
                                    <Toggle checked={includeHarmony} onChange={setIncludeHarmony} />
                                </div>
                                <span style="font-weight: 500; white-space: nowrap;">
                                    🎻 Harmony
                                </span>
                            </div>
                            <div
                                class="flex-row"
                                style="gap: 0.75rem; cursor: pointer; align-items: center;"
                            >
                                <div style="flex-shrink: 0; display: flex;">
                                    <Toggle checked={includeDrums} onChange={setIncludeDrums} />
                                </div>
                                <span style="font-weight: 500; white-space: nowrap;">🥁 Drums</span>
                            </div>
                        </div>

                        <div class="flex-col" style="gap: 0.5rem;">
                            <SettingRow
                                label="Loops"
                                description="Number of times to repeat the arrangement"
                                valueDisplay={
                                    <span style="color: var(--accent-color); font-weight: bold; margin-right: 0.5rem;">
                                        {durationDisplay}
                                    </span>
                                }
                            >
                                <Stepper
                                    value={numLoops}
                                    min={1}
                                    max={64}
                                    onDecrement={() => setNumLoops(Math.max(1, numLoops - 1))}
                                    onIncrement={() => setNumLoops(Math.min(64, numLoops + 1))}
                                />
                            </SettingRow>

                            <SettingRow
                                label="Resolution Ending"
                                description="Add a final chord to resolve the song"
                            >
                                <Toggle checked={addEnding} onChange={setAddEnding} />
                            </SettingRow>
                        </div>
                    </SettingGroup>

                    {/* --- SECTION 2: SELECT DESTINATION --- */}
                    <div class="settings-section" style="border-bottom: none; margin-top: 1rem;">
                        <h3>2. Select Destination</h3>
                        <div class="flex-col" style="gap: 1.5rem; margin-top: 1rem;">
                            {/* Link Card */}
                            <div class="help-card" style="margin: 0; padding: 1.25rem;">
                                <h4 style="margin-bottom: 0.5rem;">🔗 Cloud Link</h4>
                                <p class="text-mini-muted" style="margin-bottom: 1rem;">
                                    Generates a unique URL containing your exact mixer levels and
                                    instrument choices.
                                </p>
                                <div class="flex-row" style="gap: 0.75rem;">
                                    <button
                                        class="primary-btn flex-1"
                                        onClick={handleCopyLink}
                                        style="padding: 0.75rem;"
                                    >
                                        Copy Link
                                    </button>
                                    {canNativeShare && (
                                        <button
                                            class="secondary-btn"
                                            onClick={handleNativeShare}
                                            style="padding: 0.75rem;"
                                        >
                                            📤 Share
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* MIDI Card */}
                            <div
                                class="help-card"
                                style="margin: 0; padding: 1.25rem; border-color: rgba(var(--accent-color-rgb), 0.3);"
                            >
                                <h4 style="margin-bottom: 0.5rem;">🎹 DAW MIDI File</h4>
                                <p class="text-mini-muted" style="margin-bottom: 1rem;">
                                    Download a multi-track MIDI file for use in Logic, Ableton, or
                                    other DAWs.
                                </p>
                                <div class="flex-col" style="gap: 0.75rem;">
                                    <input
                                        id="exportFilenameInput"
                                        type="text"
                                        value={filename}
                                        onInput={(e) => setFilename(e.target.value)}
                                        placeholder="Filename..."
                                        maxLength="64"
                                        class="w-full"
                                        style="background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 4px; padding: 0.5rem; color: var(--text-color);"
                                    />
                                    <button
                                        class="secondary-btn w-full"
                                        onClick={handleExport}
                                        disabled={isExporting}
                                        style="padding: 0.75rem; border-color: var(--accent-color); color: var(--accent-color);"
                                    >
                                        {isExporting ? 'Generating...' : 'Download .mid'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
