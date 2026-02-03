/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global modules
vi.mock('../../public/state.js', () => {
    const mockPlayback = {
        audio: null,
        masterGain: null,
        saturator: null,
        masterLimiter: null,
        reverbNode: null,
        chordsGain: null,
        bassGain: null,
        soloistGain: null,
        harmoniesGain: null,
        drumsGain: null,
        isPlaying: false
    };
    const mockChords = { volume: 0.5, enabled: true, reverb: 0.2 };
    const mockBass = { volume: 0.45, enabled: true, reverb: 0.05 };
    const mockSoloist = { volume: 0.5, enabled: true, reverb: 0.6 };
    const mockHarmony = { volume: 0.4, enabled: true, reverb: 0.4 };
    const mockGroove = { volume: 0.5, enabled: true, reverb: 0.2, audioBuffers: { noise: {} } };
    const mockMidi = { enabled: false, muteLocal: false };
    const mockArranger = {};
    const mockVizState = {};

    const mockStateMap = {
        playback: mockPlayback,
        chords: mockChords,
        bass: mockBass,
        soloist: mockSoloist,
        harmony: mockHarmony,
        groove: mockGroove,
        midi: mockMidi,
        arranger: mockArranger,
        vizState: mockVizState
    };

    return {
        ...mockStateMap,
        getState: () => mockStateMap,
        dispatch: vi.fn()
    };
});

// Mock UI
vi.mock('../../public/ui.js', () => ({
    ui: {
        masterVol: { value: '0.5' }
    }
}));

// Mock Utils
vi.mock('../../public/utils.js', () => ({
    safeDisconnect: vi.fn(),
    createReverbImpulse: vi.fn(() => ({})),
    createSoftClipCurve: vi.fn(() => new Float32Array(1024))
}));

import { initAudio, restoreGains } from '../../public/engine/engine.js';
import { dispatch, getState, storage } from '../../public/state.js';
const { arranger, playback, chords, bass, soloist, harmony, groove, vizState, midi } = getState();

