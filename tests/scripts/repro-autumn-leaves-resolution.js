import { generateResolutionNotes } from '../../public/resolution.js';
import { midiToNote } from '../../public/utils.js';

// Mock State for Autumn Leaves (ending on Gm7 in Key of Bb)
const arranger = {
    key: 'Bb',
    isMinor: false,
    stepMap: [
        // ... previous chords ...
        {
            start: 60,
            end: 64,
            chord: {
                key: 'Bb',
                value: 'vi7',
                rootMidi: 67, // G3 (or G4?)
                quality: 'Minor',
            },
        },
    ],
};

const enabled = {
    bass: true,
    chords: true,
    soloist: true,
    harmony: true,
    groove: true,
};

const groove = {
    genreFeel: 'Jazz',
};

const soloist = {
    style: 'bird',
    octave: 72,
};

console.log('--- Simulating Autumn Leaves Resolution ---');
const notes = generateResolutionNotes(64, arranger, enabled, 140, groove, soloist);

// Filter for Chord notes on the FINAL step (I)
// Jazz cadence is ii (0), V (2), I (4)
const finalChordNotes = notes.filter(
    (n) => n.module === 'chords' && n.timingOffset >= 4 * (60 / 140),
);

console.log(`Generated ${finalChordNotes.length} notes for the final chord.`);

if (finalChordNotes.length > 0) {
    const midis = finalChordNotes.map((n) => n.midi).sort((a, b) => a - b);
    console.log('Final Chord MIDIs:', midis);

    // Analyze the third relative to G (Root is likely G)
    // G = 7, 19, 31, 43, 55, 67, 79...
    // We expect root around 67 (G4) or 55 (G3).
    // Let's assume root is G.

    // Check for Bb (Minor 3rd) vs B (Major 3rd)
    const hasBb = midis.some((m) => m % 12 === 10);
    const hasB = midis.some((m) => m % 12 === 11);

    if (hasBb && !hasB) {
        console.log('Result: G MINOR (Authentic)');
    } else if (hasB && !hasBb) {
        console.log('Result: G MAJOR (Picardy Third)');
    } else {
        console.log('Result: Ambiguous / Other');
    }

    // Check bass note
    const bassNotes = notes.filter((n) => n.module === 'bass' && n.timingOffset >= 4 * (60 / 140));
    if (bassNotes.length > 0) {
        const bassMidi = bassNotes[0].midi;
        const bassNote = midiToNote(bassMidi);
        console.log(`Final Bass Note: ${bassNote.name}${bassNote.octave} (${bassMidi})`);
    }
}
