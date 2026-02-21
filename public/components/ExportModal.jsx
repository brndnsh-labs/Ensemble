import { h } from 'preact';
import React from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { exportToMidi } from '../midi-export.js';
import { dispatch, getState } from '../state.js';
import { useEnsembleState } from '../ui-bridge.js';

const { arranger, playback } = getState();

import { ACTIONS } from '../types.js';

export function ExportModal() {
    const isOpen = useEnsembleState((s) => s.playback.modals.export);
    const [filename, setFilename] = useState('Ensemble Export');
    const overlayRef = useRef(null);

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

    useEffect(() => {
        if (isOpen) {
            let defaultName = arranger.lastChordPreset || 'Ensemble Export';
            defaultName = defaultName.replace(/[^a-zA-Z0-9\s-_]/g, '').trim();
            setFilename(`${defaultName} - ${arranger.key} - ${playback.bpm}bpm`);
        }
    }, [isOpen]);

    const close = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'export', open: false });
    };

    const adjustExportDuration = (delta) => {
        const input = document.getElementById('exportDurationInput');
        if (!input) {
            return;
        }
        const current = parseInt(input.value, 10);
        const next = Math.max(1, Math.min(20, current + delta));
        input.value = next;
    };

    const handleModeChange = (e) => {
        const isTime = e.target.value === 'time';
        const container = document.getElementById('exportDurationContainer');
        const stepper = document.getElementById('exportDurationStepper');
        if (container) {
            container.style.opacity = isTime ? '1' : '0.5';
            container.style.pointerEvents = isTime ? 'auto' : 'none';
        }
        if (stepper) {
            stepper.style.borderColor = isTime ? 'var(--accent-color)' : 'var(--border-color)';
            stepper.style.backgroundColor = isTime ? 'var(--card-bg)' : 'var(--input-bg)';
        }
    };

    const handleConfirmExport = () => {
        const includedTracks = [];
        if (document.getElementById('exportChordsCheck')?.checked) {
            includedTracks.push('chords');
        }
        if (document.getElementById('exportBassCheck')?.checked) {
            includedTracks.push('bass');
        }
        if (document.getElementById('exportSoloistCheck')?.checked) {
            includedTracks.push('soloist');
        }
        if (document.getElementById('exportHarmoniesCheck')?.checked) {
            includedTracks.push('harmonies');
        }
        if (document.getElementById('exportDrumsCheck')?.checked) {
            includedTracks.push('drums');
        }

        const loopMode =
            document.querySelector('input[name="exportMode"]:checked')?.value || 'once';
        const targetDurationInput = document.getElementById('exportDurationInput');
        const targetDuration = targetDurationInput ? parseFloat(targetDurationInput.value) : 1;
        // Sanitize filename to prevent XSS and file system issues (defense in depth)
        const safeFilename = (filename || 'Ensemble Export')
            .replace(/[^a-zA-Z0-9\s\-_()]/g, '')
            .substring(0, 64)
            .trim();

        const finalFilename = safeFilename || 'Ensemble Export';

        close();
        exportToMidi({ includedTracks, loopMode, targetDuration, filename: finalFilename });
    };

    return (
        <div
            id="exportOverlay"
            ref={overlayRef}
            class={`settings-overlay ${isOpen ? 'active' : ''}`}
            aria-hidden={!isOpen ? 'true' : 'false'}
            onClick={(e) => {
                if (e.target.id === 'exportOverlay') {
                    close();
                }
            }}
        >
            <div class="settings-content" onClick={(e) => e.stopPropagation()}>
                <div style="display: flex; justify-content: space-between; margin-bottom: 1rem; align-items: center;">
                    <h2>MIDI Export Options</h2>
                    <button
                        id="closeExportBtn"
                        class="primary-btn"
                        style="padding: 0.4rem 1rem; font-size: 0.9rem; background: transparent; border: 1px solid var(--border-color); color: var(--text-color);"
                        onClick={close}
                    >
                        Cancel
                    </button>
                </div>

                <div class="settings-controls">
                    <div class="settings-section">
                        <h3>File Info</h3>
                        <div class="setting-item">
                            <label class="setting-label">
                                <span>Filename</span>
                            </label>
                            <input
                                type="text"
                                id="exportFilenameInput"
                                value={filename}
                                maxLength={64}
                                onInput={(e) => setFilename(e.target.value)}
                                style="width: 100%; padding: 0.5rem; background: var(--input-bg); border: 1px solid var(--border-color); color: var(--text-color); border-radius: 4px;"
                                spellcheck="false"
                            />
                        </div>
                    </div>

                    <div class="settings-section">
                        <h3>Tracks to Include</h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="checkbox" id="exportChordsCheck" checked />
                                Chords
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="checkbox" id="exportBassCheck" checked />
                                Bass
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="checkbox" id="exportSoloistCheck" checked />
                                Soloist
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="checkbox" id="exportHarmoniesCheck" checked />
                                Harmonies
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="checkbox" id="exportDrumsCheck" checked />
                                Drums
                            </label>
                        </div>
                    </div>

                    <div class="settings-section" style="border-bottom: none;">
                        <h3>Duration</h3>
                        <div style="display: flex; flex-direction: column; gap: 1rem;">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input
                                    type="radio"
                                    name="exportMode"
                                    value="once"
                                    checked
                                    onChange={handleModeChange}
                                />
                                <span>Cycle Through Once</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input
                                    type="radio"
                                    name="exportMode"
                                    value="time"
                                    onChange={handleModeChange}
                                />
                                <span>Target Duration (Minutes)</span>
                            </label>
                            <div
                                id="exportDurationContainer"
                                style="margin-left: 1.8rem; opacity: 0.5; pointer-events: none; transition: opacity 0.2s;"
                            >
                                <div
                                    id="exportDurationStepper"
                                    class="stepper-control"
                                    style="display: flex; align-items: center; background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; width: fit-content;"
                                >
                                    <button
                                        id="exportDurationDec"
                                        aria-label="Decrease Duration"
                                        class="stepper-btn"
                                        style="padding: 0.5rem 0.75rem; background: transparent; border: none; color: var(--text-color); cursor: pointer; font-weight: bold; font-size: 1.1rem; display: flex; align-items: center; justify-content: center;"
                                        onClick={() => adjustExportDuration(-1)}
                                    >
                                        -
                                    </button>
                                    <input
                                        type="number"
                                        id="exportDurationInput"
                                        value="3"
                                        min="1"
                                        max="20"
                                        readonly
                                        style="width: 40px; text-align: center; background: transparent; border: none; font-weight: bold; color: var(--text-color); -moz-appearance: textfield; padding: 0;"
                                    />
                                    <button
                                        id="exportDurationInc"
                                        aria-label="Increase Duration"
                                        class="stepper-btn"
                                        style="padding: 0.5rem 0.75rem; background: transparent; border: none; color: var(--text-color); cursor: pointer; font-weight: bold; font-size: 1.1rem; display: flex; align-items: center; justify-content: center;"
                                        onClick={() => adjustExportDuration(1)}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style="margin-top: 1.5rem;">
                        <button
                            id="confirmExportBtn"
                            class="primary-btn"
                            style="width: 100%; padding: 1rem;"
                            onClick={handleConfirmExport}
                        >
                            Download MIDI
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
