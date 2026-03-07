import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../../public/config.js';
import { applyGrooveOverrides } from '../../../public/engine/groove-engine.js';
import { getState } from '../../../public/state.js';

vi.mock('../../../public/state.js', () => {
    const mockState = {
        soloist: { enabled: false, busySteps: 0 },
        chords: { enabled: false },
        bass: { enabled: false },
        harmony: { enabled: false },
        playback: { bandIntensity: 0.5, bpm: 120, complexity: 0.5, isPlaying: true },
        arranger: {
            key: 'C',
            isMinor: false,
            progression: [],
            totalSteps: 64,
            stepMap: [],
            sectionMap: [],
            timeSignature: '4/4',
        },
        groove: {
            genreFeel: 'Rock',
            enabled: true,
            creativity: true,
            instruments: [
                { name: 'Kick', muted: false, steps: new Array(128).fill(0) },
                { name: 'Snare', muted: false, steps: new Array(128).fill(0) },
                { name: 'HiHat', muted: false, steps: new Array(128).fill(0) },
            ],
            measures: 1,
            lastDrumPreset: 'Basic Rock',
            sectionSeedMap: {},
        },
        vizState: { enabled: false },
        midi: {},
        storage: {},
        dispatch: vi.fn(),
    };
    return {
        getState: () => mockState,
        resetMockState: (newState) => {
            Object.assign(mockState, newState);
        },
    };
});

describe('Turnaround Logic & Section Mapping', () => {
    it('should fallback to 4-bar turnaround when sectionMap is empty', () => {
        const state = getState();
        state.arranger.sectionMap = [];
        const spm = 16;

        // Start of Bar 5 (step 64) - should have a crash because Bar 4 (48-63) was turnaround
        const result = applyGrooveOverrides({
            step: 64,
            inst: { name: 'Kick', muted: false, steps: [] },
            stepVal: 0,
            playback: state.playback,
            groove: state.groove,
            isDownbeat: true,
            isBeatStart: true,
            isBackbeat: false,
            isGroupStart: true,
            beatIndex: 0,
            isOffbeat: false,
            isEOfBeat: false,
            isAOfBeat: false,
            stepsPerBar: spm,
            loopStep: 0,
        });

        expect(result.shouldPlay).toBe(true);
        expect(result.velocity).toBeGreaterThan(1.3);
    });

    it('should suppress turnarounds for 1-measure sections to avoid clutter', () => {
        const state = getState();
        state.arranger.sectionMap = [
            { id: 's1', start: 0, end: 16, label: 'Intro' }, // 1 bar
            { id: 's2', start: 16, end: 80, label: 'Verse' }, // 4 bars
        ];
        const spm = 16;

        // Start of Bar 2 (step 16) - should NOT have a crash because Bar 1 was too short for a fill
        const result = applyGrooveOverrides({
            step: 16,
            inst: { name: 'Kick', muted: false, steps: [] },
            stepVal: 0,
            playback: state.playback,
            groove: state.groove,
            isDownbeat: true,
            isBeatStart: true,
            isBackbeat: false,
            isGroupStart: true,
            beatIndex: 0,
            isOffbeat: false,
            isEOfBeat: false,
            isAOfBeat: false,
            stepsPerBar: spm,
            loopStep: 0,
        });
        // shouldPlay will be true because it's a downbeat, but it should NOT be the high-velocity turnaround crash (1.35)
        expect(result.velocity).toBeLessThan(1.3);
    });

    it('should handle turnarounds correctly in odd meters (3/4)', () => {
        const state = getState();
        state.arranger.timeSignature = '3/4';
        state.arranger.sectionMap = [{ id: 's1', start: 0, end: 36, label: 'Verse' }]; // 3 bars of 3/4
        const spm = 12;

        // Bar 4 (step 36) - should have a crash because Bar 3 was the turnaround
        const result = applyGrooveOverrides({
            step: 36,
            inst: { name: 'Kick', muted: false, steps: [] },
            stepVal: 0,
            playback: state.playback,
            groove: state.groove,
            isDownbeat: true,
            isBeatStart: true,
            isBackbeat: false,
            isGroupStart: true,
            beatIndex: 0,
            isOffbeat: false,
            isEOfBeat: false,
            isAOfBeat: false,
            stepsPerBar: spm,
            loopStep: 0,
        });
        expect(result.shouldPlay).toBe(true);
        expect(result.velocity).toBeGreaterThan(1.3);
    });
});
