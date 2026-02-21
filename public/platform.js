/**
 * platform.js
 * Handles environment-specific APIs (WakeLock, AudioContext unlocking, etc.)
 * to keep the core scheduler pure.
 */

const state = {
    wakeLock: null,
    silentAudio: null,
    iosAudioUnlocked: false,
};

export function initPlatform() {
    if (typeof Audio !== 'undefined') {
        state.silentAudio = new Audio(
            'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA== ',
        );
        if (state.silentAudio.loop !== undefined) {
            state.silentAudio.loop = true;
        }
    } else {
        state.silentAudio = { pause: () => {}, play: () => Promise.resolve(), currentTime: 0 };
    }
}

export function unlockAudio() {
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

export function lockAudio() {
    if (state.silentAudio) {
        state.silentAudio.pause();
        state.silentAudio.currentTime = 0;
    }
}

export async function activateWakeLock() {
    if (!('wakeLock' in navigator)) {
        return;
    }
    try {
        state.wakeLock = await navigator.wakeLock.request('screen');
    } catch {
        /* ignore wake lock error */
    }
}

export function deactivateWakeLock() {
    if (state.wakeLock) {
        state.wakeLock.release();
        state.wakeLock = null;
    }
}
