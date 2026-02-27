import { describe, expect, it, vi } from 'vitest';
import { getBassNote, isBassActive } from '../../public/bass.js';
import { getFrequency } from '../../public/utils.js';

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: () => ({
        playback: { bandIntensity: 0.9, bpm: 180, complexity: 0.8 },
        groove: { genreFeel: 'Ska-Punk', pocket: -0.01 },
        soloist: { busySteps: 0 },
        arranger: { timeSignature: '4/4', totalSteps: 1000 },
    }),
}));

describe('Ska-Punk Bass Critique', () => {
    it('should pass an authenticity critique for a 128-bar Ska-Punk performance', () => {
        const chordC = { rootMidi: 48, quality: 'maj7', beats: 4, intervals: [0, 4, 7, 11] };
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let eighthNoteHits = 0;
        let upbeatEmphasis = 0;
        let melodicLeaps = 0;
        let lastMidi = null;

        for (let i = 0; i < totalSteps; i++) {
            const stepInMeasure = i % 16;
            const active = isBassActive('smart', i, i % 16);

            if (active) {
                eighthNoteHits++;
                const note = getBassNote(
                    chordC,
                    null,
                    stepInMeasure / 4,
                    lastMidi ? getFrequency(lastMidi) : 440,
                    48,
                    'smart',
                    0,
                    i,
                    i % 16,
                );

                if (note && !note.muted) {
                    const midi = note.midi;

                    // 1. Upbeat Emphasis Check
                    if (stepInMeasure % 4 === 2) {
                        upbeatEmphasis++;
                    }

                    // 2. Melodic Character
                    if (lastMidi !== null) {
                        const interval = Math.abs(midi - lastMidi);
                        if (interval > 4) {
                            melodicLeaps++;
                        }
                    }
                    lastMidi = midi;
                }
            }
        }

        const eighthRatio = eighthNoteHits / (totalMeasures * 8);
        const upbeatRatio = upbeatEmphasis / (totalMeasures * 4);
        const leapRatio = melodicLeaps / eighthNoteHits;

        console.log(
            '\n--- SKA-PUNK BASS CRITIQUE REPORT ---\n' +
                `[8th Note Drive]        ${(eighthRatio * 100).toFixed(1)}% (Target: >90%)\n` +
                `[Upbeat Persistence]    ${(upbeatRatio * 100).toFixed(1)}% (Target: >90%)\n` +
                `[Melodic Leap Frequency] ${(leapRatio * 100).toFixed(1)}% (Target: 5-20%)\n` +
                '------------------------------------\n',
        );

        expect(eighthRatio).toBeGreaterThan(0.9);
        expect(upbeatRatio).toBeGreaterThan(0.9);
        expect(leapRatio).toBeGreaterThan(0.05);
        expect(leapRatio).toBeLessThan(0.4);
    });
});
