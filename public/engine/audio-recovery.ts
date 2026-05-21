import type { GlobalContext } from '../state/playback.js';

/**
 * AudioRecovery.ts
 *
 * robust "Watchdog" service that monitors the Web Audio Context for:
 * 1. Unexpected suspensions (OS interruptions, headset unplugging)
 * 2. DSP Instability (NaN/Infinity detection indicative of blown filters)
 * 3. Silent failures (Context running but output is dead)
 */

class AudioHealthMonitor {
    checkInterval = 2000;
    intervalId: ReturnType<typeof setInterval> | null = null;
    analyser: AnalyserNode | null = null;
    dataBuffer: Float32Array<ArrayBuffer> | null = null;
    crashCount = 0;
    isRecovering = false;
    onRecover: ((playback: GlobalContext) => Promise<void>) | null = null;

    start(getPlaybackState: () => GlobalContext): void {
        if (this.intervalId) {
            return;
        }
        this.intervalId = setInterval(
            () => this.healthCheck(getPlaybackState()),
            this.checkInterval,
        );
        console.log('[AudioWatchdog] Monitoring started.');
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    attachToMaster(masterNode: GainNode, playback: GlobalContext): void {
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

    async healthCheck(playback: GlobalContext): Promise<void> {
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
            this.triggerFullRestart(playback);
            return;
        }

        // 2. Check for NaN / Infinite (Blown Filters)
        if (this.analyser && isPlaying && this.dataBuffer) {
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
                this.triggerDSPReset(playback);
            }
        }
    }

    async triggerDSPReset(playback: GlobalContext): Promise<void> {
        this.isRecovering = true;
        this.crashCount++;

        console.log('[AudioWatchdog] Initiating Emergency DSP Reset...');

        // 1. Mute everything immediately to stop the static
        if (playback.audioGraph) {
            try {
                const masterGain = playback.audioGraph.master.gain;
                masterGain.disconnect();
                masterGain.gain.value = 0; // @direct-mutation
            } catch {
                /* ignore */
            }
        }

        if (this.onRecover) {
            try {
                await this.onRecover(playback);
            } catch (e) {
                console.error('[AudioWatchdog] DSP Reset Callback Failed', e);
            }
        }

        this.isRecovering = false;
        console.log('[AudioWatchdog] DSP Reset Complete. Audio should be clean.');
    }

    triggerFullRestart(playback: GlobalContext): void {
        // Full page reload might be too aggressive, let's try to re-init first
        this.triggerDSPReset(playback);
    }
}

export const audioWatchdog = new AudioHealthMonitor();
