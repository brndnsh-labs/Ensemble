import { describe, expect, it, vi } from 'vitest';
import { getBassNote, isBassActive } from '../../public/bass.js';
import { getFrequency } from '../../public/utils.js';

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: () => ({
        playback: { bandIntensity: 0.1, bpm: 75, complexity: 0.5 },
        groove: { genreFeel: 'Reggae', pocket: 0 },
        soloist: { busySteps: 0 },
        arranger: { timeSignature: '4/4', totalSteps: 1000 },
    }),
}));

describe('Reggae Bass Critique', () => {
    it('should pass an authenticity critique for a 128-bar Reggae performance', () => {
        const chordC = { rootMidi: 48, quality: 'm', beats: 4, intervals: [0, 3, 7] };
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let downbeatSilence = 0;
        let subFrequencyNotes = 0;
        let totalNotes = 0;
        let lastMidi = null;

        for (let i = 0; i < totalSteps; i++) {
            const stepInMeasure = i % 16;
            const active = isBassActive('smart', i, i % 16);

            if (active) {
                const note = getBassNote(
                    chordC,
                    null,
                    stepInMeasure / 4,
                    lastMidi ? getFrequency(lastMidi) : 440,
                    32,
                    'smart',
                    0,
                    i,
                    i % 16,
                );

                if (note && !note.muted) {
                    const midi = note.midi;
                    totalNotes++;

                    // 1. One Drop Exclusion
                    if (stepInMeasure === 0) {
                        // In many Reggae riddims, the 'One' is silent for the bass
                    } else {
                        // 2. Register Check
                        if (midi < 40) {
                            subFrequencyNotes++;
                        }
                    }
                    lastMidi = midi;
                } else if (stepInMeasure === 0) {
                    downbeatSilence++;
                }
            } else if (stepInMeasure === 0) {
                downbeatSilence++;
            }
        }

        const oneDropRatio = downbeatSilence / totalMeasures;
        const subRatio = subFrequencyNotes / totalNotes;

        console.log(
            '\n--- REGGAE BASS CRITIQUE REPORT ---\n' +
                `[One Drop Silence]      ${(oneDropRatio * 100).toFixed(1)}% (Target: >70%)\n` +
                `[Sub-Register Fidelity] ${(subRatio * 100).toFixed(1)}% (Target: >90%)\n` +
                '------------------------------------\n',
        );

        expect(oneDropRatio).toBeGreaterThan(0.7);
        expect(subRatio).toBeGreaterThan(0.9);
    });
});
