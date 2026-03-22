import { describe, expect, it } from 'vitest';
import { extractForm } from '../../utils/form-extractor.js';

describe('Form Extractor: Consensus Healing', () => {
    it('should heal a mis-detected chord in a repeating section', () => {
        // Mock beat data for 3 identical 4-bar sections (12 bars total)
        // Verse 1: C F G C
        // Verse 2: C F Gb C (Gb is a mis-detection of G)
        // Verse 3: C F G C

        const pattern1 = ['C', 'F', 'G', 'C'];
        const pattern2 = ['C', 'F', 'Gb', 'C']; // The "noisy" one
        const beatsPerMeasure = 4;

        const beatData = [];
        const addPattern = (p, startBeat) => {
            p.forEach((chord, m) => {
                for (let b = 0; b < beatsPerMeasure; b++) {
                    beatData.push({
                        beat: startBeat + m * beatsPerMeasure + b,
                        chord,
                        energy: 0.5,
                    });
                }
            });
        };

        addPattern(pattern1, 0); // Verse 1
        addPattern(pattern2, 16); // Verse 2 (Noisy)
        addPattern(pattern1, 32); // Verse 3

        const sections = extractForm(beatData, beatsPerMeasure);

        // Meta-consolidation will merge them into (Section A) x 3
        expect(sections.length).toBe(1);
        expect(sections[0].value).toBe('C | F | G | C'); // Gb should be healed to G
        expect(sections[0].repeat).toBe(3);
    });
});
