import { beforeEach, describe, expect, it } from 'vitest';
import { getSoloistNote } from '../../public/soloist.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

describe('Soloist Loop Rotation Logic', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
        dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: 'Rock', enabled: true });
        dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart' });
    });

    it('should rotate influence when looping back to the start of a 1-section arrangement', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7] };
        const { soloist, arranger } = getState();

        // Mock a 64-step arrangement (4 bars)
        arranger.totalSteps = 64;

        // 1. Initial trigger at step 0
        getSoloistNote(
            chord,
            null,
            0,
            440,
            0,
            'smart',
            0,
            false,
            { sectionStart: 0, sectionEnd: 64, bypassRhythm: true },
            { mStep: 0, isMeasureStart: true, isBeatStart: true },
        );
        const firstInfluence = soloist.phraseContext.profile;
        expect(firstInfluence).toBeDefined();

        // 2. Mock some phrases to clear initial state
        soloist.phraseCount = 5;

        // 3. Loop back at step 64 (start of second loop)
        // We run it several times to ensure rotation happens (probabilistic 80% shift)
        let rotated = false;
        for (let i = 0; i < 20; i++) {
            getSoloistNote(
                chord,
                null,
                64,
                440,
                0,
                'smart',
                0,
                false,
                { sectionStart: 0, sectionEnd: 64, bypassRhythm: true },
                { mStep: 0, isMeasureStart: true, isBeatStart: true },
            );
            if (soloist.phraseContext.profile !== firstInfluence) {
                rotated = true;
                break;
            }
        }

        expect(rotated).toBe(true);
    });

    it('should mutate entropy at the end of a section across loops', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7] };
        const { soloist, arranger } = getState();

        arranger.totalSteps = 64;
        soloist.rhythmicEntropy = 0;

        // Simulate step 60 (final measure of first loop)
        // Measure 4 starts at step 48 in 4/4 (16 steps/measure).
        // Downbeat of final measure is step 48.
        getSoloistNote(
            chord,
            null,
            48,
            440,
            0,
            'smart',
            0,
            false,
            { sectionStart: 0, sectionEnd: 64, bypassRhythm: true },
            { mStep: 0, isMeasureStart: true, isBeatStart: true },
        );
        const firstEntropy = soloist.rhythmicEntropy;

        // Simulate step 112 (downbeat of final measure of second loop: 64 + 48)
        let changed = false;
        for (let i = 0; i < 20; i++) {
            getSoloistNote(
                chord,
                null,
                112,
                440,
                0,
                'smart',
                0,
                false,
                { sectionStart: 0, sectionEnd: 64, bypassRhythm: true },
                { mStep: 0, isMeasureStart: true, isBeatStart: true },
            );
            if (soloist.rhythmicEntropy !== firstEntropy) {
                changed = true;
                break;
            }
        }

        expect(changed).toBe(true);
    });
});
