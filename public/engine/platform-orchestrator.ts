import { activateWakeLock, deactivateWakeLock, lockAudio, unlockAudio } from '../platform.js';

export function stopPlatformAudioAndWakeLock(): void {
    lockAudio();
    deactivateWakeLock();
}

export function startPlatformAudioAndWakeLock(): void {
    unlockAudio();
    activateWakeLock();
}
