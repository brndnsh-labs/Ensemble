import { bench, describe, it } from 'vitest';
import { extractForm } from '../../public/form-extractor.js';

function generateLargeBeatData(numMeasures) {
    const chords = ['C', 'G', 'Am', 'F', 'Dm', 'E7', 'Bb', 'Eb'];
    const beatData = [];
    for (let m = 0; m < numMeasures; m++) {
        const chord = chords[m % chords.length];
        for (let b = 0; b < 4; b++) {
            beatData.push({
                beat: m * 4 + b,
                chord: chord,
                energy: Math.random(),
            });
        }
    }
    return beatData;
}

describe('form-extractor performance', () => {
    const data = generateLargeBeatData(1000); // 1000 measures

    bench('extractForm with 1000 measures', () => {
        extractForm(data, 4);
    });
});
