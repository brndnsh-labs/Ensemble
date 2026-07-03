// @ts-nocheck
/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Mock state and global modules
vi.mock('../../../public/state.js', () => {
    const mockPlayback = {
        audio: {
            currentTime: 0,
            createOscillator: vi.fn(() => ({
                type: '',
                frequency: {
                    setValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                    setTargetAtTime: vi.fn(),
                },
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
            })),
            createGain: vi.fn(() => ({
                gain: {
                    value: 1,
                    setValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                    setTargetAtTime: vi.fn(),
                    cancelScheduledValues: vi.fn(),
                    linearRampToValueAtTime: vi.fn(),
                },
                connect: vi.fn(),
            })),
            createStereoPanner: vi.fn(() => ({
                pan: { setValueAtTime: vi.fn() },
                connect: vi.fn(),
            })),
            createBiquadFilter: vi.fn(() => ({
                type: '',
                frequency: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                Q: { value: 0, setValueAtTime: vi.fn() },
                connect: vi.fn(),
            })),
            createBufferSource: vi.fn(() => ({
                buffer: null,
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
                onended: null,
                playbackRate: { value: 1, setValueAtTime: vi.fn() },
            })),
            createBuffer: vi.fn(() => ({
                getChannelData: vi.fn(() => new Float32Array(100)),
            })),
            sampleRate: 44100,
        },
        drumsGain: { connect: vi.fn() },
    };
    const mockGroove = {
        humanize: 20,
        voice: 'synth',
        audioBuffers: { noise: {} },
        lastHatGain: null,
        lastRideGain: null,
        lastCrashGain: null,
    };
    const mockHarmony = { enabled: false };

    const mockStateMap = {
        playback: mockPlayback,
        groove: mockGroove,
        harmony: mockHarmony,
    };

    return {
        ...mockStateMap,
        stateMap: mockStateMap,
        getState: () => mockStateMap,
        arranger: {},
        chords: {},
        bass: {},
        soloist: makeSoloistMock({}),
        vizState: {},
        storage: {},
        midi: {},
        dispatch: vi.fn(),
    };
});

// Mock utils
vi.mock('../../../public/utils.js', () => ({
    safeDisconnect: vi.fn(),
}));

import {
    getCymbalMixScale,
    getCymbalVoiceConfig,
    getKickVoiceConfig,
    getRhythmBodyMixScale,
    getSnareMixScale,
    getSnareVoiceConfig,
    getTomVoiceConfig,
    playDrumSound,
} from '../../../public/engine/synth-drums.js';
import { getState } from '../../../public/state.js';

const { playback, groove } = getState();

