// @ts-nocheck
/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioWatchdog } from '../../../public/engine/audio-recovery.js';
import * as Engine from '../../../public/engine/engine.js';
import {
    activateWakeLock,
    initPlatform,
    lockAudio,
    unlockAudio,
} from '../../../public/platform.js';
import { getState } from '../../../public/state.js';

// Mock engine dependencies for Watchdog tests
vi.mock('../../../public/engine/engine.js', () => ({
    initAudio: vi.fn(),
    killAllNotes: vi.fn().mockResolvedValue(),
    restoreGains: vi.fn(),
}));

describe('Audio Recovery & Platform Integrity', () => {
    let mockAudioContext, mockAnalyser, mockMasterGain, playback;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        // Mock Audio constructor
        global.Audio = vi.fn().mockImplementation(function () {
            this.play = vi.fn().mockResolvedValue(undefined);
            this.pause = vi.fn();
            this.loop = false;
            this.currentTime = 0;
            return this;
        });

        // Set up Mock Audio environment for Watchdog
        playback = getState().playback;
        playback.isPlaying = true;

        mockAnalyser = {
            fftSize: 2048,
            getFloatTimeDomainData: vi.fn((buf) => {
                // Fill with safe values by default
                for (let i = 0; i < buf.length; i++) {
                    buf[i] = 0.5;
                }
            }),
        };

        mockAudioContext = {
            state: 'running',
            createAnalyser: vi.fn(() => mockAnalyser),
            resume: vi.fn().mockResolvedValue(),
            close: vi.fn().mockResolvedValue(),
        };

        mockMasterGain = {
            connect: vi.fn(),
            disconnect: vi.fn(),
            gain: { value: 1.0 },
        };

        playback.audio = mockAudioContext;
        playback.masterGain = mockMasterGain;
    });

    afterEach(() => {
        audioWatchdog.stop();
        audioWatchdog.crashCount = 0;
        audioWatchdog.isRecovering = false;
        audioWatchdog.analyser = null;
    });

    // --- Platform Tests ---
    describe('Platform Integrity', () => {
        it('should initialize a silent audio element for background playback', () => {
            initPlatform();
            expect(global.Audio).toHaveBeenCalled();
        });

        it('should play silent audio on unlock to keep AudioContext alive', async () => {
            initPlatform();
            unlockAudio();

            const audioInstance = global.Audio.mock.results[0].value;
            expect(audioInstance.play).toHaveBeenCalled();
        });

        it('should pause silent audio on lock', () => {
            initPlatform();
            lockAudio();
            const audioInstance = global.Audio.mock.results[0].value;
            expect(audioInstance.pause).toHaveBeenCalled();
            expect(audioInstance.currentTime).toBe(0);
        });

        it('should handle WakeLock safely on unsupported browsers', async () => {
            const nav = global.navigator;
            const originalWakeLock = nav.wakeLock;
            delete nav.wakeLock;

            await expect(activateWakeLock()).resolves.not.toThrow();

            nav.wakeLock = originalWakeLock; // Restore
        });
    });

    // --- Watchdog Tests ---
    describe('AudioWatchdog', () => {
        it('should start and stop monitoring intervals', () => {
            audioWatchdog.start(() => playback);
            expect(audioWatchdog.intervalId).not.toBeNull();

            // Should not create multiple intervals
            const firstId = audioWatchdog.intervalId;
            audioWatchdog.start(() => playback);
            expect(audioWatchdog.intervalId).toBe(firstId);

            audioWatchdog.stop();
            expect(audioWatchdog.intervalId).toBeNull();
        });

        it('should attach an analyser to the master node', () => {
            audioWatchdog.attachToMaster(mockMasterGain, playback);

            expect(mockAudioContext.createAnalyser).toHaveBeenCalled();
            expect(mockMasterGain.connect).toHaveBeenCalledWith(mockAnalyser);
            expect(audioWatchdog.analyser).toBe(mockAnalyser);
            expect(audioWatchdog.dataBuffer.length).toBe(256);
        });

        it('should attempt to resume a suspended context', async () => {
            mockAudioContext.state = 'suspended';

            await audioWatchdog.healthCheck(playback);

            expect(mockAudioContext.resume).toHaveBeenCalled();
        });

        it('should not resume if isPlaying is false', async () => {
            mockAudioContext.state = 'suspended';
            playback.isPlaying = false;

            await audioWatchdog.healthCheck(playback);

            expect(mockAudioContext.resume).not.toHaveBeenCalled();
        });

        it('should trigger DSP reset if NaN is detected in audio buffer', async () => {
            audioWatchdog.attachToMaster(mockMasterGain, playback);

            // Corrupt the buffer mock
            mockAnalyser.getFloatTimeDomainData.mockImplementationOnce((buf) => {
                buf[0] = NaN;
            });

            const triggerSpy = vi.spyOn(audioWatchdog, 'triggerDSPReset');

            await audioWatchdog.healthCheck(playback);

            expect(triggerSpy).toHaveBeenCalled();
            expect(audioWatchdog.crashCount).toBe(1);
        });

        it('should trigger full restart if context is closed', async () => {
            mockAudioContext.state = 'closed';
            const restartSpy = vi.spyOn(audioWatchdog, 'triggerFullRestart');

            await audioWatchdog.healthCheck(playback);

            expect(restartSpy).toHaveBeenCalled();
        });

        it('should execute the DSP reset pipeline', async () => {
            // Setup onRecover callback
            audioWatchdog.onRecover = async (pb) => {
                const map = getState();
                await Engine.killAllNotes(map);
                await pb.audio.close();
                Engine.initAudio(map);
                Engine.restoreGains(map);
            };

            // Initiate reset
            const resetPromise = audioWatchdog.triggerDSPReset(playback);

            expect(audioWatchdog.isRecovering).toBe(true);
            expect(mockMasterGain.disconnect).toHaveBeenCalled();
            expect(Engine.killAllNotes).toHaveBeenCalled();

            // Flush promises
            await resetPromise;

            expect(mockAudioContext.close).toHaveBeenCalled();
            expect(Engine.initAudio).toHaveBeenCalled();
            expect(Engine.restoreGains).toHaveBeenCalled();
        });
    });
});
