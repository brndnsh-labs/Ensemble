import fs from 'node:fs';

const xmlString = fs.readFileSync(
    '/home/brandon/Downloads/dorham-kenny-blue_bossa_4.musicxml',
    'utf-8',
);

const parts = xmlString.split('<part id="');
parts.shift();

const part = parts[0]; // P1: Soloist
const partId = part.substring(0, part.indexOf('"'));
console.log(`\n--- PART ${partId} (Soloist) ---`);

const measures = part.split('<measure ');
console.log(`Total measures: ${measures.length - 1}`);

const notes = part.split('<note');
let totalNotes = 0;
let _rests = 0;
let chords = 0;
let ties = 0;

for (let i = 1; i < notes.length; i++) {
    const noteXml = notes[i].substring(0, notes[i].indexOf('</note>'));
    if (noteXml.includes('<rest/>') || noteXml.includes('<rest ')) {
        _rests++;
        continue;
    }
    totalNotes++;
    if (noteXml.includes('<chord/>')) {
        chords++;
    }
    if (noteXml.includes('<tie type="start"/>') || noteXml.includes('<tied type="start"/>')) {
        ties++;
    }
}

console.log(`Total Notes (Hits): ${totalNotes}`);
if (measures.length > 1) {
    console.log(`Avg Notes/Measure: ${(totalNotes / (measures.length - 1)).toFixed(2)}`);
}
console.log(`Ties/Syncopation: ${ties} (${((ties / totalNotes) * 100).toFixed(1)}% of notes)`);
if (totalNotes > 0) {
    console.log(`Chords/Double Stops: ${chords} (${((chords / totalNotes) * 100).toFixed(1)}%)`);
}
