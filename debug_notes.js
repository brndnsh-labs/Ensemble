import { generateSessionSeed } from './public/engine/soloist-seeder.js';

const arranger = {
    totalSteps: 64,
    timeSignature: '4/4',
    sectionMap: [{ id: 's1', start: 0, end: 64, label: 'A' }],
    stepMap: Array(64)
        .fill(null)
        .map((_, i) => ({
            start: i,
            end: i + 1,
            chord: { rootMidi: 60, quality: 'major', value: 'C', beats: 4, intervals: [0, 4, 7] },
        })),
};

const result = generateSessionSeed({}, arranger, 'jazz', 0.5, 'TEST');
console.log(result.notes.map((n) => `Step: ${n.step}`).join(', '));
