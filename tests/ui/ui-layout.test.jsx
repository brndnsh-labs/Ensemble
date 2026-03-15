/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */

import { Fragment, h, render } from 'preact';
import React from 'preact/compat';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatch, getState, storage } from '../../public/state.js';
import { renderChordVisualizer, renderGrid, ui } from '../../public/ui.js';

const { arranger, groove } = getState();

import { Arranger } from '../../public/components/Arranger.jsx';
import { ChordVisualizer } from '../../public/components/ChordVisualizer.jsx';
import { SequencerGrid } from '../../public/components/SequencerGrid.jsx';
import { ACTIONS } from '../../public/types.js';

// Mock dependencies that we don't need for layout testing
vi.mock('../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));
vi.mock('../../public/instrument-controller.js', () => ({
    clearDrumPresetHighlight: vi.fn(),
    saveDrumPreset: vi.fn(),
    togglePower: vi.fn(),
    updateMeasures: vi.fn(),
    cloneMeasure: vi.fn(),
}));
vi.mock('../../public/arranger-controller.js', () => ({
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
            'vizPowerBtn',
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
            'drumPresets',
            'userDrumPresetsContainer',
            'cloneMeasureBtn',
            'autoFollowCheck',
            'humanizeSlider',
            'saveDrumBtn',
            'drumReverb',
            'smartDrumPresets',
            'settingsOverlay',
            'settingsBtn',
            'themeSelect',
            'notationSelect',
            'densitySelect',
            'pianoRootsCheck',
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
            'creativityCheck',
            'visualFlashCheck',
            'hapticCheck',
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

            const sections = document.querySelectorAll('.section-block');
            expect(sections.length).toBe(1);
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
            expect(card.querySelector('.section-delete-btn')).not.toBeNull();
        });
    });

    describe('SequencerGrid Component', () => {
        it('should render the correct number of instruments and steps', async () => {
            groove.instruments = [
                { name: 'Kick', steps: new Array(128).fill(0) },
                { name: 'Snare', steps: new Array(128).fill(0) },
            ];
            groove.measures = 1;
            arranger.timeSignature = '4/4';

            const container = document.getElementById('sequencerGrid');
            render(<SequencerGrid />, container);

            await new Promise((r) => setTimeout(r, 0));

            const rows = document.querySelectorAll('.track:not(.label-row)');
            expect(rows.length).toBe(2);

            const steps = rows[0].querySelectorAll('.step');
            expect(steps.length).toBe(16);
        });

        it('should update step count when measures change', async () => {
            groove.instruments = [{ name: 'Kick', steps: new Array(128).fill(0) }];
            groove.measures = 2;
            arranger.timeSignature = '4/4';

            const container = document.getElementById('sequencerGrid');
            render(<SequencerGrid />, container);

            await new Promise((r) => setTimeout(r, 0));

            const steps = document.querySelectorAll('.step');
            expect(steps.length).toBe(32);
        });

        it('should not leak rows when re-rendering', async () => {
            groove.instruments = [
                { name: 'Kick', steps: new Array(128).fill(0) },
                { name: 'Snare', steps: new Array(128).fill(0) },
            ];
            groove.measures = 1;
            arranger.timeSignature = '4/4';

            const container = document.getElementById('sequencerGrid');
            render(<SequencerGrid />, container);
            await new Promise((r) => setTimeout(r, 0));
            render(<SequencerGrid />, container);
            await new Promise((r) => setTimeout(r, 0));

            const rows = document.querySelectorAll('.track:not(.label-row)');
            expect(rows.length).toBe(2);
        });

        it('should render the correct number of subdivision labels', async () => {
            groove.instruments = [{ name: 'Kick', steps: new Array(128).fill(0) }];
            groove.measures = 1;
            arranger.timeSignature = '4/4';

            const container = document.getElementById('sequencerGrid');
            render(<SequencerGrid />, container);

            await new Promise((r) => setTimeout(r, 0));

            const labelRow = document.querySelector('.label-row');
            expect(labelRow).not.toBeNull();
            const labels = labelRow.querySelectorAll('.steps > div');
            expect(labels.length).toBe(16);
        });
    });
});
