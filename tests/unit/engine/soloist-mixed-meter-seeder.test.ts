// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { unrollArrangement } from '../../../public/engine/arranger-utils.js';
import { generateSessionSeed } from '../../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

function buildMixedMeterState() {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: 'Rock' });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.85);
    const state = getState();

    const chord = (sectionId, timeSignature) => ({
        rootMidi: 60,
        intervals: [0, 4, 7],
        quality: 'major',
        sectionId,
        sectionLabel: 'Verse',
        timeSignature,
    });
    // Two 7/8 bars followed by two 4/4 bars. The unroller assigns both ranges
    // the same virtual role (Intro on its first pass), which is the exact cache
    // collision: category alone is identical while the beat-offset grids are not.
    state.arranger.timeSignature = '7/8';
    state.arranger.grouping = null;
    state.arranger.totalSteps = 60;
    state.arranger.measureMap = [
        { start: 0, end: 14, ts: '7/8' },
        { start: 14, end: 28, ts: '7/8' },
        { start: 28, end: 44, ts: '4/4' },
        { start: 44, end: 60, ts: '4/4' },
    ];
    state.arranger.stepMap = [
        { start: 0, end: 14, chord: chord('verse-78-a', '7/8') },
        { start: 14, end: 28, chord: chord('verse-78-b', '7/8') },
        { start: 28, end: 44, chord: chord('verse-44-a', '4/4') },
        { start: 44, end: 60, chord: chord('verse-44-b', '4/4') },
    ];
    state.arranger.sectionMap = [
        { id: 'verse-78', start: 0, end: 28, label: 'Verse', timeSignature: '7/8' },
        { id: 'verse-44', start: 28, end: 60, label: 'Verse', timeSignature: '4/4' },
    ];
    return state;
}

describe('soloist seeder mixed-meter motif identity', () => {
    it('composes same-role 7/8 and 4/4 ranges on their own two-bar grids', () => {
        const state = buildMixedMeterState();
        const unrolled = unrollArrangement(state.arranger, 128);
        expect(unrolled.sectionMap.slice(0, 2)).toMatchObject([
            { start: 0, end: 28, label: 'Intro', timeSignature: '7/8' },
            { start: 28, end: 60, label: 'Intro', timeSignature: '4/4' },
        ]);

        const seed = generateSessionSeed(state, state.arranger, 'smart', 0.85, 'MIXED_METER_CACHE');
        const firstPassNotes = seed.notes.filter((note) => note.step >= 0 && note.step < 60);
        const bars = [
            [0, 14],
            [14, 28],
            [28, 44],
            [44, 60],
        ];

        // Both measures of both meter segments retain authored material. This is
        // the liveness half of the contract; the duration assertion below is the
        // discriminator that catches category-only cross-meter reuse.
        for (const [start, end] of bars) {
            expect(firstPassNotes.some((note) => note.step >= start && note.step < end)).toBe(true);
        }
        // This seed chooses a quarter-note hook cell for the 4/4 range. A fresh
        // 4/4 motif therefore carries 4-step hook durations; category-only reuse
        // leaks the 7/8 motif's 2-step eighth-note durations into this same role.
        const fourFourHookDurations = firstPassNotes
            .filter((note) => note.step >= 28 && note.step < 44 && note.hookRole)
            .map((note) => note.durationSteps);
        expect(fourFourHookDurations).toEqual([4, 4]);
    });
});
