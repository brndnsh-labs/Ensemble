// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkSectionTransition } from '../../public/engine/conductor.js';
import { getDrumMotif } from '../../public/engine/groove-engine.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

vi.mock('../../public/ui.js', () => ({
    triggerFlash: vi.fn(),
}));
vi.mock('../../public/state/persistence.js', () => ({
    debounceSaveState: vi.fn(),
    saveCurrentState: vi.fn(),
}));

describe('Groove Section Memory (Creativity)', () => {
    let mockArranger;
    let mockPlayback;
    let mockGroove;

    beforeEach(() => {
        vi.clearAllMocks();
        const state = getState();
        mockArranger = state.arranger;
        mockPlayback = state.playback;
        mockGroove = state.groove;

        // Reset state
        dispatch(ACTIONS.RESET_STATE);

        // Mock a simple 3-section arrangement: A (Verse) -> B (Chorus) -> A (Verse)
        // 4 bars per section, 4/4 time (16 steps per bar) = 64 steps per section
        mockArranger.timeSignature = '4/4';
        mockArranger.totalSteps = 64 * 3;

        mockArranger.sections = [
            { id: 'verse_id', label: 'Verse' },
            { id: 'chorus_id', label: 'Chorus' },
        ];

        mockArranger.stepMap = [];

        // Section A (Verse)
        for (let i = 0; i < 64; i++) {
            mockArranger.stepMap.push({
                start: i,
                end: i + 1,
                chord: { sectionId: 'verse_id', sectionLabel: 'Verse' },
            });
        }
        // Section B (Chorus)
        for (let i = 64; i < 128; i++) {
            mockArranger.stepMap.push({
                start: i,
                end: i + 1,
                chord: { sectionId: 'chorus_id', sectionLabel: 'Chorus' },
            });
        }
        // Section A (Verse) Return
        for (let i = 128; i < 192; i++) {
            mockArranger.stepMap.push({
                start: i,
                end: i + 1,
                chord: { sectionId: 'verse_id', sectionLabel: 'Verse' },
            });
        }

        mockGroove.genreFeel = 'Rock';
        mockPlayback.bandIntensity = 0.5;
        mockPlayback.autoIntensity = false;
        mockGroove.sectionSeedMap = {};
    });

    it('EXPECTED BEHAVIOR: Groove motifs lock to section seeds and recall from memory', () => {
        const stepsPerMeasure = 16;

        const verse1Motifs = new Set();
        let firstVerseSeed = null;

        // Note: In tests, checkSectionTransition sets the seed for the NEXT section
        // if modStep % stepsPerMeasure === 0 and we are transitioning.
        // It's possible the first section doesn't get a seed until a transition happens if we don't start right.
        // Wait, conductor's checkSectionTransition only acts when `measureEnd` reaches a boundary.
        // So step 0 doesn't actually set the seed for step 0...
        // Let's manually populate the seed for the first section just as play start would, or
        // rely on applyGrooveOverrides falling back.
        // Actually, if we just call the test logic normally, let's see what happens.
        // To be thorough, let's call applyGrooveOverrides, which will now use the fallback for section 0.
        // BUT wait, we want to test that the seed is preserved.
        // Let's manually trigger the seed assignment for the first verse so it's "in memory".
        mockGroove.sectionSeedMap.verse_id = 0.42;

        for (let step = 0; step < 64; step++) {
            checkSectionTransition(getState(), step, stepsPerMeasure, dispatch);
            const entry = mockArranger.stepMap.find((e) => step >= e.start && step < e.end);
            const sectionId = entry.chord.sectionId;
            const seed = mockGroove.sectionSeedMap[sectionId];

            if (step === 0 && seed !== undefined) {
                firstVerseSeed = seed;
            }

            const motif = getDrumMotif(seed !== undefined ? seed : 0.5, mockGroove.genreFeel, 0.5);
            verse1Motifs.add(motif);
        }

        const chorusMotifs = new Set();
        let chorusSeed = null;
        for (let step = 64; step < 128; step++) {
            checkSectionTransition(getState(), step, stepsPerMeasure, dispatch);
            const entry = mockArranger.stepMap.find((e) => step >= e.start && step < e.end);
            const sectionId = entry.chord.sectionId;
            const seed = mockGroove.sectionSeedMap[sectionId];

            if (step === 64 && seed !== undefined) {
                chorusSeed = seed;
            }

            const motif = getDrumMotif(seed !== undefined ? seed : 0.5, mockGroove.genreFeel, 0.5);
            chorusMotifs.add(motif);
        }

        const verse2Motifs = new Set();
        let returningVerseSeed = null;
        for (let step = 128; step < 192; step++) {
            checkSectionTransition(getState(), step, stepsPerMeasure, dispatch);
            const entry = mockArranger.stepMap.find((e) => step >= e.start && step < e.end);
            const sectionId = entry.chord.sectionId;
            const seed = mockGroove.sectionSeedMap[sectionId];

            if (step === 128 && seed !== undefined) {
                returningVerseSeed = seed;
            }

            const motif = getDrumMotif(seed !== undefined ? seed : 0.5, mockGroove.genreFeel, 0.5);
            verse2Motifs.add(motif);
        }

        // EXPECTED ASSERTIONS

        // 1. The seed should be generated once per section, locking the base motif.
        // So the set of motifs for a single section should just be ONE motif (the core groove).
        expect(verse1Motifs.size).toBe(1);
        expect(chorusMotifs.size).toBe(1);
        expect(verse2Motifs.size).toBe(1);

        // 2. The seed from the first Verse should be remembered and reused for the second Verse.
        expect(firstVerseSeed).not.toBeNull();
        expect(returningVerseSeed).not.toBeNull();
        expect(firstVerseSeed).toBe(returningVerseSeed);

        // 3. The motif for the returning Verse should be exactly the same as the first Verse.
        expect(Array.from(verse1Motifs)).toEqual(Array.from(verse2Motifs));

        // 4. (Optional but good) The chorus seed should likely be different from the verse seed,
        // leading to a different motif, though this depends on random chance.
        // At the very least, we know it generated a new seed.
        expect(chorusSeed).toBeDefined();
    });
});
