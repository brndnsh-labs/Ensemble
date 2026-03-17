import {
    activateWakeLock,
    deactivateWakeLock,
    initPlatform,
    lockAudio,
    unlockAudio,
} from '../platform.js';

/**
 * Initializes platform specific features.
 */
export function initPlatformHacks() {
    initPlatform();
}

/**
 * Stops platform-level audio and locks wake lock state.
 */
export function stopPlatformAudioAndWakeLock() {
    lockAudio();
    deactivateWakeLock();
}

/**
 * Starts platform-level audio and unlocks wake lock state.
 */
export function startPlatformAudioAndWakeLock() {
    unlockAudio();
    activateWakeLock();
}
