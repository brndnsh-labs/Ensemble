// @ts-nocheck
/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import React from 'preact/compat';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatch, getState } from '../../public/state.js';

const { arranger } = getState();

import { Arranger } from '../../public/components/Arranger.jsx';
import { ChordVisualizer } from '../../public/components/ChordVisualizer.jsx';

// Mock dependencies that we don't need for layout testing
vi.mock('../../public/state/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));
vi.mock('../../public/controllers/instrument-controller.js', () => ({
    togglePower: vi.fn(),
}));
vi.mock('../../public/controllers/arranger-controller.js', () => ({
    onSectionUpdate: vi.fn(),
    onSectionDelete: vi.fn(),
    onSectionDuplicate: vi.fn(),
    saveProgression: vi.fn(),
    addSection: vi.fn(),
    refreshArrangerUI: vi.fn(),
    clearChordPresetHighlight: vi.fn(),
    validateAndAnalyze: vi.fn(),
}));

describe('UI Layout Integrity', () => {
    beforeEach(() => {
        // Polyfill requestAnimationFrame for Preact hooks in happy-dom
        global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
        global.cancelAnimationFrame = (id) => clearTimeout(id);

        // Setup a minimal DOM for initUI to bind to
        document.body.innerHTML = `
            <div id="sectionList"></div>
            <div id="sequencerGrid"></div>
            <div id="playBtn"></div>
            <div id="bpmInput"></div>
            <div id="timeSigSelect"></div>
            <select id="keySelect"></select>
            <div id="chordVisualizer"></div>
            <div id="measurePagination"></div>
            <div id="drumBarsSelect"></div>
        `;

        // ... (mockIds setup)
        const mockIds = [
            'tapBtn',
            'relKeyBtn',
            'transUpBtn',
            'transDownBtn',
            'maximizeChordBtn',
            'chordPowerBtn',
            'groovePowerBtn',
            'bassPowerBtn',
            'soloistPowerBtn',
            'chordPowerBtnDesktop',
            'groovePowerBtnDesktop',
            'bassPowerBtnDesktop',
            'soloistPowerBtnDesktop',
            'addSectionBtn',
            'inspirationHubBtn',
            'activeSectionLabel',
            'arrangerActionTrigger',
            'arrangerActionMenu',
            'mutateBtn',
            'undoBtn',
            'clearProgBtn',
            'saveBtn',
            'shareHubBtn',
            'chordPresets',
            'userPresetsContainer',
            'chordStylePresets',
            'bassStylePresets',
            'soloistStylePresets',
            'groupingToggle',
            'groupingLabel',
            'chordReverb',
            'bassReverb',
            'soloistReverb',
            'humanizeSlider',
            'drumReverb',
            'settingsOverlay',
            'settingsBtn',
            'themeSelect',
            'notationSelect',
            'densitySelect',
            'swingSlider',
            'shareHubBtn',
            'settingsShareHubBtn',
            'shareOverlay',
            'closeShareBtn',
            'confirmExportBtn',
            'exportChordsCheck',
            'exportBassCheck',
            'exportSoloistCheck',
            'exportDrumsCheck',
            'exportDurationInput',
            'exportDurationContainer',
            'exportFilenameInput',
            'installAppBtn',
            'flashOverlay',
            'resetSettingsBtn',
            'refreshAppBtn',
            'editorOverlay',
            'editArrangementBtn',
            'closeEditorBtn',
            'intensitySlider',
            'complexitySlider',
            'intensityValue',
            'autoIntensityCheck',
            'panel-visualizer',
            'chordVolume',
            'bassVolume',
            'soloistVolume',
            'drumVolume',
            'clearDrumsBtn',
            'masterVolume',
            'countInCheck',
            'metronomeCheck',
            'visualFlashCheck',
            'applyPresetSettingsCheck',
            'swingBaseSelect',
            'closeSettingsBtn',
            'sessionTimerSelect',
            'sessionTimerDurationContainer',
            'sessionTimerStepper',
            'sessionTimerDec',
            'sessionTimerInc',
            'sessionTimerInput',
        ];

        mockIds.forEach((id) => {
            if (!document.getElementById(id)) {
                const el = document.createElement('div');
                el.id = id;
                document.body.appendChild(el);
            }
        });
    });

    describe('ChordVisualizer Component', () => {
        it('should render correct number of chords and measures', async () => {
            arranger.timeSignature = '4/4';
            arranger.progression = [
                {
                    sectionId: 's1',
                    sectionLabel: 'Intro',
                    beats: 4,
                    display: { roman: { root: 'I', suffix: '' } },
                },
                {
                    sectionId: 's1',
                    sectionLabel: 'Intro',
                    beats: 4,
                    display: { roman: { root: 'V', suffix: '' } },
                },
            ];

            const container = document.getElementById('chordVisualizer');
            render(<ChordVisualizer />, container);

            await new Promise((r) => setTimeout(r, 0));

            const cards = document.querySelectorAll('.chord-card');
            expect(cards.length).toBe(2);

            const measures = document.querySelectorAll('.measure-box');
            expect(measures.length).toBe(2);

            const rows = document.querySelectorAll('.lead-sheet-row');
            expect(rows.length).toBe(1);
        });

        it('should handle multi-chord measures correctly', async () => {
            arranger.timeSignature = '4/4';
            arranger.progression = [
                {
                    sectionId: 's1',
                    sectionLabel: 'A',
                    beats: 2,
                    display: { roman: { root: 'I', suffix: '' } },
                },
                {
                    sectionId: 's1',
                    sectionLabel: 'A',
                    beats: 2,
                    display: { roman: { root: 'IV', suffix: '' } },
                },
            ];

            const container = document.getElementById('chordVisualizer');
            render(<ChordVisualizer />, container);

            await new Promise((r) => setTimeout(r, 0));

            const measures = document.querySelectorAll('.measure-box');
            expect(measures.length).toBe(1);

            const cards = measures[0].querySelectorAll('.chord-card');
            expect(cards.length).toBe(2);
        });
    });

    describe('Arranger Component', () => {
        it('should render the correct number of section cards', async () => {
            arranger.sections = [
                { id: '1', label: 'A', value: 'I' },
                { id: '2', label: 'B', value: 'IV' },
            ];

            const container = document.getElementById('sectionList');
            render(<Arranger />, container);

            await new Promise((r) => setTimeout(r, 0));

            const cards = document.querySelectorAll('.section-card');
            expect(cards.length).toBe(2);
        });

        it('should sync when sections change in state', async () => {
            arranger.sections = [{ id: '1', label: 'A', value: 'I' }];
            const container = document.getElementById('sectionList');
            render(<Arranger />, container);

            await new Promise((r) => setTimeout(r, 0));
            expect(document.querySelectorAll('.section-card').length).toBe(1);

            arranger.sections = [
                { id: '1', label: 'A', value: 'I' },
                { id: '2', label: 'B', value: 'IV' },
            ];
            dispatch('DUMMY_ACTION');

            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(document.querySelectorAll('.section-card').length).toBe(2);
        });

        it('should include correct sub-elements in each section card', async () => {
            arranger.sections = [{ id: '1', label: 'Verse', value: 'I' }];
            const container = document.getElementById('sectionList');
            render(<Arranger />, container);

            await new Promise((r) => setTimeout(r, 0));

            const card = document.querySelector('.section-card');
            expect(card.querySelector('.section-label-input')).not.toBeNull();
            expect(card.querySelector('.section-prog-input')).not.toBeNull();
            // Delete moved into the section-actions kebab menu — verify the
            // kebab itself is present.
            expect(card.querySelector('.section-kebab-btn')).not.toBeNull();
        });
    });
});
