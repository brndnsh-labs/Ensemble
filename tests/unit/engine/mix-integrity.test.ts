// @ts-nocheck
/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Mock state and global modules
vi.mock('../../../public/state.js', () => {
    const mockPlayback = {
        audio: null,
        audioGraph: null,
        masterVolume: 0.5,
        isPlaying: false,
    };
    const mockChords = { volume: 1.0, enabled: true, reverb: 0.2 };
    const mockBass = { volume: 1.0, enabled: true, reverb: 0.05 };
    const mockSoloist = makeSoloistMock({ volume: 1.0, enabled: true, reverb: 0.6 });
    const mockHarmony = { volume: 1.0, enabled: true, reverb: 0.4 };
    const mockGroove = { volume: 1.0, enabled: true, reverb: 0.2, audioBuffers: { noise: {} } };
    const mockMidi = { enabled: false, muteLocal: false };
    const mockArranger = {};
    const mockVizState = {};
    const mockConductor = {
        targetIntensity: 0.35,
        stepSize: 0.0005,
        form: null,
        loopCount: 0,
        formIteration: 0,
    };

    const mockStateMap = {
        playback: mockPlayback,
        chords: mockChords,
        bass: mockBass,
        soloist: mockSoloist,
        harmony: mockHarmony,
        groove: mockGroove,
        midi: mockMidi,
        arranger: mockArranger,
        vizState: mockVizState,
        conductor: mockConductor,
    };

    return {
        ...mockStateMap,
        stateMap: mockStateMap,
        getState: () => mockStateMap,
        dispatch: vi.fn(),
    };
});

// Mock UI
vi.mock('../../../public/ui.js', () => ({
    ui: {
        masterVol: { value: '0.5' },
    },
}));

// Mock Config
vi.mock('../../../public/config.js', () => ({
    MIXER_GAIN_MULTIPLIERS: {
        master: 0.85,
        chords: 0.13,
        bass: 0.1575,
        soloist: 0.15,
        harmonies: 0.1,
        drums: 0.26,
    },
    TIME_SIGNATURES: {},
}));

// Mock Utils
vi.mock('../../../public/utils.js', () => ({
    safeDisconnect: vi.fn(),
    createSoftClipCurve: vi.fn(() => new Float32Array(1024)),
}));

import { initAudio, restoreGains } from '../../../public/engine/engine.js';
import { getState } from '../../../public/state.js';

const { playback } = getState();

