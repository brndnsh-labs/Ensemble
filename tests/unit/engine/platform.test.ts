// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    activateWakeLock,
    deactivateWakeLock,
    initPlatform,
    lockAudio,
    unlockAudio,
} from '../../../public/platform.js';

describe('Platform Utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset navigator mock
        vi.stubGlobal('navigator', {
            userAgent: 'test',
            wakeLock: {
                request: vi.fn().mockResolvedValue({ release: vi.fn() }),
            },
        });
    });

    it('should initialize platform with silent audio', () => {
        // In happy-dom, Audio is defined — initPlatform should construct a real
        // looping Audio element (the iOS-unlock silent track), not the dummy fallback.
        const loopSpy = vi.spyOn(HTMLMediaElement.prototype, 'loop', 'set');

        initPlatform();

        expect(loopSpy).toHaveBeenCalledWith(true);
        loopSpy.mockRestore();
    });

    it('should handle missing Audio constructor', () => {
        const originalAudio = global.Audio;
        delete global.Audio;

        // No real Audio element exists, so the dummy { play, pause, currentTime }
        // fallback must be used — none of these should throw.
        expect(() => initPlatform()).not.toThrow();
        expect(() => unlockAudio()).not.toThrow(); // hits the dummy object's play()
        expect(() => lockAudio()).not.toThrow(); // hits the dummy object's pause()

        global.Audio = originalAudio;
    });

    it('should unlock and lock audio', () => {
        const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
        const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});

        initPlatform();
        unlockAudio();
        unlockAudio(); // Hit the else branch (already unlocked)
        lockAudio();

        expect(playSpy).toHaveBeenCalledTimes(2);
        expect(pauseSpy).toHaveBeenCalledTimes(1);

        playSpy.mockRestore();
        pauseSpy.mockRestore();
    });

    it('should activate and deactivate wake lock', async () => {
        const releaseSpy = vi.fn();
        navigator.wakeLock.request.mockResolvedValue({ release: releaseSpy });

        await activateWakeLock();
        expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen');

        deactivateWakeLock();
        expect(releaseSpy).toHaveBeenCalled();
    });

    it('should handle wake lock errors gracefully', async () => {
        navigator.wakeLock.request.mockRejectedValue(new Error('Locked'));

        // The rejection is swallowed internally — the caller never sees it,
        // and a subsequent deactivate is a safe no-op (no lock was ever stored).
        await expect(activateWakeLock()).resolves.toBeUndefined();
        expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen');
        expect(() => deactivateWakeLock()).not.toThrow();
    });

    it('should bail if wakeLock is not in navigator', async () => {
        delete navigator.wakeLock;

        // No 'wakeLock' in navigator — should return early without touching it,
        // and a subsequent deactivate stays a safe no-op.
        await expect(activateWakeLock()).resolves.toBeUndefined();
        expect(() => deactivateWakeLock()).not.toThrow();
    });
});
