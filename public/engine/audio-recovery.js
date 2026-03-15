import { getState, stateMap } from '../state.js';

/**
 * AudioRecovery.js
 *
 * robust "Watchdog" service that monitors the Web Audio Context for:
 * 1. Unexpected suspensions (OS interruptions, headset unplugging)
 * 2. DSP Instability (NaN/Infinity detection indicative of blown filters)
 * 3. Silent failures (Context running but output is dead)
 */

class AudioHealthMonitor {
    constructor() {
        this.checkInterval = 2000; // Check every 2s
        this.intervalId = null;
        this.analyser = null;
        this.dataBuffer = null;
        this.crashCount = 0;
        this.isRecovering = false;
        this.onRecover = null;
    }

    start() {
        if (this.intervalId) {
            return;
        }
        this.intervalId = setInterval(() => this.healthCheck(), this.checkInterval);
        console.log('[AudioWatchdog] Monitoring started.');
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    attachToMaster(masterNode) {
        const { playback } = getState();
        if (!playback.audio) {
            return;
        }

        try {
            if (typeof playback.audio.createAnalyser !== 'function') {
                console.warn(
                    '[AudioWatchdog] createAnalyser not supported by current AudioContext.',
                );
                return;
            }
            this.analyser = playback.audio.createAnalyser();
            this.analyser.fftSize = 256; // Smallest efficient size
            this.dataBuffer = new Float32Array(this.analyser.fftSize);

            // Connect Master -> Analyser (Fan-out)
            masterNode.connect(this.analyser);
        } catch (e) {
            console.warn('[AudioWatchdog] Failed to attach analyser:', e);
        }
    }

    async healthCheck() {
        const { playback } = getState();
        if (!playback.audio) {
            return;
        }
        if (this.isRecovering) {
            return;
        }

        const state = playback.audio.state;
        const isPlaying = playback.isPlaying;

        // 1. Check Context State
        if (state === 'suspended' && isPlaying) {
            console.warn('[AudioWatchdog] Context suspended while playing. Attempting resume...');
            try {
                await playback.audio.resume();
            } catch (e) {
                console.error('[AudioWatchdog] Resume failed:', e);
            }
            return;
        }

        if (state === 'closed' && isPlaying) {
            console.error('[AudioWatchdog] Context is CLOSED. Fatal error.');
            this.triggerFullRestart();
            return;
        }

        // 2. Check for NaN / Infinite (Blown Filters)
        if (this.analyser && isPlaying) {
            this.analyser.getFloatTimeDomainData(this.dataBuffer);

            let hasNaN = false;

            for (let i = 0; i < this.dataBuffer.length; i++) {
                const val = this.dataBuffer[i];
                if (Number.isNaN(val) || !Number.isFinite(val)) {
                    hasNaN = true;
                    break;
                }
            }

            if (hasNaN) {
                console.error(
                    '[AudioWatchdog] DSP CORRUPTION DETECTED (NaN/Infinity). Static detected.',
                );
                this.triggerDSPReset();
            }
        }
    }

    async triggerDSPReset() {
        const { playback } = getState();
        this.isRecovering = true;
        this.crashCount++;

        console.log('[AudioWatchdog] Initiating Emergency DSP Reset...');

        // 1. Mute everything immediately to stop the static
        if (playback.masterGain) {
            try {
                playback.masterGain.disconnect();
                playback.masterGain.gain.value = 0;
            } catch {
                /* ignore */
            }
        }

        if (this.onRecover) {
            try {
                await this.onRecover(playback, stateMap);
            } catch (e) {
                console.error('[AudioWatchdog] DSP Reset Callback Failed', e);
            }
        }

        this.isRecovering = false;
        console.log('[AudioWatchdog] DSP Reset Complete. Audio should be clean.');
    }

    triggerFullRestart() {
        // Full page reload might be too aggressive, let's try to re-init first
        this.triggerDSPReset();
    }
}

export const audioWatchdog = new AudioHealthMonitor();