describe('Mix & Signal Integrity Audit', () => {
    
    function createMockNode() {
        return {
            connect: vi.fn(),
            disconnect: vi.fn(),
            gain: { 
                value: 1, 
                setValueAtTime: vi.fn(), 
                exponentialRampToValueAtTime: vi.fn(), 
                setTargetAtTime: vi.fn(),
                cancelScheduledValues: vi.fn()
            },
            threshold: { setValueAtTime: vi.fn() },
            knee: { setValueAtTime: vi.fn() },
            ratio: { setValueAtTime: vi.fn() },
            attack: { setValueAtTime: vi.fn() },
            release: { setValueAtTime: vi.fn() },
            frequency: { setValueAtTime: vi.fn() },
            Q: { setValueAtTime: vi.fn() },
            gainNode: { setValueAtTime: vi.fn() }, // for BiquadFilter .gain
            type: '',
            reduction: { value: 0 }
        };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Setup Global Audio Mock as a proper constructor function
        const MockAudioContext = vi.fn().mockImplementation(function() {
            this.state = 'running';
            this.onstatechange = null;
            this.currentTime = 0;
            this.sampleRate = 44100;
            this.createGain = vi.fn().mockImplementation(createMockNode);
            this.createWaveShaper = vi.fn().mockImplementation(createMockNode);
            this.createDynamicsCompressor = vi.fn().mockImplementation(createMockNode);
            this.createConvolver = vi.fn().mockImplementation(createMockNode);
            this.createBiquadFilter = vi.fn().mockImplementation(createMockNode);
            this.createBuffer = vi.fn(() => ({ getChannelData: vi.fn(() => new Float32Array(1024)) }));
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
        initAudio();
        
        // Verify Master Chain Connections
        expect(playback.masterGain.connect).toHaveBeenCalledWith(playback.saturator);
        expect(playback.saturator.connect).toHaveBeenCalledWith(playback.masterLimiter);
        expect(playback.masterLimiter.connect).toHaveBeenCalledWith(playback.audio.destination);
    });

    it('should apply safety limiter settings to prevent hard clipping', () => {
        initAudio();
        
        // Threshold should be below 0dB to allow for saturator peaks
        expect(playback.masterLimiter.threshold.setValueAtTime).toHaveBeenCalledWith(expect.any(Number), 0);
        expect(playback.masterLimiter.ratio.setValueAtTime).toHaveBeenCalledWith(expect.any(Number), 0);
    });

    it('should route all instrument buses through the master gain', () => {
        initAudio();
        
        // Check instrument gains are connected to masterGain
        expect(playback.chordsGain.connect).toHaveBeenCalled();
        expect(playback.bassGain.connect).toHaveBeenCalled();
        expect(playback.soloistGain.connect).toHaveBeenCalled();
        expect(playback.drumsGain.connect).toHaveBeenCalled();
        
        // Verify they are connecting to the correct destination (masterGain or EQ)
        // Note: Chords and Bass go through EQ filters first
        const chordsDest = playback.chordsGain.connect.mock.calls[0][0];
        expect(chordsDest.type).toBe('highpass'); // Chords EQ
    });

    it('should protect the bass bus with its own compressor', () => {
        initAudio();
        
        // Find the compressor in the bass chain
        const compressors = playback.audio.createDynamicsCompressor.mock.results;
        const bassComp = compressors.find(r => r.value.threshold.setValueAtTime.mock.calls.some(c => c[0] === -16));
        
        expect(bassComp).toBeDefined();
        expect(bassComp.value.ratio.setValueAtTime).toHaveBeenCalledWith(4, 0);
    });

    it('should verify that mixer gain multipliers are correctly applied', () => {
        initAudio();
        
        // mixer gain = state.volume * MIXER_GAIN_MULTIPLIERS[module]
        // From config.js: bass multiplier is now 0.32. state.bass.volume is 0.45.
        // Target should be 0.45 * 0.32 = 0.144
        
        const bassTarget = playback.bassGain.gain.exponentialRampToValueAtTime.mock.calls[0][0];
        expect(bassTarget).toBeCloseTo(0.144, 4);

        // Harmony multiplier is now 0.22. state.harmony.volume is 0.4.
        // Target should be 0.4 * 0.22 = 0.088
        const harmonyTarget = playback.harmoniesGain.gain.exponentialRampToValueAtTime.mock.calls[0][0];
        expect(harmonyTarget).toBeCloseTo(0.088, 4);
    });

    it('should ensure the saturator uses an oversampled soft-clip curve', () => {
        initAudio();
        
        expect(playback.saturator.curve).toBeDefined();
        expect(playback.saturator.oversample).toBe('4x');
    });

    it('should maintain cumulative gain below 1.0 before the limiter', () => {
        initAudio();
        restoreGains();

        // Check cumulative gain from restoreGains (uses setTargetAtTime)
        const drumGain = playback.drumsGain.gain.setTargetAtTime.mock.calls[0][0];
        const bassGain = playback.bassGain.gain.setTargetAtTime.mock.calls[0][0];
        const chordsGain = playback.chordsGain.gain.setTargetAtTime.mock.calls[0][0];
        const soloistGain = playback.soloistGain.gain.setTargetAtTime.mock.calls[0][0];
        const harmonyGain = playback.harmoniesGain.gain.setTargetAtTime.mock.calls[0][0];

        const totalInstrumentGain = drumGain + bassGain + chordsGain + soloistGain + harmonyGain;

        // Verification: The sum should be safe (~0.797 based on 0.5/0.45/etc volumes)
        expect(totalInstrumentGain).toBeLessThan(1.0);
        // Recalculating expected:
        // Drums: 0.5 * 0.45 = 0.225
        // Bass: 0.45 * 0.32 = 0.144
        // Chords: 0.5 * 0.30 = 0.15
        // Soloist: 0.5 * 0.38 = 0.19
        // Harmony: 0.4 * 0.22 = 0.088
        // Total = 0.797
        expect(totalInstrumentGain).toBeCloseTo(0.797, 4);
    });

    it('should calculate master gain correctly (Headroom Check)', () => {
        initAudio();
        // Master Gain = ui.masterVol (0.5) * masterMultiplier (0.85) = 0.425
        const masterGain = playback.masterGain.gain.exponentialRampToValueAtTime.mock.calls[0][0];
        expect(masterGain).toBeCloseTo(0.425, 4);
    });
});
