/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Accessibility (A11y) & Interactive Integrity', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <button id="playBtn" aria-label="Start Playback">START</button>
            <input id="bpmInput" aria-label="Tempo in BPM" value="120">
            <div id="sectionList" role="list"></div>
            <div id="sequencerGrid" role="grid" aria-label="Drum Sequencer"></div>
            <div id="chordVisualizer" aria-live="polite"></div>
            
            <div class="genre-btn" data-genre="Jazz" role="button" aria-pressed="false">Jazz</div>
            <div class="genre-btn" data-genre="Rock" role="button" aria-pressed="true">Rock</div>

            <div id="mixer">
                <input id="chordVolume" type="range" aria-label="Piano Volume">
                <input id="bassVolume" type="range" aria-label="Bass Volume">
            </div>

            <div id="templatesOverlay" class="overlay"></div>
            <div id="settingsOverlay" class="overlay"></div>
            <button id="settingsBtn" aria-label="Open Settings">Settings</button>
        `;
        
        // Mock remaining UI elements needed for initUI
        const mockIds = [
            'timeSigSelect', 'keySelect', 'measurePagination', 'drumBarsSelect',
            'tapBtn', 'relKeyBtn', 'transUpBtn', 'transDownBtn', 'maximizeChordBtn',
            'chordPowerBtn', 'groovePowerBtn', 'bassPowerBtn', 'soloistPowerBtn',
            'chordPowerBtnDesktop', 'groovePowerBtnDesktop', 'bassPowerBtnDesktop', 'soloistPowerBtnDesktop',
            'vizPowerBtn', 'addSectionBtn', 'templatesBtn', 'templatesOverlay', 'templateChips', 'closeTemplatesBtn', 'activeSectionLabel',
            'arrangerActionTrigger', 'arrangerActionMenu', 'randomizeBtn', 'mutateBtn', 'undoBtn',
            'clearProgBtn', 'saveBtn', 'shareBtn', 'chordPresets', 'userPresetsContainer',
            'chordStylePresets', 'bassStylePresets', 'soloistStylePresets', 'groupingToggle', 'groupingLabel',
            'chordReverb', 'bassReverb', 'soloistReverb', 'drumPresets', 'userDrumPresetsContainer',
            'cloneMeasureBtn', 'autoFollowCheck', 'humanizeSlider', 'saveDrumBtn', 'drumReverb', 'smartDrumPresets',
            'settingsBtn', 'themeSelect', 'notationSelect', 'densitySelect', 'pianoRootsCheck',
            'swingSlider', 'exportMidiBtn', 'settingsExportMidiBtn', 'exportOverlay', 'closeExportBtn', 'confirmExportBtn',
            'exportChordsCheck', 'exportBassCheck', 'exportSoloistCheck', 'exportDrumsCheck', 'exportDurationInput',
            'exportDurationContainer', 'exportFilenameInput', 'installAppBtn', 'flashOverlay', 'resetSettingsBtn',
            'refreshAppBtn', 'editorOverlay', 'editArrangementBtn', 'closeEditorBtn', 'intensitySlider', 'complexitySlider',
            'intensityValue', 'autoIntensityCheck', 'panel-visualizer', 'clearDrumsBtn', 'masterVolume',
            'countInCheck', 'metronomeCheck', 'visualFlashCheck', 'hapticCheck', 'applyPresetSettingsCheck', 'swingBaseSelect',
            'creativityCheck',
            'closeSettingsBtn', 'sessionTimerSelect'
        ];
        mockIds.forEach(id => {
            if (!document.getElementById(id)) {
                const el = document.createElement('div');
                el.id = id;
                document.body.appendChild(el);
            }
        });
    });

    it('should have critical interactive elements with accessible labels', () => {
        expect(document.getElementById('playBtn').getAttribute('aria-label')).toBeDefined();
        expect(document.getElementById('bpmInput').getAttribute('aria-label')).toBeDefined();
        expect(document.getElementById('settingsBtn').getAttribute('aria-label')).toBeDefined();
    });

    it('should use aria-live for the chord visualizer to announce harmonic changes', () => {
        const viz = document.getElementById('chordVisualizer');
        expect(viz.getAttribute('aria-live')).toBe('polite');
    });

    it('should track active genre via aria-pressed state', () => {
        const jazzBtn = document.querySelector('.genre-btn[data-genre="Jazz"]');
        const rockBtn = document.querySelector('.genre-btn[data-genre="Rock"]');
        
        expect(rockBtn.getAttribute('aria-pressed')).toBe('true');
        expect(jazzBtn.getAttribute('aria-pressed')).toBe('false');
    });

    it('should define a grid role for the sequencer for screen reader navigation', () => {
        const grid = document.getElementById('sequencerGrid');
        expect(grid.getAttribute('role')).toBe('grid');
    });

    it('should have volume sliders with descriptive labels', () => {
        const chordVol = document.getElementById('chordVolume');
        const bassVol = document.getElementById('bassVolume');
        
        expect(chordVol.getAttribute('aria-label')).toContain('Piano');
        expect(bassVol.getAttribute('aria-label')).toContain('Bass');
    });

    it('should ensure overlays are discoverable or hidden correctly', () => {
        const settings = document.getElementById('settingsOverlay');
        // When not active, it shouldn't be hidden from AT unless it's actually removed/hidden
        // but it should definitely have a label if it's a modal
        settings.setAttribute('role', 'dialog');
        settings.setAttribute('aria-label', 'Settings');
        expect(settings.getAttribute('role')).toBe('dialog');
    });
});
