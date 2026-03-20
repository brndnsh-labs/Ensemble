import { describe, expect, it, vi } from 'vitest';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getFrequency } from '../../public/utils.js';

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: () => ({
        playback: { bandIntensity: 0.9, bpm: 110, complexity: 0.8 },
        groove: { genreFeel: 'Funk', pocket: 0 },
        soloist: { busySteps: 0 },
        arranger: { timeSignature: '4/4', totalSteps: 1000 },
    }),
}));

describe('Funk Bass Critique', () => {
    it('should pass an authenticity critique for a 128-bar Funk performance', () => {
        const chordC = { rootMidi: 48, quality: '7', beats: 4, intervals: [0, 4, 7, 10] };
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let ghostNotes = 0;
        let downbeatHits = 0;
        let octaveJumps = 0;
        let lastMidi = null;
        let totalActive = 0;

        for (let i = 0; i < totalSteps; i++) {
            const stepInMeasure = i % 16;
            const active = isBassActive(getState(), 'smart', i, i % 16);

            if (active) {
                totalActive++;
                const note = getBassNote(
                    getState(),
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

                if (note) {
                    const midi = note.midi;

                    // 1. Check The One Solidity
                    if (stepInMeasure === 0) {
                        downbeatHits++;
                        expect(midi % 12).toBe(chordC.rootMidi % 12);
                    }

                    // 2. Ghost Notes
                    if (note.muted) {
                        ghostNotes++;
                    }

                    // 3. Octave Jumps (Pops/Slaps)
                    if (lastMidi !== null) {
                        const interval = Math.abs(midi - lastMidi);
                        if (interval === 12 || interval === 24) {
                            octaveJumps++;
                        }
                    }
                    lastMidi = midi;
                }
            }
        }

        const downbeatRatio = downbeatHits / totalMeasures;
        const ghostRatio = ghostNotes / totalActive;
        const octaveRatio = octaveJumps / totalMeasures;

        console.log(
            '\n--- FUNK BASS CRITIQUE REPORT ---\n' +
                `[The One Solidity]      ${(downbeatRatio * 100).toFixed(1)}% (Target: 100%)\n` +
                `[Ghost Note Density]    ${(ghostRatio * 100).toFixed(1)}% (Target: 15-35%)\n` +
                `[Octave Pop Frequency]  ${octaveRatio.toFixed(2)} jumps/bar (Target: >0.3)\n` +
                '------------------------------------\n',
        );

        expect(downbeatRatio).toBe(1.0);
        expect(ghostRatio).toBeGreaterThan(0.15); // Increased from 0.09
        expect(ghostRatio).toBeLessThan(0.4);
        expect(octaveRatio).toBeGreaterThan(0.3); // Increased from 0.04
    });
});
