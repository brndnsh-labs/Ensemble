import { describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/soloist.js';

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: () => ({
        playback: { bandIntensity: 0.7, bpm: 120, complexity: 0.5, intent: { soloistMod: 0 } },
        groove: { genreFeel: 'Rock' },
        soloist: {
            sessionSteps: 100,
            pitchHistory: [],
            notesInPhrase: 2,
            currentPhraseSteps: 8,
            qaState: 'Question',
            srdcState: 'Departure',
            isResting: false,
            deviceBuffer: [],
            motifBuffer: [],
            stagnationCount: 0,
            lastFreq: 440,
            mode: 'monophonic',
            tension: 0.5,
            currentCell: [1, 1, 1, 1],
        },
        harmony: { enabled: true, rhythmicMask: 0, complexity: 0.5, intent: { soloistMod: 0 } },
        arranger: {
            timeSignature: '4/4',
            key: 'C',
            isMinor: false,
            sectionMap: [{ start: 0, end: 1000, syllables: [2, 3, 2, 4] }],
        },
    }),
}));

describe('Soloist Performance Benchmark', () => {
    // Setup typical arguments
    const currentChord = { rootMidi: 60, quality: 'major', intervals: [0, 4, 7], beats: 4 };
    const nextChord = { rootMidi: 65, quality: 'major', intervals: [0, 4, 7], beats: 4 };
    const prevFreq = 440;
    const octave = 4;
    const style = 'smart';
    const isPriming = false;

    it('benchmarks getSoloistNote', () => {
        const start = performance.now();
        const iterations = 50000;

        for (let i = 0; i < iterations; i++) {
            // vary stepInBeat so it triggers the logic block that has reduce
            const stepInBeat = i % 4;
            const step = i;
            getSoloistNote(
                currentChord,
                nextChord,
                step,
                prevFreq,
                octave,
                style,
                stepInBeat,
                isPriming,
            );
        }

        const end = performance.now();
        console.log(`[Baseline] ${iterations} iterations took ${(end - start).toFixed(2)}ms`);
        // Just a sanity check to ensure it runs
        expect(end - start).toBeGreaterThan(0);
    });
});
