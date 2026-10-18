/** `compForChordsLane`: which instrument's book the comp plays for the chords lane's sound. */
import { describe, expect, it } from 'vitest';
import { compForChordsLane, VOICE_FOR_COMP } from './band-voices';

describe('compForChordsLane', () => {
    it('the built-in voice on Auto plays the style’s own instrument', () => {
        expect(compForChordsLane({ voice: 'synth', autoSound: true }, 'clav')).toBe('clav');
        expect(compForChordsLane({ voice: 'synth', autoSound: true }, 'nylon')).toBe('nylon');
    });

    it('the built-in voice chosen by hand is a piano, whatever the style prefers', () => {
        expect(compForChordsLane({ voice: 'synth', autoSound: false }, 'clav')).toBe('piano');
        expect(compForChordsLane({ voice: 'synth' }, 'guitar')).toBe('piano');
    });

    it('a pack names its instrument, on Auto or pinned', () => {
        for (const [comp, voice] of Object.entries(VOICE_FOR_COMP)) {
            expect(compForChordsLane({ voice, autoSound: true }, 'piano')).toBe(comp);
            expect(compForChordsLane({ voice, autoSound: false }, 'clav')).toBe(comp);
        }
        const crunch = { voice: 'pack:electric-guitar-rhythm', autoSound: true };
        expect(compForChordsLane(crunch, 'piano')).toBe('guitar');
    });

    it('an unknown or prototype-named sound is a piano', () => {
        expect(compForChordsLane({ voice: 'constructor', autoSound: false }, 'clav')).toBe('piano');
        expect(compForChordsLane({ voice: 'pack:retired', autoSound: true }, 'clav')).toBe('piano');
    });
});
