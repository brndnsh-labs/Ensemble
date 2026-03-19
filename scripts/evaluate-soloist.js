/**
 * Soloist Narrative Diagnostic Script
 * Simulates a full 3-minute session and analyzes the "arc" of the solo.
 */

import { TIME_SIGNATURES } from '../public/config.js';
import { getSoloistNote } from '../public/engine/soloist.js';
import { dispatch, getState } from '../public/state.js';
import { ACTIONS } from '../public/types.js';
import { getStepInfo } from '../public/utils.js';

function analyzeNarrative(genre = 'Rock', bpm = 102, minutes = 3, intensity = 0.5) {
    const totalBeats = bpm * minutes;
    const measures = Math.ceil(totalBeats / 4);

    console.log(`\n=== Soloist Narrative Analysis: ${genre} @ ${bpm} BPM ===`);
    console.log(`Duration: ${minutes}m (~${measures} measures)\n`);

    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: genre, enabled: true });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart' });
    dispatch(ACTIONS.UPDATE_PLAYBACK, { bandIntensity: intensity, bpm: bpm });

    const { arranger, soloist } = getState();
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;

    // Mock arrangement (Simple loop)
    arranger.totalSteps = 64; // 4-bar loop
    const chord = { rootMidi: 60, scale: [0, 2, 4, 5, 7, 9, 11], intervals: [0, 4, 7] };

    const stats = {
        totalNotes: 0,
        pickupNotes: 0,
        influenceShifts: 0,
        entropyMutations: 0,
        syncopationPoints: 0,
        profileTimeline: [],
        entropyTimeline: [],
        densityPerBar: [],
    };

    let currentBarNotes = 0;
    let lastProfile = null;
    let lastEntropy = null;

    // Simulate Count-in + Full Duration
    const totalSteps = measures * stepsPerMeasure;
    for (let s = -stepsPerMeasure; s < totalSteps; s++) {
        const stepInfo = getStepInfo(s, ts, null, TIME_SIGNATURES);
        const res = getSoloistNote(
            chord,
            chord,
            s,
            440,
            0,
            'smart',
            0,
            false,
            { sectionStart: 0, sectionEnd: 64, bypassRhythm: false },
            stepInfo,
        );

        // Track Statistics
        if (res) {
            stats.totalNotes++;
            currentBarNotes++;
            if (s < 0) {
                stats.pickupNotes++;
            }

            const stepInBeat =
                ((stepInfo.mStep % ts.stepsPerBeat) + ts.stepsPerBeat) % ts.stepsPerBeat;
            if (stepInBeat % 2 !== 0) {
                stats.syncopationPoints++;
            }
        }

        if (soloist.phraseContext.profile !== lastProfile) {
            stats.influenceShifts++;
            stats.profileTimeline.push({ step: s, profile: soloist.phraseContext.profile });
            lastProfile = soloist.phraseContext.profile;
        }

        if (soloist.rhythmicEntropy !== lastEntropy) {
            stats.entropyMutations++;
            stats.entropyTimeline.push({ step: s, entropy: soloist.rhythmicEntropy.toFixed(2) });
            lastEntropy = soloist.rhythmicEntropy;
        }

        if (stepInfo.isMeasureStart && s >= 0) {
            stats.densityPerBar.push(currentBarNotes);
            currentBarNotes = 0;
        }
    }

    // --- Output Summary ---
    console.log(`--- High-Level Summary ---`);
    console.log(`Total Notes: ${stats.totalNotes}`);
    console.log(`Avg Density: ${(stats.totalNotes / measures).toFixed(1)} notes/bar`);
    console.log(
        `Syncopation Ratio: ${((stats.syncopationPoints / stats.totalNotes) * 100).toFixed(1)}%`,
    );
    console.log(`Pick-up Notes (Count-in): ${stats.pickupNotes}`);
    console.log(`Influence Shifts (Section Starts): ${stats.influenceShifts}`);
    console.log(`Entropy Mutations: ${stats.entropyMutations}`);

    console.log(`\n--- Influence Narrative (Timeline) ---`);
    stats.profileTimeline.forEach((entry) => {
        console.log(`Step ${String(entry.step).padStart(4)}: Channeling ${entry.profile}`);
    });

    console.log(`\n--- Rhythmic Entropy Narrative (Timeline) ---`);
    // Sample every few mutations to keep it readable
    stats.entropyTimeline
        .filter((_, i) => i % 4 === 0)
        .forEach((entry) => {
            console.log(
                `Step ${String(entry.step).padStart(4)}: Entropy Shifted to ${entry.entropy}`,
            );
        });

    console.log(`\n--- Density Map (per measure) ---`);
    const barChunks = [];
    for (let i = 0; i < stats.densityPerBar.length; i += 8) {
        barChunks.push(stats.densityPerBar.slice(i, i + 8).join(' | '));
    }
    barChunks.forEach((chunk) => console.log(`[ ${chunk} ]`));
}

analyzeNarrative('Rock', 102, 3, 0.5);
