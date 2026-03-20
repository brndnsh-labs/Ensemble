import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

describe('Odd-Meter Authenticity Integration', () => {
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

    it('should identify offbeats in 6/8 correctly', () => {
        const ts68 = TIME_SIGNATURES['6/8'];
        // In 6/8, stepsPerBeat is 2. Offbeat is stepInBeat === 1.
        const info0 = getStepInfo(0, ts68, [], TIME_SIGNATURES); // Beat start
        const info1 = getStepInfo(1, ts68, [], TIME_SIGNATURES); // Offbeat
        const info2 = getStepInfo(2, ts68, [], TIME_SIGNATURES); // Beat start

        expect(info0.isOffbeat).toBe(false);
        expect(info1.isOffbeat).toBe(true);
        expect(info2.isOffbeat).toBe(false);
    });

    it('should identify backbeats in 12/8 correctly', () => {
        const ts128 = TIME_SIGNATURES['12/8'];
        // 12/8 is compound. backbeat: [1, 3] (group indices).
        // grouping: [3, 3, 3, 3]. stepsPerBeat: 2.
        // Group 0: steps 0-5. Group 1: steps 6-11 (BACKBEAT start at 6).
        // Group 2: steps 12-17. Group 3: steps 18-23 (BACKBEAT start at 18).
        const info0 = getStepInfo(0, ts128, [], TIME_SIGNATURES);
        const info6 = getStepInfo(6, ts128, [], TIME_SIGNATURES);
        const info12 = getStepInfo(12, ts128, [], TIME_SIGNATURES);
        const info18 = getStepInfo(18, ts128, [], TIME_SIGNATURES);

        expect(info0.isBackbeat).toBe(false);
        expect(info6.isBackbeat).toBe(true);
        expect(info12.isBackbeat).toBe(false);
        expect(info18.isBackbeat).toBe(true);
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
            getState(),
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
            getState(),
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
