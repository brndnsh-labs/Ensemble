/**
 * @vitest-environment happy-dom
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { parseMusicXML } from '../../public/musicxml-parser.js';
import { getState } from '../../public/state.js';

const fixturesDir = path.join(__dirname, '../unit/fixtures/musicxml');

function analyzeMelody(melody, totalSteps, timeSignature = '4/4') {
    if (!melody || melody.length === 0) {
        return null;
    }

    // Time signature config (assuming 16 steps per measure for 4/4, 24 for 6/8)
    const is68 = timeSignature === '6/8';
    const stepsPerBeat = is68 ? 6 : 4;
    const beatsPerMeasure = is68 ? 2 : 4;
    const stepsPerMeasure = stepsPerBeat * beatsPerMeasure;

    const phrases = [];
    let currentPhrase = [];

    // Sort chronologically just in case
    const sorted = [...melody].sort((a, b) => a.globalStep - b.globalStep);

    for (let i = 0; i < sorted.length; i++) {
        const note = sorted[i];
        if (currentPhrase.length === 0) {
            currentPhrase.push(note);
        } else {
            const lastNote = currentPhrase[currentPhrase.length - 1];
            // Define a rest threshold for a new phrase (e.g. 1 measure of rest)
            const restDuration =
                note.globalStep - (lastNote.globalStep + (lastNote.durationSteps || 4));

            if (restDuration >= stepsPerMeasure * 0.75) {
                // New phrase
                phrases.push([...currentPhrase]);
                currentPhrase = [note];
            } else {
                currentPhrase.push(note);
            }
        }
    }
    if (currentPhrase.length > 0) {
        phrases.push(currentPhrase);
    }

    // Phrase Metrics
    const phraseLengths = phrases.map((p) => p.length);
    const avgNotesPerPhrase = phraseLengths.reduce((a, b) => a + b, 0) / phrases.length;

    // Rests between phrases
    const rests = [];
    for (let i = 1; i < phrases.length; i++) {
        const prevPhraseEnd =
            phrases[i - 1][phrases[i - 1].length - 1].globalStep +
            (phrases[i - 1][phrases[i - 1].length - 1].durationSteps || 4);
        const nextPhraseStart = phrases[i][0].globalStep;
        rests.push(nextPhraseStart - prevPhraseEnd);
    }
    const avgRestSteps = rests.length > 0 ? rests.reduce((a, b) => a + b, 0) / rests.length : 0;

    // Pickups and Starts
    let offbeatStarts = 0;
    let pickupStarts = 0;
    let downbeatStarts = 0;

    phrases.forEach((p) => {
        const startStep = p[0].globalStep;
        const measureStep = ((startStep % stepsPerMeasure) + stepsPerMeasure) % stepsPerMeasure;

        // Define pickup as any phrase starting on the last beat of a measure, or negative global step
        if (startStep < 0 || measureStep >= stepsPerMeasure - stepsPerBeat) {
            pickupStarts++;
        }

        if (measureStep === 0) {
            downbeatStarts++;
        } else if (measureStep % (stepsPerBeat / 2) !== 0) {
            // Offbeat means not on a main downbeat or even upbeat division
            offbeatStarts++;
        } else if (measureStep % stepsPerBeat !== 0) {
            // On the 'and' of a beat
            offbeatStarts++;
        }
    });

    const totalPhrases = phrases.length || 1;

    // Rhythmic Density
    const measures = Math.max(1, Math.ceil(totalSteps / stepsPerMeasure));
    const density = melody.length / measures;

    return {
        phrases: phrases.length,
        avgNotesPerPhrase: avgNotesPerPhrase.toFixed(2),
        avgRestMeasures: (avgRestSteps / stepsPerMeasure).toFixed(2),
        densityNotesPerMeasure: density.toFixed(2),
        pickupStartPct: `${((pickupStarts / totalPhrases) * 100).toFixed(1)}%`,
        downbeatStartPct: `${((downbeatStarts / totalPhrases) * 100).toFixed(1)}%`,
        offbeatStartPct: `${((offbeatStarts / totalPhrases) * 100).toFixed(1)}%`,
    };
}

const files = [
    { name: 'AllBlues.xml', ts: '6/8' },
    { name: 'Night And DAy.xml', ts: '4/4' },
    { name: 'Ornithology.xml', ts: '4/4' },
];

// We need to mock the dispatch and getState from state.js
let { mockState } = vi.hoisted(() => ({ mockState: {} }));
vi.mock('../../public/state.js', () => ({
    stateMap: mockState,
    getState: () => mockState,
    dispatch: () => {},
}));

function simulateEngine(totalSteps, timeSignature = '4/4', style = 'bird') {
    const is68 = timeSignature === '6/8';
    const stepsPerBeat = is68 ? 6 : 4;
    const beatsPerMeasure = is68 ? 2 : 4;

    mockState = {
        playback: { bandIntensity: 0.6, bpm: 140, complexity: 0.6, intent: {}, lyricalBias: 0.5 },
        groove: { pocket: 0, genreFeel: 'Jazz' },
        harmony: { enabled: false },
        chords: { style: 'smart' },
        arranger: { key: 'C', timeSignature, totalSteps },
        soloist: {
            style,
            enabled: true,
            pitchHistory: [],
            notesInPhrase: 0,
            busySteps: 0,
            sessionSteps: 0,
            motifBuffer: [],
            isResting: true, // Start resting
        },
    };

    const engineMelody = [];
    const chord = { rootMidi: 60, scale: [0, 2, 4, 5, 7, 9, 11], intervals: [0, 4, 7] }; // Dummy chord

    for (let step = 0; step < totalSteps; step++) {
        const stepInMeasure = step % (stepsPerBeat * beatsPerMeasure);
        const note = getSoloistNote(getState(), chord, chord, step, null, 64, style, stepInMeasure);

        if (note && Array.isArray(note)) {
            engineMelody.push({
                midi: note[0].midi,
                globalStep: step,
                durationSteps: note[0].durationSteps || 4,
            });
        } else if (note) {
            engineMelody.push({
                midi: note.midi,
                globalStep: step,
                durationSteps: note.durationSteps || 4,
            });
        }
    }
    return engineMelody;
}

describe('Phrasing Analysis', () => {
    it('should compare MusicXML human phrasing vs Engine phrasing', () => {
        console.log('=== MUSICXML COMPOSITIONAL ANALYSIS ===');
        for (const file of files) {
            const xml = fs.readFileSync(path.join(fixturesDir, file.name), 'utf-8');
            const parsed = parseMusicXML(xml);
            const totalSteps = parsed.leadSheetMelody.reduce(
                (max, n) => Math.max(max, n.globalStep + (n.durationSteps || 4)),
                0,
            );

            const stats = analyzeMelody(parsed.leadSheetMelody, totalSteps, file.ts);
            console.log(`\n[${file.name} - HUMAN] - ${file.ts}`);
            console.log(stats);
        }

        console.log('\n=== ENGINE SIMULATION BASELINE ===');
        for (const file of files) {
            const xml = fs.readFileSync(path.join(fixturesDir, file.name), 'utf-8');
            const parsed = parseMusicXML(xml);
            const totalSteps = parsed.leadSheetMelody.reduce(
                (max, n) => Math.max(max, n.globalStep + (n.durationSteps || 4)),
                0,
            );

            // Choose style based on song (Bird for fast swing, Blues for All Blues)
            const style = file.name === 'AllBlues.xml' ? 'blues' : 'bird';

            const engineMelody = simulateEngine(totalSteps, file.ts, style);
            const stats = analyzeMelody(engineMelody, totalSteps, file.ts);

            console.log(`\n[${file.name} - ${style.toUpperCase()} ENGINE]`);
            console.log(stats);
        }
    });
});
