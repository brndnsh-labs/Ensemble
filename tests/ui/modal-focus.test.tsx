// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings } from '../../public/components/Settings.jsx';
import { Transport } from '../../public/components/Transport.jsx';
import { dispatch } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

// Mock dependencies
vi.mock('../../public/state/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));
vi.mock('../../public/controllers/app-controller.js', () => ({
    applyTheme: vi.fn(),
    setBpm: vi.fn(),
}));
vi.mock('../../public/controllers/midi-controller.js', () => ({
    initMIDI: vi.fn(),
    panic: vi.fn(),
}));
vi.mock('../../public/engine/engine.js', () => ({
    restoreGains: vi.fn(),
}));
vi.mock('../../public/engine/scheduler-core.js', () => ({
    togglePlay: vi.fn(),
}));
vi.mock('../../public/controllers/instrument-controller.js', () => ({
    handleTap: vi.fn(),
    togglePower: vi.fn(),
}));
vi.mock('../../public/ui-song-generator-controller.js', () => ({
    setupSongGeneratorHandlers: vi.fn(),
}));

describe('Modal Accessibility Focus', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        document.body.classList.remove('modal-open');

        // Reset state for each test
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'settings', open: false });

        // Polyfill requestAnimationFrame for Preact
        global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

        document.body.innerHTML = `
            <div id="transportContainer"></div>
            <div id="settingsContainer"></div>
            <div id="editorContainer"></div>
            
            <div id="arrangerActionTrigger"></div>
            <div id="arrangerActionMenu"></div>
            <button id="addSectionBtn"></button>
            <button id="inspirationHubBtn"></button>
            <button id="undoBtn"></button>
            <div id="analyzeAudioBtn"></div>
            <button id="mutateBtn"></button>
            <button id="clearProgBtn"></button>
            <button id="saveBtn"></button>
            <button id="saveDrumBtn"></button>
            <button id="shareHubBtn"></button>
            <button id="installAppBtn"></button>
            <button id="refreshAppBtn"></button>
            <button id="exportMidiBtn"></button>
            <button id="settingsShareHubBtn"></button>
            <button id="confirmExportBtn"></button>
            <input id="exportChordsCheck" type="checkbox">
            <input id="exportBassCheck" type="checkbox">
            <input id="exportSoloistCheck" type="checkbox">
            <input id="exportHarmoniesCheck" type="checkbox">
            <input id="exportDrumsCheck" type="checkbox">
            <input id="exportDurationInput">
            <button id="clearDrumsBtn"></button>
            <select id="densitySelect"></select>
            <select id="drumBarsSelect"></select>
            <button id="cloneMeasureBtn"></button>
            <button id="editArrangementBtn"></button>
            <input id="masterVolume">
            <input id="bpmInput">
        `;

        render(<Transport />, document.getElementById('transportContainer'));
        render(<Settings />, document.getElementById('settingsContainer'));

        // Wait for Preact to mount and subscribe
        await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it('should set aria-hidden="true" on modals by default', () => {
        const settings = document.getElementById('settingsOverlay');
        expect(settings.getAttribute('aria-hidden')).toBe('true');
    });

    it('should toggle aria-hidden when modal becomes active', async () => {
        const settings = document.getElementById('settingsOverlay');

        // Try direct dispatch first to see if bridge is working
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'settings', open: true });
        await new Promise((resolve) => setTimeout(resolve, 100));

        if (!settings.classList.contains('active')) {
            console.log('Direct dispatch failed to activate modal in test.');
        }

        expect(settings.classList.contains('active')).toBe(true);
        expect(settings.getAttribute('aria-hidden')).toBe('false');

        // Close
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'settings', open: false });
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(document.getElementById('settingsOverlay').classList.contains('active')).toBe(false);
        expect(document.getElementById('settingsOverlay').getAttribute('aria-hidden')).toBe('true');
    });
});
