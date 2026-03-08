import { beforeEach, describe, expect, it } from 'vitest';
import { getSoloistNote } from '../../public/soloist.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

describe('Rock Soloist Profiles & Phrasing', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
        dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: 'Rock', enabled: true });
        dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart' });
    });

    it('should assign Rock profiles during Call & Response cycles across multiple sections', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7] };
        const { soloist } = getState();

        const profilesSeen = new Set();
        const rockProfiles = ['gilmour', 'slash', 'hendrix', 'evh', 'beck'];

        // Simulate 50 section boundaries to ensure we see the whole pool
        for (let section = 0; section < 50; section++) {
            const sectionStart = section * 64;
            const sectionEnd = (section + 1) * 64;

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
                profilesSeen.add(soloist.phraseContext.profile);
            }
        }

        rockProfiles.forEach((p) => {
            expect(profilesSeen.has(p)).toBe(true);
        });
    });

    it('should produce higher density for EVH bursts than Gilmour lyrical phrases', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7], sectionStart: 0, sectionEnd: 256 };
        const { soloist, playback } = getState();
        playback.bandIntensity = 0.8;

        // Test Gilmour (Lyrical)
        soloist.phraseContext.profile = 'gilmour';
        soloist.phraseContext.role = 'call';
        soloist.isResting = false;
        soloist.activeSteps = 0; // Force refill
        soloist.sessionSteps = 128;

        let gilmourNotes = 0;
        for (let i = 0; i < 128; i++) {
            if (
                getSoloistNote(chord, null, i, 440, 0, 'rock', i % 16, false, { sectionEnd: 256 })
            ) {
                gilmourNotes++;
            }
        }

        // Test EVH (Burst)
        soloist.phraseContext.profile = 'evh';
        soloist.phraseContext.role = 'call';
        soloist.isResting = false;
        soloist.activeSteps = 0; // Force refill
        soloist.sessionSteps = 128;
        soloist.rhythmPlan = [];

        let evhNotes = 0;
        for (let i = 0; i < 128; i++) {
            if (
                getSoloistNote(chord, null, i, 440, 0, 'rock', i % 16, false, { sectionEnd: 256 })
            ) {
                evhNotes++;
            }
        }

        expect(evhNotes).toBeGreaterThan(gilmourNotes);
    });
});
