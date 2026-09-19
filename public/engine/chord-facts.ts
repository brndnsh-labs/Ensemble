import type { Chord } from '../types.js';

/** Harmonic content before a player chooses register, doublings, or added color. */
export interface ChordFacts {
    root: number;
    bass: number;
    tones: number[];
    defining: number[];
}

// Literal chart qualities, independent of genre, intensity and the comper's
// rootless/colored `Chord.intervals`. Compound intervals retain their meaning
// here; the guitar converts them to pitch classes when choosing a shape.
const QUALITIES: Readonly<Record<string, readonly number[]>> = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    '7': [0, 4, 7, 10],
    maj7: [0, 4, 7, 11],
    dim: [0, 3, 6],
    halfdim: [0, 3, 6, 10],
    aug: [0, 4, 8],
    augmaj7: [0, 4, 8, 11],
    sus2: [0, 2, 7],
    sus4: [0, 5, 7],
    '7sus4': [0, 5, 7, 10],
    add2: [0, 2, 4, 7],
    add9: [0, 4, 7, 14],
    '6': [0, 4, 7, 9],
    m6: [0, 3, 7, 9],
    // #1321/#1322/#1323 — a quality missing from this table falls back to MAJOR, which
    // would hand the guitar/piano voicers a major 3rd over a minor chord.
    mMaj7: [0, 3, 7, 11],
    madd9: [0, 3, 7, 14],
    '9sus4': [0, 5, 7, 10, 14],
    '13sus4': [0, 5, 7, 10, 14, 21],
    '6/9': [0, 4, 7, 9, 14],
    '9': [0, 4, 7, 10, 14],
    maj9: [0, 4, 7, 11, 14],
    m9: [0, 3, 7, 10, 14],
    '11': [0, 5, 7, 10, 14, 17],
    maj11: [0, 4, 7, 11, 14, 17],
    m11: [0, 3, 7, 10, 14, 17],
    '13': [0, 4, 7, 10, 14, 21],
    maj13: [0, 4, 7, 11, 14, 21],
    m13: [0, 3, 7, 10, 14, 21],
    'maj7#11': [0, 4, 7, 11, 18],
    '7#11': [0, 4, 7, 10, 18],
    '7b9': [0, 4, 7, 10, 13],
    '7#9': [0, 4, 7, 10, 15],
    '7b13': [0, 4, 7, 10, 20],
    '7b5': [0, 4, 6, 10],
    '7alt': [0, 4, 10, 13, 15, 18, 20],
    '5': [0, 7],
};

export function chordFacts(
    chord: Pick<Chord, 'rootMidi' | 'bassMidi' | 'quality' | 'is7th'>,
): ChordFacts {
    const root = ((chord.rootMidi % 12) + 12) % 12;
    const intervals = [
        ...(Object.hasOwn(QUALITIES, chord.quality) ? QUALITIES[chord.quality] : QUALITIES.major),
    ];
    if (chord.is7th && ['major', 'minor', 'aug', 'dim'].includes(chord.quality)) {
        intervals.push(chord.quality === 'dim' ? 9 : 10);
    }
    // The third/suspension, seventh, and named upper extension define a reduced
    // guitar voicing. Perfect fifths and intermediate extensions may be omitted.
    const defining = intervals.filter(
        (i) => i !== 0 && i !== 7 && (i < 12 || i === intervals.at(-1)),
    );
    if (chord.quality === '7alt') {
        defining.splice(0, defining.length, 4, 10, 13);
    }
    const pc = (i: number) => (root + i) % 12;
    return {
        root,
        bass: chord.bassMidi == null ? root : ((chord.bassMidi % 12) + 12) % 12,
        tones: [...new Set(intervals.map(pc))],
        defining: [...new Set(defining.map(pc))],
    };
}