describe('Mix & Signal Integrity Audit', () => {
    function createMockNode() {
        return {
            connect: vi.fn(),
            disconnect: vi.fn(),
            gain: {
                value: 1,
                setValueAtTime: vi.fn(),
                setTargetAtTime: vi.fn(),
                exponentialRampToValueAtTime: vi.fn(),
                cancelScheduledValues: vi.fn(),
            },
            threshold: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            knee: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            ratio: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            attack: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            release: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            frequency: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            delayTime: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            Q: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            type: '',
            reduction: { value: 0 },
            start: vi.fn(),
            stop: vi.fn(),
        };
    }

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup Global Audio Mock as a proper constructor function
        const MockAudioContext = vi.fn().mockImplementation(function () {
            this.state = 'running';
            this.onstatechange = null;
            this.currentTime = 0;
            this.sampleRate = 44100;
            this.createGain = vi.fn().mockImplementation(createMockNode);
            this.createStereoPanner = vi.fn().mockImplementation(() => ({
                connect: vi.fn(),
                pan: { value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() },
            }));
            this.createWaveShaper = vi.fn().mockImplementation(createMockNode);
            this.createDynamicsCompressor = vi.fn().mockImplementation(createMockNode);
            this.createConvolver = vi.fn().mockImplementation(createMockNode);
            this.createDelay = vi.fn().mockImplementation(createMockNode);
            this.createOscillator = vi.fn().mockImplementation(createMockNode);
            this.createBiquadFilter = vi.fn().mockImplementation(createMockNode);
            this.createBuffer = vi.fn(() => ({
                getChannelData: vi.fn(() => new Float32Array(1024)),
            }));
            this.resume = vi.fn().mockResolvedValue();
            this.destination = {};
        });

        global.window.AudioContext = MockAudioContext;
        global.window.webkitAudioContext = MockAudioContext;
        playback.audio = null;

        // Mock DOM element for master volume
        const masterVolInput = document.createElement('input');
        masterVolInput.id = 'masterVolume';
        masterVolInput.value = '0.5';
        document.body.appendChild(masterVolInput);
    });

    it('should correctly assemble the master chain (Gain -> Saturator -> Limiter -> Dest)', () => {
        initAudio(getState());

        // Verify Master Chain Connections
        const { master } = playback.audioGraph;
        expect(master.gain.connect).toHaveBeenCalledWith(master.saturator);
        expect(master.saturator.connect).toHaveBeenCalledWith(master.limiter);
        expect(master.limiter.connect).toHaveBeenCalledWith(playback.audio.destination);
    });

    it('should apply safety limiter settings to prevent hard clipping', () => {
        initAudio(getState());

        // Threshold should be below 0dB to allow for saturator peaks
        const { limiter } = playback.audioGraph.master;
        expect(limiter.threshold.setValueAtTime).toHaveBeenCalledWith(expect.any(Number), 0);
        expect(limiter.ratio.setValueAtTime).toHaveBeenCalledWith(expect.any(Number), 0);
    });

    it('should route all instrument buses through the master gain or EQs', () => {
        initAudio(getState());

        // Check instrument gains are connected
        const graph = playback.audioGraph;
        expect(graph.chords.gain.connect).toHaveBeenCalled();
        expect(graph.bass.gain.connect).toHaveBeenCalled();
        expect(graph.soloist.gain.connect).toHaveBeenCalled();
        expect(graph.drums.gain.connect).toHaveBeenCalled();
    });

    it('should correctly assemble the Pro Mix v3 bus chain', () => {
        initAudio(getState());
        const graph = playback.audioGraph;

        // Bass Sidechain & EQ
        expect(graph.bass.gain.connect).toHaveBeenCalledWith(graph.bass.sidechain);
        expect(graph.bass.sidechain.connect).toHaveBeenCalledWith(graph.bass.eq);
        expect(graph.bass.eq.connect).toHaveBeenCalled();

        // Chords EQ & Panner
        expect(graph.chords.gain.connect).toHaveBeenCalledWith(graph.chords.eq);
        expect(graph.chords.panner).toBeDefined();

        // Soloist EQ
        expect(graph.soloist.gain.connect).toHaveBeenCalledWith(graph.soloist.eq);
    });

    it('should protect the bass bus with its own EQ chain', () => {
        initAudio(getState());
        expect(playback.audioGraph.bass.eq).toBeDefined();
        expect(playback.audioGraph.bass.eq.type).toBe('highpass');
    });

    it('should verify that mixer gain multipliers are correctly applied', () => {
        initAudio(getState());

        // mixer gain = state.volume * MIXER_GAIN_MULTIPLIERS[module]
        // With unity UI defaults, the hidden trim carries the prior effective balance.
        // Target should be 1.0 * 0.1575 = 0.1575

        const bassTarget =
            playback.audioGraph.bass.gain.gain.exponentialRampToValueAtTime.mock.calls[0][0];
        expect(bassTarget).toBeCloseTo(0.1575, 4);

        // Harmony target should be 1.0 * 0.1 = 0.1
        const harmonyTarget =
            playback.audioGraph.harmonies.gain.gain.exponentialRampToValueAtTime.mock.calls[0][0];
        expect(harmonyTarget).toBeCloseTo(0.1, 4);
    });

    it('should ensure the saturator uses an oversampled soft-clip curve', () => {
        initAudio(getState());

        expect(playback.audioGraph.master.saturator.curve).toBeDefined();
        expect(playback.audioGraph.master.saturator.oversample).toBe('4x');
    });

    it('should maintain cumulative gain below 1.0 before the limiter', () => {
        initAudio(getState());
        restoreGains(getState());

        // Check cumulative gain from restoreGains (uses setTargetAtTime)
        const graph = playback.audioGraph;
        const drumGain = graph.drums.gain.gain.setTargetAtTime.mock.calls[0][0];
        const bassGain = graph.bass.gain.gain.setTargetAtTime.mock.calls[0][0];
        const chordsGain = graph.chords.gain.gain.setTargetAtTime.mock.calls[0][0];
        const soloistGain = graph.soloist.gain.gain.setTargetAtTime.mock.calls[0][0];
        const harmonyGain = graph.harmonies.gain.gain.setTargetAtTime.mock.calls[0][0];

        const totalInstrumentGain = drumGain + bassGain + chordsGain + soloistGain + harmonyGain;

        // Verification: The hidden trims should keep the unity-default sum safe (~0.7975)
        expect(totalInstrumentGain).toBeLessThan(1.0);
        // Recalculating expected:
        // Drums: 1.0 * 0.26 = 0.26
        // Bass: 1.0 * 0.1575 = 0.1575
        // Chords: 1.0 * 0.13 = 0.13
        // Soloist: 1.0 * 0.15 = 0.15
        // Harmony: 1.0 * 0.1 = 0.1
        // Total = 0.7975
        expect(totalInstrumentGain).toBeCloseTo(0.7975, 4);
    });

    it('should calculate master gain correctly (Headroom Check)', () => {
        initAudio(getState());
        // Master Gain = ui.masterVol (0.5) * masterMultiplier (0.85) = 0.425
        const masterGain =
            playback.audioGraph.master.gain.gain.exponentialRampToValueAtTime.mock.calls[0][0];
        expect(masterGain).toBeCloseTo(0.425, 4);
    });
});
