// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';

const SAMPLE_RATE = 44100;

// Musical Constants
const NOTE_MAP = {
    C: 0,
    'C#': 1,
    Db: 1,
    D: 2,
    'D#': 3,
    Eb: 3,
    E: 4,
    F: 5,
    'F#': 6,
    Gb: 6,
    G: 7,
    'G#': 8,
    Ab: 8,
    A: 9,
    'A#': 10,
    Bb: 10,
    B: 11,
};

const CHORD_INTERVALS = {
    maj7: [0, 4, 7, 11],
    7: [0, 4, 7, 10],
    m7: [0, 3, 7, 10],
    6: [0, 4, 7, 9],
    m6: [0, 3, 7, 9],
    maj: [0, 4, 7],
    m: [0, 3, 7],
    sus4: [0, 5, 7],
    dim: [0, 3, 6],
};

// Helpers
const m2f = (m) => 440 * 2 ** ((m - 69) / 12);

const parseChord = (chordName) => {
    // Regex to split Root and Type (e.g. "Bmaj7" -> "B", "maj7")
    // Roots: C, C#, Db...
    // Types: everything else
    const match = chordName.match(/^([A-G][b#]?)(.*)$/);
    if (!match) {
        return { root: 0, intervals: [0, 4, 7] }; // Default C major
    }

    const rootStr = match[1];
    const typeStr = match[2] || 'maj';

    const rootMidi = NOTE_MAP[rootStr] + 60; // Start at C4 (60)
    const intervals = CHORD_INTERVALS[typeStr] || [0, 4, 7];

    // Voicing: Open it up a bit?
    // Let's keep it closed C4-B4 range primarily
    const freqs = intervals.map((i) => m2f(rootMidi + i));

    // Bass note (Root - 2 octaves)
    const bassFreq = m2f(rootMidi - 24);

    return { freqs, bassFreq };
};

// Synthesis
const saw = (t, freq) => 2 * ((t * freq) % 1) - 1;
const sine = (t, freq) => Math.sin(2 * Math.PI * t * freq);
const tri = (t, freq) => Math.abs(saw(t, freq) * 2) - 1;

// Wav Encoder
function encodeWAV(samples) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, SAMPLE_RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// Presets
const PRESETS = {
    Blues: {
        bpm: 100,
        progression: [
            ['C7'],
            ['F7'],
            ['C7'],
            ['C7'],
            ['F7'],
            ['F7'],
            ['C7'],
            ['C7'],
            ['G7'],
            ['F7'],
            ['C7'],
            ['G7'],
        ],
    },
    GiantSteps: {
        bpm: 220,
        progression: [
            ['Bmaj7', 'D7'],
            ['Gmaj7', 'Bb7'],
            ['Ebmaj7'],
            ['Am7', 'D7'],
            ['Gmaj7', 'Bb7'],
            ['Ebmaj7', 'F#7'],
            ['Bmaj7'],
            ['Fm7', 'Bb7'],
            ['Ebmaj7'],
            ['Am7', 'D7'],
            ['Gmaj7'],
            ['C#m7', 'F#7'],
            ['Bmaj7'],
            ['Fm7', 'Bb7'],
            ['Ebmaj7'],
            ['C#m7', 'F#7'],
        ],
    },
};

const presetName = process.argv[2] || 'Blues';
const preset = PRESETS[presetName];

if (!preset) {
    console.error(`Unknown preset: ${presetName}. Available: ${Object.keys(PRESETS).join(', ')}`);
    process.exit(1);
}

const BPM = preset.bpm;
const BEAT_DUR = 60 / BPM;
const MEASURE_DUR = BEAT_DUR * 4;

console.log(`Generating ${presetName} at ${BPM} BPM...`);

const totalSamples = preset.progression.length * MEASURE_DUR * SAMPLE_RATE;
const output = new Float32Array(totalSamples);

let sampleIdx = 0;

preset.progression.forEach((barChords) => {
    // barChords is array of 1 or 2 chords strings
    const chordsInBar = barChords.length;
    const beatsPerChord = 4 / chordsInBar;

    barChords.forEach((chordName) => {
        const { freqs, bassFreq } = parseChord(chordName);

        // Generate beats for this chord
        for (let b = 0; b < beatsPerChord; b++) {
            const beatStartSample = sampleIdx;
            const beatLen = Math.floor(BEAT_DUR * SAMPLE_RATE);

            // Bass: Pluck on start of chord duration
            // Just simple quarter notes
            for (let i = 0; i < beatLen; i++) {
                const t = i / SAMPLE_RATE;
                const bassEnv = Math.exp(-t * 10);
                const bassVal = (saw(t, bassFreq) + sine(t, bassFreq / 2)) * 0.5 * bassEnv;

                // Chords: Short stabs on every beat (quarter note comping)
                const chordEnv = Math.exp(-t * 15);
                let chordVal = 0;
                freqs.forEach((f) => (chordVal += tri(t, f)));
                chordVal = chordVal * 0.15 * chordEnv;

                output[beatStartSample + i] += bassVal + chordVal;
            }
            sampleIdx += beatLen;
        }
    });
});

const wavBuffer = encodeWAV(output);
const outPath = path.resolve(`tests/resources/synthetic_${presetName}.wav`);
fs.writeFileSync(outPath, Buffer.from(wavBuffer));
console.log(`Saved to ${outPath}`);
