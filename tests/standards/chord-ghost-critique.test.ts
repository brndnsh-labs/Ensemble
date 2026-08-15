// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getState } from '../../public/state.js';
import { makeSoloistMock } from '../utils/mock-soloist.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('#938 — audible chord-ghost articulation critique', () => {
    const chord = {
        rootMidi: 60,
        quality: '9',
        intervals: [0, 4, 7, 10, 14],
        freqs: [261.63, 329.63, 392, 466.16, 587.33],
        sectionId: 'A',
    };
    let state;
    let compingSnapshot;

    beforeEach(() => {
        state = {
            playback: {
                bandIntensity: 0.7,
                complexity: 0.7,
                step: 0,
                intent: { anticipation: 0, layBack: 0, syncopation: 0 },
            },
            groove: { genreFeel: 'Funk', pocket: 0, instruments: [] },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0, lastFreq: 0 }),
            bass: { enabled: true, lastFreq: 110 },
            harmony: { enabled: false },
            chords: { enabled: true, style: 'smart', density: 'balanced' },
            arranger: {
                timeSignature: '4/4',
                totalSteps: 128 * 16,
                progression: [chord],
            },
        };
        getState.mockReturnValue(state);
        compingSnapshot = Object.fromEntries(
            Object.entries(compingState).map(([key, value]) => [
                key,
                Array.isArray(value) ? [...value] : value,
            ]),
        );
        compingState.currentCell = new Array(16).fill(0);
        compingState.lastSectionId = chord.sectionId;
        compingState.lastVoicingMidis = [];
        compingState.lockedUntil = Number.MAX_SAFE_INTEGER;
    });

    afterEach(() => {
        Object.assign(compingState, compingSnapshot);
    });

    it.each([
        { genre: 'Funk', ghostDuration: 0.1, normalDuration: 0.35, ratio: 0.18 / 0.65 },
        { genre: 'Neo-Soul', ghostDuration: 0.5, normalDuration: 2.5, ratio: 0.2 / 0.55 },
    ])('$genre ghosts are real, short attacks at the authored reduced velocity', (profile) => {
        state.groove.genreFeel = profile.genre;

        let ghostStep = -1;
        let ghostNotes = [];
        for (let step = 0; step < state.arranger.totalSteps; step++) {
            const measureStep = step % 16;
            const notes = getAccompanimentNotes(
                getState(),
                chord,
                step,
                measureStep,
                measureStep,
                {
                    isBeatStart: measureStep % 4 === 0,
                    isMeasureStart: measureStep === 0,
                },
                {},
            ).filter((note) => note.midi > 0);
            if (notes.some((note) => note.durationSteps === profile.ghostDuration)) {
                ghostStep = step;
                ghostNotes = notes;
                break;
            }
        }

        expect(ghostStep).toBeGreaterThanOrEqual(0);
        expect(ghostNotes).not.toHaveLength(0);
        expect(ghostNotes.every((note) => note.muted === false)).toBe(true);
        expect(ghostNotes.every((note) => note.velocity > 0)).toBe(true);

        const measureStep = ghostStep % 16;
        compingState.currentCell[measureStep] = 1;
        const normalNotes = getAccompanimentNotes(
            getState(),
            chord,
            ghostStep,
            measureStep,
            measureStep,
            {
                isBeatStart: measureStep % 4 === 0,
                isMeasureStart: measureStep === 0,
            },
            {},
        ).filter((note) => note.midi > 0 && note.durationSteps === profile.normalDuration);

        expect(normalNotes).toHaveLength(ghostNotes.length);
        expect(ghostNotes[0].velocity / normalNotes[0].velocity).toBeCloseTo(profile.ratio, 10);
    });
});
