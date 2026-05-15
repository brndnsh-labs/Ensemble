// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkSectionTransition } from '../../public/engine/conductor.js';
import { getState } from '../../public/state.js';

// Mock State
vi.mock('../../public/state.js', () => {
    const mockState = {
        playback: {
            bandIntensity: 0.5,
            autoIntensity: false,
            isPlaying: true,
            sessionTimer: 0,
        },
        arranger: {
            totalSteps: 128,
            sections: [
                { id: 's1', label: 'A' },
                { id: 's2', label: 'B' },
                { id: 's3', label: 'A' },
            ],
            stepMap: [
                { start: 0, end: 32, chord: { sectionId: 's1', sectionLabel: 'A' } },
                { start: 32, end: 64, chord: { sectionId: 's2', sectionLabel: 'B' } },
                { start: 64, end: 96, chord: { sectionId: 's3', sectionLabel: 'A' } },
            ],
        },
        soloist: {
            enabled: true,
            tradeMode: 'sections',
            activeTab: 'smart',
            isResting: false,
            currentPhraseSteps: 10,
            srdcState: 'Statement',
        },
        groove: { enabled: true, genreFeel: 'Jazz' },
        conductor: {
            targetIntensity: 0.35,
            stepSize: 0.0005,
            form: null,
            loopCount: 0,
            formIteration: 0,
        },
        dispatch: vi.fn((action, payload) => {
            if (action === 'SET_PARAM') {
                if (payload.module && payload.param && mockState[payload.module]) {
                    mockState[payload.module][payload.param] = payload.value;
                }
            } else if (action === 'UPDATE_SB') {
                Object.assign(mockState.soloist, payload);
            }
        }),
    };
    return {
        stateMap: mockState,
        getState: () => mockState,
        dispatch: mockState.dispatch,
    };
});

// Mock dependencies
vi.mock('../../public/persistence.js', () => ({
    debounceSaveState: vi.fn(),
    saveCurrentState: vi.fn(),
}));
vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn(), flushWorker: vi.fn() }));
vi.mock('../../public/engine/fills.js', () => ({ generateProceduralFill: vi.fn(() => ({})) }));
vi.mock('../../public/ui.js', () => ({ triggerFlash: vi.fn() }));
vi.mock('../../public/form-analysis.js', () => ({ getSectionEnergy: vi.fn(() => 0.5) }));

describe('Soloist Trading Logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const state = getState();
        state.soloist.enabled = true;
        state.soloist.tradeMode = 'sections';
    });

    it('should toggle soloist OFF at the first transition', () => {
        const stepsPerMeasure = 16;
        // Step 31 is the last step of the first measure of the first section?
        // No, checkSectionTransition triggers at the START of a measure if it LEADS into a transition.

        // Transition from s1 to s2 happens at step 32.
        // So at step 16 (start of measure 2), we check measureEnd (32).
        // measureEnd - 1 = 31. Step 31 is in s1.
        // measureEnd = 32. Step 32 is in s2.
        // s1 !== s2 -> TRIGGER.

        checkSectionTransition(getState(), 16, stepsPerMeasure, getState().dispatch);

        expect(getState().soloist.enabled).toBe(false);
    });

    it('should trade across 3 sections correctly', () => {
        const state = getState();
        const stepsPerMeasure = 16;

        state.arranger.totalSteps = 96; // 3 sections of 32 steps
        state.arranger.stepMap = [
            { start: 0, end: 32, chord: { sectionId: 's1', sectionLabel: 'A' } },
            { start: 32, end: 64, chord: { sectionId: 's2', sectionLabel: 'B' } },
            { start: 64, end: 96, chord: { sectionId: 's3', sectionLabel: 'C' } },
        ];

        // Transition 1: A -> B (at step 16 triggers for end at 32)
        checkSectionTransition(state, 16, stepsPerMeasure, state.dispatch);
        expect(state.soloist.enabled).toBe(false);
        expect(state.soloist.isYielding).toBe(true);

        // Transition 2: B -> C (at step 48 triggers for end at 64)
        checkSectionTransition(state, 48, stepsPerMeasure, state.dispatch);
        expect(state.soloist.enabled).toBe(true);
        expect(state.soloist.isYielding).toBe(false);
        expect(state.soloist.isWaitingForEntry).toBe(true);

        // Transition 3: C -> A (at step 80 triggers for end at 96)
        checkSectionTransition(state, 80, stepsPerMeasure, state.dispatch);
        expect(state.soloist.enabled).toBe(false);
        expect(state.soloist.isYielding).toBe(true);
    });
});
