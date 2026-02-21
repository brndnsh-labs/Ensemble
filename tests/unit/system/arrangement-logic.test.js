/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock State
vi.mock('../../../public/state.js', () => {
    const mockState = {
        chords: { enabled: true, octave: 60 },
        harmony: {
            enabled: false,
            style: 'smart',
            octave: 60,
            volume: 0.4,
            complexity: 0.5,
            buffer: new Map(),
        },
        arranger: {
            key: 'C',
            isMinor: false,
            progression: [],
            totalSteps: 0,
            stepMap: [],
            timeSignature: '4/4',
        },
        groove: { enabled: true, genreFeel: 'Rock' },
        bass: { enabled: false },
        soloist: { enabled: false },
        playback: { isPlaying: false, bandIntensity: 0.5, complexity: 0.3 },
        dispatch: vi.fn(),
        midi: {},
        vizState: {},
    };
    return { ...mockState, getState: () => mockState };
});

// Mock Config
vi.mock('../../../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    ROMAN_VALS: { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 },
    NNS_OFFSETS: [0, 2, 4, 5, 7, 9, 11],
    INTERVAL_TO_NNS: { 0: '1', 7: '5' },
    INTERVAL_TO_ROMAN: { 0: 'I', 7: 'V' },
    ENHARMONIC_MAP: {},
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' },
        '3/4': { beats: 3, stepsPerBeat: 4, subdivision: '16th' },
    },
}));

// Mock UI & Controller Dependencies
vi.mock('../../../public/ui.js', () => ({
    ui: {
        keySelect: { value: 'C' },
        sectionList: { innerHTML: '' },
    },
    renderSections: vi.fn(),
    renderChordVisualizer: vi.fn(),
    showToast: vi.fn(),
    updateKeySelectLabels: vi.fn(),
    updateRelKeyButton: vi.fn(),
}));

vi.mock('../../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../../public/instrument-controller.js', () => ({ flushBuffers: vi.fn() }));
vi.mock('../../../public/engine/engine.js', () => ({ restoreGains: vi.fn() }));
vi.mock('../../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
    debounceSaveState: vi.fn(),
}));
vi.mock('../../../public/history.js', () => ({ pushHistory: vi.fn() }));

import { addSection, onSectionUpdate } from '../../../public/arranger-controller.js';
import { validateProgression } from '../../../public/chords.js';
import { analyzeForm, getSectionEnergy } from '../../../public/form-analysis.js';
import { getState } from '../../../public/state.js';

const { arranger } = getState();

describe('Arrangement Logic & Mixed Meter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        arranger.sections = [];
        arranger.progression = [];
        arranger.stepMap = [];
        arranger.measureMap = [];
        arranger.totalSteps = 0;
        arranger.isDirty = false;
        arranger.timeSignature = '4/4';
        arranger.key = 'C';
    });

    describe('Section Energy & Analysis', () => {
        it('should return correct energy levels for labels', () => {
            expect(getSectionEnergy('Chorus')).toBe(0.9);
            expect(getSectionEnergy('Intro')).toBe(0.4);
            expect(getSectionEnergy('Verse')).toBe(0.5);
        });

        it('should identify structural roles in analyzeForm', () => {
            const section1Id = 's1';
            const introSteps = Array.from({ length: 16 }, (_, i) => ({
                chord: { sectionId: section1Id, sectionLabel: 'Intro', value: 'I', rootMidi: 60 },
                start: i,
                end: i + 1,
            }));
            arranger.stepMap = introSteps;
            const form = analyzeForm();
            expect(form.sections[0].role).toBe('Intro');
        });
    });

    describe('Section Repeats (x2, x3)', () => {
        it('should correctly flatten sections with repeat > 1', () => {
            arranger.sections = [{ id: 's1', label: 'Intro', value: 'C | G', repeat: 2 }];

            validateProgression();

            // C | G is 2 chords. Repeat 2x should be 4 chords.
            expect(arranger.progression).toHaveLength(4);
            expect(arranger.progression[0].repeatIndex).toBe(0);
            expect(arranger.progression[2].repeatIndex).toBe(1);
            expect(arranger.progression[0].absName).toBe('C');
            expect(arranger.progression[2].absName).toBe('C');
        });
    });

    describe('Mixed Meter (Per-Section Time Signatures)', () => {
        it('should calculate correct total steps for mixed meters', () => {
            arranger.sections = [
                { id: 's1', label: 'Part 1', value: 'C', timeSignature: '3/4' }, // 12 steps
                { id: 's2', label: 'Part 2', value: 'G', timeSignature: '4/4' }, // 16 steps
            ];

            validateProgression();

            // 12 + 16 = 28 total steps
            expect(arranger.totalSteps).toBe(28);
        });

        it('should build a correct measureMap for mixed meters', () => {
            arranger.sections = [
                { id: 's1', label: 'Part 1', value: 'C', timeSignature: '3/4' },
                { id: 's2', label: 'Part 2', value: 'G', timeSignature: '4/4' },
            ];

            validateProgression();

            expect(arranger.measureMap).toHaveLength(2);
            expect(arranger.measureMap[0]).toEqual({ start: 0, end: 12, ts: '3/4' });
            expect(arranger.measureMap[1]).toEqual({ start: 12, end: 28, ts: '4/4' });
        });

        it('should handle repeats within mixed meters correctly', () => {
            arranger.sections = [
                { id: 's1', label: 'Loop', value: 'C', timeSignature: '3/4', repeat: 2 },
            ];

            validateProgression();

            expect(arranger.totalSteps).toBe(24);
            expect(arranger.measureMap).toHaveLength(2);
            expect(arranger.measureMap[1].start).toBe(12);
        });
    });

    describe('Per-Section Key Changes', () => {
        it('should respect local keys for chord parsing', () => {
            arranger.key = 'C';
            arranger.sections = [
                { id: 's1', label: 'C Part', value: 'I', key: 'C' },
                { id: 's2', label: 'G Part', value: 'I', key: 'G' },
            ];

            validateProgression();

            // Section 1: I in C -> C
            // Section 2: I in G -> G
            expect(arranger.progression[0].absName).toBe('C');
            expect(arranger.progression[1].absName).toBe('G');
        });
    });

    describe('isDirty Flag Tracking', () => {
        it('should set isDirty to true when a section is added', () => {
            arranger.isDirty = false;
            addSection();
            expect(arranger.isDirty).toBe(true);
        });

        it('should set isDirty to true when a section is updated', () => {
            arranger.sections = [{ id: 's1', label: 'V', value: 'I' }];
            arranger.isDirty = false;
            onSectionUpdate('s1', 'value', 'IV');
            expect(arranger.isDirty).toBe(true);
        });
    });
});
