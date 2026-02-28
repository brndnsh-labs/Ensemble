import { describe, expect, it } from 'vitest';
import { ChordAnalyzerLite } from '../../public/audio-analyzer-lite.js';

class MockAudioBuffer {
    constructor({ length, sampleRate }) {
        this.length = length;
        this.sampleRate = sampleRate;
        this.duration = length / sampleRate;
        this.data = new Float32Array(length);
    }
    getChannelData() {
        return this.data;
    }
}

describe('Melody Analyzer Intelligence', () => {
    const analyzer = new ChordAnalyzerLite();
    const sampleRate = 44100;

    const addTone = (data, freq, start, end, vol = 0.3) => {
        const startIdx = Math.floor(start * sampleRate);
        const endIdx = Math.floor(end * sampleRate);
        for (let i = startIdx; i < endIdx; i++) {
            if (i >= data.length) {
                break;
            }
            const t = i / sampleRate;
            const envelope = Math.min(1, (t - start) * 50) * Math.min(1, (end - t) * 50);
            data[i] += Math.sin(2 * Math.PI * freq * t) * vol * envelope;
        }
    };

    it('should favor diatonic notes (B) over non-diatonic (Bb) in C Major via gravity', async () => {
        // C4 = 261.63, B3 = 246.94, Bb3 = 233.08
        const buffer = new MockAudioBuffer({ length: 1 * sampleRate, sampleRate });
        const data = buffer.getChannelData(0);

        // We provide Bb and B with SIMILAR energy.
        // Without bias, Bb might win if it's slightly louder.
        // With bias, B should win even if slightly quieter.
        addTone(data, 233.08, 0, 1, 0.4); // Bb3 (Louder)
        addTone(data, 246.94, 0, 1, 0.35); // B3 (Quieter but Diatonic)

        const pulse = { bpm: 60, downbeatOffset: 0 };
        const results = await analyzer.extractMelody(buffer, pulse, {
            keyBias: { root: 0, type: 'major' }, // C Major
        });

        expect(results[0].midi % 12).toBe(11); // Should be B (11) not Bb (10)
    });

    it('should favor anchor tones on downbeats (Beat 1)', async () => {
        // We provide a louder note on Beat 2 and a quieter one on Beat 1.
        // Beat 1 anchor weighting should make the quieter note win for Beat 1.
        const buffer = new MockAudioBuffer({ length: 4 * sampleRate, sampleRate });
        const data = buffer.getChannelData(0);

        // Beat 1: B3 (Quieter)
        addTone(data, 246.94, 0, 1, 0.35);
        // Beat 2: Bb3 (Louder)
        addTone(data, 233.08, 1, 2, 0.45);

        const pulse = { bpm: 60, downbeatOffset: 0, beatsPerMeasure: 4 };
        const results = await analyzer.extractMelody(buffer, pulse, {
            keyBias: { root: 0, type: 'major' },
        });

        // For Beat 1 (Index 0), B3 (11) should be chosen over potential crosstalk/leaks
        expect(results[0].midi % 12).toBe(11);
        // For Beat 2 (Index 1), Bb3 (10) should be chosen
        expect(results[1].midi % 12).toBe(10);
    });

    it('should penalize large melodic leaps to ensure continuity', async () => {
        const buffer = new MockAudioBuffer({ length: 2 * sampleRate, sampleRate });
        const data = buffer.getChannelData(0);

        // Beat 1: C4 (60)
        addTone(data, 261.63, 0, 1, 0.5);

        // Beat 2: We provide a quiet D4 (62, near) and a louder C5 (72, far leap)
        addTone(data, 293.66, 1, 2, 0.3); // D4 (62) - Quieter
        addTone(data, 523.25, 1, 2, 0.45); // C5 (72) - Louder leap

        const pulse = { bpm: 60, downbeatOffset: 0 };
        const results = await analyzer.extractMelody(buffer, pulse, {
            keyBias: { root: 0, type: 'major' },
        });

        // Beat 2 should prefer D4 (62) because it's closer to C4 (60),
        // despite C5 (72) being louder, due to continuity penalty.
        expect(results[1].midi).toBe(62);
    });

    it('should apply structural smoothing to remove isolated jitter (A B A -> A A A)', async () => {
        const buffer = new MockAudioBuffer({ length: 3 * sampleRate, sampleRate });
        const data = buffer.getChannelData(0);

        // Beat 1: C4 (60)
        addTone(data, 261.63, 0, 1, 0.5);
        // Beat 2: G4 (67) - Sudden leap and return
        addTone(data, 392.0, 1, 2, 0.4);
        // Beat 3: C4 (60)
        addTone(data, 261.63, 2, 3, 0.5);

        const pulse = { bpm: 60, downbeatOffset: 0 };
        const results = await analyzer.extractMelody(buffer, pulse);

        // Beat 2 (Index 1) should be smoothed to 60 (C4) instead of remaining 67 (G4)
        expect(results[1].midi).toBe(60);
    });
});
