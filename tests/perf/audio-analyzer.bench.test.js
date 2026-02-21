import { describe, it } from 'vitest';
import { ChordAnalyzerLite } from '../../public/audio-analyzer-lite.js';

describe('ChordAnalyzerLite Performance', () => {
    it('measures identifyPulse performance with large signal', async () => {
        const analyzer = new ChordAnalyzerLite();
        const sampleRate = 44100;
        const duration = 30; // 30 seconds of audio
        const length = sampleRate * duration;
        const signal = new Float32Array(length);

        // Generate a simple beat (kick drum approx) every 0.5s (120 BPM)
        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            if (t % 0.5 < 0.05) {
                signal[i] = Math.sin(2 * Math.PI * 100 * t);
            } else {
                signal[i] = 0;
            }
        }

        const mockAudioBuffer = {
            getChannelData: () => signal,
            sampleRate: sampleRate,
        };

        const start = performance.now();
        await analyzer.identifyPulse(mockAudioBuffer);
        const end = performance.now();

        console.log(`identifyPulse (30s audio) took ${(end - start).toFixed(2)}ms`);
    });
});
