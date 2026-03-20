import { generateSessionSeed } from './public/engine/soloist-seeder.js';

// Mock state
const state = {};

// Mock arranger for Autumn Leaves
const stepsPerMeasure = 16;
const totalSteps = 512;
const stepMap = [];
for (let i = 0; i < totalSteps; i++) {
    stepMap.push({
        start: i,
        end: i + 1,
        chord: {
            rootMidi: 60 + (Math.floor(i / stepsPerMeasure) % 12),
            quality: 'major',
            value: 'C',
            beats: 4,
            intervals: [0, 4, 7]
        }
    });
}

const arranger = {
    stepMap,
    totalSteps,
    timeSignature: '4/4',
    sectionMap: [
        { id: 's1', start: 0, end: 128, label: 'A' }, // 8 measures
        { id: 's2', start: 128, end: 256, label: 'A' }, // 8 measures
        { id: 's3', start: 256, end: 384, label: 'B' }, // 8 measures
        { id: 's4', start: 384, end: 512, label: 'C' }  // 8 measures
    ]
};

const result = generateSessionSeed(state, arranger, 'jazz', 0.5, 'TEST');
let prevStep = 0;
for (const note of result.notes) {
    const gap = note.step - prevStep;
    console.log(`Step: ${note.step} (Gap: ${gap}), Midi: ${note.midi}, Dur: ${note.durationSteps}`);
    prevStep = note.step + note.durationSteps;
}
