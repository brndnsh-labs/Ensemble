import { describe, it } from 'vitest';
import { ChordAnalyzerLite } from '../../public/audio-analyzer-lite.js';

describe('ChordAnalyzerLite Chromagram Performance', () => {
    it('measures calculateChromagram performance with restricted range', () => {
        const analyzer = new ChordAnalyzerLite();
        const sampleRate = 44100;
        const length = 4096; // Typical window size
        const signal = new Float32Array(length);

        // Fill with random noise
        for (let i = 0; i < length; i++) {
            signal[i] = Math.random() * 2 - 1;
        }

        const options = {
            minMidi: 48,
            maxMidi: 88,
            suppressHarmonics: false,
            step: 4,
        };

        const start = performance.now();
        // Run 1000 times
        for (let i = 0; i < 1000; i++) {
            analyzer.calculateChromagram(signal, sampleRate, options);
        }
        const end = performance.now();

        console.log(
            `calculateChromagram (1000 iter, minMidi: 48, maxMidi: 88) took ${(end - start).toFixed(2)}ms`,
        );
    });

    it('measures calculateChromagram performance with optimization', () => {
        const analyzer = new ChordAnalyzerLite();
        const sampleRate = 44100;
        const length = 4096;
        const signal = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            signal[i] = Math.random() * 2 - 1;
        }

        // Pre-calculate
        const step = 4;
        const cosTable = new Float32Array(analyzer.pitchFrequencies.length);
        const sinTable = new Float32Array(analyzer.pitchFrequencies.length);
        for (let i = 0; i < analyzer.pitchFrequencies.length; i++) {
            const p = analyzer.pitchFrequencies[i];
            const angleStep = (2 * Math.PI * p.freq) / sampleRate;
            const delta = step * angleStep;
            cosTable[i] = Math.cos(delta);
            sinTable[i] = Math.sin(delta);
        }

        const options = {
            minMidi: 48,
            maxMidi: 88,
            suppressHarmonics: false,
            step: 4,
            buffers: {
                cosTable,
                sinTable,
                chroma: new Float32Array(12),
                pitchEnergy: new Float32Array(128),
            },
        };

        const start = performance.now();
        for (let i = 0; i < 1000; i++) {
            analyzer.calculateChromagram(signal, sampleRate, options);
        }
        const end = performance.now();

        console.log(`calculateChromagram OPTIMIZED (1000 iter) took ${(end - start).toFixed(2)}ms`);
    });
});
