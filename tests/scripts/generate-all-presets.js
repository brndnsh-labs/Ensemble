import fs from 'node:fs';
import path from 'node:path';
import { ChordAnalyzerLite } from '../../public/audio-analyzer-lite.js';
import { KEY_ORDER, ROMAN_VALS } from '../../public/config.js';
import { CHORD_PRESETS, SONG_TEMPLATES } from '../../public/presets.js';

const SAMPLE_RATE = 44100;
const OUTPUT_DIR = 'tests/resources/synthetic_presets';

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// --- Synthesis & Helpers ---

const NOTE_MAP = {};
KEY_ORDER.forEach((k, i) => (NOTE_MAP[k] = i));
// Add enharmonics
NOTE_MAP['C#'] = 1;
NOTE_MAP.Db = 1;
NOTE_MAP['D#'] = 3;
NOTE_MAP.Eb = 3;
NOTE_MAP['F#'] = 6;
NOTE_MAP.Gb = 6;
NOTE_MAP['G#'] = 8;
NOTE_MAP.Ab = 8;
NOTE_MAP['A#'] = 10;
NOTE_MAP.Bb = 10;

const CHORD_INTERVALS = {
    maj7: [0, 4, 7, 11],
    7: [0, 4, 7, 10],
    m7: [0, 3, 7, 10],
    6: [0, 4, 7, 9],
    m6: [0, 3, 7, 9],
    maj: [0, 4, 7],
    m: [0, 3, 7],
    min: [0, 3, 7],
    sus4: [0, 5, 7],
    dim: [0, 3, 6],
    dim7: [0, 3, 6, 9],
    aug: [0, 4, 8],
    9: [0, 4, 7, 10, 14],
    11: [0, 4, 7, 10, 14, 17],
    13: [0, 4, 7, 10, 14, 21],
};

const m2f = (m) => 440 * 2 ** ((m - 69) / 12);
const saw = (t, freq) => 2 * ((t * freq) % 1) - 1;
const sine = (t, freq) => Math.sin(2 * Math.PI * t * freq);
const tri = (t, freq) => Math.abs(saw(t, freq) * 2) - 1;

