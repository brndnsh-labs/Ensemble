import fs from 'node:fs';
import { Window } from 'happy-dom';
import { parseMusicXML } from '../public/musicxml-parser.js';

const window = new Window();
global.DOMParser = window.DOMParser;

const filePath = process.argv[2] || '../../Downloads/parker-charlie-donna_lee.musicxml';

if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
}

const xmlString = fs.readFileSync(filePath, 'utf-8');
const parsed = parseMusicXML(xmlString);

if (!parsed.leadSheetMelody || parsed.leadSheetMelody.length === 0) {
    console.error('No melody found in MusicXML');
    process.exit(1);
}

const melody = parsed.leadSheetMelody.sort((a, b) => a.globalStep - b.globalStep);

// Filter out duplicates (often caused by Staff 1 + TAB Staff 2 being identical in some MusicXMLs)
const uniqueMelody = [];
const seen = new Set();
melody.forEach((n) => {
    const key = `${n.globalStep}-${n.midi}`;
    if (!seen.has(key)) {
        uniqueMelody.push(n);
        seen.add(key);
    }
});
const finalMelody = uniqueMelody;

// 1. Pitch Distribution
const pitchCounts = {};
finalMelody.forEach((n) => {
    pitchCounts[n.midi] = (pitchCounts[n.midi] || 0) + 1;
});

// 2. Interval Distribution
const intervals = [];
for (let i = 1; i < finalMelody.length; i++) {
    const diff = finalMelody[i].midi - finalMelody[i - 1].midi;
    // Check if it's a new phrase (large rest)
    const rest =
        finalMelody[i].globalStep -
        (finalMelody[i - 1].globalStep + (finalMelody[i - 1].durationSteps || 4));
    if (rest < 8) {
        // Only count intervals within phrases (less than 2 beats rest)
        intervals.push(diff);
    }
}

const intervalCounts = {};
intervals.forEach((inv) => {
    const abs = Math.abs(inv);
    intervalCounts[abs] = (intervalCounts[abs] || 0) + 1;
});

// 3. Duration Distribution
const durationCounts = {};
finalMelody.forEach((n) => {
    const dur = n.durationSteps || 4;
    durationCounts[dur] = (durationCounts[dur] || 0) + 1;
});

// 4. Phrasing Metrics
const lastNote = finalMelody[finalMelody.length - 1];
const totalSteps = lastNote.globalStep + (lastNote.durationSteps || 4);
const measures = Math.ceil(totalSteps / 16);
const notesPerMeasure = finalMelody.length / measures;

const phrases = [];
let currentPhrase = [finalMelody[0]];
for (let i = 1; i < finalMelody.length; i++) {
    const note = finalMelody[i];
    const prev = finalMelody[i - 1];
    const rest = note.globalStep - (prev.globalStep + (prev.durationSteps || 4));

    if (rest >= 8) {
        // 2 beats or more rest starts a new phrase
        phrases.push(currentPhrase);
        currentPhrase = [note];
    } else {
        currentPhrase.push(note);
    }
}
phrases.push(currentPhrase);

const avgNotesPerPhrase = finalMelody.length / phrases.length;
const nonZeroIntervals = intervals.filter((inv) => inv !== 0);

let pickupStarts = 0;
phrases.forEach((p) => {
    const startStep = p[0].globalStep % 16;
    if (startStep >= 12 || startStep === 0) {
        // On beat 1 or pickup beat 4
        if (startStep >= 12) {
            pickupStarts++;
        }
    }
});

// 5. Stepwise vs Leaps
const stepwise = intervals.filter((inv) => Math.abs(inv) >= 1 && Math.abs(inv) <= 2).length;
const leaps = intervals.filter((inv) => Math.abs(inv) > 2).length;

console.log(`\n=== ANALYSIS FOR ${filePath.split('/').pop()} ===`);
console.log(`Total Notes: ${finalMelody.length}`);
console.log(`Measures: ${measures}`);
console.log(`Avg Notes/Measure: ${notesPerMeasure.toFixed(2)}`);
console.log(`Avg Notes/Phrase: ${avgNotesPerPhrase.toFixed(2)}`);
console.log(
    `Stepwise Motion (1-2 semitones): ${((stepwise / nonZeroIntervals.length) * 100).toFixed(1)}% of non-zero intervals`,
);
console.log(
    `Leaps (> 2 semitones): ${((leaps / nonZeroIntervals.length) * 100).toFixed(1)}% of non-zero intervals`,
);
console.log(
    `Repeated Notes (0 semitones): ${(((intervals.length - nonZeroIntervals.length) / intervals.length) * 100).toFixed(1)}% of all intervals`,
);
console.log(`Pickup Phrase Starts: ${((pickupStarts / phrases.length) * 100).toFixed(1)}%`);

console.log('\n--- Duration Distribution (Steps) ---');
Object.entries(durationCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([dur, count]) => {
        const pct = ((count / finalMelody.length) * 100).toFixed(1);
        console.log(`${dur.padEnd(4)}: ${count.toString().padEnd(5)} (${pct}%)`);
    });

console.log('\n--- Interval Distribution (Semitones) ---');
Object.entries(intervalCounts)
    .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
    .forEach(([inv, count]) => {
        const pct = ((count / intervals.length) * 100).toFixed(1);
        console.log(`${inv.padEnd(4)}: ${count.toString().padEnd(5)} (${pct}%)`);
    });