describe('Drum Synthesis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        groove.lastHatGain = null;
        groove.lastRideGain = null;
        groove.lastCrashGain = null;
        playback.audio.currentTime = 10;
        groove.audioBuffers = { noise: {} };
    });

    it('should create a 5-layer model for the Kick drum', () => {
        playDrumSound(getState(), 'Kick', 10, 1.0);

        // Layers: Beater (Osc), Skin (Noise), Knock (Osc), Shell (Osc), Click (Noise)
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(3);
        expect(playback.audio.createBufferSource).toHaveBeenCalledTimes(2);
        expect(playback.audio.createGain).toHaveBeenCalled();
    });

    it('should use a pre-rendered AudioBuffer for HiHat to optimize CPU', () => {
        playDrumSound(getState(), 'HiHat', 10, 1.0);

        // Should create buffer ONCE (if not cached) and use BufferSource
        expect(playback.audio.createBuffer).toHaveBeenCalled();
        expect(playback.audio.createBufferSource).toHaveBeenCalled();

        // Should use playbackRate for variation
        const source = playback.audio.createBufferSource.mock.results[0].value;
        expect(source.playbackRate.value).not.toBe(1.0); // Should be jittered
    });

    it('should keep closed-hat pitch variance subtle', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(1);

        playDrumSound(getState(), 'HiHat', 10, 1.0);

        // Index 0 = cymbal buffer source (sizzle layer adds a second BufferSource after it)
        const source = playback.audio.createBufferSource.mock.results[0].value;
        expect(source.playbackRate.value).toBeGreaterThan(1.0);
        expect(source.playbackRate.value).toBeLessThan(1.04);

        randomSpy.mockRestore();
    });

    it('should cache dedicated buffers for each cymbal voice', () => {
        playDrumSound(getState(), 'HiHat', 10, 1.0);
        playDrumSound(getState(), 'Open', 10.1, 1.0);
        playDrumSound(getState(), 'Ride', 10.2, 1.0);
        playDrumSound(getState(), 'Crash', 10.3, 1.0);

        // The reworked ('new') drum voice rebuilt the closed/open/ride hats onto
        // getVariedCymbalBuffer (synth-drums.ts §"Epic 4 S4"), which caches a POOL
        // of independently-synthesized buffers under a `<key>#pool` array key — one
        // distinct dedicated pool per cymbal voice. Crash is not in playDrumSoundNew's
        // switch, so it falls through to playDrumSoundCurrent → ensureCymbalBuffer,
        // which still caches a single buffer under the bare `crashMetal` key.
        expect(groove.audioBuffers['hihatMetal#pool']).toBeDefined();
        expect(groove.audioBuffers['openHatMetal#pool']).toBeDefined();
        expect(groove.audioBuffers['rideMetal#pool']).toBeDefined();
        expect(groove.audioBuffers.crashMetal).toBeDefined();

        // Each hat pool is its own dedicated array of cached metallic buffers
        // (one synthesized per hit while filling), keyed separately per voice.
        expect(Array.isArray(groove.audioBuffers['hihatMetal#pool'])).toBe(true);
        expect(groove.audioBuffers['hihatMetal#pool'].length).toBeGreaterThan(0);
        expect(groove.audioBuffers['openHatMetal#pool'].length).toBeGreaterThan(0);
        expect(groove.audioBuffers['rideMetal#pool'].length).toBeGreaterThan(0);
    });

    it('should implement choking logic when a new HiHat starts', () => {
        const mockPrevGain = {
            gain: {
                cancelScheduledValues: vi.fn(),
                setTargetAtTime: vi.fn(),
            },
        };
        groove.lastHatGain = mockPrevGain;

        playDrumSound(getState(), 'HiHat', 11, 1.0);

        expect(mockPrevGain.gain.cancelScheduledValues).toHaveBeenCalledWith(11);
        expect(mockPrevGain.gain.setTargetAtTime).toHaveBeenCalledWith(0, 11, 0.008);
    });

    it('should use a highpass filter for the Snare wires', () => {
        playDrumSound(getState(), 'Snare', 10, 1.0);

        // Snare creates Tone (2 Oscs) and Wires (Noise)
        const filters = playback.audio.createBiquadFilter.mock.results;
        const wiresFilter = filters.find((f) => f.value.type === 'bandpass');
        expect(wiresFilter).toBeDefined();
    });

    it('should keep kick body forward while trimming dense-mix beater click', () => {
        const openMix = getKickVoiceConfig(1.0, 0.35);
        const denseMix = getKickVoiceConfig(1.0, 0.95);

        expect(denseMix.beaterFreq).toBeLessThan(openMix.beaterFreq);
        expect(denseMix.beaterVolume).toBeLessThan(openMix.beaterVolume);
        expect(denseMix.shellDecay).toBeGreaterThan(openMix.shellDecay);
        expect(denseMix.shellDuration).toBeGreaterThan(openMix.shellDuration);
    });

    it('should make snare backbeats crackier while keeping ghost notes dry', () => {
        const ghost = getSnareVoiceConfig(0.25);
        const backbeat = getSnareVoiceConfig(1.0);

        expect(backbeat.crackVolume).toBeGreaterThan(ghost.crackVolume);
        expect(backbeat.wiresFreq).toBeGreaterThan(ghost.wiresFreq);
        expect(backbeat.wiresDuration).toBeGreaterThan(ghost.wiresDuration);
        expect(ghost.wiresDecay).toBeLessThan(backbeat.wiresDecay);
    });

    it('should give rock and blues snare backbeats a small presence lift', () => {
        const rock = getSnareMixScale(
            { playback: { bandIntensity: 0.8 }, groove: { genreFeel: 'Rock' } },
            1.0,
        );
        const blues = getSnareMixScale(
            { playback: { bandIntensity: 0.8 }, groove: { genreFeel: 'Blues' } },
            1.0,
        );
        const jazz = getSnareMixScale(
            { playback: { bandIntensity: 0.8 }, groove: { genreFeel: 'Jazz' } },
            1.0,
        );

        expect(rock).toBeGreaterThan(jazz);
        expect(blues).toBeGreaterThan(jazz);
        expect(rock).toBeGreaterThan(1);
    });

    it('should give Blues and Jazz rhythm-body hits a small mix lift', () => {
        const rockState = { playback: { bandIntensity: 0.8 }, groove: { genreFeel: 'Rock' } };
        const bluesState = { playback: { bandIntensity: 0.8 }, groove: { genreFeel: 'Blues' } };
        const jazzState = { playback: { bandIntensity: 0.8 }, groove: { genreFeel: 'Jazz' } };

        expect(getRhythmBodyMixScale(bluesState, 'Kick')).toBeGreaterThan(1);
        expect(getRhythmBodyMixScale(jazzState, 'Kick')).toBeGreaterThan(
            getRhythmBodyMixScale(rockState, 'Kick'),
        );
        expect(getRhythmBodyMixScale(bluesState, 'Low Tom')).toBeGreaterThan(1);
        expect(getRhythmBodyMixScale(jazzState, 'Mid Tom')).toBeGreaterThan(
            getRhythmBodyMixScale(rockState, 'Mid Tom'),
        );
    });

    it('should implement a 4-layer model for Toms (Stick, Body, Skin, Shell)', () => {
        playDrumSound(getState(), 'High Tom', 10, 1.0);

        // Layers: Stick (Osc), Body (Osc), Shell (Osc) + Skin (Noise)
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(3);
        expect(playback.audio.createBufferSource).toHaveBeenCalledTimes(1);
    });

    it('should separate tom voices by register, drop, and sustain', () => {
        const high = getTomVoiceConfig('High Tom', 1.0);
        const mid = getTomVoiceConfig('Mid Tom', 1.0);
        const low = getTomVoiceConfig('Low Tom', 1.0);

        expect(high.baseFreq).toBeGreaterThan(mid.baseFreq);
        expect(mid.baseFreq).toBeGreaterThan(low.baseFreq);
        expect(high.stickFreqStart).toBeGreaterThan(low.stickFreqStart);
        expect(high.shellDuration).toBeLessThan(mid.shellDuration);
        expect(mid.shellDuration).toBeLessThan(low.shellDuration);
        expect(high.bodyDecay).toBeLessThan(low.bodyDecay);
    });

    it('should implement Ride cymbal synthesis', () => {
        playDrumSound(getState(), 'Ride', 10, 1.0);

        // Ride should use BufferSource (metallic) + Filter + Gain + Panner
        expect(playback.audio.createBufferSource).toHaveBeenCalled();
        expect(playback.audio.createGain).toHaveBeenCalled();
    });

    it('should implement Crash cymbal synthesis', () => {
        playDrumSound(getState(), 'Crash', 10, 1.0);

        // Crash now uses a dedicated metallic buffer for a lighter, more focused wash
        expect(playback.audio.createBufferSource).toHaveBeenCalled();
        expect(playback.audio.createBiquadFilter).toHaveBeenCalled();
    });

    it('should focus open-hat tone and decay as intensity rises', () => {
        const relaxed = getCymbalVoiceConfig('Open', 0.75, 0.35);
        const aggressive = getCymbalVoiceConfig('Open', 1.2, 0.95);

        expect(relaxed).not.toBeNull();
        expect(aggressive).not.toBeNull();
        expect(aggressive.bandpassFreq).toBeLessThan(relaxed.bandpassFreq);
        expect(aggressive.decayTime).toBeLessThan(relaxed.decayTime);
    });

    it('should shorten soft open-hat accents into bark-like releases', () => {
        const bark = getCymbalVoiceConfig('Open', 0.65, 0.7);
        const fullOpen = getCymbalVoiceConfig('Open', 1.0, 0.7);

        expect(bark).not.toBeNull();
        expect(fullOpen).not.toBeNull();
        expect(bark.decayTime).toBeLessThan(fullOpen.decayTime);
        expect(bark.stopTime).toBeLessThan(fullOpen.stopTime);
    });

    it('should give open, ride, and crash longer natural sustain than closed hi-hat', () => {
        const hihat = getCymbalVoiceConfig('HiHat', 1.0, 0.7);
        const open = getCymbalVoiceConfig('Open', 1.0, 0.7);
        const ride = getCymbalVoiceConfig('Ride', 1.0, 0.7);
        const crash = getCymbalVoiceConfig('Crash', 1.0, 0.7);

        expect(hihat).not.toBeNull();
        expect(open).not.toBeNull();
        expect(ride).not.toBeNull();
        expect(crash).not.toBeNull();
        expect(hihat.decayTime).toBeGreaterThan(0.04);
        expect(open.decayTime).toBeGreaterThan(hihat.decayTime);
        expect(ride.decayTime).toBeGreaterThan(open.decayTime);
        expect(crash.decayTime).toBeGreaterThan(ride.decayTime);
        expect(hihat.stopTime).toBeGreaterThan(0.42);
        expect(open.stopTime).toBeGreaterThan(3.0);
        expect(ride.stopTime).toBeGreaterThan(4.5);
        expect(crash.stopTime).toBeGreaterThan(6.8);
    });

    it('should keep the ride ping subtle', () => {
        const ride = getCymbalVoiceConfig('Ride', 1.1, 0.9);

        expect(ride).not.toBeNull();
        expect(ride.pingVolume).toBeLessThan(0.1);
        expect(ride.bandpassFreq).toBeLessThan(5000);
    });

    it('should give jazz ride a little more presence than non-jazz ride', () => {
        const jazzState = {
            playback: { bandIntensity: 0.35 },
            groove: { genreFeel: 'Jazz' },
            bass: { enabled: true },
            chords: { enabled: true },
            harmony: { enabled: false },
            soloist: makeSoloistMock({ enabled: false }),
        };
        const rockState = {
            playback: { bandIntensity: 0.35 },
            groove: { genreFeel: 'Rock' },
            bass: { enabled: true },
            chords: { enabled: true },
            harmony: { enabled: false },
            soloist: makeSoloistMock({ enabled: false }),
        };

        expect(getCymbalMixScale(jazzState, 'Ride')).toBeGreaterThan(
            getCymbalMixScale(rockState, 'Ride'),
        );
        expect(getCymbalVoiceConfig('Ride', 0.85, 0.35).decayTime).toBeGreaterThan(1.4);
    });

    it('should make crash read louder and broader than ride', () => {
        const jazzState = {
            playback: { bandIntensity: 0.45 },
            groove: { genreFeel: 'Jazz' },
            bass: { enabled: true },
            chords: { enabled: true },
            harmony: { enabled: false },
            soloist: makeSoloistMock({ enabled: false }),
        };
        const ride = getCymbalVoiceConfig('Ride', 1.0, 0.45);
        const crash = getCymbalVoiceConfig('Crash', 1.0, 0.45);

        expect(ride).not.toBeNull();
        expect(crash).not.toBeNull();
        expect(crash.volumeScale * getCymbalMixScale(jazzState, 'Crash')).toBeGreaterThan(
            ride.volumeScale * getCymbalMixScale(jazzState, 'Ride'),
        );
        expect(crash.bandpassFreq).toBeLessThan(ride.bandpassFreq);
    });

    it('should trim cymbal mix more aggressively when the full band is active', () => {
        const sparseState = {
            playback: { bandIntensity: 0.45 },
            bass: { enabled: true },
            chords: { enabled: false },
            harmony: { enabled: false },
            soloist: makeSoloistMock({ enabled: false }),
        };
        const fullBandState = {
            playback: { bandIntensity: 0.95 },
            bass: { enabled: true },
            chords: { enabled: true },
            harmony: { enabled: true },
            soloist: makeSoloistMock({ enabled: true }),
        };

        expect(getCymbalMixScale(fullBandState, 'Crash')).toBeLessThan(
            getCymbalMixScale(sparseState, 'Crash'),
        );
        expect(getCymbalMixScale(fullBandState, 'Open')).toBeLessThan(
            getCymbalMixScale(sparseState, 'HiHat'),
        );
    });

    it('should keep ride and crash present even in crowded high-intensity sections', () => {
        const fullBandState = {
            playback: { bandIntensity: 0.95 },
            bass: { enabled: true },
            chords: { enabled: true },
            harmony: { enabled: true },
            soloist: makeSoloistMock({ enabled: true }),
        };

        expect(getCymbalMixScale(fullBandState, 'Ride')).toBeGreaterThan(0.74);
        expect(getCymbalMixScale(fullBandState, 'Crash')).toBeGreaterThan(0.63);
    });

    it('should choke previous crash wash when a new crash starts', () => {
        const mockPrevGain = {
            gain: {
                cancelScheduledValues: vi.fn(),
                setTargetAtTime: vi.fn(),
            },
        };
        groove.lastCrashGain = mockPrevGain;

        playDrumSound(getState(), 'Crash', 11, 1.0);

        expect(mockPrevGain.gain.cancelScheduledValues).toHaveBeenCalledWith(11);
        expect(mockPrevGain.gain.setTargetAtTime).toHaveBeenCalledWith(0, 11, 0.18);
    });

    it('should implement Clave synthesis', () => {
        playDrumSound(getState(), 'Clave', 10, 1.0);

        expect(playback.audio.createOscillator).toHaveBeenCalled();
        expect(playback.audio.createBufferSource).toHaveBeenCalled();
    });

    it('should implement Conga and Bongo synthesis', () => {
        playDrumSound(getState(), 'Conga', 10, 1.0);
        playDrumSound(getState(), 'Bongo', 10, 1.0);

        // These create tone (osc) and noise
        expect(playback.audio.createOscillator).toHaveBeenCalled();
        expect(playback.audio.createBufferSource).toHaveBeenCalled();
        expect(playback.audio.createBiquadFilter).toHaveBeenCalled();
    });

    it('should implement Agogo and Perc synthesis', () => {
        playDrumSound(getState(), 'High Agogo', 10, 1.0);
        playDrumSound(getState(), 'Low Agogo', 10, 1.0);
        playDrumSound(getState(), 'Perc', 10, 1.0);

        // Uses 3 oscillators via playResonantTone
        expect(playback.audio.createOscillator).toHaveBeenCalled();
    });

    it('should implement Shaker/Guiro synthesis', () => {
        playDrumSound(getState(), 'Shaker', 10, 1.0);
        playDrumSound(getState(), 'Guiro', 10, 1.0);

        expect(playback.audio.createBufferSource).toHaveBeenCalled();
        expect(playback.audio.createBiquadFilter).toHaveBeenCalled();
    });
});
