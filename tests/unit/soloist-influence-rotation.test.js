import { beforeEach, describe, expect, it } from 'vitest';
import { getSoloistNote } from '../../public/soloist.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

describe('Soloist Collective Pool Influence Rotation', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
        dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: 'Rock', enabled: true });
        dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart' });
    });

    it('should rotate influence at the start of a section', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7] };
        const { soloist } = getState();

        const influencesSeen = new Set();

        // Simulate 10 section boundaries
        for (let section = 0; section < 10; section++) {
            const sectionStart = section * 64;
            const sectionEnd = (section + 1) * 64;

            // Trigger section start
            getSoloistNote(
                chord,
                null,
                sectionStart,
                440,
                0,
                'smart',
                0,
                false,
                { sectionStart, sectionEnd, bypassRhythm: true },
                { mStep: 0, isMeasureStart: true, isBeatStart: true },
            );

            if (soloist.phraseContext.profile) {
                influencesSeen.add(soloist.phraseContext.profile);
            }
        }

        // We should have seen multiple influences across 10 sections
        expect(influencesSeen.size).toBeGreaterThan(1);
    });

    it('should maintain the same influence within a section across multiple phrases', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7] };
        const { soloist } = getState();
        const sectionStart = 0;
        const sectionEnd = 128;

        // 1. Initial trigger at section start
        getSoloistNote(
            chord,
            null,
            0,
            440,
            0,
            'smart',
            0,
            false,
            { sectionStart, sectionEnd, bypassRhythm: true },
            { mStep: 0, isMeasureStart: true, isBeatStart: true },
        );
        const initialProfile = soloist.phraseContext.profile;
        expect(initialProfile).toBeDefined();

        // 2. Simulate several phrases within the same section
        for (let i = 16; i < 64; i += 16) {
            // Mock resting between phrases to trigger new phrase logic
            soloist.isResting = true;
            soloist.restSteps = 0;

            getSoloistNote(
                chord,
                null,
                i,
                440,
                0,
                'smart',
                0,
                false,
                { sectionStart, sectionEnd, bypassRhythm: true },
                { mStep: 0, isMeasureStart: true, isBeatStart: true },
            );

            // Profile should NOT have changed
            expect(soloist.phraseContext.profile).toBe(initialProfile);
        }
    });
});
