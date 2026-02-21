/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { audioWatchdog } from '../../../public/audio-recovery.js';
import {
    activateWakeLock,
    initPlatform,
    lockAudio,
    unlockAudio,
} from '../../../public/platform.js';

describe('Audio Recovery & Platform Integrity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Mock Audio constructor
        global.Audio = vi.fn().mockImplementation(function () {
            this.play = vi.fn().mockResolvedValue(undefined);
            this.pause = vi.fn();
            this.loop = false;
            this.currentTime = 0;
            return this;
        });
    });

    afterEach(() => {
        audioWatchdog.stop();
    });

    it('should initialize a silent audio element for background playback', () => {
        initPlatform();
        expect(global.Audio).toHaveBeenCalled();
    });

    it('should play silent audio on unlock to keep AudioContext alive', async () => {
        initPlatform();
        unlockAudio();

        // We need to access the mock instance.
        // Since initPlatform creates it internally, we check the first call's return.
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
        // Navigator is part of happy-dom, but let's ensure wakeLock is missing
        const nav = global.navigator;
        const originalWakeLock = nav.wakeLock;
        delete nav.wakeLock;

        // Should not throw
        await expect(activateWakeLock()).resolves.not.toThrow();

        nav.wakeLock = originalWakeLock; // Restore
    });
});
