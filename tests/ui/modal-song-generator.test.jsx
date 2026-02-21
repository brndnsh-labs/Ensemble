/**
 * @vitest-environment happy-dom
 */

import { h, render } from 'preact';
import React from 'preact/compat';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorModal } from '../../public/components/EditorModal.jsx';
import { GenerateSongModal } from '../../public/components/GenerateSongModal.jsx';
import { dispatch } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

// Mock dependencies
vi.mock('../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));
vi.mock('../../public/app-controller.js', () => ({
    setBpm: vi.fn(),
}));
vi.mock('../../public/instrument-controller.js', () => ({
    togglePower: vi.fn(),
    switchMeasure: vi.fn(),
    updateMeasures: vi.fn(),
    cloneMeasure: vi.fn(),
}));
vi.mock('../../public/ui-song-generator-controller.js', () => ({
    setupSongGeneratorHandlers: vi.fn(),
}));

vi.mock('../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    const mockState = {
        ...actual,
        playback: {
            ...actual.playback,
            modals: { generateSong: false, editor: true },
        },
        arranger: { ...actual.arranger, totalSteps: 64 },
    };
    return {
        ...mockState,
        getState: () => mockState,
        dispatch: actual.dispatch,
        ACTIONS: actual.ACTIONS,
    };
});

const waitFor = async (callback, timeout = 1000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            if (callback()) {
                return true;
            }
        } catch (_e) {
            // ignore
        }
        await new Promise((r) => setTimeout(r, 20));
    }
    return callback(); // Final try to throw original error if still failing
};

describe('Song Generator Modal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.classList.remove('modal-open');

        // Reset state for all modals
        ['settings', 'editor', 'generateSong', 'export', 'templates', 'analyzer'].forEach(
            (modal) => {
                dispatch(ACTIONS.SET_MODAL_OPEN, { modal, open: false });
            },
        );
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'editor', open: true });

        // Polyfill requestAnimationFrame for Preact
        global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

        document.body.innerHTML = `
            <div id="modalContainer"></div>
            <div id="editorContainer"></div>
            
            <div id="settingsOverlay" class="settings-overlay" aria-hidden="true"></div>
            <div id="exportOverlay" class="settings-overlay" aria-hidden="true"></div>
            <div id="templatesOverlay" class="settings-overlay" aria-hidden="true"></div>
            <div id="analyzerOverlay" class="modal-overlay" aria-hidden="true"></div>
            <div id="arrangerActionTrigger"></div>
            <div id="arrangerActionMenu"></div>
            <button id="addSectionBtn"></button>
            <button id="templatesBtn"></button>
            <button id="undoBtn"></button>
            <div id="analyzeAudioBtn"></div>
            <button id="mutateBtn"></button>
            <button id="clearProgBtn"></button>
            <button id="saveBtn"></button>
            <button id="saveDrumBtn"></button>
            <button id="shareBtn"></button>
            <button id="installAppBtn"></button>
            <button id="refreshAppBtn"></button>
            <button id="exportMidiBtn"></button>
            <button id="settingsExportMidiBtn"></button>
            <button id="confirmExportBtn"></button>
            <input id="exportChordsCheck" type="checkbox">
            <input id="exportBassCheck" type="checkbox">
            <input id="exportSoloistCheck" type="checkbox">
            <input id="exportHarmoniesCheck" type="checkbox">
            <input id="exportDrumsCheck" type="checkbox">
            <input id="exportDurationInput">
            <button id="clearDrumsBtn"></button>
            <div id="densitySelect"></div>
            <div id="drumBarsSelect"></div>
            <button id="cloneMeasureBtn"></button>
            <button id="editArrangementBtn"></button>
            <button id="settingsBtn"></button>
            <button id="closeSettingsBtn"></button>
            <button id="resetSettingsBtn"></button>
            <input id="masterVolume">
            <input id="bpmInput">
            <input type="radio" name="analyzerMode" value="chords" checked>
            <input type="radio" name="analyzerMode" value="melody">
        `;

        render(<GenerateSongModal />, document.getElementById('modalContainer'));
        render(<EditorModal />, document.getElementById('editorContainer'));
    });

    it('should be initially hidden', () => {
        const modal = document.getElementById('generateSongOverlay');
        expect(modal.classList.contains('active')).toBe(false);
        expect(modal.getAttribute('aria-hidden')).toBe('true');
    });

    it('should open when Random button is clicked', async () => {
        const modal = document.getElementById('generateSongOverlay');
        const btn = document.getElementById('randomizeBtn');

        btn.click();

        // Wait for Preact state update
        await waitFor(() => modal.classList.contains('active'));

        expect(modal.classList.contains('active')).toBe(true);
    });

    it('should close when Cancel button is clicked', async () => {
        const modal = document.getElementById('generateSongOverlay');

        // Open it first
        document.getElementById('randomizeBtn').click();
        await waitFor(() => modal.classList.contains('active'));
        expect(modal.classList.contains('active')).toBe(true);

        const closeBtn = document.getElementById('closeGenerateSongBtn');
        closeBtn.click();

        await waitFor(() => !modal.classList.contains('active'));
        expect(modal.classList.contains('active')).toBe(false);
    });
});
