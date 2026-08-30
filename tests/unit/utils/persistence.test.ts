// @ts-nocheck
/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveCurrentState } from '../../../public/state/persistence.js';
import { getState, storage } from '../../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Mock storage
vi.mock('../../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    const { bass, chords, harmony, soloist } = await import('../../../public/state/instruments.js');
    const { groove } = await import('../../../public/state/groove.js');
    const { midi } = await import('../../../public/state/midi.js');
    const { vizState } = await import('../../../public/state/visualizer.js');
    const mockStorage = {
        save: vi.fn(),
        get: vi.fn(),
    };

    const mockStateMap = {
        playback: { ...actual.playback },
        arranger: { ...actual.arranger, sections: [], key: 'C', timeSignature: '4/4' },
        groove: {
            ...groove,
            enabled: true,
            instruments: [{ name: 'Kick', steps: new Array(16).fill(0) }],
        },
        chords: { ...chords, enabled: true },
        bass: { ...bass, enabled: true },
        soloist: makeSoloistMock({ ...soloist, enabled: true }),
        harmony: { ...harmony, enabled: false },
        vizState: { ...vizState },
        midi: { ...midi },
        storage: mockStorage,
        dispatch: vi.fn(),
    };

    return {
        ...mockStateMap,
        stateMap: mockStateMap,
        getState: () => mockStateMap,
        storage: mockStorage,
    };
});

describe('Persistence Integrity', () => {
    let arranger, playback, groove, midi;

    beforeEach(() => {
        vi.clearAllMocks();
        const state = getState();
        arranger = state.arranger;
        playback = state.playback;
        groove = state.groove;
        midi = state.midi;
    });

    it('should save the complete state accurately', () => {
        // Setup a complex state
        arranger.sections = [{ id: 's1', label: 'Verse', value: 'I' }];
        arranger.key = 'Gb';
        arranger.timeSignature = '5/4';
        arranger.grouping = [2, 3];
        playback.bpm = 115;
        playback.complexity = 0.64;
        groove.genreFeel = 'Bossa Nova';
        groove.instruments[0].steps[0] = 1; // Kick on 1

        saveCurrentState();

        expect(storage.save).toHaveBeenCalledWith('currentState', expect.any(Object));
        const savedData = vi.mocked(storage.save).mock.calls[0][1];

        expect(savedData.key).toBe('Gb');
        expect(savedData.bpm).toBe(115);
        expect(savedData.complexity).toBe(0.64);
        expect(savedData.grouping).toEqual([2, 3]);
        expect(savedData.groove.genreFeel).toBe('Bossa Nova');
        expect(savedData.sections[0].label).toBe('Verse');
        expect(savedData.mixerVersion).toBe(2);

        // Check drum pattern serialization
        const kickPattern = savedData.groove.pattern.find((i) => i.name === 'Kick');
        expect(kickPattern.steps[0]).toBe(1);
    });

    it('should include all required module properties (chords, bass, soloist, groove)', () => {
        saveCurrentState();
        const savedData = vi.mocked(storage.save).mock.calls[0][1];

        expect(savedData.chords).toBeDefined();
        expect(savedData.bass).toBeDefined();
        expect(savedData.soloist).toBeDefined();
        expect(savedData.groove).toBeDefined();

        // Specific checks for persistence keys
        expect(savedData.chords).toHaveProperty('density');
        expect(savedData.groove).toHaveProperty('humanize');
        expect(savedData.groove).toHaveProperty('sectionSeedMap');
    });

    it('should persist play-along inputEnabled and selectedInputId (#1038)', () => {
        midi.inputEnabled = true;
        midi.selectedInputId = 'device-42';

        saveCurrentState();

        const savedData = vi.mocked(storage.save).mock.calls[0][1];
        expect(savedData.midi.inputEnabled).toBe(true);
        expect(savedData.midi.selectedInputId).toBe('device-42');
    });

    it('persists the goal tempo (rampBpmTarget), not the momentarily-ramped bpm, while a practice drill is in flight (#1145)', () => {
        // Mid-climb: the drill dropped from 120 (the goal, captured at play-start
        // into rampBpmTarget) to a start speed and is ramping back up — bpm here
        // is a transient in-drill value, not the tempo that should survive reload.
        playback.rampBpmTarget = 120;
        playback.bpm = 84;

        saveCurrentState();

        const savedData = vi.mocked(storage.save).mock.calls[0][1];
        expect(savedData.bpm).toBe(120);
    });

    it('persists the live bpm as-is when no drill is armed (#1145)', () => {
        playback.rampBpmTarget = 0;
        playback.bpm = 132;

        saveCurrentState();

        const savedData = vi.mocked(storage.save).mock.calls[0][1];
        expect(savedData.bpm).toBe(132);
    });

    it('#1064 — persists the user-authored chords.density/harmony.complexity, never the conductor runtime mirrors', () => {
        const state = getState();
        state.chords.density = 'rich';
        state.harmony.complexity = 0.2;
        // Diverge the conductor's runtime-derived mirrors from the document
        // fields to prove the save reads the latter, not the former.
        playback.conductorDensity = 'thin';
        playback.conductorHarmonyComplexity = 0.9;

        saveCurrentState();

        const savedData = vi.mocked(storage.save).mock.calls[0][1];
        expect(savedData.chords.density).toBe('rich');
        expect(savedData.harmony.complexity).toBe(0.2);
    });
});
