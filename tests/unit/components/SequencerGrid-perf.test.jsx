/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDispatch } = vi.hoisted(() => ({
    mockDispatch: vi.fn(),
}));

// Mock dependencies
vi.mock('../../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector) => {
        const state = {
            groove: {
                instruments: [
                    { name: 'Kick', steps: new Array(16).fill(0), muted: false, symbol: 'K' },
                ],
                measures: 1,
                gridVersion: 1,
            },
            arranger: {
                timeSignature: '4/4',
            },
            playback: {
                isPlaying: false,
            },
        };
        return selector(state);
    },
    useDispatch: () => mockDispatch,
}));

vi.mock('../../../public/state.js', () => {
    const mockState = {
        dispatch: mockDispatch,
        ACTIONS: {
            STEP_TOGGLE: 'STEP_TOGGLE',
        },
        playback: {
            lastPlayingStep: 0,
            audio: { currentTime: 0 },
        },
        groove: {
            instruments: [
                { name: 'Kick', steps: new Array(16).fill(0), muted: false, symbol: 'K' },
            ],
            measures: 1,
            gridVersion: 1,
        },
    };

    return {
        ...mockState,
        stateMap: mockState,
        getState: () => mockState,
    };
});

vi.mock('../../../public/types.js', () => ({
    ACTIONS: {
        STEP_TOGGLE: 'STEP_TOGGLE',
    },
}));

vi.mock('../../../public/utils.js', () => ({
    getStepsPerMeasure: () => 16,
    getStepInfo: (idx) => ({
        isBeatStart: idx % 4 === 0,
        isGroupStart: idx % 16 === 0,
        beatIndex: Math.floor(idx / 4),
    }),
}));

vi.mock('../../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { stepsPerBeat: 4 },
    },
}));

vi.mock('../../../public/instrument-controller.js', () => ({
    clearDrumPresetHighlight: vi.fn(),
}));

vi.mock('../../../public/engine/engine.js', () => ({
    initAudio: vi.fn(),
    playDrumSound: vi.fn(),
}));

import { SequencerGrid } from '../../../public/components/SequencerGrid.jsx';

describe('SequencerGrid Drag Interaction', () => {
    let container;

    beforeEach(() => {
        vi.clearAllMocks();
        container = document.createElement('div');
        container.id = 'sequencerGrid';
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('Dragging across steps should trigger toggle for each step', async () => {
        render(<SequencerGrid />, container);
        const steps = Array.from(container.getElementsByClassName('step'));
        expect(steps.length).toBe(16);

        const step0 = steps[0];
        const step1 = steps[1];

        // 1. Mousedown on Step 0 (activates drag, sets type=1)
        step0.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

        await vi.waitFor(() => {
            expect(mockDispatch).toHaveBeenCalledTimes(1);
            expect(mockDispatch).toHaveBeenCalledWith('STEP_TOGGLE');
        });

        // 2. Mouseover on Step 1 (should toggle because dragging is active)
        step1.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

        await vi.waitFor(() => {
            expect(mockDispatch).toHaveBeenCalledTimes(2);
        });
    });

    it('Mouseover without drag should NOT trigger toggle', async () => {
        render(<SequencerGrid />, container);
        const steps = Array.from(container.getElementsByClassName('step'));
        const step2 = steps[2];

        // 1. Mouseover (no mousedown first)
        step2.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

        // Check immediately and wait a bit to ensure nothing happens
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(mockDispatch).not.toHaveBeenCalled();
    });
});
