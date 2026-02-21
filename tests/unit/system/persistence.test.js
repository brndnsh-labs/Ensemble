/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatch, getState, storage } from '../../../public/state.js';
import { saveCurrentState } from '../../../public/persistence.js';

// Mock storage
vi.mock('../../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    const mockStorage = {
        save: vi.fn(),
        get: vi.fn()
    };
    
    const mockStateMap = {
        playback: { ...actual.playback },
        arranger: { ...actual.arranger, sections: [], key: 'C', timeSignature: '4/4' },
        groove: { ...actual.groove, enabled: true, instruments: [{ name: 'Kick', steps: new Array(16).fill(0) }] },
        chords: { ...actual.chords, enabled: true, pianoRoots: true },
        bass: { ...actual.bass, enabled: true },
        soloist: { ...actual.soloist, enabled: true },
        harmony: { ...actual.harmony, enabled: false },
        vizState: { ...actual.vizState },
        midi: { ...actual.midi },
        storage: mockStorage,
        dispatch: vi.fn()
    };

    return {
        ...mockStateMap,
        getState: () => mockStateMap,
        storage: mockStorage
    };
});

describe('Persistence Integrity', () => {
    let arranger, playback, groove;

    beforeEach(() => {
        vi.clearAllMocks();
        const state = getState();
        arranger = state.arranger;
        playback = state.playback;
        groove = state.groove;
    });

    it('should save the complete state accurately', () => {
        // Setup a complex state
        arranger.sections = [{ id: 's1', label: 'Verse', value: 'I' }];
        arranger.key = 'Gb';
        playback.bpm = 115;
        groove.genreFeel = 'Bossa Nova';
        groove.instruments[0].steps[0] = 1; // Kick on 1
        
        saveCurrentState();
        
        expect(storage.save).toHaveBeenCalledWith('currentState', expect.any(Object));
        const savedData = vi.mocked(storage.save).mock.calls[0][1];
        
        expect(savedData.key).toBe('Gb');
        expect(savedData.bpm).toBe(115);
        expect(savedData.groove.genreFeel).toBe('Bossa Nova');
        expect(savedData.sections[0].label).toBe('Verse');
        
        // Check drum pattern serialization
        const kickPattern = savedData.groove.pattern.find(i => i.name === 'Kick');
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
        expect(savedData.chords).toHaveProperty('pianoRoots');
        expect(savedData.groove).toHaveProperty('followPlayback');
        expect(savedData.groove).toHaveProperty('humanize');
        expect(savedData.groove).toHaveProperty('creativity');
        expect(savedData.groove).toHaveProperty('sectionSeedMap');
    });
});
