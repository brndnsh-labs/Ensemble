/**
 * @vitest-environment happy-dom
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const { mockDispatch, mockUseEnsembleState } = vi.hoisted(() => ({
    mockDispatch: vi.fn(),
    mockUseEnsembleState: vi.fn(),
}));

vi.mock('../../../public/ui-bridge.js', () => ({
    useDispatch: () => mockDispatch,
    useEnsembleState: (selector) => mockUseEnsembleState(selector),
}));

vi.mock('../../../public/ui.js', () => ({
    showToast: vi.fn(),
}));

vi.mock('../../../public/history.js', () => ({
    pushHistory: vi.fn(),
}));

vi.mock('../../../public/arranger-controller.js', () => ({
    refreshArrangerUI: vi.fn(),
}));

vi.mock('../../../public/audio-analyzer-lite.js', () => ({
    // biome-ignore lint/complexity/useArrowFunction: Must be a function for constructor use
    ChordAnalyzerLite: vi.fn().mockImplementation(function () {
        return {
            calculateChromagram: vi.fn(),
            identifyChord: vi.fn(),
            identifySimpleKey: vi.fn(),
            identifyPulse: vi.fn().mockResolvedValue({ bpm: 120 }),
            analyze: vi.fn().mockResolvedValue({ chords: [], pulse: { bpm: 120 } }),
            init: vi.fn().mockResolvedValue(undefined),
            stop: vi.fn(),
            close: vi.fn(),
        };
    }),
}));

vi.mock('../../../public/melody-harmonizer.js', () => ({
    // biome-ignore lint/complexity/useArrowFunction: Must be a function for constructor use
    Harmonizer: vi.fn().mockImplementation(function () {
        return {
            generateOptions: vi.fn().mockReturnValue([]),
        };
    }),
}));

vi.mock('../../../public/form-extractor.js', () => ({
    extractForm: vi.fn().mockReturnValue([]),
}));

// Mock AudioContext and MediaDevices
const mockAudioContext = {
    createMediaStreamSource: vi.fn().mockReturnValue({
        connect: vi.fn(),
    }),
    createScriptProcessor: vi.fn().mockReturnValue({
        connect: vi.fn(),
        onaudioprocess: null,
    }),
    close: vi.fn().mockResolvedValue(undefined),
    sampleRate: 44100,
    destination: {},
};

// Use a function to correctly mock a constructor
// biome-ignore lint/complexity/useArrowFunction: Must be a function for constructor use
const AudioContextMock = vi.fn().mockImplementation(function () {
    return mockAudioContext;
});
global.AudioContext = AudioContextMock;
global.window.AudioContext = AudioContextMock;
global.window.webkitAudioContext = AudioContextMock;

vi.stubGlobal('navigator', {
    mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
            getTracks: () => [{ stop: vi.fn() }],
        }),
    },
});

import { AnalyzerModal } from '../../../public/components/AnalyzerModal.jsx';

describe('AnalyzerModal Component', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.removeChild(container);
        vi.restoreAllMocks();
    });

    const setupOpenState = (overrides = {}) => {
        mockUseEnsembleState.mockImplementation((selector) => {
            const state = {
                playback: {
                    modals: { analyzer: true },
                    bandIntensity: 0.5,
                    sessionTimer: 0,
                    sessionStartTime: 0,
                },
                arranger: {
                    sections: [{ id: 's1', progression: 'C' }],
                    key: 'C',
                },
                ...overrides,
            };
            return selector(state);
        });
    };

    it('should render the idle view initially when open', () => {
        setupOpenState();

        act(() => {
            render(<AnalyzerModal />, container);
        });

        expect(container.textContent).toContain('Audio Chord Analyzer');
        expect(container.querySelector('#analyzerDropZone')).not.toBeNull();
        expect(container.querySelector('#liveListenBtn')).not.toBeNull();
    });

    it('should transition to live listen view when clicking the button', async () => {
        setupOpenState();

        act(() => {
            render(<AnalyzerModal />, container);
        });

        const liveBtn = container.querySelector('#liveListenBtn');

        await act(async () => {
            liveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        // Wait for potential async microtasks and view transition
        // Using a poll loop for better reliability in full test runs
        let display = null;
        for (let i = 0; i < 10; i++) {
            await act(async () => {
                await new Promise((r) => setTimeout(r, 20));
            });
            display = container.querySelector('#liveChordDisplay');
            if (display) {
                break;
            }
        }

        expect(display).not.toBeNull();
    });

    it('should dispatch close action when clicking the close button', () => {
        setupOpenState();

        act(() => {
            render(<AnalyzerModal />, container);
        });

        const closeBtn = container.querySelector('#closeAnalyzerBtn');
        act(() => {
            closeBtn.click();
        });

        expect(mockDispatch).toHaveBeenCalledWith('SET_MODAL_OPEN', {
            modal: 'analyzer',
            open: false,
        });
    });

    it('should toggle between Chords and Melody modes', async () => {
        setupOpenState();

        act(() => {
            render(<AnalyzerModal />, container);
        });

        const melodyModeRadio = container.querySelectorAll('input[name="analyzerMode"]')[1];

        await act(async () => {
            melodyModeRadio.click();
            melodyModeRadio.dispatchEvent(new Event('change', { bubbles: true }));
        });

        expect(container.textContent).toContain('Melody Harmonizer');
    });
});
