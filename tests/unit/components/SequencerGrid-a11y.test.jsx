/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { h, render } from 'preact';

const { mockDispatch } = vi.hoisted(() => ({
    mockDispatch: vi.fn()
}));

// Mock dependencies
vi.mock('../../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector) => {
        const state = {
            groove: {
                instruments: [
                    { name: 'Kick', steps: new Array(16).fill(0), muted: false, symbol: 'K' }
                ],
                measures: 1,
                gridVersion: 1
            },
            arranger: {
                timeSignature: '4/4'
            },
            playback: {
                isPlaying: false
            }
        };
        // Partially fill some steps for testing
        state.groove.instruments[0].steps[0] = 1; // Active
        state.groove.instruments[0].steps[1] = 2; // Accented

        return selector(state);
    },
    useDispatch: () => mockDispatch
}));

vi.mock('../../../public/state.js', () => {
    const mockState = {
        dispatch: mockDispatch,
        ACTIONS: {
            STEP_TOGGLE: 'STEP_TOGGLE'
        },
        playback: {
            lastPlayingStep: 0,
            audio: { currentTime: 0 }
        }
    };
    return {
        ...mockState,
        getState: () => mockState
    };
});

vi.mock('../../../public/types.js', () => ({
    ACTIONS: {
        STEP_TOGGLE: 'STEP_TOGGLE'
    }
}));

vi.mock('../../../public/utils.js', () => ({
    getStepsPerMeasure: () => 16,
    getStepInfo: (idx) => ({
        isBeatStart: idx % 4 === 0,
        isGroupStart: idx % 16 === 0,
        beatIndex: Math.floor(idx / 4)
    })
}));

vi.mock('../../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { stepsPerBeat: 4 }
    }
}));

vi.mock('../../../public/instrument-controller.js', () => ({
    clearDrumPresetHighlight: vi.fn()
}));

vi.mock('../../../public/engine.js', () => ({
    initAudio: vi.fn(),
    playDrumSound: vi.fn()
}));

import { SequencerGrid } from '../../../public/components/SequencerGrid.jsx';

describe('SequencerGrid Accessibility', () => {
    let container;

    beforeEach(() => {
        vi.clearAllMocks();
        container = document.createElement('div');
        container.id = 'sequencerGrid'; // Important for internal logic looking for ID
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('Step cells should have correct role and tabIndex', () => {
        render(<SequencerGrid />, container);

        const steps = Array.from(container.getElementsByClassName('step'));
        expect(steps.length).toBe(16);

        steps.forEach(step => {
            expect(step.getAttribute('role')).toBe('button');
            expect(step.getAttribute('tabindex')).toBe('0');
        });
    });

    it('Step cells should respond to Enter and Space keys', async () => {
        render(<SequencerGrid />, container);
        const steps = Array.from(container.getElementsByClassName('step'));

        const targetStep = steps[2]; // Initially 0 (inactive)

        // Simulate Enter key
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            bubbles: true,
            cancelable: true
        });
        targetStep.dispatchEvent(enterEvent);

        // Wait for async dispatch
        await vi.waitFor(() => {
            expect(mockDispatch).toHaveBeenCalledWith('STEP_TOGGLE');
        });
    });

    it('Space key should prevent default scrolling', async () => {
        render(<SequencerGrid />, container);
        const steps = Array.from(container.getElementsByClassName('step'));
        const targetStep = steps[3];

        const event = new KeyboardEvent('keydown', {
            key: ' ',
            code: 'Space',
            bubbles: true,
            cancelable: true
        });
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

        targetStep.dispatchEvent(event);

        expect(preventDefaultSpy).toHaveBeenCalled();

        await vi.waitFor(() => {
            expect(mockDispatch).toHaveBeenCalledWith('STEP_TOGGLE');
        });
    });

    it('Track symbol should be keyboard accessible for auditioning', async () => {
        const { initAudio, playDrumSound } = await import('../../../public/engine.js');

        render(<SequencerGrid />, container);
        const trackSymbol = container.querySelector('.track-symbol');

        expect(trackSymbol).not.toBeNull();
        expect(trackSymbol.getAttribute('role')).toBe('button');
        expect(trackSymbol.getAttribute('tabindex')).toBe('0');
        expect(trackSymbol.getAttribute('aria-label')).toBe('Audition Kick');

        // Simulate Enter key
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            bubbles: true,
            cancelable: true
        });
        trackSymbol.dispatchEvent(enterEvent);

        await vi.waitFor(() => {
            expect(initAudio).toHaveBeenCalled();
            expect(playDrumSound).toHaveBeenCalledWith('Kick', expect.any(Number), 1.0);
        });
    });
});
