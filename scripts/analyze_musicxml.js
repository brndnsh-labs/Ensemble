import fs from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';
import { parseMusicXML } from '../public/musicxml-parser.js';

const window = new Window();
global.DOMParser = window.DOMParser;

const BASE_URL = 'https://effendi.me/jazz/repo/';

// List of some known files or directories from the index
const TARGET_FILES = [
    'I/AllBlues%201.xml',
    'I/Night%20And%20DAy.xml',
    'I/Ornithology.xml',
    'I/Cantaloupe%20Island.xml',
    'I/Watermelon%20Man.xml',
];

function analyzeMelody(melody, totalSteps, timeSignature = '4/4') {
    if (!melody || melody.length === 0) {
        return null;
    }

    const is68 = timeSignature === '6/8';
    const is34 = timeSignature === '3/4';
    const is54 = timeSignature === '5/4';

    let stepsPerBeat = 4;
    let beatsPerMeasure = 4;

    if (is68) {
        stepsPerBeat = 6;
        beatsPerMeasure = 2;
    } else if (is34) {
        beatsPerMeasure = 3;
    } else if (is54) {
        beatsPerMeasure = 5;
    }

    const stepsPerMeasure = stepsPerBeat * beatsPerMeasure;

    const phrases = [];
    let currentPhrase = [];

    const sorted = [...melody].sort((a, b) => a.globalStep - b.globalStep);

    for (let i = 0; i < sorted.length; i++) {
        const note = sorted[i];
        if (currentPhrase.length === 0) {
            currentPhrase.push(note);
        } else {
            const lastNote = currentPhrase[currentPhrase.length - 1];
            const restDuration =
                note.globalStep - (lastNote.globalStep + (lastNote.durationSteps || 4));

            if (restDuration >= stepsPerMeasure * 0.75) {
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

    const phraseLengths = phrases.map((p) => p.length);
    const avgNotesPerPhrase = phraseLengths.reduce((a, b) => a + b, 0) / phrases.length;

    let pickupStarts = 0;
    let downbeatStarts = 0;

    phrases.forEach((p) => {
        const startStep = p[0].globalStep;
        const measureStep = ((startStep % stepsPerMeasure) + stepsPerMeasure) % stepsPerMeasure;

        if (startStep < 0 || measureStep >= stepsPerMeasure - stepsPerBeat) {
            pickupStarts++;
        }

        if (measureStep === 0) {
            downbeatStarts++;
        }
    });

    const totalPhrases = phrases.length || 1;
    const measures = Math.max(1, Math.ceil(totalSteps / stepsPerMeasure));
    const density = melody.length / measures;

    return {
        phrases: phrases.length,
        avgNotesPerPhrase: avgNotesPerPhrase.toFixed(2),
        densityNotesPerMeasure: density.toFixed(2),
        pickupStartPct: `${((pickupStarts / totalPhrases) * 100).toFixed(1)}%`,
        downbeatStartPct: `${((downbeatStarts / totalPhrases) * 100).toFixed(1)}%`,
    };
}

async function fetchAndAnalyze() {
    console.log('=== REMOTE MUSICXML PHRASING ANALYSIS ===');
    console.log(`Fetching from: ${BASE_URL}\n`);

    const aggregatedStats = {
        totalSongs: 0,
        totalPhrases: 0,
        avgDensity: 0,
        avgNotesPerPhrase: 0,
        pickups: 0,
        downbeats: 0,
    };

    for (const fileUrl of TARGET_FILES) {
        try {
            const url = `${BASE_URL}${fileUrl}`;
            const response = await fetch(url);
            if (!response.ok) {
                console.log(`[SKIP] Could not fetch ${fileUrl}`);
                continue;
            }
            const xmlText = await response.text();

            const parsed = parseMusicXML(xmlText);
            if (!parsed.leadSheetMelody || parsed.leadSheetMelody.length === 0) {
                console.log(`[SKIP] No melody extracted from ${fileUrl}`);
                continue;
            }

            // Try to guess TS from name for simplicity if not parsed
            let ts = '4/4';
            if (fileUrl.includes('All%20Blues')) {
                ts = '6/8';
            }
            if (fileUrl.includes('Take%20Five')) {
                ts = '5/4';
            }

            const totalSteps = parsed.leadSheetMelody.reduce(
                (max, n) => Math.max(max, n.globalStep + (n.durationSteps || 4)),
                0,
            );
            const stats = analyzeMelody(parsed.leadSheetMelody, totalSteps, ts);

            console.log(`[${decodeURIComponent(fileUrl).split('/').pop()}] (${ts})`);
            console.log(stats);
            console.log('---');

            aggregatedStats.totalSongs++;
            aggregatedStats.totalPhrases += stats.phrases;
            aggregatedStats.avgDensity += parseFloat(stats.densityNotesPerMeasure);
            aggregatedStats.avgNotesPerPhrase += parseFloat(stats.avgNotesPerPhrase);
            aggregatedStats.pickups += parseFloat(stats.pickupStartPct);
            aggregatedStats.downbeats += parseFloat(stats.downbeatStartPct);
        } catch (e) {
            console.error(`Error processing ${fileUrl}: ${e.message}`);
        }
    }

    if (aggregatedStats.totalSongs > 0) {
        console.log('\n=== AGGREGATED HUMAN TENDENCIES ===');
        console.log(`Total Songs Analyzed: ${aggregatedStats.totalSongs}`);
        console.log(
            `Avg Notes/Measure: ${(aggregatedStats.avgDensity / aggregatedStats.totalSongs).toFixed(2)}`,
        );
        console.log(
            `Avg Notes/Phrase: ${(aggregatedStats.avgNotesPerPhrase / aggregatedStats.totalSongs).toFixed(2)}`,
        );
        console.log(
            `Avg Pickup Probability: ${(aggregatedStats.pickups / aggregatedStats.totalSongs).toFixed(1)}%`,
        );
        console.log(
            `Avg Downbeat Probability: ${(aggregatedStats.downbeats / aggregatedStats.totalSongs).toFixed(1)}%`,
        );
    }
}

fetchAndAnalyze();
