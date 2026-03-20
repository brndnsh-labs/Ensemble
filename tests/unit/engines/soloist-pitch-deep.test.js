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
            { bpm: 120, currentLoopCount: 1 }, // playback
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
});
