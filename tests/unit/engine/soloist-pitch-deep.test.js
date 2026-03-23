import { beforeEach, describe, expect, it } from 'vitest';
import { SOLOIST_INTENTS } from '../../../public/engine/soloist-config.js';
import { selectPitchAndDevices } from '../../../public/engine/soloist-pitch-engine.js';
import { getState } from '../../../public/state.js';

describe('Soloist Pitch Engine Deep Dive', () => {
    let args;

    beforeEach(() => {
        args = [
            0, // step
            { velocity: 0.8, durationSteps: 4, isStrongBeat: true }, // rhythmNode
            { rootMidi: 60, intervals: [0, 4, 7], freqs: [] }, // currentChord
            null, // nextChord
            'scalar', // activeStyle
            0.5, // intensity
            0, // stepInChord
            {}, // coordination
            { currentLoopCount: 0 }, // playback
            { mode: 'monophonic', tension: 0.5, lastMidiPlayed: 60, dynamicCenter: 60 }, // soloistState
            { pocket: 0 }, // groove
            {}, // _arranger
            16, // stepsPerMeasure
            4, // stepsPerBeat
            SOLOIST_INTENTS.CONSERVATIVE, // intent
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

    it('should favor repeating the last note when it is a stable common tone', () => {
        let repeats = 0;
        const iterations = 100;
        const state = getState();
        args[4] = 'rock';
        for (let i = 0; i < iterations; i++) {
            args[9].lastMidiPlayed = 60; // Force back to 60
            const res = selectPitchAndDevices(state, ...args);
            if (res.midi === 60) {
                repeats++;
            }
        }
        expect(repeats).toBeGreaterThan(20);
    });

    it('should penalize repetition of dissonant intervals in non-jazz styles', () => {
        args[2] = { rootMidi: 60, quality: '7b9', intervals: [0, 4, 7, 10, 13] }; // C7b9
        args[4] = 'metal'; // Metal uses Phrygian Dominant for 7b9 which includes 61

        const state = getState();
        let dissonantRepeats = 0;
        const iterations = 100;
        for (let i = 0; i < iterations; i++) {
            args[9].lastMidiPlayed = 61; // Force back to dissonant 61
            const res = selectPitchAndDevices(state, ...args);
            if (res.midi === 61) {
                dissonantRepeats++;
            }
        }
        expect(dissonantRepeats).toBeLessThan(10);
    });

    it('should allow more repetition in Jazz style even if slightly dissonant', () => {
        args[2] = { rootMidi: 60, quality: '7alt', intervals: [0, 4, 10] }; // C7alt
        args[4] = 'jazz'; // Jazz uses Altered scale for 7alt which includes 61
        args[14] = SOLOIST_INTENTS.CONSERVATIVE;

        let repeats = 0;
        const iterations = 100;
        const state = getState();
        for (let i = 0; i < iterations; i++) {
            args[9].lastMidiPlayed = 61; // Force back to 61
            const res = selectPitchAndDevices(state, ...args);
            if (res.midi === 61) {
                repeats++;
            }
        }
        expect(repeats).toBeGreaterThan(15);
    });
});