function resolveRoman(roman, keyRootMidi = 60) {
    // Regex for Roman Numeral: bVII7, #IVm7, iim9
    const match = roman.match(/^([b#])?([ivIV]+)(.*)$/);
    if (!match) {
        return null;
    }

    const acc = match[1] || '';
    const numeral = match[2];
    const suffix = match[3] || '';

    let offset = ROMAN_VALS[numeral.toUpperCase()];
    if (offset === undefined) {
        return null;
    }

    if (acc === 'b') {
        offset -= 1;
    }
    if (acc === '#') {
        offset += 1;
    }

    // Quality inference from case
    const isLower = numeral === numeral.toLowerCase();
    let quality = 'maj';
    if (isLower) {
        quality = 'm';
    }

    // Explicit suffix overrides
    if (suffix.includes('7')) {
        quality = isLower ? 'm7' : '7';
    }
    if (suffix.includes('maj7')) {
        quality = 'maj7';
    }
    if (suffix.includes('dim')) {
        quality = 'dim';
    }

    // Construct concrete name for reference?
    // We just return freq info.
    const rootMidi = keyRootMidi + offset;
    return { rootMidi, quality, suffix };
}

function parseConcrete(chordName) {
    const match = chordName.match(/^([A-G][b#]?)(.*)$/);
    if (!match) {
        return null;
    }
    const rootStr = match[1];
    const suffix = match[2] || 'maj';
    const rootMidi = NOTE_MAP[rootStr] + 60; // C4 base

    let quality = 'maj';
    if (suffix === 'm' || suffix === 'min' || suffix === '-') {
        quality = 'm';
    } else if (suffix) {
        quality = suffix;
    }

    return { rootMidi, quality, suffix };
}

function getChordNotes(rootMidi, quality) {
    // Normalize quality keys
    let q = quality;
    if (q === '') {
        q = 'maj';
    }
    if (q === 'm' || q === 'min') {
        q = 'm';
    }

    // Partial matching for complex suffixes
    let intervals = CHORD_INTERVALS[q];
    if (!intervals) {
        if (q.includes('maj7')) {
            intervals = CHORD_INTERVALS.maj7;
        } else if (q.includes('m7')) {
            intervals = CHORD_INTERVALS.m7;
        } else if (q.includes('m6')) {
            intervals = CHORD_INTERVALS.m6;
        } else if (q.includes('6')) {
            intervals = CHORD_INTERVALS['6'];
        } else if (q.includes('7')) {
            intervals = CHORD_INTERVALS['7'];
        } else if (q.includes('dim')) {
            intervals = CHORD_INTERVALS.dim;
        } else if (q.startsWith('m')) {
            intervals = CHORD_INTERVALS.m;
        } else {
            intervals = CHORD_INTERVALS.maj;
        }
    }

    const freqs = intervals.map((i) => m2f(rootMidi + i));
    const bassFreq = m2f(rootMidi - 24);
    return { freqs, bassFreq };
}

function generateWAV(progression, bpm, filename) {
    const BEAT_DUR = 60 / bpm;
    const MEASURE_DUR = BEAT_DUR * 4;
    const totalSamples = progression.length * MEASURE_DUR * SAMPLE_RATE;
    const output = new Float32Array(totalSamples);

    let sampleIdx = 0;

    progression.forEach((bar) => {
        const chordsInBar = bar.length;
        const beatLen = Math.floor((4 / chordsInBar) * BEAT_DUR * SAMPLE_RATE);

        bar.forEach((chordObj) => {
            const { freqs, bassFreq } = getChordNotes(chordObj.rootMidi, chordObj.quality);

            for (let i = 0; i < beatLen; i++) {
                const t = i / SAMPLE_RATE;
                const bassEnv = Math.exp(-t * 10);
                const bassVal = (saw(t, bassFreq) + sine(t, bassFreq / 2)) * 0.5 * bassEnv;

                const chordEnv = Math.exp(-t * 15);
                let chordVal = 0;
                freqs.forEach((f) => (chordVal += tri(t, f)));
                chordVal = chordVal * 0.15 * chordEnv;

                output[sampleIdx + i] += bassVal + chordVal;
            }
            sampleIdx += beatLen;
        });
    });

    const buffer = new ArrayBuffer(44 + output.length * 2);
    const view = new DataView(buffer);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + output.length * 2, true);
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
    view.setUint32(40, output.length * 2, true);
    for (let i = 0; i < output.length; i++) {
        const s = Math.max(-1, Math.min(1, output[i]));
        view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    fs.writeFileSync(filename, Buffer.from(buffer));

    // Return pseudo-buffer for analyzer
    return {
        sampleRate: SAMPLE_RATE,
        length: output.length,
        duration: output.length / SAMPLE_RATE,
        getChannelData: () => output,
    };
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// --- Main Runner ---

const ALL_PRESETS = [...CHORD_PRESETS, ...SONG_TEMPLATES];

async function run() {
    console.log(`Auditing ${ALL_PRESETS.length} presets...`);
    const results = [];

    const analyzer = new ChordAnalyzerLite();

    for (const preset of ALL_PRESETS) {
        const name = preset.name;
        // Default Key: C Major (Midi 60)
        const keyMidi = 60;

        // Parse Progression
        const fullProgression = [];
        const sections = preset.sections || [];

        sections.forEach((sec) => {
            const repeats = sec.repeat || 1;
            const value = sec.value;
            const measures = value
                .split('|')
                .map((m) => m.trim())
                .filter((m) => m);

            for (let r = 0; r < repeats; r++) {
                measures.forEach((m) => {
                    const measureChords = [];
                    const tokens = m.split(/\s+/).filter((t) => t);
                    tokens.forEach((token) => {
                        // Attempt Roman first, then Concrete
                        let parsed = resolveRoman(token, keyMidi);
                        if (!parsed) {
                            parsed = parseConcrete(token);
                        }

                        if (parsed) {
                            measureChords.push(parsed);
                        } else {
                            // Default C if parse fails
                            measureChords.push({ rootMidi: 60, quality: 'maj' });
                        }
                    });
                    fullProgression.push(measureChords);
                });
            }
        });

        // Generate Audio
        const bpm = preset.settings?.bpm ? preset.settings.bpm : 120;
        const filePath = path.join(OUTPUT_DIR, `${name.replace(/[^a-z0-9]/gi, '_')}.wav`);

        const audioBuffer = generateWAV(fullProgression, bpm, filePath);

        // Analyze
        try {
            const analysis = await analyzer.analyze(audioBuffer, { bpm });

            // Validate
            // Check if detected chords match roughly
            // Simple validation: % of chords that match expected Root
            // Note: We need to align detected beats to expected bars.
            // Simplified: Just count detected chords and see if they overlap with expected set.

            const detectedChords = analysis.chords.map((r) => r.chord).filter((c) => c !== 'Rest');
            const uniqueDetected = new Set(detectedChords.map((c) => c.replace(/6|7|maj7|m7/, ''))); // Simplify

            // Expected
            const expectedRoots = new Set();
            fullProgression.flat().forEach((c) => {
                const noteIndex = c.rootMidi % 12;
                expectedRoots.add(KEY_ORDER[noteIndex]);
            });

            // Score: Overlap
            let overlap = 0;
            uniqueDetected.forEach((d) => {
                const root = d.match(/^[A-G][#b]?/)[0];
                if (expectedRoots.has(root)) {
                    overlap++;
                }
            });
            const accuracy = (overlap / expectedRoots.size) * 100;

            console.log(
                `[${name}] BPM: ${bpm} -> Detected: ${analysis.bpm}. Accuracy: ${accuracy.toFixed(0)}%`,
            );
            results.push({ name, accuracy, bpm, detectedBpm: analysis.bpm });
        } catch (e) {
            console.error(`[${name}] Failed:`, e.message);
        }
    }

    // Summary
    const avgAcc = results.reduce((a, b) => a + b.accuracy, 0) / results.length;
    console.log(`\n--- FINAL REPORT ---`);
    console.log(`Average Accuracy: ${avgAcc.toFixed(1)}%`);
}

run();
