/**
 * Handles environment-specific APIs (WakeLock, AudioContext unlocking, etc.)
 * to keep the core scheduler pure.
 */

interface PlatformState {
    wakeLock: WakeLockSentinel | null;
    silentAudio:
        | HTMLAudioElement
        | { pause: () => void; play: () => Promise<void>; currentTime: number }
        | null;
    iosAudioUnlocked: boolean;
}

const state: PlatformState = {
    wakeLock: null,
    silentAudio: null,
    iosAudioUnlocked: false,
};

export function initPlatform(): void {
    if (typeof Audio !== 'undefined') {
        const audio = new Audio(
            'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA== ',
        );
        if (audio.loop !== undefined) {
            audio.loop = true;
        }
        state.silentAudio = audio;
    } else {
        state.silentAudio = { pause: () => {}, play: () => Promise.resolve(), currentTime: 0 };
    }
}

export function unlockAudio(): void {
    if (!state.iosAudioUnlocked && state.silentAudio) {
        state.silentAudio.play().catch(() => {
            /* ignore play error */
        });
        state.iosAudioUnlocked = true;
    } else if (state.silentAudio) {
        state.silentAudio.play().catch(() => {
            /* ignore play error */
        });
    }
}

export function lockAudio(): void {
    if (state.silentAudio) {
        state.silentAudio.pause();
        state.silentAudio.currentTime = 0;
    }
}

export async function activateWakeLock(): Promise<void> {
    if (!('wakeLock' in navigator)) {
        return;
    }
    try {
        state.wakeLock = await navigator.wakeLock.request('screen');
    } catch {
        /* ignore wake lock error */
    }
}

export function deactivateWakeLock(): void {
    if (state.wakeLock) {
        state.wakeLock.release();
        state.wakeLock = null;
    }
}
