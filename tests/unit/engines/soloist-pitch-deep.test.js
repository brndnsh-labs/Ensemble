import { beforeEach, describe, expect, it, vi } from 'vitest';
import { selectPitchAndDevices } from '../../../public/engine/soloist-pitch-engine.js';
import { getState } from '../../../public/state.js';

describe('Soloist Pitch Engine Deep Dive', () => {
    let args;

    beforeEach(() => {
        args = [
            0, // step
            { type: 'note', duration: 1 }, // rhythmNode
            { rootMidi: 60, intervals: [0, 4, 7], freqs: [] }, // currentChord
            null, // nextChord
            'scalar', // activeStyle
            0.5, // intensity
            0, // stepInChord
            {}, // coordination
            { bpm: 120 }, // playback
            { mode: 'monophonic', tension: 0.5, lastMidi: 60, dynamicCenter: 60 }, // soloistState
            { humanize: 0 }, // groove
            {}, // _arranger
            16, // stepsPerMeasure
            4, // stepsPerBeat
        ];
    });

    it('should exercise Miles Davis modal style emphasis', () => {
        args[4] = 'miles';
        const result = selectPitchAndDevices(getState(), ...args);
        expect(result).toBeDefined();
    });

    it('should exercise Charlie Parker bebop style emphasis', () => {
        args[4] = 'bird';
        const result = selectPitchAndDevices(getState(), ...args);
        expect(result).toBeDefined();
    });

    it('should exercise Louis Armstrong classic style emphasis', () => {
        args[4] = 'armstrong';
        const result = selectPitchAndDevices(getState(), ...args);
        expect(result).toBeDefined();
    });

    it('should exercise Thelonious Monk dissonant style emphasis', () => {
        args[4] = 'monk';
        const result = selectPitchAndDevices(getState(), ...args);
        expect(result).toBeDefined();
    });

    it('should exercise Bill Evans upper extensions emphasis', () => {
        args[4] = 'evans';
        const result = selectPitchAndDevices(getState(), ...args);
        expect(result).toBeDefined();
    });

    it('should disable melodic devices during Loop 0 if seed exists', () => {
        // Set Loop 0 and provide a seed
        args[9] = { playback: { currentLoopCount: 0 } };
        args[10].sessionSeed = { notes: [{ step: 0, midi: 60 }], loopLengthSteps: 16 };
        args[6] = 1.0; // Max intensity, which usually triggers devices

        const result = selectPitchAndDevices(getState(), ...args);

        // Result should be a single clean note, not a device buffer array or an embellished note
        expect(Array.isArray(result)).toBe(false);
        if (!Array.isArray(result) && result !== null) {
            expect(result.bendStartInterval).toBe(0);
        }
    });
});
