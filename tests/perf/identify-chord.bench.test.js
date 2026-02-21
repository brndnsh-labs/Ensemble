import { describe, it } from 'vitest';
import { ChordAnalyzerLite } from '../../public/audio-analyzer-lite.js';

describe('ChordAnalyzerLite identifyChord Performance', () => {
    it('measures throughput of identifyChord', () => {
        const analyzer = new ChordAnalyzerLite();
        const iterations = 100000;
        const chroma = new Float32Array(12).fill(0.1);
        chroma[0] = 0.9; // C
        chroma[4] = 0.8; // E
        chroma[7] = 0.8; // G

        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
            analyzer.identifyChord(chroma);
        }
        const end = performance.now();
        const duration = end - start;

        console.log(`identifyChord x ${iterations}: ${duration.toFixed(2)}ms`);
        console.log(`Average: ${((duration * 1000) / iterations).toFixed(4)}µs per call`);
    });
});
