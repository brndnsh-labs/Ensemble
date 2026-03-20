import { TIME_SIGNATURES } from './public/config.js';
import { generateSessionSeed } from './public/engine/soloist-seeder.js';

// Mock state
const state = {};

// Mock arranger for Autumn Leaves
// 32 measures, 4/4 time -> 32 * 16 = 512 steps
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
            intervals: [0, 4, 7],
        },
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
        { id: 's4', start: 384, end: 512, label: 'C' }, // 8 measures
    ],
};

const result = generateSessionSeed(state, arranger, 'jazz', 0.5, 'TEST');
console.log(`Generated ${result.notes.length} notes`);
console.log(
    result.notes.map((n) => `Step: ${n.step}, Midi: ${n.midi}, Dur: ${n.durationSteps}`).join('\n'),
);
