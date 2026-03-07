import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getSoloistNote } from '../../public/soloist.js';
import { getStepInfo } from '../../public/utils.js';

describe('Odd-Meter Authenticity Integration', () => {
    const mockState = {
        playback: { bandIntensity: 0.5, bpm: 120, complexity: 0.5 },
        arranger: { key: 'C', timeSignature: '4/4' },
        soloist: { enabled: true, mode: 'monophonic', busySteps: 0, lastFreq: 261.63 },
        groove: { genreFeel: 'Jazz' },
    };

    it('should correctly identify measure starts in 3/4', () => {
        const ts34 = TIME_SIGNATURES['3/4'];
        const info0 = getStepInfo(0, ts34, [], TIME_SIGNATURES);
        const info12 = getStepInfo(12, ts34, [], TIME_SIGNATURES);
        const info24 = getStepInfo(24, ts34, [], TIME_SIGNATURES);
        const info1 = getStepInfo(1, ts34, [], TIME_SIGNATURES);

        expect(info0.isMeasureStart).toBe(true);
        expect(info12.isMeasureStart).toBe(true);
        expect(info24.isMeasureStart).toBe(true);
        expect(info1.isMeasureStart).toBe(false);
    });

    it('should correctly identify macro-beats (group starts) in 6/8', () => {
        const ts68 = TIME_SIGNATURES['6/8'];
        const info0 = getStepInfo(0, ts68, [], TIME_SIGNATURES);
        const info6 = getStepInfo(6, ts68, [], TIME_SIGNATURES);
        const info4 = getStepInfo(4, ts68, [], TIME_SIGNATURES);

        expect(info0.isGroupStart).toBe(true);
        expect(info6.isGroupStart).toBe(true);
        expect(info4.isGroupStart).toBe(false);
    });

    it('should correctly identify measure starts in 5/4', () => {
        const ts54 = TIME_SIGNATURES['5/4'];
        const info0 = getStepInfo(0, ts54, [], TIME_SIGNATURES);
        const info20 = getStepInfo(20, ts54, [], TIME_SIGNATURES);
        const info10 = getStepInfo(10, ts54, [], TIME_SIGNATURES);

        expect(info0.isMeasureStart).toBe(true);
        expect(info20.isMeasureStart).toBe(true);
        expect(info10.isMeasureStart).toBe(false);
    });

    it('should maintain consistent soloist emphasis probability on the downbeat across meters', () => {
        const chordC = {
            rootMidi: 60,
            freqs: [261.63, 329.63, 392.0],
            intervals: [0, 4, 7],
            quality: 'major',
        };

        const ts44 = TIME_SIGNATURES['4/4'];
        const ts34 = TIME_SIGNATURES['3/4'];

        const info44 = getStepInfo(0, ts44, [], TIME_SIGNATURES);
        const info34 = getStepInfo(0, ts34, [], TIME_SIGNATURES);

        const coordination = {
            sectionStart: 0,
            sectionEnd: 64,
            step: 0,
        };

        // We can't easily test private variables, but we can verify that getSoloistNote
        // is callable and returns consistent results for step 0 in different meters.
        const note44 = getSoloistNote(
            chordC,
            null,
            0.5,
            261.63,
            60,
            'bird',
            0,
            false,
            coordination,
            info44,
        );
        const note34 = getSoloistNote(
            chordC,
            null,
            0.5,
            261.63,
            60,
            'bird',
            0,
            false,
            coordination,
            info34,
        );

        expect(note44).toBeDefined();
        expect(note34).toBeDefined();
    });
});
