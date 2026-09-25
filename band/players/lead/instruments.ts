/**
 * The lead's instruments. A style writes one lead book; the instrument adds what is physical
 * about it — its range, where it sits most comfortably, whether it breathes, whether it bends.
 */
import type { LeadInstrument } from '../../core/types.js';

export interface LeadProfile {
    family: 'horn' | 'guitar';
    /** Lowest and highest note the lead plays (MIDI, sounding). */
    range: readonly [number, number];
    /** The middle of its singing register: where lines start and return to. */
    home: number;
    /** Strings bend: a guitar leans into a note from below by a half or whole step. */
    bends: boolean;
    /** General MIDI program, for the `.mid` sink. */
    program: number;
}

// Ranges are the instruments' comfortable solo registers, inside the lead's slot (≥ 52): the
// extreme ends of each horn and the guitar's top frets are for climaxes, not for lines.
export const LEAD_INSTRUMENTS: Record<LeadInstrument, LeadProfile> = {
    // Alto sax sounds a major sixth below written: its low Bb sounds Db3 (49) and its written
    // high F sounds Ab5 (80). The lead keeps off the honky bottom fourth, and allows one step
    // of altissimo (Bb5) for a climax.
    sax: { family: 'horn', range: [53, 82], home: 67, bends: false, program: 65 },
    // Trumpet sounds a whole step below written: written high C sounds Bb5 (82).
    trumpet: { family: 'horn', range: [55, 82], home: 69, bends: false, program: 56 },
    guitar: { family: 'guitar', range: [55, 86], home: 69, bends: true, program: 27 },
    overdrive: { family: 'guitar', range: [55, 88], home: 71, bends: true, program: 29 },
    nylon: { family: 'guitar', range: [52, 81], home: 66, bends: true, program: 24 },
};
