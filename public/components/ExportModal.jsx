import { h } from 'preact';
import React from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { exportToMidi } from '../midi-export.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useDispatch, useEnsembleState } from '../ui-bridge.js';
import { Stepper, Toggle } from './UIControls.jsx';

export function ExportModal() {
    const isOpen = useEnsembleState((s) => s.playback.modals.export);
    const [isExporting, setIsExporting] = useState(false);
    const [includeSolo, setIncludeSolo] = useState(true);
    const [includeBass, setIncludeBass] = useState(true);
    const [includeChords, setIncludeChords] = useState(true);
    const [includeHarmony, setIncludeHarmony] = useState(true);
    const [includeDrums, setIncludeDrums] = useState(true);
    const [numLoops, setNumLoops] = useState(1);
    const [addEnding, setAddEnding] = useState(true);
    const [filename, setFilename] = useState('My Song');

    const overlayRef = useRef(null);
    const dispatch = useDispatch();

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
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'export', open: false });
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            // Sanitize filename for safety
            const sanitizedName = filename.replace(/[^a-zA-Z0-9\s\-_()]/g, '').trim();

            const options = {
                includeSolo,
                includeBass,
                includeChords,
                includeHarmony,
                includeDrums,
                numLoops,
                addEnding,
                filename: sanitizedName || 'My Song',
            };
            await exportToMidi(options);
            dispatch(ACTIONS.NOTIFY, {
                message: 'MIDI Export complete!',
                type: 'success',
            });
            closeModal();
        } catch (err) {
            console.error('Export failed:', err);
            dispatch(ACTIONS.NOTIFY, {
                message: 'Export failed. Check console for details.',
                type: 'error',
            });
        } finally {
            setIsExporting(false);
        }
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div
            id="exportOverlay"
            ref={overlayRef}
            class={`modal-overlay ${isOpen ? 'active' : ''}`}
            onClick={(e) => {
                if (e.target.id === 'exportOverlay') {
                    closeModal();
                }
            }}
        >
            <div class="modal-content" onClick={(e) => e.stopPropagation()}>
                <div class="modal-header-shared">
                    <h2>MIDI Export</h2>
                    <button class="close-btn" aria-label="Close" onClick={closeModal}>
                        &times;
                    </button>
                </div>

                <div class="modal-body">
                    <div class="settings-section">
                        <h3>Export Settings</h3>
                        <div class="flex-col">
                            <label
                                class="form-control-compact"
                                style="height: auto; padding: 0.5rem;"
                            >
                                <div class="flex-col w-full" style="gap: 0.25rem;">
                                    <span class="text-mini-muted">Filename</span>
                                    <input
                                        id="exportFilenameInput"
                                        type="text"
                                        value={filename}
                                        onInput={(e) => setFilename(e.target.value)}
                                        maxLength="64"
                                        class="w-full"
                                        style="background: transparent; border: none; border-bottom: 1px solid var(--border-color); color: var(--text-color); font-weight: bold;"
                                    />
                                </div>
                            </label>
                        </div>
                    </div>

                    <div class="settings-section">
                        <h3>Included Tracks</h3>
                        <div class="grid-actions" style="grid-template-columns: 1fr 1fr 1fr;">
                            <label class="form-control-compact">
                                <Toggle
                                    id="exportSolo"
                                    checked={includeSolo}
                                    onChange={setIncludeSolo}
                                />
                                <span>Solo</span>
                            </label>
                            <label class="form-control-compact">
                                <Toggle
                                    id="exportBass"
                                    checked={includeBass}
                                    onChange={setIncludeBass}
                                />
                                <span>Bass</span>
                            </label>
                            <label class="form-control-compact">
                                <Toggle
                                    id="exportChords"
                                    checked={includeChords}
                                    onChange={setIncludeChords}
                                />
                                <span>Chords</span>
                            </label>
                            <label class="form-control-compact">
                                <Toggle
                                    id="exportHarmony"
                                    checked={includeHarmony}
                                    onChange={setIncludeHarmony}
                                />
                                <span>Harmony</span>
                            </label>
                            <label class="form-control-compact">
                                <Toggle
                                    id="exportDrums"
                                    checked={includeDrums}
                                    onChange={setIncludeDrums}
                                />
                                <span>Drums</span>
                            </label>
                        </div>
                    </div>

                    <div class="settings-section" style="border-bottom: none;">
                        <h3>Duration</h3>
                        <div class="flex-col">
                            <label
                                class="form-control-compact"
                                style="height: auto; padding: 0.5rem;"
                            >
                                <div class="flex-between w-full">
                                    <span>Repeat Loops</span>
                                    <Stepper
                                        value={numLoops}
                                        min={1}
                                        max={32}
                                        onDecrement={() => setNumLoops(Math.max(1, numLoops - 1))}
                                        onIncrement={() => setNumLoops(Math.min(32, numLoops + 1))}
                                    />
                                </div>
                            </label>

                            <label
                                class="form-control-compact"
                                style="height: auto; padding: 0.5rem;"
                            >
                                <div class="flex-between w-full">
                                    <span>Add Resolution Ending</span>
                                    <Toggle
                                        id="exportEnding"
                                        checked={addEnding}
                                        onChange={setAddEnding}
                                    />
                                </div>
                            </label>
                        </div>
                    </div>

                    <div style="margin-top: 1.5rem;">
                        <button
                            id="confirmExportBtn"
                            class="primary-btn w-full"
                            onClick={handleExport}
                            disabled={isExporting}
                            style="padding: 1rem;"
                        >
                            {isExporting ? 'Generating File...' : 'Download MIDI (.mid)'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
