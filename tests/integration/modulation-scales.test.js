/* eslint-disable */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../../public/state.js', () => {
    const mockState = {
        soloist: { tension: 0.5 },
        chords: { density: 'standard', octave: 60, pianoRoots: true },
        playback: { bandIntensity: 0.5, bpm: 120 },
        arranger: {
            key: 'C',
            isMinor: false,
            progression: [],
            timeSignature: '4/4',
        },
        groove: { genreFeel: 'Jazz' },
        bass: { enabled: true },
        harmony: { enabled: false },
        vizState: {},
        midi: {},
        storage: {},
        dispatch: vi.fn(),
    };
    return {
        ...mockState,
        stateMap: mockState,
        getState: () => mockState,
    };
});

vi.mock('../../public/config.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    };
});

vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { validateProgression } from '../../public/engine/chords-engine.js';
import { getScaleForChord } from '../../public/engine/theory-scales.js';
import { getState } from '../../public/state.js';

const { arranger } = getState();

describe('Modulation Scale Selection Integration', () => {
    beforeEach(() => {
        arranger.key = 'C';
        arranger.isMinor = false;
        arranger.sections = [];
        arranger.progression = [];
    });

    it('should identify bVII7 (Backdoor Dominant) correctly in a modulated section', () => {
        // Global Key: C Major
        // Section Key: G Major
        // Chord: F7 (bVII7 in G Major)
        // Expectation: Lydian Dominant scale (contains #11 -> B natural)
        // F7 Roots: F (5).
        // Lydian Dom on F: F(5), G(7), A(9), B(11), C(0), D(2), Eb(3).
        // #11 of F is B (11).

        arranger.sections = [
            { id: 'A', label: 'Modulation', value: 'F7', key: 'G', timeSignature: '4/4' },
        ];

        // Trigger the progression parser
        validateProgression(getState());

        const f7Chord = arranger.progression[0];
        expect(f7Chord).toBeDefined();
        expect(f7Chord.absName).toBe('F7');
        expect(f7Chord.rootMidi % 12).toBe(5); // F

        // Get scale using 'bird' (Jazz) style and honor the local section key.
        const scale = getScaleForChord(getState(), f7Chord, null, 'bird');

        expect(scale).toEqual([0, 2, 4, 6, 7, 9, 10]);

        // Convert scale intervals to absolute pitch classes.
        const scalePCs = scale
            .map((interval) => (f7Chord.rootMidi + interval) % 12)
            .sort((a, b) => a - b);

        expect(scalePCs).toContain(11); // B natural = #11 of F
        expect(scalePCs).not.toContain(10); // Bb would imply plain Mixolydian
    });
});
