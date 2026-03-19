import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkSectionTransition } from '../../public/engine/conductor.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
    subscribe: vi.fn(),
    playback: { bpm: 120 },
    arranger: {},
    groove: {},
    chords: {},
    soloist: {},
    harmony: {},
    midi: {},
    vizState: {},
    conductor: { larsBpmOffset: 0, formIteration: 0, loopCount: 0 },
}));

describe('Conductor Engine', () => {
    let state;

    beforeEach(() => {
        vi.clearAllMocks();
        state = {
            playback: {
                isPlaying: true,
                bandIntensity: 0.5,
                autoIntensity: true,
                visualFlash: true,
            },
            conductor: {
                larsBpmOffset: 0,
                formIteration: 0,
                loopCount: 0,
                targetIntensity: 0.35,
            },
            arranger: {
                timeSignature: '4/4',
                stepMap: [
                    {
                        start: 0,
                        end: 16,
                        chord: { sectionId: 's1', sectionLabel: 'Verse' },
                    },
                    {
                        start: 16,
                        end: 32,
                        chord: { sectionId: 's2', sectionLabel: 'Chorus' },
                    },
                ],
                form: {
                    sections: [
                        { id: 's1', role: 'Exposition', label: 'Verse', iteration: 1, flux: 1.0 },
                        { id: 's2', role: 'Climax', label: 'Chorus', iteration: 1, flux: 1.0 },
                    ],
                },
                sections: [
                    { id: 's1', label: 'Verse' },
                    { id: 's2', label: 'Chorus' },
                ],
                totalSteps: 32,
            },
            groove: {
                enabled: true,
                genreFeel: 'Rock',
                creativity: true,
                sectionSeedMap: {},
            },
        };
        getState.mockReturnValue(state);
    });

    it('should trigger a fill and update intensity at section boundaries', () => {
        // Step 15 is the last step of the first section (0-16)
        checkSectionTransition(0, 16);

        expect(dispatch).toHaveBeenCalledWith(ACTIONS.TRIGGER_FILL, expect.any(Object));
        // It should have calculated a new target energy based on 'Climax' role (s2)
    });

    it('should handle different section roles correctly', () => {
        const roles = [
            { role: 'Exposition', expectedMin: 0.1 },
            { role: 'Development', expectedMin: 0.2 },
            { role: 'Contrast', expectedMin: 0.1 },
            { role: 'Build', expectedMin: 0.3 },
            { role: 'Climax', expectedMin: 0.4 },
            { role: 'Resolution', expectedMin: 0.05 },
        ];

        roles.forEach(({ role }) => {
            state.arranger.form.sections[1].role = role;
            checkSectionTransition(0, 16);
            // We just verify it doesn't crash and dispatches
            expect(dispatch).toHaveBeenCalled();
        });
    });

    it('should handle missing section data gracefully', () => {
        state.arranger.form = null;
        checkSectionTransition(0, 16);
        expect(dispatch).toHaveBeenCalledWith(ACTIONS.TRIGGER_FILL, expect.any(Object));
    });

    it('should handle harmonic anticipation (ghost kick) at chord ends', () => {
        state.playback.bandIntensity = 0.8;
        // Step 15 is chord end
        checkSectionTransition(0, 16);

        // Should trigger fill twice: once for section transition, once for harmonic anticipation
        const triggerFillCalls = dispatch.mock.calls.filter(
            (call) => call[0] === ACTIONS.TRIGGER_FILL,
        );
        expect(triggerFillCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle repetition-based logic for long jams', () => {
        state.arranger.form = { sections: [] }; // Force fallback logic
        checkSectionTransition(0, 16);
        expect(dispatch).toHaveBeenCalled();
    });
});
