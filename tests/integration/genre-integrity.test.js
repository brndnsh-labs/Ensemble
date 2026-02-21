/* eslint-disable */
import { describe, expect, it } from 'vitest';
import { getBassNote } from '../../public/bass.js';
import { getState } from '../../public/state.js';

const { arranger, playback, groove } = getState();

import { getStepsPerMeasure } from '../../public/utils.js';

/**
 * GENRE INTEGRITY STRESS TEST
 * Simulates long-duration playback to ensure procedural engines
 * are stable, do not crash, and produce valid numeric output.
 */

describe('Genre Integrity Stability Test', () => {
    const runStabilityCheck = (genre, measures) => {
        groove.genreFeel = genre;
        arranger.timeSignature = '4/4';
        const spm = getStepsPerMeasure(arranger.timeSignature);
        const totalSteps = measures * spm;

        const chord = {
            rootMidi: 48,
            quality: 'major',
            intervals: [0, 4, 7, 11],
            beats: 4,
            freqs: [130.81, 164.81, 196.0, 246.94],
        };

        for (let step = 0; step < totalSteps; step++) {
            const stepInChord = step % spm;
            const beatIndex = stepInChord / 4;

            // 1. Verify Bass Stability
            const bassNote = getBassNote(
                chord,
                null,
                beatIndex,
                null,
                38,
                'smart',
                0,
                step,
                stepInChord,
            );
            if (bassNote) {
                expect(bassNote.midi, `NaN MIDI in ${genre}`).not.toBeNaN();
                expect(bassNote.velocity, `Invalid velocity in ${genre}`).toBeGreaterThan(0);
                expect(bassNote.durationSteps, `Invalid duration in ${genre}`).toBeGreaterThan(0);
            }

            // 2. Verify State Resilience
            expect(playback.bandIntensity).toBeLessThanOrEqual(1.0);
            expect(playback.bandIntensity).toBeGreaterThanOrEqual(0);
        }
    };

    it('should run Jazz for 1000 measures without invalid output', () => {
        runStabilityCheck('Jazz', 1000);
    });

    it('should run Funk for 1000 measures without invalid output', () => {
        runStabilityCheck('Funk', 1000);
    });

    it('should run Reggae for 1000 measures without invalid output', () => {
        runStabilityCheck('Reggae', 1000);
    });

    it('should run Rock for 1000 measures without invalid output', () => {
        runStabilityCheck('Rock', 1000);
    });

    it('should handle rapid intensity fluctuations without breaking engines', () => {
        groove.genreFeel = 'Jazz';
        for (let i = 0; i < 500; i++) {
            playback.bandIntensity = Math.random();
            const note = getBassNote(
                { rootMidi: 48, intervals: [0, 4, 7], quality: 'major' },
                null,
                0,
                null,
                38,
                'smart',
                0,
                i,
                i % 16,
            );
            if (note) {
                expect(note.velocity).toBeDefined();
            }
        }
    });

    it('should remain stable in odd time signatures (7/8)', () => {
        const spm = getStepsPerMeasure('7/8');
        for (let i = 0; i < 100 * spm; i++) {
            const note = getBassNote(
                { rootMidi: 48, intervals: [0, 4, 7], quality: 'major' },
                null,
                (i % spm) / 4,
                null,
                38,
                'smart',
                0,
                i,
                i % spm,
            );
            if (note) {
                expect(note.midi).toBeGreaterThan(0);
            }
        }
    });
});
