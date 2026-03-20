import { getSoloistNote } from './public/engine/soloist.js';
import { generateSessionSeed } from './public/engine/soloist-seeder.js';

// Setup Mock State for Rock, 100bpm, Autumn Leaves (32 bars)
const mockState = {
    playback: { bandIntensity: 0.5, currentLoopCount: 0, bpm: 100 },
    groove: { genreFeel: 'rock', pocket: 0 },
    soloist: { mode: 'guitar', isResting: true, busySteps: 0, phraseContext: { profile: 'srv' } },
    arranger: { timeSignature: '4/4', totalSteps: 32 * 16 },
};

const mockArranger = {
    timeSignature: '4/4',
    totalSteps: 32 * 16,
    stepMap: [],
    sectionMap: [
        { label: 'A', start: 0, end: 8 * 16 },
        { label: 'B', start: 8 * 16, end: 16 * 16 },
        { label: 'A', start: 16 * 16, end: 24 * 16 },
        { label: 'C', start: 24 * 16, end: 32 * 16 },
    ],
};

const mockChord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
for (let i = 0; i < mockArranger.totalSteps; i++) {
    mockArranger.stepMap.push({ step: i, end: i + 1, chord: mockChord });
}

mockState.soloist.sessionSeed = generateSessionSeed(mockState, mockArranger, 'rock', 0.5, 'TEST');

console.log(`Total seed notes generated: ${mockState.soloist.sessionSeed.notes.length}`);

// We will simulate 3 loops of the song (3 * 512 steps)
// Loop 0 = Head
// Loop 1 = Improv
// Loop 2 = Improv
for (let loop = 0; loop < 3; loop++) {
    mockState.playback.currentLoopCount = loop;
    console.log(`\n--- STARTING LOOP ${loop} ---`);
    let notesPlayedThisLoop = 0;

    for (let loopStep = 0; loopStep < 512; loopStep++) {
        // Global step increases continuously
        const globalStep = loop * 512 + loopStep;
        const stepInfo = {
            mStep: globalStep % 16,
            isBeatStart: globalStep % 4 === 0,
            isMeasureStart: globalStep % 16 === 0,
            isBackbeat: false,
        };

        // Find which section we are in
        const section = mockArranger.sectionMap.find(
            (s) => loopStep >= s.start && loopStep < s.end,
        );
        const coordination = { sectionStart: section.start, sectionEnd: section.end };

        const res = getSoloistNote(
            mockState,
            mockChord,
            mockChord,
            globalStep,
            null,
            4,
            'rock',
            globalStep % 16,
            coordination,
            stepInfo,
        );

        if (res) {
            notesPlayedThisLoop++;
            // Just log the first 5 notes of each loop to prevent terminal spam
            if (notesPlayedThisLoop <= 5) {
                console.log(
                    `[Loop ${loop}] Step ${globalStep} (LoopStep ${loopStep}): Played MIDI ${res.midi}, duration ${res.durationSteps}`,
                );
            } else if (notesPlayedThisLoop === 6) {
                console.log(`[Loop ${loop}] ... (logging silenced)`);
            }
        } else if (mockState.soloist.busySteps > 0) {
            // we are busy holding a note, do nothing
        } else {
            // we are resting
        }
    }

    console.log(`Total notes played in loop ${loop}: ${notesPlayedThisLoop}`);
}
