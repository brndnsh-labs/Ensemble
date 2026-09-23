/**
 * The comp lane's instruments. A style writes one comping book per *family* (a keyboard
 * book, a guitar book); the instrument picks the family and adds what is physical about
 * it — its range, whether a chord is rolled by a strum, whether it sustains.
 */
import type { CompInstrument } from '../../core/types.js';

export interface CompProfile {
    family: 'keyboard' | 'guitar';
    /** Lowest and highest note the instrument can play in this lane (MIDI). */
    range: readonly [number, number];
    /**
     * Milliseconds between adjacent strings of a stroked chord. A pick across four strings
     * spreads over ~20 ms; fingers plucking together (nylon) barely roll at all.
     */
    strumMs: number;
    /** A sustaining instrument holds each chord until the next one (the organ's pad). */
    legato: boolean;
    /** General MIDI program, for the `.mid` sink. */
    program: number;
}

export const COMP_INSTRUMENTS: Record<CompInstrument, CompProfile> = {
    piano: { family: 'keyboard', range: [52, 84], strumMs: 0, legato: false, program: 0 },
    rhodes: { family: 'keyboard', range: [52, 84], strumMs: 0, legato: false, program: 4 },
    organ: { family: 'keyboard', range: [52, 84], strumMs: 0, legato: true, program: 16 },
    clav: { family: 'keyboard', range: [52, 84], strumMs: 0, legato: false, program: 7 },
    // Guitars keep their physical range: the grips themselves stay off the low strings when
    // a bass is playing (see `fretboard.ts`), and a bossa thumb may use them when it isn't.
    guitar: { family: 'guitar', range: [40, 81], strumMs: 6, legato: false, program: 27 },
    nylon: { family: 'guitar', range: [40, 79], strumMs: 3, legato: false, program: 24 },
};
