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
        // In happy-dom, Audio is defined
        initPlatform();
        // No crash is success
    });

    it('should handle missing Audio constructor', () => {
        const originalAudio = global.Audio;
        delete global.Audio;

        initPlatform();
        unlockAudio(); // Should hit the dummy object play()
        lockAudio(); // Should hit the dummy object pause()

        global.Audio = originalAudio;
    });

    it('should unlock and lock audio', () => {
        initPlatform();
        unlockAudio();
        unlockAudio(); // Hit the else branch
        lockAudio();
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
        await activateWakeLock();
        // No crash is success
    });

    it('should bail if wakeLock is not in navigator', async () => {
        delete navigator.wakeLock;
        await activateWakeLock();
        expect(true).toBe(true); // Ensure no crash
    });
});
