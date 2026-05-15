import {
    activateWakeLock,
    deactivateWakeLock,
    initPlatform,
    lockAudio,
    unlockAudio,
} from '../platform.js';

export function initPlatformHacks(): void {
    initPlatform();
}

export function stopPlatformAudioAndWakeLock(): void {
    lockAudio();
    deactivateWakeLock();
}

export function startPlatformAudioAndWakeLock(): void {
    unlockAudio();
    activateWakeLock();
}
