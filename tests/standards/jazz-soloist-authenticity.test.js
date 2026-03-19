// tests/standards/jazz-soloist-authenticity.test.js
import { getSoloistNote } from '../../public/engine/soloist.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

describe('Jazz Soloist Authenticity Benchmark', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
        dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: 'Jazz', enabled: true });
        dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'jazz' });
        dispatch(ACTIONS.UPDATE_PLAYBACK, { debugSoloist: true });
    });

    it('should alternate between Call and Response roles in Jazz', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 10], sectionStart: 0, sectionEnd: 64 };
        const { soloist } = getState();

        let callCount = 0;
        let responseCount = 0;

        for (let i = 0; i < 500; i += 16) {
            if (soloist.isResting) {
                soloist.restSteps = 0;
            }
            getSoloistNote(
                chord,
                null,
                i,
                440,
                0,
                'jazz',
                0,
                false,
                { sectionStart: 0, sectionEnd: 128, bypassRhythm: true },
                { mStep: 0 },
            );

            if (soloist.phraseContext.role === 'call') {
                callCount++;
            } else {
                responseCount++;
            }

            soloist.activeSteps = 0;
            soloist.isResting = true;
        }

        console.log(`[Jazz Audit] Calls: ${callCount}, Responses: ${responseCount}`);
        expect(callCount).toBeGreaterThan(0);
        expect(responseCount).toBeGreaterThan(0);
    });

    it('should pick characteristic Jazz profiles (Bird, Evans, Coltrane, Miles)', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 10] };
        const { soloist } = getState();

        const profilesSeen = new Set();

        // Simulate 100 section boundaries to ensure we see the whole pool
        for (let section = 0; section < 100; section++) {
            const sectionStart = section * 64;
            const sectionEnd = (section + 1) * 64;

            getSoloistNote(
                chord,
                null,
                sectionStart,
                440,
                0,
                'jazz',
                0,
                false,
                { sectionStart, sectionEnd, bypassRhythm: true },
                { mStep: 0, isMeasureStart: true, isBeatStart: true },
            );

            if (soloist.phraseContext.profile) {
                profilesSeen.add(soloist.phraseContext.profile);
            }
        }

        console.log(`[Jazz Audit] Profiles detected: ${Array.from(profilesSeen).join(', ')}`);
        expect(profilesSeen.has('bird')).toBe(true);
        expect(profilesSeen.has('evans')).toBe(true);
        expect(profilesSeen.has('coltrane')).toBe(true);
        expect(profilesSeen.has('miles')).toBe(true);
    });

    it('Bill Evans profile should target upper extensions', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 10], sectionStart: 0, sectionEnd: 64 };
        const { soloist } = getState();

        soloist.phraseContext.profile = 'evans';
        soloist.phraseContext.role = 'call';

        let extensionCount = 0;
        let totalNotes = 0;

        for (let i = 1; i < 201; i++) {
            const note = getSoloistNote(
                chord,
                null,
                i,
                440,
                0,
                'jazz',
                i % 16,
                false,
                { sectionStart: 0, sectionEnd: 128 },
                { mStep: i % 16 },
            );
            if (note) {
                const results = Array.isArray(note) ? note : [note];
                const lastNote = results[results.length - 1];
                const rel = ((lastNote.midi % 12) - (chord.rootMidi % 12) + 12) % 12;
                if ([2, 5, 6, 9].includes(rel)) {
                    extensionCount++;
                }
                totalNotes++;
            }
        }

        const extensionRate = extensionCount / totalNotes;
        console.log(
            `[Jazz Audit] Evans Extension Rate: ${(extensionRate * 100).toFixed(1)}% (Notes: ${totalNotes})`,
        );
        // Bill Evans should target extensions significantly more than roots
        expect(extensionRate).toBeGreaterThan(0.3);
    });
});
